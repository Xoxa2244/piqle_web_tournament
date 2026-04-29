'use client'

/**
 * Members Charts Drawer — slide-in right panel hosting the three
 * distribution / trend charts that used to occupy the first scroll
 * of the Members page (Member Growth, How Often Members Play, Churn
 * & Reactivation).
 *
 * Triggered by the "📊 Charts" button on the Members toolbar; lets
 * the page surface the table immediately while still keeping these
 * insights one click away. Empty charts hide themselves; if all are
 * empty the drawer shows a "no data yet" placeholder.
 */

import React, { useEffect, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, BarChart3 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ComposedChart, Legend,
} from 'recharts'

interface MembersChartsDrawerProps {
  open: boolean
  onClose: () => void

  memberGrowth: Array<{ month: string; total: number; new: number; churned: number }>
  activityDistribution: Array<{ range: string; count: number }>
  churnTrend: Array<{ month: string; atRisk: number; churned: number; reactivated: number }>
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
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
      <div className="mb-2" style={{ fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: 'var(--t3)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>{title}</h3>
      <p className="text-[11px] mb-3 mt-0.5" style={{ color: 'var(--t4)' }}>{hint}</p>
      {children}
    </div>
  )
}

export function MembersChartsDrawer({
  open,
  onClose,
  memberGrowth,
  activityDistribution,
  churnTrend,
}: MembersChartsDrawerProps) {
  // Esc closes
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  const hasGrowth = memberGrowth.length > 0
  const hasActivity = activityDistribution.length > 0
  const hasChurn = churnTrend.length > 0
  const hasAny = hasGrowth || hasActivity || hasChurn

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="charts-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          />
          <motion.aside
            key="charts-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed top-0 right-0 z-50 h-screen flex flex-col"
            style={{
              width: 'min(720px, 100vw)',
              background: 'var(--bg, #0B0B14)',
              borderLeft: '1px solid var(--card-border)',
              boxShadow: '-12px 0 32px rgba(0,0,0,0.35)',
            }}
            onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
            aria-label="Members charts panel"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
              style={{ background: 'var(--bg, #0B0B14)', borderBottom: '1px solid var(--card-border)' }}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: 'var(--t3)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                  Members insights
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close charts"
                className="p-2 rounded-lg transition-colors hover:bg-[var(--hover)]"
                style={{ color: 'var(--t3)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {!hasAny && (
                <div
                  className="rounded-2xl p-6 text-center"
                  style={{ background: 'var(--card-bg)', border: '1px dashed var(--card-border)' }}
                >
                  <BarChart3 className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--t4)' }} />
                  <div className="text-sm" style={{ color: 'var(--t3)', fontWeight: 600 }}>
                    No data yet
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                    Charts populate as members start booking and the daily snapshot cron accumulates history.
                  </p>
                </div>
              )}

              {hasGrowth && (
                <ChartCard
                  title="Member Growth"
                  hint="Total / new / churned members per month"
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={memberGrowth}>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="month" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
                      <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="total" name="Total" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4, fill: '#8B5CF6' }} />
                      <Line type="monotone" dataKey="new" name="New" stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: '#10B981' }} />
                      <Line type="monotone" dataKey="churned" name="Churned" stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: '#EF4444' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {hasActivity && (
                <ChartCard
                  title="How Often Members Play"
                  hint="Members grouped by sessions per week (last 30 days)"
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={activityDistribution}>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="range"
                        stroke="var(--chart-axis)"
                        tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
                        label={{ value: 'Sessions/week', position: 'insideBottom', offset: -2, style: { fill: 'var(--chart-tick)', fontSize: 10 } }}
                      />
                      <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Members" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {hasChurn && (
                <ChartCard
                  title="Churn & Reactivation"
                  hint="At-risk · churned · reactivated members per month"
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={churnTrend}>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="month" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
                      <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="reactivated" name="Reactivated" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="atRisk" name="At-Risk" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: '#F59E0B' }} />
                      <Line type="monotone" dataKey="churned" name="Churned" stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: '#EF4444' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
