'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Megaphone, Send, Eye, MousePointer } from 'lucide-react'
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

const CAMPAIGN_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'CHECK_IN', label: 'Check-in' },
  { key: 'RETENTION_BOOST', label: 'Retention' },
  { key: 'REACTIVATION', label: 'Reactivation' },
  { key: 'SLOT_FILLER', label: 'Slot Filler' },
  { key: 'EVENT_INVITE', label: 'Event Invite' },
] as const

const TYPE_COLORS: Record<string, string> = {
  CHECK_IN: '#F59E0B',
  RETENTION_BOOST: '#F97316',
  REACTIVATION: '#8B5CF6',
  SLOT_FILLER: '#3B82F6',
  EVENT_INVITE: '#6366F1',
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  sent: { bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
  failed: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  pending: { bg: 'rgba(148,163,184,0.15)', color: '#94A3B8' },
  skipped: { bg: 'rgba(148,163,184,0.15)', color: '#94A3B8' },
  completed: { bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
  active: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getCampaignName(c: any): string {
  if (c.name) return c.name
  const type = (c.type || c.campaignType || '').replace(/_/g, ' ')
  const date = c.createdAt ? formatDate(c.createdAt) : ''
  return `${type}${date ? ` - ${date}` : ''}`.trim() || 'Untitled'
}

interface CampaignListProps {
  campaigns: any[]
  onCampaignClick?: (id: string) => void
}

export function CampaignList({ campaigns, onCampaignClick }: CampaignListProps) {
  const { isDark } = useTheme()
  const [filter, setFilter] = useState<string>('all')

  const items = campaigns ?? []

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter(
      (c: any) => (c.type || c.campaignType) === filter
    )
  }, [items, filter])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--heading)' }}>
            Campaigns
          </h2>
          {/* Filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {CAMPAIGN_TYPES.map((t) => {
              const isActive = filter === t.key
              const typeColor = t.key !== 'all' ? TYPE_COLORS[t.key] : '#8B5CF6'
              return (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className="px-2.5 py-1 rounded-lg text-[11px] transition-all"
                  style={{
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? `${typeColor}20` : 'transparent',
                    color: isActive ? typeColor : 'var(--t3)',
                    border: isActive ? `1px solid ${typeColor}40` : '1px solid transparent',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Megaphone className="w-10 h-10" style={{ color: 'var(--t4)' }} />
            <span className="text-sm" style={{ color: 'var(--t4)', fontWeight: 500 }}>
              No campaigns yet
            </span>
          </div>
        ) : (
          <div className="space-y-0 overflow-hidden rounded-xl" style={{ border: '1px solid var(--card-border)' }}>
            {/* Header */}
            <div
              className="grid gap-3 px-3 py-2 text-[10px] uppercase tracking-wider"
              style={{
                gridTemplateColumns: '1fr 100px 60px 60px 60px 70px',
                color: 'var(--t4)',
                fontWeight: 600,
                background: 'var(--subtle)',
              }}
            >
              <span>Campaign</span>
              <span className="hidden sm:block">Date</span>
              <span className="text-right">Sent</span>
              <span className="text-right">Open</span>
              <span className="text-right">Click</span>
              <span className="text-right">Status</span>
            </div>

            <AnimatePresence mode="popLayout">
              {filtered.map((c: any, i: number) => {
                const type = c.type || c.campaignType || ''
                const typeColor = TYPE_COLORS[type] || '#94A3B8'
                const status = c.status || 'sent'
                const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.sent
                const openRate = c.openRate != null ? c.openRate : c.sent > 0 ? (c.opened ?? 0) / c.sent : 0
                const clickRate = c.clickRate != null ? c.clickRate : c.sent > 0 ? (c.clicked ?? 0) / c.sent : 0

                return (
                  <motion.div
                    key={c.id || i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => onCampaignClick?.(c.id)}
                    className="grid gap-3 px-3 py-2.5 text-xs items-center transition-colors"
                    style={{
                      gridTemplateColumns: '1fr 100px 60px 60px 60px 70px',
                      cursor: onCampaignClick ? 'pointer' : 'default',
                      borderBottom: i < filtered.length - 1 ? '1px solid var(--divider)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'var(--subtle)',
                    }}
                  >
                    {/* Name + type badge */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] shrink-0"
                        style={{
                          background: `${typeColor}20`,
                          color: typeColor,
                          fontWeight: 700,
                        }}
                      >
                        {(type || 'OTHER').replace(/_/g, ' ')}
                      </span>
                      <span className="truncate" style={{ color: 'var(--t1)', fontWeight: 600 }}>
                        {getCampaignName(c)}
                      </span>
                    </div>

                    {/* Date */}
                    <span className="hidden sm:block" style={{ color: 'var(--t3)' }}>
                      {formatDate(c.createdAt || c.sentAt)}
                    </span>

                    {/* Sent count */}
                    <span className="text-right flex items-center justify-end gap-1" style={{ color: 'var(--t2)' }}>
                      <Send className="w-3 h-3" style={{ color: 'var(--t4)' }} />
                      {c.sent ?? c.sentCount ?? 0}
                    </span>

                    {/* Open rate */}
                    <span className="text-right flex items-center justify-end gap-1" style={{ color: 'var(--t2)' }}>
                      <Eye className="w-3 h-3" style={{ color: 'var(--t4)' }} />
                      {(openRate * 100).toFixed(0)}%
                    </span>

                    {/* Click rate */}
                    <span className="text-right flex items-center justify-end gap-1" style={{ color: 'var(--t2)' }}>
                      <MousePointer className="w-3 h-3" style={{ color: 'var(--t4)' }} />
                      {(clickRate * 100).toFixed(0)}%
                    </span>

                    {/* Status badge */}
                    <div className="flex justify-end">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px]"
                        style={{
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          fontWeight: 600,
                        }}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
