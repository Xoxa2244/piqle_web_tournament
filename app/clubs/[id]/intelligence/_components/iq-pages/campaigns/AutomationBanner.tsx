'use client'

import React from 'react'
import { motion } from 'motion/react'
import { Zap } from 'lucide-react'
import { useTheme } from '../../IQThemeProvider'
import { useAutomationSettings } from '../../../_hooks/use-intelligence'

interface AutomationBannerProps {
  clubId: string
}

function Shimmer({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'var(--subtle)' }} />
}

export function AutomationBanner({ clubId }: AutomationBannerProps) {
  const { isDark } = useTheme()
  const { data, isLoading } = useAutomationSettings(clubId)

  if (isLoading) {
    return <Shimmer className="h-12 w-full rounded-2xl" />
  }

  if (!data) return null

  const settings = data.settings ?? {}
  const triggersObj = settings.triggers ?? {}
  const triggerEntries = Object.values(triggersObj) as any[]
  const activeCount = triggerEntries.filter((t: any) => t?.enabled).length
  const totalCount = triggerEntries.length
  const isActive = activeCount > 0

  const statusColor = isActive ? '#10B981' : '#F59E0B'
  const statusLabel = isActive ? 'Active' : 'Paused'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl px-5 py-3 flex items-center gap-4 flex-wrap"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'var(--glass-blur)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${statusColor}20` }}
      >
        <Zap className="w-4 h-4" style={{ color: statusColor }} />
      </div>

      <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
            Automation:
          </span>
          <span
            className="px-2 py-0.5 rounded-md text-[11px]"
            style={{
              background: `${statusColor}20`,
              color: statusColor,
              fontWeight: 700,
            }}
          >
            {statusLabel}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--t3)' }}>
          {activeCount}/{totalCount} triggers active
        </span>
      </div>
    </motion.div>
  )
}
