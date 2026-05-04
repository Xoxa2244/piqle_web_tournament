/**
 * Sleeping-Member Detector — ENGAGE Segment #5 "Спящий".
 *
 * Identifies members whose last confirmed booking is between 30 and 90 days
 * ago and whose subscription is still active. These are the "warm" pool
 * just past the DECLINING_REACTIVATION window (0–30d) and before they tip
 * into segment #6 "Ушедший" (90+ days, deep winback).
 *
 * Membership criteria:
 *   - Subscription active (membership_status = 'Active')
 *   - Last confirmed booking ≥30 and <90 days ago
 *   - Joined the club ≥60 days ago (not still a Newcomer)
 *   - NOT contacted by SLEEPING_REACTIVATION OR DECLINING_REACTIVATION
 *     in the last 60 days (cooldown — avoid double outreach to the same
 *     person across overlapping cascades)
 *   - Email valid (not placeholder/demo)
 *
 * Rate-limit important: a typical mid-sized club has hundreds of sleeping
 * members; the cron that calls this detector caps daily volume so we
 * don't burst-mail and trip Mandrill domain throttling. Default
 * `limit: 50` per call (vs DECLINING's 200 — sleeping pool is 10× larger
 * and lower-precision).
 *
 * Ordered by days_inactive ASC — we contact the freshest sleepers first
 * (they have the highest re-activation probability).
 */

import { intelligenceLogger as log } from '@/lib/logger'

export interface SleepingCandidate {
  userId: string
  clubId: string
  email: string
  name: string | null
  daysSinceLastBooking: number
  totalLifetimeBookings: number
}

interface DetectOptions {
  /** Cap on candidates per run. Default 50 — keeps daily Mandrill volume
   *  predictable. With ~800 sleepers across all clubs, 50/cron/club drains
   *  the backlog over ~3 weeks while staying under spam-folder thresholds. */
  limit?: number
  /** Cooldown days — minimum gap before the same member can re-enter ANY
   *  reactivation sequence (sleeping or declining). Default 60. */
  cooldownDays?: number
}

export async function detectSleepingMembers(
  prisma: any,
  clubId: string,
  opts: DetectOptions = {},
): Promise<SleepingCandidate[]> {
  const limit = opts.limit ?? 50
  const cooldownDays = opts.cooldownDays ?? 60

  const candidates: SleepingCandidate[] = await prisma.$queryRawUnsafe(
    `
    -- Schema notes (validated against prod):
    --   users.membership_status — 'Active' (capitalized)
    --   club_followers.user_id / .club_id / .created_at — snake_case
    --   play_sessions.clubId — camelCase
    --   play_session_bookings.userId / .sessionId / .bookedAt — camelCase
    --   ai_recommendation_logs.userId / .clubId / .createdAt — camelCase
    WITH active_subs AS (
      SELECT u.id AS user_id
      FROM users u
      WHERE u.membership_status = 'Active'
    ),
    last_booking AS (
      SELECT
        b."userId" AS user_id,
        MAX(b."bookedAt") AS last_booking_at,
        COUNT(*)::int AS total_lifetime_bookings
      FROM play_session_bookings b
      JOIN play_sessions s ON s.id = b."sessionId"
      WHERE s."clubId" = $1
        AND b.status = 'CONFIRMED'
      GROUP BY b."userId"
    ),
    recent_outreach AS (
      -- Skip anyone we've recently contacted with EITHER sleeping OR
      -- declining outreach — they're in the same cascade, double-dipping
      -- is bad UX.
      SELECT DISTINCT "userId" AS user_id
      FROM ai_recommendation_logs
      WHERE "clubId" = $1
        AND type IN ('SLEEPING_REACTIVATION', 'DECLINING_REACTIVATION')
        AND "createdAt" >= NOW() - ($2::int || ' days')::interval
    )
    SELECT
      u.id AS "userId",
      $1::text AS "clubId",
      u.email,
      u.name,
      EXTRACT(DAY FROM (NOW() - lb.last_booking_at))::int AS "daysSinceLastBooking",
      lb.total_lifetime_bookings AS "totalLifetimeBookings"
    FROM active_subs a
    JOIN users u ON u.id = a.user_id
    JOIN club_followers cf ON cf.user_id = u.id AND cf.club_id = $1
    JOIN last_booking lb ON lb.user_id = u.id
    WHERE u.email IS NOT NULL
      AND u.email <> ''
      AND u.email NOT LIKE '%placeholder%'
      AND u.email NOT LIKE '%demo%'
      -- Sleeping window: 30–90 days since last booking
      AND lb.last_booking_at < NOW() - INTERVAL '30 days'
      AND lb.last_booking_at >= NOW() - INTERVAL '90 days'
      -- Not a still-onboarding newcomer
      AND cf.created_at < NOW() - INTERVAL '60 days'
      -- Cooldown: not contacted in either reactivation segment recently
      AND u.id NOT IN (SELECT user_id FROM recent_outreach)
    ORDER BY lb.last_booking_at DESC, u.id ASC
    LIMIT $3::int
    `,
    clubId,
    cooldownDays,
    limit,
  )

  log.info({ clubId, candidates: candidates.length }, '[sleeping-detector] found')
  return candidates
}
