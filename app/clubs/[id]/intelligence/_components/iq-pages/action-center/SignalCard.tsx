'use client'

/**
 * SignalCard — single operational signal tile for Action Center.
 *
 * Spec: DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.3.
 *
 * Renders one OperationalSignal with severity bar, source tag,
 * subject + context summary, and the canon UnifiedAction (primary +
 * optional secondaries). Reuses the BusinessInsightCard interaction
 * pattern so an operator switching between Dashboard insights and
 * Action Center signals doesn't have to relearn the chrome.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock,
  X,
  ChevronDown,
  ExternalLink,
  MoreHorizontal,
  Activity,
  CreditCard,
  ClipboardCheck,
  Calendar,
  Shield,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'

export interface OperationalSignalRow {
  id: string
  dedupeKey: string
  source:
    | 'member_health'
    | 'membership_lifecycle'
    | 'scorecard_execution'
    | 'league_gap'
    | 'vip_at_risk'
  ruleKey: string
  subjectEntityId: string | null
  severity: 'critical' | 'warning' | 'nudge'
  subject: string
  context: Record<string, any>
  action: {
    primary:
      | { type: 'create_cohort'; label: string; cohortRules: unknown[]; draftId?: string }
      | { type: 'create_campaign'; label: string; templateKey: string; cohortRef?: string; draftId?: string }
      | { type: 'programming'; label: string; params: Record<string, unknown>; draftId?: string }
      | { type: 'cr_api_direct'; label: string; endpoint: string; payload: Record<string, unknown>; requiresConfirmation: boolean }
      | { type: 'advice'; label: string }
    secondary?: Array<OperationalSignalRow['action']['primary']>
  }
  status: 'active' | 'snoozed' | 'resolved' | 'dismissed'
  locationId: string | null
  createdAt: string
  lastSeenAt: string
  resolvedAt: string | null
  snoozeUntil: string | null
}

interface Props {
  signal: OperationalSignalRow
  clubId: string
  onResolve: (reason: 'manual' | 'dismissed' | 'snoozed', snoozeUntil?: Date) => void
}

const SOURCE_META: Record<
  OperationalSignalRow['source'],
  { icon: typeof Activity; tint: string; tintBg: string; label: string }
> = {
  member_health: {
    icon: Activity,
    tint: '#A78BFA',
    tintBg: 'rgba(139,92,246,0.08)',
    label: 'Member health',
  },
  membership_lifecycle: {
    icon: CreditCard,
    tint: '#60A5FA',
    tintBg: 'rgba(59,130,246,0.08)',
    label: 'Lifecycle',
  },
  scorecard_execution: {
    icon: ClipboardCheck,
    tint: '#34D399',
    tintBg: 'rgba(16,185,129,0.08)',
    label: 'Scorecard',
  },
  league_gap: {
    icon: Calendar,
    tint: '#FBBF24',
    tintBg: 'rgba(251,191,36,0.08)',
    label: 'League gap',
  },
  vip_at_risk: {
    icon: Shield,
    tint: '#F87171',
    tintBg: 'rgba(239,68,68,0.08)',
    label: 'VIP at risk',
  },
}

const SEVERITY_DOT: Record<OperationalSignalRow['severity'], string> = {
  critical: '#F87171',
  warning: '#FBBF24',
  nudge: '#60A5FA',
}

export function SignalCard({ signal, clubId, onResolve }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  // Same draft-creating mutations as BusinessInsightCard — Action
  // Center actions follow the same deeplink pattern (Spec §8.1).
  const cohortDraftM = trpc.intelligence.createCohortDraft.useMutation()
  const campaignDraftM = trpc.intelligence.createCampaignDraft.useMutation()
  const programmingDraftM = trpc.intelligence.createProgrammingDraft.useMutation()

  const meta = SOURCE_META[signal.source]
  const Icon = meta.icon

  const runAction = async (a: OperationalSignalRow['action']['primary']) => {
    switch (a.type) {
      case 'create_cohort': {
        const { draftId } = await cohortDraftM.mutateAsync({
          clubId,
          filters: a.cohortRules as any,
          sourceInsightId: signal.id,
        })
        router.push(`/clubs/${clubId}/intelligence/cohorts?draftId=${draftId}`)
        return
      }
      case 'create_campaign': {
        const { draftId } = await campaignDraftM.mutateAsync({
          clubId,
          templateKey: a.templateKey,
          cohortRef: a.cohortRef,
          sourceInsightId: signal.id,
        })
        router.push(`/clubs/${clubId}/intelligence/campaigns?draftId=${draftId}`)
        return
      }
      case 'programming': {
        const { draftId } = await programmingDraftM.mutateAsync({
          clubId,
          prefill: a.params,
          sourceInsightId: signal.id,
        })
        router.push(`/clubs/${clubId}/intelligence/programming?draftId=${draftId}`)
        return
      }
      case 'cr_api_direct':
        // Direct CR write confirmation modal — Step 15 (this) drops a
        // stub that mirrors BusinessInsightCard. The real modal ships
        // when the first cr_api_direct generator goes live (Step 16:
        // suspendedWinback reactivate, etc.).
        // eslint-disable-next-line no-alert
        alert(
          `Direct CR write: ${a.label}\n\nEndpoint: ${a.endpoint}\n\n` +
            'Confirmation modal lands in a follow-up commit. For now this ' +
            'is a click-through stub so signal handlers can wire up safely.',
        )
        return
      case 'advice':
        onResolve('manual')
        return
    }
  }

  const handlePrimary = () => {
    void runAction(signal.action.primary)
  }
  const isAdvice = signal.action.primary.type === 'advice'

  return (
    <div
      className="rounded-xl p-4 relative"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div
        className="absolute top-3 left-0 bottom-3 w-[3px] rounded-r"
        style={{ background: SEVERITY_DOT[signal.severity] }}
      />

      <div className="pl-2">
        <div className="flex items-start gap-2 mb-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: meta.tintBg }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: meta.tint }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="text-[10px] uppercase tracking-wide font-semibold"
                style={{ color: meta.tint }}
              >
                {meta.label}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: SEVERITY_DOT[signal.severity] }}
                title={signal.severity}
              />
              <span
                className="text-[10px] uppercase tracking-wide"
                style={{ color: 'var(--t4)' }}
              >
                {signal.severity}
              </span>
              {signal.status === 'snoozed' && (
                <span
                  className="flex items-center gap-1 text-[10px]"
                  style={{ color: 'var(--t4)' }}
                >
                  <Clock className="w-3 h-3" />
                  snoozed
                </span>
              )}
            </div>
            <p
              className="text-sm leading-snug mt-0.5"
              style={{ color: 'var(--heading)', fontWeight: 600 }}
            >
              {signal.subject}
            </p>
          </div>

          {/* ⋯ menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="p-1 rounded hover:bg-white/5"
              style={{ color: 'var(--t4)' }}
              aria-label="Actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg py-1 z-10 min-w-[160px]"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                  style={{ color: 'var(--t3)' }}
                  onClick={() => {
                    setMenuOpen(false)
                    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    onResolve('snoozed', until)
                  }}
                >
                  <Clock className="w-3.5 h-3.5" /> Snooze 7 days
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                  style={{ color: 'var(--t3)' }}
                  onClick={() => {
                    setMenuOpen(false)
                    onResolve('dismissed')
                  }}
                >
                  <X className="w-3.5 h-3.5" /> Dismiss
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                  style={{ color: 'var(--t3)' }}
                  onClick={() => {
                    setMenuOpen(false)
                    handlePrimary()
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in source
                </button>
                {/* Programming Health cross-link — only for signals that
                    originate from the weekly scorecard backend (execution
                    check failures + league gap detection). Per
                    DASHBOARD_AND_ACTION_CENTER_SPEC.md v1.2 §9.3:
                    Action Center → Programming Health for context, where
                    the operator can see the full weekly breakdown that
                    surfaced this signal. */}
                {(signal.source === 'scorecard_execution' ||
                  signal.source === 'league_gap') && (
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                    style={{ color: 'var(--t3)' }}
                    onClick={() => {
                      setMenuOpen(false)
                      router.push(`/clubs/${clubId}/intelligence/scorecard`)
                    }}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" /> View in Programming Health
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Context details — render top-level scalar values as compact pills */}
        {signal.context && Object.keys(signal.context).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 pl-9">
            {Object.entries(signal.context)
              .filter(([_, v]) => typeof v === 'string' || typeof v === 'number')
              .slice(0, 6)
              .map(([k, v]) => (
                <span
                  key={k}
                  className="text-[10px] px-2 py-0.5 rounded-md"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--t4)',
                  }}
                >
                  {k}: <span style={{ color: 'var(--t2)', fontWeight: 600 }}>{String(v)}</span>
                </span>
              ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pl-9">
          {!isAdvice && (
            <button
              type="button"
              onClick={handlePrimary}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{
                background: meta.tintBg,
                color: meta.tint,
                border: `1px solid ${meta.tint}40`,
              }}
            >
              {signal.action.primary.label}
            </button>
          )}
          {isAdvice && (
            <button
              type="button"
              onClick={handlePrimary}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--t3)',
                border: '1px solid var(--card-border)',
              }}
            >
              Got it
            </button>
          )}

          {signal.action.secondary && signal.action.secondary.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSecondaryOpen(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--t3)',
                  border: '1px solid var(--card-border)',
                }}
              >
                More <ChevronDown className="w-3 h-3" />
              </button>
              {secondaryOpen && (
                <div
                  className="absolute left-0 top-full mt-1 rounded-lg py-1 z-10 min-w-[200px]"
                  style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--card-border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  {signal.action.secondary.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      className="block w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                      style={{ color: 'var(--t3)' }}
                      onClick={() => {
                        setSecondaryOpen(false)
                        void runAction(a)
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
