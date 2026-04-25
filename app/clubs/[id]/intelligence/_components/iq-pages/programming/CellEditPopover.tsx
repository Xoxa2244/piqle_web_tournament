'use client'
/**
 * Side-panel popover shown when admin clicks a grid cell.
 *
 * For `live` cells: read-only detail view — admins go to the main
 * Schedule tab if they want to mutate an existing PlaySession.
 *
 * For `draft` cells: the full reasoning panel (demand breakdown, pool
 * impact, warnings) plus an inline edit form (format / skill / times /
 * capacity / court). Save calls `updateProgrammingGridCell`. Publishing
 * is handled at the parent footer level, not here — one cell at a time
 * clutters the UX.
 */
import React, { useEffect, useState } from 'react'
import { X, Sparkles, AlertTriangle, BarChart3, Users, Calendar, Save, Trash2 } from 'lucide-react'
import type { GridLiveSession, GridDraft, GridSelection, GridCourt } from './ProgrammingGrid'

// Matches the Zod enum on the tRPC procedure input. Keep in sync with
// `updateProgrammingGridCell` input validation in intelligence.ts.
const FORMATS = ['OPEN_PLAY','CLINIC','DRILL','LEAGUE_PLAY','SOCIAL','TOURNAMENT'] as const
const SKILLS = ['ALL_LEVELS','BEGINNER','CASUAL','INTERMEDIATE','COMPETITIVE','ADVANCED'] as const

interface CellEditPopoverProps {
  selection: GridSelection
  courts: GridCourt[]
  onClose: () => void
  onSave: (draftId: string, patch: {
    title?: string
    format?: (typeof FORMATS)[number]
    skillLevel?: (typeof SKILLS)[number]
    startTime?: string
    endTime?: string
    maxPlayers?: number
    courtId?: string | null
  }) => void
  onReject?: (draftId: string) => void
  saving?: boolean
}

export function CellEditPopover(props: CellEditPopoverProps) {
  return (
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      {/* Click-outside backdrop */}
      <div
        className="flex-1 bg-black/60 backdrop-blur-sm"
        onClick={props.onClose}
      />

      {/* Right-side drawer.
       * `var(--card-bg)` resolves to a transparent value in the IQSport
       * iqsport-theme on prod, which made the popover see-through against
       * the schedule grid behind it. Explicit fallback ensures opacity in
       * both light and dark modes regardless of how --card-bg is themed. */}
      <div
        className="w-full max-w-[440px] h-full overflow-y-auto shadow-2xl"
        style={{
          background: 'var(--popover-bg, #0F172A)',
          backgroundColor: 'var(--popover-bg, #0F172A)',
          borderLeft: '1px solid var(--card-border)',
        }}
      >
        {props.selection.kind === 'draft'
          ? <DraftPanel {...props} draft={props.selection.draft} />
          : <LivePanel {...props} session={props.selection.session} />
        }
      </div>
    </div>
  )
}

// ── Live panel (read-only) ───────────────────────────────────────────

function LivePanel({
  session,
  onClose,
}: CellEditPopoverProps & { session: GridLiveSession }) {
  return (
    <div>
      <Header title={session.title || 'Session'} onClose={onClose} />
      <div className="p-5 space-y-4">
        <div className="text-xs uppercase font-semibold tracking-wide" style={{ color: 'var(--t4)' }}>
          Live session
        </div>
        <KV label="Format" value={session.format || '—'} />
        <KV label="Skill" value={session.skillLevel || '—'} />
        <KV label="Time" value={`${session.startTime}–${session.endTime}`} />
        <KV label="Capacity" value={`${session.registeredCount ?? 0}/${session.maxPlayers ?? 0}`} />
        <div className="text-xs opacity-70 pt-4" style={{ color: 'var(--t4)' }}>
          Live sessions are read-only here. Open the Schedule tab to edit.
        </div>
      </div>
    </div>
  )
}

// ── Draft panel (reasoning + edit) ────────────────────────────────────

