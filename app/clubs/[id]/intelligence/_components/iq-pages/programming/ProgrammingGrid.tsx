'use client'
/**
 * Programming IQ — weekly grid view.
 *
 * Renders courts as tabs, each tab showing a 7-day × hourly grid. Cells
 * are colour-coded by kind (live / suggested / saturation / empty) so
 * admins can scan density at a glance. Click → onSelectCell fires so the
 * parent can open the reasoning + edit popover.
 *
 * Multi-hour rendering — uses CSS Grid `gridRow: span N` so a 09:30–11:30
 * session is one tall cell that visually spans both 9a and 10a rows
 * instead of duplicating into separate per-hour blocks (the original
 * naive per-row render produced visible duplicates that admins read as
 * "two sessions").
 *
 * Skill tier classification — looks at title + format + skillLevel
 * because most CR-synced sessions ship `skillLevel = ALL_LEVELS` even
 * when the title clearly says "Advanced 4.0+" or "Intermediate 3.0".
 * Same heuristic as ScheduleIQ's `classifySkill`.
 *
 * Kept intentionally layout-only: no data fetching, no mutations. All
 * state lives in the parent `ProgrammingIQ`.
 */
import React, { useMemo, useState } from 'react'
import { MapPin, Building2, AlertTriangle, Sparkles } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────

export interface GridCourt {
  id: string
  name: string
  isIndoor: boolean
  isActive: boolean
}

export interface GridLiveSession {
  id: string
  courtId: string | null
  date: Date | string
  startTime: string
  endTime: string
  title: string | null
  format: string | null
  skillLevel: string | null
  maxPlayers: number | null
  registeredCount?: number | null
}

export interface GridDraft {
  id: string
  courtId: string | null
  dayOfWeek: string
  startTime: string
  endTime: string
  title: string
  format: string
  skillLevel: string
  maxPlayers: number
  confidence: number
  projectedOccupancy: number
  estimatedInterestedMembers: number
  status: string
  metadata?: {
    rationale?: string[]
    warnings?: string[]
    [k: string]: unknown
  } | null
}

export type GridSelection =
  | { kind: 'live'; session: GridLiveSession }
  | { kind: 'draft'; draft: GridDraft }

interface ProgrammingGridProps {
  courts: GridCourt[]
  liveSessions: GridLiveSession[]
  drafts: GridDraft[]
  weekStartDate: string
  selectedDraftIds: Set<string>
  onToggleSelect: (draftId: string) => void
  onSelectCell: (selection: GridSelection) => void
}

// ── Constants ─────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DEFAULT_HOUR_START = 6
const DEFAULT_HOUR_END = 22 // 22:00 inclusive → last row spans 22:00 – 23:00
const ROW_HEIGHT = 60 // px per hour row

// ── Helpers ───────────────────────────────────────────────────────────

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Resolve the day-of-week for a session timestamp **in the club's
 * timezone**. CR sessions are stored as UTC midnights one day later
 * than the local date they represent (a Monday 09:00 EST session
 * lands as `2026-04-21T00:00:00Z` in the DB), so a naive `getDay()`
 * on a runtime that isn't in the club's TZ puts the cell in the
 * wrong column. Same fix as `dayOfWeekFromDate` in the scheduler.
 */
function dayNameFromDate(date: Date | string, timezone = 'America/New_York'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: timezone,
    }).format(d)
  } catch {
    return DAYS[((d.getDay() + 6) % 7)]
  }
}

/**
 * Skill classifier that mirrors `ScheduleIQ.classifySkill` — many CR
 * sessions arrive with `skillLevel = ALL_LEVELS` but their `title` says
 * "Advanced 4.0+" or "(3.5 - 3.99)". Reading title + format + skill
 * recovers the right colour tier in those cases instead of falling back
 * to grey.
 */
type SkillTier = 'beginner' | 'casual' | 'intermediate' | 'competitive' | 'advanced' | 'all'

function classifyTier(opts: {
  skillLevel?: string | null
  format?: string | null
  title?: string | null
}): SkillTier {
  const sl = (opts.skillLevel || '').toUpperCase()
  const fmt = (opts.format || '').toUpperCase()
  const t = (opts.title || '').toUpperCase()
  const combined = `${sl} ${fmt} ${t}`
  if (combined.includes('ADVANCED') || combined.includes('4.0') || combined.includes('4.5') || combined.includes('5.0')) return 'advanced'
  if (combined.includes('COMPETITIVE') || combined.includes('3.5')) return 'competitive'
  if (combined.includes('INTERMEDIATE') || combined.includes('3.0')) return 'intermediate'
  if (combined.includes('CASUAL') || combined.includes('2.5')) return 'casual'
  if (combined.includes('BEGINNER') || combined.includes('2.0')) return 'beginner'
  return 'all'
}

