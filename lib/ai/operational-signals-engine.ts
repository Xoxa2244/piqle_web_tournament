/**
 * Operational Signals Engine (canon-driven).
 *
 * Mirror of `business-insights-engine.ts` but for the per-subject feed
 * in the Action Center — see DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.3 +
 * §6.2 + §7.1.
 *
 * Where a Business Insight is at most 1 row per (club, slug), an
 * Operational Signal is 0..N rows per (club, slug) — one per affected
 * subject (member / session / league family). The dedupe key folds the
 * subject id in:
 *
 *   "${ruleKey}:${locationId ?? 'global'}:${subjectId ?? 'none'}"
 *
 * Step 16 ships two sources:
 *   - member_health        → per-member drop / risk-transition alerts
 *   - membership_lifecycle → per-member suspended / trial / renewal cases
 *
 * Steps 17-18 add scorecard_execution, league_gap, vip_at_risk; they all
 * plug into `runOperationalSignals` via the same `generators` array.
 */

import type { PrismaClient } from '@prisma/client'

import { normalizeMembership } from './membership-intelligence'
import type { UnifiedAction } from './business-insights-engine'
import { isEquipmentBooking } from './programming-tier-classifier'
import {
  classifyProgrammingTierWithRules,
  loadClubCustomRules,
} from './tier-classifier-extended'
import { detectLeagueFamily } from './league-family-detector'

// ─── Canon shape ────────────────────────────────────────────────────────

export type SignalSource =
  | 'member_health'
  | 'membership_lifecycle'
  | 'scorecard_execution'
  | 'league_gap'
  | 'vip_at_risk'

export type SignalSeverity = 'critical' | 'warning' | 'nudge'

/** OperationalSignal matches the `operational_signal` table 1:1. */
export interface OperationalSignal {
  /** Per-(club, ruleKey, locationId, subjectId) — partial unique index key. */
  dedupeKey: string
  source: SignalSource
  /** Stable per-rule slug — survives subject changes (drives dedupe). */
  ruleKey: string
  /** userId | sessionId | leagueFamilyId — null for global signals. */
  subjectEntityId: string | null
  severity: SignalSeverity
  /** Operator-facing line (e.g. "Sarah Chen (VIP) — health dropped 24 in 7d"). */
  subject: string
  /** Scalar context fields surfaced as pills on the SignalCard. */
  context: Record<string, unknown>
  action: UnifiedAction
  /** Per-location signals only — leave null until multi-location rolls out. */
  locationId?: string | null
}

/**
 * Result of one `runOperationalSignals` pass — mirrors `RunReport` from
 * business-insights-engine.ts so call sites (cron + manual refresh) can
 * surface a tiny audit summary.
 */
export interface RunReport {
  generated: number
  inserted: number
  refreshed: number
  resolved: number
}

// ─── Generator 1 — Member Health deltas (Spec §6.4) ─────────────────────

/**
 * Member Health drop / risk-transition alerts.
 *
 * Source: `member_health_snapshots` (populated daily by
 * `/api/cron/health-snapshot`). We compare each member's most-recent
 * snapshot to their snapshot from ~7 days ago and emit:
 *
 *   - `health_score_drop` — absolute drop ≥ 20 pts in 7 days
 *     • critical when drop ≥ 35
 *     • warning  when drop ≥ 20
 *   - `risk_transition`  — segment transition healthy→watch / watch→at_risk / at_risk→critical
 *     • critical when transition is *_→critical or at_risk→critical
 *     • warning  when watch→at_risk
 *     • nudge    when healthy→watch
 *
 * A single member can produce both signal types in the same pass; they
 * use distinct ruleKeys so the partial unique index doesn't collide.
 */
