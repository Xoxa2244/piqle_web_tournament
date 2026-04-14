'use client'
import React, { useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import {
  ChevronLeft, ChevronRight, CalendarDays, ArrowUpRight, Brain, Sparkles,
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
        }>
        insights?: string[]
      } | null
    } | null
  }>
  opsSessionDrafts?: Array<{
    id: string
    title: string
    status: 'ready_for_ops' | 'session_draft' | 'rejected' | 'archived'
    dayOfWeek: string
    timeSlot: 'morning' | 'afternoon' | 'evening'
    startTime: string
    endTime: string
    format: string
    skillLevel: string
    projectedOccupancy: number
    estimatedInterestedMembers: number
    confidence: number
    agentDraft?: {
      conversationId?: string | null
      originalIntent?: string | null
    } | null
    metadata?: {
      sessionDraft?: {
        nextStep?: string
      } | null
    } | null
  }>
}

function formatProgrammingValue(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildAdvisorDraftHref(
  clubId: string,
  draft: { conversationId?: string | null; originalIntent?: string | null },
) {
  if (draft.conversationId) {
    return `/clubs/${clubId}/intelligence/advisor?conversationId=${encodeURIComponent(draft.conversationId)}`
  }
  if (draft.originalIntent) {
    return `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(draft.originalIntent)}`
  }
  return `/clubs/${clubId}/intelligence/advisor`
}

function buildAgentFocusHref(
  clubId: string,
  options: {
    focus: 'programming-cockpit' | 'ops-board' | 'ops-queue'
    day?: string
    draftId?: string
    opsDraftId?: string
  },
) {
  const params = new URLSearchParams()
  params.set('focus', options.focus)
  if (options.day) params.set('day', options.day)
  if (options.draftId) params.set('draftId', options.draftId)
  if (options.opsDraftId) params.set('opsDraftId', options.opsDraftId)
  return `/clubs/${clubId}/intelligence/agent?${params.toString()}`
}

// ── Main Component ──

export function ScheduleIQ({
  calendarData,
  dashboardData,
  isLoading,
  clubId,
  advisorDrafts,
  opsSessionDrafts,
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

  const todayStr = toDateStr(new Date())
  const formattedDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }, [selectedDate])
  const selectedDayName = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long' })
  }, [selectedDate])

  const programmingSignals = useMemo(() => {
    const cards = (advisorDrafts || [])
      .filter((draft) => draft.kind === 'program_schedule' && draft.metadata?.programmingPreview?.primary)
      .map((draft) => ({
        id: draft.id,
        title: draft.title,
        summary: draft.summary || null,
        conversationId: draft.conversationId || null,
        originalIntent: draft.originalIntent || null,
        primary: draft.metadata!.programmingPreview!.primary,
        insights: draft.metadata?.programmingPreview?.insights || [],
        alternatives: draft.metadata?.programmingPreview?.alternatives || [],
      }))

    const matching = cards.filter((draft) =>
      draft.primary.dayOfWeek === selectedDayName ||
      draft.alternatives.some((proposal) => proposal.dayOfWeek === selectedDayName),
    )

    return {
      matching: matching.sort((left, right) => right.primary.confidence - left.primary.confidence),
      strongest: cards.sort((left, right) => right.primary.confidence - left.primary.confidence)[0] || null,
    }
  }, [advisorDrafts, selectedDayName])

  const selectedDayOpsDrafts = useMemo(() => {
    return (opsSessionDrafts || [])
      .filter((draft) => draft.dayOfWeek === selectedDayName && draft.status !== 'archived' && draft.status !== 'rejected')
      .sort((left, right) => right.confidence - left.confidence)
  }, [opsSessionDrafts, selectedDayName])

  const selectedDayUnderfilled = useMemo(() => {
    return daySessions
      .filter((session) => session.status !== 'past' && session.occupancy < 70)
      .sort((left, right) => left.occupancy - right.occupancy)
  }, [daySessions])
  const selectedAgentHref = useMemo(() => {
    if (selectedDayOpsDrafts.length > 0) {
      return buildAgentFocusHref(clubId, {
        focus: 'ops-queue',
        day: selectedDayName,
        opsDraftId: selectedDayOpsDrafts[0].id,
      })
    }

    const topProgrammingDraft = programmingSignals.matching[0] || programmingSignals.strongest
    if (topProgrammingDraft) {
      return buildAgentFocusHref(clubId, {
        focus: 'programming-cockpit',
        day: selectedDayName,
        draftId: topProgrammingDraft.id,
      })
    }

    return `/clubs/${clubId}/intelligence/agent`
  }, [clubId, programmingSignals.matching, programmingSignals.strongest, selectedDayName, selectedDayOpsDrafts])

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

      <div
        className="rounded-2xl p-4"
        style={{
          background: isDark ? 'rgba(103,232,249,0.04)' : 'rgba(6,182,212,0.05)',
          border: '1px solid rgba(103,232,249,0.12)',
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" style={{ color: '#67E8F9' }} />
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                Agent Schedule Layer
              </div>
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>
              The live schedule stays untouched here. The agent only highlights pressure, opportunities, and internal draft changes for {selectedDayName}.
            </div>
          </div>
          <Link
            href={selectedAgentHref}
            className="inline-flex items-center gap-1 text-xs font-medium shrink-0"
            style={{ color: 'var(--heading)' }}
          >
            Open in Agent
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1fr_1fr] gap-3">
          <div
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#A78BFA' }} />
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                Today&apos;s pressure
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg p-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.16)' }}>
                <div className="text-[11px]" style={{ color: '#EF4444' }}>Underfilled</div>
                <div className="text-lg font-bold tabular-nums" style={{ color: '#EF4444' }}>{selectedDayUnderfilled.length}</div>
              </div>
              <div className="rounded-lg p-2" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.16)' }}>
                <div className="text-[11px]" style={{ color: '#10B981' }}>Live sessions</div>
                <div className="text-lg font-bold tabular-nums" style={{ color: '#10B981' }}>{daySessions.length}</div>
              </div>
            </div>
            <div className="space-y-2 mt-3">
              {selectedDayUnderfilled.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                  No clear slot-filler pressure on this day right now.
                </div>
              ) : (
                selectedDayUnderfilled.slice(0, 3).map((session) => (
                  <div key={session.id} className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-[11px] font-semibold" style={{ color: 'var(--heading)' }}>
                      {session.format} · {session.startTime}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--t3)' }}>
                      {session.occupancy}% occupancy · {session.registered}/{session.capacity} booked
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" style={{ color: '#A78BFA' }} />
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                Programming ideas for {selectedDayName}
              </div>
            </div>
            <div className="space-y-3 mt-3">
              {(programmingSignals.matching.length ? programmingSignals.matching : programmingSignals.strongest ? [programmingSignals.strongest] : []).slice(0, 2).map((draft) => (
                <div key={draft.id} className="rounded-lg p-3" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.16)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                        {draft.primary.title}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--t3)' }}>
                        {draft.primary.dayOfWeek} · {draft.primary.startTime}-{draft.primary.endTime} · {formatProgrammingValue(draft.primary.format)} · {formatProgrammingValue(draft.primary.skillLevel)}
                      </div>
                    </div>
                    <div className="text-[11px] px-2 py-1 rounded-full" style={{ background: 'rgba(103,232,249,0.12)', color: '#67E8F9', fontWeight: 700 }}>
                      {draft.primary.confidence}/100
                    </div>
                  </div>
                  <div className="text-[11px] mt-2" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>
                    {draft.primary.projectedOccupancy}% projected fill · {draft.primary.estimatedInterestedMembers} likely players
                  </div>
                  <div className="text-[11px] mt-2" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                    {draft.insights[0] || draft.summary || 'Agent-backed schedule opportunity ready for review.'}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Link
                      href={buildAgentFocusHref(clubId, {
                        focus: 'programming-cockpit',
                        day: selectedDayName,
                        draftId: draft.id,
                      })}
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: 'var(--heading)' }}
                    >
                      Review in Agent
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                    <Link
                      href={buildAdvisorDraftHref(clubId, draft)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: 'var(--t3)' }}
                    >
                      Open draft
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
              {!programmingSignals.matching.length && !programmingSignals.strongest && (
                <div className="text-[11px]" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                  No programming draft is attached to this day yet. Ask the agent what format should be added here.
                </div>
              )}
            </div>
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" style={{ color: '#10B981' }} />
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                Internal session drafts
              </div>
            </div>
            <div className="space-y-3 mt-3">
              {selectedDayOpsDrafts.slice(0, 2).map((draft) => (
                <div key={draft.id} className="rounded-lg p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.16)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                        {draft.title}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--t3)' }}>
                        {draft.startTime}-{draft.endTime} · {formatProgrammingValue(draft.format)} · {formatProgrammingValue(draft.skillLevel)}
                      </div>
                    </div>
                    <div
                      className="text-[10px] px-2 py-1 rounded-full font-medium"
                      style={{
                        background: draft.status === 'session_draft' ? 'rgba(6,182,212,0.12)' : 'rgba(16,185,129,0.12)',
                        color: draft.status === 'session_draft' ? '#67E8F9' : '#10B981',
                      }}
                    >
                      {draft.status === 'session_draft' ? 'Session Draft' : 'Ready For Ops'}
                    </div>
                  </div>
                  <div className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>
                    {draft.projectedOccupancy}% projected fill · {draft.estimatedInterestedMembers} likely players
                  </div>
                  <div className="text-[11px] mt-2" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                    {draft.metadata?.sessionDraft?.nextStep || 'Internal-only session draft. Still manual and not live-published.'}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Link
                      href={buildAgentFocusHref(clubId, {
                        focus: 'ops-queue',
                        day: selectedDayName,
                        opsDraftId: draft.id,
                      })}
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: 'var(--heading)' }}
                    >
                      Review in Agent
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                    <Link
                      href={buildAdvisorDraftHref(clubId, {
                        conversationId: draft.agentDraft?.conversationId || null,
                        originalIntent: draft.agentDraft?.originalIntent || null,
                      })}
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: 'var(--t3)' }}
                    >
                      Open source draft
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
              {selectedDayOpsDrafts.length === 0 && (
                <div className="text-[11px]" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                  No internal session draft is attached to this day yet.
                </div>
              )}
            </div>
          </div>
        </div>
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
                      <div className="text-xs font-semibold" style={{ color: c === '__unassigned__' ? 'var(--t4)' : 'var(--heading)' }}>
                        {c === '__unassigned__' ? 'Unassigned' : shortenCourt(c)}
                      </div>
                      {c !== '__unassigned__' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full mt-0.5 inline-block" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>Pickleball</span>
                      )}
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
                          const fractional = (cellSessions?.[0] as any)?.fractionalSpan || span

                          return (
                            <div
                              key={key}
                              className="relative p-0.5"
                              style={{
                                gridColumn: colIdx + 2,
                                gridRow: span > 1 ? `${rowIdx + 1} / span ${span}` : rowIdx + 1,
                                // For fractional spans (e.g. 1.5h session in 2-row span), clip the content
                                ...(fractional !== span && span > 1 ? { maxHeight: `${fractional * 56}px` } : {}),
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
