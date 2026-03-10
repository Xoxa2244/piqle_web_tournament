'use client'

import { useParams } from 'next/navigation'
import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3,
  Clock, Calendar, AlertTriangle, Lightbulb, ArrowUp, ArrowDown
} from 'lucide-react'
import { MetricCard } from '../_components/metric-card'
import { HorizontalBarChart, VerticalBarChart } from '../_components/charts'
import { DashboardSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useDashboard, useListSessions } from '../_hooks/use-intelligence'

export default function RevenueIntelligencePage() {
  const params = useParams()
  const clubId = params.id as string

  const { data: dashboard, isLoading: loadingDash } = useDashboard(clubId)

  const { data: sessions, isLoading: loadingSessions } = useListSessions(clubId)

  const isLoading = loadingDash || loadingSessions

  // ── Compute analytics from session data ──
  const analytics = useMemo(() => {
    if (!sessions) return null

    const allSessions = sessions as any[]

    // Time-of-day
    const timeSlots: Record<string, { label: string; sessions: number; booked: number; capacity: number }> = {
      morning: { label: 'Morning (6–12)', sessions: 0, booked: 0, capacity: 0 },
      afternoon: { label: 'Afternoon (12–17)', sessions: 0, booked: 0, capacity: 0 },
      evening: { label: 'Evening (17–21)', sessions: 0, booked: 0, capacity: 0 },
    }

    // Day-of-week
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const days: Record<string, { sessions: number; booked: number; capacity: number }> = {}
    dayNames.forEach((d) => (days[d] = { sessions: 0, booked: 0, capacity: 0 }))

    // Format
    const formats: Record<string, { sessions: number; booked: number; capacity: number }> = {}

    allSessions.forEach((s) => {
      const hour = parseInt(s.startTime?.split(':')[0] || '12', 10)
      const slotKey = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
      const booked = s._count?.bookings || 0
      const cap = s.maxPlayers || 8

      // Time slot
      timeSlots[slotKey].sessions++
      timeSlots[slotKey].booked += booked
      timeSlots[slotKey].capacity += cap

      // Day
      const day = dayNames[new Date(s.date).getDay()]
      days[day].sessions++
      days[day].booked += booked
      days[day].capacity += cap

      // Format
      const fmt = (s.format || 'UNKNOWN').replace(/_/g, ' ')
      if (!formats[fmt]) formats[fmt] = { sessions: 0, booked: 0, capacity: 0 }
      formats[fmt].sessions++
      formats[fmt].booked += booked
      formats[fmt].capacity += cap
    })

    return { timeSlots, days, dayNames, formats, totalSessions: allSessions.length }
  }, [sessions])

  if (isLoading) return <DashboardSkeleton />

  if (!dashboard || !analytics) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No Session Data"
        description="Revenue analytics need session and booking data. Import your schedule to get started."
      />
    )
  }

  const { metrics } = dashboard
  const recoveryPotential = Math.round(metrics.estimatedLostRevenue * 0.6)

  return (
    <div className="space-y-6">
      {/* ── Top Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={TrendingDown}
          label="Lost Revenue"
          value={`$${metrics.estimatedLostRevenue.toLocaleString()}`}
          subtitle={`${metrics.emptySlots} empty slots`}
          variant="danger"
        />
        <MetricCard
          icon={BarChart3}
          label="Avg Occupancy"
          value={`${metrics.avgOccupancy}%`}
          subtitle={`${analytics.totalSessions} total sessions`}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Underfilled"
          value={metrics.underfilledCount}
          subtitle="sessions below 50%"
          variant={metrics.underfilledCount > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          icon={TrendingUp}
          label="Recovery Potential"
          value={`$${recoveryPotential.toLocaleString()}`}
          subtitle="with AI slot filling"
          variant="success"
        />
      </div>

      {/* ── Analysis Tabs ── */}
      <Tabs defaultValue="time" className="space-y-4">
        <TabsList>
          <TabsTrigger value="time" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Time of Day
          </TabsTrigger>
          <TabsTrigger value="day" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Day of Week
          </TabsTrigger>
          <TabsTrigger value="format" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Format
          </TabsTrigger>
        </TabsList>

        {/* ── Time of Day ── */}
        <TabsContent value="time">
          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20">
                  <Clock className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-sm">Occupancy by Time of Day</CardTitle>
                  <CardDescription>
                    Identify peak and off-peak periods to optimize pricing
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <HorizontalBarChart
                items={Object.values(analytics.timeSlots).map((slot) => {
                  const occ = slot.capacity > 0 ? Math.round((slot.booked / slot.capacity) * 100) : 0
                  return {
                    label: slot.label,
                    value: occ,
                    sublabel: `${slot.sessions} sessions`,
                  }
                })}
                maxValue={100}
              />

              {/* Pricing recommendations */}
              <PricingRecommendations timeSlots={analytics.timeSlots} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Day of Week ── */}
        <TabsContent value="day">
          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-sm">Occupancy by Day of Week</CardTitle>
                  <CardDescription>
                    Understand weekly demand patterns to balance your schedule
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <VerticalBarChart
                items={analytics.dayNames.map((day) => {
                  const d = analytics.days[day]
                  const occ = d.capacity > 0 ? Math.round((d.booked / d.capacity) * 100) : 0
                  return {
                    label: day,
                    value: occ,
                    sublabel: `${d.sessions} sess`,
                  }
                })}
                maxValue={100}
                height={140}
              />

              {/* Best / worst day insight */}
              <DayInsight days={analytics.days} dayNames={analytics.dayNames} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Format ── */}
        <TabsContent value="format">
          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-md shadow-emerald-500/20">
                  <BarChart3 className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-sm">Occupancy by Session Format</CardTitle>
                  <CardDescription>
                    See which formats drive the most engagement
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart
                items={Object.entries(analytics.formats)
                  .sort(([, a], [, b]) => {
                    const occA = a.capacity > 0 ? a.booked / a.capacity : 0
                    const occB = b.capacity > 0 ? b.booked / b.capacity : 0
                    return occB - occA
                  })
                  .map(([format, data]) => {
                    const occ = data.capacity > 0 ? Math.round((data.booked / data.capacity) * 100) : 0
                    return {
                      label: format,
                      value: occ,
                      sublabel: `${data.sessions} sessions`,
                    }
                  })}
                maxValue={100}
              />

              <FormatInsight formats={analytics.formats} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Pricing recommendations component ──
