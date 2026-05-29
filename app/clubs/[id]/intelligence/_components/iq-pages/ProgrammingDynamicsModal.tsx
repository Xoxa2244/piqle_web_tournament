'use client'

/**
 * Programming dynamics modal — Programming Health redesign Phase 1 (§1f-ii).
 *
 * Click a family card or a program row → this modal plots that unit's
 * dynamics over the page's current period (it inherits periodDays — the
 * period selector stays global, doc §5). Metric toggle: Participants /
 * Fill% / Sessions. Backed by intelligence.getProgrammingFamilySeries.
 *
 * Reuses the codebase conventions: motion/react overlay (Esc + backdrop +
 * scroll lock), recharts LineChart with the --chart-* / --tooltip-* theme
 * vars (same as MembersChartsDrawer).
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { ProgramFamily } from '@/lib/ai/program-family-classifier'
import { trpc } from '@/lib/trpc'

export interface DrillTarget {
  family: ProgramFamily
  label: string
  emoji: string
  color: string
  /** Set when drilling into a single program inside the family. */
  programKey?: string | null
  programTitle?: string | null
}

interface Props {
  clubId: string
  periodDays: number
  /** Custom range (§1e) — when set, the modal inherits it from the page. */
  startDate?: string | null
  endDate?: string | null
  target: DrillTarget | null
  onClose: () => void
}

type Metric = 'participants' | 'fillRate' | 'sessions'

const METRIC_META: Record<Metric, { label: string }> = {
  participants: { label: 'Participants' },
  fillRate: { label: 'Fill %' },
  sessions: { label: 'Sessions' },
}

export function ProgrammingDynamicsModal({ clubId, periodDays, startDate, endDate, target, onClose }: Props) {
  const [metric, setMetric] = useState<Metric>('participants')

  // Esc closes + lock body scroll while open.
  useEffect(() => {
    if (!target) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = original
    }
  }, [target, onClose])

  const query = trpc.intelligence.getProgrammingFamilySeries.useQuery(
    {
      clubId,
      periodDays,
      family: (target?.family ?? 'OPEN_PLAY') as ProgramFamily,
      programKey: target?.programKey ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
    },
    { enabled: !!target && !!clubId, staleTime: 5 * 60_000 },
  )
  const data = query.data

  // Fill isn't meaningful for self-serve families — drop that toggle and
  // fall back to Participants if it was selected.
  const fillMeaningful = data?.fillRateMeaningful ?? true
  const effectiveMetric: Metric = metric === 'fillRate' && !fillMeaningful ? 'participants' : metric

  const title = target
    ? target.programTitle
      ? `${target.label} › ${target.programTitle}`
      : target.label
    : ''

  return (
    <AnimatePresence>
      {target && (
        <>
          <motion.div
            key="dyn-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="dyn-modal"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="pointer-events-auto rounded-2xl flex flex-col"
              style={{
                width: 'min(760px, 100vw)',
                maxHeight: '90vh',
                background: 'var(--bg, #0B0B14)',
                border: '1px solid var(--card-border)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: '1px solid var(--card-border)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ fontSize: 18 }}>{target.emoji}</span>
                  <span className="text-sm font-bold truncate" style={{ color: 'var(--heading)' }} title={title}>
                    {title}
                  </span>
                  <span className="text-xs ml-1 shrink-0" style={{ color: 'var(--t4)' }}>
                    · dynamics
                  </span>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--hover)]"
                  style={{ color: 'var(--t3)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Metric toggle */}
                <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
                  {(Object.keys(METRIC_META) as Metric[])
                    .filter((m) => m !== 'fillRate' || fillMeaningful)
                    .map((m) => {
                      const active = m === effectiveMetric
                      return (
                        <button
                          key={m}
                          onClick={() => setMetric(m)}
                          className="px-3 py-1.5 text-sm font-semibold transition-colors"
                          style={{
                            background: active ? target.color : 'var(--subtle)',
                            color: active ? '#fff' : 'var(--t2)',
                          }}
                        >
                          {METRIC_META[m].label}
                        </button>
                      )
                    })}
                </div>

                {/* Chart */}
                <div
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                >
                  {query.isLoading || !data ? (
                    <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--t3)' }}>
                      Loading…
                    </div>
                  ) : data.buckets.length === 0 ? (
                    <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--t4)' }}>
                      No sessions in this period.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={data.buckets} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          stroke="var(--chart-axis)"
                          tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
                        />
                        <YAxis
                          stroke="var(--chart-axis)"
                          tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
                          allowDecimals={false}
                          unit={effectiveMetric === 'fillRate' ? '%' : undefined}
                        />
                        <Tooltip content={<DynamicsTooltip metric={effectiveMetric} />} />
                        <Line
                          type="monotone"
                          dataKey={effectiveMetric}
                          name={METRIC_META[effectiveMetric].label}
                          stroke={target.color}
                          strokeWidth={2}
                          dot={{ r: 3, fill: target.color }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Summary */}
                {data && (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm" style={{ color: 'var(--t2)' }}>
                      <strong style={{ color: 'var(--heading)' }}>{data.totals.sessions}</strong> sessions ·{' '}
                      <strong style={{ color: 'var(--heading)' }}>{data.totals.participants}</strong> participants
                      {data.totals.fillRate != null && (
                        <>
                          {' '}· fill <strong style={{ color: 'var(--heading)' }}>{data.totals.fillRate}%</strong>
                        </>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--t4)' }}>
                      {data.granularity === 'day' ? 'daily' : data.granularity === 'week' ? 'weekly' : 'monthly'} ·{' '}
                      {startDate && endDate ? 'custom range' : periodDays >= 365 ? 'last 1y' : `last ${periodDays}d`}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function DynamicsTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value
  const display = metric === 'fillRate' ? (v == null ? '—' : `${v}%`) : v
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs"
      style={{
        background: 'var(--tooltip-bg)',
        border: '1px solid var(--tooltip-border)',
        color: 'var(--tooltip-color)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="mb-1" style={{ fontWeight: 600 }}>{label}</div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: payload[0]?.color }} />
        <span style={{ color: 'var(--t3)' }}>{payload[0]?.name}:</span>
        <span style={{ fontWeight: 600 }}>{display}</span>
      </div>
    </div>
  )
}
