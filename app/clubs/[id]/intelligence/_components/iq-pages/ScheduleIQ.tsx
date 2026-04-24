'use client'
import React, { useState, useMemo, useCallback } from "react"
import {
  ChevronLeft, ChevronRight, CalendarDays, Sparkles,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"
import type { SessionCalendarItem } from "@/types/intelligence"
import { SessionDetailIQ } from "./SessionDetailIQ"

// ── Constants ──

const HOUR_START = 6
const HOUR_END = 23
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const SCHEDULE_ROW_HEIGHT = 40

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
  // `createOpsSessionDraftFromAdvisorDraft` / `createFillSessionDraftFromSchedule`
  // / `opsSessionDrafts` used to drive the Agent Schedule Layer card below
  // the day header. That card moved out to /intelligence/programming on
  // 2026-04-24 — props removed to keep the contract tight.
  advisorDrafts?: Array<{
    id: string
    kind: string
    title: string
    summary?: string | null
    originalIntent?: string | null
    conversationId?: string | null
    metadata?: {
      programmingPreview?: {
        goal: string
        primary: {
          id: string
          title: string
          dayOfWeek: string
          timeSlot: 'morning' | 'afternoon' | 'evening'
          startTime: string
          endTime: string
          format: string
          skillLevel: string
        projectedOccupancy: number
        estimatedInterestedMembers: number
        confidence: number
        conflict?: {
          overlapRisk: 'low' | 'medium' | 'high'
          cannibalizationRisk: 'low' | 'medium' | 'high'
          courtPressureRisk: 'low' | 'medium' | 'high'
          overallRisk: 'low' | 'medium' | 'high'
          riskSummary: string
          warnings: string[]
          saferAlternativeId?: string
          saferAlternativeReason?: string
        } | null
      }
      alternatives?: Array<{
          id: string
          title: string
          dayOfWeek: string
          timeSlot: 'morning' | 'afternoon' | 'evening'
          startTime: string
          endTime: string
          format: string
          skillLevel: string
        projectedOccupancy: number
        estimatedInterestedMembers: number
        confidence: number
        conflict?: {
          overlapRisk: 'low' | 'medium' | 'high'
          cannibalizationRisk: 'low' | 'medium' | 'high'
          courtPressureRisk: 'low' | 'medium' | 'high'
          overallRisk: 'low' | 'medium' | 'high'
          riskSummary: string
          warnings: string[]
          saferAlternativeId?: string
          saferAlternativeReason?: string
        } | null
      }>
        insights?: string[]
        slotFillerPreview?: {
          sessionId: string
          title: string
          date: string
          startTime: string
          endTime?: string | null
          format?: string | null
          skillLevel?: string | null
          occupancy: number
          spotsRemaining: number
          candidateCount: number
          channel: 'email' | 'sms' | 'both'
        } | null
      } | null
    } | null
  }>
}

// ── Main Component ──

