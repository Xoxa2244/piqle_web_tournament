'use client'

import { useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Users, BarChart3, DollarSign,
  TrendingUp, UserMinus, ArrowRight, AlertTriangle,
  Brain, Sparkles, CalendarDays, ChevronRight, Shield,
} from 'lucide-react'
import { MetricCard } from './_components/metric-card'
import { VerticalBarChart, HorizontalBarChart } from './_components/charts'
import { SessionTable } from './_components/session-table'
import { PlayerActivity } from './_components/player-activity'
import { DashboardSkeleton } from './_components/skeleton'
import { EmptyState } from './_components/empty-state'
import { useDashboardV2, useMemberHealth } from './_hooks/use-intelligence'
import { cn } from '@/lib/utils'

const formatLabels: Record<string, string> = {
  OPEN_PLAY: 'Open Play',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  LEAGUE_PLAY: 'League',
  SOCIAL: 'Social',
}

const timeSlotLabels: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

type OccupancyTab = 'day' | 'time' | 'format'
type DatePreset = '7d' | '14d' | '30d' | '90d' | 'custom'

export default function IntelligenceDashboardPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clubId = params.id as string
  const demoSuffix = searchParams.get('demo') === 'true' ? '?demo=true' : ''
  const [occTab, setOccTab] = useState<OccupancyTab>('day')
  const [datePreset, setDatePreset] = useState<DatePreset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const dateFilters = useMemo(() => {
    if (datePreset === 'custom') {
      return { dateFrom: customFrom || undefined, dateTo: customTo || undefined }
    }
    const days = datePreset === '7d' ? 7 : datePreset === '14d' ? 14 : datePreset === '90d' ? 90 : 30
    if (days === 30) return {} // default — no params needed
    const to = new Date()
    const from = new Date(to.getTime() - days * 86400000)
    return {
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
    }
  }, [datePreset, customFrom, customTo])

  const { data, isLoading, error } = useDashboardV2(clubId, dateFilters.dateFrom, dateFilters.dateTo)
  const { data: healthData } = useMemberHealth(clubId)

  if (isLoading) return <DashboardSkeleton />

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Access Required"
        description={error.message || 'You need club admin or member access to view intelligence data.'}
      />
    )
  }

  if (!data) return null

  const { metrics, occupancy, sessions, players } = data
  const hasData = players.activeCount > 0 || players.inactiveCount > 0

  // ── No data onboarding ──
  if (!hasData && metrics.members.trend.value === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center mb-6 shadow-lg shadow-lime-500/20">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-xl font-bold mb-2">Set Up AI Intelligence</h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Upload your court schedule to unlock AI-powered insights about occupancy, member engagement, revenue opportunities, and more.
        </p>
        <Link href={`/clubs/${clubId}/intelligence/advisor`}>
          <Button className="gap-2">
            <Sparkles className="w-4 h-4" />
            Go to AI Advisor
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Date Filter ── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground">Period:</span>
        <div className="flex bg-muted/60 rounded-lg p-0.5">
          {([
            { key: '7d', label: '7D' },
            { key: '14d', label: '14D' },
            { key: '30d', label: '30D' },
            { key: '90d', label: '90D' },
            { key: 'custom', label: 'Custom' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setDatePreset(tab.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200',
                datePreset === tab.key
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="h-8 px-2 text-xs border border-border rounded-md bg-background"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="h-8 px-2 text-xs border border-border rounded-md bg-background"
            />
          </div>
        )}
      </div>

      {/* ── KPI Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label={metrics.members.label}
          value={metrics.members.value}
          subtitle={metrics.members.subtitle}
          trendValue={metrics.members.trend.changePercent}
          trendDirection={metrics.members.trend.direction}
          sparkline={metrics.members.trend.sparkline}
          tooltip={metrics.members.description}
        />
        <MetricCard
          icon={BarChart3}
          label={metrics.occupancy.label}
          value={metrics.occupancy.value}
          subtitle={metrics.occupancy.subtitle}
          trendValue={metrics.occupancy.trend.changePercent}
          trendDirection={metrics.occupancy.trend.direction}
          sparkline={metrics.occupancy.trend.sparkline}
          variant={
            (metrics.occupancy.trend.value as number) >= 70 ? 'success' :
            (metrics.occupancy.trend.value as number) >= 40 ? 'warning' : 'danger'
          }
          tooltip={metrics.occupancy.description}
        />
        <MetricCard
          icon={DollarSign}
          label={metrics.lostRevenue.label}
          value={metrics.lostRevenue.value}
          subtitle={metrics.lostRevenue.subtitle}
          trendValue={metrics.lostRevenue.trend.changePercent}
          trendDirection={metrics.lostRevenue.trend.direction}
          variant="danger"
          invertTrend
          tooltip={metrics.lostRevenue.description}
        />
        <MetricCard
          icon={CalendarDays}
          label={metrics.bookings.label}
          value={metrics.bookings.value}
          subtitle={metrics.bookings.subtitle}
          trendValue={metrics.bookings.trend.changePercent}
          trendDirection={metrics.bookings.trend.direction}
          sparkline={metrics.bookings.trend.sparkline}
          tooltip={metrics.bookings.description}
        />
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickActionCard
          href={`/clubs/${clubId}/intelligence/slot-filler${demoSuffix}`}
          icon={TrendingUp}
          gradientFrom="from-emerald-500"
          gradientTo="to-green-600"
          title="Smart Slot Filler"
          description="AI recommends members to fill empty courts."
          badge={
            sessions.problematicSessions.length > 0
              ? `${sessions.problematicSessions.length} need attention`
              : undefined
          }
          badgeVariant="warning"
        />
        <QuickActionCard
          href={`/clubs/${clubId}/intelligence/reactivation${demoSuffix}`}
          icon={UserMinus}
          gradientFrom="from-orange-500"
          gradientTo="to-amber-600"
          title="Member Reactivation"
          description="Spot disengaging members before they cancel."
          badge={
            players.inactiveCount > 0
              ? `${players.inactiveCount} inactive`
              : undefined
          }
          badgeVariant="warning"
        />
        <QuickActionCard
          href={`/clubs/${clubId}/intelligence/revenue${demoSuffix}`}
          icon={DollarSign}
          gradientFrom="from-blue-500"
          gradientTo="to-indigo-600"
          title="Revenue Intelligence"
          description="Occupancy patterns and pricing opportunities."
        />
        <QuickActionCard
          href={`/clubs/${clubId}/intelligence/members${demoSuffix}`}
          icon={Shield}
          gradientFrom="from-rose-500"
          gradientTo="to-pink-600"
          title="Member Health"
          description="Churn prediction and member lifecycle tracking."
          badge={
            healthData && (healthData.summary.atRisk + healthData.summary.critical) > 0
              ? `${healthData.summary.atRisk + healthData.summary.critical} at risk`
              : undefined
          }
          badgeVariant="warning"
        />
      </div>

      {/* ── Occupancy Breakdown ── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Occupancy Breakdown</h3>
          </div>
          <div className="flex bg-muted/60 rounded-lg p-0.5">
            {([
              { key: 'day', label: 'By Day' },
              { key: 'time', label: 'By Time' },
              { key: 'format', label: 'By Format' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setOccTab(tab.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200',
                  occTab === tab.key
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5">
          {occTab === 'day' && (
            <VerticalBarChart
              items={occupancy.byDay.map(d => ({
                label: d.day,
                value: d.avgOccupancy,
                sublabel: `${d.sessionCount} ses`,
              }))}
              maxValue={100}
              height={160}
            />
          )}
          {occTab === 'time' && (
            <HorizontalBarChart
              items={occupancy.byTimeSlot.map(d => ({
                label: timeSlotLabels[d.slot] || d.slot,
                value: d.avgOccupancy,
                sublabel: `${d.sessionCount} sessions`,
              }))}
              maxValue={100}
            />
          )}
          {occTab === 'format' && (
            <HorizontalBarChart
              items={occupancy.byFormat.map(d => ({
                label: formatLabels[d.format] || d.format,
                value: d.avgOccupancy,
                sublabel: `${d.sessionCount} sessions`,
              }))}
              maxValue={100}
            />
          )}
        </div>
      </div>

      {/* ── Session Rankings ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <SessionTable sessions={sessions.topSessions as any} variant="top" />
        <SessionTable sessions={sessions.problematicSessions as any} variant="problematic" />
      </div>

      {/* ── Player Activity ── */}
      <PlayerActivity
        activeCount={players.activeCount}
        inactiveCount={players.inactiveCount}
        newThisMonth={players.newThisMonth}
        bySkillLevel={players.bySkillLevel}
        byFormat={players.byFormat}
      />
    </div>
  )
}

// ── Quick Action Card ──
function QuickActionCard({
  href,
  icon: Icon,
  gradientFrom,
  gradientTo,
  title,
  description,
  badge,
  badgeVariant = 'default',
}: {
  href: string
  icon: any
  gradientFrom: string
  gradientTo: string
  title: string
  description: string
  badge?: string
  badgeVariant?: 'default' | 'warning'
}) {
  return (
    <Link href={href}>
      <div className="group relative rounded-xl border border-border/60 bg-card p-5 shadow-sm hover:shadow-md hover:border-border transition-all duration-300 cursor-pointer h-full overflow-hidden">
        {/* Subtle hover glow */}
        <div className={cn(
          'absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-0 group-hover:opacity-[0.08] blur-2xl transition-opacity',
          gradientFrom.replace('from-', 'bg-')
        )} />

        <div className="relative flex items-start justify-between mb-3">
          <div className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br shadow-lg',
            gradientFrom, gradientTo,
            gradientFrom.replace('from-', 'shadow-') + '/25'
          )}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          {badge && (
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] font-semibold border',
                badgeVariant === 'warning'
                  ? 'bg-orange-50 text-orange-600 border-orange-200'
                  : ''
              )}
            >
              {badge}
            </Badge>
          )}
        </div>
        <div className="relative">
          <div className="font-bold text-sm mb-1 text-foreground">{title}</div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{description}</p>
          <div className="flex items-center text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-1 transition-all duration-300">
            Explore <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
          </div>
        </div>
      </div>
    </Link>
  )
}