export async function memberHealthDeltas(
  prisma: PrismaClient,
  clubId: string,
): Promise<OperationalSignal[]> {
  // Latest + previous (closest to 7 days ago) snapshot per member. We
  // sample within 5-9 days to tolerate cron skew; LATERAL keeps it
  // single-pass.
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH latest AS (
      SELECT DISTINCT ON (m."user_id")
        m."user_id"        AS "userId",
        m."health_score"   AS "score",
        m."risk_level"     AS "risk",
        m.date             AS "date"
      FROM member_health_snapshots m
      WHERE m."club_id" = $1
        AND m.date >= NOW() - INTERVAL '2 days'
      ORDER BY m."user_id", m.date DESC
    ),
    prior AS (
      SELECT DISTINCT ON (m."user_id")
        m."user_id"        AS "userId",
        m."health_score"   AS "score",
        m."risk_level"     AS "risk",
        m.date             AS "date"
      FROM member_health_snapshots m
      WHERE m."club_id" = $1
        AND m.date BETWEEN NOW() - INTERVAL '9 days' AND NOW() - INTERVAL '5 days'
      ORDER BY m."user_id", m.date DESC
    )
    SELECT l."userId",
           l."score"      AS "currentScore",
           l."risk"       AS "currentRisk",
           p."score"      AS "priorScore",
           p."risk"       AS "priorRisk",
           u.name         AS "memberName",
           u.email        AS "memberEmail",
           u.membership_type AS "membershipType"
    FROM latest l
    JOIN prior  p ON p."userId" = l."userId"
    JOIN users  u ON u.id::text = l."userId"::text
    WHERE u.email NOT LIKE '%placeholder%'
      AND u.email NOT LIKE '%demo%'
    `,
    clubId,
  )) as Array<{
    userId: string
    currentScore: number
    currentRisk: string
    priorScore: number
    priorRisk: string
    memberName: string | null
    memberEmail: string | null
    membershipType: string | null
  }>

  if (!rows || rows.length === 0) return []

  const out: OperationalSignal[] = []

  // Risk severity rank so we can detect a "downgrade" in either order
  // the labels appear in.
  const RISK_RANK: Record<string, number> = {
    healthy: 0,
    watch: 1,
    at_risk: 2,
    critical: 3,
  }

  for (const r of rows) {
    const name = r.memberName?.trim() || r.memberEmail?.trim() || 'Member'
    const cur = Number(r.currentScore)
    const prior = Number(r.priorScore)
    const drop = prior - cur

    // ── Signal A: health-score drop ────────────────────────────────
    if (drop >= 20) {
      const severity: SignalSeverity = drop >= 35 ? 'critical' : 'warning'
      out.push({
        dedupeKey: `health_score_drop:global:${r.userId}`,
        source: 'member_health',
        ruleKey: 'health_score_drop',
        subjectEntityId: r.userId,
        severity,
        subject:
          `${name} — health score dropped ${Math.round(drop)} pts ` +
          `(${prior} → ${cur}) in 7 days`,
        context: {
          memberName: name,
          priorScore: prior,
          currentScore: cur,
          dropPts: Math.round(drop),
          riskLevel: r.currentRisk,
        },
        action: {
          primary: {
            type: 'create_campaign',
            label: 'Send personal check-in',
            templateKey: 'health_drop_checkin',
          },
          secondary: [
            {
              type: 'create_cohort',
              label: 'Add to "Health dropping fast" cohort',
              cohortRules: [
                { field: 'userId', op: 'eq', value: r.userId },
              ],
            },
          ],
        },
      })
    }

    // ── Signal B: risk-segment transition (downgrade only) ─────────
    const curRank = RISK_RANK[r.currentRisk] ?? -1
    const priorRank = RISK_RANK[r.priorRisk] ?? -1
    if (curRank > priorRank && curRank >= 1) {
      // A meaningful downgrade. healthy→watch is nudge; watch→at_risk
      // is warning; anything→critical (or at_risk→critical) is critical.
      let severity: SignalSeverity = 'nudge'
      if (r.currentRisk === 'critical') severity = 'critical'
      else if (r.currentRisk === 'at_risk') severity = 'warning'

      out.push({
        dedupeKey: `risk_transition:global:${r.userId}`,
        source: 'member_health',
        ruleKey: 'risk_transition',
        subjectEntityId: r.userId,
        severity,
        subject:
          `${name} — risk moved ${r.priorRisk} → ${r.currentRisk}`,
        context: {
          memberName: name,
          fromRisk: r.priorRisk,
          toRisk: r.currentRisk,
          currentScore: cur,
        },
        action: {
          primary: {
            type: 'create_campaign',
            label: 'Reactivation outreach',
            templateKey:
              r.currentRisk === 'critical'
                ? 'critical_winback'
                : 'at_risk_reengagement',
          },
        },
      })
    }
  }

  return out
}

// ─── Generator 2 — Membership lifecycle (Spec §4.3 row 2) ───────────────

/**
 * Per-member lifecycle alerts derived from `users.membership_status` +
 * booking activity. CR transactions are not yet synced into our DB, so
 * "Failed payment" is deferred — what we *can* surface today is:
 *
 *   - `suspended_recently_active` — Suspended but had bookings ≤ 30d ago
 *     (very high reactivation propensity → critical)
 *   - `trial_no_first_play`       — trial, joined 7-14d ago, 0 bookings
 *     (clean trial→drop signal → warning)
 *   - `renewal_at_risk`           — expired/cancelled + last play ≤ 21d
 *     (clean re-up moment → warning)
 *
 * Uses `normalizeMembership` so membership labels from different CR
 * locations map onto a common vocabulary (trial / expired / suspended /
 * cancelled / active / guest / unknown). Mappings come from automation
 * settings; we pass `undefined` here since the cron path has no UI
 * context, which falls through to default normalisation.
 */
export async function membershipLifecycleAlerts(
  prisma: PrismaClient,
  clubId: string,
): Promise<OperationalSignal[]> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT
      u.id                                                     AS "userId",
      u.name                                                   AS "memberName",
      u.email                                                  AS "memberEmail",
      u.membership_type                                        AS "membershipType",
      u.membership_status                                      AS "membershipStatus",
      cf.created_at                                            AS "followedAt",
      u.created_at                                             AS "userCreatedAt",
      MAX(ps.date) FILTER (WHERE b.status::text = 'CONFIRMED') AS "lastConfirmedBookingAt",
      COUNT(b.id) FILTER (WHERE b.status::text = 'CONFIRMED')  AS "confirmedBookings"
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    LEFT JOIN play_session_bookings b ON b."userId" = u.id
    LEFT JOIN play_sessions ps ON ps.id = b."sessionId" AND ps."clubId" = $1
    WHERE cf.club_id = $1
      AND u.email NOT LIKE '%placeholder%'
      AND u.email NOT LIKE '%demo%'
    GROUP BY
      u.id, u.name, u.email, u.membership_type, u.membership_status,
      cf.created_at, u.created_at
    `,
    clubId,
  )) as Array<{
    userId: string
    memberName: string | null
    memberEmail: string | null
    membershipType: string | null
    membershipStatus: string | null
    followedAt: Date | null
    userCreatedAt: Date | null
    lastConfirmedBookingAt: Date | null
    confirmedBookings: number | bigint
  }>

  if (!rows || rows.length === 0) return []

  const now = Date.now()
  const DAY = 86400_000
  const out: OperationalSignal[] = []

  for (const r of rows) {
    const name = r.memberName?.trim() || r.memberEmail?.trim() || 'Member'
    const normalized = normalizeMembership({
      membershipType: r.membershipType,
      membershipStatus: r.membershipStatus,
      membershipMappings: undefined,
    })
    const lastBookingAt = r.lastConfirmedBookingAt
      ? new Date(r.lastConfirmedBookingAt)
      : null
    const daysSinceLastBooking = lastBookingAt
      ? Math.floor((now - lastBookingAt.getTime()) / DAY)
      : null
    const joinedAt = r.followedAt
      ? new Date(r.followedAt)
      : r.userCreatedAt
        ? new Date(r.userCreatedAt)
        : null
    const daysSinceJoined = joinedAt
      ? Math.floor((now - joinedAt.getTime()) / DAY)
      : null
    const confirmed = Number(r.confirmedBookings)

    // ── Rule A: Suspended but recently active ──────────────────────
    if (
      normalized.normalizedStatus === 'suspended' &&
      daysSinceLastBooking !== null &&
      daysSinceLastBooking <= 30
    ) {
      out.push({
        dedupeKey: `suspended_recently_active:global:${r.userId}`,
        source: 'membership_lifecycle',
        ruleKey: 'suspended_recently_active',
        subjectEntityId: r.userId,
        severity: 'critical',
        subject:
          `${name} — suspended ${normalized.normalizedType || 'membership'} ` +
          `but played ${daysSinceLastBooking}d ago`,
        context: {
          memberName: name,
          membershipType: r.membershipType ?? 'unknown',
          daysSinceLastBooking,
          confirmedBookings: confirmed,
        },
        action: {
          primary: {
            type: 'cr_api_direct',
            label: 'Reactivate in CourtReserve',
            endpoint: 'familymembership/reactivate',
            payload: { userId: r.userId },
            requiresConfirmation: true,
          },
          secondary: [
            {
              type: 'create_campaign',
              label: 'Send win-back offer',
              templateKey: 'suspended_winback',
            },
          ],
        },
      })
      continue
    }

    // ── Rule B: Trial, joined 7-14d ago, 0 confirmed bookings ──────
    const isTrial =
      normalized.normalizedStatus === 'trial' ||
      normalized.normalizedType === 'trial'
    if (
      isTrial &&
      daysSinceJoined !== null &&
      daysSinceJoined >= 7 &&
      daysSinceJoined <= 14 &&
      confirmed === 0
    ) {
      out.push({
        dedupeKey: `trial_no_first_play:global:${r.userId}`,
        source: 'membership_lifecycle',
        ruleKey: 'trial_no_first_play',
        subjectEntityId: r.userId,
        severity: 'warning',
        subject:
          `${name} — ${daysSinceJoined}d into trial, no first booking yet`,
        context: {
          memberName: name,
          daysSinceJoined,
          confirmedBookings: 0,
        },
        action: {
          primary: {
            type: 'create_campaign',
            label: 'Send trial nudge',
            templateKey: 'trial_first_play_nudge',
          },
        },
      })
      continue
    }

    // ── Rule C: Expired / cancelled + recently active ──────────────
    const isLapsed =
      normalized.normalizedStatus === 'expired' ||
      normalized.normalizedStatus === 'cancelled'
    if (
      isLapsed &&
      daysSinceLastBooking !== null &&
      daysSinceLastBooking <= 21
    ) {
      out.push({
        dedupeKey: `renewal_at_risk:global:${r.userId}`,
        source: 'membership_lifecycle',
        ruleKey: 'renewal_at_risk',
        subjectEntityId: r.userId,
        severity: 'warning',
        subject:
          `${name} — membership ${normalized.normalizedStatus}, last played ` +
          `${daysSinceLastBooking}d ago`,
        context: {
          memberName: name,
          membershipStatus: normalized.normalizedStatus,
          daysSinceLastBooking,
        },
        action: {
          primary: {
            type: 'create_campaign',
            label: 'Send renewal offer',
            templateKey: 'renewal_reactivation',
          },
          secondary: [
            {
              type: 'create_cohort',
              label: 'Add to "Renewal candidates" cohort',
              cohortRules: [
                {
                  field: 'normalizedMembershipStatus',
                  op: 'in',
                  value: ['expired', 'cancelled'],
                },
                { field: 'recency', op: 'lte', value: 21 },
              ],
            },
          ],
        },
      })
    }
  }

  return out
}

