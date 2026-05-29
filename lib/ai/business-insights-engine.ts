/**
 * Business Insights Engine (canon-driven).
 *
 * Replaces in-memory generation in `lib/ai/insights-engine.ts` with a
 * persisted, canon-shaped insight model — see
 * DASHBOARD_AND_ACTION_CENTER_SPEC.md §2 + §3.6 + §6.2.
 *
 * Each generator function returns a `BusinessInsight | null`. A null
 * means "condition not met for this club right now"; the upsert layer
 * resolves any previously-active row with the same dedupeKey so the
 * Dashboard reflects today's reality, not stale state.
 *
 * MVP scope: 1 pilot function (newMemberOnboarding) migrated through
 * the canon. Remaining 9 migrate in Step 9 of §7.5.
 */

import type { PrismaClient } from '@prisma/client'

// ─── Canon types (also re-used by operational_signal in Step 16+) ──────

/**
 * Filter clause matching `cohortFilterSchema` in
 * `server/routers/intelligence.ts`. Keep field names in sync — Zod
 * validation rejects unknown fields, so an out-of-band shape here
 * silently produces 4xx errors on `intelligence.createCohort` later.
 */
export interface CohortFilter {
  field: string
  op: 'eq' | 'ne' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'
  value: string | number | string[]
}

/**
 * Programming IQ prefill envelope (see `lib/ai/programming-iq-scheduler.ts`
 * for the live schema). Loose `Record` shape here is intentional: we
 * stuff hints in JSONB and the consuming page reads them on entry.
 */
export type ProgrammingPrefill = Record<string, unknown>

/** UnifiedAction.primary leaves — see Spec §2.
 *  Note: there is intentionally no "write to CourtReserve" action — the CR
 *  integration is read-only (sync in). Anything that would need a CR change
 *  is surfaced to the operator as `advice` (a manual step), never an API call. */
export type Action =
  | {
      type: 'create_cohort'
      label: string
      cohortRules: CohortFilter[]
      draftId?: string
    }
  | {
      type: 'create_campaign'
      label: string
      templateKey: string
      cohortRef?: string
      draftId?: string
    }
  | {
      type: 'programming'
      label: string
      params: ProgrammingPrefill
      draftId?: string
    }
  | { type: 'advice'; label: string }

export interface UnifiedAction {
  primary: Action
  secondary?: Action[]
}

/** BusinessInsight matches the `business_insight` table 1:1. */
export interface BusinessInsight {
  /** Stable per-(club, slug) — drives the partial unique index. */
  dedupeKey: string
  category: 'retention' | 'growth' | 'optimization' | 'risk'
  severity: 'high' | 'medium' | 'low'
  /** What we observed in the data. */
  analysis: string
  /** Numbers worth rendering on the card. */
  metrics: Record<string, number>
  /** The non-obvious conclusion — why this matters today. */
  insight: string
  action: UnifiedAction
}

// ─── Generators ─────────────────────────────────────────────────────────
//
// Each function returns BusinessInsight | null. Stable dedupeKey per
// generator slug — the upsert layer scopes the partial unique index to
// (club_id, dedupe_key) so re-running the engine refreshes the row
// instead of inserting a dup.
//
// SQL bodies are mirrored from `lib/ai/insights-engine.ts` to minimise
// migration risk — only the output shape and action wiring change. The
// legacy engine continues to serve the side-by-side AI Insights panel
// until Step 9 of §7.5 is fully validated; this file then becomes the
// single source of truth.

/**
 * Generator 1 — new members joined ≤30d ago with ≤2 bookings.
 *
 * This is the canon-shaped successor to `newMemberOnboarding` in
 * `lib/ai/insights-engine.ts`. The SQL is identical; what changes is
 * the output shape (canon `BusinessInsight` instead of legacy
 * `Insight`) and the action (canon `UnifiedAction` with create_cohort
 * primary + create_campaign secondary, both ready to deep-link into
 * pre-filled builders).
 *
 * Returns `null` when no qualifying members exist — the upsert layer
 * will resolve any active row with the same dedupeKey on that pass.
 */
