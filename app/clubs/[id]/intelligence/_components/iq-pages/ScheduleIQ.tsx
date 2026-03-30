'use client'
import React, { useState, useMemo, useCallback } from "react"
import { motion } from "motion/react"
import {
  ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"
import type { SessionCalendarItem } from "@/types/intelligence"
import { SessionDetailIQ } from "./SessionDetailIQ"

// ── Constants ──

const HOUR_START = 6
const HOUR_END = 23
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function toDateStr(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }

// ── Skill-level color map ──

type SkillTier = 'advanced' | 'competitive' | 'intermediate' | 'casual' | 'beginner' | 'other'

const SKILL_COLORS: Record<SkillTier, { bg: string; border: string; text: string }> = {
  advanced:     { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)',  text: '#EF4444' },
  competitive:  { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.3)', text: '#8B5CF6' },
  intermediate: { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.3)',  text: '#3B82F6' },
  casual:       { bg: 'rgba(6,182,212,0.15)',   border: 'rgba(6,182,212,0.3)',   text: '#06B6D4' },
  beginner:     { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.3)',  text: '#10B981' },
  other:        { bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.2)', text: '#94A3B8' },
}

function classifySkill(format: string, skillLevel: string, title?: string): { tier: SkillTier; label: string; range: string } {
  const sl = (skillLevel || '').toUpperCase()
  const fmt = (format || '').toUpperCase()
  const t = (title || '').toUpperCase()

  const fmtPrefix = fmt.includes('LEAGUE') ? 'League'
    : fmt.includes('DRILL') ? 'Drill'
    : fmt.includes('CLINIC') ? 'Clinic'
    : fmt.includes('SOCIAL') ? 'Social'
    : fmt.includes('OPEN') ? 'Open Play'
    : ''

  const combined = sl + ' ' + t
  let tier: SkillTier = 'other', skillLabel = '', range = ''

  if (combined.includes('ADVANCED') || combined.includes('4.0'))   { tier = 'advanced'; skillLabel = 'Advanced'; range = '4.0+' }
  else if (combined.includes('COMPETITIVE') || combined.includes('3.5')) { tier = 'competitive'; skillLabel = 'Competitive'; range = '3.5 - 3.99' }
  else if (combined.includes('INTERMEDIATE') || combined.includes('3.0')) { tier = 'intermediate'; skillLabel = 'Intermediate'; range = '3.0 - 3.49' }
  else if (combined.includes('CASUAL') || combined.includes('2.5'))      { tier = 'casual'; skillLabel = 'Casual'; range = '2.5 - 2.99' }
  else if (combined.includes('BEGINNER') || combined.includes('2.0'))    { tier = 'beginner'; skillLabel = 'Beginner'; range = '2.0 - 2.49' }

  const label = fmtPrefix && skillLabel
    ? `${fmtPrefix} · ${skillLabel}`
    : fmtPrefix || skillLabel || 'All Levels'

  return { tier: tier || 'other', label, range }
}

function shortenCourt(court: string): string {
  const m = court.match(/Court\s*#?\s*(\d+)/i)
  return m ? `Ct #${m[1]}` : court.replace(/\(.+\)/, '').trim()
}

// ── Props ──

interface ScheduleIQProps {
  calendarData: any
  dashboardData: any
  isLoading: boolean
  clubId: string
}

// ── Main Component ──

export function ScheduleIQ({ calendarData, dashboardData, isLoading, clubId }: ScheduleIQProps) {
  const { isDark } = useTheme()
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()))
  const [selectedSession, setSelectedSession] = useState<SessionCalendarItem | null>(null)

  const allSessions: SessionCalendarItem[] = calendarData?.sessions ?? []

  const allDates = useMemo(() => {
    const s = new Set(allSessions.map((s) => s.date))
    return Array.from(s).sort()
  }, [allSessions])

  const courts = useMemo(() => {
    const s = new Set<string>()
    allSessions.forEach((x) => { if (x.court) s.add(x.court) })
    return Array.from(s).sort()
  }, [allSessions])

  const daySessions = useMemo(
    () => allSessions.filter((s) => s.date === selectedDate),
    [allSessions, selectedDate]
  )

  const sessionGrid = useMemo(() => {
    const map: Record<string, (SessionCalendarItem & { rowSpan: number })[]> = {}
    const occupied: Set<string> = new Set()
    for (const s of daySessions) {
      const startH = parseInt(s.startTime.split(':')[0], 10)
      const endH = parseInt(s.endTime.split(':')[0], 10)
      const span = Math.max(1, endH - startH)
      const key = `${s.court}|${startH}`
      if (!map[key]) map[key] = []
      map[key].push({ ...s, rowSpan: span })
      for (let h = startH + 1; h < startH + span; h++) {
        occupied.add(`${s.court}|${h}`)
      }
    }
    return { map, occupied }
  }, [daySessions])

  const weekPills = useMemo(() => {
    const sel = new Date(selectedDate + 'T12:00:00')
    const day = sel.getDay()
    const mon = addDays(sel, -(day === 0 ? 6 : day - 1))
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i)
      return { dateStr: toDateStr(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), day: d.getDate() }
    })
  }, [selectedDate])

  const todayStr = toDateStr(new Date())
  const formattedDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }, [selectedDate])

  const handlePrev = useCallback(() => {
    setSelectedDate((d) => toDateStr(addDays(new Date(d + 'T12:00:00'), -1)))
  }, [])
  const handleNext = useCallback(() => {
    setSelectedDate((d) => {
      const next = toDateStr(addDays(new Date(d + 'T12:00:00'), 1))
      const maxDate = allDates.length > 0 ? allDates[allDates.length - 1] : next
      return next <= maxDate ? next : d
    })
  }, [allDates])
  const handleToday = useCallback(() => setSelectedDate(toDateStr(new Date())), [])

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-xl" style={{ background: 'var(--subtle)' }} />
        <div className="h-10 w-full rounded-xl" style={{ background: 'var(--subtle)' }} />
        <div className="h-[400px] rounded-2xl" style={{ background: 'var(--subtle)' }} />
      </div>
    )
  }

  if (!calendarData || allSessions.length === 0) {
    return (
      <div className="text-center py-20">
        <CalendarDays className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--t4)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--heading)' }}>No Schedule Data</h3>
        <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--t3)' }}>Upload session data via CSV to see the court scheduler.</p>
      </div>
    )
  }

  const currentHour = new Date().getHours()

  // Session detail view — replaces calendar when a session is selected
  if (selectedSession) {
    return <SessionDetailIQ session={selectedSession} clubId={clubId} onBack={() => setSelectedSession(null)} />
  }

  return (
    <div className="space-y-4">
      {/* Day navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold" style={{ color: 'var(--heading)' }}>Court Schedule</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl px-1 py-1" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
            <button onClick={handlePrev} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--t3)' }}><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-3 py-1 text-sm font-medium" style={{ color: 'var(--heading)' }}>{formattedDate}</span>
            <button onClick={handleNext} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--t3)' }}><ChevronRight className="w-4 h-4" /></button>
          </div>
          <button
            onClick={handleToday}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{ background: selectedDate === todayStr ? 'rgba(139,92,246,0.15)' : 'var(--subtle)', color: selectedDate === todayStr ? '#8B5CF6' : 'var(--t3)', border: '1px solid var(--card-border)' }}
          >Today</button>
        </div>
      </div>

      {/* Week overview bar */}
      <div className="flex items-center gap-1.5">
        {weekPills.map((p) => {
          const isSelected = p.dateStr === selectedDate
          const isToday = p.dateStr === todayStr
          const hasSessions = allSessions.some((s) => s.date === p.dateStr)
          return (
            <button
              key={p.dateStr}
              onClick={() => setSelectedDate(p.dateStr)}
              className="flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
              style={{
                background: isSelected ? 'rgba(139,92,246,0.15)' : 'transparent',
                border: `1px solid ${isSelected ? 'rgba(139,92,246,0.3)' : isToday ? 'rgba(139,92,246,0.2)' : 'transparent'}`,
                color: isSelected ? '#8B5CF6' : isToday ? '#8B5CF6' : 'var(--t3)',
                opacity: hasSessions ? 1 : 0.5,
              }}
            >
              <span className="text-[10px] uppercase">{p.label}</span>
              <span className="text-sm font-semibold">{p.day}</span>
            </button>
          )
        })}
      </div>

      {/* Court Grid */}
      <div>
        {daySessions.length === 0 ? (
          <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--t4)' }} />
            <p className="text-sm" style={{ color: 'var(--t3)' }}>No sessions scheduled for this day</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(600, courts.length * 140 + 70) }}>
                {/* Court header */}
                <div className="flex sticky top-0 z-10" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--card-border)' }}>
                  <div className="w-[70px] shrink-0 p-2" />
                  {courts.map((c) => (
                    <div key={c} className="flex-1 min-w-[120px] p-2 text-center" style={{ borderLeft: '1px solid var(--card-border)' }}>
                      <div className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>{shortenCourt(c)}</div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full mt-0.5 inline-block" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>Pickleball</span>
                    </div>
                  ))}
                </div>

                {/* CSS Grid: courts as columns, hours as rows — supports multi-hour session spans */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `70px repeat(${courts.length}, minmax(120px, 1fr))`,
                    gridTemplateRows: `repeat(${HOURS.length}, minmax(56px, auto))`,
                  }}
                >
                  {HOURS.map((hour, rowIdx) => {
                    const isNow = hour === currentHour && selectedDate === todayStr
                    return (
                      <React.Fragment key={hour}>
                        {/* Time label */}
                        <div
                          className="p-1.5 text-right pr-3 flex items-start justify-end sticky left-0 z-[5]"
                          style={{
                            gridColumn: 1,
                            gridRow: rowIdx + 1,
                            borderTop: '1px solid var(--card-border)',
                            background: isNow ? 'rgba(139,92,246,0.06)' : 'var(--card-bg)',
                          }}
                        >
                          <span className="text-[10px] font-medium" style={{ color: isNow ? '#8B5CF6' : 'var(--t4)' }}>{formatHour(hour)}</span>
                        </div>

                        {/* Court cells */}
                        {courts.map((court, colIdx) => {
                          const key = `${court}|${hour}`
                          const isOccupied = sessionGrid.occupied.has(key)
                          const cellSessions = sessionGrid.map[key]

                          // Skip cells that are covered by a multi-hour session above
                          if (isOccupied) return null

                          const span = cellSessions?.[0]?.rowSpan || 1

                          return (
                            <div
                              key={key}
                              className="relative p-0.5"
                              style={{
                                gridColumn: colIdx + 2,
                                gridRow: span > 1 ? `${rowIdx + 1} / span ${span}` : rowIdx + 1,
                                borderTop: '1px solid var(--card-border)',
                                borderLeft: '1px solid var(--card-border)',
                                background: isNow ? 'rgba(139,92,246,0.03)' : 'transparent',
                              }}
                            >
                              {!cellSessions ? (
                                <div className="w-full h-full min-h-[48px] rounded-lg border border-dashed" style={{ borderColor: 'var(--card-border)', opacity: 0.15 }} />
                              ) : (
                                cellSessions.map((s) => {
                                  const sk = classifySkill(s.format, s.skillLevel, (s as any).title)
                                  const colors = SKILL_COLORS[sk.tier]
                                  const pct = Math.round((s.registered / (s.capacity || 1)) * 100)
                                  const timeRange = `${s.startTime} - ${s.endTime}`
                                  return (
                                    <button
                                      key={s.id}
                                      onClick={() => setSelectedSession(s)}
                                      className="w-full text-left rounded-lg p-2 transition-all hover:brightness-110 cursor-pointer h-full flex flex-col justify-between"
                                      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                                    >
                                      <div>
                                        <div className="text-[11px] font-semibold" style={{ color: colors.text }}>{sk.label}</div>
                                        {sk.range && <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{sk.range}</div>}
                                        {span > 1 && <div className="text-[9px] mt-0.5" style={{ color: 'var(--t4)' }}>{timeRange}</div>}
                                      </div>
                                      <div>
                                        <div className="text-[10px] font-medium mt-1" style={{ color: 'var(--heading)' }}>{s.registered}/{s.capacity}</div>
                                        <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: colors.text }} />
                                        </div>
                                      </div>
                                    </button>
                                  )
                                })
                              )}
                            </div>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