// ─── Generator 3 — Scorecard Execution Check (Spec §4.3 row 3) ──────────

/**
 * 4 weekly Y/N signals derived from the same logic that powers the
 * Weekly Scorecard's `executionCheck` block (see `getWeeklyScorecard`
 * in `server/routers/intelligence.ts`):
 *
 *   - `scorecard_t1_daily_gap`           — T1 Core ran <7 days this week
 *   - `scorecard_t2_league_gap_critical` — ≥1 league family in 14-60d gap
 *   - `scorecard_t3_no_signature_event`  — 0 T3 sessions this week
 *   - `scorecard_social_tournament_gap`  — 0 T4 & 0 T5 sessions this week
 *
 * Subject is the club-level execution miss (no per-member subject id).
 * Severity is uniformly `warning` — these are operator-attention
 * nudges, not member emergencies. The week window matches the Weekly
 * Scorecard: most recently completed Monday → Sunday in UTC.
 */
export async function scorecardExecutionSignals(
  prisma: PrismaClient,
  clubId: string,
): Promise<OperationalSignal[]> {
  // Resolve most recently completed Mon→Sun window (matches getWeeklyScorecard).
  const now = new Date()
  const dayUtc = now.getUTCDay() // 0=Sun .. 6=Sat
  const daysSinceLastMonday = dayUtc === 0 ? 13 : dayUtc + 6
  const weekStart = new Date(now.getTime())
  weekStart.setUTCHours(0, 0, 0, 0)
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceLastMonday)
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000)
  const weekLabel = weekStart.toISOString().slice(0, 10)

  // Load this club's custom classifier rules once, before the bucketing
  // loop. So the operational signals reflect the same per-club mapping
  // that Programming Health uses.
  const customRules = await loadClubCustomRules(prisma, clubId)

  // Pull all sessions in the window — we need title / format / category
  // for the tier classifier, and date so we can group T1 by day.
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT ps.id,
           ps.title,
           ps.format::text AS format,
           ps.category,
           ps.date
    FROM play_sessions ps
    WHERE ps."clubId" = $1::uuid
      AND ps.date >= $2
      AND ps.date <  $3
    `,
    clubId,
    weekStart,
    weekEnd,
  )) as Array<{
    id: string
    title: string | null
    format: string | null
    category: string | null
    date: Date
  }>

  // Bucket by tier using the shared classifier.
  const buckets: Record<string, typeof rows> = {
    T1_CORE: [],
    T2_LEAGUE: [],
    T3_SIGNATURE: [],
    T4_SOCIAL: [],
    T5_TOURNAMENT: [],
    T6_PREMIUM: [],
    T7_YOUTH: [],
  }
  for (const s of rows) {
    // Skip equipment / ball machine rentals — they aren't part of any
    // programming tier, so they shouldn't influence T1 daily-cadence or
    // any other operational signal.
    if (isEquipmentBooking({ title: s.title, format: s.format, category: s.category })) {
      continue
    }
    // Per-club rules variant: custom mappings from Tier Constructor
    // win over the default regex classifier.
    const tier = classifyProgrammingTierWithRules(
      {
        title: s.title,
        format: s.format,
        category: s.category,
      },
      customRules,
    )
    buckets[tier]?.push(s)
  }

  // Day-of-week coverage for T1.
  const t1Days = new Set<string>()
  for (const s of buckets.T1_CORE) {
    t1Days.add(s.date.toISOString().slice(0, 10))
  }

  // League gap (matches getWeeklyScorecard logic — 180d window).
  const leagueLookback = new Date(Date.now() - 180 * 86400_000)
  const leagueRows = (await prisma.$queryRawUnsafe(
    `
    SELECT title, date
    FROM play_sessions
    WHERE "clubId" = $1::uuid
      AND date >= $2
      AND (format = 'LEAGUE_PLAY' OR LOWER(title) LIKE '%league%')
    `,
    clubId,
    leagueLookback,
  )) as Array<{ title: string | null; date: Date }>

  const leagueFamilies = new Map<
    string,
    { lastPast: Date | null; nextFuture: Date | null }
  >()
  for (const ls of leagueRows) {
    const det = detectLeagueFamily(ls.title)
    if (!det.family) continue
    let bucket = leagueFamilies.get(det.family)
    if (!bucket) {
      bucket = { lastPast: null, nextFuture: null }
      leagueFamilies.set(det.family, bucket)
    }
    if (ls.date < now) {
      if (!bucket.lastPast || ls.date > bucket.lastPast) bucket.lastPast = ls.date
    } else {
      if (!bucket.nextFuture || ls.date < bucket.nextFuture)
        bucket.nextFuture = ls.date
    }
  }

  let gapCriticalCount = 0
  let activeLeagues = 0
  for (const f of Array.from(leagueFamilies.values())) {
    if (f.nextFuture) {
      activeLeagues++
      continue
    }
    if (f.lastPast) {
      const days = Math.floor(
        (now.getTime() - f.lastPast.getTime()) / 86400_000,
      )
      if (days < 7) activeLeagues++
      else if (days < 60) gapCriticalCount++
    }
  }

  const out: OperationalSignal[] = []

  // ── Rule 1: T1 Core daily delivery — should run all 7 days. ────
  if (t1Days.size < 7) {
    const missingDays = 7 - t1Days.size
    out.push({
      dedupeKey: `scorecard_t1_daily_gap:global:${weekLabel}`,
      source: 'scorecard_execution',
      ruleKey: 'scorecard_t1_daily_gap',
      subjectEntityId: null,
      severity: missingDays >= 3 ? 'critical' : 'warning',
      subject:
        `T1 Core missed ${missingDays} day${missingDays > 1 ? 's' : ''} ` +
        `last week (week of ${weekLabel})`,
      context: {
        weekStart: weekLabel,
        daysCovered: t1Days.size,
        daysMissed: missingDays,
        coreSessions: buckets.T1_CORE.length,
      },
      action: {
        primary: {
          type: 'programming',
          label: 'Schedule daily T1 Core slots',
          params: {
            hint: 'core_daily_fill',
            weekStart: weekStart.toISOString(),
          },
        },
      },
    })
  }

  // ── Rule 2: T2 leagues continuity — 0 gap-critical families. ───
  if (gapCriticalCount > 0) {
    out.push({
      dedupeKey: `scorecard_t2_league_gap_critical:global:${weekLabel}`,
      source: 'scorecard_execution',
      ruleKey: 'scorecard_t2_league_gap_critical',
      subjectEntityId: null,
      severity: gapCriticalCount >= 3 ? 'critical' : 'warning',
      subject:
        `${gapCriticalCount} league famil${gapCriticalCount > 1 ? 'ies are' : 'y is'} ` +
        `in a critical gap (14-60d without a future session)`,
      context: {
        weekStart: weekLabel,
        gapCriticalCount,
        activeLeagues,
      },
      action: {
        primary: {
          type: 'programming',
          label: 'Open league enrollment',
          params: { hint: 'league_open_enrollment' },
        },
      },
    })
  }

  // ── Rule 3: T3 Signature event ran this week. ──────────────────
  if (buckets.T3_SIGNATURE.length === 0) {
    out.push({
      dedupeKey: `scorecard_t3_no_signature_event:global:${weekLabel}`,
      source: 'scorecard_execution',
      ruleKey: 'scorecard_t3_no_signature_event',
      subjectEntityId: null,
      severity: 'warning',
      subject: `No T3 Signature event ran last week (week of ${weekLabel})`,
      context: {
        weekStart: weekLabel,
        t3SessionCount: 0,
      },
      action: {
        primary: {
          type: 'programming',
          label: 'Programme a signature event',
          params: { hint: 'signature_event_weekly' },
        },
      },
    })
  }

  // ── Rule 4: Social / Tournament cadence — ≥1 T4 OR T5 per week. ─
  if (buckets.T4_SOCIAL.length === 0 && buckets.T5_TOURNAMENT.length === 0) {
    out.push({
      dedupeKey: `scorecard_social_tournament_gap:global:${weekLabel}`,
      source: 'scorecard_execution',
      ruleKey: 'scorecard_social_tournament_gap',
      subjectEntityId: null,
      severity: 'nudge',
      subject:
        `No T4 social or T5 tournament ran last week (week of ${weekLabel})`,
      context: {
        weekStart: weekLabel,
        t4SessionCount: 0,
        t5SessionCount: 0,
      },
      action: {
        primary: {
          type: 'programming',
          label: 'Programme a social or tournament',
          params: { hint: 'social_or_tournament_monthly' },
        },
      },
    })
  }

  return out
}

// ─── Generator 4 — League gap detection (Spec §4.3 row 4) ──────────────

/**
 * Per-league-family signals when a family is in critical gap — last
 * past session is 14-60 days ago AND no future session is scheduled.
 * Logic mirrors `detectLeagueGapsForClub` in
 * `lib/ai/league-gap-detector.ts` but persists into operational_signal
 * instead of AgentDraft so a single SignalCard surfaces every stale
 * family (the older detector raises one AgentDraft per family per
 * 30-day cooldown — fine for an agent queue, but too noisy for the
 * Action Center if a club has 4 stale families simultaneously).
 *
 * dedupe_key folds in the family slug so dedupe stays correct across
 * runs: each family produces at most one active row.
 */
export async function leagueGapAlerts(
  prisma: PrismaClient,
  clubId: string,
): Promise<OperationalSignal[]> {
  const LOOKBACK_DAYS = 180
  const GAP_MIN = 14
  const GAP_MAX = 60
  const lookbackStart = new Date(Date.now() - LOOKBACK_DAYS * 86400_000)

  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT id, title, date, registered_count, "maxPlayers" AS max_players
    FROM play_sessions
    WHERE "clubId" = $1::uuid
      AND date >= $2
      AND (format = 'LEAGUE_PLAY' OR LOWER(title) LIKE '%league%')
    `,
    clubId,
    lookbackStart,
  )) as Array<{
    id: string
    title: string | null
    date: Date
    registered_count: number | null
    max_players: number | null
  }>

  if (!rows || rows.length === 0) return []

  interface FamilyAgg {
    family: string
    sponsors: string[]
    lastPast: Date | null
    nextFuture: Date | null
    pastSessionCount: number
    totalRegistered: number
    totalCapacity: number
  }

  const families = new Map<string, FamilyAgg>()
  const now = new Date()
  for (const s of rows) {
    const det = detectLeagueFamily(s.title)
    if (!det.family) continue
    let bucket = families.get(det.family)
    if (!bucket) {
      bucket = {
        family: det.family,
        sponsors: [],
        lastPast: null,
        nextFuture: null,
        pastSessionCount: 0,
        totalRegistered: 0,
        totalCapacity: 0,
      }
      families.set(det.family, bucket)
    }
    if (det.sponsor && !bucket.sponsors.includes(det.sponsor)) {
      bucket.sponsors.push(det.sponsor)
    }
    bucket.totalRegistered += s.registered_count ?? 0
    bucket.totalCapacity += s.max_players ?? 0
    if (s.date < now) {
      bucket.pastSessionCount++
      if (!bucket.lastPast || s.date > bucket.lastPast) bucket.lastPast = s.date
    } else {
      if (!bucket.nextFuture || s.date < bucket.nextFuture)
        bucket.nextFuture = s.date
    }
  }

  const out: OperationalSignal[] = []
  for (const family of Array.from(families.values())) {
    // Active families (have a future session OR very recent past) skip.
    if (family.nextFuture) continue
    if (!family.lastPast) continue
    const daysSinceLast = Math.floor(
      (now.getTime() - family.lastPast.getTime()) / 86400_000,
    )
    if (daysSinceLast < GAP_MIN || daysSinceLast > GAP_MAX) continue

    const familySlug = family.family
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60)
    const sponsorClause =
      family.sponsors.length > 0
        ? ` (sponsored by ${family.sponsors.join(', ')})`
        : ''
    const lastDateLabel = family.lastPast.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    // Severity scales with the gap: 14-30d = warning, 30-60d = critical.
    const severity: SignalSeverity =
      daysSinceLast >= 30 ? 'critical' : 'warning'

    out.push({
      dedupeKey: `league_gap:global:${familySlug}`,
      source: 'league_gap',
      ruleKey: 'league_gap',
      subjectEntityId: familySlug,
      severity,
      subject:
        `${family.family}${sponsorClause} — ${daysSinceLast}d since last ` +
        `session (${lastDateLabel}), no future session scheduled`,
      context: {
        leagueFamily: family.family,
        sponsors: family.sponsors,
        daysSinceLast,
        lastSessionDate: family.lastPast.toISOString(),
        pastSessionCount: family.pastSessionCount,
        totalRegistered: family.totalRegistered,
        totalCapacity: family.totalCapacity,
      },
      action: {
        primary: {
          type: 'create_campaign',
          label: `Open enrollment — next ${family.family}`,
          templateKey: 'league_open_enrollment',
        },
        secondary: [
          {
            type: 'create_cohort',
            label: 'Add past attendees cohort',
            cohortRules: [
              {
                field: 'attendedLeagueFamily',
                op: 'eq',
                value: family.family,
              },
            ],
          },
          {
            type: 'programming',
            label: 'Schedule next league session',
            params: { hint: 'league_continue', leagueFamily: family.family },
          },
        ],
      },
    })
  }

  return out
}