export async function pilotNewMemberOnboarding(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  // Same SQL as legacy `newMemberOnboarding` — first booking landed in
  // the last 30 days, ≤2 total bookings, member is Active. We mirror
  // the legacy query (not refactor it) so the new engine produces
  // identical data; tweaks land in their own commits with diff visibility.
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH first_play AS (
      SELECT
        b."userId",
        MIN(ps.date) AS "firstPlayed",
        COUNT(*) AS "totalBookings"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    )
    SELECT
      fp."userId",
      fp."firstPlayed" AS "joinDate",
      fp."totalBookings" AS "bookingCount"
    FROM first_play fp
    JOIN club_followers cf ON cf.user_id::text = fp."userId"::text AND cf.club_id = $1
    JOIN users u ON u.id::text = fp."userId"::text
    WHERE fp."firstPlayed" >= NOW() - INTERVAL '30 days'
      AND fp."totalBookings" <= 2
      AND u.membership_status = 'Active'
    `,
    clubId,
  )) as Array<{ userId: string; joinDate: Date; bookingCount: number | bigint }>

  if (!rows || rows.length === 0) return null

  const neverPlayed = rows.filter(r => Number(r.bookingCount) === 0).length
  const total = rows.length

  return {
    dedupeKey: 'new_member_onboarding',
    category: 'retention',
    severity: total >= 5 ? 'high' : 'medium',

    analysis:
      `${total} new member${total > 1 ? 's' : ''} joined in the last 30 days ` +
      `with only 0-2 bookings each.` +
      (neverPlayed > 0
        ? ` ${neverPlayed} of them haven't played at all yet.`
        : ''),

    metrics: {
      newMembersNeedingFollowup: total,
      neverPlayed,
    },

    insight:
      'Habit does not form in the first month — this is the critical ' +
      'retention window. Members who do not log 3+ bookings in their ' +
      'first 30 days are 4× more likely to churn before month 3.',

    action: {
      primary: {
        type: 'create_cohort',
        label: 'Create "Cold onboarding" cohort',
        cohortRules: [
          { field: 'joinedDaysAgo', op: 'lt', value: 30 },
          { field: 'frequency', op: 'lte', value: 2 },
        ],
      },
      secondary: [
        {
          type: 'create_campaign',
          label: 'Launch onboarding sequence',
          templateKey: 'cold_onboarding',
        },
      ],
    },
  }
}

/**
 * Generator 2 — underutilized courts (≥2 courts, ≥1 under 25% occupancy).
 *
 * Action: `programming` — operator decides whether to consolidate
 * sessions onto busier courts or to add new programming to the quiet
 * ones. Prefill carries the worst court's id so the Programming IQ
 * page can preselect the slot.
 */
