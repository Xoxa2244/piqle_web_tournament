'use client'

import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid3X3,
  Heart,
  List,
  Search,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react'
import { useTheme } from '../IQThemeProvider'
import { PlayerProfileIQ } from './PlayerProfileIQ'
import type {
  ActivityLevel,
  EngagementTrend,
  LifecycleStage,
  MemberHealthData,
  MemberHealthResult,
  NormalizedMembershipStatus,
  RiskLevel,
  ValueTier,
} from '@/types/intelligence'

type ViewMode = 'list' | 'grid'
type SortKey = 'health' | 'name' | 'lastActive' | 'sessions'
type FilterValue = 'all'

interface MembersIQProps {
  memberHealthData?: MemberHealthData
  isLoading?: boolean
  clubId?: string
  memberGrowthData?: unknown
  smartFirstSessionData?: unknown
  guestTrialBookingData?: unknown
  winBackSnapshot?: unknown
  referralSnapshot?: unknown
  sendOutreach?: unknown
  sendReactivation?: unknown
  reactivationCandidates?: unknown
  aiProfiles?: unknown
  onRegenerateProfiles?: unknown
}

type MemberRow = {
  id: string
  name: string
  email: string
  initials: string
  healthScore: number
  riskLevel: RiskLevel
  lifecycleStage: LifecycleStage
  trend: EngagementTrend
  activityLevel: ActivityLevel
  valueTier: ValueTier
  totalBookings: number
  sessionsThisMonth: number
  avgSessionsPerWeek: number
  revenue: number
  daysSinceLastBooking: number | null
  membershipStatus: NormalizedMembershipStatus
  membershipType: string
  suggestedAction: string
  topRisk: string
  dupr: number | null
}

const STATUS_FILTERS: { value: FilterValue | NormalizedMembershipStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'guest', label: 'Guest' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'expired', label: 'Expired' },
  { value: 'none', label: 'No membership' },
]

const RISK_FILTERS: { value: FilterValue | RiskLevel; label: string }[] = [
  { value: 'all', label: 'All risks' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'watch', label: 'Watch' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'critical', label: 'Critical' },
]

const ACTIVITY_FILTERS: { value: FilterValue | ActivityLevel; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'power', label: 'Power' },
  { value: 'regular', label: 'Regular' },
  { value: 'casual', label: 'Casual' },
  { value: 'occasional', label: 'Occasional' },
]

const riskStyles: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  healthy: { label: 'Healthy', color: '#10B981', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.28)' },
  watch: { label: 'Watch', color: '#F59E0B', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.28)' },
  at_risk: { label: 'At risk', color: '#F97316', bg: 'rgba(249,115,22,0.14)', border: 'rgba(249,115,22,0.30)' },
  critical: { label: 'Critical', color: '#EF4444', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.30)' },
}

const membershipStyles: Record<NormalizedMembershipStatus, { label: string; color: string; bg: string; border: string }> = {
  active: { label: 'Active', color: '#10B981', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.28)' },
  trial: { label: 'Trial', color: '#06B6D4', bg: 'rgba(6,182,212,0.14)', border: 'rgba(6,182,212,0.28)' },
  guest: { label: 'Guest', color: '#38BDF8', bg: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.28)' },
  suspended: { label: 'Suspended', color: '#F59E0B', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.28)' },
  expired: { label: 'Expired', color: '#EF4444', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.30)' },
  cancelled: { label: 'Cancelled', color: '#F43F5E', bg: 'rgba(244,63,94,0.14)', border: 'rgba(244,63,94,0.30)' },
  none: { label: 'No membership', color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.24)' },
  unknown: { label: 'Unknown', color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.24)' },
}

const activityLabels: Record<ActivityLevel, string> = {
  power: 'Power',
  regular: 'Regular',
  casual: 'Casual',
  occasional: 'Occasional',
}

const trendLabels: Record<EngagementTrend, string> = {
  growing: 'Growing',
  stable: 'Stable',
  declining: 'Declining',
  churning: 'Churning',
}

function Card({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)' }}
      {...props}
    >
      {children}
    </div>
  )
}

function Pill({ children, style }: { children: React.ReactNode; style: { color: string; bg: string; border: string } }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
    >
      {children}
    </span>
  )
}

