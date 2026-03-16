'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3,
  Clock, Calendar, AlertTriangle, Lightbulb, ArrowUp, ArrowDown
} from 'lucide-react'
import { MetricCard } from '../_components/metric-card'
import { HorizontalBarChart, VerticalBarChart } from '../_components/charts'
import { DashboardSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useDashboardV2 } from '../_hooks/use-intelligence'
import { useSetPageContext } from '../_hooks/usePageContext'

const timeSlotLabels: Record<string, string> = {
  morning: 'Morning (6–12)',
  afternoon: 'Afternoon (12–17)',
  evening: 'Evening (17–21)',
}

const formatLabels: Record<string, string> = {
  OPEN_PLAY: 'Open Play',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  LEAGUE_PLAY: 'League',
  SOCIAL: 'Social',
}

export default function RevenueIntelligencePage() {
  const params = useParams()
  const clubId = params.id as string

  const { data: dashboard, isLoading } = useDashboardV2(clubId)

  const setPageContext = useSetPageContext()
  useEffect(() => {
    if (!dashboard) return
    const { metrics, occupancy } = dashboard
    const parts = [
      'Page: Revenue Intelligence',
      `Lost Revenue: ${metrics.lostRevenue.value} (${metrics.lostRevenue.subtitle})`,
      `Occupancy: ${metrics.occupancy.value} (${metrics.occupancy.subtitle})`,
      `Bookings: ${metrics.bookings.value} (${metrics.bookings.subtitle})`,
      `Occupancy by time: ${occupancy.byTimeSlot.map((s: any) => s.slot + ' ' + s.avgOccupancy + '% (' + s.sessionCount + ' sessions)').join(', ')}`,
      `Occupancy by day: ${occupancy.byDay.map((d: any) => d.day + ' ' + d.avgOccupancy + '%').join(', ')}`,
      `Occupancy by format: ${occupancy.byFormat.map((f: any) => f.format + ' ' + f.avgOccupancy + '% (' + f.sessionCount + ' sessions)').join(', ')}`,
    ]
    setPageContext(parts.join('\n'))
  }, [dashboard, setPageContext])


  if (isLoading) return <DashboardSkeleton />

  if (!dashboard) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No Session Data"
        description="Revenue analytics need session and booking data. Import your schedule to get started."
      />
    )
  }

  const { metrics, occupancy } = dashboard
  const lostRevenueRaw = typeof metrics.lostRevenue.trend.value === 'number'
    ? metrics.lostRevenue.trend.value
    : 0
  const recoveryPotential = Math.round(lostRevenueRaw * 0.6)

  return (
    <div className="space-y-6">
      {/* ── Top Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={TrendingDown}
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
          label={metrics.bookings.label}
          value={metrics.bookings.value}
          subtitle={metrics.bookings.subtitle}
          trendValue={metrics.bookings.trend.changePercent}
          trendDirection={metrics.bookings.trend.direction}
          sparkline={metrics.bookings.trend.sparkline}
          tooltip={metrics.bookings.description}
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
                items={occupancy.byTimeSlot.map(slot => ({
                  label: timeSlotLabels[slot.slot] || slot.slot,
                  value: slot.avgOccupancy,
                  sublabel: `${slot.sessionCount} sessions`,
                }))}
                maxValue={100}
              />
              <PricingRecommendations timeSlots={occupancy.byTimeSlot} />
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
                items={occupancy.byDay.map(d => ({
                  label: d.day,
                  value: d.avgOccupancy,
                  sublabel: `${d.sessionCount} sess`,
                }))}
                maxValue={100}
                height={140}
              />
              <DayInsight days={occupancy.byDay} />
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
                items={[...occupancy.byFormat]
                  .sort((a, b) => b.avgOccupancy - a.avgOccupancy)
                  .map(f => ({
                    label: formatLabels[f.format] || f.format.replace(/_/g, ' '),
                    value: f.avgOccupancy,
                    sublabel: `${f.sessionCount} sessions`,
                  }))}
                maxValue={100}
              />
              <FormatInsight formats={occupancy.byFormat as Array<{ format: string; avgOccupancy: number; sessionCount: number }>} />
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
  timeSlots: Array<{ slot: string; avgOccupancy: number; sessionCount: number }>
}) {
  const recs = timeSlots
    .filter(slot => slot.sessionCount > 0)
    .map(slot => {
      const label = timeSlotLabels[slot.slot] || slot.slot
      if (slot.avgOccupancy < 40) return { key: slot.slot, label, occ: slot.avgOccupancy, type: 'discount' as const }
      if (slot.avgOccupancy > 85) return { key: slot.slot, label, occ: slot.avgOccupancy, type: 'increase' as const }
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
}: {
  days: Array<{ day: string; avgOccupancy: number; sessionCount: number }>
}) {
  const withOcc = days
    .filter(d => d.sessionCount > 0)
    .sort((a, b) => b.avgOccupancy - a.avgOccupancy)

  if (withOcc.length < 2) return null

  const best = withOcc[0]
  const worst = withOcc[withOcc.length - 1]

  if (best.avgOccupancy === worst.avgOccupancy) return null

  return (
    <div className="mt-4 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
      <strong className="text-foreground">{best.day}</strong> is your strongest day ({best.avgOccupancy}% occupancy) while{' '}
      <strong className="text-foreground">{worst.day}</strong> needs attention ({worst.avgOccupancy}%).
      Consider adding popular formats or promotions on {worst.day}.
    </div>
  )
}

// ── Format insight component ──
function FormatInsight({
  formats,
}: {
  formats: Array<{ format: string; avgOccupancy: number; sessionCount: number }>
}) {
  const sorted = [...formats]
    .filter(f => f.sessionCount > 0)
    .sort((a, b) => b.avgOccupancy - a.avgOccupancy)

  if (sorted.length < 2) return null

  const best = sorted[0]
  const label = formatLabels[best.format] || best.format.replace(/_/g, ' ')

  return (
    <div className="mt-4 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
      <strong className="text-foreground">{label}</strong> is your most popular format at{' '}
      {best.avgOccupancy}% occupancy across {best.sessionCount} sessions. Consider scheduling more of these during off-peak hours.
    </div>
  )
}
