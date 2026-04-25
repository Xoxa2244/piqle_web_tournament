'use client'
/**
 * Programming IQ — weekly grid view.
 *
 * Renders courts as tabs, each tab showing a 7-day × hourly grid. Cells
 * are colour-coded by kind (live / suggested / saturation / empty) so
 * admins can scan density at a glance. Click → onSelectCell fires so the
 * parent can open the reasoning + edit popover.
 *
 * Kept intentionally layout-only: no data fetching, no mutations. All
 * state lives in the parent `ProgrammingIQ`.
 */
import React, { useMemo, useState } from 'react'
import { Calendar, MapPin, Building2, AlertTriangle, Sparkles } from 'lucide-react'

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
const HOUR_START = 6
const HOUR_END = 22 // 22:00 inclusive → last row is 22:00 - 23:00

// ── Helpers ───────────────────────────────────────────────────────────

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function dayNameFromDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return DAYS[((d.getDay() + 6) % 7)] // Monday=0
}

function skillTier(skill: string | null | undefined): 'beginner' | 'casual' | 'intermediate' | 'competitive' | 'advanced' | 'all' {
  const s = (skill || '').toUpperCase()
  if (s.includes('ADVANCED')) return 'advanced'
  if (s.includes('COMPETITIVE')) return 'competitive'
  if (s.includes('INTERMEDIATE')) return 'intermediate'
  if (s.includes('CASUAL')) return 'casual'
  if (s.includes('BEGINNER')) return 'beginner'
  return 'all'
}

const SKILL_COLORS: Record<string, string> = {
  advanced: 'rgba(239,68,68,',
  competitive: 'rgba(139,92,246,',
  intermediate: 'rgba(59,130,246,',
  casual: 'rgba(6,182,212,',
  beginner: 'rgba(16,185,129,',
  all: 'rgba(148,163,184,',
}

function formatHour(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
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
  const rows = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i)

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
        {activeCourts.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCourtId(c.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeCourtId === c.id ? 'shadow-sm' : 'hover:bg-white/40'
            }`}
            style={{
              background: activeCourtId === c.id ? 'var(--card-bg)' : 'transparent',
              color: activeCourtId === c.id ? 'var(--heading)' : 'var(--t4)',
              border: activeCourtId === c.id ? '1px solid var(--card-border)' : '1px solid transparent',
            }}
          >
            {c.isIndoor ? <Building2 className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
            {c.name}
            <span className="text-[10px] opacity-60">
              ({byCourt.get(c.id)?.live.length || 0}L · {byCourt.get(c.id)?.draft.length || 0}AI)
            </span>
          </button>
        ))}
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

      {/* Grid body */}
      <div className="max-h-[640px] overflow-y-auto">
        {rows.map((h) => (
          <div key={h} className="grid grid-cols-[52px_repeat(7,1fr)] border-b" style={{ borderColor: 'var(--card-border)' }}>
            {/* Hour label */}
            <div className="text-xs px-2 py-3 font-medium text-right" style={{ color: 'var(--t4)' }}>
              {formatHour(h)}
            </div>
            {DAYS.map((day) => {
              const slotStart = h * 60
              const slotEnd = (h + 1) * 60
              const liveHits = current.live.filter((s) => {
                if (dayNameFromDate(s.date) !== day) return false
                const sStart = hhmmToMinutes(s.startTime)
                const sEnd = hhmmToMinutes(s.endTime)
                return sStart < slotEnd && sEnd > slotStart
              })
              const draftHits = current.draft.filter((d) => {
                if (d.dayOfWeek !== day) return false
                const sStart = hhmmToMinutes(d.startTime)
                const sEnd = hhmmToMinutes(d.endTime)
                return sStart < slotEnd && sEnd > slotStart
              })
              return (
                <div
                  key={day}
                  className="min-h-[58px] p-1 relative"
                  style={{
                    borderLeft: '1px solid var(--card-border)',
                    background: h % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                  }}
                >
                  {liveHits.map((s) => (
                    <LiveCell key={s.id} session={s} onClick={() => onSelectCell({ kind: 'live', session: s })} />
                  ))}
                  {draftHits.map((d) => (
                    <DraftCell
                      key={d.id}
                      draft={d}
                      selected={selectedDraftIds.has(d.id)}
                      onToggleSelect={() => onToggleSelect(d.id)}
                      onClick={() => onSelectCell({ kind: 'draft', draft: d })}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Footer legend */}
      <div className="px-4 py-2 flex items-center gap-4 text-xs" style={{ background: 'rgba(0,0,0,0.02)', borderTop: '1px solid var(--card-border)', color: 'var(--t4)' }}>
        <LegendPill color="rgba(148,163,184,0.25)" label="Live session" />
        <LegendPill color="rgba(139,92,246,0.18)" label="AI suggestion" icon={<Sparkles className="w-3 h-3" />} />
        <LegendPill color="rgba(245,158,11,0.22)" label="Saturation warning" icon={<AlertTriangle className="w-3 h-3" />} />
        <span className="ml-auto">Week of {weekStartDate}</span>
      </div>
    </div>
  )
}

function LiveCell({ session, onClick }: { session: GridLiveSession; onClick: () => void }) {
  const tier = skillTier(session.skillLevel)
  const rgba = SKILL_COLORS[tier]
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md px-1.5 py-1 mb-0.5 transition-all hover:shadow-sm"
      style={{
        background: `${rgba}0.12)`,
        border: `1px solid ${rgba}0.3)`,
        color: 'var(--heading)',
      }}
    >
      <div className="text-[10px] font-semibold truncate">{session.title || 'Session'}</div>
      <div className="text-[9px] opacity-70">{session.startTime}–{session.endTime}</div>
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
  const tier = skillTier(draft.skillLevel)
  const rgba = SKILL_COLORS[tier]
  const hasWarning = (draft.metadata?.warnings?.length || 0) > 0
  return (
    <div
      className="w-full rounded-md px-1.5 py-1 mb-0.5 cursor-pointer transition-all hover:shadow-sm flex items-start gap-1"
      style={{
        background: hasWarning ? 'rgba(245,158,11,0.18)' : `${rgba}0.18)`,
        border: `1px dashed ${hasWarning ? 'rgba(245,158,11,0.45)' : rgba + '0.45)'}`,
        outline: selected ? '2px solid rgba(139,92,246,0.55)' : 'none',
        outlineOffset: '-1px',
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
        className="mt-0.5 accent-violet-500"
        style={{ transform: 'scale(0.85)' }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#8B5CF6' }} />
          <span className="text-[10px] font-semibold truncate" style={{ color: 'var(--heading)' }}>
            {draft.title}
          </span>
        </div>
        <div className="text-[9px] opacity-70">
          {draft.startTime}–{draft.endTime} · {draft.confidence}% conf
        </div>
        {hasWarning && (
          <div className="flex items-center gap-0.5 text-[9px] mt-0.5" style={{ color: '#B45309' }}>
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
