'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, List, Grid3X3, ChevronLeft, ChevronRight,
  Users, DollarSign, TrendingDown, AlertTriangle,
  Lightbulb, Send, ArrowUpRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DashboardSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useSessionsCalendar } from '../_hooks/use-intelligence'
import type { SessionCalendarItem, SessionRecommendation } from '@/types/intelligence'

type ViewMode = 'list' | 'week' | 'month'

// ── Helpers ──

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)) // Monday start
  d.setHours(0, 0, 0, 0)
  return d
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
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

function SummaryBar({ summary }: { summary: { totalSessions: number; avgOccupancy: number; totalRevenue: number; totalLostRevenue: number; upcomingCount: number; pastCount: number } }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {[
        { label: 'Total Sessions', value: summary.totalSessions, icon: Calendar },
        { label: 'Avg Occupancy', value: `${summary.avgOccupancy}%`, icon: Users },
        { label: 'Revenue', value: `$${summary.totalRevenue.toLocaleString()}`, icon: DollarSign },
        { label: 'Lost Revenue', value: `$${summary.totalLostRevenue.toLocaleString()}`, icon: TrendingDown, danger: summary.totalLostRevenue > 0 },
        { label: 'Upcoming', value: summary.upcomingCount, icon: Calendar },
        { label: 'Past', value: summary.pastCount, icon: Calendar },
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

// ── List View ──

function ListView({ sessions, clubId }: { sessions: SessionCalendarItem[]; clubId: string }) {
  const grouped = useMemo(() => {
    const groups: Record<string, SessionCalendarItem[]> = {}
    for (const s of sessions) {
      if (!groups[s.date]) groups[s.date] = []
      groups[s.date].push(s)
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [sessions])

  return (
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
  )
}

// ── Week View ──

function WeekView({ sessions, weekStart, clubId }: { sessions: SessionCalendarItem[]; weekStart: Date; clubId: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i)
    return d.toISOString().slice(0, 10)
  })

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((dateStr, i) => {
        const daySessions = sessions.filter(s => s.date === dateStr)
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
  )
}

// ── Month View ──

function MonthView({ sessions, monthStart, clubId }: { sessions: SessionCalendarItem[]; monthStart: Date; clubId: string }) {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const totalDays = lastDay.getDate()

  // Monday-start offset: 0=Mon..6=Sun
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const totalCells = Math.ceil((totalDays + startOffset) / 7) * 7
  const todayStr = new Date().toISOString().slice(0, 10)
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div>
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
          const daySessions = isValidDay ? sessions.filter(s => s.date === dateStr) : []
          const isToday = dateStr === todayStr

          return (
            <div
              key={i}
              className={`min-h-[100px] p-1.5 ${isValidDay ? 'bg-card' : 'bg-muted/30'} ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
            >
              {isValidDay && (
                <>
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-muted-foreground'}`}>
                    {dayNum}
                  </div>
                  <div className="space-y-0.5">
                    {daySessions.map(s => (
                      <div
                        key={s.id}
                        className={`text-[10px] px-1 py-0.5 rounded border-l-2 ${occupancyColor(s.occupancy)} bg-muted/50 truncate`}
                        title={`${s.format} ${s.startTime} — ${s.occupancy}% (${s.registered}/${s.capacity})`}
                      >
                        {s.startTime} {s.format}
                      </div>
                    ))}
                  </div>
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

  const { data: calendarData, isLoading } = useSessionsCalendar(clubId)

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [navDate, setNavDate] = useState(new Date())

  const weekStart = getWeekStart(navDate)
  const monthStart = getMonthStart(navDate)

  if (isLoading) return <DashboardSkeleton />

  if (!calendarData || calendarData.sessions.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No sessions found"
        description="Import your session data via CSV to see the sessions calendar with analysis and recommendations."
      />
    )
  }

  const { sessions, summary } = calendarData

  return (
    <div>
      {/* Header + View Toggle */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Sessions Calendar</h2>
          <p className="text-sm text-muted-foreground">Per-session analysis with AI recommendations</p>
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

      {/* Summary */}
      <SummaryBar summary={summary} />

      {/* Navigation for week/month */}
      {viewMode !== 'list' && (
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => setNavDate(addDays(navDate, viewMode === 'week' ? -7 : -30))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {viewMode === 'week' ? formatWeekRange(weekStart) : formatMonthYear(monthStart)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setNavDate(addDays(navDate, viewMode === 'week' ? 7 : 30))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* View */}
      {viewMode === 'list' && <ListView sessions={sessions} clubId={clubId} />}
      {viewMode === 'week' && <WeekView sessions={sessions} weekStart={weekStart} clubId={clubId} />}
      {viewMode === 'month' && <MonthView sessions={sessions} monthStart={monthStart} clubId={clubId} />}
    </div>
  )
}
