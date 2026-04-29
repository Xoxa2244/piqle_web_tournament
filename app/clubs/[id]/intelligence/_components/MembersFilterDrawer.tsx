'use client'

/**
 * Members Filter Drawer — slide-in right panel that hosts all 6 filter
 * groups (Membership State, Membership Tier, Activity, Risk, Trend, Value),
 * grouped under two tabs: "Status" (subscription business state) and
 * "Behavior" (engagement signals derived from bookings & health pipeline).
 *
 * Replaces the previous 6-row inline filter strip on MembersIQ which
 * pushed the actual list below the fold and made it hard to see the
 * effect of each click.
 *
 * Filter state stays owned by MembersIQ — this component is a pure
 * presentation layer over getter/setter pairs.
 */

import React, { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Filter as FilterIcon, RotateCcw } from 'lucide-react'

interface MembersFilterDrawerProps {
  open: boolean
  onClose: () => void
  matchCount: number

  filterMembershipStatus: string
  setFilterMembershipStatus: (v: string) => void

  filterMembershipType: string
  setFilterMembershipType: (v: string) => void

  filterActivity: string
  setFilterActivity: (v: string) => void

  filterRisk: string
  setFilterRisk: (v: string) => void

  filterTrend: string
  setFilterTrend: (v: string) => void

  filterValue: string
  setFilterValue: (v: string) => void

  isDark?: boolean
}

const STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'trial', label: 'Trial' },
  { key: 'guest', label: 'Guest' },
  { key: 'none', label: 'No Membership' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
]

const TIER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'guest', label: 'Guest' },
  { key: 'drop_in', label: 'Drop-In' },
  { key: 'trial', label: 'Trial' },
  { key: 'package', label: 'Package' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'unlimited', label: 'VIP / Unlimited' },
  { key: 'discounted', label: 'Discounted' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'staff', label: 'Staff' },
]

const ACTIVITY_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'power', label: 'Power Player' },
  { key: 'regular', label: 'Regular' },
  { key: 'casual', label: 'Casual' },
  { key: 'occasional', label: 'Occasional' },
]

// Risk filter maps "healthy" UI -> "power" internal segment, "watch" -> "regular".
// We surface user-facing labels matching the at-risk language they see elsewhere.
const RISK_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'power', label: 'Healthy', uiKey: 'healthy' },
  { key: 'regular', label: 'Watch', uiKey: 'watch' },
  { key: 'at-risk', label: 'At-Risk', uiKey: 'at-risk' },
  { key: 'critical', label: 'Critical', uiKey: 'critical' },
]

const TREND_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'growing', label: 'Growing' },
  { key: 'stable', label: 'Stable' },
  { key: 'declining', label: 'Declining' },
  { key: 'churning', label: 'Churning' },
]

const VALUE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High LTV' },
  { key: 'medium', label: 'Mid' },
  { key: 'low', label: 'Low' },
]

interface ChipGroupProps {
  label: string
  hint: string
  options: { key: string; label: string }[]
  value: string
  onChange: (v: string) => void
  isDark?: boolean
}

