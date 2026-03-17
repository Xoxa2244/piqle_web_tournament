'use client'

import { motion } from 'motion/react'
import { Check, Globe, Building2, Calendar, DollarSign, Target, MapPin } from 'lucide-react'
import { useTheme } from '../IQThemeProvider'

export type OnboardingFields = {
  timezoneAndSports: boolean
  courts: boolean
  schedule: boolean
  pricingAndComms: boolean
  goals: boolean
  address: boolean
}

const CATEGORIES = [
  { key: 'timezoneAndSports' as const, label: 'Timezone & Sports', icon: Globe },
  { key: 'courts' as const, label: 'Courts', icon: Building2 },
  { key: 'schedule' as const, label: 'Schedule', icon: Calendar },
  { key: 'pricingAndComms' as const, label: 'Pricing & Comms', icon: DollarSign },
  { key: 'goals' as const, label: 'Goals', icon: Target },
  { key: 'address' as const, label: 'Location', icon: MapPin },
]

type OnboardingProgressProps = {
  fields: OnboardingFields
  className?: string
}

export function OnboardingProgress({ fields, className = '' }: OnboardingProgressProps) {
  const { isDark } = useTheme()
  const completed = Object.values(fields).filter(Boolean).length
  const total = CATEGORIES.length
  const progressPercent = Math.round((completed / total) * 100)

  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      backdropFilter: 'var(--glass-blur)',
    }}>
      {/* Header */}
      <div className="mb-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Setup Progress</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{completed}/{total} completed</p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full mb-5" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #8B5CF6, #06B6D4)' }}
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {CATEGORIES.map((cat, i) => {
          const done = fields[cat.key]
          const Icon = cat.icon
          return (
            <motion.div
              key={cat.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 py-1.5"
            >
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all"
                style={{
                  background: done
                    ? 'linear-gradient(135deg, #8B5CF6, #06B6D4)'
                    : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                  border: done ? 'none' : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                }}
              >
                {done ? (
                  <Check className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Icon className="w-3 h-3" style={{ color: 'var(--t4)' }} />
                )}
              </div>
              <span
                className="text-sm"
                style={{
                  color: done ? 'var(--heading)' : 'var(--t4)',
                  fontWeight: done ? 500 : 400,
                }}
              >
                {cat.label}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