// ─── Generator 5 — VIP at-risk per-member (Spec §6.5) ──────────────────

/**
 * Per-VIP "at risk" alerts. Aggregated metric (% of VIPs at risk) is
 * already on the Dashboard via `getVipAtRiskPercent` (Step 7). This
 * generator is the per-member half of the same signal — one row per VIP
 * who hasn't played in 14+ days so the operator can act case-by-case.
 *
 * VIP definition (Spec §6.3, mirrors `insights-engine.ts:164`):
 *   membership_type ILIKE '%VIP%' OR '%Premium%' OR '%Unlimited%'
 *   AND membership_status = 'Active'
 *
 * Severity:
 *   - critical — never played, OR 30+ days since last play
 *   - warning  — 14-30 days since last play
 *
 * Action shape (Spec §6.5):
 *   primary   = create_campaign (`vip_winback`)
 *   secondary = create_cohort (single-member) + programming hint
 *
 * Monthly dues parsed out of the membership label (e.g.
 * "VIP Pass - $129.99/Month") so the SignalCard context can show
 * the revenue at risk per row.
 */
export async function vipAtRiskAlerts(
  prisma: PrismaClient,
  clubId: string,
): Promise<OperationalSignal[]> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH vip_members AS (
      SELECT
        u.id                                                                 AS "userId",
        u.name                                                               AS "memberName",
        u.email                                                              AS "memberEmail",
        u.membership_type                                                    AS "membershipType",
        NULLIF(
          SUBSTRING(u.membership_type FROM '\\$([0-9]+(?:\\.[0-9]+)?)\\s*/\\s*(?:Month|mo|month)'),
          ''
        )::numeric                                                           AS "monthlyDues"
      FROM users u
      JOIN club_followers cf ON cf.user_id = u.id
      WHERE cf.club_id = $1::uuid
        AND u.membership_status = 'Active'
        AND (
          u.membership_type ILIKE '%VIP%'
          OR u.membership_type ILIKE '%Premium%'
          OR u.membership_type ILIKE '%Unlimited%'
        )
        AND u.email NOT LIKE '%placeholder%'
        AND u.email NOT LIKE '%demo%'
    ),
    last_play AS (
      SELECT b."userId", MAX(ps.date) AS "lastPlayed"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1::uuid
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    )
    SELECT v."userId", v."memberName", v."memberEmail", v."membershipType",
           v."monthlyDues",
           lp."lastPlayed"
    FROM vip_members v
    LEFT JOIN last_play lp ON lp."userId" = v."userId"
    WHERE lp."lastPlayed" IS NULL
       OR lp."lastPlayed" < NOW() - INTERVAL '14 days'
    `,
    clubId,
  )) as Array<{
    userId: string
    memberName: string | null
    memberEmail: string | null
    membershipType: string | null
    monthlyDues: string | number | null
    lastPlayed: Date | null
  }>

  if (!rows || rows.length === 0) return []

  const now = Date.now()
  const DAY = 86400_000
  const out: OperationalSignal[] = []

  for (const r of rows) {
    const name = r.memberName?.trim() || r.memberEmail?.trim() || 'VIP member'
    const lastPlayedAt = r.lastPlayed ? new Date(r.lastPlayed) : null
    const daysSincePlayed = lastPlayedAt
      ? Math.floor((now - lastPlayedAt.getTime()) / DAY)
      : null
    const dues = r.monthlyDues != null ? Number(r.monthlyDues) : null

    // Severity: never-played OR 30+ days → critical; 14-30 → warning.
    const severity: SignalSeverity =
      daysSincePlayed === null || daysSincePlayed >= 30 ? 'critical' : 'warning'

    const subjectTail =
      daysSincePlayed === null
        ? 'has never played'
        : `last played ${daysSincePlayed}d ago`
    const tierLabel = r.membershipType?.trim() || 'VIP'

    out.push({
      dedupeKey: `vip_at_risk:global:${r.userId}`,
      source: 'vip_at_risk',
      ruleKey: 'vip_at_risk',
      subjectEntityId: r.userId,
      severity,
      subject: `${name} (${tierLabel}) — ${subjectTail}`,
      context: {
        memberName: name,
        membershipType: r.membershipType ?? 'VIP',
        daysSincePlayed: daysSincePlayed ?? -1,
        monthlyDues: dues ?? 0,
      },
      action: {
        primary: {
          type: 'create_campaign',
          label: 'Send personal VIP outreach',
          templateKey: 'vip_winback',
        },
        secondary: [
          {
            type: 'create_cohort',
            label: 'Add to "VIP at risk" cohort',
            cohortRules: [{ field: 'userId', op: 'eq', value: r.userId }],
          },
          {
            type: 'programming',
            label: 'Invite to a curated session',
            params: { hint: 'vip_curated_invite', userId: r.userId },
          },
        ],
      },
    })
  }

  return out
}

// ─── Run + persist (upsert layer) ──────────────────────────────────────

/**
 * Run every active generator for `clubId`, then reconcile the DB with
 * the produced signal set via the same INSERT / UPDATE / RESOLVE pattern
 * as `runBusinessInsights` — but here multiple signals can share a
 * ruleKey (one per subject), so the partial unique index on
 * (club_id, dedupe_key) is what enforces idempotency.
 *
 * Auto-resolve: any active/snoozed row for this club whose dedupeKey
 * was NOT produced this run is moved to `status='resolved'`. That
 * captures e.g. a member whose health recovered above the drop
 * threshold or whose membership was reactivated since last run.
 */
export async function runOperationalSignals(
  prisma: PrismaClient,
  clubId: string,
): Promise<RunReport> {
  // Add new generators here. Each must return OperationalSignal[]
  // (possibly empty). Step 18 closes the MVP source set (5/5);
  // additional sources land in Phase 2 (Tier Compliance, auto-suggest).
  const generators: Array<
    (p: PrismaClient, c: string) => Promise<OperationalSignal[]>
  > = [
    memberHealthDeltas,
    membershipLifecycleAlerts,
    scorecardExecutionSignals,
    leagueGapAlerts,
    vipAtRiskAlerts,
  ]

  const produced: OperationalSignal[] = []
  for (const fn of generators) {
    try {
      const result = await fn(prisma, clubId)
      if (result && result.length > 0) produced.push(...result)
    } catch (err) {
      // One bad generator must not stop the others; the cron logs upstream.
      // eslint-disable-next-line no-console
      console.error('[OperationalSignals] generator failed:', err)
    }
  }

  const producedKeys = new Set(produced.map(p => p.dedupeKey))

  const existing = (await prisma.$queryRawUnsafe(
    `
    SELECT id, dedupe_key
    FROM operational_signal
    WHERE club_id = $1::uuid
      AND status IN ('active', 'snoozed')
    `,
    clubId,
  )) as Array<{ id: string; dedupe_key: string }>

  const existingByKey = new Map(existing.map(r => [r.dedupe_key, r.id]))

  let inserted = 0
  let refreshed = 0
  let resolved = 0
  const now = new Date()

  for (const sig of produced) {
    const existingId = existingByKey.get(sig.dedupeKey)
    if (existingId) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE operational_signal
        SET subject       = $1,
            context       = $2::jsonb,
            action        = $3::jsonb,
            severity      = $4,
            last_seen_at  = $5,
            location_id   = $6
        WHERE id = $7
        `,
        sig.subject,
        JSON.stringify(sig.context),
        JSON.stringify(sig.action),
        sig.severity,
        now,
        sig.locationId ?? null,
        existingId,
      )
      refreshed++
    } else {
      const id = `os_${sig.ruleKey}_${sig.subjectEntityId ?? 'none'}_${now.getTime()}`
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO operational_signal (
          id, club_id, location_id, dedupe_key,
          source, rule_key, subject_entity_id,
          severity, subject, context, action,
          status, created_at, last_seen_at
        )
        VALUES (
          $1, $2::uuid, $3, $4,
          $5, $6, $7,
          $8, $9, $10::jsonb, $11::jsonb,
          'active', $12, $12
        )
        `,
        id,
        clubId,
        sig.locationId ?? null,
        sig.dedupeKey,
        sig.source,
        sig.ruleKey,
        sig.subjectEntityId,
        sig.severity,
        sig.subject,
        JSON.stringify(sig.context),
        JSON.stringify(sig.action),
        now,
      )
      inserted++
    }
  }

  // Auto-resolve: anything active or snoozed that the generators no
  // longer produce. The subject's condition resolved on its own (member
  // health recovered, suspended membership reactivated, etc.).
  for (const row of existing) {
    if (!producedKeys.has(row.dedupe_key)) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE operational_signal
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
