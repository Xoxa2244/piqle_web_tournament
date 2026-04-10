'use client'

import React from 'react'
import { motion } from 'motion/react'
import { Send, Eye, MousePointer, Target } from 'lucide-react'
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

interface CampaignKPIsProps {
  summary: any
  variantData: any
}

const metrics = [
  { key: 'sent', label: 'Total Sent', icon: Send, color: '#8B5CF6' },
  { key: 'openRate', label: 'Open Rate', icon: Eye, color: '#06B6D4' },
  { key: 'clickRate', label: 'Click Rate', icon: MousePointer, color: '#3B82F6' },
  { key: 'conversions', label: 'Conversions', icon: Target, color: '#10B981' },
] as const

export function CampaignKPIs({ summary, variantData }: CampaignKPIsProps) {
  const { isDark } = useTheme()

  const values: Record<string, { value: string; sub: string }> = {
    sent: {
      value: (summary?.totalSent ?? 0).toLocaleString(),
      sub: `this week: ${summary?.thisWeek ?? 0}`,
    },
    openRate: {
      value: `${((variantData?.overallOpenRate ?? 0) * 100).toFixed(1)}%`,
      sub: 'across all variants',
    },
    clickRate: {
      value: `${((variantData?.overallClickRate ?? 0) * 100).toFixed(1)}%`,
      sub: 'across all variants',
    },
    conversions: {
      value: (summary?.totalConverted ?? 0).toLocaleString(),
      sub: `failed: ${summary?.totalFailed ?? 0}`,
    },
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m, i) => {
        const Icon = m.icon
        const v = values[m.key]
        return (
          <motion.div
            key={m.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.08 }}
          >
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${m.color}20` }}
                >
                  <Icon className="w-4 h-4" style={{ color: m.color }} />
                </div>
                <span className="text-xs" style={{ color: 'var(--t3)', fontWeight: 500 }}>
                  {m.label}
                </span>
              </div>
              <div className="text-2xl" style={{ fontWeight: 800, color: 'var(--heading)' }}>
                {v.value}
              </div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--t4)' }}>
                {v.sub}
              </div>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}