export async function pilotUnderutilizedCourts(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH scheduled_slots AS (
      SELECT cc.id AS "courtId", cc.name AS "courtName",
             COUNT(DISTINCT (ps.date::date || '-' || ps."startTime"::text)) AS "totalSlots"
      FROM play_sessions ps
      JOIN club_courts cc ON cc.id = ps."courtId"
      WHERE ps."clubId" = $1
        AND ps.date >= NOW() - INTERVAL '30 days'
        AND ps.date <= NOW()
      GROUP BY cc.id, cc.name
    ),
    booked_slots AS (
      SELECT ps."courtId",
             COUNT(DISTINCT (ps.date::date || '-' || ps."startTime"::text)) AS "bookedSlots"
      FROM play_sessions ps
      JOIN play_session_bookings b ON b."sessionId" = ps.id
      WHERE ps."clubId" = $1
        AND ps.date >= NOW() - INTERVAL '30 days'
        AND ps.date <= NOW()
        AND b.status::text = 'CONFIRMED'
      GROUP BY ps."courtId"
    )
    SELECT ss."courtId", ss."courtName",
           COALESCE(bs."bookedSlots", 0) AS "bookedSlots",
           ss."totalSlots",
           ROUND(COALESCE(bs."bookedSlots", 0)::numeric / ss."totalSlots" * 100, 1) AS "occupancyPct"
    FROM scheduled_slots ss
    LEFT JOIN booked_slots bs ON bs."courtId" = ss."courtId"
    WHERE ss."totalSlots" > 0
    ORDER BY ss."courtName" ASC
    `,
    clubId,
  )) as Array<{ courtId: string; courtName: string; occupancyPct: number }>

  if (!rows || rows.length < 2) return null
  const underused = rows.filter(r => Number(r.occupancyPct) < 25)
  if (underused.length === 0) return null
  const busiest = rows.reduce((a, b) =>
    Number(a.occupancyPct) > Number(b.occupancyPct) ? a : b,
  )
  const worst = underused[0]

  return {
    dedupeKey: 'underutilized_courts',
    category: 'optimization',
    severity: 'medium',
    analysis:
      `${underused.length} court${underused.length > 1 ? 's' : ''} averaged ` +
      `below 25% occupancy in the last 30 days. ${worst.courtName} is at ` +
      `${Number(worst.occupancyPct)}% vs ${busiest.courtName} at ${Number(busiest.occupancyPct)}%.`,
    metrics: {
      underutilizedCourts: underused.length,
      lowestOccupancyPct: Number(worst.occupancyPct),
      highestOccupancyPct: Number(busiest.occupancyPct),
    },
    insight:
      'Spread of court demand widens revenue gap — quiet courts consume ' +
      'maintenance + cleaning + utilities while paying members crowd ' +
      'onto a handful. Consolidate or programme.',
    action: {
      primary: {
        type: 'programming',
        label: 'Re-programme underutilised courts',
        params: { courtId: worst.courtId, hint: 'underutilised' },
      },
    },
  }
}

/**
 * Generator 3 — peak hour overflow (≥1 hour over 80% occupancy).
 *
 * Action: `programming` — operator opens a parallel slot at the same
 * hour to capture unmet demand.
 */
export async function pilotPeakHourOverflow(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT EXTRACT(HOUR FROM ps.date) AS hour,
           COUNT(*) AS "sessionCount",
           SUM(COALESCE(ps."registered_count", 0)) AS "totalBooked",
           SUM(ps."maxPlayers") AS "totalCapacity",
           ROUND(SUM(COALESCE(ps."registered_count", 0))::numeric / NULLIF(SUM(ps."maxPlayers"), 0) * 100, 1) AS "occupancyPct"
    FROM play_sessions ps
    WHERE ps."clubId" = $1
      AND ps.date >= NOW() - INTERVAL '30 days'
      AND ps.date <= NOW()
      AND ps.status::text != 'CANCELLED'
    GROUP BY EXTRACT(HOUR FROM ps.date)
    HAVING SUM(ps."maxPlayers") > 0
    ORDER BY "occupancyPct" DESC
    `,
    clubId,
  )) as Array<{ hour: number; occupancyPct: number }>

  if (!rows || rows.length === 0) return null
  const overflow = rows.filter(r => Number(r.occupancyPct) > 80)
  if (overflow.length === 0) return null

  const peakHour = Number(overflow[0].hour)
  const peakPct = Number(overflow[0].occupancyPct)
  const label = peakHour <= 12 ? `${peakHour}AM` : `${peakHour - 12}PM`

  return {
    dedupeKey: `peak_overflow:${peakHour}`,
    category: 'growth',
    severity: 'high',
    analysis:
      `${overflow.length} hour-slot${overflow.length > 1 ? 's' : ''} averaged ` +
      `over 80% occupancy across the last 30 days. Peak is ${label} at ${peakPct}%.`,
    metrics: {
      overflowSlots: overflow.length,
      peakHour,
      peakOccupancyPct: peakPct,
    },
    insight:
      'Sustained overflow = real unmet demand. Members who couldn\'t book ' +
      'their preferred slot churn fastest. A parallel slot at the same hour ' +
      'often pays back within 2 weeks.',
    action: {
      primary: {
        type: 'programming',
        label: 'Open parallel slot at peak hour',
        params: { startHour: peakHour, hint: 'parallel_to_existing' },
      },
    },
  }
}

/**
 * Generator 4 — empty evening slots (<50% avg after 7 PM).
 *
 * Action: `programming` — operator launches a social or league night
 * to fill weeknight evenings.
 */
