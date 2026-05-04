'use client'

/**
 * Campaign Wizard — P4-T1.
 *
 * 4-step drawer rendered from CampaignsIQ when "+ New Campaign" is
 * clicked. State is held here and passed down to each step.
 *
 * NOTE: real Launch wiring (creating a Campaign DB row + queueing
 * sends) is gated by Live Mode. v1 ships the UX flow; the actual
 * submit path lands alongside the Campaign model in P5-T2.
 */

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { useListCohorts, useSuggestedCohorts, useIntelligenceSettings } from '../../_hooks/use-intelligence'
import { Step1Audience } from './Step1Audience'
import { Step2Goal } from './Step2Goal'
import { Step3Schedule } from './Step3Schedule'
import { Step4Message } from './Step4Message'
import { EMPTY_WIZARD_STATE, type WizardStep, type WizardState, type AudienceSelection, type CampaignGoal, type MessageDraft, type ScheduleSettings } from './types'

interface CampaignWizardProps {
  clubId: string
  /** Open from Members bulk-select with hand-picked userIds. */
  initialUserIds?: string[]
  /** Open from "Save + Create campaign" with a freshly-saved cohort. */
  initialCohortId?: string | null
  /** Open from AI-Suggested card with a generated cohort already chosen. */
  initialSuggestedCohort?: AudienceSelection | null
  /** Pre-fill the Goal step (e.g. AI-Recommended card → reactivate_dormant). */
  initialGoal?: CampaignGoal | null
  onClose: () => void
}

// P2-T9: reorder. Format/Schedule moved BEFORE Message so the message
// editor in Step 4 can render the right number of slots (one for One-time,
// N for Sequence, etc.) once those formats ship.
const STEPS: Array<{ n: WizardStep; label: string }> = [
  { n: 1, label: 'Audience' },
  { n: 2, label: 'Goal' },
  { n: 3, label: 'Schedule' },
  { n: 4, label: 'Message' },
]

