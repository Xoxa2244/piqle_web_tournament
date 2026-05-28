'use client'

/**
 * PeriodComparisonDrawer — drill-down panel for a single dashboard metric.
 *
 * Triggered by clicking a Period Comparison card on DashboardIQ. Reads
 * the canon-defined time-series via `intelligence.getMetricTimeSeries`
 * (Spec §3.3 + §7.2) and renders bar chart + linear trend line.
 *
 * MVP scope (Step 8 of DASHBOARD_AND_ACTION_CENTER_SPEC.md §7.5):
 *   - Bar chart of the selected window (bucketed weekly or monthly)
 *   - Trend line overlay (simple linear regression from backend)
 *   - Compare-to overlay toggle: off in MVP; bars are bucketed so any
 *     same-shape overlay slot from the backend renders alongside.
 *
 * Future polish (Phase 2 — Spec §10.5):
 *   - Custom date picker
 *   - Overlay period selector in the drawer chrome
 *   - Y-axis scale toggle (linear/log)
 *   - Annotated event markers (campaign launches, etc.)
 */

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  CartesianGrid,
} from 'recharts'
import { trpc } from '@/lib/trpc'

export type DrawerMetric =
  | 'player_registrations'
  | 'court_occupancy'
  | 'active_players'
  | 'avg_sessions_per_player'

export const METRIC_LABEL: Record<DrawerMetric, string> = {
  player_registrations: 'Player Sessions',
  court_occupancy: 'Court Occupancy',
  active_players: 'Active Players',
  avg_sessions_per_player: 'Avg Sessions / Player',
}

const METRIC_FORMAT: Record<DrawerMetric, 'number' | 'percent' | 'decimal'> = {
  player_registrations: 'number',
  court_occupancy: 'percent',
  active_players: 'number',
  avg_sessions_per_player: 'decimal',
}

export type PeriodComparisonSnapshot = {
  current: number
  previous: number
  delta: number
  trendTone: 'positive' | 'negative' | 'neutral'
}

/** Period is mirrored from the Dashboard header — clicking the
 *  pills inside the drawer drives the parent state so the
 *  startDate/endDate window updates without closing the drawer.
 *  Custom mode is Dashboard-only (it needs a date picker); it shows
 *  as a non-interactive pill here. */
export type DrawerPeriod = 'week' | 'month' | 'quarter' | 'year' | 'custom'

interface Props {
  open: boolean
  metric: DrawerMetric | null
  clubId: string
  /** ISO date string — inclusive lower bound. */
  startDate: string
  /** ISO date string — exclusive upper bound. */
  endDate: string
  /** 'week' (1m/3m windows) or 'month' (6m). */
  bucket: 'week' | 'month'
  /** Current period selector — drives `startDate/endDate` via parent. */
  period: DrawerPeriod
  onChangePeriod: (p: DrawerPeriod) => void
  onClose: () => void
}