export async function pilotEmptyEveningSlots(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT COUNT(*) AS "totalEvening",
           AVG(COALESCE(ps."registered_count", 0)::numeric / NULLIF(ps."maxPlayers", 0) * 100) AS "avgOccupancy",
           SUM(ps."maxPlayers" - COALESCE(ps."registered_count", 0)) AS "emptySlots"
    FROM play_sessions ps
    WHERE ps."clubId" = $1
      AND ps.date >= NOW() - INTERVAL '30 days'
      AND ps.date <= NOW()
      AND EXTRACT(HOUR FROM ps.date) >= 19
      AND ps.status::text != 'CANCELLED'
    `,
    clubId,
  )) as Array<{ totalEvening: bigint; avgOccupancy: number; emptySlots: bigint }>

  if (!rows || rows.length === 0) return null
  const r = rows[0]
  const totalEvening = Number(r.totalEvening)
  const avgOcc = Number(r.avgOccupancy)
  const emptySlots = Number(r.emptySlots)
  if (totalEvening < 3 || avgOcc > 50) return null

  return {
    dedupeKey: 'empty_evenings',
    category: 'optimization',
    severity: emptySlots > 50 ? 'medium' : 'low',
    analysis:
      `${totalEvening} evening sessions (after 7 PM) in the last 30 days ` +
      `averaged ${Math.round(avgOcc)}% occupancy with ${emptySlots} empty ` +
      `player slots.`,
    metrics: {
      eveningSessions: totalEvening,
      avgEveningOccupancyPct: Math.round(avgOcc),
      emptyPlayerSlots: emptySlots,
    },
    insight:
      'Evenings are the largest after-hours revenue surface and the most ' +
      'community-building time of day. Social leagues + themed nights ' +
      'consistently double evening fill in 3-4 weeks.',
    action: {
      primary: {
        type: 'programming',
        label: 'Launch evening social / league',
        params: { startHour: 19, hint: 'evening_social' },
      },
    },
  }
}

/**
 * Generator 5 — format mismatch (one format <30% while another >75%).
 *
 * Action: `programming` — operator converts low-demand slots to the
 * high-demand format/skill combo.
 */
export async function pilotFormatMismatch(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT ps."skillLevel"::text AS "skillLevel",
           ps.format::text AS format,
           COUNT(*) AS "sessionCount",
           AVG(COALESCE(ps."registered_count", 0)::numeric / NULLIF(ps."maxPlayers", 0) * 100) AS "avgOccupancy"
    FROM play_sessions ps
    WHERE ps."clubId" = $1
      AND ps.date >= NOW() - INTERVAL '30 days'
      AND ps.date <= NOW()
      AND ps.status::text != 'CANCELLED'
    GROUP BY ps."skillLevel"::text, ps.format::text
    HAVING COUNT(*) >= 3
    ORDER BY "avgOccupancy" ASC
    `,
    clubId,
  )) as Array<{
    skillLevel: string
    format: string
    sessionCount: bigint
    avgOccupancy: number
  }>

  if (!rows || rows.length < 2) return null
  const empty = rows.filter(r => Number(r.avgOccupancy) < 30)
  const full = rows.filter(r => Number(r.avgOccupancy) > 75)
  if (empty.length === 0 || full.length === 0) return null

  const lo = empty[0]
  const hi = full[full.length - 1]
  const loLabel = `${lo.skillLevel} ${lo.format}`
  const hiLabel = `${hi.skillLevel} ${hi.format}`

  return {
    dedupeKey: `format_mismatch:${lo.skillLevel}-${lo.format}->${hi.skillLevel}-${hi.format}`,
    category: 'optimization',
    severity: 'medium',
    analysis:
      `${loLabel} sessions averaged ${Math.round(Number(lo.avgOccupancy))}% ` +
      `occupancy while ${hiLabel} ran at ${Math.round(Number(hi.avgOccupancy))}%.`,
    metrics: {
      lowOccupancyPct: Math.round(Number(lo.avgOccupancy)),
      highOccupancyPct: Math.round(Number(hi.avgOccupancy)),
      lowDemandSessions: Number(lo.sessionCount),
      highDemandSessions: Number(hi.sessionCount),
    },
    insight:
      'You\'re paying for capacity in the wrong format/skill combo. ' +
      'Converting empty slots to the over-demanded combination is a ' +
      'zero-cost revenue move.',
    action: {
      primary: {
        type: 'programming',
        label: `Convert ${loLabel} slots to ${hiLabel}`,
        params: {
          from: { skillLevel: lo.skillLevel, format: lo.format },
          to: { skillLevel: hi.skillLevel, format: hi.format },
        },
      },
    },
  }
}

/**
 * Generator 6 — day-of-week gap (≥20pp spread between quietest and busiest day).
 *
 * Action: `programming` — operator runs a promo or social event on the
 * quietest day to balance the week.
 */