function PricingRecommendations({
  timeSlots,
}: {
  timeSlots: Record<string, { label: string; sessions: number; booked: number; capacity: number }>
}) {
  const recs = Object.entries(timeSlots)
    .map(([key, slot]) => {
      const occ = slot.capacity > 0 ? Math.round((slot.booked / slot.capacity) * 100) : 0
      if (slot.sessions === 0) return null
      if (occ < 40) return { key, label: slot.label, occ, type: 'discount' as const }
      if (occ > 85) return { key, label: slot.label, occ, type: 'increase' as const }
      return null
    })
    .filter(Boolean) as { key: string; label: string; occ: number; type: 'discount' | 'increase' }[]

  if (recs.length === 0) return null

  return (
    <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-100 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
        <Lightbulb className="h-4 w-4" />
        Pricing Recommendations
      </div>
      {recs.map((rec) => (
        <div key={rec.key} className="flex items-start gap-2 text-sm text-blue-700">
          {rec.type === 'discount' ? (
            <ArrowDown className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          ) : (
            <ArrowUp className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
          )}
          <span>
            <strong>{rec.label}</strong>:{' '}
            {rec.type === 'discount'
              ? `Consider a 20–30% discount to boost bookings (currently ${rec.occ}% occupancy)`
              : `Room for a 10–15% price increase — demand is strong (${rec.occ}% occupancy)`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Day insight component ──
function DayInsight({
  days,
  dayNames,
}: {
  days: Record<string, { sessions: number; booked: number; capacity: number }>
  dayNames: string[]
}) {
  const withOcc = dayNames
    .filter((d) => days[d].sessions > 0)
    .map((d) => ({
      name: d,
      occ: days[d].capacity > 0 ? Math.round((days[d].booked / days[d].capacity) * 100) : 0,
    }))
    .sort((a, b) => b.occ - a.occ)

  if (withOcc.length < 2) return null

  const best = withOcc[0]
  const worst = withOcc[withOcc.length - 1]

  if (best.occ === worst.occ) return null

  return (
    <div className="mt-4 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
      <strong className="text-foreground">{best.name}</strong> is your strongest day ({best.occ}% occupancy) while{' '}
      <strong className="text-foreground">{worst.name}</strong> needs attention ({worst.occ}%).
      Consider adding popular formats or promotions on {worst.name}.
    </div>
  )
}

// ── Format insight component ──
function FormatInsight({
  formats,
}: {
  formats: Record<string, { sessions: number; booked: number; capacity: number }>
}) {
  const sorted = Object.entries(formats)
    .filter(([, d]) => d.sessions > 0)
    .map(([name, d]) => ({
      name,
      occ: d.capacity > 0 ? Math.round((d.booked / d.capacity) * 100) : 0,
      sessions: d.sessions,
    }))
    .sort((a, b) => b.occ - a.occ)

  if (sorted.length < 2) return null

  const best = sorted[0]

  return (
    <div className="mt-4 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
      <strong className="text-foreground">{best.name}</strong> is your most popular format at{' '}
      {best.occ}% occupancy across {best.sessions} sessions. Consider scheduling more of these during off-peak hours.
    </div>
  )
}
