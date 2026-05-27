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