export async function pilotDayOfWeekGap(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT TO_CHAR(ps.date, 'Day') AS "dayName",
           EXTRACT(DOW FROM ps.date) AS "dayNum",
           COUNT(*) AS "sessionCount",
           SUM(COALESCE(ps."registered_count", 0)) AS "totalBooked",
           SUM(ps."maxPlayers") AS "totalCapacity",
           ROUND(SUM(COALESCE(ps."registered_count", 0))::numeric / NULLIF(SUM(ps."maxPlayers"), 0) * 100, 1) AS "occupancyPct"
    FROM play_sessions ps
    WHERE ps."clubId" = $1
      AND ps.date >= NOW() - INTERVAL '30 days'
      AND ps.date <= NOW()
      AND ps.status::text != 'CANCELLED'
    GROUP BY TO_CHAR(ps.date, 'Day'), EXTRACT(DOW FROM ps.date)
    HAVING SUM(ps."maxPlayers") > 0
    ORDER BY "occupancyPct" ASC
    `,
    clubId,
  )) as Array<{ dayName: string; dayNum: number; occupancyPct: number }>

  if (!rows || rows.length < 2) return null
  const quietest = rows[0]
  const busiest = rows[rows.length - 1]
  const gap = Number(busiest.occupancyPct) - Number(quietest.occupancyPct)
  if (gap < 20) return null

  const quietDay = String(quietest.dayName).trim()
  const busyDay = String(busiest.dayName).trim()

  return {
    dedupeKey: `dow_gap:${quietest.dayNum}->${busiest.dayNum}`,
    category: 'optimization',
    severity: gap > 40 ? 'high' : 'medium',
    analysis:
      `${quietDay} averaged ${Number(quietest.occupancyPct)}% occupancy vs ` +
      `${Number(busiest.occupancyPct)}% on ${busyDay} — a ${Math.round(gap)}pp gap.`,
    metrics: {
      quietestDayOccupancyPct: Number(quietest.occupancyPct),
      busiestDayOccupancyPct: Number(busiest.occupancyPct),
      gapPercentagePoints: Math.round(gap),
    },
    insight:
      `Members default to busy days because that's where their friends ` +
      `play. A targeted social event or themed clinic on ${quietDay} ` +
      `starts compounding new habits inside one month.`,
    action: {
      primary: {
        type: 'programming',
        label: `Programme a draw on ${quietDay}`,
        params: { dayOfWeek: Number(quietest.dayNum), hint: 'rebalance_week' },
      },
    },
  }
}

/**
 * Generator 7 — guest-pass conversion candidates (≥5 bookings in 30d).
 *
 * Action: `create_cohort` matching the guests + `create_campaign`
 * (templateKey 'guest_to_member'). Uses the `membershipType contains`
 * filter — cohortFilterSchema supports the `contains` operator on
 * `membershipType` field (see §5.4).
 */
export async function pilotGuestPassUpsell(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH guest_members AS (
      SELECT u.id AS "userId", u.membership_type AS membership
      FROM users u
      JOIN club_followers cf ON cf.user_id = u.id
      WHERE cf.club_id = $1
        AND u.membership_status = 'Active'
        AND (
          u.membership_type ILIKE '%guest%'
          OR u.membership_type ILIKE '%pay per%'
          OR u.membership_type ILIKE '%drop%in%'
          OR u.membership_type ILIKE '%trial%'
        )
    ),
    booking_counts AS (
      SELECT b."userId", COUNT(*) AS "bookingCount"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1
        AND ps.date >= NOW() - INTERVAL '30 days'
        AND ps.date <= NOW()
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    )
    SELECT g."userId", g.membership, bc."bookingCount"
    FROM guest_members g
    JOIN booking_counts bc ON bc."userId" = g."userId"
    WHERE bc."bookingCount" >= 5
    ORDER BY bc."bookingCount" DESC
    `,
    clubId,
  )) as Array<{ userId: string; membership: string; bookingCount: number | bigint }>

  if (!rows || rows.length === 0) return null
  const avg = Math.round(
    rows.reduce((s, r) => s + Number(r.bookingCount), 0) / rows.length,
  )

  return {
    dedupeKey: 'guest_pass_upsell',
    category: 'growth',
    severity: 'high',
    analysis:
      `${rows.length} Guest Pass holder${rows.length > 1 ? 's' : ''} averaged ` +
      `${avg}+ bookings in the last 30 days — they're behaving like members ` +
      `already.`,
    metrics: {
      readyToConvert: rows.length,
      avgBookings: avg,
    },
    insight:
      'Guests at this booking volume have effectively converted in their ' +
      'heads — they just need the offer. A targeted "you played 5+ times, ' +
      'here\'s 15% off your first month" closes the gap.',
    action: {
      primary: {
        type: 'create_cohort',
        label: 'Frequent guest cohort',
        cohortRules: [
          { field: 'membershipType', op: 'contains', value: 'guest' },
          { field: 'frequency', op: 'gte', value: 5 },
        ],
      },
      secondary: [
        {
          type: 'create_campaign',
          label: 'Guest → Member offer',
          templateKey: 'guest_to_member',
        },
      ],
    },
  }
}

/**
 * Generator 8 — skill progression (BEGINNER → INTERMEDIATE/ADVANCED).
 *
 * Action: `create_cohort` for progressed members + secondary
 * `create_campaign` (templateKey 'level_up_offer'). We don't push the new
 * rating back to CourtReserve — the integration is read-only — so updating
 * the rating stays a manual step the operator does in CR.
 */