const SKILL_COLORS: Record<SkillTier, string> = {
  advanced: 'rgba(239,68,68,',     // red
  competitive: 'rgba(139,92,246,', // violet
  intermediate: 'rgba(59,130,246,', // blue
  casual: 'rgba(6,182,212,',       // cyan
  beginner: 'rgba(16,185,129,',    // green
  all: 'rgba(148,163,184,',        // slate (fallback)
}

function formatHour(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

/**
 * Compute grid row span for a session that spans `[startMinutes, endMinutes)`.
 * Returns `null` if the session falls entirely outside the visible window
 * (HOUR_START..HOUR_END+1) so the caller can skip rendering.
 *
 * `rowStart` is 1-based (CSS grid convention). End is exclusive.
 */
function computeRowSpan(
  startMin: number,
  endMin: number,
  visibleHourStart: number,
  visibleHourEndExclusive: number,
): { rowStart: number; rowSpan: number } | null {
  const startHour = visibleHourStart * 60
  const endHour = visibleHourEndExclusive * 60
  if (endMin <= startHour || startMin >= endHour) return null
  // Clip to visible window so a 06:00–08:00 session in a 6a-22p grid
  // still anchors at row 1, not row -1.
  const clippedStart = Math.max(startMin, startHour)
  const clippedEnd = Math.min(endMin, endHour)
  // Row index = floor((startMin - HOUR_START * 60) / 60) + 1 (1-based)
  const rowStart = Math.floor((clippedStart - startHour) / 60) + 1
  // Span = ceil(durationMin / 60) so a 30-min session still shows as 1 row
  const span = Math.max(1, Math.ceil((clippedEnd - clippedStart) / 60))
  return { rowStart, rowSpan: span }
}

// ── Component ────────────────────────────────────────────────────────

export function ProgrammingGrid({
  courts,
  liveSessions,
  drafts,
  weekStartDate,
  selectedDraftIds,
  onToggleSelect,
  onSelectCell,
}: ProgrammingGridProps) {
  const activeCourts = courts.filter((c) => c.isActive)
  const [activeCourtId, setActiveCourtId] = useState<string>(() => activeCourts[0]?.id || '')

  // Index live + drafts by courtId for O(1) lookup during render.
  const byCourt = useMemo(() => {
    const map = new Map<string, { live: GridLiveSession[]; draft: GridDraft[] }>()
    for (const c of activeCourts) map.set(c.id, { live: [], draft: [] })
    for (const s of liveSessions) {
      if (!s.courtId) continue
      const bucket = map.get(s.courtId)
      if (bucket) bucket.live.push(s)
    }
    for (const d of drafts) {
      if (!d.courtId) continue
      const bucket = map.get(d.courtId)
      if (bucket) bucket.draft.push(d)
    }
    return map
  }, [activeCourts, liveSessions, drafts])

  const current = byCourt.get(activeCourtId) || { live: [], draft: [] }
  const visibleHourWindow = useMemo(() => {
    const sessionStarts = current.live.map((s) => hhmmToMinutes(s.startTime))
    const sessionEnds = current.live.map((s) => hhmmToMinutes(s.endTime))
    const draftStarts = current.draft.map((d) => hhmmToMinutes(d.startTime))
    const draftEnds = current.draft.map((d) => hhmmToMinutes(d.endTime))
    const allStarts = [...sessionStarts, ...draftStarts]
    const allEnds = [...sessionEnds, ...draftEnds]

    if (allStarts.length === 0 || allEnds.length === 0) {
      return {
        start: DEFAULT_HOUR_START,
        endExclusive: DEFAULT_HOUR_END + 1,
      }
    }

    const earliestStartHour = Math.floor(Math.min(...allStarts) / 60)
    const latestEndHourExclusive = Math.ceil(Math.max(...allEnds) / 60)

    const start = Math.max(DEFAULT_HOUR_START, earliestStartHour)
    const endExclusive = Math.min(
      DEFAULT_HOUR_END + 1,
      Math.max(start + 1, latestEndHourExclusive),
    )

    return { start, endExclusive }
  }, [current.draft, current.live])

  const hours = useMemo(
    () => Array.from({ length: visibleHourWindow.endExclusive - visibleHourWindow.start }, (_, i) => visibleHourWindow.start + i),
    [visibleHourWindow.endExclusive, visibleHourWindow.start],
  )
  const rowCount = hours.length

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
    }}>
      {/* Court tabs */}
      <div className="flex items-center gap-1 p-2 overflow-x-auto" style={{
        background: 'rgba(0,0,0,0.03)',
        borderBottom: '1px solid var(--card-border)',
      }}>
        {activeCourts.map((c) => {
          const isActive = activeCourtId === c.id
          return (
            <button
              key={c.id}
              onClick={() => setActiveCourtId(c.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
              style={{
                // Active tab gets a noticeably darker fill so it stands
                // out from the row of inactive tabs (the previous theme-
                // var background read identical against that bg).
                background: isActive ? 'rgba(139,92,246,0.18)' : 'transparent',
                color: isActive ? 'var(--heading)' : 'var(--t4)',
                border: isActive ? '1px solid rgba(139,92,246,0.45)' : '1px solid transparent',
                boxShadow: isActive ? '0 0 0 1px rgba(139,92,246,0.25) inset' : 'none',
              }}
            >
              {c.isIndoor ? <Building2 className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
              {c.name}
              <span className="text-[10px] opacity-70">
                ({byCourt.get(c.id)?.live.length || 0}L · {byCourt.get(c.id)?.draft.length || 0}AI)
              </span>
            </button>
          )
        })}
      </div>

      {/* Header row: days */}
      <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b" style={{ borderColor: 'var(--card-border)' }}>
        <div />
        {DAY_LABELS.map((lbl) => (
          <div key={lbl} className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-center" style={{ color: 'var(--t4)' }}>
            {lbl}
          </div>
        ))}
      </div>

      {/* Body: one big CSS grid so multi-hour sessions can rowSpan
        naturally. 8 columns: hour-label + 7 days. ROWS rows. */}
      <div className="max-h-[640px] overflow-y-auto">
        <div
          className="relative"
          style={{
            display: 'grid',
            gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))',
            gridTemplateRows: `repeat(${rowCount}, ${ROW_HEIGHT}px)`,
          }}
        >
          {/* Background slot guides — one per (hour × day) so we can show
              alternating-band striping + the hour label. Sessions overlap
              these via gridColumn/gridRow on their own. */}
          {hours.map((h, hi) => (
            <React.Fragment key={`bg-${h}`}>
              <div
                className="text-xs px-2 font-medium text-right"
                style={{
                  gridColumn: '1 / 2',
                  gridRow: `${hi + 1} / span 1`,
                  color: 'var(--t4)',
                  borderTop: hi > 0 ? '1px solid var(--card-border)' : 'none',
                  paddingTop: 4,
                }}
              >
                {formatHour(h)}
              </div>
              {DAYS.map((_, di) => (
                <div
                  key={`bg-${h}-${di}`}
                  style={{
                    gridColumn: `${di + 2} / span 1`,
                    gridRow: `${hi + 1} / span 1`,
                    borderTop: hi > 0 ? '1px solid var(--card-border)' : 'none',
                    borderLeft: '1px solid var(--card-border)',
                    background: hi % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                  }}
                />
              ))}
            </React.Fragment>
          ))}

          {/* Live sessions — rendered once each, spanning the right rows */}
          {current.live.map((s) => {
            const day = dayNameFromDate(s.date)
            const dayIdx = DAYS.indexOf(day as typeof DAYS[number])
            if (dayIdx < 0) return null
            const span = computeRowSpan(
              hhmmToMinutes(s.startTime),
              hhmmToMinutes(s.endTime),
              visibleHourWindow.start,
              visibleHourWindow.endExclusive,
            )
            if (!span) return null
            return (
              <div
                key={s.id}
                style={{
                  gridColumn: `${dayIdx + 2} / span 1`,
                  gridRow: `${span.rowStart} / span ${span.rowSpan}`,
                  padding: 2,
                  zIndex: 1,
                }}
              >
                <LiveCell session={s} onClick={() => onSelectCell({ kind: 'live', session: s })} />
              </div>
            )
          })}

          {/* AI suggestions — same span logic, painted on top of live cells */}
          {current.draft.map((d) => {
            const dayIdx = DAYS.indexOf(d.dayOfWeek as typeof DAYS[number])
            if (dayIdx < 0) return null
            const span = computeRowSpan(
              hhmmToMinutes(d.startTime),
              hhmmToMinutes(d.endTime),
              visibleHourWindow.start,
              visibleHourWindow.endExclusive,
            )
            if (!span) return null
            return (
              <div
                key={d.id}
                style={{
                  gridColumn: `${dayIdx + 2} / span 1`,
                  gridRow: `${span.rowStart} / span ${span.rowSpan}`,
                  padding: 2,
                  zIndex: 2, // sit above live cells when both fall in the same slot
                }}
              >
                <DraftCell
                  draft={d}
                  selected={selectedDraftIds.has(d.id)}
                  onToggleSelect={() => onToggleSelect(d.id)}
                  onClick={() => onSelectCell({ kind: 'draft', draft: d })}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer legend */}
      <div className="px-4 py-2 flex items-center gap-4 text-xs" style={{ background: 'rgba(0,0,0,0.02)', borderTop: '1px solid var(--card-border)', color: 'var(--t4)' }}>
        <LegendPill color="rgba(148,163,184,0.25)" label="Live session" />
        <LegendPill color="rgba(139,92,246,0.28)" label="AI suggestion" icon={<Sparkles className="w-3 h-3" style={{ color: '#A78BFA' }} />} />
        <LegendPill color="rgba(245,158,11,0.28)" label="Saturation warning" icon={<AlertTriangle className="w-3 h-3" style={{ color: '#F59E0B' }} />} />
        <span className="ml-auto">Week of {weekStartDate}</span>
      </div>
    </div>
  )
}

function LiveCell({ session, onClick }: { session: GridLiveSession; onClick: () => void }) {
  const tier = classifyTier({
    skillLevel: session.skillLevel,
    format: session.format,
    title: session.title,
  })
  const rgba = SKILL_COLORS[tier]
  return (
    <button
      onClick={onClick}
      className="w-full h-full text-left rounded-md px-2 py-1.5 transition-all hover:shadow-md flex flex-col justify-between"
      style={{
        background: `${rgba}0.14)`,
        border: `1px solid ${rgba}0.35)`,
        color: 'var(--heading)',
      }}
    >
      <div className="text-[11px] font-semibold leading-tight line-clamp-2">{session.title || 'Session'}</div>
      <div className="text-[10px] opacity-70 leading-tight">
        {session.startTime}–{session.endTime}
        {session.maxPlayers ? ` · ${session.registeredCount ?? 0}/${session.maxPlayers}` : ''}
      </div>
    </button>
  )
}

function DraftCell({
  draft,
  selected,
  onToggleSelect,
  onClick,
}: {
  draft: GridDraft
  selected: boolean
  onToggleSelect: () => void
  onClick: () => void
}) {
  const hasWarning = (draft.metadata?.warnings?.length || 0) > 0
  // AI suggestions get a strong violet identity regardless of the
  // underlying skill tier, so admins always read them as "AI proposed
  // this" and never confuse them with live data. Saturation flag turns
  // the whole tile amber as a louder warning channel.
  const fill = hasWarning ? 'rgba(245,158,11,0.20)' : 'rgba(139,92,246,0.22)'
  const border = hasWarning ? 'rgba(245,158,11,0.55)' : 'rgba(139,92,246,0.6)'
  const accent = hasWarning ? '#F59E0B' : '#A78BFA'
  return (
    <div
      className="w-full h-full rounded-md px-2 py-1.5 cursor-pointer transition-all hover:shadow-lg flex items-start gap-1"
      style={{
        background: fill,
        border: `1.5px dashed ${border}`,
        outline: selected ? '2px solid rgba(139,92,246,0.85)' : 'none',
        outlineOffset: '-1px',
        boxShadow: selected ? '0 0 12px rgba(139,92,246,0.45)' : '0 0 0 transparent',
      }}
      onClick={onClick}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 accent-violet-500 flex-shrink-0"
        style={{ transform: 'scale(0.95)' }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 flex-shrink-0" style={{ color: accent }} />
          <span className="text-[11px] font-semibold leading-tight line-clamp-1" style={{ color: 'var(--heading)' }}>
            {draft.title}
          </span>
        </div>
        <div className="text-[10px] opacity-70 leading-tight">
          {draft.startTime}–{draft.endTime} · {draft.confidence}% conf
        </div>
        {hasWarning && (
          <div className="flex items-center gap-0.5 text-[10px] mt-0.5 font-medium" style={{ color: '#B45309' }}>
            <AlertTriangle className="w-2.5 h-2.5" />
            saturated
          </div>
        )}
      </div>
    </div>
  )
}

function LegendPill({ color, label, icon }: { color: string; label: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-3 h-3 rounded" style={{ background: color, border: '1px solid rgba(0,0,0,0.12)' }} />
      {icon}
      {label}
    </span>
  )
}
