'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Users, Search, AlertTriangle, Heart, Activity,
  TrendingDown, TrendingUp, Minus, ChevronDown, ChevronUp,
  DollarSign, Shield, Eye, Zap, Mail, Send, ExternalLink, Loader2,
} from 'lucide-react'
import { MetricCard } from '../_components/metric-card'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useMemberHealth, useSendOutreach, useMemberOutreachHistory, useIsDemo } from '../_hooks/use-intelligence'
import { cn } from '@/lib/utils'
import { useSetPageContext } from '../_hooks/usePageContext'
import { useBrand } from '@/components/BrandProvider'
import { MembersIQ } from '../_components/iq-pages/MembersIQ'
import type { MemberHealthResult, RiskLevel, LifecycleStage } from '@/types/intelligence'

// ── Constants ──

const RISK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'watch', label: 'Watch' },
  { value: 'healthy', label: 'Healthy' },
] as const

const riskConfig: Record<RiskLevel, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'Critical' },
  at_risk: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', label: 'At Risk' },
  watch: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Watch' },
  healthy: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Healthy' },
}

const stageLabels: Record<LifecycleStage, string> = {
  onboarding: 'Onboarding',
  ramping: 'Ramping Up',
  active: 'Active',
  at_risk: 'At Risk',
  critical: 'Critical',
  churned: 'Churned',
}

// ── Helpers ──

function scoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-600'
  if (score >= 50) return 'text-amber-600'
  if (score >= 25) return 'text-orange-600'
  return 'text-red-600'
}

function scoreBgColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  if (score >= 25) return 'bg-orange-500'
  return 'bg-red-500'
}

function trendIcon(trend: 'improving' | 'stable' | 'declining') {
  if (trend === 'improving') return <TrendingUp className="h-3 w-3 text-emerald-600" />
  if (trend === 'declining') return <TrendingDown className="h-3 w-3 text-red-600" />
  return <Minus className="h-3 w-3 text-muted-foreground" />
}

// ── Sort options ──

type SortKey = 'health' | 'name' | 'lastPlayed' | 'bookings'

