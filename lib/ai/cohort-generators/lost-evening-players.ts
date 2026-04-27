/**
 * Cohort: Lost Evening Players (P3-T1).
 *
 * Members who used to play 4+ evening sessions/month and now ≤1.
 * "Evening" = session start time ≥ 17:00 local (we use UTC start
 * here as a v1 proxy; per-club timezone refinement is a P5+ polish).
 *
 * Algorithm:
 *   1. For each user with confirmed bookings at this club, count
 *      evening bookings in the previous window (30-60 days ago) and
 *      the recent window (last 30 days).
 *   2. Qualifies if previous ≥ 4 AND recent ≤ 1.
 *
 * Returns null when not enough booking history exists.
 */

import type { CohortGenerator } from './index'
import { computeEstImpactCents } from '../attribution'

const DAY_MS = 86400000

export const generateLostEveningPlayers: CohortGenerator = async (clubId, db) => {
  const now = new Date()
  const recentWindowStart = new Date(now.getTime() - 30 * DAY_MS)
  const previousWindowStart = new Date(now.getTime() - 60 * DAY_MS)

  // Pull confirmed evening bookings for this club in the last 60 days.
  // Filter "evening" by session.startsAt hour ≥ 17.
  let rows: Array<{ userId: string; startsAt: Date }> = []
  try {
    rows = await db.$queryRaw<Array<{ userId: string; startsAt: Date }>>`
      SELECT b."userId" as "userId", ps."startsAt" as "startsAt"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = ${clubId}
        AND b.status = 'CONFIRMED'
        AND ps."startsAt" >= ${previousWindowStart}
        AND EXTRACT(HOUR FROM ps."startsAt") >= 17
    `
  } catch {
    return null
  }

  if (rows.length === 0) return null

  // Bucket per user × window
  const byUser = new Map<string, { previous: number; recent: number }>()
  for (const r of rows) {
    if (!r.userId) continue
    const bucket = byUser.get(r.userId) ?? { previous: 0, recent: 0 }
    if (r.startsAt >= recentWindowStart) bucket.recent += 1
    else bucket.previous += 1
    byUser.set(r.userId, bucket)
  }

  const userIds: string[] = []
  Array.from(byUser.entries()).forEach(([userId, counts]) => {
    if (counts.previous >= 4 && counts.recent <= 1) {
      userIds.push(userId)
    }
  })

  if (userIds.length === 0) return null

  // P5-T3: shared formula (lib/ai/attribution.ts → computeEstImpactCents)
  const estImpactCents = computeEstImpactCents({ memberCount: userIds.length, action: 'reactivate_dormant' })

  return {
    id: `lost_evening_players:${clubId}:${now.toISOString().slice(0, 10)}`,
    generatorKey: 'lost_evening_players',
    name: 'Lost Evening Players',
    description: `${userIds.length} member${userIds.length === 1 ? '' : 's'} who used to play 4+ evenings/month, now ≤1. A personal "we miss you" can win them back.`,
    suggestedAction: 'Reactivation outreach',
    suggestedTemplateKey: 'win_back_inactive',
    userIds,
    memberCount: userIds.length,
    estImpactCents,
    emoji: '⚠️',
  }
}
