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

  // 2. Load club followers for player matching
  const followers = await prisma.clubFollower.findMany({
    where: { clubId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  // Build name→userId map (lowercase full name)
  const nameToUser = new Map<string, string>()
  followers.forEach((f: any) => {
    if (f.user.name) {
      nameToUser.set(f.user.name.toLowerCase().trim(), f.user.id)
    }
  })

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
      const offset = j * 12
      valuesClauses.push(
        `($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}::uuid, $${offset + 4}, $${offset + 5}::timestamp, $${offset + 6}, $${offset + 7}, $${offset + 8}::"PlaySessionFormat", $${offset + 9}::"PlaySessionSkillLevel", $${offset + 10}::int, $${offset + 11}::int, $${offset + 12}::"PlaySessionStatus")`
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
      )
    })

    await prisma.$executeRawUnsafe(
      `INSERT INTO play_sessions (id, club_id, court_id, title, date, start_time, end_time, format, skill_level, max_players, registered_count, status, created_at, updated_at)
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
        `INSERT INTO play_session_bookings (id, session_id, user_id, status, booked_at)
         VALUES ${valuesClauses.join(', ')}
         ON CONFLICT (session_id, user_id) DO NOTHING`,
        ...params,
      )
      result.bookingsCreated += typeof inserted === 'number' ? inserted : 0
    }
  }

  if (onProgress) {
    onProgress(sessionRows.length, sessionRows.length, 'Session records created')
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
        `INSERT INTO play_session_bookings (id, session_id, user_id, status, booked_at)
         VALUES ${valuesClauses.join(', ')}
         ON CONFLICT (session_id, user_id) DO NOTHING`,
        ...params,
      )
      matched += typeof inserted === 'number' ? inserted : 0
    }
  }

  return { matched }
}
