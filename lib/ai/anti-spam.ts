/**
 * Anti-spam utility for intelligence invite flows.
 * DB-based checks (Vercel serverless — no in-memory state).
 * All 3 flows (slot filler, reactivation, event invites) import this.
 *
 * Sequence-aware: follow-ups within the same sequence chain
 * don't trigger cross-type cooldown but DO count toward frequency caps.
 */

type InviteType =
  | 'SLOT_FILLER'
  | 'REACTIVATION'
  | 'EVENT_INVITE'
  | 'CHECK_IN'
  | 'RETENTION_BOOST'
  | 'NEW_MEMBER_WELCOME'
type PlayerPersona = 'COMPETITIVE' | 'SOCIAL' | 'IMPROVER' | 'CASUAL' | 'TEAM_PLAYER'

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

// ── Persona-Aware Limits ──
// COMPETITIVE/IMPROVER: more engaged, tolerate more contact
// CASUAL: less engaged, contact less frequently
const DEFAULT_LIMITS = { max24h: 2, max7d: 5, cooldownHours: 4 }
const PERSONA_LIMITS: Record<PlayerPersona, { max24h: number; max7d: number; cooldownHours: number }> = {
  COMPETITIVE: { max24h: 3, max7d: 7, cooldownHours: 3 },
  IMPROVER:    { max24h: 3, max7d: 7, cooldownHours: 3 },
  SOCIAL:      { max24h: 2, max7d: 5, cooldownHours: 4 },
  TEAM_PLAYER: { max24h: 2, max7d: 6, cooldownHours: 3 },
  CASUAL:      { max24h: 1, max7d: 3, cooldownHours: 6 },
}

/**
 * Check if sending a message to this user is allowed.
 * Returns { allowed: false, reason } if any rule is violated.
 */
export async function checkAntiSpam(input: SpamCheckInput): Promise<SpamCheckResult> {
  const { prisma, userId, clubId, type, sessionId, isSequenceFollowUp = false } = input

  // 1. Opt-out check + load persona for adaptive limits
  let persona: PlayerPersona | null = null
  try {
    const pref = await prisma.userPlayPreference.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { notificationsOptOut: true, detectedPersona: true },
    })
    if (pref?.notificationsOptOut) {
      return { allowed: false, reason: 'User opted out of notifications' }
    }
    persona = pref?.detectedPersona as PlayerPersona | null
  } catch {
    // No preference record = not opted out
  }

  // Persona-aware limits (falls back to default)
  const limits = persona ? PERSONA_LIMITS[persona] : DEFAULT_LIMITS

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

  // 3. 24-hour frequency cap (persona-aware)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  if (isSequenceFollowUp) {
    const totalCount24h = await prisma.aIRecommendationLog.count({
      where: {
        userId,
        clubId,
        status: 'sent',
        createdAt: { gte: since24h },
      },
    })
    if (totalCount24h >= limits.max24h + 1) { // +1 for sequence follow-ups
      return { allowed: false, reason: `Already contacted ${totalCount24h} times in last 24 hours (limit: ${limits.max24h + 1})` }
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
    if (count24h >= limits.max24h) {
      return { allowed: false, reason: `Already contacted ${count24h} times in last 24 hours (limit: ${limits.max24h}${persona ? `, persona: ${persona}` : ''})` }
    }
  }

  // 4. 7-day frequency cap (persona-aware)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const count7d = await prisma.aIRecommendationLog.count({
    where: {
      userId,
      clubId,
      status: 'sent',
      createdAt: { gte: since7d },
    },
  })
  if (count7d >= limits.max7d) {
    return { allowed: false, reason: `Already contacted ${count7d} times in last 7 days (limit: ${limits.max7d}${persona ? `, persona: ${persona}` : ''})` }
  }

  // 5. Cross-type cooldown (persona-aware)
  // SKIPPED for sequence follow-ups (they're part of the same campaign chain)
  if (!isSequenceFollowUp) {
    const sinceCooldown = new Date(Date.now() - limits.cooldownHours * 60 * 60 * 1000)
    const recentDifferentType = await prisma.aIRecommendationLog.findFirst({
      where: {
        userId,
        clubId,
        status: 'sent',
        type: { not: type },
        sequenceStep: null,
        createdAt: { gte: sinceCooldown },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (recentDifferentType) {
      return { allowed: false, reason: `Recently contacted via ${recentDifferentType.type} (${limits.cooldownHours}h cooldown)` }
    }
  }

  return { allowed: true }
}
