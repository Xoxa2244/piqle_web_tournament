'use client'
/**
 * Programming IQ — auto-scheduled optimal weekly calendar.
 *
 * Structure per the approved plan:
 *
 *   [1] Header         — week selector, Generate button, Regenerate prompt,
 *                        last-generated badge.
 *   [2] Transparency   — "What this schedule is based on" signal summary.
 *   [3] Stats row      — 4 cards + contact-policy preview badge.
 *   [4] Main grid      — courts as tabs, 7-day × hourly matrix.
 *   [5] Cell popover   — right-side drawer with reasoning + edit form.
 *   [6] Draft actions  — generate / regenerate / clear suggestions.
 *
 * Reuses:
 *   • tRPC procedures added in server/routers/intelligence.ts
 *   • hooks in _hooks/use-intelligence.ts (useProgrammingScheduleGrid,
 *     useGenerateProgrammingSchedule, useUpdate, useBulkApprove, usePublish)
 *   • AILoadingAnimation for the Generate progress UX
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  Brain, Calendar, Sparkles, Wand2, ChevronLeft, ChevronRight,
  ShieldAlert, TrendingUp, AlertTriangle,
  Loader2, Info, Clock, Trash2, X,
} from 'lucide-react'
import {
  useProgrammingScheduleGrid,
  useGenerateProgrammingSchedule,
  useUpdateProgrammingGridCell,
  useClearProgrammingScheduleDrafts,
  useIsDemo,
} from '../../_hooks/use-intelligence'
import { AILoadingAnimation } from './AILoadingAnimation'
import { ProgrammingGrid, type GridSelection, type GridDraft } from './programming/ProgrammingGrid'
import { CellEditPopover } from './programming/CellEditPopover'

// ── Helpers ───────────────────────────────────────────────────────────

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatWeekRange(weekStart: string): string {
  const s = new Date(weekStart)
  const e = addDays(s, 6)
  const sMon = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const eMon = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${sMon} – ${eMon}`
}

function hasDraftWarning(draft: GridDraft): boolean {
  return (draft.metadata?.warnings?.length || 0) > 0
}

// ── Component ────────────────────────────────────────────────────────

interface ProgrammingIQProps {
  clubId: string
}

export function ProgrammingIQ({ clubId }: ProgrammingIQProps) {
  const isDemo = useIsDemo()
  const [weekStart, setWeekStart] = useState<string>(() => toISODate(mondayOf(new Date())))
  const [regeneratePrompt, setRegeneratePrompt] = useState('')
  const [activeCell, setActiveCell] = useState<GridSelection | null>(null)
  const [generating, setGenerating] = useState(false)
  const [showClearSuggestionsModal, setShowClearSuggestionsModal] = useState(false)
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null)
  const [generationInsights, setGenerationInsights] = useState<string[]>([])
  const [generationSummary, setGenerationSummary] = useState<{
    monthsOfBookingData: number
    preferencesCount: number
    unmetInterestRequests: number
    activeCourts: number
  } | null>(null)

  const gridQuery = useProgrammingScheduleGrid(clubId, weekStart)
  const generateMutation = useGenerateProgrammingSchedule()
  const updateCellMutation = useUpdateProgrammingGridCell()
  const clearDraftsMutation = useClearProgrammingScheduleDrafts()

  const gridData = gridQuery.data
  // Memoize the derived slices so downstream hooks (stats, grid) don't
  // re-run on every parent render — gridData itself is stable per query
  // fetch but `??` builds fresh empty arrays each time.
  const courts = useMemo(() => (gridData?.courts ?? []) as any[], [gridData])
  const liveSessions = useMemo(() => (gridData?.liveSessions ?? []) as any[], [gridData])
  const drafts = useMemo(() => ((gridData?.drafts ?? []) as any[]) as GridDraft[], [gridData])
  const publishableDrafts = useMemo(
    () => drafts.filter((draft) => !hasDraftWarning(draft)),
    [drafts],
  )
  const calendarDrafts = useMemo(
    () => drafts.filter((draft) => !!draft.courtId),
    [drafts],
  )
  const riskDrafts = useMemo(
    () => drafts.filter((draft) => hasDraftWarning(draft)),
    [drafts],
  )
  const unplacedIdeas = useMemo(
    () => drafts.filter((draft) => !draft.courtId),
    [drafts],
  )
  const courtNamesById = useMemo(
    () => new Map(courts.map((court: any) => [court.id, court.name])),
    [courts],
  )

  // Stats derived from the current grid. We keep these here (not in a
  // tRPC call) so switching weeks updates instantly without a round-trip.
  const stats = useMemo(() => {
    const suggested = publishableDrafts.length
    const liveKept = liveSessions.length
    const saturations = riskDrafts.length
    // Blend live (registeredCount/maxPlayers) with drafts (projectedOccupancy).
    // Skipping live made the metric read 0% on weeks with no AI drafts.
    const liveOccs = liveSessions
      .map((s: any) => {
        const max = s.maxPlayers ?? 0
        const reg = s.registeredCount ?? 0
        return max > 0 ? (reg / max) * 100 : null
      })
      .filter((v): v is number => v !== null)
    const draftOccs = publishableDrafts.map((d) => d.projectedOccupancy || 0)
    const allOccs = [...liveOccs, ...draftOccs]
    const avgOccupancy = allOccs.length === 0
      ? 0
      : Math.round(allOccs.reduce((s, v) => s + v, 0) / allOccs.length)
    const totalInvites = publishableDrafts.reduce((s, d) => s + Math.ceil((d.maxPlayers || 8) * 1.5), 0)
    return { suggested, liveKept, saturations, avgOccupancy, totalInvites }
  }, [liveSessions, publishableDrafts, riskDrafts.length])

  // Contact-policy preview: a rough "will admins spam their members?"
  // check. 3 invites/wk/member is the slot-filler default; the real
  // policy per club lives in automationSettings. MVP: show the ratio
  // informationally, hard-gate later.
  //
  // memberCount comes back on getProgrammingScheduleGrid — it's the
  // count of UserPlayPreference rows on the club that are NOT opted
  // out, which is the right denominator for "per-member invites this
  // week". Falls back to 1 when a club has no prefs yet so we don't
  // divide by zero.
  const memberPool = (gridData as any)?.memberCount ?? 0
  const contactPolicyBadge = useMemo(() => {
    const perMemberInvites = stats.totalInvites / Math.max(1, memberPool)
    return {
      ratio: perMemberInvites,
      safe: perMemberInvites <= 3,
      poolKnown: memberPool > 0,
    }
  }, [stats.totalInvites, memberPool])

  // ── Actions ──

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result: any = await new Promise((resolve, reject) => {
        const mutation: any = generateMutation as any
        if (mutation.mutateAsync) {
          mutation
            .mutateAsync({
              clubId,
              weekStartDate: weekStart,
              regeneratePrompt: regeneratePrompt.trim() || undefined,
            })
            .then(resolve)
            .catch(reject)
        } else {
          mutation.mutate(
            { clubId, weekStartDate: weekStart, regeneratePrompt: regeneratePrompt.trim() || undefined },
            { onSuccess: resolve, onError: reject },
          )
        }
      })
      setLastGeneratedAt(new Date())
      setGenerationInsights(result?.insights || [])
      setGenerationSummary(result?.signalSummary || null)
      if (!isDemo && 'refetch' in gridQuery) {
        await (gridQuery as any).refetch?.()
      }
    } catch (err: any) {
      console.error('[ProgrammingIQ] generate failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleWeekShift = (days: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + days)
    setWeekStart(toISODate(mondayOf(d)))
    setActiveCell(null)
  }

  const handleSaveCell = (draftId: string, patch: any) => {
    updateCellMutation.mutate(
      { clubId, draftId, patch },
      {
        onSuccess: async () => {
          if ('refetch' in gridQuery) await (gridQuery as any).refetch?.()
          setActiveCell(null)
        },
      } as any,
    )
  }

  const handleClearSuggestions = async () => {
    if (drafts.length === 0) return
    setActiveCell(null)
    await new Promise((resolve) => {
      (clearDraftsMutation as any).mutate(
        { clubId, weekStartDate: weekStart },
        {
          onSuccess: () => {
            setShowClearSuggestionsModal(false)
            resolve(null)
          },
          onError: () => resolve(null),
        },
      )
    })
  }

  // Reset draft preview state when switching to a week that hasn't been
  // generated yet — don't keep a prior run's stats.
  useEffect(() => {
    setActiveCell(null)
  }, [weekStart])

  return (
    <div className="space-y-5 pb-32 md:pb-24">
      {/* [1] Header ─────────────────────────────────────────────────── */}
      <header className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
              <Brain className="w-5 h-5" style={{ color: '#8B5CF6' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--heading)' }}>Programming IQ</h1>
              <p className="text-xs" style={{ color: 'var(--t4)' }}>
                {publishableDrafts.length > 0
                  ? 'Suggested weekly schedule, with backup ideas marked in amber'
                  : calendarDrafts.length > 0 || unplacedIdeas.length > 0
                    ? 'No publish-ready suggestions yet — amber ideas show backup options and placement issues'
                    : 'Published schedule from your booking system — click Generate for suggested sessions'}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Week navigator */}
            <div className="inline-flex items-center gap-1 rounded-lg" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <button onClick={() => handleWeekShift(-7)} className="p-2 hover:bg-black/5 rounded-l-lg" style={{ color: 'var(--t4)' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 text-sm font-medium min-w-[160px] text-center" style={{ color: 'var(--heading)' }}>
                {formatWeekRange(weekStart)}
              </div>
              <button onClick={() => handleWeekShift(7)} className="p-2 hover:bg-black/5 rounded-r-lg" style={{ color: 'var(--t4)' }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setWeekStart(toISODate(mondayOf(new Date())))}
              className="px-3 py-2 text-xs rounded-lg hover:bg-black/5"
              style={{ color: 'var(--t4)', border: '1px solid var(--card-border)' }}
            >
              This week
            </button>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
              style={{ background: '#8B5CF6', color: 'white' }}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {generating ? 'Generating…' : drafts.length > 0 ? 'Regenerate' : 'Generate'}
            </button>

            {drafts.length > 0 && (
              <button
                onClick={() => setShowClearSuggestionsModal(true)}
                disabled={clearDraftsMutation.isPending}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ color: '#B45309', border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)' }}
              >
                {clearDraftsMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                Clear suggestions
              </button>
            )}
          </div>
        </div>

        {/* Regenerate prompt */}
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: '#8B5CF6' }} />
          <input
            type="text"
            placeholder='Optional: "less open play, more drills on weekdays"'
            value={regeneratePrompt}
            onChange={(e) => setRegeneratePrompt(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
          />
          {lastGeneratedAt && (
            <span className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--t4)' }}>
              <Clock className="w-3 h-3" />
              Generated {timeSince(lastGeneratedAt)}
            </span>
          )}
        </div>
      </header>

      {/* [2] Transparency row ───────────────────────────────────────── */}
      {generationSummary && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#8B5CF6' }} />
          <div className="flex-1">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--heading)' }}>
              This schedule is based on
            </div>
            <div className="text-xs" style={{ color: 'var(--t3)' }}>
              <b>{generationSummary.monthsOfBookingData} months</b> of booking data ·{' '}
              <b>{generationSummary.preferencesCount}</b> member preferences ·{' '}
              <b>{generationSummary.unmetInterestRequests}</b> unmet interest requests ·{' '}
              <b>{generationSummary.activeCourts}</b> active courts.
            </div>
            {generationInsights.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs" style={{ color: 'var(--t4)' }}>
                {generationInsights.slice(0, 3).map((i, idx) => (
                  <li key={idx}>• {i}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* [3] Stats ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Calendar} label="Published sessions" value={stats.liveKept} color="#64748B" />
        <StatCard icon={Sparkles} label="Suggested sessions" value={stats.suggested} color="#8B5CF6" />
        <StatCard icon={AlertTriangle} label="Audience risks" value={stats.saturations} color="#F59E0B" />
        <StatCard icon={TrendingUp} label="Avg occupancy" value={`${stats.avgOccupancy}%`} color="#10B981" />
      </div>

      {/* Contact-policy preview badge */}
      {stats.suggested > 0 && contactPolicyBadge.poolKnown && (
        <div
          className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
          style={{
            background: contactPolicyBadge.safe ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.1)',
            border: `1px solid ${contactPolicyBadge.safe ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
            color: contactPolicyBadge.safe ? '#065F46' : '#B45309',
          }}
        >
          {contactPolicyBadge.safe ? <ShieldAlert className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          <span>
            At current invite caps, each of <b>{memberPool}</b> eligible member{memberPool === 1 ? '' : 's'} would see ~
            <b>{contactPolicyBadge.ratio.toFixed(1)}</b> invites this week
            {contactPolicyBadge.safe ? ' (safe)' : ' — review these suggestions carefully'}.
          </span>
        </div>
      )}

      {/* Generating overlay */}
      {generating && (
        <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <AILoadingAnimation />
        </div>
      )}

      {/* [4] Grid ───────────────────────────────────────────────────── */}
      {!generating && courts.length > 0 && (
        <ProgrammingGrid
          courts={courts}
          liveSessions={liveSessions}
          drafts={calendarDrafts}
          weekStartDate={weekStart}
          onSelectCell={setActiveCell}
        />
      )}

      {!generating && unplacedIdeas.length > 0 && (
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: 'var(--card-bg)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(245,158,11,0.12)' }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: '#F59E0B' }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                Unplaced ideas
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                These ideas could not be pinned to a court in the calendar.
                Open them to review the warning, then reassign or edit if you still want to use them.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {unplacedIdeas.map((draft) => {
              const warningText = draft.metadata?.warnings?.join(' ') || 'This idea could not be placed into the calendar as-is.'
              const courtName = draft.courtId ? courtNamesById.get(draft.courtId) : null
              return (
                <button
                  key={draft.id}
                  onClick={() => setActiveCell({ kind: 'draft', draft })}
                  className="w-full rounded-xl p-3 text-left transition-all hover:shadow-md"
                  style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.22)',
                  }}
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                        {draft.title}
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                        {draft.dayOfWeek} · {draft.startTime}–{draft.endTime}
                        {courtName ? ` · ${courtName}` : ' · No court assigned'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span
                        className="px-2 py-1 rounded-full font-medium"
                        style={{ background: 'rgba(139,92,246,0.12)', color: '#7C3AED' }}
                      >
                        {draft.confidence}% confidence
                      </span>
                      <span
                        className="px-2 py-1 rounded-full font-medium"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#047857' }}
                      >
                        {draft.projectedOccupancy}% occupancy
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-xs" style={{ color: '#B45309' }}>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{warningText}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <ProgrammingClearSuggestionsModal
        open={showClearSuggestionsModal}
        weekLabel={formatWeekRange(weekStart)}
        publishableCount={publishableDrafts.length}
        riskCount={riskDrafts.length}
        unplacedCount={unplacedIdeas.length}
        isPending={clearDraftsMutation.isPending}
        onClose={() => {
          if (clearDraftsMutation.isPending) return
          setShowClearSuggestionsModal(false)
        }}
        onConfirm={handleClearSuggestions}
      />

      {!generating && courts.length === 0 && !gridQuery.isLoading && (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--t4)' }} />
          <div className="text-sm font-medium" style={{ color: 'var(--heading)' }}>No courts configured</div>
          <div className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
            Add courts in Settings before generating a schedule.
          </div>
        </div>
      )}

      {/* [5] Cell popover ──────────────────────────────────────────── */}
      {activeCell && (
        <CellEditPopover
          selection={activeCell}
          courts={courts as any}
          onClose={() => setActiveCell(null)}
          onSave={handleSaveCell}
          saving={updateCellMutation.isPending}
        />
      )}
    </div>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: React.ReactNode
  color: string
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <div className="text-xs" style={{ color: 'var(--t4)' }}>{label}</div>
      </div>
      <div className="text-xl font-bold mt-1" style={{ color: 'var(--heading)' }}>{value}</div>
    </div>
  )
}

function ProgrammingClearSuggestionsModal({
  open,
  weekLabel,
  publishableCount,
  riskCount,
  unplacedCount,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean
  weekLabel: string
  publishableCount: number
  riskCount: number
  unplacedCount: number
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  if (!open) return null

  const summaryItems = [
    {
      label: 'Publish-ready suggestions',
      value: publishableCount,
      tone: 'violet',
    },
    {
      label: 'Backup ideas with audience risk',
      value: riskCount,
      tone: 'amber',
    },
    {
      label: 'Unplaced ideas',
      value: unplacedCount,
      tone: 'slate',
    },
  ] as const

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[rgba(6,10,24,0.78)] px-4 py-6 backdrop-blur-md"
      onClick={isPending ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-white/12 bg-[#0D1224]/95 shadow-[0_24px_80px_rgba(3,8,24,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent" />
        <div className="absolute -left-24 top-0 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em]"
                style={{
                  color: '#FDE68A',
                  borderColor: 'rgba(245,158,11,0.22)',
                  background: 'linear-gradient(135deg, rgba(180,83,9,0.18), rgba(124,58,237,0.14))',
                }}
              >
                <Trash2 className="h-3 w-3" />
                Draft Reset
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.22), rgba(239,68,68,0.18))',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Trash2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    Clear suggested sessions?
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    Remove all draft suggestions for <span className="text-white">{weekLabel}</span>.
                    Published sessions will stay in the calendar.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="grid gap-3 rounded-2xl border border-white/8 bg-[rgba(15,23,42,0.62)] p-4 sm:grid-cols-3"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
          >
            {summaryItems.map((item) => {
              const toneStyles = item.tone === 'violet'
                ? {
                    badgeBg: 'rgba(139,92,246,0.16)',
                    badgeColor: '#C4B5FD',
                  }
                : item.tone === 'amber'
                  ? {
                      badgeBg: 'rgba(245,158,11,0.16)',
                      badgeColor: '#FDE68A',
                    }
                  : {
                      badgeBg: 'rgba(148,163,184,0.14)',
                      badgeColor: '#CBD5E1',
                    }

              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/6 bg-black/10 p-4"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    {item.label}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-2xl font-semibold text-white">
                      {item.value}
                    </div>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        background: toneStyles.badgeBg,
                        color: toneStyles.badgeColor,
                      }}
                    >
                      {item.value === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div
            className="mt-4 rounded-2xl border border-amber-400/16 bg-[linear-gradient(135deg,rgba(120,53,15,0.18),rgba(76,29,149,0.12))] p-4"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
              <div className="text-sm leading-6 text-slate-200">
                This will remove publish-ready suggestions, backup ideas, and unplaced ideas for this week.
                You can generate a new draft immediately after clearing.
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #F97316, #EF4444)',
                boxShadow: '0 12px 30px rgba(239,68,68,0.22)',
              }}
            >
              <Trash2 className="h-4 w-4" />
              {isPending ? 'Clearing…' : 'Clear suggestions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function timeSince(d: Date): string {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
