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
  // (possibly empty). Steps 17-18 will append scorecard_execution,
  // league_gap, vip_at_risk.
  const generators: Array<
    (p: PrismaClient, c: string) => Promise<OperationalSignal[]>
  > = [memberHealthDeltas, membershipLifecycleAlerts]

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