function DraftPanel({
  draft,
  courts,
  onClose,
  onSave,
  onReject,
  saving,
}: CellEditPopoverProps & { draft: GridDraft }) {
  const [title, setTitle] = useState(draft.title)
  const [format, setFormat] = useState<(typeof FORMATS)[number]>(draft.format as any)
  const [skillLevel, setSkillLevel] = useState<(typeof SKILLS)[number]>(draft.skillLevel as any)
  const [startTime, setStartTime] = useState(draft.startTime)
  const [endTime, setEndTime] = useState(draft.endTime)
  const [maxPlayers, setMaxPlayers] = useState<number>(draft.maxPlayers)
  const [courtId, setCourtId] = useState<string>(draft.courtId || '')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // When admin clicks a different draft cell without closing, reset
    // the local form state — otherwise stale edits leak across cells.
    // Depending on the full `draft` object is correct here: changing any
    // field upstream should flush local edits to match server truth.
    setTitle(draft.title)
    setFormat(draft.format as any)
    setSkillLevel(draft.skillLevel as any)
    setStartTime(draft.startTime)
    setEndTime(draft.endTime)
    setMaxPlayers(draft.maxPlayers)
    setCourtId(draft.courtId || '')
    setDirty(false)
  }, [draft])

  const rationale = draft.metadata?.rationale || []
  const warnings = draft.metadata?.warnings || []

  const handleSave = () => {
    onSave(draft.id, {
      title,
      format,
      skillLevel,
      startTime,
      endTime,
      maxPlayers,
      courtId: courtId || null,
    })
  }

  return (
    <div>
      <Header
        title="AI suggestion"
        badge={`${draft.confidence}% confidence`}
        onClose={onClose}
        tone="suggestion"
      />

      {/* Reasoning panel */}
      <div className="p-5 border-b" style={{ borderColor: 'var(--card-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4" style={{ color: '#8B5CF6' }} />
          <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
            Why this slot
          </div>
        </div>
        <ul className="space-y-1.5 text-xs" style={{ color: 'var(--t3)' }}>
          {rationale.length === 0 && (
            <li className="italic" style={{ color: 'var(--t4)' }}>No rationale recorded.</li>
          )}
          {rationale.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-violet-500">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>

        {/* Demand metrics */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Metric icon={BarChart3} label="Projected" value={`${draft.projectedOccupancy}%`} />
          <Metric icon={Users} label="Interested" value={String(draft.estimatedInterestedMembers)} />
          <Metric icon={Calendar} label="Capacity" value={String(draft.maxPlayers)} />
        </div>

        {warnings.length > 0 && (
          <div
            className="mt-4 rounded-lg p-3 text-xs flex gap-2 items-start"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
            <div style={{ color: '#B45309' }}>
              <div className="font-semibold mb-0.5">Pool saturation risk</div>
              {warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          </div>
        )}
      </div>

      {/* Edit form */}
      <div className="p-5 space-y-3">
        <div className="text-xs uppercase font-semibold tracking-wide mb-2" style={{ color: 'var(--t4)' }}>
          Edit before publishing
        </div>

        <FormField label="Title">
          <input
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="Format">
            <select
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
              value={format}
              onChange={(e) => { setFormat(e.target.value as any); setDirty(true) }}
            >
              {FORMATS.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
            </select>
          </FormField>

          <FormField label="Skill">
            <select
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
              value={skillLevel}
              onChange={(e) => { setSkillLevel(e.target.value as any); setDirty(true) }}
            >
              {SKILLS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="Start">
            <input
              type="time"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
              value={startTime}
              onChange={(e) => { setStartTime(e.target.value); setDirty(true) }}
            />
          </FormField>
          <FormField label="End">
            <input
              type="time"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
              value={endTime}
              onChange={(e) => { setEndTime(e.target.value); setDirty(true) }}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="Capacity">
            <input
              type="number"
              min={1}
              max={50}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
              value={maxPlayers}
              onChange={(e) => { setMaxPlayers(Number(e.target.value)); setDirty(true) }}
            />
          </FormField>
          <FormField label="Court">
            <select
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
              value={courtId}
              onChange={(e) => { setCourtId(e.target.value); setDirty(true) }}
            >
              <option value="">— Unassigned —</option>
              {courts.filter((c) => c.isActive).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--card-border)' }}>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#8B5CF6', color: 'white' }}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {onReject && (
            <button
              onClick={() => onReject(draft.id)}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all disabled:opacity-50"
              style={{ background: 'transparent', color: '#B45309', border: '1px solid rgba(180,83,9,0.35)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reject
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────

function Header({
  title, badge, tone, onClose,
}: {
  title: string
  badge?: string
  tone?: 'live' | 'suggestion'
  onClose: () => void
}) {
  return (
    // Sticky header — must be opaque so content scrolling underneath
    // doesn't bleed through. Same fallback strategy as the drawer.
    <div
      className="px-5 py-4 flex items-center justify-between sticky top-0 z-10"
      style={{
        background: 'var(--popover-bg, #0F172A)',
        backgroundColor: 'var(--popover-bg, #0F172A)',
        borderBottom: '1px solid var(--card-border)',
      }}
    >
      <div className="flex items-center gap-2">
        {tone === 'suggestion' && <Sparkles className="w-4 h-4" style={{ color: '#8B5CF6' }} />}
        <div>
          <div className="font-semibold" style={{ color: 'var(--heading)' }}>{title}</div>
          {badge && (
            <div className="text-xs opacity-70" style={{ color: 'var(--t4)' }}>{badge}</div>
          )}
        </div>
      </div>
      <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--t4)' }}>
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--t4)' }}>{label}</span>
      <span style={{ color: 'var(--heading)' }}>{value}</span>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
}) {
  return (
    <div
      className="rounded-lg p-2 text-center"
      style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <Icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: '#8B5CF6' }} />
      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{value}</div>
      <div className="text-[10px] opacity-70" style={{ color: 'var(--t4)' }}>{label}</div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--t4)' }}>
        {label}
      </div>
      {children}
    </label>
  )
}
