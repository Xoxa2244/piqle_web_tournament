'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Users, BarChart3, DollarSign, Zap, Calendar,
  TrendingUp, UserMinus, ArrowRight, AlertTriangle,
  CalendarPlus
} from 'lucide-react'
import { MetricCard } from './_components/metric-card'
import { OccupancyBar, OccupancyBadge } from './_components/charts'
import { DashboardSkeleton } from './_components/skeleton'
import { EmptyState } from './_components/empty-state'

export default function IntelligenceDashboardPage() {
  const params = useParams()
  const clubId = params.id as string

  const { data, isLoading, error } = trpc.intelligence.getDashboard.useQuery(
    { clubId },
    { enabled: !!clubId }
  )

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

  const { metrics, upcomingSessions, underfilledSessions } = data
  const hasAnySessions = upcomingSessions.length > 0

  // ── No data onboarding ──
  if (!hasAnySessions && metrics.totalMembers === 0) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No Data Yet"
        description="Import your club's schedule and member data to unlock AI-powered insights. Intelligence needs sessions and bookings to analyze."
        actionLabel="Learn How to Import"
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Key Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={Users}
          label="Members"
          value={metrics.totalMembers}
          subtitle={`${metrics.totalCourts} courts`}
        />
        <MetricCard
          icon={BarChart3}
          label="Avg Occupancy"
          value={`${metrics.avgOccupancy}%`}
          subtitle={`${metrics.recentBookings} bookings (30d)`}
          variant={metrics.avgOccupancy >= 70 ? 'success' : metrics.avgOccupancy >= 40 ? 'warning' : 'danger'}
        />
        <MetricCard
          icon={DollarSign}
          label="Est. Lost Revenue"
          value={`$${metrics.estimatedLostRevenue.toLocaleString()}`}
          subtitle={`${metrics.emptySlots} empty slots`}
          variant="danger"
        />
        <MetricCard
          icon={Zap}
          label="AI Actions"
          value={metrics.aiRecommendationsThisWeek}
          subtitle="this week"
        />
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid md:grid-cols-3 gap-3">
        <QuickActionCard
          href={`/clubs/${clubId}/intelligence/slot-filler`}
          icon={TrendingUp}
          iconColor="text-green-500"
          title="Smart Slot Filler"
          description="AI recommends members to fill empty courts."
          badge={
            underfilledSessions.length > 0
              ? `${underfilledSessions.length} need attention`
              : undefined
          }
          badgeVariant="warning"
        />
        <QuickActionCard
          href={`/clubs/${clubId}/intelligence/reactivation`}
          icon={UserMinus}
          iconColor="text-orange-500"
          title="Member Reactivation"
          description="Spot disengaging members before they cancel."
        />
        <QuickActionCard
          href={`/clubs/${clubId}/intelligence/revenue`}
          icon={DollarSign}
          iconColor="text-blue-500"
          title="Revenue Intelligence"
          description="Occupancy patterns and pricing opportunities."
        />
      </div>

      {/* ── Underfilled Sessions Alert ── */}
      {underfilledSessions.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Sessions Below 50% Capacity
              <Badge variant="secondary" className="ml-1 text-xs font-mono">
                {underfilledSessions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {underfilledSessions.slice(0, 5).map((session: any) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{session.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {new Date(session.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      <span className="text-muted-foreground/40">|</span>
                      {session.startTime}–{session.endTime}
                      {session.courtName && (
                        <>
                          <span className="text-muted-foreground/40">|</span>
                          {session.courtName}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-orange-600 tabular-nums">
                        {session.confirmedCount}/{session.maxPlayers}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {session.spotsRemaining} open
                      </div>
                    </div>
                    <Link href={`/clubs/${clubId}/intelligence/slot-filler?session=${session.id}`}>
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                        <Zap className="h-3 w-3" /> Fill
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Upcoming Sessions ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Upcoming Sessions
            </CardTitle>
            <span className="text-xs text-muted-foreground tabular-nums">
              {upcomingSessions.length} scheduled
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {upcomingSessions.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No upcoming sessions scheduled.
            </div>
          ) : (
            <div className="divide-y">
              {upcomingSessions.slice(0, 10).map((session: any) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{session.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      {new Date(session.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      <span className="text-muted-foreground/40">|</span>
                      {session.startTime}–{session.endTime}
                      {session.courtName && (
                        <>
                          <span className="text-muted-foreground/40">|</span>
                          {session.courtName}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <div className="w-24">
                      <OccupancyBar value={session.occupancyPercent} />
                    </div>
                    <div className="text-right w-16">
                      <OccupancyBadge value={session.occupancyPercent} />
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                      {session.confirmedCount}/{session.maxPlayers}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