export async function pilotSkillProgression(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH member_levels AS (
      SELECT b."userId",
             ps."skillLevel"::text AS "skillLevel",
             ps.date,
             ROW_NUMBER() OVER (PARTITION BY b."userId" ORDER BY ps.date ASC) AS rn_first,
             ROW_NUMBER() OVER (PARTITION BY b."userId" ORDER BY ps.date DESC) AS rn_last
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1
        AND b.status::text = 'CONFIRMED'
        AND ps."skillLevel"::text IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')
    ),
    first_level AS (
      SELECT "userId", "skillLevel" AS "firstLevel" FROM member_levels WHERE rn_first = 1
    ),
    last_level AS (
      SELECT "userId", "skillLevel" AS "lastLevel" FROM member_levels WHERE rn_last = 1
    )
    SELECT fl."userId", fl."firstLevel", ll."lastLevel"
    FROM first_level fl
    JOIN last_level ll ON ll."userId" = fl."userId"
    WHERE fl."firstLevel" = 'BEGINNER' AND ll."lastLevel" IN ('INTERMEDIATE', 'ADVANCED')
    `,
    clubId,
  )) as Array<{ userId: string; firstLevel: string; lastLevel: string }>

  if (!rows || rows.length === 0) return null
  const toAdvanced = rows.filter(r => r.lastLevel === 'ADVANCED').length

  return {
    dedupeKey: 'skill_progression',
    category: 'growth',
    severity: 'low',
    analysis:
      `${rows.length} member${rows.length > 1 ? 's' : ''} started at Beginner ` +
      `and now play at ${toAdvanced > 0 ? 'Intermediate/Advanced' : 'Intermediate'} ` +
      `level.`,
    metrics: {
      progressedMembers: rows.length,
      reachedAdvanced: toAdvanced,
    },
    insight:
      'Acknowledging skill growth builds loyalty + drives word-of-mouth ' +
      'to other beginners. Members who reach intermediate within the first ' +
      'year renew at ~2× the baseline rate.',
    action: {
      primary: {
        type: 'create_cohort',
        label: 'Progressed players cohort',
        cohortRules: [
          { field: 'skillLevel', op: 'in', value: ['INTERMEDIATE', 'ADVANCED'] },
        ],
      },
      secondary: [
        {
          type: 'create_campaign',
          label: 'Celebrate + invite to advanced programme',
          templateKey: 'level_up_offer',
        },
      ],
    },
  }
}

/**
 * Generator 9 — high-value reactivation candidates.
 *
 * Per DASHBOARD_AND_ACTION_CENTER_SPEC.md v1.2 §3.7 + §7.4 — this is one
 * of the two insights spawned by the Customer Health Overview cleanup
 * (v1.3). The inline "Reactivation >" button is gone; the action now
 * lives here as a canonical insight, scoped to *high-value* churned
 * members, not the whole churned bucket.
 *
 * Selection:
 *   - Last CONFIRMED booking ≥ 45 days ago (churned)
 *   - membership_type matches VIP / Premium / Unlimited (Spec §7.2)
 *   - membership_status = 'Active' (the subscription is still live —
 *     they paused playing, not paid; reactivation is a value capture,
 *     not net-new acquisition)
 *   - First booking ≥ 365 days ago (long-tenure — there's a habit to
 *     restart, not a brand-new sign-up to nurture)
 *
 * Returns null when no qualifying members exist.
 */
export async function pilotHighValueReactivation(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH last_play AS (
      SELECT b."userId", MAX(ps.date) AS last_played
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    ),
    first_play AS (
      SELECT b."userId", MIN(ps.date) AS first_played
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    )
    SELECT lp."userId"
    FROM last_play lp
    JOIN first_play fp ON fp."userId" = lp."userId"
    JOIN club_followers cf
      ON cf.user_id::text = lp."userId"::text
     AND cf.club_id = $1
    JOIN users u ON u.id::text = lp."userId"::text
    WHERE lp.last_played <= NOW() - INTERVAL '45 days'
      AND (
        u.membership_type ILIKE '%VIP%'
        OR u.membership_type ILIKE '%Premium%'
        OR u.membership_type ILIKE '%Unlimited%'
      )
      AND u.membership_status = 'Active'
      AND fp.first_played <= NOW() - INTERVAL '365 days'
    `,
    clubId,
  )) as Array<{ userId: string }>

  if (!rows || rows.length === 0) return null
  const total = rows.length

  return {
    dedupeKey: 'high_value_reactivation',
    category: 'retention',
    severity: total >= 5 ? 'high' : 'medium',

    analysis:
      `${total} long-tenure Premium / VIP / Unlimited member${total > 1 ? 's are' : ' is'} ` +
      `45+ days inactive — the subscription is still active, but the habit lapsed.`,

    metrics: {
      highValueChurned: total,
    },

    insight:
      'High-value churn beats acquisition on ROI by a wide margin — the ' +
      'subscription is paid, the brand familiarity is there, and the ' +
      'switching cost is low. Reactivating these members costs an email; ' +
      'replacing them costs a quarter of CAC each.',

    action: {
      primary: {
        type: 'create_campaign',
        label: 'Launch targeted winback for high-value lapsed members',
        templateKey: 'high_value_winback',
      },
      secondary: [
        {
          type: 'create_cohort',
          label: 'High-value lapsed cohort',
          cohortRules: [
            { field: 'recency', op: 'gt', value: 45 },
            { field: 'valueTier', op: 'eq', value: 'high' },
          ],
        },
      ],
    },
  }
}

