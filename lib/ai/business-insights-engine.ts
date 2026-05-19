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

/**
 * Single CR write endpoint reachable from a `cr_api_direct` action.
 * Keep in sync with the methods exposed in `courtreserve-client.ts`.
 */
export type CRWriteEndpoint =
  | 'familymembership/reactivate'
  | 'familymembership/suspend'
  | 'customrating/assign'
  | 'reservation/createcourtblock'

/** UnifiedAction.primary leaves — see Spec §2. */
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
  | {
      type: 'cr_api_direct'
      label: string
      endpoint: CRWriteEndpoint
      payload: Record<string, unknown>
      requiresConfirmation: boolean
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

// ─── Generators (pilot) ─────────────────────────────────────────────────

/**
 * Pilot insight — new members joined ≤30d ago with ≤2 bookings.
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
  const generators: Array<
    (p: PrismaClient, c: string) => Promise<BusinessInsight | null>
  > = [pilotNewMemberOnboarding]

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
          $1, $2::uuid, $3, $4, $5,
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
