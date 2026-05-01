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
  Loader2, Info, Clock, Trash2, X, SlidersHorizontal, CheckCircle2, ChevronDown, HelpCircle,
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
import {
  getProgrammingStrategyPresets,
  type ProgrammingAppliedPreset,
  type ProgrammingStrategyPresetId,
} from '@/lib/ai/programming-iq-strategy'

// ── Helpers ───────────────────────────────────────────────────────────

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toLocalISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatWeekRange(weekStart: string): string {
  const s = fromISODate(weekStart)
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

interface ProgrammingGenerationSummary {
  appliedPresets: ProgrammingAppliedPreset[]
  requestPriorityNote: string | null
  requestSummary: {
    requestedIdeas: number
    placed: number
    backup: number
    unplaced: number
    overallVerdict: string | null
    overallSummary: string | null
  } | null
  improvements: string[]
  changes: string[]
}

export function ProgrammingIQ({ clubId }: ProgrammingIQProps) {
  const strategyPresets = useMemo(() => getProgrammingStrategyPresets(), [])
  const isDemo = useIsDemo()
  const [weekStart, setWeekStart] = useState<string>(() => toLocalISODate(mondayOf(new Date())))
  const [regeneratePrompt, setRegeneratePrompt] = useState('')
  const [selectedPresetIds, setSelectedPresetIds] = useState<ProgrammingStrategyPresetId[]>([])
  const [prioritizeRequest, setPrioritizeRequest] = useState(false)
  const [showStrategyPanel, setShowStrategyPanel] = useState(false)
  const [activeCell, setActiveCell] = useState<GridSelection | null>(null)
  const [generating, setGenerating] = useState(false)
  const [showClearSuggestionsModal, setShowClearSuggestionsModal] = useState(false)
  const [showGenerationSummaryPanel, setShowGenerationSummaryPanel] = useState(false)
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null)
  const [generationInsights, setGenerationInsights] = useState<string[]>([])
  const [generationSummary, setGenerationSummary] = useState<{
    monthsOfBookingData: number
    preferencesCount: number
    unmetInterestRequests: number
    activeCourts: number
  } | null>(null)
  const [generationOutcomeSummary, setGenerationOutcomeSummary] = useState<ProgrammingGenerationSummary | null>(null)

  const gridQuery = useProgrammingScheduleGrid(clubId, weekStart)
  const generateMutation = useGenerateProgrammingSchedule()
  const updateCellMutation = useUpdateProgrammingGridCell()
  const clearDraftsMutation = useClearProgrammingScheduleDrafts()

  const gridData = gridQuery.data
  const clubTimezone = (gridData as any)?.timezone || 'America/New_York'
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
  const strategySummaryText = useMemo(() => {
    const parts: string[] = []
    if (selectedPresetIds.length > 0) {
      parts.push(
        `${selectedPresetIds.length} priorit${selectedPresetIds.length === 1 ? 'y' : 'ies'} selected`,
      )
    } else {
      parts.push('Auto mode')
    }
    if (regeneratePrompt.trim()) {
      parts.push(prioritizeRequest ? 'Priority request enabled' : 'Request will be scored normally')
    }
    return parts.join(' · ')
  }, [prioritizeRequest, regeneratePrompt, selectedPresetIds.length])

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
              selectedPresetIds,
              prioritizeRequest: regeneratePrompt.trim() ? prioritizeRequest : false,
            })
            .then(resolve)
            .catch(reject)
        } else {
          mutation.mutate(
            {
              clubId,
              weekStartDate: weekStart,
              regeneratePrompt: regeneratePrompt.trim() || undefined,
              selectedPresetIds,
              prioritizeRequest: regeneratePrompt.trim() ? prioritizeRequest : false,
            },
            { onSuccess: resolve, onError: reject },
          )
        }
      })
      setLastGeneratedAt(new Date())
      setGenerationInsights(result?.insights || [])
      setGenerationSummary(result?.signalSummary || null)
      setGenerationOutcomeSummary(result?.summary || null)
      setShowGenerationSummaryPanel(Boolean(result?.summary))
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
    const d = fromISODate(weekStart)
    d.setDate(d.getDate() + days)
    setWeekStart(toLocalISODate(mondayOf(d)))
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

  const togglePreset = (presetId: ProgrammingStrategyPresetId) => {
    setSelectedPresetIds((current) => {
      if (current.includes(presetId)) {
        return current.filter((id) => id !== presetId)
      }
      return [...current, presetId]
    })
  }

  // Reset draft preview state when switching to a week that hasn't been
  // generated yet — don't keep a prior run's stats.
  useEffect(() => {
    setActiveCell(null)
  }, [weekStart])

  useEffect(() => {
    if (!regeneratePrompt.trim()) {
      setPrioritizeRequest(false)
    }
  }, [regeneratePrompt])

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
              onClick={() => setWeekStart(toLocalISODate(mondayOf(new Date())))}
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

        {regeneratePrompt.trim() && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
            style={{
              background: 'rgba(15,23,42,0.22)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium" style={{ color: 'var(--heading)' }}>
                  Treat this request as a priority
                </div>
                <div className="group relative">
                  <div
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--t4)' }}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </div>
                  <div
                    className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-10 w-64 -translate-x-1/2 rounded-xl px-3 py-2 text-xs leading-5 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100"
                    style={{
                      background: 'rgba(15,23,42,0.96)',
                      border: '1px solid rgba(148,163,184,0.18)',
                      color: '#CBD5E1',
                    }}
                  >
                    This boosts ideas that match your typed request. It does not change the overall weekly strategy by itself.
                  </div>
                </div>
              </div>
              <div className="text-xs mt-1 leading-5" style={{ color: 'var(--t4)' }}>
                Push request-matching ideas higher before the rest of the weekly ranking.
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={prioritizeRequest}
              aria-label="Treat this request as a priority"
              onClick={() => setPrioritizeRequest((current) => !current)}
              className="relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors"
              style={{
                background: prioritizeRequest ? '#10B981' : 'rgba(148,163,184,0.28)',
                boxShadow: prioritizeRequest ? '0 0 0 1px rgba(16,185,129,0.22)' : 'inset 0 0 0 1px rgba(148,163,184,0.12)',
              }}
            >
              <span
                className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                style={{
                  transform: prioritizeRequest ? 'translateX(26px)' : 'translateX(3px)',
                  boxShadow: '0 4px 10px rgba(15,23,42,0.22)',
                }}
              />
            </button>
          </div>
        )}

        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <button
            type="button"
            onClick={() => setShowStrategyPanel((current) => !current)}
            className="w-full flex items-start gap-3 text-left"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(139,92,246,0.12)' }}
            >
              <SlidersHorizontal className="w-5 h-5" style={{ color: '#8B5CF6' }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                    Strategy priorities
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                    {strategySummaryText}
                  </div>
                </div>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(148,163,184,0.14)',
                    transform: showStrategyPanel ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--t4)' }} />
                </div>
              </div>
            </div>
          </button>

          {showStrategyPanel && (
            <div className="space-y-4 pt-1">
              <div className="text-xs" style={{ color: 'var(--t4)' }}>
                Choose any priorities you want to emphasize, or leave them empty for Auto mode.
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {strategyPresets.map((preset) => {
                  const selected = selectedPresetIds.includes(preset.id)
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => togglePreset(preset.id)}
                      className="rounded-2xl p-3 text-left transition-all"
                      style={{
                        background: selected ? 'rgba(139,92,246,0.12)' : 'rgba(15,23,42,0.32)',
                        border: selected
                          ? '1px solid rgba(139,92,246,0.38)'
                          : '1px solid rgba(148,163,184,0.18)',
                        boxShadow: selected ? '0 10px 28px rgba(139,92,246,0.12)' : 'none',
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0"
                          style={{
                            borderColor: selected ? 'rgba(139,92,246,0.55)' : 'rgba(148,163,184,0.28)',
                            background: selected ? 'rgba(139,92,246,0.18)' : 'transparent',
                          }}
                        >
                          {selected && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#8B5CF6' }} />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium" style={{ color: 'var(--heading)' }}>
                            {preset.label}
                          </div>
                          <div className="text-xs mt-1 leading-5" style={{ color: 'var(--t4)' }}>
                            {preset.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

            </div>
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

      {!generating && generationOutcomeSummary && (
        <ProgrammingGenerationSummaryPanel
          open={showGenerationSummaryPanel}
          prompt={regeneratePrompt.trim()}
          summary={generationOutcomeSummary}
          onToggle={() => setShowGenerationSummaryPanel((current) => !current)}
        />
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
        timezone={clubTimezone}
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

function ProgrammingGenerationSummaryPanel({
  open,
  prompt,
  summary,
  onToggle,
}: {
  open: boolean
  prompt: string
  summary: ProgrammingGenerationSummary | null
  onToggle: () => void
}) {
  if (!summary) return null

  return (
    <div
      className="rounded-2xl border border-white/8 bg-[#0D1224]/70 shadow-[0_12px_40px_rgba(3,8,24,0.18)] overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.12))',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Latest refresh summary</div>
              <div className="mt-1 text-xs text-slate-400">
                {summary.changes.length} changes · {summary.improvements.length} improvements
                {summary.requestSummary ? ` · ${summary.requestSummary.requestedIdeas} requested ideas reviewed` : ''}
              </div>
              {prompt && (
                <div
                  className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-violet-400/18 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100"
                >
                  <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                  <span className="truncate">Request: {prompt}</span>
                </div>
              )}
            </div>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148,163,184,0.14)',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <ChevronDown className="w-4 h-4" style={{ color: '#CBD5E1' }} />
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <section
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="text-sm font-semibold text-white">Applied priorities</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {summary.appliedPresets.length > 0 ? summary.appliedPresets.map((preset) => (
                    <div
                      key={`${preset.source}-${preset.id}`}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{preset.label}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: preset.source === 'selected' ? 'rgba(139,92,246,0.18)' : 'rgba(59,130,246,0.16)',
                            color: preset.source === 'selected' ? '#C4B5FD' : '#BFDBFE',
                          }}
                        >
                          {preset.source === 'selected' ? 'Selected' : 'Inferred'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-400">
                        {preset.description}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                      Auto mode balanced the week without any explicit priorities.
                    </div>
                  )}
                </div>
                {summary.requestPriorityNote && (
                  <div className="mt-3 text-xs leading-5 text-slate-400">
                    {summary.requestPriorityNote}
                  </div>
                )}
              </section>

              <section
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="text-sm font-semibold text-white">What improved</div>
                <div className="mt-3 space-y-2">
                  {summary.improvements.length > 0 ? summary.improvements.map((item, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm text-slate-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                      <span>{item}</span>
                    </div>
                  )) : (
                    <div className="text-sm text-slate-400">No improvement summary recorded for this run.</div>
                  )}
                </div>
              </section>

              <section
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="text-sm font-semibold text-white">What changed</div>
                <div className="mt-3 space-y-2">
                  {summary.changes.length > 0 ? summary.changes.map((item, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />
                      <span>{item}</span>
                    </div>
                  )) : (
                    <div className="text-sm text-slate-400">No schedule changes were summarized.</div>
                  )}
                </div>
              </section>
            </div>

            <section
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
            >
              <div className="text-sm font-semibold text-white">Request evaluation</div>
              {summary.requestSummary ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SummaryBadge label="Requested" value={summary.requestSummary.requestedIdeas} tone="neutral" />
                    <SummaryBadge label="Placed" value={summary.requestSummary.placed} tone="good" />
                    <SummaryBadge label="Backup" value={summary.requestSummary.backup} tone="warn" />
                    <SummaryBadge label="Unplaced" value={summary.requestSummary.unplaced} tone="neutral" />
                  </div>

                  <div
                    className="mt-4 rounded-2xl border px-4 py-3"
                    style={getVerdictContainerStyle(summary.requestSummary.overallVerdict)}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: getVerdictAccent(summary.requestSummary.overallVerdict) }}>
                      Overall verdict
                    </div>
                    <div className="mt-1 text-base font-semibold text-white">
                      {summary.requestSummary.overallVerdict || 'Request evaluated'}
                    </div>
                    {summary.requestSummary.overallSummary && (
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        {summary.requestSummary.overallSummary}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm leading-6 text-slate-400">
                  No direct admin request was evaluated in this refresh.
                </div>
              )}
            </section>
          </div>
        </div>
      )}
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

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[rgba(6,10,24,0.78)] px-4 py-6 backdrop-blur-md"
      onClick={isPending ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/6 bg-[#0D1224]/95 shadow-[0_18px_60px_rgba(3,8,24,0.42)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -left-24 top-0 h-48 w-48 rounded-full bg-cyan-400/8 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-56 w-56 rounded-full bg-violet-500/8 blur-3xl" />

        <div className="relative p-6 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(239,68,68,0.14))',
                    border: '1px solid rgba(255,255,255,0.06)',
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

          <div className="space-y-2 text-sm leading-6 text-slate-300">
            <p>
              This will remove <span className="text-white">{publishableCount}</span> suggested session{publishableCount === 1 ? '' : 's'},
              <span className="text-white"> {riskCount}</span> backup idea{riskCount === 1 ? '' : 's'},
              and <span className="text-white"> {unplacedCount}</span> unplaced idea{unplacedCount === 1 ? '' : 's'} for this week.
            </p>
            <p className="text-slate-400">
              You can generate a fresh draft immediately after clearing.
            </p>
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

function SummaryBadge({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'good' | 'warn'
}) {
  const styles =
    tone === 'good'
      ? { background: 'rgba(16,185,129,0.12)', color: '#A7F3D0' }
      : tone === 'warn'
        ? { background: 'rgba(245,158,11,0.12)', color: '#FCD34D' }
        : { background: 'rgba(148,163,184,0.12)', color: '#CBD5E1' }

  return (
    <div
      className="rounded-2xl px-3 py-2 text-sm"
      style={styles}
    >
      <span className="font-semibold">{value}</span>{' '}
      <span className="opacity-90">{label}</span>
    </div>
  )
}

function getVerdictAccent(verdict: string | null) {
  switch (verdict) {
    case 'Strong fit':
      return '#34D399'
    case 'Viable with risks':
      return '#FBBF24'
    case 'Weak idea':
      return '#F59E0B'
    case 'Not recommended':
      return '#F87171'
    default:
      return '#A78BFA'
  }
}

function getVerdictContainerStyle(verdict: string | null): React.CSSProperties {
  switch (verdict) {
    case 'Strong fit':
      return {
        background: 'rgba(16,185,129,0.10)',
        borderColor: 'rgba(16,185,129,0.22)',
      }
    case 'Viable with risks':
      return {
        background: 'rgba(245,158,11,0.10)',
        borderColor: 'rgba(245,158,11,0.22)',
      }
    case 'Weak idea':
      return {
        background: 'rgba(249,115,22,0.10)',
        borderColor: 'rgba(249,115,22,0.22)',
      }
    case 'Not recommended':
      return {
        background: 'rgba(239,68,68,0.10)',
        borderColor: 'rgba(239,68,68,0.22)',
      }
    default:
      return {
        background: 'rgba(139,92,246,0.10)',
        borderColor: 'rgba(139,92,246,0.22)',
      }
  }
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