function initialsFor(name: string, email: string) {
  const source = name || email
  return source
    .split(/[ ._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'M'
}

function toMembershipStatus(member: MemberHealthResult): NormalizedMembershipStatus {
  return member.normalizedMembershipStatus || 'unknown'
}

function toMembershipType(member: MemberHealthResult) {
  if (member.membershipType) return member.membershipType
  const type = member.normalizedMembershipType
  if (!type || type === 'unknown') return 'Unmapped plan'
  return type
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function toTrend(member: MemberHealthResult): EngagementTrend {
  if (member.segment?.trend) return member.segment.trend
  if (member.trend === 'improving') return 'growing'
  if (member.trend === 'declining') return member.riskLevel === 'critical' ? 'churning' : 'declining'
  return 'stable'
}

function toActivity(member: MemberHealthResult): ActivityLevel {
  if (member.segment?.activityLevel) return member.segment.activityLevel
  if (member.totalBookings >= 35) return 'power'
  if (member.totalBookings >= 16) return 'regular'
  if (member.totalBookings >= 5) return 'casual'
  return 'occasional'
}

function toValueTier(member: MemberHealthResult): ValueTier {
  if (member.segment?.valueTier) return member.segment.valueTier
  if ((member.totalRevenue || 0) >= 1000 || member.totalBookings >= 35) return 'high'
  if ((member.totalRevenue || 0) >= 350 || member.totalBookings >= 12) return 'medium'
  return 'low'
}

function estimateMonthlySessions(member: MemberHealthResult) {
  if (member.avgSessionsPerWeek !== undefined) return Math.round(member.avgSessionsPerWeek * 4)
  const activeWeeks = Math.max(4, member.joinedDaysAgo / 7)
  return Math.max(0, Math.round((member.totalBookings / activeWeeks) * 4))
}

function estimateAvgPerWeek(member: MemberHealthResult) {
  if (member.avgSessionsPerWeek !== undefined) return member.avgSessionsPerWeek
  const activeWeeks = Math.max(4, member.joinedDaysAgo / 7)
  return Math.round((member.totalBookings / activeWeeks) * 10) / 10
}

function mapMembers(data?: MemberHealthData): MemberRow[] {
  if (!data?.members) return []

  return data.members.map((member) => {
    const name = member.member.name || member.member.email || 'Unknown member'
    const email = member.member.email || ''
    const revenue = member.totalRevenue ?? Math.round(member.totalBookings * 22 + member.healthScore * 3)

    return {
      id: member.memberId || member.member.id,
      name,
      email,
      initials: initialsFor(name, email),
      healthScore: member.healthScore,
      riskLevel: member.riskLevel,
      lifecycleStage: member.lifecycleStage,
      trend: toTrend(member),
      activityLevel: toActivity(member),
      valueTier: toValueTier(member),
      totalBookings: member.totalBookings,
      sessionsThisMonth: estimateMonthlySessions(member),
      avgSessionsPerWeek: estimateAvgPerWeek(member),
      revenue,
      daysSinceLastBooking: member.daysSinceLastBooking,
      membershipStatus: toMembershipStatus(member),
      membershipType: toMembershipType(member),
      suggestedAction: member.suggestedAction || 'Review next best action',
      topRisk: member.topRisks?.[0] || 'No major risk signal',
      dupr: member.member.duprRatingDoubles ?? member.member.duprRatingSingles ?? null,
    }
  })
}

function formatLastPlayed(days: number | null) {
  if (days === null) return 'Never played'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function scoreColor(score: number) {
  if (score >= 75) return '#10B981'
  if (score >= 50) return '#F59E0B'
  if (score >= 25) return '#F97316'
  return '#EF4444'
}

function TrendIcon({ trend }: { trend: EngagementTrend }) {
  if (trend === 'growing') return <ArrowUpRight className="h-4 w-4 text-emerald-400" />
  if (trend === 'declining' || trend === 'churning') return <ArrowDownRight className="h-4 w-4 text-red-400" />
  return <CheckCircle2 className="h-4 w-4 text-slate-400" />
}

export function MembersIQ({ memberHealthData, isLoading: externalLoading, clubId }: MembersIQProps = {}) {
  const { isDark } = useTheme()
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterValue | NormalizedMembershipStatus>('all')
  const [riskFilter, setRiskFilter] = useState<FilterValue | RiskLevel>('all')
  const [activityFilter, setActivityFilter] = useState<FilterValue | ActivityLevel>('all')
  const [sortBy, setSortBy] = useState<SortKey>('health')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [page, setPage] = useState(1)

  const members = useMemo(() => mapMembers(memberHealthData), [memberHealthData])
  const pageSize = 24

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const result = members.filter((member) => {
      if (statusFilter !== 'all' && member.membershipStatus !== statusFilter) return false
      if (riskFilter !== 'all' && member.riskLevel !== riskFilter) return false
      if (activityFilter !== 'all' && member.activityLevel !== activityFilter) return false
      if (!query) return true
      return (
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.membershipType.toLowerCase().includes(query)
      )
    })

    return [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'lastActive') return (a.daysSinceLastBooking ?? 999) - (b.daysSinceLastBooking ?? 999)
      if (sortBy === 'sessions') return b.sessionsThisMonth - a.sessionsThisMonth
      return a.healthScore - b.healthScore
    })
  }, [activityFilter, members, riskFilter, searchQuery, sortBy, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / pageSize))
  const pagedMembers = filteredMembers.slice((page - 1) * pageSize, page * pageSize)

  const summary = useMemo(() => {
    const total = members.length
    const active = members.filter((m) => m.membershipStatus === 'active').length
    const inactive = members.filter((m) => ['suspended', 'expired', 'cancelled', 'none'].includes(m.membershipStatus)).length
    const guestTrial = members.filter((m) => m.membershipStatus === 'guest' || m.membershipStatus === 'trial').length
    const atRisk = members.filter((m) => m.riskLevel === 'at_risk' || m.riskLevel === 'critical').length
    const avgHealth = total ? Math.round(members.reduce((sum, m) => sum + m.healthScore, 0) / total) : 0
    return { total, active, inactive, guestTrial, atRisk, avgHealth }
  }, [members])

  const setFilterAndResetPage = <T extends string>(setter: (value: T) => void, value: T) => {
    setter(value)
    setPage(1)
  }

  const openMember = (memberId: string) => setSelectedPlayerId(memberId)

  if (selectedPlayerId && clubId) {
    return <PlayerProfileIQ userId={selectedPlayerId} clubId={clubId} onBack={() => setSelectedPlayerId(null)} />
  }

  if (externalLoading && members.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="h-10 w-56 animate-pulse rounded-xl" style={{ background: 'var(--subtle)' }} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} />
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
            <Users className="h-4 w-4" />
            Members
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>
            Member directory
          </h1>
          <p className="mt-2 max-w-3xl text-sm" style={{ color: 'var(--muted)' }}>
            Active members, trials, guests, and inactive accounts with health, activity, and next action context.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl p-1" style={{ background: 'var(--subtle)' }}>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="rounded-xl p-2 transition"
            style={{ color: viewMode === 'list' ? 'var(--foreground)' : 'var(--muted)', background: viewMode === 'list' ? 'var(--card-bg)' : 'transparent' }}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className="rounded-xl p-2 transition"
            style={{ color: viewMode === 'grid' ? 'var(--foreground)' : 'var(--muted)', background: viewMode === 'grid' ? 'var(--card-bg)' : 'transparent' }}
            aria-label="Grid view"
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <KpiCard icon={Users} label="Total members" value={summary.total} tone="#06B6D4" />
        <KpiCard icon={UserCheck} label="Active" value={summary.active} tone="#10B981" />
        <KpiCard icon={Clock} label="Inactive" value={summary.inactive} tone="#F59E0B" />
        <KpiCard icon={UserRound} label="Guest / trial" value={summary.guestTrial} tone="#38BDF8" />
        <KpiCard icon={AlertTriangle} label="At risk" value={summary.atRisk} tone="#EF4444" />
        <KpiCard icon={Heart} label="Avg health" value={summary.avgHealth} suffix="/100" tone={scoreColor(summary.avgHealth)} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
            <input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Search members, email, plan..."
              className="h-11 w-full rounded-xl border pl-10 pr-3 text-sm outline-none transition"
              style={{
                background: isDark ? 'rgba(15,23,42,0.70)' : 'rgba(255,255,255,0.86)',
                borderColor: 'var(--card-border)',
                color: 'var(--foreground)',
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setFilterAndResetPage(setStatusFilter, event.target.value as FilterValue | NormalizedMembershipStatus)}
              className="h-11 rounded-xl border px-3 text-sm outline-none"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
            >
              {STATUS_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
            </select>
            <select
              value={riskFilter}
              onChange={(event) => setFilterAndResetPage(setRiskFilter, event.target.value as FilterValue | RiskLevel)}
              className="h-11 rounded-xl border px-3 text-sm outline-none"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
            >
              {RISK_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
            </select>
            <select
              value={activityFilter}
              onChange={(event) => setFilterAndResetPage(setActivityFilter, event.target.value as FilterValue | ActivityLevel)}
              className="h-11 rounded-xl border px-3 text-sm outline-none"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
            >
              {ACTIVITY_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
              className="h-11 rounded-xl border px-3 text-sm outline-none"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
            >
              <option value="health">Sort by risk</option>
              <option value="sessions">Sort by sessions</option>
              <option value="lastActive">Sort by last active</option>
              <option value="name">Sort by name</option>
            </select>
          </div>
        </div>
      </Card>

      {viewMode === 'list' ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[minmax(260px,1.5fr)_130px_130px_120px_120px_minmax(200px,1fr)] gap-4 border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide max-xl:hidden" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
            <span>Member</span>
            <span>Status</span>
            <span>Risk</span>
            <span>Activity</span>
            <span>Last active</span>
            <span>Next action</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
            {pagedMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => openMember(member.id)}
                className="grid w-full grid-cols-1 gap-4 px-5 py-4 text-left transition hover:bg-white/5 xl:grid-cols-[minmax(260px,1.5fr)_130px_130px_120px_120px_minmax(200px,1fr)] xl:items-center"
                style={{ borderColor: 'var(--card-border)' }}
              >
                <MemberIdentity member={member} />
                <Pill style={membershipStyles[member.membershipStatus]}>{membershipStyles[member.membershipStatus].label}</Pill>
                <Pill style={riskStyles[member.riskLevel]}>{riskStyles[member.riskLevel].label}</Pill>
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--foreground)' }}>
                  <TrendIcon trend={member.trend} />
                  <span>{activityLabels[member.activityLevel]}</span>
                </div>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>{formatLastPlayed(member.daysSinceLastBooking)}</div>
                <div className="min-w-0 text-sm" style={{ color: 'var(--muted)' }}>
                  <span className="line-clamp-2">{member.suggestedAction}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pagedMembers.map((member) => (
            <Card
              key={member.id}
              role="button"
              tabIndex={0}
              onClick={() => openMember(member.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') openMember(member.id)
              }}
              className="cursor-pointer p-5 transition hover:-translate-y-0.5"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <MemberIdentity member={member} />
                <div className="text-right">
                  <div className="text-2xl font-bold" style={{ color: scoreColor(member.healthScore) }}>{member.healthScore}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>health</div>
                </div>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Pill style={membershipStyles[member.membershipStatus]}>{membershipStyles[member.membershipStatus].label}</Pill>
                <Pill style={riskStyles[member.riskLevel]}>{riskStyles[member.riskLevel].label}</Pill>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <MiniStat label="Month" value={member.sessionsThisMonth} />
                <MiniStat label="Total" value={member.totalBookings} />
                <MiniStat label="Value" value={member.valueTier} />
              </div>
              <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: 'var(--subtle)', color: 'var(--muted)' }}>
                {member.topRisk}
              </div>
            </Card>
          ))}
        </div>
      )}

      {filteredMembers.length === 0 && (
        <Card className="p-10 text-center">
          <Users className="mx-auto mb-3 h-8 w-8" style={{ color: 'var(--muted)' }} />
          <div className="font-semibold" style={{ color: 'var(--foreground)' }}>No members match these filters</div>
          <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Try clearing a status, risk, or search filter.</div>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm" style={{ color: 'var(--muted)' }}>
          Showing {filteredMembers.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredMembers.length)} of {filteredMembers.length} members
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="rounded-xl border p-2 disabled:opacity-40"
            style={{ borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm" style={{ color: 'var(--muted)' }}>Page {page} of {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
            className="rounded-xl border p-2 disabled:opacity-40"
            style={{ borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function KpiCard({ icon: Icon, label, value, suffix = '', tone }: { icon: typeof Users; label: string; value: number; suffix?: string; tone: string }) {
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="rounded-xl p-2" style={{ background: `${tone}20`, color: tone }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>
        {value.toLocaleString()}<span className="text-base" style={{ color: 'var(--muted)' }}>{suffix}</span>
      </div>
    </Card>
  )
}

function MemberIdentity({ member }: { member: MemberRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.24), rgba(16,185,129,0.20))', color: 'var(--accent)' }}
      >
        {member.initials}
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold" style={{ color: 'var(--foreground)' }}>{member.name}</div>
        <div className="truncate text-sm" style={{ color: 'var(--muted)' }}>{member.email}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <span>{member.membershipType}</span>
          {member.dupr !== null && <span>DUPR {member.dupr.toFixed(2)}</span>}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="mt-1 truncate text-sm font-semibold capitalize" style={{ color: 'var(--foreground)' }}>{value}</div>
    </div>
  )
}