export function PeriodComparisonDrawer({
  open,
  metric,
  clubId,
  startDate,
  endDate,
  bucket,
  period,
  onChangePeriod,
  onClose,
}: Props) {
  const query = trpc.intelligence.getMetricTimeSeries.useQuery(
    {
      clubId,
      metric: metric ?? 'player_registrations',
      startDate,
      endDate,
      bucket,
    },
    { enabled: open && !!metric },
  )

  const fmt = metric ? METRIC_FORMAT[metric] : 'number'
  const formatValue = (v: number) => {
    if (fmt === 'percent') return `${Math.round(v * 10) / 10}%`
    if (fmt === 'decimal') return v.toFixed(1)
    return v.toLocaleString()
  }

  // Chart data = bars + one regression segment. Do not put a rounded
  // predicted value on every bucket: Recharts will draw a polyline through
  // those points, which makes a linear trend look broken.
  const chartData = useMemo(() => {
    if (!query.data) return []
    const { bars, trend } = query.data
    const windowStart = new Date(startDate).getTime()
    const windowEnd = new Date(endDate).getTime()
    return bars.map((b, i) => ({
      label: formatBucketLabel(new Date(b.bucketStart), bucket, windowStart, windowEnd),
      value: b.value,
      trend: i === 0 || i === bars.length - 1
        ? trend.intercept + trend.slope * i
        : null,
    }))
  }, [query.data, bucket, startDate, endDate])

  // (Removed in 2026-05-28 redesign: aggregate summary stats — Current
  // period / Vs previous / Weekly trend — used to render as three
  // KPI cards above the chart. Their info is now either inline next to
  // the Compare toggles or implicit in the chart + trend line itself.)

  return (
    <AnimatePresence>
      {open && metric && (
        <>
          {/* Backdrop — opaque enough that Dashboard content behind the drawer
              doesn't bleed through. Per DASHBOARD_AND_ACTION_CENTER_SPEC.md
              v1.2 UI fix from rgdev preview review. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
          />

          {/* Drawer — solid page background under the card layer so
              transparent CSS theme tokens (--card-bg often has alpha)
              don't reveal Dashboard content. Backdrop above adds blur
              for the rest of the viewport. */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[720px] overflow-y-auto"
            style={{
              backgroundColor: 'var(--page-bg)',
              backgroundImage: 'linear-gradient(var(--card-bg), var(--card-bg))',
              borderLeft: '1px solid var(--card-border)',
              boxShadow: '-8px 0 24px rgba(0,0,0,0.35)',
            }}
          >
            {/* Header */}
            <div
              className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between"
              style={{
                background: 'var(--card-bg)',
                borderBottom: '1px solid var(--card-border)',
              }}
            >
              <div>
                <h3
                  className="text-base"
                  style={{ color: 'var(--heading)', fontWeight: 700 }}
                >
                  {METRIC_LABEL[metric]}
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>
                  {new Date(startDate).toLocaleDateString()} → {new Date(endDate).toLocaleDateString()} ·
                  bucketed by {bucket}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/5"
                style={{ color: 'var(--t3)' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Period + Compare controls — mirror the Dashboard header
                  so the user can re-frame the window without closing
                  the drawer. Clicking these drives the parent state via
                  callbacks, which in turn updates startDate / endDate /
                  comparison props flowing back here. */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>
                  Period
                </span>
                {(['week', 'month', 'quarter', 'year'] as const).map((p) => {
                  const isActive = period === p
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onChangePeriod(p)}
                      className="px-3 py-1.5 rounded-lg text-xs capitalize transition-all"
                      style={{
                        background: isActive ? 'rgba(139,92,246,0.15)' : 'var(--subtle)',
                        color: isActive ? '#8B5CF6' : 'var(--t3)',
                        fontWeight: isActive ? 600 : 500,
                        border: isActive ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                      }}
                    >
                      {p}
                    </button>
                  )
                })}
                {/* Inherited custom mode from Dashboard — non-interactive here. */}
                {period === 'custom' && (
                  <span
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{
                      background: 'var(--subtle)',
                      color: 'var(--t4)',
                      border: '1px dashed var(--card-border)',
                    }}
                    title="Set on Dashboard"
                  >
                    Custom
                  </span>
                )}
              </div>

              {/* Chart */}
              <div
                className="rounded-xl p-3"
                style={{
                  background: 'var(--subtle)',
                  border: '1px solid var(--card-border)',
                }}
              >
                {query.isLoading ? (
                  <div className="h-64 flex items-center justify-center" style={{ color: 'var(--t4)' }}>
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center" style={{ color: 'var(--t4)' }}>
                    <span className="text-sm">No data for this window</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid stroke="var(--divider)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--t4)' }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--divider)' }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--t4)' }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--divider)' }}
                      />
                      <Tooltip
                        // Custom renderer — strips the Trend-line series
                        // from the tooltip. The trend is a linear
                        // regression, so its value at a given bucket is
                        // "intercept + slope · i" — can be negative
                        // even when all bars are positive (steep slope
                        // + sparse early data extrapolates the line
                        // below zero). That's mathematically right but
                        // reads as a UI bug. The line itself is purely
                        // a visual cue; users don't need to see the
                        // regression's predicted value per bucket.
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const actual = payload.find((p: any) => p.dataKey === 'value')
                          if (!actual) return null
                          return (
                            <div
                              className="rounded-lg px-3 py-2"
                              style={{
                                background: 'var(--card-bg)',
                                border: '1px solid var(--card-border)',
                                fontSize: 12,
                                color: 'var(--heading)',
                              }}
                            >
                              <div className="mb-0.5" style={{ fontWeight: 600 }}>{label}</div>
                              <div style={{ color: 'var(--t3)' }}>
                                <span style={{ color: '#8B5CF6' }}>●</span> {formatValue(Number(actual.value))}
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Bar
                        name="Actual"
                        dataKey="value"
                        fill="rgba(139,92,246,0.7)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Line
                        name="Trend line"
                        type="linear"
                        dataKey="trend"
                        stroke="#06B6D4"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                        strokeDasharray="4 4"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              <p className="text-[10px]" style={{ color: 'var(--t4)' }}>
                Each bar is one {bucket}. Vs previous compares the whole current period with the prior period. The dotted line shows the trend inside this window; edge buckets can be partial.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function formatBucketLabel(
  bucketStart: Date,
  bucket: 'week' | 'month',
  windowStartMs: number,
  windowEndMs: number,
): string {
  if (bucket === 'month') {
    return bucketStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  }

  const bucketEnd = new Date(bucketStart)
  bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 6)

  const start = new Date(Math.max(bucketStart.getTime(), windowStartMs))
  const end = new Date(Math.min(bucketEnd.getTime(), windowEndMs))
  return formatDateRange(start, end)
}

function formatDateRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const startDay = start.getUTCDate()
  const endDay = end.getUTCDate()

  if (startMonth === endMonth && startDay === endDay) {
    return `${startMonth} ${startDay}`
  }

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`
  }

  return `${startMonth} ${startDay}-${endMonth} ${endDay}`
}
