'use client'

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import {
  Heart, DollarSign, AlertTriangle, TrendingUp, ChevronDown, ChevronUp,
  Sparkles, Activity, ShieldAlert, ArrowUpRight, X, Users, GitCompareArrows,
} from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend, ResponsiveContainer,
} from "recharts"
import { useTheme } from "../IQThemeProvider"
import { trpc } from "@/lib/trpc"
import { isNetworkTierName } from "@/lib/ai/network-tier"
import { PeriodSelector, type PeriodValue } from "../shared/PeriodSelector"
import { MemberDetailDrawer } from "../MemberDetailDrawer"

// ── Verdict styling ──
type Verdict = 'healthy' | 'watch' | 'at_risk' | 'critical' | 'tiny'
const VERDICT_META: Record<Verdict, { label: string; color: string }> = {
  critical: { label: 'Critical', color: '#EF4444' },
  at_risk: { label: 'At risk', color: '#F97316' },
  watch: { label: 'Watch', color: '#F59E0B' },
  healthy: { label: 'Healthy', color: '#10B981' },
  tiny: { label: 'Too small', color: '#94A3B8' },
}

const CAMPAIGN_HINT_LABEL: Record<string, string> = {
  RETENTION_BOOST: 'Re-engage',
  UPSELL: 'Upsell',
  WINBACK: 'Win back',
  BILLING_AUDIT: 'Billing audit',
  PRICE_REVIEW: 'Pricing',
}

// sol2-lean: CAMPAIGN_HINT_GOAL / CAMPAIGN_HINT_BUCKET (wizard deep-link
// mappings) removed with the "Campaign" button — restore from branch Sol2
// when Campaigns ships.

type Treatment = {
  action: string
  campaignHint: string
  potentialMRRImpactUsd: number
  targetMemberCount: number
}

type Tier = {
  name: string
  monthlyPrice: number
  annualPrice: number
  isFreeTier: boolean
  active: number
  suspended: number
  expired: number
  zombies: number
  powerUsers: number
  zombieSharePct: number
  powerUserSharePct: number
  suspendedRatePct: number
  bookings30d: number
  bookingsPerActive: number
  estimatedMRR: number
  mrrAtRiskUsd: number
  upsellPotentialMRRUsd: number
  verdict: Verdict
  healthScore: number
  diagnostics: string[]
  treatments: Treatment[]
  description: string
  benefits: string[]
  suspendDays: number | null
  cancelDays: number | null
}

// ── Tier drill-down drawer ──
type DrillBucket = 'all' | 'active' | 'zombies' | 'power' | 'suspended'

const BUCKET_TABS: { key: DrillBucket; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Top attendees' },
  { key: 'zombies', label: 'Zombies' },
  { key: 'power', label: 'Power / upsell' },
  { key: 'suspended', label: 'Suspended' },
]

const daysAgo = (d: string | Date | null) => {
  if (!d) return null
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  return days <= 0 ? 'today' : `${days}d ago`
}

// Line colors for the tier-compare chart (cycled by selection order).
const COMPARE_PALETTE = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#84CC16']

/**
 * Tier-compare panel (WS7, operator feedback 1.2): side-by-side metrics for
 * the selected tiers (numbers come from the SAME payload as the cards, so
 * they always agree) + a confirmed-bookings trend line per tier over the
 * page's window (getTierSeries).
 */
