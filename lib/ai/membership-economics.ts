import 'server-only'

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/**
 * Tier specification — parsed from club_membership_types.raw_data (synced
 * daily from CourtReserve). One row per package as it appears in the CR
 * admin console, including packages with zero subscribers.
 *
 * `name` matches users.membership_type 1:1 — CR is the single source of
 * truth, so the strings are identical across both tables.
 */
export type TierSpec = {
  id: string
  name: string
  monthlyPrice: number
  annualPrice: number
  initiationPrice: number
  description: string
  benefits: string[]
  minAge: number | null
  maxAge: number | null
  /** Days past-due before CR auto-suspends the membership. */
  suspendDays: number | null
  /** Days past-due before CR auto-cancels the membership. */
  cancelDays: number | null
  /** True when both monthly and annual price are zero — guest/comp/pay-per-play. */
  isFreeTier: boolean
  syncedAt: Date
}

export type TierEconomicsRow = {
  name: string
  monthlyPrice: number
  isFreeTier: boolean
  activeMembers: number
  totalMembers: number
  bookings30d: number
  /** activeMembers * monthlyPrice — paid tiers only. */
  estimatedMRR: number
  /** bookings30d / activeMembers (rounded to 1dp). 0 for free or empty tiers. */
  bookingsPerActiveMember: number
}

export type TierEconomicsResult = {
  tiers: TierEconomicsRow[]
  rollup: {
    totalMRR: number
    totalActiveSubscribers: number
    paidTierActiveCount: number
    freeTierActiveCount: number
    paidTierShare: number
    freeTierShare: number
    /** Most recent synced_at across the catalog, so the advisor can disclose freshness. */
    catalogSyncedAt: Date | null
  }
}

/**
 * Reporting window for tier analytics. Either a relative `periodDays` window
 * ending now (default 30 — byte-identical to the historical behavior) or an
 * absolute [startDate, endDate] range (endDate inclusive of its whole day,
 * mirroring resolveProgrammingPeriod's contract).
 *
 * Engagement buckets (zombie/light/regular/power) are calibrated per-30-days;
 * for other window lengths the booking counts are normalized to a per-30d
 * rate (b × 30 / periodDays) before bucketing, so "power user" always means
 * "books 8+ times per month" regardless of the window. Zombie (= exactly 0)
 * is unaffected by scaling. At periodDays=30 the bucket edges are identical
 * to the original integer BETWEEN logic.
 */
export type TierWindowInput = {
  periodDays?: number
  startDate?: string
  endDate?: string
}

export type ResolvedTierWindow = {
  start: Date
  end: Date
  periodDays: number
  /** Human phrase for diagnostics, e.g. "in the last 30 days" / "in the selected period". */
  windowText: string
}

export function resolveTierWindow(input?: TierWindowInput): ResolvedTierWindow {
  if (input?.startDate && input?.endDate) {
    const start = new Date(input.startDate)
    const end = new Date(input.endDate)
    end.setUTCDate(end.getUTCDate() + 1) // endDate inclusive → exclusive next-day bound
    const periodDays = Math.min(
      730,
      Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000)),
    )
    return { start, end, periodDays, windowText: 'in the selected period' }
  }
  const days = Math.min(730, Math.max(1, Math.round(input?.periodDays ?? 30)))
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  return { start, end, periodDays: days, windowText: `in the last ${days} days` }
}

function toNumber(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        const candidate =
          obj.Name ?? obj.name ?? obj.Description ?? obj.description ?? obj.Title ?? obj.title
        return typeof candidate === 'string' ? candidate : null
      }
      return null
    })
    .filter((s): s is string => !!s && s.trim().length > 0)
}

type CatalogRow = {
  id: string
  name: string
  raw_data: Record<string, unknown> | null
  synced_at: Date
}

/**
 * Read the CR-synced membership catalog for a club. Sorted by monthly price
 * descending (then alphabetical) so the highest-value tier surfaces first.
 *
 * Source: club_membership_types.raw_data JSONB — refreshed nightly by the
 * CourtReserve sync (see lib/connectors/courtreserve-sync.ts). Returns []
 * when the club has not been synced (e.g. CSV-only onboarding).
 */
export async function getTierCatalog(clubId: string): Promise<TierSpec[]> {
  const rows = await prisma.$queryRaw<CatalogRow[]>`
    SELECT id, name, raw_data, synced_at
    FROM club_membership_types
    WHERE club_id = ${clubId}
  `

  const tiers: TierSpec[] = rows.map((row) => {
    const raw = row.raw_data || {}
    const monthlyPrice = toNumber(raw.MonthlyMembershipPrice)
    const annualPrice = toNumber(raw.AnnualMembershipPrice)
    return {
      id: row.id,
      name: row.name,
      monthlyPrice,
      annualPrice,
      initiationPrice: toNumber(raw.InitiationPrice),
      description: typeof raw.Description === 'string' ? raw.Description : '',
      benefits: toStringArray(raw.CostTypeAdditionalFeatureList),
      minAge: toIntOrNull(raw.AllowMinAge),
      maxAge: toIntOrNull(raw.AllowMaxAge),
      suspendDays: toIntOrNull(raw.XDaysPastDueToSuspendAccount),
      cancelDays: toIntOrNull(raw.XDaysPastDueToAutoCancelMembership),
      isFreeTier: monthlyPrice === 0 && annualPrice === 0,
      syncedAt: row.synced_at,
    }
  })

  tiers.sort((a, b) => {
    if (b.monthlyPrice !== a.monthlyPrice) return b.monthlyPrice - a.monthlyPrice
    return a.name.localeCompare(b.name)
  })

  return tiers
}