export default function MembersPage() {
  const params = useParams()
  const clubId = params.id as string

  const [riskFilter, setRiskFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('health')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, error } = useMemberHealth(clubId)

  const setPageContext = useSetPageContext()
  useEffect(() => {
    if (!data) return
    const parts = [
      'Page: Member Health',
      `Total members: ${data.summary.total}`,
      `Healthy: ${data.summary.healthy}, Watch: ${data.summary.watch}, At Risk: ${data.summary.atRisk}, Critical: ${data.summary.critical}`,
      `Avg health score: ${data.summary.avgHealthScore}`,
      `Revenue at risk: $${data.summary.revenueAtRisk.toLocaleString()}`,
    ]
    const atRiskMembers = data.members.filter(m => m.riskLevel === 'critical' || m.riskLevel === 'at_risk').slice(0, 5)
    if (atRiskMembers.length > 0) {
      parts.push(`Top at-risk members: ${atRiskMembers.map(m => (m.member.name || m.member.email) + ' (health: ' + m.healthScore + ', ' + m.riskLevel + ')').join(', ')}`)
    }
    setPageContext(parts.join('\n'))
  }, [data, setPageContext])


  const filtered = useMemo(() => {
    if (!data?.members) return []
    let list = data.members

    // Risk filter
    if (riskFilter !== 'all') {
      list = list.filter(m => m.riskLevel === riskFilter)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(m =>
        (m.member.name || '').toLowerCase().includes(q) ||
        (m.member.email || '').toLowerCase().includes(q)
      )
    }

    // Sort
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'health': return a.healthScore - b.healthScore
        case 'name': return (a.member.name || '').localeCompare(b.member.name || '')
        case 'lastPlayed': return (a.daysSinceLastBooking ?? 999) - (b.daysSinceLastBooking ?? 999)
        case 'bookings': return a.totalBookings - b.totalBookings
      }
    })
    return sortAsc ? sorted : sorted.reverse()
  }, [data, riskFilter, searchQuery, sortBy, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortBy(key)
      setSortAsc(false)
    }
  }

  const brand = useBrand()
  if (brand.key === 'iqsport') return <MembersIQ />

  return (
    <div className="space-y-6">
      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">Risk:</div>
        <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
          {RISK_FILTERS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRiskFilter(opt.value)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                riskFilter === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* ── Metrics ── */}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              icon={Users}
              label="Total Members"
              value={data.summary.total}
            />
            <MetricCard
              icon={Heart}
              label="Healthy"
              value={data.summary.healthy}
              variant="success"
            />
            <MetricCard
              icon={Eye}
              label="Watch"
              value={data.summary.watch}
              variant="warning"
            />
            <MetricCard
              icon={AlertTriangle}
              label="At Risk"
              value={data.summary.atRisk + data.summary.critical}
              variant="danger"
            />
            <MetricCard
              icon={DollarSign}
              label="Revenue at Risk"
              value={`$${data.summary.revenueAtRisk.toLocaleString()}`}
              variant="danger"
              tooltip="Monthly subscription revenue from at-risk + critical members"
            />
          </div>

          {/* ── Risk Distribution Bar ── */}
          <RiskDistributionBar summary={data.summary} />
        </>
      )}

      {/* ── Loading ── */}
      {isLoading && <ListSkeleton rows={8} />}

      {/* ── Error ── */}
      {error && !isLoading && (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load member health data"
          description={(error as any)?.message || 'Could not load member data.'}
        />
      )}

      {/* ── Empty ── */}
      {data && data.members.length === 0 && (
        <EmptyState
          icon={Users}
          title="No Members Found"
          description="No member data is available. Members will appear here once they join your club."
        />
      )}

      {/* ── Member Table ── */}
      {data && filtered.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground">
            {filtered.length} member{filtered.length !== 1 ? 's' : ''}
            {riskFilter !== 'all' && ` (${riskConfig[riskFilter as RiskLevel]?.label || riskFilter})`}
          </div>

          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[40px_1fr_80px_90px_80px_50px_20px_28px] gap-3 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <div />
            <SortHeader label="Member" sortKey="name" current={sortBy} asc={sortAsc} onClick={handleSort} />
            <SortHeader label="Health" sortKey="health" current={sortBy} asc={sortAsc} onClick={handleSort} />
            <div>Stage</div>
            <SortHeader label="Last Played" sortKey="lastPlayed" current={sortBy} asc={sortAsc} onClick={handleSort} />
            <SortHeader label="Bookings" sortKey="bookings" current={sortBy} asc={sortAsc} onClick={handleSort} />
            <div>Trend</div>
            <div />
          </div>

          {/* Rows */}
          <div className="space-y-1.5">
            {filtered.map((m) => (
              <MemberRow
                key={m.memberId}
                member={m}
                clubId={clubId}
                isExpanded={expandedId === m.memberId}
                onToggle={() => setExpandedId(expandedId === m.memberId ? null : m.memberId)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── No search results ── */}
      {data && data.members.length > 0 && filtered.length === 0 && (searchQuery || riskFilter !== 'all') && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No members match your filters
        </div>
      )}
    </div>
  )
}

// ── Risk Distribution Bar ──

function RiskDistributionBar({ summary }: { summary: NonNullable<ReturnType<typeof useMemberHealth>['data']>['summary'] }) {
  const { total, healthy, watch, atRisk, critical } = summary
  if (total === 0) return null

  const segments = [
    { count: healthy, color: 'bg-emerald-500', label: 'Healthy' },
    { count: watch, color: 'bg-amber-400', label: 'Watch' },
    { count: atRisk, color: 'bg-orange-500', label: 'At Risk' },
    { count: critical, color: 'bg-red-500', label: 'Critical' },
  ]

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Risk Distribution</span>
        <span className="text-xs text-muted-foreground ml-auto">
          Avg Health: <span className={cn('font-bold', scoreColor(summary.avgHealthScore))}>{summary.avgHealthScore}</span>
        </span>
      </div>

      {/* Bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
        {segments.map((seg) => {
          const pct = (seg.count / total) * 100
          if (pct === 0) return null
          return (
            <div
              key={seg.label}
              className={cn(seg.color, 'transition-all duration-500')}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${seg.count} (${Math.round(pct)}%)`}
            />
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={cn('w-2.5 h-2.5 rounded-full', seg.color)} />
            {seg.label}: {seg.count} ({Math.round((seg.count / total) * 100)}%)
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sort Header ──

function SortHeader({
  label, sortKey, current, asc, onClick,
}: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean; onClick: (k: SortKey) => void
}) {
  const isActive = current === sortKey
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={cn(
        'flex items-center gap-0.5 hover:text-foreground transition-colors text-left',
        isActive && 'text-foreground'
      )}
    >
      {label}
      {isActive && (
        asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      )}
    </button>
  )
}

// ── Member Row ──

function MemberRow({
  member: m,
  clubId,
  isExpanded,
  onToggle,
}: {
  member: MemberHealthResult
  clubId: string
  isExpanded: boolean
  onToggle: () => void
}) {
  const risk = riskConfig[m.riskLevel]
  const daysLabel = m.daysSinceLastBooking === null
    ? 'Never'
    : m.daysSinceLastBooking === 0
      ? 'Today'
      : m.daysSinceLastBooking === 1
        ? 'Yesterday'
        : `${m.daysSinceLastBooking}d ago`

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm">
      {/* Main row */}
      <div
        className="flex sm:grid sm:grid-cols-[40px_1fr_80px_90px_80px_50px_20px_28px] items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-xl"
        onClick={onToggle}
      >
        {/* Health score badge */}
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0',
          scoreBgColor(m.healthScore)
        )}>
          {m.healthScore}
        </div>

        {/* Name + email */}
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {m.member.name || m.member.email}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {m.member.email}
          </div>
        </div>

        {/* Risk badge */}
        <Badge
          variant="outline"
          className={cn('text-xs w-full justify-center truncate', risk.color, risk.bg, risk.border)}
        >
          {risk.label}
        </Badge>

        {/* Stage */}
        <Badge variant="secondary" className="text-xs w-full justify-center truncate hidden sm:flex">
          {stageLabels[m.lifecycleStage]}
        </Badge>

        {/* Last played */}
        <span className="text-xs text-muted-foreground tabular-nums text-right hidden sm:block">
          {daysLabel}
        </span>

        {/* Bookings */}
        <span className="text-xs text-muted-foreground tabular-nums text-right hidden sm:block">
          {m.totalBookings}
        </span>

        {/* Trend */}
        <span className="hidden sm:flex justify-center">
          {trendIcon(m.trend)}
        </span>

        {/* Expand */}
        <div className="flex justify-center">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          <div className="border-t pt-3" />

          {/* Health Score Gauge */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">Health Score</span>
                <span className={cn('text-lg font-extrabold tabular-nums', scoreColor(m.healthScore))}>
                  {m.healthScore}<span className="text-muted-foreground text-xs font-normal">/100</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-700', scoreBgColor(m.healthScore))}
                  style={{ width: `${m.healthScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* Component breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {Object.entries(m.components).map(([key, comp]) => (
              <div key={key} className="text-xs p-2.5 rounded-md bg-muted/50">
                <div className="text-muted-foreground capitalize mb-1">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <div className="font-semibold tabular-nums mb-1">
                  <span className={scoreColor(comp.score)}>{comp.score}</span>
                  <span className="text-muted-foreground font-normal">/100</span>
                  <span className="text-muted-foreground font-normal ml-1">({comp.weight}%)</span>
                </div>
                <div className="text-[11px] text-muted-foreground/70 leading-snug">
                  {comp.label}
                </div>
              </div>
            ))}
          </div>

          {/* Top risks */}
          {m.topRisks.length > 0 && (
            <div className="p-3 rounded-md bg-red-50/50 border border-red-100">
              <div className="text-xs font-medium text-red-700 mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Risk Signals
              </div>
              <ul className="space-y-0.5">
                {m.topRisks.map((risk, i) => (
                  <li key={i} className="text-xs text-red-600/80 flex items-start gap-1.5">
                    <span className="mt-1 w-1 h-1 rounded-full bg-red-400 shrink-0" />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested action */}
          {m.suggestedAction && (
            <div className="p-3 rounded-md bg-blue-50/50 border border-blue-100">
              <div className="text-xs font-medium text-blue-700 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Suggested Action
              </div>
              <div className="text-xs text-blue-600/80 mt-1">
                {m.suggestedAction}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <OutreachActions member={m} clubId={clubId} />

          {/* Outreach History */}
          <OutreachHistory clubId={clubId} userId={m.memberId} />

          {/* Quick stats */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Joined: <strong className="text-foreground">{m.joinedDaysAgo}d ago</strong></span>
            <span>Total bookings: <strong className="text-foreground">{m.totalBookings}</strong></span>
            <span>Last played: <strong className="text-foreground">{daysLabel}</strong></span>
            <span>Trend: <strong className={cn(
              m.trend === 'improving' ? 'text-emerald-600' :
              m.trend === 'declining' ? 'text-red-600' : 'text-foreground'
            )}>{m.trend}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Outreach Action Buttons ──

function OutreachActions({ member: m, clubId }: { member: MemberHealthResult; clubId: string }) {
  const isDemo = useIsDemo()
  const sendOutreach = useSendOutreach()
  const [sentType, setSentType] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lowComponents = Object.entries(m.components)
    .map(([key, comp]) => ({ key, label: comp.label, score: comp.score }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)

  const handleSend = (type: 'CHECK_IN' | 'RETENTION_BOOST') => {
    setError(null)
    sendOutreach.mutate({
      clubId,
      memberId: m.memberId,
      type,
      channel: 'email',
      healthScore: m.healthScore,
      riskLevel: m.riskLevel,
      lowComponents,
      daysSinceLastActivity: m.daysSinceLastBooking,
      totalBookings: m.totalBookings,
    }, {
      onSuccess: (data: any) => {
        if (data.skipped > 0) {
          setError(data.reason || 'Anti-spam limit reached')
        } else {
          setSentType(type)
        }
      },
      onError: (err: any) => {
        setError(err.message || 'Failed to send')
      },
    })
  }

  // Churned → link to reactivation page
  if (m.lifecycleStage === 'churned') {
    const demoSuffix = isDemo ? '?demo=true' : ''
    return (
      <div className="flex items-center gap-2">
        <Link href={`/clubs/${clubId}/intelligence/reactivation${demoSuffix}`}>
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
            <ExternalLink className="h-3 w-3" />
            Send Win-back
          </Button>
        </Link>
        <span className="text-[11px] text-muted-foreground">Via Reactivation flow</span>
      </div>
    )
  }

  // Healthy → no action needed
  if (m.riskLevel === 'healthy') return null

  const outreachType: 'CHECK_IN' | 'RETENTION_BOOST' =
    m.riskLevel === 'watch' ? 'CHECK_IN' : 'RETENTION_BOOST'

  const buttonLabel = m.riskLevel === 'watch' ? 'Send Check-in' : 'Send Retention Boost'
  const buttonColor = m.riskLevel === 'watch'
    ? 'bg-amber-500 hover:bg-amber-600 text-white'
    : 'bg-orange-500 hover:bg-orange-600 text-white'

  if (sentType) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
        <Mail className="h-3.5 w-3.5" />
        {sentType === 'CHECK_IN' ? 'Check-in' : 'Retention boost'} sent via email
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        size="sm"
        className={cn('text-xs gap-1.5 h-8', buttonColor)}
        disabled={sendOutreach.isPending}
        onClick={() => handleSend(outreachType)}
      >
        {sendOutreach.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Send className="h-3 w-3" />
        )}
        {buttonLabel}
      </Button>
      {error && (
        <span className="text-[11px] text-red-500">{error}</span>
      )}
    </div>
  )
}

// ── Outreach History in expanded row ──

const TYPE_COLORS: Record<string, string> = {
  CHECK_IN: 'bg-amber-100 text-amber-700 border-amber-200',
  RETENTION_BOOST: 'bg-orange-100 text-orange-700 border-orange-200',
  SLOT_FILLER: 'bg-blue-100 text-blue-700 border-blue-200',
  REACTIVATION: 'bg-purple-100 text-purple-700 border-purple-200',
}

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  pending: 'bg-gray-100 text-gray-600 border-gray-200',
  skipped: 'bg-gray-100 text-gray-500 border-gray-200',
}

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function OutreachHistory({ clubId, userId }: { clubId: string; userId: string }) {
  const { data, isLoading } = useMemberOutreachHistory(clubId, userId)

  if (isLoading) return <div className="text-xs text-muted-foreground animate-pulse">Loading outreach history...</div>
  if (!data?.logs?.length) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Mail className="h-3 w-3" />
        Outreach History
      </div>
      <div className="space-y-1">
        {data.logs.map((log: any) => (
          <div key={log.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-md bg-muted/30">
            <span className="text-muted-foreground tabular-nums w-20 shrink-0">
              {formatRelative(log.createdAt)}
            </span>
            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium border', TYPE_COLORS[log.type] || 'bg-gray-100')}>
              {log.type.replace('_', ' ')}
            </span>
            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium border', STATUS_COLORS[log.status] || 'bg-gray-100')}>
              {log.status}
            </span>
            {log.channel && <span className="text-muted-foreground text-[10px]">{log.channel}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
