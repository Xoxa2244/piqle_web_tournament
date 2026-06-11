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
  PRICE_REVIEW: 'Price review',
}

const CAMPAIGN_HINT_COLOR: Record<string, string> = {
  RETENTION_BOOST: '#8B5CF6',
  UPSELL: '#10B981',
  WINBACK: '#06B6D4',
  BILLING_AUDIT: '#94A3B8',
  PRICE_REVIEW: '#F59E0B',
}

// sol2-lean: CAMPAIGN_HINT_GOAL / CAMPAIGN_HINT_BUCKET (wizard deep-link
// mappings) removed with the "Campaign" button — restore from branch Sol2
// when Campaigns ships.

// ── Money-first design atoms (Claude Design port, 2026-06-11) ──

const fmtK = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `$${Math.round(n)}`

/** Short display name: drop "(Network)" + the pricing tail CR appends —
 *  kills the truncation problem on 80-char catalog names. Full name stays
 *  available via title tooltips. */
function shortTierName(name: string): { core: string; net: boolean } {
  const net = isNetworkTierName(name)
  let core = name.replace(/\s*\(Network\)\s*$/i, '').trim()
  core = core.split(/\s+[-—–]\s+(?=\$)/)[0]
  core = core.split(/:\s*(?=\$)/)[0]
  return { core: core.trim(), net }
}

/** Honesty badge — dotted-underline micro-caption with a tooltip. The
 *  estimated/measured caveats are first-class UI, not 11px footnote-only. */
function Honesty({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="uppercase cursor-help"
      style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--t4)', borderBottom: '1px dotted var(--t4)', paddingBottom: 1 }}
    >
      {children}
    </span>
  )
}

function VerdictDot({ v }: { v: Verdict }) {
  const c = (VERDICT_META[v] ?? VERDICT_META.tiny).color
  return <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 99, background: c, boxShadow: `0 0 8px ${c}66`, display: 'inline-block' }} />
}

function VerdictPill({ v }: { v: Verdict }) {
  const m = VERDICT_META[v] ?? VERDICT_META.tiny
  return (
    <span
      className="inline-flex items-center uppercase"
      style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: m.color, background: `${m.color}24`, border: `1px solid ${m.color}40`, padding: '3px 8px', borderRadius: 6 }}
    >
      {m.label}
    </span>
  )
}

function NetPill() {
  return (
    <span
      className="uppercase shrink-0"
      title="Chain-wide package — valid at every location in the network"
      style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: '#06B6D4', background: 'rgba(6,182,212,0.14)', border: '1px solid rgba(6,182,212,0.3)', padding: '2px 7px', borderRadius: 5 }}
    >
      Network
    </span>
  )
}

/**
 * "Save audience" — the non-dead-end treatment action while Campaigns is
 * gated. REAL: persists a dynamic audience via createCohort with the
 * treatment's canonical filters (zombies / free power users / suspended).
 */