/**
 * Generator 10 — dormant activation (registered, never played).
 *
 * Per DASHBOARD_AND_ACTION_CENTER_SPEC.md v1.2 §3.7 + §7.4 — second
 * canonical insight that replaces the legacy "Create Activation Cohort >"
 * inline button on Customer Health Overview.
 *
 * Selection:
 *   - Member of the club (entry in club_followers)
 *   - No CONFIRMED booking ever
 *   - Followed the club ≥ 1 day ago (give them a calendar day's grace)
 *   - membership_status = 'Active' (paying, just not showing up — perfect
 *     activation target; cancelled members go through a different funnel)
 *
 * Returns null when no qualifying members exist.
 */
export async function pilotDormantActivation(
  prisma: PrismaClient,
  clubId: string,
): Promise<BusinessInsight | null> {
  // EXCLUDE guest / drop-in / pay-per-play tiers — those members are in
  // the system to drop in occasionally at non-member rates, not to
  // become regulars. They will dominate the dormant pool by an order
  // of magnitude (e.g. IPC North on prod: 9,423 of 10,235 "dormant"
  // were guest-pass holders, only ~640 were paying subscribers).
  // Surfacing them here mixes apples and oranges and tells the operator
  // to chase 10K contacts when only 640 are real activation targets.
  // Guests get their own insight (or no insight — they're behaving as
  // designed). Surface only members on a recurring tier here.
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH played AS (
      SELECT DISTINCT b."userId"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1
        AND b.status::text = 'CONFIRMED'
    )
    SELECT cf.user_id AS "userId"
    FROM club_followers cf
    JOIN users u ON u.id::text = cf.user_id::text
    LEFT JOIN played p ON p."userId" = cf.user_id::text
    WHERE cf.club_id = $1
      AND p."userId" IS NULL
      AND cf.created_at <= NOW() - INTERVAL '1 day'
      AND u.membership_status = 'Active'
      AND COALESCE(u.membership_type, '') NOT ILIKE '%guest%'
      AND COALESCE(u.membership_type, '') NOT ILIKE '%pay per play%'
      AND COALESCE(u.membership_type, '') NOT ILIKE '%drop%in%'
    `,
    clubId,
  )) as Array<{ userId: string }>

  if (!rows || rows.length === 0) return null
  const total = rows.length

  return {
    dedupeKey: 'dormant_activation',
    category: 'growth',
    severity: total >= 10 ? 'high' : 'medium',

    analysis:
      `${total} paying subscriber${total > 1 ? 's' : ''} signed up but ` +
      `${total > 1 ? "haven't" : "hasn't"} booked a single session yet — ` +
      `they're paying every month for a court they never use.`,

    metrics: {
      dormantPayingSubscribers: total,
    },

    insight:
      'Subscription dormancy is the silent revenue cliff — these members ' +
      'pay every month for a court they never use, and they\'re the most ' +
      'likely tier to cancel without warning. Members who don\'t book in ' +
      'their first 30 days convert at roughly half the rate of those who ' +
      'do; after 90 days the window shuts and a stronger intervention is ' +
      'needed. Targeted "we noticed you haven\'t played yet — here\'s a ' +
      'session your skill cohort books" closes the gap on first visit.',

    action: {
      primary: {
        type: 'create_cohort',
        label: 'Create "Never played" activation cohort',
        cohortRules: [
          { field: 'frequency', op: 'eq', value: 0 },
          { field: 'joinedDaysAgo', op: 'gte', value: 1 },
        ],
      },
      secondary: [
        {
          type: 'create_campaign',
          label: 'Launch first-visit activation sequence',
          templateKey: 'first_visit_activation',
        },
      ],
    },
  }
}

