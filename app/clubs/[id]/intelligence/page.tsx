'use client'

import { useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Users, BarChart3, DollarSign, Calendar,
  TrendingUp, UserMinus, ArrowRight, AlertTriangle,
  Zap, Brain, Sparkles, CalendarDays,
} from 'lucide-react'
import { MetricCard } from './_components/metric-card'
import { VerticalBarChart, HorizontalBarChart } from './_components/charts'
import { SessionTable } from './_components/session-table'
import { PlayerActivity } from './_components/player-activity'
import { DashboardSkeleton } from './_components/skeleton'
import { EmptyState } from './_components/empty-state'
import { useDashboardV2 } from './_hooks/use-intelligence'
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

export default function IntelligenceDashboardPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clubId = params.id as string
  const demoSuffix = searchParams.get('demo') === 'true' ? '?demo=true' : ''
  const [occTab, setOccTab] = useState<OccupancyTab>('day')

  const { data, isLoading, error } = useDashboardV2(clubId)

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

  // ── No data onboarding — CTA to Advisor ──
  if (!hasData && metrics.members.trend.value === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
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
      {/* ── KPI Metrics with Trends ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={Users}
          label={metrics.members.label}
          value={metrics.members.value}
          subtitle={metrics.members.subtitle}
          trendValue={metrics.members.trend.changePercent}
          trendDirection={metrics.members.trend.direction}
          sparkline={metrics.members.trend.sparkline}
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
        />
        <MetricCard
          icon={CalendarDays}
          label={metrics.bookings.label}
          value={metrics.bookings.value}
          subtitle={metrics.bookings.subtitle}
          trendValue={metrics.bookings.trend.changePercent}
          trendDirection={metrics.bookings.trend.direction}
          sparkline={metrics.bookings.trend.sparkline}
        />
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid md:grid-cols-3 gap-3">
        <QuickActionCard
          href={`/clubs/${clubId}/intelligence/slot-filler${demoSuffix}`}
          icon={TrendingUp}
          iconColor="text-green-500"
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
          iconColor="text-orange-500"
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
          iconColor="text-blue-500"
          title="Revenue Intelligence"
          description="Occupancy patterns and pricing opportunities."
        />
      </div>

      {/* ── Occupancy Breakdown (Tabs) ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Occupancy Breakdown
            </CardTitle>
            <div className="flex gap-1">
              {([
                { key: 'day', label: 'By Day' },
                { key: 'time', label: 'By Time' },
                { key: 'format', label: 'By Format' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setOccTab(tab.key)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                    occTab === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {occTab === 'day' && (
            <VerticalBarChart
              items={occupancy.byDay.map(d => ({
                label: d.day,
                value: d.avgOccupancy,
                sublabel: `${d.sessionCount} ses`,
              }))}
              maxValue={100}
              height={140}
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
        </CardContent>
      </Card>

      {/* ── Session Rankings ── */}
      <div className="grid md:grid-cols-2 gap-3">
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
  iconColor,
  title,
  description,
  badge,
  badgeVariant = 'default',
}: {
  href: string
  icon: any
  iconColor: string
  title: string
  description: string
  badge?: string
  badgeVariant?: 'default' | 'warning'
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer h-full group">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            {badge && (
              <Badge
                variant="secondary"
                className={
                  badgeVariant === 'warning'
                    ? 'bg-orange-100 text-orange-700 border-orange-200 text-[10px]'
                    : 'text-[10px]'
                }
              >
                {badge}
              </Badge>
            )}
          </div>
          <div className="font-semibold text-sm mb-1">{title}</div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{description}</p>
          <div className="flex items-center text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            Explore <ArrowRight className="h-3 w-3 ml-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
