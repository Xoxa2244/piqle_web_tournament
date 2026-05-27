import 'server-only'

import { prisma } from '@/lib/prisma'

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
export async function getTierEconomics(clubId: string): Promise<TierEconomicsResult> {
  const [catalog, usage] = await Promise.all([
    getTierCatalog(clubId),
    // One pass over followers ⨯ bookings: counts per tier name. The booking
    // join is LEFT (not INNER) so tiers with zero activity in the last 30d
    // still surface with bookings_30d = 0. Active count uses CR's canonical
    // 'Active' status — confirmed via prod query that all 3 IPC clubs use
    // exactly that string (no 'Currently Active' variant on iqsport-prod).
    prisma.$queryRaw<UsageRow[]>`
      SELECT
        u.membership_type,
        COUNT(DISTINCT u.id) FILTER (WHERE u.membership_status = 'Active') AS active_members,
        COUNT(DISTINCT u.id) AS total_members,
        COUNT(DISTINCT psb.id) FILTER (
          WHERE psb.status = 'CONFIRMED'
          AND psb."bookedAt" >= NOW() - INTERVAL '30 days'
          AND ps."clubId" = ${clubId}
        ) AS bookings_30d
      FROM users u
      JOIN club_followers cf ON cf.user_id = u.id
      LEFT JOIN play_session_bookings psb ON psb."userId" = u.id
      LEFT JOIN play_sessions ps ON ps.id = psb."sessionId"
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
export async function getTierHealth(clubId: string): Promise<TierHealthResult> {
  const [catalog, distribution] = await Promise.all([
    getTierCatalog(clubId),
    prisma.$queryRaw<HealthDistributionRow[]>`
      WITH tier_users AS (
        SELECT
          u.id,
          u.membership_type,
          u.membership_status,
          COUNT(psb.id) FILTER (
            WHERE psb.status = 'CONFIRMED'
            AND psb."bookedAt" >= NOW() - INTERVAL '30 days'
            AND ps."clubId" = ${clubId}
          ) AS bookings_30d
        FROM users u
        JOIN club_followers cf ON cf.user_id = u.id
        LEFT JOIN play_session_bookings psb ON psb."userId" = u.id
        LEFT JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE cf.club_id = ${clubId}
        GROUP BY u.id, u.membership_type, u.membership_status
      )
      SELECT
        membership_type,
        COUNT(*) FILTER (WHERE membership_status = 'Active') AS active_count,
        COUNT(*) FILTER (WHERE membership_status = 'Suspended') AS suspended_count,
        COUNT(*) FILTER (WHERE membership_status = 'Expired') AS expired_count,
        COUNT(*) FILTER (WHERE membership_status = 'Active' AND bookings_30d = 0) AS zombies,
        COUNT(*) FILTER (WHERE membership_status = 'Active' AND bookings_30d BETWEEN 1 AND 3) AS light_users,
        COUNT(*) FILTER (WHERE membership_status = 'Active' AND bookings_30d BETWEEN 4 AND 7) AS regular_users,
        COUNT(*) FILTER (WHERE membership_status = 'Active' AND bookings_30d >= 8) AS power_users,
        SUM(bookings_30d) FILTER (WHERE membership_status = 'Active') AS bookings_30d
      FROM tier_users
      WHERE membership_type IS NOT NULL
      GROUP BY membership_type
    `,
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

    // ── MRR at risk: zombies on paid tiers ────────────────────────────────
    const mrrAtRiskUsd = isFreeTier
      ? 0
      : Math.round(zombies * monthlyPrice)
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
        diagnostics.push(
          `${severity}: ${zombies} of ${active} active subscribers (${zombieSharePct}%) have 0 bookings in the last 30 days. Estimated $${mrrAtRiskUsd.toLocaleString('en-US')}/mo MRR exposed to churn.`,
        )
        const saveRate = 0.5
        const recoverable = Math.round(mrrAtRiskUsd * saveRate)
        treatments.push({
          action: `Send re-engagement campaign to ${zombies} zombie subscriber${zombies === 1 ? '' : 's'} on ${u.membership_type}. Assuming 50% of them re-engage = $${recoverable.toLocaleString('en-US')}/mo MRR saved.`,
          campaignHint: 'RETENTION_BOOST',
          potentialMRRImpactUsd: recoverable,
          targetMemberCount: zombies,
        })
      } else {
        diagnostics.push(
          `🟢 ${active} active, only ${zombies} zombie (${zombieSharePct}%). Engagement looks healthy.`,
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
    },
    tiers: snapshots,
  }
}