export function ScheduleIQ({
  calendarData,
  dashboardData,
  isLoading,
  clubId,
  advisorDrafts,
}: ScheduleIQProps) {
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
    const hasUnassigned = allSessions.some((x) => !x.court)
    allSessions.forEach((x) => { if (x.court) s.add(x.court) })
    const sorted = Array.from(s).sort()
    if (hasUnassigned) sorted.push('__unassigned__')
    return sorted
  }, [allSessions])

  const daySessions = useMemo(
    () => allSessions.filter((s) => s.date === selectedDate),
    [allSessions, selectedDate]
  )

  const sessionGrid = useMemo(() => {
    const map: Record<string, (SessionCalendarItem & { rowSpan: number; fractionalSpan: number })[]> = {}
    const occupied: Set<string> = new Set()
    for (const s of daySessions) {
      const startH = parseInt(s.startTime.split(':')[0], 10)
      const startM = parseInt(s.startTime.split(':')[1] || '0', 10)
      const endH = parseInt(s.endTime.split(':')[0], 10)
      const endM = parseInt(s.endTime.split(':')[1] || '0', 10)
      // Fractional hours for CSS height (e.g. 1.5 for 90 min)
      const fractionalSpan = Math.max(1, (endH + endM / 60) - (startH + startM / 60))
      // Integer span for grid rows
      const span = Math.max(1, Math.ceil(fractionalSpan))
      const courtKey = s.court || '__unassigned__'
      const key = `${courtKey}|${startH}`
      if (!map[key]) map[key] = []
      map[key].push({ ...s, rowSpan: span, fractionalSpan })
      for (let h = startH + 1; h < startH + span; h++) {
        occupied.add(`${courtKey}|${h}`)
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

  const visibleHours = useMemo(() => {
    if (daySessions.length === 0) return HOURS
    const starts = daySessions.map((s) => parseInt(s.startTime.split(':')[0], 10))
    const ends = daySessions.map((s) => {
      const endH = parseInt(s.endTime.split(':')[0], 10)
      const endM = parseInt(s.endTime.split(':')[1] || '0', 10)
      return endH + (endM > 0 ? 1 : 0)
    })
    const start = Math.max(HOUR_START, Math.min(...starts))
    const end = Math.min(HOUR_END, Math.max(start + 1, Math.max(...ends)))
    return Array.from({ length: end - start }, (_, i) => start + i)
  }, [daySessions])

  const todayStr = toDateStr(new Date())
  const formattedDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }, [selectedDate])
  const selectedDayName = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long' })
  }, [selectedDate])

  // Programming ideas / ops-session signals were surfaced in the
  // "Agent Schedule Layer" block on this page until 2026-04-24. The
  // dedicated Programming IQ tab (/intelligence/programming) now owns
  // that story end-to-end with a court × day × hour grid, so the
  // computations below were dead code and are removed.

  const fillSessionDraftBySessionId = useMemo(() => {
    const drafts = new Map<string, {
      id: string
      conversationId?: string | null
      originalIntent?: string | null
      preview: {
        sessionId: string
        title: string
        date: string
        startTime: string
        endTime?: string | null
        format?: string | null
        skillLevel?: string | null
        occupancy: number
        spotsRemaining: number
        candidateCount: number
        channel: 'email' | 'sms' | 'both'
      }
    }>()

    for (const draft of advisorDrafts || []) {
      const slotFillerPreview = (draft.metadata as {
        slotFillerPreview?: {
          sessionId: string
          title: string
          date: string
          startTime: string
          endTime?: string | null
          format?: string | null
          skillLevel?: string | null
          occupancy: number
          spotsRemaining: number
          candidateCount: number
          channel: 'email' | 'sms' | 'both'
        } | null
      } | null | undefined)?.slotFillerPreview

      if (draft.kind !== 'fill_session' || !slotFillerPreview?.sessionId) continue
      drafts.set(slotFillerPreview.sessionId, {
        id: draft.id,
        conversationId: draft.conversationId || null,
        originalIntent: draft.originalIntent || null,
        preview: slotFillerPreview,
      })
    }

    return drafts
  }, [advisorDrafts])

  // selectedDayOpsDrafts / selectedDayUnderfilled / selectedAgentHref
  // also died with the Agent Schedule Layer block above.

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
    <div className="space-y-3">
      {/* Day navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold" style={{ color: 'var(--heading)' }}>Court Schedule</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl px-1 py-0.5" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
            <button onClick={handlePrev} className="p-1 rounded-lg hover:opacity-70" style={{ color: 'var(--t3)' }}><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-2 py-1 text-xs font-medium" style={{ color: 'var(--heading)' }}>{formattedDate}</span>
            <button onClick={handleNext} className="p-1 rounded-lg hover:opacity-70" style={{ color: 'var(--t3)' }}><ChevronRight className="w-4 h-4" /></button>
          </div>
          <button
            onClick={handleToday}
            className="px-2.5 py-1 rounded-xl text-xs font-semibold transition-all"
            style={{ background: selectedDate === todayStr ? 'rgba(139,92,246,0.15)' : 'var(--subtle)', color: selectedDate === todayStr ? '#8B5CF6' : 'var(--t3)', border: '1px solid var(--card-border)' }}
          >Today</button>
        </div>
      </div>

      {/* Week overview bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {weekPills.map((p) => {
          const isSelected = p.dateStr === selectedDate
          const isToday = p.dateStr === todayStr
          const hasSessions = allSessions.some((s) => s.date === p.dateStr)
          return (
            <button
              key={p.dateStr}
              onClick={() => setSelectedDate(p.dateStr)}
              className="flex min-w-[44px] flex-col items-center px-2 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: isSelected ? 'rgba(139,92,246,0.15)' : 'transparent',
                border: `1px solid ${isSelected ? 'rgba(139,92,246,0.3)' : isToday ? 'rgba(139,92,246,0.2)' : 'transparent'}`,
                color: isSelected ? '#8B5CF6' : isToday ? '#8B5CF6' : 'var(--t3)',
                opacity: hasSessions ? 1 : 0.5,
              }}
            >
              <span className="text-[10px] uppercase">{p.label}</span>
              <span className="text-xs font-semibold">{p.day}</span>
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
              <div style={{ minWidth: Math.max(520, courts.length * 112 + 54) }}>
                {/* Court header */}
                <div className="flex sticky top-0 z-10" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--card-border)' }}>
                  <div className="w-[54px] shrink-0 p-1.5" />
                  {courts.map((c) => (
                    <div key={c} className="flex-1 min-w-[104px] p-1.5 text-center" style={{ borderLeft: '1px solid var(--card-border)' }}>
                      <div className="text-[11px] font-semibold" style={{ color: c === '__unassigned__' ? 'var(--t4)' : 'var(--heading)' }}>
                        {c === '__unassigned__' ? 'Unassigned' : shortenCourt(c)}
                      </div>
                      {c !== '__unassigned__' && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full inline-block leading-none" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>Pickleball</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* CSS Grid: courts as columns, hours as rows — supports multi-hour session spans */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `54px repeat(${courts.length}, minmax(104px, 1fr))`,
                    gridTemplateRows: `repeat(${visibleHours.length}, minmax(${SCHEDULE_ROW_HEIGHT}px, auto))`,
                  }}
                >
                  {visibleHours.map((hour, rowIdx) => {
                    const isNow = hour === currentHour && selectedDate === todayStr
                    return (
                      <React.Fragment key={hour}>
                        {/* Time label */}
                        <div
                          className="p-1 text-right pr-2 flex items-start justify-end sticky left-0 z-[5]"
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
                          const fractional = (cellSessions?.[0] as any)?.fractionalSpan || span

                          return (
                            <div
                              key={key}
                              className="relative p-[2px]"
                              style={{
                                gridColumn: colIdx + 2,
                                gridRow: span > 1 ? `${rowIdx + 1} / span ${span}` : rowIdx + 1,
                                // For fractional spans (e.g. 1.5h session in 2-row span), clip the content
                                ...(fractional !== span && span > 1 ? { maxHeight: `${fractional * SCHEDULE_ROW_HEIGHT}px` } : {}),
                                borderTop: '1px solid var(--card-border)',
                                borderLeft: '1px solid var(--card-border)',
                                background: isNow ? 'rgba(139,92,246,0.03)' : 'transparent',
                              }}
                            >
                              {!cellSessions ? (
                                <div className="w-full h-full min-h-[34px] rounded-md border border-dashed" style={{ borderColor: 'var(--card-border)', opacity: 0.12 }} />
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
                                      className="w-full text-left rounded-md px-1.5 py-1 transition-all hover:brightness-110 cursor-pointer h-full flex flex-col justify-between"
                                      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                                    >
                                      <div>
                                        <div className="truncate text-[10px] font-semibold leading-tight" style={{ color: colors.text }}>{sk.label}</div>
                                        {span > 1 && <div className="text-[8px] leading-tight" style={{ color: 'var(--t4)' }}>{timeRange}</div>}
                                      </div>
                                      <div className="mt-0.5 flex items-center justify-between gap-1">
                                        <div className="text-[9px] font-medium leading-none" style={{ color: 'var(--heading)' }}>{s.registered}/{s.capacity}</div>
                                        <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
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
