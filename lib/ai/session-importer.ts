/**
 * Session Importer
 *
 * Creates PlaySession + PlaySessionBooking records from imported CSV data.
 * Handles court matching/creation, player name matching, and deduplication.
 *
 * Optimized: uses raw SQL batch INSERTs (500 rows/batch) instead of
 * individual Prisma creates. ~18 queries for 8774 sessions vs ~8774.
 */

import { randomUUID } from 'crypto'

interface ImportedSession {
  date: string
  startTime: string
  endTime: string
  court: string
  format: string
  skillLevel: string
  registered: number
  capacity: number
  pricePerPlayer: number | null
  playerNames: string[]
}

// Map parser formats to DB enum values
const FORMAT_MAP: Record<string, string> = {
  OPEN_PLAY: 'OPEN_PLAY',
  CLINIC: 'CLINIC',
  DRILL: 'DRILL',
  LEAGUE_PLAY: 'LEAGUE_PLAY',
  SOCIAL: 'SOCIAL',
  ROUND_ROBIN: 'SOCIAL',
  PRIVATE: 'OPEN_PLAY',
}

const VALID_SKILL_LEVELS = new Set(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS'])

function normalizeFormat(raw: string): string {
  return FORMAT_MAP[raw] || 'OPEN_PLAY'
}

function normalizeSkillLevel(raw: string): string {
  return VALID_SKILL_LEVELS.has(raw) ? raw : 'ALL_LEVELS'
}

export interface ImportResult {
  sessionsCreated: number
  sessionsSkipped: number
  bookingsCreated: number
  courtsCreated: number
  playersMatched: number
  playersUnmatched: number
}

export async function importSessionsToDB(
  prisma: any,
  clubId: string,
  sessions: ImportedSession[],
  onProgress?: (current: number, total: number, message: string) => void,
): Promise<ImportResult> {
  const result: ImportResult = {
    sessionsCreated: 0,
    sessionsSkipped: 0,
    bookingsCreated: 0,
    courtsCreated: 0,
    playersMatched: 0,
    playersUnmatched: 0,
  }

  if (sessions.length === 0) return result

  // 1. Load or create courts
  const courtCache = new Map<string, string>() // courtName → courtId
  const existingCourts = await prisma.clubCourt.findMany({
    where: { clubId },
    select: { id: true, name: true },
  })
  existingCourts.forEach((c: any) => courtCache.set(c.name.toLowerCase().trim(), c.id))

  // Find unique court names from sessions
  const uniqueCourts = Array.from(new Set(sessions.map(s => s.court.trim()).filter(Boolean)))
  for (const courtName of uniqueCourts) {
    if (!courtCache.has(courtName.toLowerCase())) {
      const newCourt = await prisma.clubCourt.create({
        data: { clubId, name: courtName },
      })
      courtCache.set(courtName.toLowerCase(), newCourt.id)
      result.courtsCreated++
    }
  }

  // 2. Load or create users for player matching
  // First check existing followers
  const followers = await prisma.clubFollower.findMany({
    where: { clubId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  const nameToUser = new Map<string, string>()
  followers.forEach((f: any) => {
    if (f.user.name) {
      nameToUser.set(f.user.name.toLowerCase().trim(), f.user.id)
    }
  })

  // Collect all unique player names from CSV (filter garbage)
  const GARBAGE_NAMES = new Set(['confirmed', 'cancelled', 'canceled', 'no-show', 'noshow', 'pending',
    'beginner', 'intermediate', 'advanced', 'all levels', 'open play', 'clinic', 'drill', 'league', 'social'])
  const allPlayerNames = new Set<string>()
  for (const s of sessions) {
    for (const name of s.playerNames) {
      const trimmed = name.trim()
      if (!trimmed || trimmed.length < 2 || trimmed.length > 50) continue
      if (GARBAGE_NAMES.has(trimmed.toLowerCase())) continue
      if (/^\d+(\.\d+)?$/.test(trimmed)) continue // pure numbers
      if (!nameToUser.has(trimmed.toLowerCase())) {
        allPlayerNames.add(trimmed)
      }
    }
  }

  // Create placeholder users for unmatched names
  if (allPlayerNames.size > 0 && onProgress) {
    onProgress(0, allPlayerNames.size, `Creating ${allPlayerNames.size} player profiles...`)
  }
  for (const playerName of Array.from(allPlayerNames)) {
    try {
      // Create user with name (no email/password — placeholder for imported data)
      const slug = playerName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const placeholderEmail = `imported-${slug}-${randomUUID().slice(0, 8)}@placeholder.iqsport.ai`
      const user = await prisma.user.create({
        data: {
          id: randomUUID(),
          name: playerName,
          email: placeholderEmail,
        },
      })
      // Add as club follower
      await prisma.clubFollower.create({
        data: { clubId, userId: user.id },
      }).catch(() => {}) // ignore if already exists
      nameToUser.set(playerName.toLowerCase().trim(), user.id)
    } catch (err) {
      // User creation might fail for various reasons — skip silently
      console.warn(`[Import] Failed to create user "${playerName}":`, err instanceof Error ? err.message : err)
    }
  }

  const now = new Date()

  // 3. Load existing sessions for dedup (ONE query instead of N findFirst)
  const existingSessions = await prisma.playSession.findMany({
    where: { clubId },
    select: { date: true, startTime: true, courtId: true },
  })
  const existingKeys = new Set<string>()
  existingSessions.forEach((s: any) => {
    const dateStr = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10)
    existingKeys.add(`${dateStr}|${s.startTime}|${s.courtId || ''}`)
  })

  // 4. Prepare all session rows in memory (with pre-generated UUIDs)
  interface SessionRow {
    id: string
    courtId: string | null
    title: string
    date: string // ISO date for SQL
    startTime: string
    endTime: string
    format: string
    skillLevel: string
    maxPlayers: number
    pricePerSlot: number | null
    registeredCount: number
    status: string
    playerNames: string[]
  }

  const sessionRows: SessionRow[] = []

  for (const s of sessions) {
    const courtId = courtCache.get(s.court.toLowerCase().trim()) || null
    const format = normalizeFormat(s.format)
    const skillLevel = normalizeSkillLevel(s.skillLevel)

    // In-memory deduplication
    const dedupKey = `${s.date}|${s.startTime}|${courtId || ''}`
    if (existingKeys.has(dedupKey)) {
      result.sessionsSkipped++
      continue
    }
    existingKeys.add(dedupKey)

    const sessionDate = new Date(s.date + 'T00:00:00')
    const isPast = sessionDate < now
    const formatLabel = format.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

    sessionRows.push({
      id: randomUUID(),
      courtId,
      title: `${formatLabel} @ ${s.court || 'TBD'}`,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      format,
      skillLevel,
      maxPlayers: s.capacity || 8,
      pricePerSlot: s.pricePerPlayer,
      registeredCount: s.registered,
      status: isPast ? 'COMPLETED' : 'SCHEDULED',
      playerNames: s.playerNames,
    })
  }

  // 5. Batch INSERT sessions via raw SQL
  const sessionBatchSize = 500
  const nowISO = now.toISOString()

  for (let i = 0; i < sessionRows.length; i += sessionBatchSize) {
    const batch = sessionRows.slice(i, i + sessionBatchSize)
    if (onProgress) {
      onProgress(i, sessionRows.length, `Creating sessions... (${i}/${sessionRows.length})`)
    }

    const params: unknown[] = []
    const valuesClauses: string[] = []

    batch.forEach((row, j) => {
      const offset = j * 13
      valuesClauses.push(
        `($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}::uuid, $${offset + 4}, $${offset + 5}::timestamp, $${offset + 6}, $${offset + 7}, $${offset + 8}::"PlaySessionFormat", $${offset + 9}::"PlaySessionSkillLevel", $${offset + 10}::int, $${offset + 11}::int, $${offset + 12}::"PlaySessionStatus", $${offset + 13}::float)`
      )
      params.push(
        row.id,
        clubId,
        row.courtId, // nullable uuid
        row.title,
        row.date + 'T00:00:00',
        row.startTime,
        row.endTime,
        row.format,
        row.skillLevel,
        row.maxPlayers,
        row.registeredCount,
        row.status,
        row.pricePerSlot, // price per player
      )
    })

    await prisma.$executeRawUnsafe(
      `INSERT INTO play_sessions (id, "clubId", "courtId", title, date, "startTime", "endTime", format, "skillLevel", "maxPlayers", registered_count, status, "pricePerSlot", "createdAt", "updatedAt")
       VALUES ${valuesClauses.map(v => v.replace(/\)$/, `, '${nowISO}'::timestamp, '${nowISO}'::timestamp)`)).join(', ')}
       ON CONFLICT DO NOTHING`,
      ...params,
    )

    result.sessionsCreated += batch.length
  }

  if (onProgress) {
    onProgress(sessionRows.length, sessionRows.length, `${sessionRows.length} sessions created`)
  }

  // 6. Prepare and batch INSERT bookings
  const allBookings: { sessionId: string; userId: string; bookedAt: string; status: string }[] = []

  for (const row of sessionRows) {
    if (row.playerNames.length > 0) {
      for (const playerName of row.playerNames) {
        const userId = nameToUser.get(playerName.toLowerCase().trim())
        if (userId) {
          allBookings.push({
            sessionId: row.id,
            userId,
            bookedAt: row.date + 'T00:00:00',
            status: 'CONFIRMED',
          })
          result.playersMatched++
        } else {
          result.playersUnmatched++
        }
      }
    }
  }

  if (allBookings.length > 0) {
    if (onProgress) {
      onProgress(sessionRows.length, sessionRows.length, `Creating ${allBookings.length} bookings...`)
    }

    const bookingBatchSize = 500
    for (let i = 0; i < allBookings.length; i += bookingBatchSize) {
      const batch = allBookings.slice(i, i + bookingBatchSize)

      const params: unknown[] = []
      const valuesClauses: string[] = []

      batch.forEach((b, j) => {
        const offset = j * 4
        valuesClauses.push(
          `(gen_random_uuid(), $${offset + 1}::uuid, $${offset + 2}, $${offset + 3}::"BookingStatus", $${offset + 4}::timestamp)`
        )
        params.push(b.sessionId, b.userId, b.status, b.bookedAt)
      })

      const inserted = await prisma.$executeRawUnsafe(
        `INSERT INTO play_session_bookings (id, "sessionId", "userId", status, "bookedAt")
         VALUES ${valuesClauses.join(', ')}
         ON CONFLICT ("sessionId", "userId") DO NOTHING`,
        ...params,
      )
      result.bookingsCreated += typeof inserted === 'number' ? inserted : 0
    }
  }

  if (onProgress) {
    onProgress(sessionRows.length, sessionRows.length, 'Creating member health snapshots...')
  }

  // 7. Create MemberHealthSnapshot for each unique player
  const uniqueUserIds = new Set<string>()
  for (const row of sessionRows) {
    for (const playerName of row.playerNames) {
      const userId = nameToUser.get(playerName.toLowerCase().trim())
      if (userId) uniqueUserIds.add(userId)
    }
  }

  if (uniqueUserIds.size > 0) {
    // Calculate basic health metrics per player
    const playerSessions = new Map<string, { count: number; lastDate: string; firstDate: string }>()
    for (const row of sessionRows) {
      for (const playerName of row.playerNames) {
        const userId = nameToUser.get(playerName.toLowerCase().trim())
        if (!userId) continue
        const existing = playerSessions.get(userId) || { count: 0, lastDate: '1970-01-01', firstDate: '2999-01-01' }
        existing.count++
        if (row.date > existing.lastDate) existing.lastDate = row.date
        if (row.date < existing.firstDate) existing.firstDate = row.date
        playerSessions.set(userId, existing)
      }
    }

    const nowDate = new Date().toISOString().slice(0, 10)
    const healthBatch: unknown[] = []
    const healthValues: string[] = []

    for (const [userId, stats] of Array.from(playerSessions)) {
      const daysSinceLastPlay = Math.max(0, Math.floor((Date.now() - new Date(stats.lastDate).getTime()) / 86400000))
      // Simple health score: 100 - (days since last play * 2) + (session count bonus)
      const rawScore = Math.max(0, Math.min(100, 100 - daysSinceLastPlay * 2 + Math.min(stats.count, 20)))
      const riskLevel = rawScore >= 70 ? 'HEALTHY' : rawScore >= 50 ? 'WATCH' : rawScore >= 25 ? 'AT_RISK' : 'CRITICAL'

      const offset = healthBatch.length
      const lifecycleStage = rawScore >= 70 ? 'active' : rawScore >= 50 ? 'at_risk' : rawScore >= 25 ? 'at_risk' : 'churned'
      const features = JSON.stringify({ sessionsTotal: stats.count, daysSinceLastPlay, importedAt: nowDate })

      const hOffset = healthBatch.length
      healthValues.push(
        `(gen_random_uuid(), $${hOffset + 1}::uuid, $${hOffset + 2}, $${hOffset + 3}::int, $${hOffset + 4}, $${hOffset + 5}, $${hOffset + 6}::jsonb, $${hOffset + 7}::timestamp)`
      )
      healthBatch.push(
        clubId,
        userId,
        rawScore,
        riskLevel.toLowerCase(),
        lifecycleStage,
        features,
        nowDate + 'T00:00:00',
      )
    }

    if (healthValues.length > 0) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO member_health_snapshots (id, club_id, user_id, health_score, risk_level, lifecycle_stage, features, date)
           VALUES ${healthValues.join(', ')}
           ON CONFLICT DO NOTHING`,
          ...healthBatch,
        )
      } catch (err) {
        console.warn('[Import] Health snapshot insert failed:', err instanceof Error ? err.message : err)
      }
    }

    if (onProgress) {
      onProgress(sessionRows.length, sessionRows.length, `${uniqueUserIds.size} member profiles created`)
    }
  }

  if (onProgress) {
    onProgress(sessionRows.length, sessionRows.length, 'Import complete')
  }

  return result
}

/**
 * Re-match player names from CSV embeddings to newly imported users.
 * Creates PlaySessionBooking records for matches found.
 */
export async function rematchSessionBookings(
  prisma: any,
  clubId: string,
): Promise<{ matched: number }> {
  let matched = 0

  // 1. Load all club followers with user names
  const followers = await prisma.clubFollower.findMany({
    where: { clubId },
    include: { user: { select: { id: true, name: true } } },
  })
  const nameToUser = new Map<string, string>()
  followers.forEach((f: any) => {
    if (f.user.name) {
      nameToUser.set(f.user.name.toLowerCase().trim(), f.user.id)
    }
  })

  if (nameToUser.size === 0) return { matched }

  // 2. Load all sessions for this club with their existing bookings
  const sessions = await prisma.playSession.findMany({
    where: { clubId },
    select: {
      id: true,
      date: true,
      bookings: { select: { userId: true } },
    },
  })

  // 3. Load player names from CSV embeddings
  const embeddings: Array<{ metadata: any }> = await prisma.documentEmbedding.findMany({
    where: {
      clubId,
      contentType: 'session',
      sourceTable: 'csv_import',
    },
    select: { metadata: true },
  })

  // Build sessionDate+startTime → playerNames map from embeddings
  // Embeddings store session chunks — each may contain playerNames array
  const sessionPlayerNames = new Map<string, string[]>()
  for (const emb of embeddings) {
    const meta = emb.metadata as any
    if (meta?.playerNames && Array.isArray(meta.playerNames)) {
      // Use session ID if available in metadata, otherwise use date+time key
      const key = meta.sessionId || `${meta.date}|${meta.startTime}`
      const existing = sessionPlayerNames.get(key) || []
      sessionPlayerNames.set(key, [...existing, ...meta.playerNames])
    }
  }

  // 4. For each session, check if any playerNames now match a user
  const bookingsToCreate: Array<{ sessionId: string; userId: string; bookedAt: string; status: string }> = []

  for (const session of sessions) {
    const existingUserIds = new Set(session.bookings.map((b: any) => b.userId))
    const dateStr = session.date instanceof Date
      ? session.date.toISOString().slice(0, 10)
      : String(session.date).slice(0, 10)

    // Try to find matching player names from embeddings
    // Check all embeddings — playerNames might be spread across chunks
    for (const [, playerNames] of Array.from(sessionPlayerNames)) {
      for (const playerName of playerNames) {
        const userId = nameToUser.get(playerName.toLowerCase().trim())
        if (userId && !existingUserIds.has(userId)) {
          existingUserIds.add(userId)
          bookingsToCreate.push({
            sessionId: session.id,
            userId,
            bookedAt: dateStr + 'T00:00:00',
            status: 'CONFIRMED',
          })
        }
      }
    }
  }

  // 5. Batch insert new bookings
  if (bookingsToCreate.length > 0) {
    const batchSize = 500
    for (let i = 0; i < bookingsToCreate.length; i += batchSize) {
      const batch = bookingsToCreate.slice(i, i + batchSize)
      const params: unknown[] = []
      const valuesClauses: string[] = []

      batch.forEach((b, j) => {
        const offset = j * 4
        valuesClauses.push(
          `(gen_random_uuid(), $${offset + 1}::uuid, $${offset + 2}, $${offset + 3}::"BookingStatus", $${offset + 4}::timestamp)`
        )
        params.push(b.sessionId, b.userId, b.status, b.bookedAt)
      })

      const inserted = await prisma.$executeRawUnsafe(
        `INSERT INTO play_session_bookings (id, "sessionId", "userId", status, "bookedAt")
         VALUES ${valuesClauses.join(', ')}
         ON CONFLICT ("sessionId", "userId") DO NOTHING`,
        ...params,
      )
      matched += typeof inserted === 'number' ? inserted : 0
    }
  }

  return { matched }
}
