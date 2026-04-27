/**
 * Cohort: New & Engaged (P3-T1).
 *
 * Members who joined the club within the last 30 days and have already
 * booked ≥4 confirmed sessions. These are the highest-LTV onboarding
 * targets — small nudge drives strong long-term retention.
 *
 * Source: ClubFollower.createdAt for join date + PlaySessionBooking
 * count since join.
 *
 * Returns null when no members match.
 */

import type { CohortGenerator } from './index'

const DAY_MS = 86400000

export const generateNewAndEngaged: CohortGenerator = async (clubId, db) => {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS)

  // Find recent followers, then count their confirmed bookings since they joined.
  let followers: Array<{ userId: string; createdAt: Date }> = []
  try {
    followers = await db.clubFollower.findMany({
      where: {
        clubId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { userId: true, createdAt: true },
    })
  } catch {
    return null
  }

  if (followers.length === 0) return null

  // Bucket bookings per user
  const userIds = followers.map((f) => f.userId).filter((id): id is string => !!id)
  if (userIds.length === 0) return null

  let bookings: Array<{ userId: string }> = []
  try {
    bookings = await db.$queryRaw<Array<{ userId: string }>>`
      SELECT b."userId" as "userId"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = ${clubId}
        AND b.status = 'CONFIRMED'
        AND ps."startsAt" >= ${thirtyDaysAgo}
        AND b."userId" = ANY(${userIds})
    `
  } catch {
    return null
  }

  const bookingCount = new Map<string, number>()
  for (const b of bookings) {
    if (!b.userId) continue
    bookingCount.set(b.userId, (bookingCount.get(b.userId) ?? 0) + 1)
  }

  const qualifying: string[] = []
  Array.from(bookingCount.entries()).forEach(([userId, count]) => {
    if (count >= 4) qualifying.push(userId)
  })

  if (qualifying.length === 0) return null

  // Placeholder $ impact: ~$600 LTV boost × 30% engagement-lift conversion.
  const estImpactCents = qualifying.length * 60000 * 0.3

  return {
    id: `new_and_engaged:${clubId}:${now.toISOString().slice(0, 10)}`,
    generatorKey: 'new_and_engaged',
    name: 'New & Engaged',
    description: `${qualifying.length} new member${qualifying.length === 1 ? '' : 's'} (joined <30d ago, 4+ sessions). Welcome them properly to lock in long-term LTV.`,
    suggestedAction: 'Onboarding series',
    suggestedTemplateKey: 'onboarding_series',
    userIds: qualifying,
    memberCount: qualifying.length,
    estImpactCents: Math.round(estImpactCents),
    emoji: '🌟',
  }
}
