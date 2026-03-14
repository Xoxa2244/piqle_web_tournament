/**
 * Anti-spam utility for intelligence invite flows.
 * DB-based checks (Vercel serverless — no in-memory state).
 * All 3 flows (slot filler, reactivation, event invites) import this.
 *
 * Sequence-aware: follow-ups within the same sequence chain
 * don't trigger cross-type cooldown but DO count toward frequency caps.
 */

type InviteType = 'SLOT_FILLER' | 'REACTIVATION' | 'EVENT_INVITE' | 'CHECK_IN' | 'RETENTION_BOOST'

interface SpamCheckInput {
  prisma: any
  userId: string
  clubId: string
  type: InviteType
  sessionId?: string | null
  /** If true, this is a follow-up within an existing sequence chain.
   *  Relaxes: cross-type cooldown is skipped. Still enforces frequency caps. */
  isSequenceFollowUp?: boolean
}

interface SpamCheckResult {
  allowed: boolean
  reason?: string
}

// ── Limits ──
const MAX_PER_24H = 2
const MAX_PER_7D = 5 // Increased from 4 to accommodate sequence follow-ups
const CROSS_TYPE_COOLDOWN_HOURS = 4

/**
 * Check if sending a message to this user is allowed.
 * Returns { allowed: false, reason } if any rule is violated.
 */
export async function checkAntiSpam(input: SpamCheckInput): Promise<SpamCheckResult> {
  const { prisma, userId, clubId, type, sessionId, isSequenceFollowUp = false } = input

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
  // For sequence follow-ups: only count NON-sequence messages toward the 24h cap
  // (sequence follow-ups have their own timing controlled by sequence-runner)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  if (isSequenceFollowUp) {
    // Sequence follow-ups: count non-sequence messages only
    const nonSequenceCount24h = await prisma.aIRecommendationLog.count({
      where: {
        userId,
        clubId,
        status: 'sent',
        sequenceStep: null, // Only count non-sequence messages
        createdAt: { gte: since24h },
      },
    })
    // If user already got a non-sequence message recently, still allow the follow-up
    // but cap at 3 total messages per 24h including sequence steps
    const totalCount24h = await prisma.aIRecommendationLog.count({
      where: {
        userId,
        clubId,
        status: 'sent',
        createdAt: { gte: since24h },
      },
    })
    if (totalCount24h >= 3) {
      return { allowed: false, reason: `Already contacted ${totalCount24h} times in last 24 hours (sequence limit: 3)` }
    }
  } else {
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
  // SKIPPED for sequence follow-ups (they're part of the same campaign chain)
  if (!isSequenceFollowUp) {
    const sinceCooldown = new Date(Date.now() - CROSS_TYPE_COOLDOWN_HOURS * 60 * 60 * 1000)
    const recentDifferentType = await prisma.aIRecommendationLog.findFirst({
      where: {
        userId,
        clubId,
        status: 'sent',
        type: { not: type },
        sequenceStep: null, // Ignore sequence follow-ups when checking cooldown
        createdAt: { gte: sinceCooldown },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (recentDifferentType) {
      return { allowed: false, reason: `Recently contacted via ${recentDifferentType.type} (${CROSS_TYPE_COOLDOWN_HOURS}h cooldown)` }
    }
  }

  return { allowed: true }
}