export function CampaignWizard({
  clubId,
  initialUserIds,
  initialCohortId,
  initialSuggestedCohort,
  initialGoal,
  onClose,
}: CampaignWizardProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [state, setState] = useState<WizardState>(EMPTY_WIZARD_STATE)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  // Data needed by Step 1 (audience picker)
  const { data: savedCohortsRaw = [] } = useListCohorts(clubId)
  const { data: suggestedCohortsRaw = [] } = useSuggestedCohorts(clubId)
  const { data: settingsData } = useIntelligenceSettings(clubId)
  const liveMode = (settingsData?.settings?.controlPlane?.actions?.outreachSend?.mode ?? 'shadow') as 'disabled' | 'shadow' | 'live'

  const savedCohorts = useMemo(() =>
    (savedCohortsRaw as any[]).map((c) => ({
      id: c.id, name: c.name, memberCount: c.memberCount ?? 0,
    })),
    [savedCohortsRaw]
  )
  const suggestedCohorts = useMemo(() =>
    (suggestedCohortsRaw as any[]).map((c) => ({
      id: c.id, name: c.name, memberCount: c.memberCount ?? 0,
      userIds: c.userIds ?? [], emoji: c.emoji, description: c.description,
    })),
    [suggestedCohortsRaw]
  )

  // Hydrate from initial* props on mount
  useEffect(() => {
    if (initialSuggestedCohort) {
      setState((s) => ({ ...s, audience: initialSuggestedCohort }))
    } else if (initialCohortId) {
      const match = savedCohorts.find((c) => c.id === initialCohortId)
      if (match) {
        setState((s) => ({ ...s, audience: { kind: 'saved_cohort', cohortId: match.id, cohortName: match.name, userIds: [], memberCount: match.memberCount } }))
      }
    } else if (initialUserIds?.length) {
      setState((s) => ({ ...s, audience: { kind: 'inline_userIds', cohortId: null, cohortName: `Hand-picked (${initialUserIds.length})`, userIds: initialUserIds, memberCount: initialUserIds.length } }))
    }
    if (initialGoal) {
      setState((s) => ({ ...s, goal: initialGoal }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCohorts.length])

  const canAdvance = (() => {
    if (step === 1) return !!state.audience
    if (step === 2) return !!state.goal
    // Step 3 (Schedule): always advanceable — defaults are valid (one_time, send now, email).
    if (step === 3) return true
    // Step 4 (Message) is final — Launch button is in-step, no Next.
    return false
  })()

  const next = () => setStep((s) => (s < 4 ? ((s + 1) as WizardStep) : s))
  const prev = () => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))

  // Esc closes (with confirm if dirty)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false)
          return
        }
        tryClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDiscardConfirm, state])

  const isDirty = !!state.audience || !!state.goal || !!state.message.subject || !!state.message.body
  const tryClose = () => {
    if (!isDirty || launched) {
      onClose()
      return
    }
    setShowDiscardConfirm(true)
  }

  // Launch — Priority-1.1: writes a real Campaign row via launchCampaign
  // mutation. Send fan-out happens in the campaign-sends cron (Priority-1.2).
  const utils = trpc.useUtils()
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchResult, setLaunchResult] = useState<{ recipientCount: number; status: string } | null>(null)
  const launchMutation = trpc.intelligence.launchCampaign.useMutation({
    onSuccess: (res: any) => {
      setLaunchError(null)
      setLaunchResult({ recipientCount: res.recipientCount, status: res.status })
      setLaunched(true)
      // Refresh Active Campaigns so the new row shows up immediately.
      utils.intelligence.listActiveCampaigns.invalidate({ clubId }).catch(() => {})
    },
    onError: (err: any) => {
      setLaunchError(err?.message || 'Launch failed — try again or check Live Mode in Settings → Automation.')
    },
  })

  const handleLaunch = async () => {
    if (liveMode !== 'live') return
    if (!state.audience || !state.goal) return
    setIsLaunching(true)
    try {
      // Build audience input. cohortId wins if available; otherwise use the
      // hand-picked userIds list.
      const cohortId = state.audience.cohortId
      const userIds = !cohortId ? state.audience.userIds : undefined
      launchMutation.mutate({
        clubId,
        name: `${state.goal.replace(/_/g, ' ')} · ${new Date().toLocaleDateString()}`,
        goal: state.goal,
        subject: state.message.subject.trim(),
        body: state.message.body.trim(),
        channels: [
          ...(state.schedule.channels.email ? ['email' as const] : []),
          ...(state.schedule.channels.sms ? ['sms' as const] : []),
        ],
        cohortId: cohortId ?? undefined,
        userIds,
        audienceLabel: state.audience.cohortName,
        scheduledAt: state.schedule.mode === 'scheduled' && state.schedule.scheduledAt
          ? new Date(state.schedule.scheduledAt).toISOString()
          : undefined,
        format: state.schedule.format,
      })
    } finally {
      setIsLaunching(false)
    }
  }

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          key="cw-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={tryClose}
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
        />

        {/* Drawer */}
        <motion.aside
          key="cw-drawer"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="fixed top-0 right-0 z-50 h-screen overflow-y-auto"
          style={{
            width: 'min(720px, 100vw)',
            background: 'var(--bg, #0B0B14)',
            borderLeft: '1px solid var(--card-border)',
            boxShadow: '-12px 0 32px rgba(0,0,0,0.35)',
          }}
        >
          {/* Sticky header — title + stepper + close */}
          <div className="sticky top-0 z-10 px-5 py-4 space-y-3" style={{ background: 'var(--bg, #0B0B14)', borderBottom: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: 'var(--heading)' }}>
                {launched ? '🎉 Campaign launched' : 'New Campaign'}
              </h2>
              <button onClick={tryClose} className="p-1.5 rounded-lg transition-colors hover:bg-[var(--hover)]" style={{ color: 'var(--t3)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper */}
            {!launched && (
              <div className="flex items-center gap-2">
                {STEPS.map((s, i) => {
                  const active = step === s.n
                  const done = step > s.n
                  return (
                    <div key={s.n} className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                        style={{
                          background: active ? '#8B5CF6' : done ? 'rgba(16,185,129,0.18)' : 'var(--subtle)',
                          color: active ? '#FFFFFF' : done ? '#10B981' : 'var(--t4)',
                          fontWeight: 700,
                        }}
                      >
                        {done ? '✓' : s.n}
                      </div>
                      <span
                        className="text-[11px]"
                        style={{ color: active ? '#A78BFA' : done ? '#10B981' : 'var(--t4)', fontWeight: active ? 700 : 500 }}
                      >
                        {s.label}
                      </span>
                      {i < STEPS.length - 1 && (
                        <div className="w-6 h-px" style={{ background: 'var(--card-border)' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="px-5 py-5">
            {launched ? (
              <div className="space-y-4 text-center py-8">
                <div className="text-4xl">🚀</div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--heading)' }}>
                  {launchResult?.status === 'scheduled'
                    ? `Scheduled for ${launchResult?.recipientCount ?? state.audience?.memberCount ?? 0} members`
                    : `Queued for ${launchResult?.recipientCount ?? state.audience?.memberCount ?? 0} members`}
                </h3>
                <p className="text-xs max-w-sm mx-auto" style={{ color: 'var(--t3)' }}>
                  Track delivery, opens, and bookings in the Active Campaigns table. The campaign-sends cron picks up <em>running</em> campaigns and fans out to recipients (Priority-1.2).
                </p>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm text-white"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
                >
                  Close
                </button>
              </div>
            ) : step === 1 ? (
              <Step1Audience
                clubId={clubId}
                audience={state.audience}
                onChange={(audience) => setState((s) => ({ ...s, audience }))}
                savedCohorts={savedCohorts}
                suggestedCohorts={suggestedCohorts}
                initialUserIds={initialUserIds}
              />
            ) : step === 2 ? (
              <Step2Goal
                goal={state.goal}
                onChange={(goal: CampaignGoal) => setState((s) => ({ ...s, goal }))}
              />
            ) : step === 3 ? (
              <Step3Schedule
                schedule={state.schedule}
                onChange={(schedule: ScheduleSettings) => setState((s) => ({ ...s, schedule }))}
              />
            ) : (
              <Step4Message
                clubId={clubId}
                audience={state.audience}
                goal={state.goal}
                message={state.message}
                schedule={state.schedule}
                onChange={(message: MessageDraft) => setState((s) => ({ ...s, message }))}
                liveMode={liveMode}
                onLaunch={handleLaunch}
                isLaunching={isLaunching || launchMutation.isPending}
                launchError={launchError}
              />
            )}
          </div>

          {/* Sticky footer — Back / Next (hidden on Step 4 when launched, since Launch is in-step) */}
          {!launched && (
            <div className="sticky bottom-0 px-5 py-3 flex items-center justify-between" style={{ background: 'var(--bg, #0B0B14)', borderTop: '1px solid var(--card-border)' }}>
              <button
                onClick={prev}
                disabled={step === 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs disabled:opacity-30"
                style={{ background: 'var(--subtle)', color: 'var(--t2)' }}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
              {step < 4 ? (
                <button
                  onClick={next}
                  disabled={!canAdvance}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          )}
        </motion.aside>

        <AnimatePresence>
          {showDiscardConfirm && (
            <motion.div
              key="cw-discard-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              style={{ background: 'rgba(5, 8, 20, 0.58)', backdropFilter: 'blur(8px)' }}
              onClick={() => setShowDiscardConfirm(false)}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="discard-campaign-title"
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: 'spring', damping: 24, stiffness: 280 }}
                className="w-full max-w-[540px] rounded-[28px] p-5 sm:p-6"
                style={{
                  background: 'linear-gradient(180deg, rgba(17,24,39,0.98), rgba(11,11,20,0.98))',
                  border: '1px solid rgba(139,92,246,0.18)',
                  boxShadow: '0 28px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(248,113,113,0.20), rgba(239,68,68,0.10))',
                      border: '1px solid rgba(248,113,113,0.28)',
                    }}
                  >
                    <AlertTriangle className="h-5 w-5" style={{ color: '#F87171' }} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]"
                      style={{
                        background: 'rgba(248,113,113,0.10)',
                        color: '#FCA5A5',
                        border: '1px solid rgba(248,113,113,0.18)',
                        fontWeight: 700,
                      }}
                    >
                      Leave wizard
                    </div>
                    <h3
                      id="discard-campaign-title"
                      className="mt-3 text-[24px] leading-tight font-semibold"
                      style={{ color: 'var(--heading)' }}
                    >
                      Discard this campaign draft?
                    </h3>
                    <p className="mt-2 max-w-[420px] text-sm leading-6" style={{ color: 'var(--t3)' }}>
                      Your audience, goal, schedule, and message edits haven&apos;t been launched yet. If you close now, those changes will be lost.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => setShowDiscardConfirm(false)}
                    className="rounded-2xl px-4 py-3 text-sm transition-all"
                    style={{
                      background: 'var(--subtle)',
                      border: '1px solid var(--card-border)',
                      color: 'var(--heading)',
                      fontWeight: 600,
                    }}
                  >
                    Keep editing
                  </button>
                  <button
                    onClick={() => {
                      setShowDiscardConfirm(false)
                      onClose()
                    }}
                    className="rounded-2xl px-4 py-3 text-sm text-white transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #EF4444, #F97316)',
                      boxShadow: '0 10px 30px rgba(239,68,68,0.28)',
                      fontWeight: 700,
                    }}
                  >
                    Discard draft
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    </AnimatePresence>
  )
}