function TierComparePanel({
  clubId,
  tiers,
  selected,
  windowInput,
  periodDays,
  onToggle,
  onClear,
}: {
  clubId: string
  tiers: Tier[]
  selected: string[]
  windowInput: { periodDays?: number; startDate?: string; endDate?: string }
  periodDays: number
  onToggle: (name: string) => void
  onClear: () => void
}) {
  const seriesQuery = trpc.intelligence.getTierSeries.useQuery(
    { clubId, tierNames: selected, ...windowInput },
    { enabled: selected.length >= 2, staleTime: 60_000 },
  )
  const series = seriesQuery.data

  const chartRows = (series?.buckets ?? []).map((b) => {
    const row: Record<string, number | string> = { label: b.label }
    for (const name of selected) row[name] = b.perTier[name] ?? 0
    return row
  })

  const selectedTiers = selected
    .map((name) => tiers.find((t) => t.name === name))
    .filter((t): t is Tier => !!t)

  const metricRows: Array<{ label: string; value: (t: Tier) => string; color?: (t: Tier) => string | undefined }> = [
    { label: 'Active members', value: (t) => t.active.toLocaleString() },
    { label: 'Est. MRR', value: (t) => (t.isFreeTier ? '—' : usd(t.estimatedMRR)) },
    { label: 'Bookings/active', value: (t) => String(t.bookingsPerActive) },
    {
      label: 'Zombie share',
      value: (t) => `${t.zombieSharePct}%`,
      color: (t) => (t.zombieSharePct >= 45 ? '#EF4444' : t.zombieSharePct >= 25 ? '#F59E0B' : undefined),
    },
    { label: 'Power share', value: (t) => `${t.powerUserSharePct}%` },
    {
      label: 'Suspended rate',
      value: (t) => `${t.suspendedRatePct}%`,
      color: (t) => (t.suspendedRatePct >= 10 ? '#F59E0B' : undefined),
    },
    { label: 'MRR at risk', value: (t) => (t.mrrAtRiskUsd > 0 ? usd(t.mrrAtRiskUsd) : '—'), color: (t) => (t.mrrAtRiskUsd > 0 ? '#EF4444' : undefined) },
  ]

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="w-4 h-4" style={{ color: '#8B5CF6' }} />
          <h3 className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
            Compare tiers <span style={{ color: 'var(--t4)', fontWeight: 500 }}>· last {periodDays}d</span>
          </h3>
        </div>
        <button onClick={onClear} className="text-xs hover:underline" style={{ color: 'var(--t4)' }}>
          Clear comparison
        </button>
      </div>

      {/* Metric table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="text-left py-1.5 pr-3 font-semibold" style={{ color: 'var(--t4)' }}>Metric</th>
              {selectedTiers.map((t, i) => (
                <th key={t.name} className="text-right py-1.5 px-3" style={{ color: COMPARE_PALETTE[i % COMPARE_PALETTE.length], fontWeight: 700 }}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="truncate max-w-[180px] inline-block align-bottom" title={t.name}>{t.name}</span>
                    <button onClick={() => onToggle(t.name)} aria-label={`Remove ${t.name} from comparison`} style={{ color: 'var(--t4)' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((m) => (
              <tr key={m.label} style={{ borderTop: '1px solid var(--card-border)' }}>
                <td className="py-1.5 pr-3" style={{ color: 'var(--t3)' }}>{m.label}</td>
                {selectedTiers.map((t) => (
                  <td key={t.name} className="text-right py-1.5 px-3 tabular-nums" style={{ color: m.color?.(t) ?? 'var(--t1, var(--heading))', fontWeight: 600 }}>
                    {m.value(t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Usage trend */}
      <div className="mt-4">
        {seriesQuery.isLoading ? (
          <div className="h-[220px] flex items-center justify-center text-sm" style={{ color: 'var(--t3)' }}>Loading trend…</div>
        ) : series && chartRows.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} allowDecimals={false} />
              <ChartTooltip
                contentStyle={{
                  background: 'var(--tooltip-bg)',
                  border: '1px solid var(--tooltip-border)',
                  borderRadius: 12,
                  color: 'var(--tooltip-color)',
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {selected.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  name={name.length > 36 ? `${name.slice(0, 36)}…` : name}
                  stroke={COMPARE_PALETTE[i % COMPARE_PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : null}
        <p className="text-[11px] mt-2" style={{ color: 'var(--t4)' }}>
          Trend = confirmed bookings per {series?.granularity ?? 'period'} for each tier (booking date). Retention proxies:
          suspended/expired rates above; status-transition history lands once per-club membership sync accumulates.
        </p>
      </div>
    </Card>
  )
}

/**
 * Right-side drawer listing the members behind a tier card's bucket counts
 * (operator feedback 1.3 — who attends most, what each pays, upsell
 * candidates). Same window as the page, so counts match the card 1:1.
 * Clicking a row hands off to the shared MemberDetailDrawer (z-50), so this
 * drawer is hidden by the parent while a member is open.
 */
function TierDrillDrawer({
  clubId,
  tierName,
  bucket,
  onBucketChange,
  windowInput,
  periodDays,
  onClose,
  onOpenMember,
}: {
  clubId: string
  tierName: string
  bucket: DrillBucket
  onBucketChange: (b: DrillBucket) => void
  windowInput: { periodDays?: number; startDate?: string; endDate?: string }
  periodDays: number
  onClose: () => void
  onOpenMember: (memberId: string) => void
}) {
  const { data, isLoading } = trpc.intelligence.getTierMembers.useQuery(
    { clubId, tierName, bucket, ...windowInput },
    { staleTime: 60_000 },
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const members = data?.members ?? []

  return (
    <>
      <motion.div
        key="tier-drill-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <motion.aside
        key="tier-drill-drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="fixed top-0 right-0 z-[70] h-screen flex flex-col"
        style={{
          width: 'min(520px, 100vw)',
          background: 'var(--bg, #0B0B14)',
          borderLeft: '1px solid var(--card-border)',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label="Tier members panel"
      >
        {/* Header */}
        <div
          className="px-5 py-4 sticky top-0 z-10"
          style={{ background: 'var(--bg, #0B0B14)', borderBottom: '1px solid var(--card-border)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--t3)' }} />
              <h3 className="truncate" style={{ fontSize: 15, fontWeight: 700, color: 'var(--heading)' }}>{tierName}</h3>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg" style={{ color: 'var(--t3)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>
            {data ? (
              <>
                {data.totalCount.toLocaleString()} member{data.totalCount === 1 ? '' : 's'} · last {periodDays}d
                {!data.isFreeTier && <> · ${data.monthlyPrice}/mo each (contracted)</>}
              </>
            ) : 'Loading…'}
          </div>
          {/* Bucket tabs */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {BUCKET_TABS.map((tab) => {
              const active = tab.key === bucket
              return (
                <button
                  key={tab.key}
                  onClick={() => onBucketChange(tab.key)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
                  style={{
                    background: active ? 'var(--accent, #A855F7)' : 'var(--subtle)',
                    color: active ? '#fff' : 'var(--t2)',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Member rows */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading && (
            <div className="space-y-2 px-2 py-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          )}
          {!isLoading && members.length === 0 && (
            <div className="text-sm text-center py-10" style={{ color: 'var(--t4)' }}>
              No members in this bucket for the selected period.
            </div>
          )}
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => onOpenMember(m.id)}
              className="w-full text-left px-2 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors hover:bg-white/5"
            >
              <div className="min-w-0">
                <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1, var(--heading))' }}>
                  {m.name || m.email || 'Unnamed member'}
                </div>
                <div className="truncate text-xs" style={{ color: 'var(--t4)' }}>
                  {m.email || '—'}
                  {m.joinedAt && <> · joined {new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div style={{ fontSize: 13, fontWeight: 700, color: m.bookingsInWindow === 0 ? '#EF4444' : 'var(--t2)' }}>
                  {m.bookingsInWindow} booking{m.bookingsInWindow === 1 ? '' : 's'}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--t4)' }}>
                  {m.lastBookedAt ? `last ${daysAgo(m.lastBookedAt)}` : 'never played'}
                </div>
              </div>
            </button>
          ))}
          {data && data.totalCount > members.length && (
            <div className="text-[11px] text-center py-2" style={{ color: 'var(--t4)' }}>
              Showing first {members.length} of {data.totalCount.toLocaleString()} — open in Members for the full list.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3"
          style={{ background: 'var(--bg, #0B0B14)', borderTop: '1px solid var(--card-border)' }}
        >
          <Link
            href={`/clubs/${clubId}/intelligence/members?tier=${encodeURIComponent(tierName)}`}
            className="inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: 'var(--accent, #A855F7)' }}
          >
            View in Members <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </motion.aside>
    </>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  )
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--t4)" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 800, color: color || "var(--heading)" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "var(--t4)" }}>{sub}</div>}
    </Card>
  )
}

export function MembershipHealthIQ({ clubId }: { clubId: string }) {
  const { isDark } = useTheme()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodValue>({ kind: 'days', days: 30 })

  // Default 30d sends the bare input — same cache key + byte-identical
  // backend path as before the selector existed.
  const { data, isLoading } = trpc.intelligence.getMembershipHealth.useQuery(
    period.kind === 'days'
      ? (period.days === 30 ? { clubId } : { clubId, periodDays: period.days })
      : { clubId, startDate: period.start, endDate: period.end },
    { enabled: !!clubId, staleTime: 60_000 },
  )

  const tiers = (data?.tiers as Tier[] | undefined) || []
  const rollup = data?.rollup
  const periodDays = rollup?.periodDays ?? (period.kind === 'days' ? period.days : 30)

  // Network vs single-club split (WS6c) — renders only for clubs grouped
  // into a club_network (the IPC chain today).
  const { data: networkSplit } = trpc.intelligence.getNetworkMembershipSplit.useQuery(
    { clubId },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )

  // Tier drill-down (feedback 1.3): which tier+bucket is open, and which
  // member's detail drawer is on top of it. While a member is open the tier
  // drawer unmounts (MemberDetailDrawer sits at z-50, below our z-70) and
  // remounts on close — the 60s query cache makes the round-trip instant.
  const [drill, setDrill] = useState<{ tierName: string; bucket: DrillBucket } | null>(null)
  const [drillMemberId, setDrillMemberId] = useState<string | null>(null)
  // Tier-compare selection (WS7) — pick 2+ tiers via the card checkboxes.
  const [compareSet, setCompareSet] = useState<string[]>([])
  const toggleCompare = (name: string) =>
    setCompareSet((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name].slice(0, 8)))
  const windowInput = useMemo(
    () =>
      period.kind === 'days'
        ? (period.days === 30 ? {} : { periodDays: period.days })
        : { startDate: period.start, endDate: period.end },
    [period],
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1100px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Membership Health</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>
            Every tier scored on engagement, revenue and churn risk — with what to do about it
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <PeriodSelector value={period} onChange={setPeriod} />
          {rollup?.catalogSyncedAt && (
            <span className="text-xs" style={{ color: "var(--t4)" }}>
              Synced {new Date(rollup.catalogSyncedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" }} />
          ))}
        </div>
      )}

      {!isLoading && tiers.length === 0 && (
        <Card>
          <div className="flex items-center gap-3 py-6 justify-center text-center">
            <Heart className="w-5 h-5" style={{ color: "var(--t4)" }} />
            <span className="text-sm" style={{ color: "var(--t3)" }}>
              No membership tiers synced yet. Connect CourtReserve to populate tier health.
            </span>
          </div>
        </Card>
      )}

      {/* Rollup strip */}
      {rollup && tiers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Est. MRR" value={usd(rollup.totalMRR)} sub={`${rollup.totalActiveSubscribers.toLocaleString()} active`} />
          <StatTile
            label="MRR at risk"
            value={usd(rollup.clubMRRAtRiskUsd)}
            sub={rollup.churnStats?.measured
              ? `${100 - rollup.churnStats.returnRatePct}% of silent members churn (measured)`
              : "zombies weighted by est. churn"}
            color={rollup.clubMRRAtRiskUsd > 0 ? "#EF4444" : undefined}
          />
          <StatTile label="Upsell potential" value={usd(rollup.clubUpsellPotentialMRRUsd)} sub="free power users" color={rollup.clubUpsellPotentialMRRUsd > 0 ? "#10B981" : undefined} />
          <StatTile
            label="Tier verdicts"
            value={`${(rollup.countByVerdict?.critical || 0) + (rollup.countByVerdict?.at_risk || 0)} need action`}
            sub={`${rollup.countByVerdict?.healthy || 0} healthy · ${rollup.countByVerdict?.watch || 0} watch`}
          />
        </div>
      )}

      {/* Network split (WS6c) — operator 1.1: network vs non-network */}
      {networkSplit?.inNetwork && tiers.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full"
                style={{ background: "rgba(6,182,212,0.15)", color: "#06B6D4", fontWeight: 700 }}
              >
                Network
              </span>
              <span className="text-sm font-bold" style={{ color: "var(--heading)" }}>
                {networkSplit.networkName || "Club network"}
              </span>
              <span className="text-xs" style={{ color: "var(--t4)" }}>
                {networkSplit.siblingClubs.length + 1} locations
              </span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: "var(--t3)" }}>
              <span>
                <strong style={{ color: "#06B6D4" }}>{networkSplit.rollup.networkMembers.toLocaleString()}</strong> network members
              </span>
              <span>
                <strong style={{ color: "var(--heading)" }}>{networkSplit.rollup.singleClubMembers.toLocaleString()}</strong> single-club
              </span>
              <span title="Hold a membership row at more than one location">
                <strong style={{ color: "var(--heading)" }}>{networkSplit.rollup.multiClubMembers.toLocaleString()}</strong> registered at 2+ locations
              </span>
              <span title="Confirmed booking at a sibling location in the last 90 days">
                <strong style={{ color: "var(--heading)" }}>{networkSplit.rollup.crossClubVisitors90d.toLocaleString()}</strong> visited a sibling location · 90d
              </span>
            </div>
          </div>
          <p className="text-[11px] mt-2" style={{ color: "var(--t4)" }}>
            Network member = active subscriber on a &ldquo;(Network)&rdquo; package (chain-wide access). Many network members still
            prefer one location — the &ldquo;visited a sibling&rdquo; count shows actual cross-location usage. Sibling-club data is
            aggregate only.
          </p>
        </Card>
      )}

      {/* Tier compare (WS7) — appears once 2+ tiers are ticked below */}
      {compareSet.length >= 2 && (
        <TierComparePanel
          clubId={clubId}
          tiers={tiers}
          selected={compareSet}
          windowInput={windowInput}
          periodDays={periodDays}
          onToggle={toggleCompare}
          onClear={() => setCompareSet([])}
        />
      )}

      {/* Per-tier cards */}
      <div className="space-y-3">
        {tiers.map((t) => {
          const vm = VERDICT_META[t.verdict] ?? VERDICT_META.tiny
          const isOpen = expanded === t.name
          return (
            <Card key={t.name}>
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: `${vm.color}20`, color: vm.color, fontWeight: 700 }}
                    >
                      {vm.label}
                    </span>
                    <h3 className="truncate" style={{ fontSize: "15px", fontWeight: 700, color: "var(--heading)" }}>
                      {t.name}
                    </h3>
                    {networkSplit?.inNetwork && isNetworkTierName(t.name) && (
                      <span
                        className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: "rgba(6,182,212,0.15)", color: "#06B6D4", fontWeight: 700 }}
                        title="Chain-wide package — valid at every location in the network"
                      >
                        Network
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                    {t.isFreeTier ? "Free / comped / partner" : `$${t.monthlyPrice}/mo`}
                    {" · "}health {t.healthScore}/100
                  </div>
                </div>
                <div className="flex items-start gap-3 shrink-0">
                  <div className="text-right">
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--heading)" }}>
                      {t.isFreeTier ? "—" : usd(t.estimatedMRR)}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--t4)" }}>{t.isFreeTier ? "no MRR" : "MRR"}</div>
                  </div>
                  <button
                    onClick={() => toggleCompare(t.name)}
                    title={compareSet.includes(t.name) ? "Remove from comparison" : "Add to comparison (pick 2+)"}
                    className="mt-0.5 p-1.5 rounded-lg transition-colors"
                    style={{
                      background: compareSet.includes(t.name) ? "rgba(139,92,246,0.18)" : "var(--subtle)",
                      color: compareSet.includes(t.name) ? "#A78BFA" : "var(--t4)",
                      border: `1px solid ${compareSet.includes(t.name) ? "rgba(139,92,246,0.35)" : "var(--card-border)"}`,
                    }}
                  >
                    <GitCompareArrows className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Signals — chips drill into the members behind each count */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs" style={{ color: "var(--t3)" }}>
                <button
                  onClick={() => setDrill({ tierName: t.name, bucket: 'active' })}
                  className="hover:underline cursor-pointer"
                  style={{ color: 'inherit' }}
                  title="See the members on this tier"
                >
                  <Activity className="w-3 h-3 inline mr-1" style={{ color: "var(--t4)" }} />{t.active.toLocaleString()} active
                </button>
                <button
                  onClick={() => setDrill({ tierName: t.name, bucket: 'zombies' })}
                  className="hover:underline cursor-pointer"
                  style={{ color: t.zombieSharePct >= 45 ? "#EF4444" : t.zombieSharePct >= 25 ? "#F59E0B" : "var(--t3)" }}
                  title="See the zombie members (active membership, 0 bookings)"
                >
                  {t.zombieSharePct}% zombie
                </button>
                <button
                  onClick={() => setDrill({ tierName: t.name, bucket: 'power' })}
                  className="hover:underline cursor-pointer"
                  style={{ color: 'inherit' }}
                  title="See the power users (8+ bookings/month)"
                >
                  {t.powerUserSharePct}% power
                </button>
                {t.suspendedRatePct >= 10 && (
                  <button
                    onClick={() => setDrill({ tierName: t.name, bucket: 'suspended' })}
                    className="hover:underline cursor-pointer"
                    style={{ color: "#F59E0B" }}
                    title="See the suspended members"
                  >
                    {t.suspendedRatePct}% suspended
                  </button>
                )}
                <span>{t.bookingsPerActive}/member · {periodDays}d</span>
                {!t.isFreeTier && t.mrrAtRiskUsd > 0 && <span style={{ color: "#EF4444" }}>{usd(t.mrrAtRiskUsd)} at risk</span>}
                {t.isFreeTier && t.upsellPotentialMRRUsd > 0 && <span style={{ color: "#10B981" }}>{usd(t.upsellPotentialMRRUsd)} upsell</span>}
              </div>

              {/* Diagnostics */}
              {t.diagnostics.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {t.diagnostics.map((d, i) => (
                    <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--t2)", lineHeight: 1.5 }}>
                      <span style={{ color: "var(--t4)" }}>•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Treatments */}
              {t.treatments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {t.treatments.map((tx, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-3 flex items-start justify-between gap-3"
                      style={{ background: isDark ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)" }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.18)", color: "#8B5CF6", fontWeight: 700 }}>
                            {CAMPAIGN_HINT_LABEL[tx.campaignHint] || tx.campaignHint}
                          </span>
                          {tx.potentialMRRImpactUsd > 0 && (
                            <span className="text-xs" style={{ color: "#10B981", fontWeight: 700 }}>
                              +{usd(tx.potentialMRRImpactUsd)}/mo potential
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: "var(--t2)", lineHeight: 1.5 }}>{tx.action}</p>
                      </div>
                      {/* sol2-lean: the "Campaign" deep-link is hidden while
                          Campaigns is gated (Coming Soon). Restore the Link
                          (see branch Sol2) when Campaigns ships. */}
                    </div>
                  ))}
                </div>
              )}

              {/* Expand: catalog detail */}
              {(t.benefits.length > 0 || t.description || t.suspendDays != null) && (
                <>
                  <button
                    onClick={() => setExpanded(isOpen ? null : t.name)}
                    className="mt-3 inline-flex items-center gap-1 text-xs"
                    style={{ color: "var(--t4)" }}
                  >
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {isOpen ? "Hide details" : "Tier details"}
                  </button>
                  {isOpen && (
                    <div className="mt-2 pt-3" style={{ borderTop: "1px solid var(--card-border)" }}>
                      {t.description && (
                        <p className="text-xs mb-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>{t.description.slice(0, 280)}</p>
                      )}
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-2" style={{ color: "var(--t3)" }}>
                        {!t.isFreeTier && <span>${t.monthlyPrice}/mo · ${t.annualPrice}/yr</span>}
                        {t.suspendDays != null && <span>Suspend after {t.suspendDays}d past due</span>}
                        {t.cancelDays != null && <span>Cancel after {t.cancelDays}d past due</span>}
                      </div>
                      {t.benefits.length > 0 && (
                        <ul className="space-y-0.5">
                          {t.benefits.slice(0, 8).map((b, i) => (
                            <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--t2)" }}>
                              <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#8B5CF6" }} />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </Card>
          )
        })}
      </div>

      {/* Methodology footnote */}
      {tiers.length > 0 && (
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--t4)" }}>
          Zombie = active subscriber with 0 bookings in the selected period ({periodDays} days). Power user = 8+ bookings/month
          {periodDays !== 30 ? " (normalized to the period length)" : ""}. Est. MRR = active × monthly price
          (contracted, not actual transactions). Booking activity is counted by booking date within the period.{" "}
          {rollup?.churnStats?.measured
            ? `MRR at risk = zombies × this club's measured churn rate (${100 - rollup.churnStats.returnRatePct}% of silent members historically never return, from ${rollup.churnStats.sample} past cases), not a blanket assumption.`
            : `MRR at risk weights zombies by an estimated churn rate (not enough booking history yet to measure this club's actual rate).`}{" "}
          Treatment $ assumes a campaign recovers half of the at-risk — a rough guide for prioritisation, not a guarantee.
        </p>
      )}

      {/* Tier drill-down drawer (hidden while a member detail is on top) */}
      <AnimatePresence>
        {drill && !drillMemberId && (
          <TierDrillDrawer
            clubId={clubId}
            tierName={drill.tierName}
            bucket={drill.bucket}
            onBucketChange={(b) => setDrill({ tierName: drill.tierName, bucket: b })}
            windowInput={windowInput}
            periodDays={periodDays}
            onClose={() => setDrill(null)}
            onOpenMember={setDrillMemberId}
          />
        )}
      </AnimatePresence>
      {drillMemberId && (
        <MemberDetailDrawer
          memberId={drillMemberId}
          clubId={clubId}
          onClose={() => setDrillMemberId(null)}
        />
      )}
    </motion.div>
  )
}
