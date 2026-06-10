'use client'

/**
 * SessionRevenueCard — Dashboard tile pairing "Sessions by Format" (volume)
 * with money: slot-priced session revenue for the dashboard's period.
 *
 * Fills the right cell of the Dashboard's two-column grid that has been
 * empty since the AI-Attributed Revenue tile was removed (6ca622c0).
 * Data: intelligence.getRevenueAnalytics (pricePerSlot × registered) —
 * honest per-session revenue only, so membership-covered Open Play counts
 * as $0 by design and clinics/leagues carry the number. Membership clubs
 * additionally get their real revenue — MRR from getMembershipHealth
 * (tier economics) — as a secondary stat, and as the LEAD stat when no
 * session revenue exists. Distinct states: loading skeleton, query error,
 * missed-only ($0 collected but priced seats went unsold), MRR-led
 * (membership club, no priced sessions), and a true empty state.
 */

import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { trpc } from '@/lib/trpc'
import { useRevenueAnalytics } from '../../../_hooks/use-intelligence'

const FORMAT_LABELS: Record<string, string> = {
  OPEN_PLAY: 'Open Play',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  LEAGUE_PLAY: 'League',
  SOCIAL: 'Social',
}

type RevenueFormatRow = { format: string; revenue: number; sessions: number; pct: number }

// Static numbers for ?demo=true (the real query is disabled in demo mode) —
// covers every field of the getRevenueAnalytics return the card reads.
const DEMO_REVENUE = {
  totalRevenue: 12840,
  prevTotalRevenue: 11220,
  revenueByFormat: [
    { format: 'CLINIC', revenue: 6900, sessions: 24, pct: 54 },
    { format: 'LEAGUE_PLAY', revenue: 4180, sessions: 11, pct: 33 },
    { format: 'SOCIAL', revenue: 1760, sessions: 6, pct: 13 },
  ],
  dailyRevenue: Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    return {
      date: d.toISOString().slice(0, 10),
      revenue: [320, 410, 0, 510, 380, 640, 290][i % 7] + (i % 5) * 40,
    }
  }),
  lostRevenue: { emptySlots: 2140, cancelled: 480, noShows: 310, total: 2930 },
  activeMembers: 184,
  prevActiveMembers: 171,
  totalSessions: 96,
  prevTotalSessions: 90,
  avgOccupancy: 71,
}

const DEMO_MRR = { totalMRR: 24300, totalActiveSubscribers: 186 }

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

