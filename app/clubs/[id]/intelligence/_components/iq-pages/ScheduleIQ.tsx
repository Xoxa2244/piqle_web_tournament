'use client'
import React, { useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  CalendarDays, List, ChevronLeft, ChevronRight, Users,
  MapPin, Clock, X, Zap, ArrowRight, Trophy, Target,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"
import { useRouter } from "next/navigation"
import type { SessionCalendarItem } from "@/types/intelligence"

// ── Helpers ──

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}`
}

const HOUR_START = 6
const HOUR_END = 22
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fillColor(occupancy: number): string {
  if (occupancy >= 80) return '#10B981'
  if (occupancy >= 40) return '#F59E0B'
  return '#EF4444'
}

function fillBg(occupancy: number): string {
  if (occupancy >= 80) return 'rgba(16,185,129,0.12)'
  if (occupancy >= 40) return 'rgba(245,158,11,0.12)'
  return 'rgba(239,68,68,0.12)'
}

function formatIcon(format: string) {
  const f = format.toLowerCase()
  if (f.includes('league') || f.includes('tournament')) return <Trophy className="w-3 h-3 shrink-0" />
  if (f.includes('clinic') || f.includes('lesson')) return <Target className="w-3 h-3 shrink-0" />
  return <Zap className="w-3 h-3 shrink-0" />
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

// ── Props ──

interface ScheduleIQProps {
  calendarData: any
  dashboardData: any
  isLoading: boolean
  clubId: string
}

// ── Session Detail Panel ──

function SessionDetail({
  session,
  onClose,
  clubId,
  isDark,
}: {
  session: SessionCalendarItem
  onClose: () => void
  clubId: string
  isDark: boolean
}) {
  const router = useRouter()
  const occ = session.registered / (session.capacity || 1)
  const occPct = Math.round(occ * 100)

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.1)',
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{
          background: `linear-gradient(135deg, ${fillColor(session.occupancy)}20, transparent)`,
          borderBottom: '1px solid var(--card-border)',
        }}
      >
        <div className="flex items-center gap-2">
          {formatIcon(session.format)}
          <span className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
            {session.format}
          </span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg transition-colors hover:opacity-70" style={{ color: 'var(--t3)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Clock, label: 'Time', value: `${session.startTime} – ${session.endTime}` },
            { icon: MapPin, label: 'Court', value: session.court || 'N/A' },
            { icon: CalendarDays, label: 'Date', value: new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
            { icon: Target, label: 'Level', value: session.skillLevel || 'All Levels' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--t4)' }} />
              <div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)' }}>{label}</div>
                <div className="text-sm font-medium" style={{ color: 'var(--heading)' }}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Fill bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--t2)' }}>Fill Rate</span>
            <span className="text-xs font-semibold" style={{ color: fillColor(session.occupancy) }}>
              {session.registered}/{session.capacity} registered
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(occPct, 100)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: fillColor(session.occupancy) }}
            />
          </div>
        </div>

        {/* Player list */}
        {session.playerNames && session.playerNames.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--t3)' }}>
              <Users className="w-3 h-3 inline mr-1" />
              Registered Players ({session.playerNames.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {session.playerNames.slice(0, 12).map((name, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--subtle)', color: 'var(--t2)' }}
                >
                  {name}
                </span>
              ))}
              {session.playerNames.length > 12 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ color: 'var(--t4)' }}>
                  +{session.playerNames.length - 12} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Reasoning */}
        {session.peerAvgOccupancy != null && (
          <div
            className="rounded-xl p-3 text-xs"
            style={{ background: 'var(--subtle)', color: 'var(--t3)' }}
          >
            <Zap className="w-3 h-3 inline mr-1" style={{ color: '#8B5CF6' }} />
            This time slot fills {session.peerAvgOccupancy}% on average.
            {occPct < session.peerAvgOccupancy
              ? ` Today it's only at ${occPct}%.`
              : ` Today it's at ${occPct}% — above average.`}
          </div>
        )}

        {/* Fill CTA */}
        {occPct < 80 && session.status !== 'past' && (
          <button
            onClick={() => router.push(`/clubs/${clubId}/intelligence/slot-filler`)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
          >
            Fill this session <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {/* Recommendations */}
        {session.recommendations && session.recommendations.length > 0 && (
          <div className="space-y-1.5">
            {session.recommendations.map((rec, i) => (
              <div key={i} className="text-xs rounded-lg p-2" style={{ background: fillBg(40), color: 'var(--t2)' }}>
                <span className="font-semibold">{rec.label}:</span> {rec.reason}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Empty / Loading states ──

function ScheduleSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-xl" style={{ background: 'var(--subtle)' }} />
        <div className="h-8 w-32 rounded-xl" style={{ background: 'var(--subtle)' }} />
      </div>
      <div className="h-10 w-full rounded-xl" style={{ background: 'var(--subtle)' }} />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-6 rounded-lg" style={{ background: 'var(--subtle)' }} />
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="h-12 rounded-lg" style={{ background: 'var(--subtle)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── List View for mobile/alternative ──

function ListViewSessions({
  sessions,
  onSelect,
  isDark,
}: {
  sessions: SessionCalendarItem[]
  onSelect: (s: SessionCalendarItem) => void
  isDark: boolean
}) {
  const grouped = useMemo(() => {
    const g: Record<string, SessionCalendarItem[]> = {}
    for (const s of sessions) {
      if (!g[s.date]) g[s.date] = []
      g[s.date].push(s)
    }
    return Object.entries(g)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
        items: items.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }))
  }, [sessions])

  if (grouped.length === 0) {
    return (
      <div className="text-center py-16">
        <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--t4)' }} />
        <p className="text-sm" style={{ color: 'var(--t3)' }}>No sessions this week</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ date, label, items }) => (
        <div key={date}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--t4)' }}>
            {label}
          </div>
          <div className="space-y-2">
            {items.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="w-full text-left rounded-xl p-3 transition-all hover:brightness-110"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-1 h-10 rounded-full" style={{ background: fillColor(s.occupancy) }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {formatIcon(s.format)}
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--heading)' }}>{s.format}</span>
                      <span className="text-xs" style={{ color: 'var(--t4)' }}>{s.court}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: 'var(--t3)' }}>{s.startTime} – {s.endTime}</span>
                      <span className="text-xs font-medium" style={{ color: fillColor(s.occupancy) }}>
                        {s.registered}/{s.capacity}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ──

export function ScheduleIQ({ calendarData, dashboardData, isLoading, clubId }: ScheduleIQProps) {
  const { isDark } = useTheme()
  const [weekOffset, setWeekOffset] = useState(0)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [courtFilter, setCourtFilter] = useState<string>('all')
  const [selectedSession, setSelectedSession] = useState<SessionCalendarItem | null>(null)

  // Current week start
  const currentWeekStart = useMemo(() => {
    const base = getWeekStart(new Date())
    return addDays(base, weekOffset * 7)
  }, [weekOffset])

  const weekEnd = useMemo(() => addDays(currentWeekStart, 6), [currentWeekStart])
  const todayStr = toDateStr(new Date())
  const thisWeekStart = useMemo(() => getWeekStart(new Date()), [])

  // All sessions
  const allSessions: SessionCalendarItem[] = calendarData?.sessions ?? []

  // Unique courts
  const courts = useMemo(() => {
    const set = new Set<string>()
    allSessions.forEach((s) => { if (s.court) set.add(s.court) })
    return Array.from(set).sort()
  }, [allSessions])

  // Filtered sessions for current week
  const weekSessions = useMemo(() => {
    const startStr = toDateStr(currentWeekStart)
    const endStr = toDateStr(weekEnd)
    return allSessions.filter((s) => {
      if (s.date < startStr || s.date > endStr) return false
      if (courtFilter !== 'all' && s.court !== courtFilter) return false
      return true
    })
  }, [allSessions, currentWeekStart, weekEnd, courtFilter])

  // Map sessions to grid positions
  const sessionsByDayHour = useMemo(() => {
    const map: Record<string, SessionCalendarItem[]> = {}
    weekSessions.forEach((s) => {
      const d = new Date(s.date + 'T12:00:00')
      const dayIdx = (d.getDay() + 6) % 7 // Mon=0, Sun=6
      const hour = parseInt(s.startTime.split(':')[0], 10)
      const key = `${dayIdx}-${hour}`
      if (!map[key]) map[key] = []
      map[key].push(s)
    })
    return map
  }, [weekSessions])

  // Day dates for header
  const dayDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = addDays(currentWeekStart, i)
      return {
        dateStr: toDateStr(d),
        dayNum: d.getDate(),
        monthShort: d.toLocaleDateString('en-US', { month: 'short' }),
      }
    }),
    [currentWeekStart]
  )

  // Week stats
  const weekStats = useMemo(() => {
    const total = weekSessions.length
    const avgOcc = total > 0 ? Math.round(weekSessions.reduce((s, x) => s + x.occupancy, 0) / total) : 0
    const totalReg = weekSessions.reduce((s, x) => s + x.registered, 0)
    const totalCap = weekSessions.reduce((s, x) => s + x.capacity, 0)
    return { total, avgOcc, totalReg, totalCap }
  }, [weekSessions])

  const handlePrevWeek = useCallback(() => setWeekOffset((w) => w - 1), [])
  const handleNextWeek = useCallback(() => {
    if (weekOffset < 0) setWeekOffset((w) => w + 1)
  }, [weekOffset])
  const handleThisWeek = useCallback(() => setWeekOffset(0), [])

  if (isLoading) {
    return <ScheduleSkeleton isDark={isDark} />
  }

  if (!calendarData || allSessions.length === 0) {
    return (
      <div className="text-center py-20">
        <CalendarDays className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--t4)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--heading)' }}>No Schedule Data</h3>
        <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--t3)' }}>
          Upload your session data via CSV on the Dashboard to see your weekly schedule.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--heading)' }}>Schedule</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>
            {weekStats.total} sessions &middot; {weekStats.avgOcc}% avg fill &middot; {weekStats.totalReg}/{weekStats.totalCap} players
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Week navigator */}
          <div className="flex items-center gap-1 rounded-xl px-1 py-1" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
            <button onClick={handlePrevWeek} className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: 'var(--t3)' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={handleThisWeek} className="px-3 py-1 text-xs font-medium rounded-lg transition-colors" style={{ color: weekOffset === 0 ? '#8B5CF6' : 'var(--t3)', background: weekOffset === 0 ? 'var(--pill-active)' : 'transparent' }}>
              This Week
            </button>
            <button onClick={handleNextWeek} className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: 'var(--t3)', opacity: weekOffset >= 0 ? 0.3 : 1, pointerEvents: weekOffset >= 0 ? 'none' : 'auto' }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-xl px-1 py-1" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
            {([
              { mode: 'calendar' as const, icon: CalendarDays, label: 'Calendar' },
              { mode: 'list' as const, icon: List, label: 'List' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  color: viewMode === mode ? '#8B5CF6' : 'var(--t3)',
                  background: viewMode === mode ? 'var(--pill-active)' : 'transparent',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Week range label */}
      <div className="text-sm font-medium" style={{ color: 'var(--t2)' }}>
        {formatWeekRange(currentWeekStart)}
      </div>

      {/* ── Court filter pills ── */}
      {courts.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {[{ key: 'all', label: 'All Courts' }, ...courts.map((c) => ({ key: c, label: c }))].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCourtFilter(key)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: courtFilter === key ? 'var(--pill-active)' : 'var(--subtle)',
                color: courtFilter === key ? '#8B5CF6' : 'var(--t3)',
                border: `1px solid ${courtFilter === key ? 'rgba(139,92,246,0.3)' : 'var(--card-border)'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content area: Calendar or List + Detail Panel ── */}
      <div className="flex gap-4">
        {/* Main view */}
        <div className="flex-1 min-w-0">
          {viewMode === 'list' ? (
            <ListViewSessions sessions={weekSessions} onSelect={setSelectedSession} isDark={isDark} />
          ) : (
            /* ── Calendar Grid ── */
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              {/* Scrollable grid container */}
              <div className="overflow-x-auto">
                <div style={{ minWidth: 800 }}>
                  {/* Day header row */}
                  <div className="grid grid-cols-[60px_repeat(7,1fr)] sticky top-0 z-10" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--card-border)' }}>
                    <div className="p-2" />
                    {dayDates.map((d, i) => {
                      const isToday = d.dateStr === todayStr
                      return (
                        <div
                          key={i}
                          className="p-2 text-center"
                          style={{
                            borderLeft: '1px solid var(--card-border)',
                            background: isToday ? 'rgba(139,92,246,0.06)' : 'transparent',
                          }}
                        >
                          <div className="text-[10px] uppercase tracking-wider" style={{ color: isToday ? '#8B5CF6' : 'var(--t4)' }}>
                            {DAY_LABELS[i]}
                          </div>
                          <div className="text-sm font-semibold" style={{ color: isToday ? '#8B5CF6' : 'var(--heading)' }}>
                            {d.monthShort} {d.dayNum}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Hour rows */}
                  {HOURS.map((hour) => (
                    <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)]" style={{ minHeight: 56 }}>
                      {/* Time label */}
                      <div className="p-1.5 text-right pr-2 flex items-start justify-end" style={{ borderTop: '1px solid var(--card-border)' }}>
                        <span className="text-[10px] font-medium" style={{ color: 'var(--t4)' }}>
                          {formatHour(hour)}
                        </span>
                      </div>

                      {/* Day cells */}
                      {Array.from({ length: 7 }, (_, dayIdx) => {
                        const key = `${dayIdx}-${hour}`
                        const cellSessions = sessionsByDayHour[key] ?? []
                        const isToday = dayDates[dayIdx]?.dateStr === todayStr

                        return (
                          <div
                            key={dayIdx}
                            className="relative p-0.5"
                            style={{
                              borderTop: '1px solid var(--card-border)',
                              borderLeft: '1px solid var(--card-border)',
                              background: isToday ? 'rgba(139,92,246,0.03)' : 'transparent',
                            }}
                          >
                            {cellSessions.length === 0 ? (
                              <div className="w-full h-full min-h-[48px] rounded-lg border border-dashed" style={{ borderColor: 'var(--card-border)', opacity: 0.3 }} />
                            ) : (
                              <div className="space-y-0.5">
                                {cellSessions.map((s) => (
                                  <button
                                    key={s.id}
                                    onClick={() => setSelectedSession(s)}
                                    className="w-full text-left rounded-lg p-1.5 transition-all hover:brightness-110 cursor-pointer"
                                    style={{
                                      background: fillBg(s.occupancy),
                                      borderLeft: `3px solid ${fillColor(s.occupancy)}`,
                                    }}
                                  >
                                    <div className="flex items-center gap-1">
                                      {formatIcon(s.format)}
                                      <span className="text-[10px] font-medium truncate" style={{ color: 'var(--heading)' }}>
                                        {s.format}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className="text-[10px] font-semibold" style={{ color: fillColor(s.occupancy) }}>
                                        {s.registered}/{s.capacity}
                                      </span>
                                      {s.court && (
                                        <span className="text-[9px] truncate" style={{ color: 'var(--t4)' }}>
                                          {s.court}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Detail Panel (right side) ── */}
        <AnimatePresence>
          {selectedSession && (
            <div className="w-[340px] shrink-0 hidden lg:block">
              <SessionDetail
                session={selectedSession}
                onClose={() => setSelectedSession(null)}
                clubId={clubId}
                isDark={isDark}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile Detail Modal ── */}
      <AnimatePresence>
        {selectedSession && (
          <div className="lg:hidden fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSession(null)}
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.6)' }}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl"
            >
              <SessionDetail
                session={selectedSession}
                onClose={() => setSelectedSession(null)}
                clubId={clubId}
                isDark={isDark}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
