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
import { X, ChevronRight, ChevronLeft } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { useListCohorts, useSuggestedCohorts, useIntelligenceSettings } from '../../_hooks/use-intelligence'
import { Step1Audience } from './Step1Audience'
import { Step2Goal } from './Step2Goal'
import { Step3Message } from './Step3Message'
import { Step4Schedule } from './Step4Schedule'
import { EMPTY_WIZARD_STATE, type WizardStep, type WizardState, type AudienceSelection, type CampaignGoal, type MessageDraft, type ScheduleSettings } from './types'

interface CampaignWizardProps {
  clubId: string
  /** Open from Members bulk-select with hand-picked userIds. */
  initialUserIds?: string[]
  /** Open from "Save + Create campaign" with a freshly-saved cohort. */
  initialCohortId?: string | null
  /** Open from AI-Suggested card with a generated cohort already chosen. */
  initialSuggestedCohort?: AudienceSelection | null
  onClose: () => void
}

const STEPS: Array<{ n: WizardStep; label: string }> = [
  { n: 1, label: 'Audience' },
  { n: 2, label: 'Goal' },
  { n: 3, label: 'Message' },
  { n: 4, label: 'Schedule' },
]

export function CampaignWizard({
  clubId,
  initialUserIds,
  initialCohortId,
  initialSuggestedCohort,
  onClose,
}: CampaignWizardProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [state, setState] = useState<WizardState>(EMPTY_WIZARD_STATE)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launched, setLaunched] = useState(false)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCohorts.length])

  const canAdvance = (() => {
    if (step === 1) return !!state.audience
    if (step === 2) return !!state.goal
    if (step === 3) return state.message.subject.trim().length > 0 && state.message.body.trim().length > 0
    return false
  })()

  const next = () => setStep((s) => (s < 4 ? ((s + 1) as WizardStep) : s))
  const prev = () => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))

  // Esc closes (with confirm if dirty)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tryClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const isDirty = !!state.audience || !!state.goal || !!state.message.subject || !!state.message.body
  const tryClose = () => {
    if (!isDirty || launched) {
      onClose()
      return
    }
    if (typeof window !== 'undefined' && window.confirm('Discard this campaign draft?')) {
      onClose()
    }
  }

  // Launch — v1 stub. Real DB write lands in P5-T2 with Campaign model.
  const handleLaunch = async () => {
    if (liveMode !== 'live') return
    setIsLaunching(true)
    try {
      // TODO P5-T2: insert Campaign row + queue sends.
      // For now show success state without DB write.
      await new Promise((r) => setTimeout(r, 600))
      setLaunched(true)
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
                  Campaign on its way to {state.audience?.memberCount ?? 0} members
                </h3>
                <p className="text-xs max-w-sm mx-auto" style={{ color: 'var(--t3)' }}>
                  Track delivery, opens, and bookings in the Active Campaigns table. We&apos;ll
                  also surface results in the Campaign History accordion once it ships (P5-T5).
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
              <Step3Message
                audience={state.audience}
                goal={state.goal}
                message={state.message}
                onChange={(message: MessageDraft) => setState((s) => ({ ...s, message }))}
              />
            ) : (
              <Step4Schedule
                schedule={state.schedule}
                onChange={(schedule: ScheduleSettings) => setState((s) => ({ ...s, schedule }))}
                liveMode={liveMode}
                onLaunch={handleLaunch}
                isLaunching={isLaunching}
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
      </>
    </AnimatePresence>
  )
}
