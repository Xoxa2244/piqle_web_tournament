/**
 * Anti-spam utility for intelligence invite flows.
 * DB-based checks (Vercel serverless — no in-memory state).
 * All 3 flows (slot filler, reactivation, event invites) import this.
 */

type InviteType = 'SLOT_FILLER' | 'REACTIVATION' | 'EVENT_INVITE' | 'CHECK_IN' | 'RETENTION_BOOST'

interface SpamCheckInput {
  prisma: any
  userId: string
  clubId: string
  type: InviteType
  sessionId?: string | null
}

interface SpamCheckResult {
  allowed: boolean
  reason?: string
}

// ── Limits ──
const MAX_PER_24H = 2
const MAX_PER_7D = 4
const CROSS_TYPE_COOLDOWN_HOURS = 4

/**
 * Check if sending a message to this user is allowed.
 * Returns { allowed: false, reason } if any rule is violated.
 */
export async function checkAntiSpam(input: SpamCheckInput): Promise<SpamCheckResult> {
  const { prisma, userId, clubId, type, sessionId } = input

  // 1. Opt-out check
  try {
    const pref = await prisma.userPlayPreference.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { notificationsOptOut: true },
    })
    if (pref?.notificationsOptOut) {
      return { allowed: false, reason: 'User opted out of notifications' }
    }
  } catch {
    // No preference record = not opted out
  }

  // 2. Dedup: same session + same user + same type
  if (sessionId && !sessionId.startsWith('csv-')) {
    const existing = await prisma.aIRecommendationLog.findFirst({
      where: {
        userId,
        sessionId,
        type,
        status: 'sent',
      },
    })
    if (existing) {
      return { allowed: false, reason: 'Already invited to this session' }
    }
  }

  // 3. 24-hour frequency cap
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const count24h = await prisma.aIRecommendationLog.count({
    where: {
      userId,
      clubId,
      status: 'sent',
      createdAt: { gte: since24h },
    },
  })
  if (count24h >= MAX_PER_24H) {
    return { allowed: false, reason: `Already contacted ${count24h} times in last 24 hours (limit: ${MAX_PER_24H})` }
  }

  // 4. 7-day frequency cap
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const count7d = await prisma.aIRecommendationLog.count({
    where: {
      userId,
      clubId,
      status: 'sent',
      createdAt: { gte: since7d },
    },
  })
  if (count7d >= MAX_PER_7D) {
    return { allowed: false, reason: `Already contacted ${count7d} times in last 7 days (limit: ${MAX_PER_7D})` }
  }

  // 5. Cross-type cooldown: different invite type within 4 hours
  const sinceCooldown = new Date(Date.now() - CROSS_TYPE_COOLDOWN_HOURS * 60 * 60 * 1000)
  const recentDifferentType = await prisma.aIRecommendationLog.findFirst({
    where: {
      userId,
      clubId,
      status: 'sent',
      type: { not: type },
      createdAt: { gte: sinceCooldown },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (recentDifferentType) {
    return { allowed: false, reason: `Recently contacted via ${recentDifferentType.type} (${CROSS_TYPE_COOLDOWN_HOURS}h cooldown)` }
  }

  return { allowed: true }
}
