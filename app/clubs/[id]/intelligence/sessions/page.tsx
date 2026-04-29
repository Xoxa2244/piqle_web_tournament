'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, List, Grid3X3, ChevronLeft, ChevronRight,
  Users, DollarSign, TrendingDown, AlertTriangle,
  Lightbulb, Send, ArrowUpRight,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DashboardSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useSessionsCalendar, useDashboardV2, useAdvisorDrafts } from '../_hooks/use-intelligence'
import type { SessionCalendarItem, SessionRecommendation } from '@/types/intelligence'
import { useSetPageContext } from '../_hooks/usePageContext'
import { useBrand } from '@/components/BrandProvider'
import { SessionsIQ } from '../_components/iq-pages/SessionsIQ'
import { ScheduleIQ } from '../_components/iq-pages/ScheduleIQ'

type ViewMode = 'list' | 'week' | 'month'

// ── Helpers ──

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}`
}

function occupancyColor(occ: number): string {
  if (occ >= 75) return 'border-l-green-500'
  if (occ >= 50) return 'border-l-yellow-500'
  return 'border-l-red-500'
}

function occupancyBg(occ: number): string {
  if (occ >= 75) return 'bg-green-500'
  if (occ >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function statusBadge(status: 'past' | 'today' | 'upcoming') {
  if (status === 'today') return <Badge variant="default" className="bg-blue-500 text-[10px]">Today</Badge>
  if (status === 'upcoming') return <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-[10px]">Upcoming</Badge>
  return null
}

function recIcon(type: SessionRecommendation['type']) {
  switch (type) {
    case 'send_invites': return <Send className="h-3 w-3" />
    case 'swap_format': return <ArrowUpRight className="h-3 w-3" />
    case 'cancel_consider': return <AlertTriangle className="h-3 w-3" />
    default: return <Lightbulb className="h-3 w-3" />
  }
}

function recColor(priority: 'high' | 'medium' | 'low') {
  if (priority === 'high') return 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
  if (priority === 'medium') return 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100'
  return 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
}

// ── Session Card ──

function SessionCard({ session, clubId, compact }: { session: SessionCalendarItem; clubId: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`border-l-4 ${occupancyColor(session.occupancy)} bg-card rounded-lg border border-border p-3 cursor-pointer transition-all hover:shadow-sm`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{session.format}</span>
            <span className="text-xs text-muted-foreground">{session.startTime}–{session.endTime}</span>
            {session.court && <span className="text-xs text-muted-foreground">({session.court})</span>}
            {statusBadge(session.status)}
          </div>

          {/* Occupancy bar */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
              <div className={`h-full rounded-full ${occupancyBg(session.occupancy)}`} style={{ width: `${session.occupancy}%` }} />
            </div>
            <span className="text-xs font-medium">{session.registered}/{session.capacity}</span>
            <span className="text-xs text-muted-foreground">({session.occupancy}%)</span>
          </div>
        </div>

        {/* Revenue (past only) */}
        {session.status === 'past' && session.revenue != null && (
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-medium text-green-700">${session.revenue}</div>
            {session.lostRevenue != null && session.lostRevenue > 0 && (
              <div className="text-xs text-red-500">-${session.lostRevenue} lost</div>
            )}
          </div>
        )}
      </div>

      {/* Peer comparison */}
      {session.deviationFromPeer != null && (
        <div className={`text-xs mt-1 ${session.deviationFromPeer >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {session.deviationFromPeer >= 0 ? '+' : ''}{session.deviationFromPeer}% vs avg for this slot
        </div>
      )}

      {/* Recommendations chips */}
      {session.recommendations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {session.recommendations.map((rec, i) => (
            rec.actionLink ? (
              <Link
                key={i}
                href={rec.actionLink.replace('/clubs/demo/', `/clubs/${clubId}/`) + (typeof window !== 'undefined' && window.location.search.includes('demo') ? '?demo=true' : '')}
                onClick={(e) => e.stopPropagation()}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${recColor(rec.priority)} transition-colors`}
                title={rec.reason}
              >
                {recIcon(rec.type)}
                {rec.label}
              </Link>
            ) : (
              <span
                key={i}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${recColor(rec.priority)}`}
                title={rec.reason}
              >
                {recIcon(rec.type)}
                {rec.label}
              </span>
            )
          ))}
        </div>
      )}

      {/* Expanded details */}
      {expanded && !compact && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Skill Level:</span> {session.skillLevel}</div>
            {session.pricePerPlayer != null && <div><span className="text-muted-foreground">Price:</span> ${session.pricePerPlayer}/player</div>}
            {session.peerAvgOccupancy != null && <div><span className="text-muted-foreground">Peer Avg:</span> {session.peerAvgOccupancy}% occupancy</div>}
          </div>
          {session.recommendations.length > 0 && (
            <div className="space-y-1.5">
              {session.recommendations.map((rec, i) => (
                <div key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{rec.label}:</span> {rec.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Summary Bar ──

function SummaryBar({ sessions }: { sessions: SessionCalendarItem[] }) {
  const stats = useMemo(() => {
    const past = sessions.filter(s => s.status === 'past')
    return {
      total: sessions.length,
      avgOcc: sessions.length > 0 ? Math.round(sessions.reduce((s, x) => s + x.occupancy, 0) / sessions.length) : 0,
      revenue: past.reduce((s, x) => s + (x.revenue ?? 0), 0),
      lost: past.reduce((s, x) => s + (x.lostRevenue ?? 0), 0),
      upcoming: sessions.filter(s => s.status !== 'past').length,
      past: past.length,
    }
  }, [sessions])

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {[
        { label: 'Sessions', value: stats.total, icon: Calendar },
        { label: 'Avg Occupancy', value: `${stats.avgOcc}%`, icon: Users },
        { label: 'Revenue', value: `$${stats.revenue.toLocaleString()}`, icon: DollarSign },
        { label: 'Lost Revenue', value: `$${stats.lost.toLocaleString()}`, icon: TrendingDown, danger: stats.lost > 0 },
        { label: 'Upcoming', value: stats.upcoming, icon: Calendar },
        { label: 'Past', value: stats.past, icon: Calendar },
      ].map(({ label, value, icon: Icon, danger }) => (
        <Card key={label} className="p-3">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${danger ? 'text-red-500' : 'text-muted-foreground'}`} />
            <div>
              <div className={`text-lg font-semibold ${danger ? 'text-red-600' : ''}`}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── List View (paginated by month) ──

function ListView({ sessions, clubId, navDate, onNav }: { sessions: SessionCalendarItem[]; clubId: string; navDate: Date; onNav: (d: Date) => void }) {
  const monthStart = getMonthStart(navDate)
  const monthEnd = getMonthEnd(navDate)
  const startStr = toDateStr(monthStart)
  const endStr = toDateStr(monthEnd)

  const monthSessions = useMemo(
    () => sessions.filter(s => s.date >= startStr && s.date <= endStr),
    [sessions, startStr, endStr]
  )

  const grouped = useMemo(() => {
    const groups: Record<string, SessionCalendarItem[]> = {}
    for (const s of monthSessions) {
      if (!groups[s.date]) groups[s.date] = []
      groups[s.date].push(s)
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [monthSessions])

  return (
    <div>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => onNav(addMonths(navDate, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{formatMonthYear(monthStart)}</span>
        <Button variant="ghost" size="sm" onClick={() => onNav(addMonths(navDate, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary for visible month */}
      <SummaryBar sessions={monthSessions} />

      {/* Sessions grouped by date */}
      {grouped.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">No sessions in {formatMonthYear(monthStart)}</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{formatDateShort(date)}</h3>
              <div className="space-y-2">
                {items.map(s => <SessionCard key={s.id} session={s} clubId={clubId} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Week View ──

function WeekView({ sessions, weekStart, clubId }: { sessions: SessionCalendarItem[]; weekStart: Date; clubId: string }) {
  const days = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(weekStart, i)))
  const weekSessions = useMemo(
    () => sessions.filter(s => s.date >= days[0] && s.date <= days[6]),
    [sessions, days[0], days[6]]
  )

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const todayStr = toDateStr(new Date())

  return (
    <div>
      <SummaryBar sessions={weekSessions} />
      <div className="grid grid-cols-7 gap-2">
        {days.map((dateStr, i) => {
          const daySessions = weekSessions.filter(s => s.date === dateStr)
          const isToday = dateStr === todayStr

          return (
            <div key={dateStr} className={`min-h-[200px] rounded-lg border p-2 ${isToday ? 'border-blue-400 bg-blue-50/30' : 'border-border'}`}>
              <div className={`text-xs font-medium mb-2 ${isToday ? 'text-blue-600' : 'text-muted-foreground'}`}>
                {dayLabels[i]} {new Date(dateStr + 'T12:00:00').getDate()}
              </div>
              <div className="space-y-1.5">
                {daySessions.map(s => (
                  <SessionCard key={s.id} session={s} clubId={clubId} compact />
                ))}
                {daySessions.length === 0 && (
                  <div className="text-xs text-muted-foreground/50 italic">No sessions</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Month View ──

function MonthView({ sessions, monthStart, clubId }: { sessions: SessionCalendarItem[]; monthStart: Date; clubId: string }) {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const totalDays = lastDay.getDate()

  const startStr = toDateStr(firstDay)
  const endStr = toDateStr(lastDay)
  const monthSessions = useMemo(
    () => sessions.filter(s => s.date >= startStr && s.date <= endStr),
    [sessions, startStr, endStr]
  )

  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const totalCells = Math.ceil((totalDays + startOffset) / 7) * 7
  const todayStr = toDateStr(new Date())
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div>
      <SummaryBar sessions={monthSessions} />
      <div className="grid grid-cols-7 gap-px mb-1">
        {dayLabels.map(d => (
          <div key={d} className="text-xs font-medium text-muted-foreground text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - startOffset + 1
          const isValidDay = dayNum >= 1 && dayNum <= totalDays
          const dateStr = isValidDay
            ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
            : ''
          const daySessions = isValidDay ? monthSessions.filter(s => s.date === dateStr) : []
          const isToday = dateStr === todayStr

          // Compute day-level aggregate for month view
          const dayOcc = daySessions.length > 0
            ? Math.round(daySessions.reduce((s, x) => s + x.occupancy, 0) / daySessions.length)
            : -1
          const hasLowSession = daySessions.some(s => s.occupancy < 40)

          return (
            <div
              key={i}
              className={`min-h-[100px] p-1.5 ${isValidDay ? 'bg-card' : 'bg-muted/30'} ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
            >
              {isValidDay && (
                <>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-muted-foreground'}`}>
                      {dayNum}
                    </span>
                    {daySessions.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{daySessions.length}s</span>
                    )}
                  </div>
                  {daySessions.length > 0 && (
                    <div className="mt-1 mb-1">
                      <div className={`text-[10px] font-medium ${dayOcc >= 75 ? 'text-green-600' : dayOcc >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {dayOcc}% avg
                      </div>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {daySessions.slice(0, 4).map(s => (
                      <div
                        key={s.id}
                        className={`text-[10px] px-1 py-0.5 rounded border-l-2 ${occupancyColor(s.occupancy)} bg-muted/50 truncate`}
                        title={`${s.format} ${s.startTime} — ${s.occupancy}% (${s.registered}/${s.capacity})`}
                      >
                        {s.startTime} {s.format}
                      </div>
                    ))}
                    {daySessions.length > 4 && (
                      <div className="text-[10px] text-muted-foreground pl-1">+{daySessions.length - 4} more</div>
                    )}
                  </div>
                  {hasLowSession && (
                    <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5" />
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ──

export default function SessionsCalendarPage() {
  const params = useParams()
  const clubId = params.id as string

  const queryResult = useSessionsCalendar(clubId)
  const calendarData = queryResult.data
  const isLoading = queryResult.isLoading
  const isFetching = 'isFetching' in queryResult ? (queryResult as any).isFetching : false

  const setPageContext = useSetPageContext()
  useEffect(() => {
    if (!calendarData) return
    const { sessions, summary } = calendarData
    const upcoming = sessions.filter((s: any) => s.status !== 'past')
    const lowOcc = sessions.filter((s: any) => s.occupancy < 50)
    const parts = [
      'Page: Sessions Calendar',
      `Total sessions: ${summary.totalSessions}`,
      `Avg occupancy: ${summary.avgOccupancy}%`,
      `Upcoming sessions: ${upcoming.length}`,
      `Low occupancy (<50%): ${lowOcc.length}`,
    ]
    if (lowOcc.length > 0) {
      parts.push(`Low sessions: ${lowOcc.slice(0, 5).map((s: any) => s.format + ' ' + s.date + ' ' + s.startTime + ' (' + s.occupancy + '%)').join(', ')}`)
    }
    const nextUp = upcoming.slice(0, 3)
    if (nextUp.length > 0) {
      parts.push(`Next sessions: ${nextUp.map((s: any) => s.format + ' ' + s.date + ' ' + s.startTime + ' ' + s.registered + '/' + s.capacity).join(', ')}`)
    }
    setPageContext(parts.join('\n'))
  }, [calendarData, setPageContext])


  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [navDate, setNavDate] = useState(new Date())

  const weekStart = getWeekStart(navDate)
  const monthStart = getMonthStart(navDate)

  const brand = useBrand()
  const { data: dashboardData } = useDashboardV2(clubId)
  const { data: advisorDrafts } = useAdvisorDrafts(clubId, 12)
  // ops-drafts + advisor-draft-promotion hooks used to feed the
  // "Agent Schedule Layer" card on Schedule; that card now lives under
  // /intelligence/programming, so we stopped querying them here.
  if (brand.key === 'iqsport') {
    return (
      <ScheduleIQ
        calendarData={calendarData}
        dashboardData={dashboardData}
        isLoading={isLoading}
        clubId={clubId}
        advisorDrafts={advisorDrafts || []}
      />
    )
  }

  if (isLoading || (!calendarData && isFetching)) return <DashboardSkeleton />

  if (!calendarData || calendarData.sessions.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No sessions found"
        description="Import your session data via CSV to see the sessions calendar with analysis and recommendations."
      />
    )
  }

  const { sessions } = calendarData

  return (
    <div>
      {/* Header + View Toggle */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Sessions</h2>
          <p className="text-sm text-muted-foreground">{calendarData.summary.totalSessions.toLocaleString()} sessions total</p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
          {([
            { mode: 'list' as const, icon: List, label: 'List' },
            { mode: 'week' as const, icon: Grid3X3, label: 'Week' },
            { mode: 'month' as const, icon: Calendar, label: 'Month' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation for week/month views */}
      {viewMode !== 'list' && (
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => setNavDate(viewMode === 'week' ? addDays(navDate, -7) : addMonths(navDate, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {viewMode === 'week' ? formatWeekRange(weekStart) : formatMonthYear(monthStart)}
            </span>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setNavDate(new Date())}>
              Today
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNavDate(viewMode === 'week' ? addDays(navDate, 7) : addMonths(navDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Views */}
      {viewMode === 'list' && <ListView sessions={sessions} clubId={clubId} navDate={navDate} onNav={setNavDate} />}
      {viewMode === 'week' && <WeekView sessions={sessions} weekStart={weekStart} clubId={clubId} />}
      {viewMode === 'month' && <MonthView sessions={sessions} monthStart={monthStart} clubId={clubId} />}
    </div>
  )
}