type UsageRow = {
  membership_type: string | null
  active_members: number | bigint
  total_members: number | bigint
  bookings_30d: number | bigint
}

/**
 * Per-tier economics for a club: active count, 30-day bookings, and an
 * estimated monthly recurring revenue (activeMembers × monthlyPrice). The
 * MRR is "estimated" because we don't have actual CR transactions wired up
 * yet — see Phase 2 plan in wise-juggling-fiddle.md.
 *
 * Joins the catalog (prices, free-flag) with current users.membership_type
 * counts and PlaySessionBooking activity, in two parallel round-trips.
 * Returns every tier visible in either source (catalog ∪ in-use), so admins
 * see both "selling but unstocked" and "stocked but not selling" packages.
 */
export async function getTierEconomics(
  clubId: string,
  window?: TierWindowInput,
): Promise<TierEconomicsResult> {
  const win = resolveTierWindow(window)
  const [catalog, usage] = await Promise.all([
    getTierCatalog(clubId),
    // Pre-aggregate recent bookings (window/club/confirmed) into one row per
    // user BEFORE joining followers — avoids the all-bookings row explosion
    // that made this ~100s on a 12k-follower club. Active count uses CR's
    // canonical 'Active' status (verified all 3 IPC clubs use exactly that
    // string). Default window = last 30 days (historical behavior).
    prisma.$queryRaw<UsageRow[]>`
      WITH recent AS (
        SELECT psb."userId" AS uid, COUNT(*)::int AS b30
        FROM play_session_bookings psb
        JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE ps."clubId" = ${clubId}
          AND psb.status = 'CONFIRMED'
          AND psb."bookedAt" >= ${win.start}
          AND psb."bookedAt" < ${win.end}
        GROUP BY psb."userId"
      )
      SELECT
        u.membership_type,
        COUNT(*) FILTER (WHERE u.membership_status = 'Active') AS active_members,
        COUNT(*) AS total_members,
        COALESCE(SUM(r.b30), 0) AS bookings_30d
      FROM users u
      JOIN club_followers cf ON cf.user_id = u.id
      LEFT JOIN recent r ON r.uid = u.id
      WHERE cf.club_id = ${clubId}
      GROUP BY u.membership_type
    `,
  ])

  const catalogByName = new Map<string, TierSpec>()
  for (const tier of catalog) {
    catalogByName.set(tier.name, tier)
  }

  const usageByName = new Map<string, UsageRow>()
  for (const u of usage) {
    if (u.membership_type) {
      usageByName.set(u.membership_type, u)
    }
  }

  // Union of catalog keys + usage keys, materialised to an array to
  // sidestep TS's --downlevelIteration restriction on Set iteration.
  const allNamesSet = new Set<string>()
  catalogByName.forEach((_, name) => allNamesSet.add(name))
  usageByName.forEach((_, name) => allNamesSet.add(name))
  const allNames = Array.from(allNamesSet)

  const rows: TierEconomicsRow[] = []
  for (const name of allNames) {
    const spec = catalogByName.get(name)
    const u = usageByName.get(name)
    const monthlyPrice = spec?.monthlyPrice ?? 0
    const annualPrice = spec?.annualPrice ?? 0
    const isFreeTier = monthlyPrice === 0 && annualPrice === 0
    const activeMembers = u ? Number(u.active_members) : 0
    const totalMembers = u ? Number(u.total_members) : 0
    const bookings30d = u ? Number(u.bookings_30d) : 0
    const estimatedMRR = isFreeTier ? 0 : Math.round(activeMembers * monthlyPrice)
    const bookingsPerActiveMember = activeMembers > 0
      ? Math.round((bookings30d / activeMembers) * 10) / 10
      : 0

    rows.push({
      name,
      monthlyPrice,
      isFreeTier,
      activeMembers,
      totalMembers,
      bookings30d,
      estimatedMRR,
      bookingsPerActiveMember,
    })
  }

  rows.sort((a, b) => {
    if (b.estimatedMRR !== a.estimatedMRR) return b.estimatedMRR - a.estimatedMRR
    return b.activeMembers - a.activeMembers
  })

  const totalMRR = rows.reduce((sum, r) => sum + r.estimatedMRR, 0)
  const paidTierActiveCount = rows
    .filter((r) => !r.isFreeTier)
    .reduce((sum, r) => sum + r.activeMembers, 0)
  const freeTierActiveCount = rows
    .filter((r) => r.isFreeTier)
    .reduce((sum, r) => sum + r.activeMembers, 0)
  const totalActiveSubscribers = paidTierActiveCount + freeTierActiveCount
  const paidTierShare = totalActiveSubscribers > 0
    ? paidTierActiveCount / totalActiveSubscribers
    : 0
  const freeTierShare = totalActiveSubscribers > 0
    ? freeTierActiveCount / totalActiveSubscribers
    : 0

  const catalogSyncedAt = catalog.length > 0
    ? catalog.reduce<Date>(
        (max, t) => (t.syncedAt > max ? t.syncedAt : max),
        catalog[0].syncedAt,
      )
    : null

  return {
    tiers: rows,
    rollup: {
      totalMRR,
      totalActiveSubscribers,
      paidTierActiveCount,
      freeTierActiveCount,
      paidTierShare,
      freeTierShare,
      catalogSyncedAt,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier health — diagnostic layer on top of catalog × economics
// ─────────────────────────────────────────────────────────────────────────────

export type TierHealthVerdict =
  | 'healthy' // paid: low zombies + decent power; free: solid upsell potential
  | 'watch' // some warning signals but not yet bleeding
  | 'at_risk' // material MRR leak or high suspension
  | 'critical' // severe MRR leak — needs immediate intervention
  | 'tiny' // <5 active members — sample too small to diagnose

export type TierTreatmentHint =
  | 'RETENTION_BOOST' // re-engage zombies before they churn
  | 'UPSELL' // free → paid conversion of power users
  | 'WINBACK' // suspended/expired reactivation
  | 'BILLING_AUDIT' // suspicious suspension rate — likely billing failure
  | 'PRICE_REVIEW' // underpriced or overpriced relative to usage

export type TierTreatment = {
  action: string
  campaignHint: TierTreatmentHint
  /** Dollar/month impact if treatment lands at its assumed success rate (see comment). */
  potentialMRRImpactUsd: number
  targetMemberCount: number
}

export type TierHealthSnapshot = {
  name: string
  monthlyPrice: number
  isFreeTier: boolean
  // Status snapshot
  active: number
  suspended: number
  expired: number
  // Engagement distribution among Active
  zombies: number // 0 bookings in 30d
  lightUsers: number // 1–3 bookings
  regularUsers: number // 4–7 bookings
  powerUsers: number // ≥8 bookings
  zombieSharePct: number
  powerUserSharePct: number
  suspendedRatePct: number
  bookings30d: number
  bookingsPerActive: number
  // Economics
  estimatedMRR: number
  mrrAtRiskUsd: number // zombies × monthlyPrice (paid only)
  upsellPotentialMRRUsd: number // power users × cheapestPaidPrice (free only)
  // Diagnosis
  verdict: TierHealthVerdict
  healthScore: number // 0–100
  diagnostics: string[]
  treatments: TierTreatment[]
}

export type TierHealthResult = {
  rollup: {
    clubMRRAtRiskUsd: number
    clubUpsellPotentialMRRUsd: number
    cheapestPaidMonthlyPrice: number
    countByVerdict: Record<TierHealthVerdict, number>
    /** Club-wide measured churn rate driving the MRR-at-risk figures. */
    churnStats: ZombieChurnStats
    /** Reporting window (days) the engagement buckets were computed over. */
    periodDays: number
  }
  tiers: TierHealthSnapshot[] // sorted critical → healthy
}

type HealthDistributionRow = {
  membership_type: string | null
  active_count: number | bigint
  suspended_count: number | bigint
  expired_count: number | bigint
  zombies: number | bigint
  light_users: number | bigint
  regular_users: number | bigint
  power_users: number | bigint
  bookings_30d: number | bigint
}

const VERDICT_ORDER: Record<TierHealthVerdict, number> = {
  critical: 0,
  at_risk: 1,
  watch: 2,
  healthy: 3,
  tiny: 4,
}

export type ZombieChurnStats = {
  /** % of historically-silent members who later booked again. */
  returnRatePct: number
  /** 1 − returnRate, clamped to [0.1, 0.9]. The probability a current zombie churns. */
  churnProb: number
  /** Number of historical zombies the rate is based on. */
  sample: number
  /** True when the sample is large enough to trust the measured rate. */
  measured: boolean
}

const CHURN_MIN_SAMPLE = 40 // below this, fall back to the 0.5 default
const CHURN_DEFAULT_PROB = 0.5

/**
 * Measure how often a member who goes silent actually churns, from this club's
 * own booking history — so "MRR at risk" is grounded in evidence, not a guess.
 *
 * Retrospective cohort, pooled over 3 monthly cutoffs (60/90/120d ago) to
 * smooth seasonality: take members who were established (booked before the
 * window) but had 0 bookings in a 30-day window ending at the cutoff
 * ("historical zombies"), then check whether they booked again in the 60 days
 * after. returnRate = came-back / total. churnProb = 1 − returnRate.
 *
 * Returns the 0.5 default (measured:false) when the sample is too small to
 * trust (new clubs, thin history).
 */
export async function getZombieChurnRate(clubId: string): Promise<ZombieChurnStats> {
  try {
    const rows = await prisma.$queryRaw<Array<{ zombies: bigint | number; returned: bigint | number }>>`
      WITH bk AS (
        SELECT psb."userId" AS uid, psb."bookedAt" AS at
        FROM play_session_bookings psb
        JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE ps."clubId" = ${clubId} AND psb.status = 'CONFIRMED'
      ),
      cohort AS (
        SELECT c.days_ago, b.uid,
          COUNT(*) FILTER (WHERE b.at <  NOW() - ((c.days_ago + 30) * INTERVAL '1 day')) AS before_cnt,
          COUNT(*) FILTER (WHERE b.at >= NOW() - ((c.days_ago + 30) * INTERVAL '1 day') AND b.at < NOW() - (c.days_ago * INTERVAL '1 day')) AS window_cnt,
          COUNT(*) FILTER (WHERE b.at >= NOW() - (c.days_ago * INTERVAL '1 day') AND b.at < NOW() - ((c.days_ago - 60) * INTERVAL '1 day')) AS after_cnt
        FROM (SELECT unnest(ARRAY[60, 90, 120]) AS days_ago) c
        CROSS JOIN bk b
        GROUP BY c.days_ago, b.uid
      )
      SELECT
        COUNT(*) FILTER (WHERE before_cnt > 0 AND window_cnt = 0) AS zombies,
        COUNT(*) FILTER (WHERE before_cnt > 0 AND window_cnt = 0 AND after_cnt > 0) AS returned
      FROM cohort
    `
    const sample = Number(rows[0]?.zombies ?? 0)
    const returned = Number(rows[0]?.returned ?? 0)
    if (sample < CHURN_MIN_SAMPLE) {
      return { returnRatePct: Math.round((1 - CHURN_DEFAULT_PROB) * 100), churnProb: CHURN_DEFAULT_PROB, sample, measured: false }
    }
    const returnRate = returned / sample
    const churnProb = Math.max(0.1, Math.min(0.9, 1 - returnRate))
    return { returnRatePct: Math.round(returnRate * 100), churnProb, sample, measured: true }
  } catch {
    return { returnRatePct: Math.round((1 - CHURN_DEFAULT_PROB) * 100), churnProb: CHURN_DEFAULT_PROB, sample: 0, measured: false }
  }
}

/**
 * Per-tier health diagnosis. For each tier, computes:
 *   - distribution of Active subscribers across zombie/light/regular/power buckets
 *   - retention/suspended/expired counts
 *   - a health score and verdict (healthy / watch / at_risk / critical / tiny)
 *   - diagnostic bullets (human-readable findings)
 *   - treatment hints with rough MRR-impact estimates
 *
 * The MRR impact estimates use conservative assumed success rates:
 *   - 50% of zombies can be saved by a re-engagement campaign (RETENTION_BOOST)
 *   - 50% of guest-pass power users convert to the cheapest paid tier (UPSELL)
 *   - 30% of suspended members can be reactivated (WINBACK)
 *
 * These assumptions are visible in the diagnostic strings so admins know
 * what they're betting on. Better than zero quantification — but not gospel.
 */
export async function getTierHealth(
  clubId: string,
  window?: TierWindowInput,
): Promise<TierHealthResult> {
  const win = resolveTierWindow(window)
  const [catalog, distribution, churnStats] = await Promise.all([
    getTierCatalog(clubId),
    // Pre-aggregate recent bookings FIRST (a small set — window/club/confirmed),
    // then join one row per user. The earlier version LEFT JOINed every
    // booking a follower ever made and filtered after, exploding to ~100s on
    // a 12k-follower club. This form runs in ~1s (EXPLAIN ANALYZE verified).
    // Buckets compare the per-30d-normalized rate (b × 30 / periodDays) so
    // light/regular/power keep their per-month meaning at any window length;
    // at the default 30d the edges are identical to the original BETWEEN logic.
    prisma.$queryRaw<HealthDistributionRow[]>`
      WITH recent AS (
        SELECT psb."userId" AS uid, COUNT(*)::int AS b30
        FROM play_session_bookings psb
        JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE ps."clubId" = ${clubId}
          AND psb.status = 'CONFIRMED'
          AND psb."bookedAt" >= ${win.start}
          AND psb."bookedAt" < ${win.end}
        GROUP BY psb."userId"
      )
      SELECT
        u.membership_type,
        COUNT(*) FILTER (WHERE u.membership_status = 'Active') AS active_count,
        COUNT(*) FILTER (WHERE u.membership_status = 'Suspended') AS suspended_count,
        COUNT(*) FILTER (WHERE u.membership_status = 'Expired') AS expired_count,
        COUNT(*) FILTER (WHERE u.membership_status = 'Active' AND COALESCE(r.b30, 0) = 0) AS zombies,
        COUNT(*) FILTER (WHERE u.membership_status = 'Active' AND COALESCE(r.b30, 0) > 0 AND COALESCE(r.b30, 0) * 30.0 / ${win.periodDays} < 4) AS light_users,
        COUNT(*) FILTER (WHERE u.membership_status = 'Active' AND COALESCE(r.b30, 0) * 30.0 / ${win.periodDays} >= 4 AND COALESCE(r.b30, 0) * 30.0 / ${win.periodDays} < 8) AS regular_users,
        COUNT(*) FILTER (WHERE u.membership_status = 'Active' AND COALESCE(r.b30, 0) * 30.0 / ${win.periodDays} >= 8) AS power_users,
        SUM(COALESCE(r.b30, 0)) FILTER (WHERE u.membership_status = 'Active') AS bookings_30d
      FROM users u
      JOIN club_followers cf ON cf.user_id = u.id
      LEFT JOIN recent r ON r.uid = u.id
      WHERE cf.club_id = ${clubId}
        AND u.membership_type IS NOT NULL
      GROUP BY u.membership_type
    `,
    // Churn measurement stays 30d-anchored regardless of the reporting window
    // — it's a retrospective cohort measurement, not a window-scoped count.
    getZombieChurnRate(clubId),
  ])

  const catalogByName = new Map<string, TierSpec>()
  catalog.forEach((t) => catalogByName.set(t.name, t))

  // Cheapest paid tier sets the price floor for upsell economics on free
  // tiers. Fall back to $14.99 (CR's typical Court Pass tier) if the club
  // has no paid tier on the catalog yet — defensive only.
  const paidPrices = catalog.filter((t) => !t.isFreeTier && t.monthlyPrice > 0).map((t) => t.monthlyPrice)
  const cheapestPaidPrice = paidPrices.length > 0 ? Math.min(...paidPrices) : 14.99
  const cheapestPaidTierName = paidPrices.length > 0
    ? catalog.filter((t) => !t.isFreeTier && t.monthlyPrice === cheapestPaidPrice)[0]?.name || 'cheapest paid tier'
    : 'the cheapest paid tier'

  const snapshots: TierHealthSnapshot[] = []
  let clubMRRAtRiskUsd = 0
  let clubUpsellPotentialMRRUsd = 0
  const countByVerdict: Record<TierHealthVerdict, number> = {
    healthy: 0,
    watch: 0,
    at_risk: 0,
    critical: 0,
    tiny: 0,
  }

  for (const u of distribution) {
    if (!u.membership_type) continue
    const spec = catalogByName.get(u.membership_type)
    const monthlyPrice = spec?.monthlyPrice ?? 0
    const annualPrice = spec?.annualPrice ?? 0
    const isFreeTier = monthlyPrice === 0 && annualPrice === 0

    const active = Number(u.active_count)
    const suspended = Number(u.suspended_count)
    const expired = Number(u.expired_count)
    const zombies = Number(u.zombies)
    const lightUsers = Number(u.light_users)
    const regularUsers = Number(u.regular_users)
    const powerUsers = Number(u.power_users)
    const bookings30d = Number(u.bookings_30d || 0)

    const inventory = active + suspended + expired
    const suspendedRatePct = inventory > 0 ? Math.round((suspended / inventory) * 100) : 0
    const zombieSharePct = active > 0 ? Math.round((zombies / active) * 100) : 0
    const powerUserSharePct = active > 0 ? Math.round((powerUsers / active) * 100) : 0
    const bookingsPerActive = active > 0
      ? Math.round((bookings30d / active) * 10) / 10
      : 0
    const estimatedMRR = isFreeTier ? 0 : Math.round(active * monthlyPrice)

    // ── MRR at risk: zombies on paid tiers, weighted by measured churn ─────
    // Not every zombie churns — this club's history shows ~churnProb of
    // silent members never return. So at-risk = zombies × churnProb × price,
    // grounded in real data rather than assuming all zombies walk.
    const mrrAtRiskUsd = isFreeTier
      ? 0
      : Math.round(zombies * churnStats.churnProb * monthlyPrice)
    // ── Upsell potential: power users on free tiers → cheapest paid tier ──
    const upsellPotentialMRRUsd = isFreeTier
      ? Math.round(powerUsers * cheapestPaidPrice)
      : 0

    // ── Verdict + healthScore ────────────────────────────────────────────
    let verdict: TierHealthVerdict
    let healthScore: number

    if (active < 5) {
      verdict = 'tiny'
      healthScore = 50 // neutral — not enough signal
    } else if (isFreeTier) {
      // Free tiers are scored on upsell potential and billing hygiene, not
      // engagement (you can't expect a pay-per-play guest to book daily).
      healthScore = Math.max(
        0,
        Math.min(100, Math.round(50 + powerUserSharePct * 2.5 - suspendedRatePct * 2)),
      )
      verdict = powerUsers >= 5 ? 'healthy' : healthScore >= 50 ? 'watch' : 'at_risk'
    } else {
      // Paid tier — zombie share is the primary signal. A 50% zombie rate
      // means every other paying subscriber is mentally checked out.
      const zombieScore = Math.max(0, 100 - 1.5 * zombieSharePct)
      const powerBonus = Math.min(20, powerUserSharePct * 0.5)
      const suspendedPenalty = 2 * suspendedRatePct
      healthScore = Math.max(0, Math.min(100, Math.round(zombieScore + powerBonus - suspendedPenalty)))
      if (zombieSharePct >= 65) verdict = 'critical'
      else if (zombieSharePct >= 45) verdict = 'at_risk'
      else if (zombieSharePct >= 25) verdict = 'watch'
      else verdict = 'healthy'
    }

    // ── Diagnostics + Treatments ─────────────────────────────────────────
    const diagnostics: string[] = []
    const treatments: TierTreatment[] = []

    if (verdict === 'tiny') {
      diagnostics.push(
        `Only ${active} active subscriber${active === 1 ? '' : 's'} — sample too small to diagnose. Either a niche tier or an inventory issue.`,
      )
    } else if (isFreeTier) {
      diagnostics.push(`${active} active free / comped / partner-program holders.`)
      if (powerUsers > 0) {
        const saveRate = 0.5
        const upsellSaved = Math.round(powerUsers * saveRate * cheapestPaidPrice)
        diagnostics.push(
          `💎 ${powerUsers} of those book 8+ times/month — they're already heavy users at pay-per-play rates and are prime upgrade candidates.`,
        )
        treatments.push({
          action: `Upsell ${powerUsers} power-user ${u.membership_type?.includes('Guest') ? 'guest pass holders' : 'free-tier holders'} to ${cheapestPaidTierName} ($${cheapestPaidPrice}/mo). Assuming 50% conversion = +$${upsellSaved}/mo MRR.`,
          campaignHint: 'UPSELL',
          potentialMRRImpactUsd: upsellSaved,
          targetMemberCount: powerUsers,
        })
      }
      if (suspendedRatePct > 5) {
        diagnostics.push(
          `⚠️ ${suspended} suspended (${suspendedRatePct}%) — unusual on a free tier; check whether the partner program's reconciliation feed is broken.`,
        )
      }
    } else {
      // Paid tier diagnostics
      if (zombieSharePct >= 25) {
        const severity =
          verdict === 'critical'
            ? '🔴 CRITICAL'
            : verdict === 'at_risk'
              ? '🔴 At risk'
              : '🟡 Watch'
        const churnNote = churnStats.measured
          ? `this club's history shows ~${100 - churnStats.returnRatePct}% of silent members never return`
          : `assuming ~${Math.round(churnStats.churnProb * 100)}% churn (not enough history to measure this club yet)`
        diagnostics.push(
          `${severity}: ${zombies} of ${active} active subscribers (${zombieSharePct}%) have 0 bookings ${win.windowText}. At ~$${mrrAtRiskUsd.toLocaleString('en-US')}/mo MRR genuinely at risk (${churnNote}).`,
        )
        const saveRate = 0.5
        const recoverable = Math.round(mrrAtRiskUsd * saveRate)
        treatments.push({
          action: `Send a win-back campaign to ${zombies} inactive subscriber${zombies === 1 ? '' : 's'} on ${u.membership_type}. Recovering half of the at-risk MRR = $${recoverable.toLocaleString('en-US')}/mo saved.`,
          campaignHint: 'RETENTION_BOOST',
          potentialMRRImpactUsd: recoverable,
          targetMemberCount: zombies,
        })
      } else {
        diagnostics.push(
          `🟢 ${active} active, only ${zombies} inactive (${zombieSharePct}%). Engagement looks healthy.`,
        )
      }

      if (powerUserSharePct >= 30 && monthlyPrice > 0 && monthlyPrice < 25) {
        diagnostics.push(
          `⚙️ Under-priced signal: ${powerUserSharePct}% of subscribers are power users on a $${monthlyPrice} tier — they may be getting more value than they pay for.`,
        )
        treatments.push({
          action: `Pricing review: ${u.membership_type} appears under-priced. Consider $5–10 increase or a usage cap. A $5 lift across ${active} active = +$${(active * 5).toLocaleString('en-US')}/mo MRR (before churn loss).`,
          campaignHint: 'PRICE_REVIEW',
          potentialMRRImpactUsd: active * 5,
          targetMemberCount: active,
        })
      }

      if (powerUserSharePct > 0) {
        diagnostics.push(
          `🟢 ${powerUsers} power user${powerUsers === 1 ? '' : 's'} (${powerUserSharePct}%) booking 8+ times/month — the core of this tier.`,
        )
      }

      if (suspendedRatePct >= 10) {
        const winbackPotential = Math.round(suspended * 0.3 * monthlyPrice)
        diagnostics.push(
          `⚠️ Elevated suspension rate (${suspendedRatePct}%, ${suspended} subscribers). Often indicates billing-failure cluster (expired cards, ACH bounces).`,
        )
        treatments.push({
          action: `Audit ${suspended} suspended ${u.membership_type} subscribers for billing-failure root cause, then run winback. Assuming 30% reactivate = $${winbackPotential.toLocaleString('en-US')}/mo recovered.`,
          campaignHint: 'BILLING_AUDIT',
          potentialMRRImpactUsd: winbackPotential,
          targetMemberCount: suspended,
        })
      }
    }

    clubMRRAtRiskUsd += mrrAtRiskUsd
    clubUpsellPotentialMRRUsd += upsellPotentialMRRUsd
    countByVerdict[verdict]++

    snapshots.push({
      name: u.membership_type,
      monthlyPrice,
      isFreeTier,
      active,
      suspended,
      expired,
      zombies,
      lightUsers,
      regularUsers,
      powerUsers,
      zombieSharePct,
      powerUserSharePct,
      suspendedRatePct,
      bookings30d,
      bookingsPerActive,
      estimatedMRR,
      mrrAtRiskUsd,
      upsellPotentialMRRUsd,
      verdict,
      healthScore,
      diagnostics,
      treatments,
    })
  }

  // Sort: critical → at_risk → watch → healthy → tiny, then by impact within bucket
  snapshots.sort((a, b) => {
    if (VERDICT_ORDER[a.verdict] !== VERDICT_ORDER[b.verdict]) {
      return VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]
    }
    return b.mrrAtRiskUsd + b.upsellPotentialMRRUsd - (a.mrrAtRiskUsd + a.upsellPotentialMRRUsd)
  })

  return {
    rollup: {
      clubMRRAtRiskUsd,
      clubUpsellPotentialMRRUsd,
      cheapestPaidMonthlyPrice: cheapestPaidPrice,
      countByVerdict,
      churnStats,
      periodDays: win.periodDays,
    },
    tiers: snapshots,
  }
}

/**
 * The member segment a tier treatment targets. Each value mirrors a bucket
 * counted in getTierHealth, so getTierAudience returns exactly the members
 * behind a treatment's `targetMemberCount`:
 *   - zombies   → Active subscribers with 0 confirmed bookings in 30d (RETENTION_BOOST)
 *   - power     → Active subscribers with ≥8 confirmed bookings in 30d (UPSELL on free tiers)
 *   - suspended → Suspended subscribers (BILLING_AUDIT)
 *   - active    → all Active subscribers (PRICE_REVIEW)
 *   - all       → the full tier inventory (Active + Suspended + Expired)
 */
export type TierAudienceBucket = 'zombies' | 'power' | 'suspended' | 'active' | 'all'

export interface TierAudienceResult {
  tierName: string
  bucket: TierAudienceBucket
  userIds: string[]
  memberCount: number
}

/**
 * Resolve the concrete member ids behind a tier + bucket, so the Campaign
 * Wizard can pre-scope its audience to exactly the members a Membership
 * Health treatment refers to (e.g. the 372 "zombie" subscribers on Open Play
 * Pass), rather than the goal's club-wide default set.
 *
 * Uses the same CONFIRMED-30d `recent` CTE as getTierHealth so the returned
 * count matches the treatment's targetMemberCount 1:1. `tierName` matches
 * users.membership_type verbatim (CR is the single source of truth). No
 * ::uuid cast — Sol2 stores club_id as TEXT.
 */
export async function getTierAudience(
  clubId: string,
  tierName: string,
  bucket: TierAudienceBucket,
  window?: TierWindowInput,
): Promise<TierAudienceResult> {
  const win = resolveTierWindow(window)
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH recent AS (
      SELECT psb."userId" AS uid, COUNT(*)::int AS b30
      FROM play_session_bookings psb
      JOIN play_sessions ps ON ps.id = psb."sessionId"
      WHERE ps."clubId" = ${clubId}
        AND psb.status = 'CONFIRMED'
        AND psb."bookedAt" >= ${win.start}
        AND psb."bookedAt" < ${win.end}
      GROUP BY psb."userId"
    )
    SELECT u.id
    FROM users u
    JOIN club_followers cf ON cf.user_id = u.id
    LEFT JOIN recent r ON r.uid = u.id
    WHERE cf.club_id = ${clubId}
      AND u.membership_type = ${tierName}
      AND (
        (${bucket} = 'zombies'   AND u.membership_status = 'Active'    AND COALESCE(r.b30, 0) = 0)
     OR (${bucket} = 'power'     AND u.membership_status = 'Active'    AND COALESCE(r.b30, 0) * 30.0 / ${win.periodDays} >= 8)
     OR (${bucket} = 'suspended' AND u.membership_status = 'Suspended')
     OR (${bucket} = 'active'    AND u.membership_status = 'Active')
     OR (${bucket} = 'all'       AND u.membership_status IN ('Active', 'Suspended', 'Expired'))
      )
  `

  const userIds = rows.map((r) => r.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
  return { tierName, bucket, userIds, memberCount: userIds.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier drill-down — the members behind a tier card's bucket counts
// ─────────────────────────────────────────────────────────────────────────────

export type TierMemberRow = {
  id: string
  name: string | null
  email: string | null
  membershipStatus: string | null
  /** Confirmed bookings inside the reporting window. */
  bookingsInWindow: number
  /** Most recent confirmed booking EVER (not window-scoped) — so a zombie still shows when they last played. */
  lastBookedAt: Date | null
  /** club_followers.created_at — when they joined this club. */
  joinedAt: Date | null
}

export type TierMembersResult = {
  tierName: string
  bucket: TierAudienceBucket
  periodDays: number
  /** Contracted catalog price — what each member on this tier pays (not actual transactions). */
  monthlyPrice: number
  isFreeTier: boolean
  totalCount: number
  /** Sorted by bookings-in-window desc, then most-recent-visit desc. Capped at 500. */
  members: TierMemberRow[]
}

type TierMemberQueryRow = {
  id: string
  name: string | null
  email: string | null
  membership_status: string | null
  b30: number | bigint | null
  last_at: Date | null
  joined_at: Date | null
  total: number | bigint
}

/**
 * The per-member detail behind getTierAudience's id list, for the Membership
 * Health drill-down drawer: who is in the bucket, how often they actually
 * attend, when they last played, when they joined. Same `recent` CTE and
 * bucket predicates as getTierHealth/getTierAudience, so the drawer's counts
 * match the tier card 1:1 for the same window.
 *
 * getTierAudience stays untouched (ids only) — the Campaign Wizard on branch
 * Sol2 consumes its shape.
 */
export async function getTierMembers(
  clubId: string,
  tierName: string,
  bucket: TierAudienceBucket,
  window?: TierWindowInput,
  limit = 500,
): Promise<TierMembersResult> {
  const win = resolveTierWindow(window)
  const cappedLimit = Math.min(Math.max(1, Math.round(limit)), 500)

  const [catalog, rows] = await Promise.all([
    getTierCatalog(clubId),
    prisma.$queryRaw<TierMemberQueryRow[]>`
      WITH recent AS (
        SELECT psb."userId" AS uid, COUNT(*)::int AS b30
        FROM play_session_bookings psb
        JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE ps."clubId" = ${clubId}
          AND psb.status = 'CONFIRMED'
          AND psb."bookedAt" >= ${win.start}
          AND psb."bookedAt" < ${win.end}
        GROUP BY psb."userId"
      ),
      last_play AS (
        SELECT psb."userId" AS uid, MAX(psb."bookedAt") AS last_at
        FROM play_session_bookings psb
        JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE ps."clubId" = ${clubId}
          AND psb.status = 'CONFIRMED'
        GROUP BY psb."userId"
      )
      SELECT
        u.id,
        u.name,
        u.email,
        u.membership_status,
        COALESCE(r.b30, 0) AS b30,
        lp.last_at,
        cf.created_at AS joined_at,
        COUNT(*) OVER() AS total
      FROM users u
      JOIN club_followers cf ON cf.user_id = u.id
      LEFT JOIN recent r ON r.uid = u.id
      LEFT JOIN last_play lp ON lp.uid = u.id
      WHERE cf.club_id = ${clubId}
        AND u.membership_type = ${tierName}
        AND (
          (${bucket} = 'zombies'   AND u.membership_status = 'Active'    AND COALESCE(r.b30, 0) = 0)
       OR (${bucket} = 'power'     AND u.membership_status = 'Active'    AND COALESCE(r.b30, 0) * 30.0 / ${win.periodDays} >= 8)
       OR (${bucket} = 'suspended' AND u.membership_status = 'Suspended')
       OR (${bucket} = 'active'    AND u.membership_status = 'Active')
       OR (${bucket} = 'all'       AND u.membership_status IN ('Active', 'Suspended', 'Expired'))
        )
      ORDER BY COALESCE(r.b30, 0) DESC, lp.last_at DESC NULLS LAST, u.name ASC NULLS LAST
      LIMIT ${cappedLimit}
    `,
  ])

  const spec = catalog.find((t) => t.name === tierName)
  const monthlyPrice = spec?.monthlyPrice ?? 0
  const annualPrice = spec?.annualPrice ?? 0

  return {
    tierName,
    bucket,
    periodDays: win.periodDays,
    monthlyPrice,
    isFreeTier: monthlyPrice === 0 && annualPrice === 0,
    totalCount: rows.length > 0 ? Number(rows[0].total) : 0,
    members: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      membershipStatus: r.membership_status,
      bookingsInWindow: Number(r.b30 ?? 0),
      lastBookedAt: r.last_at,
      joinedAt: r.joined_at,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier-compare booking series (WS7, operator feedback 1.2)
// ─────────────────────────────────────────────────────────────────────────────

export type TierSeriesBucket = {
  start: string
  label: string
  /** Confirmed bookings per selected tier in this bucket. */
  perTier: Record<string, number>
}

export type TierBookingSeriesResult = {
  granularity: 'day' | 'week' | 'month'
  periodDays: number
  tiers: Array<{ name: string; totalBookings: number }>
  buckets: TierSeriesBucket[]
}

const DAY_MS = 86_400_000

/**
 * Confirmed-booking time series for 2+ tiers on one shared axis — the
 * usage half of the tier-compare view. Same bucket-granularity rules as
 * the Programming Health series (≤14d daily / ≤120d weekly / else monthly)
 * so charts read consistently across pages. Counts bookings by bookedAt,
 * matching the engagement window semantics of getTierHealth.
 */
export async function getTierBookingSeries(
  clubId: string,
  tierNames: string[],
  window?: TierWindowInput,
): Promise<TierBookingSeriesResult> {
  const win = resolveTierWindow(window)
  const granularity: 'day' | 'week' | 'month' =
    win.periodDays <= 14 ? 'day' : win.periodDays <= 120 ? 'week' : 'month'

  const names = tierNames.filter((n) => n && n.trim()).slice(0, 8)
  if (names.length === 0) {
    return { granularity, periodDays: win.periodDays, tiers: [], buckets: [] }
  }

  const rows = await prisma.$queryRaw<Array<{ tier: string; at: Date }>>`
    SELECT u.membership_type AS tier, psb."bookedAt" AS at
    FROM play_session_bookings psb
    JOIN play_sessions ps ON ps.id = psb."sessionId"
    JOIN users u ON u.id = psb."userId"
    JOIN club_followers cf ON cf.user_id = u.id AND cf.club_id = ps."clubId"
    WHERE ps."clubId" = ${clubId}
      AND psb.status = 'CONFIRMED'
      AND psb."bookedAt" >= ${win.start}
      AND psb."bookedAt" < ${win.end}
      AND u.membership_type IN (${Prisma.join(names)})
  `

  // Bucket skeleton — calendar months, or fixed day/week bins from win.start.
  type Accum = { start: Date; label: string; perTier: Record<string, number> }
  const skeleton: Accum[] = []
  const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const monthLabel = (d: Date) =>
    `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(d.getUTCFullYear()).slice(2)}`

  if (granularity === 'month') {
    let y = win.start.getUTCFullYear()
    let m = win.start.getUTCMonth()
    while (y < win.end.getUTCFullYear() || (y === win.end.getUTCFullYear() && m <= win.end.getUTCMonth())) {
      const start = new Date(Date.UTC(y, m, 1))
      skeleton.push({ start, label: monthLabel(start), perTier: {} })
      m++
      if (m > 11) { m = 0; y++ }
    }
  } else {
    const binMs = (granularity === 'day' ? 1 : 7) * DAY_MS
    const numBins = Math.max(1, Math.ceil((win.end.getTime() - win.start.getTime()) / binMs))
    for (let i = 0; i < numBins; i++) {
      const start = new Date(win.start.getTime() + i * binMs)
      skeleton.push({ start, label: dayLabel(start), perTier: {} })
    }
  }

  const bucketIdx = (d: Date) => {
    if (granularity === 'month') {
      return (d.getUTCFullYear() - win.start.getUTCFullYear()) * 12 + (d.getUTCMonth() - win.start.getUTCMonth())
    }
    const binMs = (granularity === 'day' ? 1 : 7) * DAY_MS
    const idx = Math.floor((d.getTime() - win.start.getTime()) / binMs)
    return idx >= skeleton.length ? skeleton.length - 1 : idx
  }

  const totals = new Map<string, number>()
  for (const r of rows) {
    const d = r.at instanceof Date ? r.at : new Date(r.at)
    const idx = bucketIdx(d)
    if (idx < 0 || idx >= skeleton.length) continue
    skeleton[idx].perTier[r.tier] = (skeleton[idx].perTier[r.tier] ?? 0) + 1
    totals.set(r.tier, (totals.get(r.tier) ?? 0) + 1)
  }

  return {
    granularity,
    periodDays: win.periodDays,
    tiers: names.map((name) => ({ name, totalBookings: totals.get(name) ?? 0 })),
    buckets: skeleton.map((b) => {
      // Emit zeros for every selected tier so lines slope to zero, not break.
      const perTier: Record<string, number> = {}
      for (const name of names) perTier[name] = b.perTier[name] ?? 0
      return { start: b.start.toISOString().slice(0, 10), label: b.label, perTier }
    }),
  }
}
