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
 *   [6] Sticky footer  — Approve Selected · Publish · Clear.
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
  ShieldAlert, Users, TrendingUp, AlertTriangle, CheckCheck, Send,
  Loader2, Info, Clock,
} from 'lucide-react'
import {
  useProgrammingScheduleGrid,
  useGenerateProgrammingSchedule,
  useUpdateProgrammingGridCell,
  useBulkApproveProgrammingGrid,
  usePublishProgrammingGrid,
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

// ── Component ────────────────────────────────────────────────────────

interface ProgrammingIQProps {
  clubId: string
}

export function ProgrammingIQ({ clubId }: ProgrammingIQProps) {
  const isDemo = useIsDemo()
  const [weekStart, setWeekStart] = useState<string>(() => toISODate(mondayOf(new Date())))
  const [regeneratePrompt, setRegeneratePrompt] = useState('')
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set())
  const [activeCell, setActiveCell] = useState<GridSelection | null>(null)
  const [generating, setGenerating] = useState(false)
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
  const bulkApproveMutation = useBulkApproveProgrammingGrid()
  const publishMutation = usePublishProgrammingGrid()

  const gridData = gridQuery.data
  // Memoize the derived slices so downstream hooks (stats, grid) don't
  // re-run on every parent render — gridData itself is stable per query
  // fetch but `??` builds fresh empty arrays each time.
  const courts = useMemo(() => (gridData?.courts ?? []) as any[], [gridData])
  const liveSessions = useMemo(() => (gridData?.liveSessions ?? []) as any[], [gridData])
  const drafts = useMemo(() => ((gridData?.drafts ?? []) as any[]) as GridDraft[], [gridData])

  // Stats derived from the current grid. We keep these here (not in a
  // tRPC call) so switching weeks updates instantly without a round-trip.
  const stats = useMemo(() => {
    const suggested = drafts.length
    const liveKept = liveSessions.length
    const saturations = drafts.filter((d) => (d.metadata?.warnings?.length || 0) > 0).length
    const avgOccupancy = drafts.length === 0
      ? 0
      : Math.round(drafts.reduce((s, d) => s + (d.projectedOccupancy || 0), 0) / drafts.length)
    const totalInvites = drafts.reduce((s, d) => s + Math.ceil((d.maxPlayers || 8) * 1.5), 0)
    return { suggested, liveKept, saturations, avgOccupancy, totalInvites }
  }, [drafts, liveSessions])

  // Contact-policy preview: a rough "will admins spam their members?"
  // check. 3 invites/wk/member is the slot-filler default; the real
  // policy per club lives in automationSettings. MVP: show the ratio
  // informationally, hard-gate later.
  const contactPolicyBadge = useMemo(() => {
    const MEMBER_POOL = 127 // surfaced from dashboard if available; placeholder here
    const perMemberInvites = stats.totalInvites / Math.max(1, MEMBER_POOL)
    return {
      ratio: perMemberInvites,
      safe: perMemberInvites <= 3,
    }
  }, [stats.totalInvites])

  // ── Actions ──

  const handleGenerate = async () => {
    setGenerating(true)
    setSelectedDraftIds(new Set())
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
    setSelectedDraftIds(new Set())
    setActiveCell(null)
  }

  const handleToggleSelect = (draftId: string) => {
    setSelectedDraftIds((prev) => {
      const next = new Set(prev)
      if (next.has(draftId)) next.delete(draftId)
      else next.add(draftId)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedDraftIds.size === drafts.length) {
      setSelectedDraftIds(new Set())
    } else {
      setSelectedDraftIds(new Set(drafts.map((d) => d.id)))
    }
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

  const handlePublish = async () => {
    const ids = Array.from(selectedDraftIds)
    if (ids.length === 0) return
    // Step 1: bulk-approve (READY_FOR_OPS → SESSION_DRAFT).
    await new Promise((resolve) => {
      (bulkApproveMutation as any).mutate({ clubId, draftIds: ids }, { onSuccess: resolve, onError: resolve })
    })
    // Step 2: publish SESSION_DRAFT → PlaySession.
    ;(publishMutation as any).mutate(
      { clubId, draftIds: ids, weekStartDate: weekStart },
      {
        onSuccess: async (result: any) => {
          if (result?.counts?.published > 0) {
            setSelectedDraftIds(new Set())
            if ('refetch' in gridQuery) await (gridQuery as any).refetch?.()
          }
        },
      },
    )
  }

  // Reset draft preview state when switching to a week that hasn't been
  // generated yet — don't keep a prior run's stats.
  useEffect(() => {
    setSelectedDraftIds(new Set())
    setActiveCell(null)
  }, [weekStart])

  return (
    <div className="space-y-5 pb-24">
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
                AI-generated weekly schedule, defended by 7 demand signals
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
        <StatCard icon={Calendar} label="Live kept" value={stats.liveKept} color="#3B82F6" />
        <StatCard icon={Sparkles} label="New suggestions" value={stats.suggested} color="#8B5CF6" />
        <StatCard icon={AlertTriangle} label="Saturation flags" value={stats.saturations} color="#F59E0B" />
        <StatCard icon={TrendingUp} label="Avg occupancy" value={`${stats.avgOccupancy}%`} color="#10B981" />
      </div>

      {/* Contact-policy preview badge */}
      {stats.suggested > 0 && (
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
            At current invite caps, each eligible member would see ~
            <b>{contactPolicyBadge.ratio.toFixed(1)}</b> invites this week
            {contactPolicyBadge.safe ? ' (safe)' : ' — review before publishing'}.
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
          drafts={drafts}
          weekStartDate={weekStart}
          selectedDraftIds={selectedDraftIds}
          onToggleSelect={handleToggleSelect}
          onSelectCell={setActiveCell}
        />
      )}

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

      {/* [6] Sticky footer ─────────────────────────────────────────── */}
      {drafts.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 md:left-auto md:right-4 md:bottom-4 md:rounded-2xl md:max-w-xl mx-auto px-4 py-3 shadow-lg z-40"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-black/5"
              style={{ color: 'var(--t3)', border: '1px solid var(--card-border)' }}
            >
              {selectedDraftIds.size === drafts.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-xs" style={{ color: 'var(--t4)' }}>
              {selectedDraftIds.size} of {drafts.length} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handlePublish}
                disabled={selectedDraftIds.size === 0 || publishMutation.isPending || bulkApproveMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
                style={{ background: '#10B981', color: 'white' }}
              >
                {publishMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
                Publish {selectedDraftIds.size > 0 ? `(${selectedDraftIds.size})` : ''}
              </button>
            </div>
          </div>
        </div>
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
