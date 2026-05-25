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
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
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
  comparison?: PeriodComparisonSnapshot | null
  onClose: () => void
}

export function PeriodComparisonDrawer({
  open,
  metric,
  clubId,
  startDate,
  endDate,
  bucket,
  comparison,
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
  const formatDelta = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}%`

  // Chart data = bars + trend evaluated at the same x positions.
  const chartData = useMemo(() => {
    if (!query.data) return []
    const { bars, trend } = query.data
    const windowStart = new Date(startDate).getTime()
    const windowEnd = new Date(endDate).getTime()
    return bars.map((b, i) => ({
      label: formatBucketLabel(new Date(b.bucketStart), bucket, windowStart, windowEnd),
      value: b.value,
      trend: Math.round((trend.intercept + trend.slope * i) * 10) / 10,
    }))
  }, [query.data, bucket, startDate, endDate])

  const summary = useMemo(() => {
    if (!query.data) return null
    const { bars, trend } = query.data
    if (bars.length === 0) return null
    const first = bars[0].value
    const last = bars[bars.length - 1].value
    const sum = bars.reduce((a, b) => a + b.value, 0)
    return {
      first,
      last,
      total: sum,
      avg: Math.round((sum / bars.length) * 10) / 10,
      slopeSign: trend.slope > 0.01 ? 'up' : trend.slope < -0.01 ? 'down' : 'flat',
    } as const
  }, [query.data])

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
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[560px] overflow-y-auto"
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
              {/* Summary row */}
              {summary && (
                <div className="grid grid-cols-3 gap-2">
                  <Stat
                    label="Current period"
                    value={comparison ? formatValue(comparison.current) : formatValue(summary.avg)}
                  />
                  <Stat
                    label="Vs previous"
                    value={comparison ? formatDelta(comparison.delta) : '—'}
                    icon={
                      comparison?.trendTone === 'positive' ? (
                        <TrendingUp className="w-3 h-3" style={{ color: '#10B981' }} />
                      ) : comparison?.trendTone === 'negative' ? (
                        <TrendingDown className="w-3 h-3" style={{ color: '#F87171' }} />
                      ) : (
                        <Minus className="w-3 h-3" style={{ color: 'var(--t4)' }} />
                      )
                    }
                  />
                  <Stat
                    label={`${bucket === 'week' ? 'Weekly' : 'Monthly'} trend`}
                    value={
                      summary.slopeSign === 'up'
                        ? 'Rising'
                        : summary.slopeSign === 'down'
                          ? 'Falling'
                          : 'Flat'
                    }
                    icon={
                      summary.slopeSign === 'up' ? (
                        <TrendingUp className="w-3 h-3" style={{ color: '#10B981' }} />
                      ) : summary.slopeSign === 'down' ? (
                        <TrendingDown className="w-3 h-3" style={{ color: '#F87171' }} />
                      ) : (
                        <Minus className="w-3 h-3" style={{ color: 'var(--t4)' }} />
                      )
                    }
                  />
                </div>
              )}

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
                        contentStyle={{
                          background: 'var(--card-bg)',
                          border: '1px solid var(--card-border)',
                          borderRadius: 8,
                          fontSize: 12,
                          color: 'var(--heading)',
                        }}
                        formatter={(v: any) => formatValue(Number(v))}
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

function Stat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
    >
      <div className="text-[10px] mb-0.5" style={{ color: 'var(--t4)' }}>
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        {icon}
        <div className="text-sm" style={{ color: 'var(--heading)', fontWeight: 700 }}>
          {value}
        </div>
      </div>
    </div>
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
