'use client'

import React from 'react'
import { motion } from 'motion/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from '../../IQThemeProvider'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'var(--glass-blur)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {children}
    </div>
  )
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
      <div className="mb-1" style={{ fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  )
}

interface CampaignChartProps {
  byDay: { date: string; sent: number; failed: number; skipped: number }[]
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function CampaignChart({ byDay }: CampaignChartProps) {
  const { isDark } = useTheme()

  const chartData = (byDay ?? []).map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }))

  if (chartData.length === 0) {
    return (
      <Card>
        <h2 className="mb-4" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>
          Send Volume
        </h2>
        <div className="flex items-center justify-center h-48 text-xs" style={{ color: 'var(--t4)' }}>
          No sending data yet
        </div>
      </Card>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
      <Card>
        <h2 className="mb-4" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>
          Send Volume
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              stroke="var(--chart-axis)"
              tick={{ fill: 'var(--chart-tick)', fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="var(--chart-axis)"
              tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="sent"
              name="Sent"
              stroke="#8B5CF6"
              strokeWidth={2}
              fill="url(#sentGrad)"
            />
            <Area
              type="monotone"
              dataKey="failed"
              name="Failed"
              stroke="#EF4444"
              strokeWidth={2}
              fill="url(#failedGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[10px] mt-2" style={{ color: 'var(--t4)' }}>
          Daily send volume &middot; Purple = sent, Red = failed
        </p>
      </Card>
    </motion.div>
  )
}
