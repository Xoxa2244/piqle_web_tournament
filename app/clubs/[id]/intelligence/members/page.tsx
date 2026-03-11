'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Users, Search, AlertTriangle, Heart, Activity,
  TrendingDown, TrendingUp, Minus, ChevronDown, ChevronUp,
  DollarSign, Shield, Eye, Zap,
} from 'lucide-react'
import { MetricCard } from '../_components/metric-card'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useMemberHealth } from '../_hooks/use-intelligence'
import { cn } from '@/lib/utils'
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
          <div className="hidden sm:grid grid-cols-[1fr_80px_90px_90px_80px_60px_28px] gap-3 px-3 py-2 text-xs font-semibold text-muted-foreground">
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
  isExpanded,
  onToggle,
}: {
  member: MemberHealthResult
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
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-xl"
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
        <div className="flex-1 min-w-0">
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
          className={cn('text-xs shrink-0', risk.color, risk.bg, risk.border)}
        >
          {risk.label}
        </Badge>

        {/* Stage */}
        <Badge variant="secondary" className="text-xs shrink-0 hidden sm:flex">
          {stageLabels[m.lifecycleStage]}
        </Badge>

        {/* Last played */}
        <span className="text-xs text-muted-foreground tabular-nums w-16 text-right shrink-0 hidden sm:block">
          {daysLabel}
        </span>

        {/* Bookings */}
        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right shrink-0 hidden sm:block">
          {m.totalBookings}
        </span>

        {/* Trend */}
        <span className="shrink-0 hidden sm:block">
          {trendIcon(m.trend)}
        </span>

        {/* Expand */}
        <div className="shrink-0">
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