// Backend dates are ISO yyyy-mm-dd — render as "May 28" in the tooltip.
const fmtDay = (raw: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : raw

export function SessionRevenueCard({
  clubId,
  isDemo,
  days = 30,
  periodLabel = 'Last 30 days',
}: {
  clubId: string
  isDemo?: boolean
  days?: number
  periodLabel?: string
}) {
  // Empty clubId in demo mode keeps the hook's `enabled` gate off even if
  // the isDemo prop and the ?demo=true URL param ever diverge.
  const { data: realData, isLoading, error } = useRevenueAnalytics(isDemo ? '' : clubId, days)
  const data = isDemo ? DEMO_REVENUE : realData
  const hasRevenue = !!data && data.totalRevenue > 0
  const missedOnly = !!data && data.totalRevenue === 0 && data.lostRevenue.total > 0

  // Membership MRR — the real revenue for membership-priced clubs, where
  // slot-priced sessions can legitimately be ~$0. Deferred 1.5s so the
  // ~1s tier-economics query doesn't pile onto the dashboard's initial
  // burst (same auth-storm precaution as DashboardIQ's secondary queries).
  const [mrrEnabled, setMrrEnabled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMrrEnabled(true), 1500)
    return () => clearTimeout(t)
  }, [])
  const membershipQuery = trpc.intelligence.getMembershipHealth.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo && mrrEnabled, staleTime: 5 * 60 * 1000 },
  )
  const mrr = isDemo ? DEMO_MRR : membershipQuery.data?.rollup
    ? { totalMRR: membershipQuery.data.rollup.totalMRR, totalActiveSubscribers: membershipQuery.data.rollup.totalActiveSubscribers }
    : null
  const hasMrr = !!mrr && mrr.totalMRR > 0
  // While the deferred MRR query is still pending we don't yet know whether
  // a zero-session-revenue club is "membership-led" or truly empty — keep
  // the skeleton up instead of flashing the empty state and swapping.
  const mrrPending = !isDemo && (!mrrEnabled || membershipQuery.isLoading)

  const skeleton = (
    <div className="animate-pulse space-y-3">
      <div className="h-8 w-32 rounded-lg" style={{ background: 'var(--subtle)' }} />
      <div className="h-[110px] rounded-lg" style={{ background: 'var(--subtle)' }} />
      <div className="h-4 w-3/4 rounded" style={{ background: 'var(--subtle)' }} />
    </div>
  )

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'var(--glass-blur)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>Session Revenue</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
          {periodLabel}
        </span>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
          <AlertTriangle className="w-8 h-8 mb-2" style={{ color: 'var(--t4)' }} />
          <p className="text-xs" style={{ color: 'var(--t4)' }}>
            Couldn&apos;t load session revenue. It will retry automatically.
          </p>
        </div>
      ) : isLoading && !data ? (
        skeleton
      ) : !data || (!hasRevenue && !missedOnly) ? (
        hasMrr && mrr ? (
          /* Membership club with no slot-priced sessions — dues ARE the
             revenue, so MRR leads instead of an empty state. */
          <div className="flex flex-col flex-1">
            <div className="mb-1" style={{ fontSize: '26px', fontWeight: 700, color: 'var(--heading)' }}>
              {usd(mrr.totalMRR)}<span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t3)' }}>/mo</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--t3)' }}>
              Membership MRR · {mrr.totalActiveSubscribers.toLocaleString()} active memberships
            </p>
            <p className="text-xs mt-auto pt-3" style={{ color: 'var(--t4)', borderTop: '1px solid var(--divider)' }}>
              No slot-priced session revenue this period — membership dues
              carry the club. Clinics and leagues will show up here once priced.
            </p>
          </div>
        ) : mrrPending ? (
          skeleton
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
            <DollarSign className="w-8 h-8 mb-2" style={{ color: 'var(--t4)' }} />
            <p className="text-xs max-w-[260px]" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
              No priced sessions in this period — session revenue appears once
              sessions carry a price per slot.
            </p>
          </div>
        )
      ) : missedOnly ? (
        /* Priced seats existed but nothing was collected — the missed
           breakdown is the whole story, so skip the empty chart. */
        <div className="flex flex-col flex-1">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--heading)' }}>$0</div>
            {hasMrr && mrr && (
              <div className="text-right">
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--heading)' }}>
                  {usd(mrr.totalMRR)}<span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--t4)' }}>/mo MRR</span>
                </div>
                <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                  {mrr.totalActiveSubscribers.toLocaleString()} active memberships
                </div>
              </div>
            )}
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--t3)' }}>collected from sessions this period</p>
          <div className="space-y-2">
            {[
              { label: 'Empty priced seats', value: data.lostRevenue.emptySlots },
              { label: 'Cancellations', value: data.lostRevenue.cancelled },
              { label: 'No-shows', value: data.lostRevenue.noShows },
            ].filter(r => r.value > 0).map(r => (
              <div key={r.label} className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--t2)' }}>{r.label}</span>
                <span style={{ color: '#F59E0B', fontWeight: 600 }}>{usd(r.value)}</span>
              </div>
            ))}
          </div>
          <div
            className="flex items-center justify-between mt-auto pt-3 text-xs"
            style={{ borderTop: '1px solid var(--divider)' }}
          >
            <span style={{ color: 'var(--t3)' }}>Missed revenue</span>
            <span style={{ color: '#F59E0B', fontWeight: 700 }}>{usd(data.lostRevenue.total)}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1">
          {/* Headline (sessions) + trend, with membership MRR on the right */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-end gap-3">
              <span style={{ fontSize: '26px', fontWeight: 700, color: 'var(--heading)', lineHeight: 1 }}>
                {usd(data.totalRevenue)}
              </span>
              {data.prevTotalRevenue > 0 && (() => {
                const pct = Math.round(((data.totalRevenue - data.prevTotalRevenue) / data.prevTotalRevenue) * 100)
                const up = pct >= 0
                return (
                  <span
                    className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md mb-0.5"
                    style={{
                      background: up ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: up ? '#10B981' : '#EF4444',
                      fontWeight: 600,
                    }}
                  >
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? '+' : ''}{pct}% vs prior period
                  </span>
                )
              })()}
            </div>
            {hasMrr && mrr && (
              <div className="text-right shrink-0">
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--heading)' }}>
                  {usd(mrr.totalMRR)}<span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--t4)' }}>/mo MRR</span>
                </div>
                <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                  {mrr.totalActiveSubscribers.toLocaleString()} active memberships
                </div>
              </div>
            )}
          </div>

          {/* Daily revenue bars */}
          <div style={{ height: 110 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dailyRevenue} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <Tooltip
                  cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div
                        className="rounded-lg px-2.5 py-1.5 text-[11px]"
                        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--t1)' }}
                      >
                        {fmtDay(String(payload[0].payload.date))}: <b>{usd(Number(payload[0].value) || 0)}</b>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="revenue" fill="#8B5CF6" radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top formats by revenue */}
          <div className="space-y-1.5 mt-3">
            {data.revenueByFormat.filter((f: RevenueFormatRow) => f.revenue > 0).slice(0, 3).map((f: RevenueFormatRow) => (
              <div key={f.format} className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--t2)' }}>{FORMAT_LABELS[f.format] ?? f.format}</span>
                <span style={{ color: 'var(--t1)', fontWeight: 600 }}>
                  {usd(f.revenue)} <span style={{ color: 'var(--t4)', fontWeight: 400 }}>· {f.pct}%</span>
                </span>
              </div>
            ))}
          </div>

          {/* Missed revenue — pinned to the card bottom so the divider sits
              flush when the grid stretches this card to the donut's height */}
          {data.lostRevenue.total > 0 && (
            <div
              className="flex items-center justify-between gap-2 mt-auto pt-3 text-xs"
              style={{ borderTop: '1px solid var(--divider)' }}
            >
              <span
                style={{ color: 'var(--t3)' }}
                title={`Empty seats ${usd(data.lostRevenue.emptySlots)} · cancellations ${usd(data.lostRevenue.cancelled)} · no-shows ${usd(data.lostRevenue.noShows)}`}
              >
                Missed revenue
              </span>
              <span style={{ color: '#F59E0B', fontWeight: 700 }}>{usd(data.lostRevenue.total)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