function SaveAudienceBtn({ clubId, tierName, coreName, hint, count }: {
  clubId: string
  tierName: string
  coreName: string
  hint: string
  count: number
}) {
  const [saved, setSaved] = useState(false)
  const createMutation = trpc.intelligence.createCohort.useMutation({ onSuccess: () => setSaved(true) })

  const save = () => {
    const filters =
      hint === 'UPSELL'
        ? [
            { field: 'membershipType' as const, op: 'eq' as const, value: tierName },
            { field: 'frequency' as const, op: 'gte' as const, value: 8 },
          ]
        : hint === 'WINBACK' || hint === 'BILLING_AUDIT'
          ? [
              { field: 'membershipType' as const, op: 'eq' as const, value: tierName },
              { field: 'membershipStatus' as const, op: 'contains' as const, value: 'Suspend' },
            ]
          : [
              { field: 'membershipType' as const, op: 'eq' as const, value: tierName },
              { field: 'membershipStatus' as const, op: 'contains' as const, value: 'Active' },
              { field: 'recency' as const, op: 'gte' as const, value: 30 },
            ]
    createMutation.mutate({
      clubId,
      name: `${CAMPAIGN_HINT_LABEL[hint] || 'Audience'} — ${coreName}`,
      description: `Created from Membership Health treatment on "${tierName}"`,
      filters,
    })
  }

  if (saved) {
    return (
      <Link
        href={`/clubs/${clubId}/intelligence/cohorts`}
        className="inline-flex items-center gap-1.5 rounded-lg transition-all"
        style={{ fontSize: 12.5, fontWeight: 600, color: '#10B981', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', padding: '8px 14px' }}
      >
        ✓ Saved — open in Audiences <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    )
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={save}
        disabled={createMutation.isPending}
        className="inline-flex items-center gap-1.5 rounded-lg transition-all disabled:opacity-60 hover:bg-[rgba(139,92,246,0.16)]"
        style={{ fontSize: 12.5, fontWeight: 600, color: '#A855F7', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', padding: '8px 14px', cursor: 'pointer' }}
      >
        {createMutation.isPending ? 'Saving…' : <>＋ Save audience <span style={{ color: 'var(--t3)', fontWeight: 700 }}>· {count.toLocaleString()}</span></>}
      </button>
      {createMutation.isError && (
        <span className="text-[11px]" style={{ color: '#EF4444' }}>Couldn&apos;t save — try again</span>
      )}
    </div>
  )
}

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
 * Tier drawer — Money-first redesign (Claude Design port, 2026-06-11).
 * Top half = the design's tier overview: verdict header, MRR/at-risk
 * callout pair with honesty badges, 2×2 stats grid, compact diagnostic +
 * engine notes, treatments with a REAL "Save audience" action. Bottom half
 * = the member list (bucket tabs) so every number stays one click from the
 * people behind it. Same window as the page → counts match rows 1:1.
 * Clicking a member hands off to MemberDetailDrawer (z-50); the parent
 * unmounts this drawer (z-70) while it's open.
 */
function TierDrawer({
  clubId,
  tier: t,
  inNetwork,
  windowInput,
  periodDays,
  onClose,
  onOpenMember,
}: {
  clubId: string
  tier: Tier
  inNetwork: boolean
  windowInput: { periodDays?: number; startDate?: string; endDate?: string }
  periodDays: number
  onClose: () => void
  onOpenMember: (memberId: string) => void
}) {
  const { core, net } = shortTierName(t.name)
  const vm = VERDICT_META[t.verdict] ?? VERDICT_META.tiny
  const [bucket, setBucket] = useState<DrillBucket>(
    t.zombieSharePct >= 25 ? 'zombies' : t.isFreeTier ? 'power' : 'active',
  )
  const [showDetails, setShowDetails] = useState(false)

  const { data, isLoading } = trpc.intelligence.getTierMembers.useQuery(
    { clubId, tierName: t.name, bucket, ...windowInput },
    { staleTime: 60_000 },
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const members = data?.members ?? []
  const stats: Array<[string, string, string]> = [
    ['Zombie', `${t.zombieSharePct}%`, t.zombieSharePct >= 65 ? '#EF4444' : t.zombieSharePct >= 45 ? '#F97316' : 'var(--t2)'],
    ['Power', `${t.powerUserSharePct}%`, '#10B981'],
    [`Bookings · ${periodDays}d`, `${t.bookingsPerActive}/member`, 'var(--t2)'],
    ['Silent members', t.zombies.toLocaleString(), t.zombies > 0 ? '#EF4444' : 'var(--t2)'],
  ]
  const actionableTreatments = t.treatments.filter((tx) => tx.targetMemberCount > 0)

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
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label="Tier panel"
      >
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <VerdictPill v={t.verdict} />
                {net && inNetwork && <NetPill />}
              </div>
              <div title={t.name} style={{ fontSize: 19, fontWeight: 800, color: 'var(--heading)', lineHeight: 1.25 }}>{core}</div>
              <div className="text-xs mt-1.5" style={{ color: 'var(--t4)' }}>
                {t.isFreeTier ? 'Free' : `$${t.monthlyPrice}/mo`} · {t.active.toLocaleString()} active · health {t.healthScore}/100
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--card-border)', color: 'var(--t3)', width: 30, height: 30 }}
            >
              ✕
            </button>
          </div>

          {/* MRR callout pair */}
          <div className="flex gap-3 mt-5">
            <div className="flex-1 rounded-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', padding: '14px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--heading)', letterSpacing: '-0.02em' }}>
                {t.isFreeTier ? '—' : usd(t.estimatedMRR)}
              </div>
              <div className="mt-1">
                <Honesty title="Active members × contracted catalog price — not actual transactions">
                  {t.isFreeTier ? 'no MRR · free tier' : 'est. MRR'}
                </Honesty>
              </div>
            </div>
            <div className="flex-1 rounded-xl" style={{ background: t.isFreeTier ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: t.isFreeTier ? '1px solid rgba(16,185,129,0.22)' : '1px solid rgba(239,68,68,0.22)', padding: '14px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: t.isFreeTier ? '#10B981' : '#EF4444', letterSpacing: '-0.02em' }}>
                {t.isFreeTier ? usd(t.upsellPotentialMRRUsd) : usd(t.mrrAtRiskUsd)}
              </div>
              <div className="mt-1">
                <Honesty title={t.isFreeTier ? 'Free-tier power users × cheapest paid tier price' : "Silent members × this club's measured never-return rate × price"}>
                  {t.isFreeTier ? 'upsell potential' : 'at risk · measured'}
                </Honesty>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            {stats.map(([k, val, c]) => (
              <div key={k} className="rounded-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', padding: '12px 14px' }}>
                <div className="uppercase" style={{ fontSize: 10, color: 'var(--t4)', letterSpacing: '0.1em', marginBottom: 5 }}>{k}</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: c }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Diagnostic */}
          <div className="rounded-xl mt-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', padding: '14px 16px' }}>
            <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
              <span style={{ color: vm.color, fontWeight: 700 }}>
                {t.zombies.toLocaleString()} of {t.active.toLocaleString()} ({t.zombieSharePct}%)
              </span>{' '}
              have 0 bookings in the last {periodDays} days.{' '}
              <span style={{ color: '#10B981', fontWeight: 600 }}>{t.powerUsers.toLocaleString()} power users</span> ({t.powerUserSharePct}%) are the core of this tier.
            </div>
            {t.diagnostics.length > 0 && (
              <ul className="mt-2.5 pt-2.5 space-y-1" style={{ borderTop: '1px solid var(--card-border)' }}>
                {t.diagnostics.map((d, i) => (
                  <li key={i} className="text-[11px] flex gap-1.5" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                    <span>•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Treatments + Save audience (non-dead-end while Campaigns is gated) */}
          {actionableTreatments.length > 0 ? (
            <div className="space-y-3 mt-4">
              {actionableTreatments.map((tx, i) => {
                const color = CAMPAIGN_HINT_COLOR[tx.campaignHint] || '#8B5CF6'
                return (
                  <div key={i} className="rounded-xl" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.22)', padding: 18 }}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="uppercase"
                        style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color, background: `${color}1f`, border: `1px solid ${color}40`, padding: '2px 7px', borderRadius: 5 }}
                      >
                        {CAMPAIGN_HINT_LABEL[tx.campaignHint] || tx.campaignHint}
                      </span>
                      {tx.potentialMRRImpactUsd > 0 && (
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#10B981' }}>+{usd(tx.potentialMRRImpactUsd)}/mo potential</span>
                      )}
                    </div>
                    <p className="mb-4" style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.5 }}>{tx.action}</p>
                    {tx.campaignHint !== 'PRICE_REVIEW' && (
                      <SaveAudienceBtn
                        clubId={clubId}
                        tierName={t.name}
                        coreName={core}
                        hint={tx.campaignHint}
                        count={tx.targetMemberCount}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ) : t.verdict === 'healthy' ? (
            <div className="rounded-xl mt-4 flex items-center gap-2" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: 18, fontSize: 14, color: '#10B981', fontWeight: 600 }}>
              ✓ Healthy — no action needed on this tier.
            </div>
          ) : null}

          {/* Members — the people behind every number above */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4" style={{ color: 'var(--t3)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>Members</span>
              <span className="text-xs" style={{ color: 'var(--t4)' }}>
                {data ? `${data.totalCount.toLocaleString()} in this view · last ${periodDays}d` : '…'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {BUCKET_TABS.map((tab) => {
                const active = tab.key === bucket
                return (
                  <button
                    key={tab.key}
                    onClick={() => setBucket(tab.key)}
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
            {isLoading && (
              <div className="space-y-2 py-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
                ))}
              </div>
            )}
            {!isLoading && members.length === 0 && (
              <div className="text-sm text-center py-8" style={{ color: 'var(--t4)' }}>
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

          {/* Tier details (catalog) */}
          {(t.benefits.length > 0 || t.description || t.suspendDays != null) && (
            <div className="mt-4">
              <button
                onClick={() => setShowDetails((s) => !s)}
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--t4)' }}
              >
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showDetails ? 'Hide tier details' : 'Tier details'}
              </button>
              {showDetails && (
                <div className="mt-2 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
                  {t.description && (
                    <p className="text-xs mb-2" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>{t.description.slice(0, 280)}</p>
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-2" style={{ color: 'var(--t3)' }}>
                    {!t.isFreeTier && <span>${t.monthlyPrice}/mo · ${t.annualPrice}/yr</span>}
                    {t.suspendDays != null && <span>Suspend after {t.suspendDays}d past due</span>}
                    {t.cancelDays != null && <span>Cancel after {t.cancelDays}d past due</span>}
                  </div>
                  {t.benefits.length > 0 && (
                    <ul className="space-y-0.5">
                      {t.benefits.slice(0, 8).map((b, i) => (
                        <li key={i} className="text-xs flex gap-1.5" style={{ color: 'var(--t2)' }}>
                          <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#8B5CF6' }} />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 shrink-0"
          style={{ background: 'var(--bg, #0B0B14)', borderTop: '1px solid var(--card-border)' }}
        >
          <Link
            href={`/clubs/${clubId}/intelligence/members?tier=${encodeURIComponent(t.name)}`}
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

/**
 * Money-first tier row (Claude Design port). Width of the bar encodes MRR
 * share of the largest tier; the red segment is the at-risk share. Row
 * typography scales with money so the eye lands on the biggest tiers first.
 */
function MoneyTierRow({
  t,
  maxMRR,
  inNetwork,
  isOpen,
  isCompared,
  onOpen,
  onToggleCompare,
}: {
  t: Tier
  maxMRR: number
  inNetwork: boolean
  isOpen: boolean
  isCompared: boolean
  onOpen: () => void
  onToggleCompare: () => void
}) {
  const vm = VERDICT_META[t.verdict] ?? VERDICT_META.tiny
  const { core, net } = shortTierName(t.name)
  const barW = maxMRR > 0 ? Math.max(6, (t.estimatedMRR / maxMRR) * 100) : 6
  const riskW = t.estimatedMRR > 0 ? Math.min(100, (t.mrrAtRiskUsd / t.estimatedMRR) * 100) : 0
  const big = maxMRR > 0 && t.estimatedMRR >= maxMRR * 0.5 && t.estimatedMRR > 0
  const mid = !big && maxMRR > 0 && t.estimatedMRR >= maxMRR * 0.15 && t.estimatedMRR > 0
  const valSize = big ? 30 : mid ? 24 : 20

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="rounded-[14px] cursor-pointer transition-all"
      style={{
        background: isOpen ? 'rgba(255,255,255,0.06)' : 'var(--card-bg)',
        border: `1px solid ${isOpen ? `${vm.color}66` : 'var(--card-border)'}`,
        borderLeft: `3px solid ${vm.color}`,
        padding: big ? '20px 22px' : '15px 22px',
      }}
    >
      <div className="flex items-center gap-4 md:gap-[18px]">
        {/* identity */}
        <div className="shrink-0 min-w-0" style={{ width: 240 }}>
          <div className="flex items-center gap-2 mb-1">
            <VerdictDot v={t.verdict} />
            <span className="truncate" title={t.name} style={{ fontSize: 15, fontWeight: 700, color: 'var(--heading)' }}>{core}</span>
            {net && inNetwork && <NetPill />}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--t4)', paddingLeft: 16 }}>
            {t.isFreeTier ? 'Free' : `$${t.monthlyPrice}/mo`} · {t.active.toLocaleString()} active · health {t.healthScore}/100
          </div>
        </div>

        {/* proportional MRR bar */}
        <div className="flex-1 min-w-0">
          <div className="flex overflow-hidden" style={{ height: big ? 16 : 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
            <div className="flex overflow-hidden" style={{ width: `${barW}%`, height: '100%', borderRadius: 8 }}>
              <div style={{ width: `${100 - riskW}%`, background: t.estimatedMRR > 0 ? 'linear-gradient(90deg,#8B5CF6,#A855F7)' : '#94A3B8' }} />
              <div style={{ width: `${riskW}%`, background: '#EF4444' }} title={`${usd(t.mrrAtRiskUsd)} at risk`} />
            </div>
          </div>
          {t.mrrAtRiskUsd > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] mt-[5px]" style={{ color: 'var(--t4)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: '#EF4444', display: 'inline-block' }} />
              <span style={{ color: '#EF4444', fontWeight: 600 }}>{usd(t.mrrAtRiskUsd)} at risk</span>
              <span>· {t.zombieSharePct}% silent</span>
            </div>
          )}
          {t.isFreeTier && t.upsellPotentialMRRUsd > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] mt-[5px]" style={{ color: 'var(--t4)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: '#10B981', display: 'inline-block' }} />
              <span style={{ color: '#10B981', fontWeight: 600 }}>{usd(t.upsellPotentialMRRUsd)} upsell potential</span>
              <span>· {t.powerUserSharePct}% power</span>
            </div>
          )}
        </div>

        {/* money */}
        <div className="shrink-0 text-right" style={{ width: 110 }}>
          <div style={{ fontSize: valSize, fontWeight: 800, color: 'var(--heading)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {t.isFreeTier || t.estimatedMRR === 0 ? '—' : fmtK(t.estimatedMRR)}
          </div>
          <div className="mt-1">
            <Honesty title="Active members × contracted catalog price — not actual transactions">
              {t.isFreeTier || t.estimatedMRR === 0 ? 'no MRR' : 'est. MRR'}
            </Honesty>
          </div>
        </div>

        {/* compare + open affordances */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCompare() }}
            title={isCompared ? 'Remove from comparison' : 'Add to comparison (pick 2+)'}
            className="p-1.5 rounded-lg transition-colors"
            style={{
              background: isCompared ? 'rgba(139,92,246,0.18)' : 'transparent',
              color: isCompared ? '#A78BFA' : 'var(--t4)',
              border: `1px solid ${isCompared ? 'rgba(139,92,246,0.35)' : 'var(--card-border)'}`,
            }}
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
          </button>
          <span style={{ color: isOpen ? vm.color : 'var(--t4)', fontSize: 18 }}>›</span>
        </div>
      </div>
    </div>
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

  // Tier drawer (feedback 1.3 + Money-first redesign): which tier is open,
  // and which member's detail drawer is on top of it. While a member is open
  // the tier drawer unmounts (MemberDetailDrawer sits at z-50, below our
  // z-70) and remounts on close — the 60s query cache makes it instant.
  // Stored as the tier NAME so a period switch re-resolves fresh numbers.
  const [drillName, setDrillName] = useState<string | null>(null)
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

  // Money-first ordering: ranked by what each tier is worth. Free/empty-MRR
  // tiers sink to the bottom (their story is upsell, not revenue).
  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => (b.estimatedMRR - a.estimatedMRR) || (b.active - a.active)),
    [tiers],
  )
  const maxMRR = sortedTiers.length > 0 ? Math.max(...sortedTiers.map((t) => t.estimatedMRR)) : 0
  const drillTier = drillName ? tiers.find((t) => t.name === drillName) ?? null : null

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
          {networkSplit.perClubMembership.filledRows === 0 && (
            <p className="text-[11px] mt-1.5 flex items-center gap-1.5" style={{ color: "#F59E0B" }}>
              <span
                className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                style={{ background: "#F59E0B" }}
              />
              Per-location membership detail hasn&apos;t synced yet — it updates with the next CourtReserve sync cycle
              (within ~25 minutes).
            </p>
          )}
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

      {/* Money-first tier list (Claude Design port): ranked by what each
          tier is worth, bar width = MRR share, red = at-risk share. Click
          any row → tier drawer (overview + treatments + members). */}
      {tiers.length > 0 && (
        <div>
          <div className="flex items-center gap-[18px] text-[11px] mb-3 flex-wrap" style={{ color: 'var(--t4)' }}>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 18, height: 8, borderRadius: 4, background: 'linear-gradient(90deg,#8B5CF6,#A855F7)', display: 'inline-block' }} /> Secured MRR
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 18, height: 8, borderRadius: 4, background: '#EF4444', display: 'inline-block' }} /> At-risk MRR
            </span>
            <span className="ml-auto">Bar width = share of largest tier · click any row to open</span>
          </div>
          <div className="flex flex-col gap-2">
            {sortedTiers.map((t) => (
              <MoneyTierRow
                key={t.name}
                t={t}
                maxMRR={maxMRR}
                inNetwork={!!networkSplit?.inNetwork}
                isOpen={drillName === t.name}
                isCompared={compareSet.includes(t.name)}
                onOpen={() => setDrillName(t.name)}
                onToggleCompare={() => toggleCompare(t.name)}
              />
            ))}
          </div>
        </div>
      )}

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

      {/* Tier drawer (hidden while a member detail is on top) */}
      <AnimatePresence>
        {drillTier && !drillMemberId && (
          <TierDrawer
            key={drillTier.name}
            clubId={clubId}
            tier={drillTier}
            inNetwork={!!networkSplit?.inNetwork}
            windowInput={windowInput}
            periodDays={periodDays}
            onClose={() => setDrillName(null)}
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