// ─── Run + persist (the upsert layer) ───────────────────────────────────

/**
 * Returned by `runBusinessInsights` so callers (cron + manual refresh)
 * can show a tiny audit summary.
 */
export interface RunReport {
  generated: number
  inserted: number
  refreshed: number
  resolved: number
}

/**
 * Run every active generator for `clubId`, then reconcile DB with the
 * result set via the upsert pattern from Spec §6.2:
 *
 *   - new (no active row matches dedupeKey)        → INSERT
 *   - matched, condition still true                → UPDATE last_seen_at
 *   - matched in DB, generator returned null today → resolve (status='resolved')
 *
 * `id` is generated locally so we can guarantee uniqueness without a
 * server-side default — keeps the table portable across DB engines.
 */
export async function runBusinessInsights(
  prisma: PrismaClient,
  clubId: string,
): Promise<RunReport> {
  // Add new generators to this list. Each must return BusinessInsight |
  // null and use a stable dedupeKey scoped per-club (clubId is included
  // separately in the partial unique index).
  //
  // 10 canon-migrated generators (8 from Step 9 + 2 from v1.3 cleanup —
  // Customer Health Overview is now metrics-only, so the inline
  // "Reactivation >" / "Create Activation Cohort >" buttons were
  // re-homed as canonical insights here: pilotHighValueReactivation
  // (targeted, not whole churned bucket) and pilotDormantActivation
  // (registered, never played).
  //
  // Remaining legacy functions in lib/ai/insights-engine.ts:
  // vipMembersAtRisk (per-member signals move to Action Center — Step 18;
  // aggregation already covered by getVipAtRiskPercent in Step 7) and
  // suspendedWinback (per-membership signals move to Action Center —
  // Step 16). The legacy file continues to serve those two via
  // getClubInsights until Action Center ships.
  const generators: Array<
    (p: PrismaClient, c: string) => Promise<BusinessInsight | null>
  > = [
    pilotNewMemberOnboarding,
    pilotUnderutilizedCourts,
    pilotPeakHourOverflow,
    pilotEmptyEveningSlots,
    pilotFormatMismatch,
    pilotDayOfWeekGap,
    pilotGuestPassUpsell,
    pilotSkillProgression,
    pilotHighValueReactivation,
    pilotDormantActivation,
  ]

  const produced: BusinessInsight[] = []
  for (const fn of generators) {
    const result = await fn(prisma, clubId)
    if (result) produced.push(result)
  }

  const producedKeys = new Set(produced.map(p => p.dedupeKey))

  // Existing actionable (active or snoozed) rows for this club.
  const existing = (await prisma.$queryRawUnsafe(
    `
    SELECT id, dedupe_key
    FROM business_insight
    WHERE club_id = $1
      AND status IN ('active', 'snoozed')
    `,
    clubId,
  )) as Array<{ id: string; dedupe_key: string }>

  const existingByKey = new Map(existing.map(r => [r.dedupe_key, r.id]))

  let inserted = 0
  let refreshed = 0
  let resolved = 0
  const now = new Date()

  // Reconcile: insert new, refresh matched.
  for (const ins of produced) {
    const existingId = existingByKey.get(ins.dedupeKey)
    if (existingId) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE business_insight
        SET analysis = $1,
            metrics = $2::jsonb,
            insight = $3,
            action = $4::jsonb,
            severity = $5,
            last_seen_at = $6
        WHERE id = $7
        `,
        ins.analysis,
        JSON.stringify(ins.metrics),
        ins.insight,
        JSON.stringify(ins.action),
        ins.severity,
        now,
        existingId,
      )
      refreshed++
    } else {
      const id = `bi_${ins.dedupeKey}_${now.getTime()}`
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO business_insight (
          id, club_id, dedupe_key, category, severity,
          analysis, metrics, insight, action,
          status, created_at, last_seen_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7::jsonb, $8, $9::jsonb,
          'active', $10, $10
        )
        `,
        id,
        clubId,
        ins.dedupeKey,
        ins.category,
        ins.severity,
        ins.analysis,
        JSON.stringify(ins.metrics),
        ins.insight,
        JSON.stringify(ins.action),
        now,
      )
      inserted++
    }
  }

  // Auto-resolve insights that were active but the generator no longer
  // produces them (condition resolved on its own).
  for (const row of existing) {
    if (!producedKeys.has(row.dedupe_key)) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE business_insight
        SET status = 'resolved', resolved_at = $1
        WHERE id = $2
        `,
        now,
        row.id,
      )
      resolved++
    }
  }

  return { generated: produced.length, inserted, refreshed, resolved }
}
