'use client'

import Link from 'next/link'
import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { AlertTriangle, ArrowRight, Eye, Megaphone, MousePointer, Send, Sparkles, TestTube2 } from 'lucide-react'

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

const MODE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  disabled: { label: 'Disabled', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  shadow: { label: 'Shadow only', bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  live: { label: 'Live', bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
}

const HEALTH_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  idle: { label: 'Idle', bg: 'rgba(148,163,184,0.15)', color: '#94A3B8' },
  healthy: { label: 'Healthy', bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
  watch: { label: 'Watch', bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  at_risk: { label: 'At Risk', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
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

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Just updated'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diffMs = Date.now() - date.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)

  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  if (diffD < 7) return `${diffD}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildCampaignAdvisorHref(clubId: string, options: { prompt?: string; conversationId?: string | null }) {
  const params = new URLSearchParams()
  if (options.conversationId) {
    params.set('conversationId', options.conversationId)
  } else if (options.prompt) {
    params.set('prompt', options.prompt)
  }
  const query = params.toString()
  return `/clubs/${clubId}/intelligence/advisor${query ? `?${query}` : ''}`
}

function mapCampaignTypeToActionKind(type?: string | null) {
  switch (type) {
    case 'SLOT_FILLER':
      return 'fill_session'
    case 'REACTIVATION':
      return 'reactivate_members'
    default:
      return 'create_campaign'
  }
}

interface CampaignListProps {
  campaigns: any[]
  isLoading?: boolean
  clubId: string
  advisorDrafts?: any[]
  outreachMode?: string
  rolloutStatus?: any
  pilotHealth?: any
  onCampaignClick?: (campaign: any) => void
}

export function CampaignList({
  campaigns,
  isLoading = false,
  clubId,
  advisorDrafts = [],
  outreachMode = 'shadow',
  rolloutStatus,
  pilotHealth,
  onCampaignClick,
}: CampaignListProps) {
  const [filter, setFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    const items = campaigns ?? []
    if (filter === 'all') return items
    return items.filter(
      (c: any) => (c.type || c.campaignType) === filter
    )
  }, [campaigns, filter])

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

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="rounded-xl h-16 animate-pulse"
                style={{ background: 'var(--subtle)' }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
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
                const actionKind = mapCampaignTypeToActionKind(type)
                const relevantDrafts = advisorDrafts.filter((draft: any) => {
                  if (actionKind === 'create_campaign') return draft.kind === 'create_campaign'
                  if (actionKind === 'fill_session') return draft.kind === 'fill_session'
                  return ['reactivate_members', 'trial_follow_up', 'renewal_reactivation', 'create_campaign'].includes(draft.kind)
                })
                const reviewReadyDrafts = relevantDrafts.filter((draft: any) => draft.status === 'review_ready')
                const latestDraft = reviewReadyDrafts[0] || relevantDrafts[0] || null
                const pilotAction = pilotHealth?.actions?.find((action: any) => action.actionKind === actionKind) || null
                const rolloutAction = rolloutStatus?.actions?.[actionKind]
                const modeKey = outreachMode !== 'live'
                  ? outreachMode
                  : rolloutStatus?.clubAllowlisted && rolloutAction?.enabled
                    ? 'live'
                    : 'shadow'
                const modeStyle = MODE_STYLES[modeKey] || MODE_STYLES.shadow
                const healthStyle = HEALTH_STYLES[pilotAction?.health || 'idle'] || HEALTH_STYLES.idle
                const primaryHref = latestDraft
                  ? buildCampaignAdvisorHref(clubId, {
                    conversationId: latestDraft.conversationId || null,
                    prompt: latestDraft.originalIntent || undefined,
                  })
                  : buildCampaignAdvisorHref(clubId, {
                    prompt:
                      actionKind === 'fill_session'
                        ? 'Draft a slot filler campaign for underfilled sessions, but keep it in review-ready draft mode first.'
                        : actionKind === 'reactivate_members'
                          ? 'Draft a reactivation campaign for drifting and expired members. Keep it as a review-ready draft first.'
                          : `Draft a ${type ? type.replace(/_/g, ' ').toLowerCase() : 'campaign'} and keep it as a review-ready draft first.`,
                  })
                const secondaryHref = modeKey === 'live'
                  ? buildCampaignAdvisorHref(clubId, {
                    prompt: pilotAction?.health === 'at_risk' || pilotAction?.health === 'watch'
                      ? `Draft a safer ${type ? type.replace(/_/g, ' ').toLowerCase() : 'campaign'} with a tighter audience and calmer copy. Keep it draft-only.`
                      : `Draft another ${type ? type.replace(/_/g, ' ').toLowerCase() : 'campaign'} based on our strongest current signal, but keep it as a review-ready draft first.`,
                  })
                  : `/clubs/${clubId}/intelligence/settings`
                const primaryLabel = latestDraft ? 'Review draft' : 'Open in Advisor'
                const secondaryLabel = modeKey === 'live'
                  ? pilotAction?.health === 'at_risk' || pilotAction?.health === 'watch'
                    ? 'Rework'
                    : 'Draft next'
                  : 'Rollout'
                const helperLine = latestDraft
                  ? `${reviewReadyDrafts.length > 0 ? `${reviewReadyDrafts.length} review-ready` : 'Existing'} draft · ${formatRelativeTime(latestDraft.updatedAt)}`
                  : pilotAction
                    ? `${pilotAction.sent} sends · ${pilotAction.converted} booked · ${healthStyle.label}`
                    : modeKey === 'live'
                      ? 'Live is armed, but this campaign type has not produced enough signal yet.'
                      : 'This campaign type is still gated by shadow or rollout settings.'

                return (
                  <motion.div
                    key={c.id || i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-3 py-2.5 text-xs transition-colors"
                    style={{
                      borderBottom: i < filtered.length - 1 ? '1px solid var(--divider)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'var(--subtle)',
                    }}
                  >
                    <div
                      onClick={() => onCampaignClick?.(c)}
                      className="grid gap-3 text-xs items-center"
                      style={{
                        gridTemplateColumns: '1fr 100px 60px 60px 60px 70px',
                        cursor: onCampaignClick ? 'pointer' : 'default',
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
                        {formatDate(c.createdAt || c.sentAt || c.date)}
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
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span
                          className="px-2 py-1 rounded-full text-[10px] font-semibold"
                          style={{ background: modeStyle.bg, color: modeStyle.color }}
                        >
                          {modeStyle.label}
                        </span>
                        <span
                          className="px-2 py-1 rounded-full text-[10px] font-semibold"
                          style={{ background: healthStyle.bg, color: healthStyle.color }}
                        >
                          {healthStyle.label}
                        </span>
                        {reviewReadyDrafts.length > 0 ? (
                          <span
                            className="px-2 py-1 rounded-full text-[10px] font-semibold"
                            style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}
                          >
                            {reviewReadyDrafts.length} review-ready
                          </span>
                        ) : null}
                        <span className="text-[11px] truncate" style={{ color: 'var(--t3)' }}>
                          {helperLine}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={primaryHref}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: 'rgba(139,92,246,0.14)', color: '#8B5CF6' }}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {primaryLabel}
                        </Link>
                        <Link
                          href={secondaryHref}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:translate-x-[2px]"
                          style={{
                            background: modeKey === 'live' ? 'rgba(6,182,212,0.14)' : 'rgba(148,163,184,0.14)',
                            color: modeKey === 'live' ? '#06B6D4' : '#64748B',
                          }}
                        >
                          {pilotAction?.health === 'at_risk' || pilotAction?.health === 'watch' ? (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          ) : (
                            <TestTube2 className="w-3.5 h-3.5" />
                          )}
                          {secondaryLabel}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
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