function ChipGroup({ label, hint, options, value, onChange, isDark }: ChipGroupProps) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--t3)' }}>
          {label}
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>
          {hint}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.key
          return (
            <button
              key={o.key}
              onClick={() => onChange(o.key)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                background: active ? 'var(--pill-active)' : 'transparent',
                color: active ? (isDark ? '#C4B5FD' : '#7C3AED') : 'var(--t3)',
                fontWeight: active ? 600 : 500,
                border: `1px solid ${active ? (isDark ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.2)') : 'var(--card-border)'}`,
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function MembersFilterDrawer({
  open,
  onClose,
  matchCount,
  filterMembershipStatus,
  setFilterMembershipStatus,
  filterMembershipType,
  setFilterMembershipType,
  filterActivity,
  setFilterActivity,
  filterRisk,
  setFilterRisk,
  filterTrend,
  setFilterTrend,
  filterValue,
  setFilterValue,
  isDark,
}: MembersFilterDrawerProps) {
  const [tab, setTab] = useState<'status' | 'behavior'>('status')

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

  const statusActive = useMemo(
    () => (filterMembershipStatus !== 'all' ? 1 : 0) + (filterMembershipType !== 'all' ? 1 : 0),
    [filterMembershipStatus, filterMembershipType],
  )
  const behaviorActive = useMemo(
    () =>
      (filterActivity !== 'all' ? 1 : 0) +
      (filterRisk !== 'all' ? 1 : 0) +
      (filterTrend !== 'all' ? 1 : 0) +
      (filterValue !== 'all' ? 1 : 0),
    [filterActivity, filterRisk, filterTrend, filterValue],
  )

  const clearAll = () => {
    setFilterMembershipStatus('all')
    setFilterMembershipType('all')
    setFilterActivity('all')
    setFilterRisk('all')
    setFilterTrend('all')
    setFilterValue('all')
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="filter-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          />
          <motion.aside
            key="filter-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed top-0 right-0 z-50 h-screen flex flex-col"
            style={{
              width: 'min(480px, 100vw)',
              background: 'var(--bg, #0B0B14)',
              borderLeft: '1px solid var(--card-border)',
              boxShadow: '-12px 0 32px rgba(0,0,0,0.35)',
            }}
            onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
            aria-label="Filters panel"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
              style={{ background: 'var(--bg, #0B0B14)', borderBottom: '1px solid var(--card-border)' }}
            >
              <div className="flex items-center gap-2">
                <FilterIcon className="w-4 h-4" style={{ color: 'var(--t3)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                  Filters
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close filters"
                className="p-2 rounded-lg transition-colors hover:bg-[var(--hover)]"
                style={{ color: 'var(--t3)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-3">
              {[
                { key: 'status' as const, label: 'Status', count: statusActive },
                { key: 'behavior' as const, label: 'Behavior', count: behaviorActive },
              ].map((t) => {
                const active = tab === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all"
                    style={{
                      background: active ? 'var(--pill-active)' : 'transparent',
                      color: active ? (isDark ? '#C4B5FD' : '#7C3AED') : 'var(--t3)',
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span
                        className="px-1.5 rounded-full text-[10px]"
                        style={{
                          background: active ? 'rgba(139,92,246,0.25)' : 'var(--card-border)',
                          color: active ? (isDark ? '#DDD6FE' : '#7C3AED') : 'var(--t3)',
                          fontWeight: 700,
                        }}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {tab === 'status' && (
                <>
                  <ChipGroup
                    label="Membership State"
                    hint="В каком состоянии находится подписка участника прямо сейчас"
                    options={STATUS_OPTIONS}
                    value={filterMembershipStatus}
                    onChange={setFilterMembershipStatus}
                    isDark={isDark}
                  />
                  <ChipGroup
                    label="Membership Tier"
                    hint="По какому тарифу участник платит (или не платит)"
                    options={TIER_OPTIONS}
                    value={filterMembershipType}
                    onChange={setFilterMembershipType}
                    isDark={isDark}
                  />
                </>
              )}

              {tab === 'behavior' && (
                <>
                  <ChipGroup
                    label="Activity"
                    hint="Как часто участник играет — посчитано по бронированиям за последние 30 дней"
                    options={ACTIVITY_OPTIONS}
                    value={filterActivity}
                    onChange={setFilterActivity}
                    isDark={isDark}
                  />
                  <ChipGroup
                    label="Risk"
                    hint="Уровень риска оттока — health-score, посчитанный AI-моделью"
                    options={RISK_OPTIONS}
                    value={filterRisk}
                    onChange={(v) => {
                      // UI labels "healthy"/"watch" need to map to internal segment values
                      const internal = v === 'healthy' ? 'power' : v === 'watch' ? 'regular' : v
                      setFilterRisk(internal)
                    }}
                    isDark={isDark}
                  />
                  <ChipGroup
                    label="Trend"
                    hint="Куда движется активность — растёт, держится, падает или уже почти ушёл"
                    options={TREND_OPTIONS}
                    value={filterTrend}
                    onChange={setFilterTrend}
                    isDark={isDark}
                  />
                  <ChipGroup
                    label="Value"
                    hint="Сегмент по выручке — High LTV это верхняя треть платящих"
                    options={VALUE_OPTIONS}
                    value={filterValue}
                    onChange={setFilterValue}
                    isDark={isDark}
                  />
                </>
              )}
            </div>

            {/* Footer */}
            <div
              className="px-5 py-4 sticky bottom-0 flex items-center justify-between gap-3"
              style={{ background: 'var(--bg, #0B0B14)', borderTop: '1px solid var(--card-border)' }}
            >
              <button
                onClick={clearAll}
                disabled={statusActive + behaviorActive === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all disabled:opacity-40"
                style={{ color: 'var(--t3)', border: '1px solid var(--card-border)' }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear all
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--t3)' }}>
                  <span style={{ color: 'var(--heading)', fontWeight: 700 }}>{matchCount}</span> match
                </span>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
                >
                  Show
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
