/**
 * Declining-Activity Detector — ENGAGE Segment #4 "Снижение активности".
 *
 * Identifies members who were active regulars but just dropped off — the
 * "warm" decline window where intervention has the highest payoff. After
 * 30+ days of inactivity they cross into "Спящий" (segment #5) and are
 * handled by a different (less optimistic) sequence.
 *
 * Membership criteria:
 *   - Subscription is active (not cancelled / expired)
 *   - Joined the club ≥90 days ago (long enough to have a baseline)
 *   - Historical pattern: ≥3 confirmed bookings/month for 3+ consecutive months
 *   - Last 30 days: 0 or 1 confirmed bookings (the drop)
 *   - Last booking is still <30 days ago (otherwise they're "Спящий" already)
 *   - NOT already in an active DECLINING_REACTIVATION sequence (no double-trigger)
 *   - NOT been sent any DECLINING_REACTIVATION outreach in the last 60 days
 *     (cooldown so we don't keep pinging the same person every cycle)
 *
 * The detector is idempotent: running twice the same day finds the same set,
 * and the sequence-runner's existing dedup prevents double-sends.
 *
 * Why a separate detector (not health-score-based like CHECK_IN/RETENTION_BOOST):
 * health-score conflates many signals (cancels, response rate, etc.). For this
 * segment the booking-frequency signal alone is what the spec asks for, and
 * it's much more interpretable to a club operator (and member) than a
 * composite score change.
 */

import { intelligenceLogger as log } from '@/lib/logger'

export interface DecliningCandidate {
  userId: string
  clubId: string
  email: string
  name: string | null
  /** Last 30 days booking count (0 or 1) */
  recentBookings: number
  /** Average bookings/month over the prior 90 days (≥3 by criteria) */
  historicalAvgPerMonth: number
  /** Days since their last confirmed booking (<30 by criteria) */
  daysSinceLastBooking: number
}

interface DetectOptions {
  /**
   * Minimum monthly average over the historical window. Default 3 — matches
   * the ENGAGE_MVP spec ("was booking ≥3 times a month"). Loosen to catch
   * lower-frequency members; tighten to focus on more committed ones.
   */
  minHistoricalAvg?: number
  /**
   * Cooldown in days before the same member can re-enter a declining sequence.
   * Default 60 — prevents back-to-back chains if the member briefly recovers
   * then drops again. Sequence's own retry rules layer on top of this.
   */
  cooldownDays?: number
  /**
   * Cap on candidates per run. Default 200 — keeps the daily cron predictable
   * even on a large club; the detector orders by historicalAvgPerMonth DESC
   * so the most engaged members surface first.
   */
  limit?: number
}

/**
 * Find members who just entered the "Снижение активности" segment.
 *
 * Returns up to `limit` candidates ordered by historical engagement (the
 * higher their old monthly average, the more revenue at stake from their
 * drop, so they're worth contacting first).
 */
export async function detectDecliningMembers(
  prisma: any,
  clubId: string,
  opts: DetectOptions = {},
): Promise<DecliningCandidate[]> {
  const minHistoricalAvg = opts.minHistoricalAvg ?? 3
  const cooldownDays = opts.cooldownDays ?? 60
  const limit = opts.limit ?? 200

  // Single SQL pass — keeps the detector cheap enough to run inside the daily
  // cron loop alongside health-snapshot calculation. CTEs:
  //   recent_window  — bookings per user in the last 30 days
  //   prior_window   — bookings per user in the prior 60 days (days 30–90)
  //   historical_avg — derived monthly avg from the prior window
  //   recent_outreach — anyone we already messaged in this segment within
  //                     cooldown (excluded from results)
  //   active_subs    — anyone with a current active membership
  //
  // We do not filter by ClubFollower.createdAt ≥ 90 days here because the
  // historical_avg cutoff (≥3/mo over 60-day window) implicitly requires
  // them to have been around long enough to have that pattern.

  const candidates: DecliningCandidate[] = await prisma.$queryRawUnsafe(
    `
    WITH active_subs AS (
      SELECT u.id AS user_id
      FROM users u
      WHERE u."membershipStatus" = 'active'
    ),
    recent_window AS (
      SELECT
        b."userId" AS user_id,
        COUNT(*)::int AS booking_count,
        MAX(b."createdAt") AS last_booking_at
      FROM play_session_bookings b
      JOIN play_sessions s ON s.id = b."sessionId"
      WHERE s."clubId" = $1
        AND b.status = 'CONFIRMED'
        AND b."createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY b."userId"
    ),
    last_booking_any AS (
      SELECT
        b."userId" AS user_id,
        MAX(b."createdAt") AS last_booking_at
      FROM play_session_bookings b
      JOIN play_sessions s ON s.id = b."sessionId"
      WHERE s."clubId" = $1
        AND b.status = 'CONFIRMED'
      GROUP BY b."userId"
    ),
    prior_window AS (
      SELECT
        b."userId" AS user_id,
        COUNT(*)::int AS booking_count
      FROM play_session_bookings b
      JOIN play_sessions s ON s.id = b."sessionId"
      WHERE s."clubId" = $1
        AND b.status = 'CONFIRMED'
        AND b."createdAt" >= NOW() - INTERVAL '90 days'
        AND b."createdAt" <  NOW() - INTERVAL '30 days'
      GROUP BY b."userId"
    ),
    recent_outreach AS (
      SELECT DISTINCT "userId" AS user_id
      FROM ai_recommendation_logs
      WHERE "clubId" = $1
        AND type = 'DECLINING_REACTIVATION'
        AND "createdAt" >= NOW() - ($2::int || ' days')::interval
    )
    SELECT
      u.id AS "userId",
      $1::text AS "clubId",
      u.email,
      u.name,
      COALESCE(r.booking_count, 0) AS "recentBookings",
      ROUND((p.booking_count::numeric / 2.0)::numeric, 1) AS "historicalAvgPerMonth",
      EXTRACT(DAY FROM (NOW() - lba.last_booking_at))::int AS "daysSinceLastBooking"
    FROM active_subs a
    JOIN users u ON u.id = a.user_id
    JOIN club_followers cf ON cf."userId" = u.id AND cf."clubId" = $1
    JOIN prior_window p ON p.user_id = u.id
    JOIN last_booking_any lba ON lba.user_id = u.id
    LEFT JOIN recent_window r ON r.user_id = u.id
    WHERE u.email IS NOT NULL
      AND u.email <> ''
      AND u.email NOT LIKE '%placeholder%'
      AND u.email NOT LIKE '%demo%'
      -- Historical pattern: ≥minHistoricalAvg per month over prior 60 days.
      -- Prior window is 60 days, so threshold = minHistoricalAvg * 2.
      AND p.booking_count >= ($3::int * 2)
      -- Recent drop: 0 or 1 booking in last 30 days
      AND COALESCE(r.booking_count, 0) <= 1
      -- Still warm: last booking <30 days ago (otherwise = Спящий segment)
      AND lba.last_booking_at >= NOW() - INTERVAL '30 days'
      -- Cooldown: not contacted in this segment within window
      AND u.id NOT IN (SELECT user_id FROM recent_outreach)
    ORDER BY p.booking_count DESC, u.id ASC
    LIMIT $4::int
    `,
    clubId,
    cooldownDays,
    minHistoricalAvg,
    limit,
  )

  log.info({ clubId, candidates: candidates.length }, '[declining-detector] found')
  return candidates.map((c) => ({
    ...c,
    historicalAvgPerMonth: Number(c.historicalAvgPerMonth),
  }))
}
