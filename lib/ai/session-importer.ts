/**
 * Session Importer
 *
 * Creates PlaySession + PlaySessionBooking records from imported CSV data.
 * Handles court matching/creation, player name matching, and deduplication.
 */

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

  // 3. Create sessions + bookings
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]
    if (onProgress && i % 20 === 0) {
      onProgress(i, sessions.length, `Creating sessions... (${i}/${sessions.length})`)
    }

    const courtId = courtCache.get(s.court.toLowerCase().trim()) || null
    const sessionDate = new Date(s.date + 'T00:00:00')
    const isPast = sessionDate < now
    const format = normalizeFormat(s.format)
    const skillLevel = normalizeSkillLevel(s.skillLevel)

    // Deduplication: check if session already exists
    const existing = await prisma.playSession.findFirst({
      where: {
        clubId,
        date: sessionDate,
        startTime: s.startTime,
        ...(courtId ? { courtId } : {}),
      },
      select: { id: true },
    })

    if (existing) {
      result.sessionsSkipped++
      continue
    }

    // Create PlaySession
    const formatLabel = format.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    const playSession = await prisma.playSession.create({
      data: {
        clubId,
        courtId,
        title: `${formatLabel} @ ${s.court || 'TBD'}`,
        date: sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        format,
        skillLevel,
        maxPlayers: s.capacity || 8,
        pricePerSlot: s.pricePerPlayer,
        status: isPast ? 'COMPLETED' : 'SCHEDULED',
      },
    })
    result.sessionsCreated++

    // Match player names to club followers and create bookings
    if (s.playerNames.length > 0) {
      const bookingsToCreate: { sessionId: string; userId: string; bookedAt: Date; status: string }[] = []

      for (const playerName of s.playerNames) {
        const userId = nameToUser.get(playerName.toLowerCase().trim())
        if (userId) {
          bookingsToCreate.push({
            sessionId: playSession.id,
            userId,
            bookedAt: sessionDate,
            status: 'CONFIRMED',
          })
          result.playersMatched++
        } else {
          result.playersUnmatched++
        }
      }

      if (bookingsToCreate.length > 0) {
        const created = await prisma.playSessionBooking.createMany({
          data: bookingsToCreate,
          skipDuplicates: true,
        })
        result.bookingsCreated += created.count
      }
    }
  }

  if (onProgress) {
    onProgress(sessions.length, sessions.length, 'Session records created')
  }

  return result
}
