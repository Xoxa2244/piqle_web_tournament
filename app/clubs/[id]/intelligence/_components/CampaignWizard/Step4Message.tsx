'use client'

/**
 * Wizard Step 4 — Message editor + Launch.
 *
 * Format-aware:
 *   - one_time: single subject + body editor (legacy behaviour)
 *   - sequence: multi-step editor (1..MAX_SEQUENCE_STEPS), step picker
 *               tabs, per-step subject/body/delay/CTA, Add/Remove
 *   - recurring: still rejected — placeholder pointing back to Step 3
 *
 * Sequence state lives on `message.steps`. The currently-edited step
 * index is local UI state (`editingStepIndex`). Top-level
 * `message.subject/body/ctaLabel/ctaUrl` are mirrored from steps[0]
 * at launch time so legacy display surfaces still work.
 *
 * "Regenerate with AI" calls intelligence.generateCampaignMessage and
 * writes back to whichever step is currently open. Test send sends
 * the currently-open step's content (with a hint to switch tabs to
 * test other steps).
 */

import { useEffect, useMemo, useState } from 'react'
import { Wand2, Loader2, AlertTriangle, Plus, X, Sparkles } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { MAX_SEQUENCE_STEPS } from './types'
import type { AudienceSelection, CampaignGoal, MessageDraft, ScheduleSettings, SequenceStep } from './types'

interface Step4Props {
  clubId: string
  audience: AudienceSelection | null
  goal: CampaignGoal | null
  message: MessageDraft
  schedule: ScheduleSettings
  onChange: (next: MessageDraft) => void
  liveMode: 'disabled' | 'shadow' | 'live'
  onLaunch: () => void
  isLaunching: boolean
  /** Server error from launchCampaign mutation. Rendered inline above Launch. */
  launchError?: string | null
}

/** Maps the wizard's CampaignGoal → the legacy campaignType enum that
 *  the backend's generateCampaignMessage understands. */
const GOAL_TO_CAMPAIGN_TYPE: Record<CampaignGoal, 'CHECK_IN' | 'RETENTION_BOOST' | 'REACTIVATION' | 'SLOT_FILLER' | 'EVENT_INVITE' | 'NEW_MEMBER_WELCOME'> = {
  reactivate_dormant: 'REACTIVATION',
  onboard_new: 'NEW_MEMBER_WELCOME',
  promote_event: 'EVENT_INVITE',
  upsell_tier: 'RETENTION_BOOST',
  renewal_reminder: 'CHECK_IN',
  custom: 'CHECK_IN',
}

const TEMPLATES: Record<CampaignGoal, { subject: string; body: string }> = {
  reactivate_dormant: {
    subject: 'We miss you on the courts, {first_name}',
    body:
      "Hey {first_name},\n\nNoticed you haven't played a session in a while. " +
      "We just opened up some great evening slots — your old favourites.\n\n" +
      "Want to grab a spot this week?\n\n[Book a session →]",
  },
  onboard_new: {
    subject: 'Welcome to the club, {first_name} 👋',
    body:
      "Hi {first_name},\n\nThanks for joining! Here's how to get the most out of your first month:\n\n" +
      "1. Book your first 3 sessions (we'll match you with players at your level).\n" +
      "2. Try a clinic — small group, personal coaching, big skill jump.\n" +
      "3. Join a league — community is the best retention move.\n\n" +
      "[See open sessions →]",
  },
  promote_event: {
    subject: '{event_name} — open for signups, {first_name}',
    body:
      "Hi {first_name},\n\nWe're running {event_name} on {event_date}. " +
      "Spots are limited and based on session history we think you'd love this one.\n\n" +
      "[Reserve your spot →]",
  },
  upsell_tier: {
    subject: 'You play more than your package, {first_name}',
    body:
      "Hi {first_name},\n\nYou've booked enough sessions this month that monthly unlimited would actually save you money. " +
      "Want us to switch you over?\n\n[Upgrade my plan →]",
  },
  renewal_reminder: {
    subject: 'Your package expires {expires_in_days}, {first_name}',
    body:
      "Hi {first_name},\n\nQuick heads up — your package expires {expires_in_days}. " +
      "Renew now and stay on the courts without a gap.\n\n[Renew now →]",
  },
  custom: {
    subject: '',
    body: '',
  },
}

export function Step4Message({
  clubId,
  audience,
  goal,
  message,
  schedule,
  onChange,
  liveMode,
  onLaunch,
  isLaunching,
  launchError,
}: Step4Props) {
  const [aiError, setAiError] = useState<string | null>(null)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testSendError, setTestSendError] = useState<string | null>(null)
  const [testSendOk, setTestSendOk] = useState<string | null>(null)
  const [editingStepIndex, setEditingStepIndex] = useState(0)

  const autoPersonalise = useMemo(
    () => (audience?.memberCount ?? 999) <= 50,
    [audience?.memberCount],
  )

  const isSequence = schedule.format === 'sequence'
  const steps: SequenceStep[] = message.steps ?? []
  const editingStep: SequenceStep | undefined = isSequence ? steps[editingStepIndex] : undefined

  // Reading current values — same pattern works for both formats.
  const currentSubject = isSequence ? (editingStep?.subject ?? '') : message.subject
  const currentBody = isSequence ? (editingStep?.body ?? '') : message.body
  const currentCtaLabel = isSequence ? (editingStep?.ctaLabel ?? '') : (message.ctaLabel ?? '')
  const currentCtaUrl = isSequence ? (editingStep?.ctaUrl ?? '') : (message.ctaUrl ?? '')

  // CTA validation — same rules for both formats; applies to currently-open editor.
  const ctaUrlTrimmed = currentCtaUrl.trim()
  const ctaLabelTrimmed = currentCtaLabel.trim()
  const ctaUrlInvalid = ctaUrlTrimmed.length > 0 && !/^https?:\/\/.+/i.test(ctaUrlTrimmed)
  const ctaLabelMissing = ctaUrlTrimmed.length > 0 && ctaLabelTrimmed.length === 0
  const ctaInvalid = ctaUrlInvalid || ctaLabelMissing

  // Sequence-only validation: every step must have non-empty subject + body.
  const sequenceInvalid = isSequence && (
    steps.length === 0
    || steps.some((s) => s.subject.trim().length === 0 || s.body.trim().length === 0)
  )

  // Apply edits to the right place.
  const updateCurrent = (patch: Partial<{ subject: string; body: string; ctaLabel: string; ctaUrl: string }>) => {
    if (!isSequence) {
      onChange({
        ...message,
        ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.ctaLabel !== undefined ? { ctaLabel: patch.ctaLabel } : {}),
        ...(patch.ctaUrl !== undefined ? { ctaUrl: patch.ctaUrl } : {}),
      })
      return
    }
    if (!editingStep) return
    const newSteps = [...steps]
    newSteps[editingStepIndex] = {
      ...editingStep,
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.ctaLabel !== undefined ? { ctaLabel: patch.ctaLabel || undefined } : {}),
      ...(patch.ctaUrl !== undefined ? { ctaUrl: patch.ctaUrl || undefined } : {}),
    }
    onChange({ ...message, steps: newSteps })
  }

  const updateStepDelay = (idx: number, delayDays: number) => {
    const newSteps = [...steps]
    newSteps[idx] = { ...newSteps[idx], delayDays }
    onChange({ ...message, steps: newSteps })
  }

  const addStep = () => {
    if (steps.length >= MAX_SEQUENCE_STEPS) return
    const next: SequenceStep = {
      stepIndex: steps.length,
      delayDays: 3,
      subject: '',
      body: '',
    }
    onChange({ ...message, steps: [...steps, next] })
    setEditingStepIndex(steps.length)
  }

  const removeStep = (idx: number) => {
    if (idx === 0) return
    const newSteps = steps
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, stepIndex: i }))
    onChange({ ...message, steps: newSteps })
    setEditingStepIndex((prev) => Math.max(0, Math.min(prev, newSteps.length - 1)))
  }

  // Initialize message.steps[0] when format flips to sequence with no steps yet.
  // We seed step 0 from the existing single-message draft so users don't lose
  // typed content when toggling format.
  useEffect(() => {
    if (!isSequence) return
    if (steps.length > 0) return
    onChange({
      ...message,
      steps: [{
        stepIndex: 0,
        delayDays: 0,
        subject: message.subject || '',
        body: message.body || '',
        ctaLabel: message.ctaLabel || undefined,
        ctaUrl: message.ctaUrl || undefined,
      }],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSequence])

  // Clamp editingStepIndex if steps shrinks below it.
  useEffect(() => {
    if (steps.length > 0 && editingStepIndex >= steps.length) {
      setEditingStepIndex(steps.length - 1)
    }
  }, [steps.length, editingStepIndex])

  // P1.6: test send (single-recipient preview). For sequence, sends the
  // currently-open step. Does not create a Campaign row, does not bypass
  // nor honor Live Mode — it's a QA tool that ships exactly the same
  // template the cron does.
  const testSendMutation = trpc.intelligence.testSendCampaign.useMutation({
    onSuccess: (res: any) => {
      setTestSendError(null)
      setTestSendOk(`Sent to ${res?.sentTo ?? 'inbox'} — check it in a minute.`)
    },
    onError: (err: any) => {
      setTestSendOk(null)
      setTestSendError(err?.message || 'Test send failed.')
    },
  })

  const handleTestSend = () => {
    if (!currentSubject || !currentBody) {
      setTestSendError('Subject and body are required for a preview.')
      return
    }
    setTestSendError(null)
    setTestSendOk(null)
    const channels: ('email' | 'sms')[] = []
    if (schedule.channels.email) channels.push('email')
    if (schedule.channels.sms) channels.push('sms')
    if (channels.length === 0) {
      setTestSendError('Pick at least one channel in Step 3 to test.')
      return
    }
    if (ctaInvalid) {
      setTestSendError(ctaUrlInvalid ? 'CTA URL must start with http:// or https://' : 'CTA label is required when a URL is set.')
      return
    }
    testSendMutation.mutate({
      clubId,
      subject: currentSubject,
      body: currentBody,
      channels,
      ...(testEmail.trim() ? { to: testEmail.trim() } : {}),
      ...(ctaLabelTrimmed ? { ctaLabel: ctaLabelTrimmed } : {}),
      ...(ctaUrlTrimmed ? { ctaUrl: ctaUrlTrimmed } : {}),
    })
  }

  // Sequence-only: ask the LLM to design the entire sequence (step
  // count + delays + subject/body for each step) based on goal +
  // audience. Replaces `message.steps` wholesale on success.
  const suggestSequenceMutation = trpc.intelligence.suggestSequenceSteps.useMutation({
    onSuccess: (res: any) => {
      setSuggestError(null)
      const incoming = Array.isArray(res?.steps) ? res.steps : []
      if (incoming.length < 1) {
        setSuggestError('AI returned no steps — try again or edit manually.')
        return
      }
      const newSteps: SequenceStep[] = incoming.map((s: any, idx: number) => ({
        stepIndex: idx,
        delayDays: idx === 0 ? 0 : Math.max(1, Math.min(60, Number(s.delayDays) || 3)),
        subject: String(s.subject ?? ''),
        body: String(s.body ?? ''),
      }))
      onChange({ ...message, steps: newSteps })
      setEditingStepIndex(0)
    },
    onError: (err: any) => {
      setSuggestError(err?.message || 'Could not suggest a sequence — try again or edit manually.')
    },
  })

  const handleSuggestSequence = () => {
    if (!goal) return
    if (suggestSequenceMutation.isPending) return
    setSuggestError(null)
    suggestSequenceMutation.mutate({
      clubId,
      campaignType: GOAL_TO_CAMPAIGN_TYPE[goal],
      audienceCount: audience?.memberCount ?? 0,
      ...(audience?.cohortName ? { audienceLabel: audience.cohortName } : {}),
    })
  }

  // Real LLM regenerate. Direct call (no `?.useMutation?.()` form — that
  // pattern crashes through the tRPC react-query proxy; same TypeError we
  // hit on Members AI Insight & bulk Add-to-existing).
  const regenerateMutation = trpc.intelligence.generateCampaignMessage.useMutation({
    onSuccess: (res: any) => {
      setAiError(null)
      updateCurrent({
        subject: res?.subject ?? currentSubject,
        body: res?.body ?? currentBody,
      })
    },
    onError: (err: any) => {
      setAiError(err?.message || 'Could not regenerate — try again or edit manually.')
    },
  })

  // First time we land on Step 4 with a goal, populate the static template
  // if both fields are empty. AI regenerate is a manual click.
  useEffect(() => {
    if (!goal) return
    if (isSequence) {
      // Wait for the steps-init effect to have run.
      if (steps.length === 0) return
      const step0 = steps[0]
      if (step0.subject || step0.body) return
      const t = TEMPLATES[goal]
      const newSteps = [...steps]
      newSteps[0] = { ...step0, subject: t.subject, body: t.body }
      onChange({ ...message, steps: newSteps, perRecipientPersonalisation: autoPersonalise })
      return
    }
    if (message.subject || message.body) return
    const t = TEMPLATES[goal]
    onChange({
      ...message,
      subject: t.subject,
      body: t.body,
      perRecipientPersonalisation: autoPersonalise,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, isSequence, steps.length])

  const handleAiRegenerate = () => {
    if (!goal) return
    setAiError(null)
    const channel = schedule.channels.email && schedule.channels.sms
      ? 'both'
      : schedule.channels.sms
        ? 'sms'
        : 'email'
    regenerateMutation.mutate({
      clubId,
      campaignType: GOAL_TO_CAMPAIGN_TYPE[goal],
      channel,
      audienceCount: audience?.memberCount ?? 0,
    })
  }

  const isLive = liveMode === 'live'
  const launchDisabled = isLaunching || !isLive || regenerateMutation.isPending
    || (isSequence
      ? sequenceInvalid
      : (currentSubject.trim().length === 0 || currentBody.trim().length === 0))
    || ctaInvalid

  if (!goal) {
    return (
      <div className="rounded-xl p-4 text-xs text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
        Pick a goal in Step 2 first.
      </div>
    )
  }

  // Recurring uses the same single-message editor as one_time. The
  // runner re-evaluates the cohort on each tick and sends to whoever
  // matches at that time, but the message body itself is one canonical
  // template (no per-step variation in MVP).

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--heading)' }}>
          {isSequence ? `Message steps (${steps.length} of ${MAX_SEQUENCE_STEPS})` : 'Message'}
        </h3>
        <p className="text-xs" style={{ color: 'var(--t3)' }}>
          {isSequence
            ? `Up to ${MAX_SEQUENCE_STEPS} emails delivered in order. Each recipient gets the next step only after its delay elapses${schedule.exitOnBooking ? ', unless they book a session in between' : ''}. Variables in {curly_braces} are replaced per recipient.`
            : `AI-drafted starter for ${goal.replace(/_/g, ' ')}. Edit freely — variables in {curly_braces} are replaced per recipient at send time.`}
        </p>
      </div>

      {/* Step picker — sequence only */}
      {isSequence && steps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((s, idx) => {
            const active = idx === editingStepIndex
            const incomplete = !s.subject.trim() || !s.body.trim()
            return (
              <button
                key={idx}
                onClick={() => setEditingStepIndex(idx)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: active ? 'rgba(139,92,246,0.18)' : 'var(--subtle)',
                  border: `1px solid ${active ? '#8B5CF6' : (incomplete ? 'rgba(239,68,68,0.4)' : 'var(--card-border)')}`,
                  color: active ? '#A78BFA' : 'var(--heading)',
                  fontWeight: 600,
                }}
              >
                Step {idx + 1}
                {idx > 0 && (
                  <span className="text-[10px]" style={{ opacity: 0.7 }}>
                    +{s.delayDays}d
                  </span>
                )}
                {idx > 0 && active && (
                  <span
                    role="button"
                    aria-label={`Remove Step ${idx + 1}`}
                    onClick={(e) => { e.stopPropagation(); removeStep(idx) }}
                    className="ml-1 -mr-1 w-4 h-4 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-500/20"
                  >
                    <X className="w-2.5 h-2.5" style={{ color: '#F87171' }} />
                  </span>
                )}
              </button>
            )
          })}
          {steps.length < MAX_SEQUENCE_STEPS && (
            <button
              onClick={addStep}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all hover:opacity-80"
              style={{
                background: 'transparent',
                border: '1px dashed var(--card-border)',
                color: 'var(--t3)',
                fontWeight: 600,
              }}
            >
              <Plus className="w-3 h-3" />
              Add step
            </button>
          )}

          {/* AI sequence designer — replaces all steps with an LLM-generated
              series tuned to the goal. Always available; admin can click
              again to get a different variant. */}
          <button
            onClick={handleSuggestSequence}
            disabled={suggestSequenceMutation.isPending || !goal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{
              background: 'rgba(139,92,246,0.16)',
              border: '1px solid rgba(139,92,246,0.35)',
              color: '#A78BFA',
              fontWeight: 600,
            }}
            title="Replace all steps with an AI-generated sequence tuned to your goal."
          >
            {suggestSequenceMutation.isPending ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Designing…
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                Suggest steps with AI
              </>
            )}
          </button>
        </div>
      )}

      {/* Sequence-suggester error banner — separate from the per-step
          regenerate error so admins know which one failed. */}
      {suggestError && isSequence && (
        <div className="rounded-xl p-3 text-xs flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{suggestError}</span>
        </div>
      )}

      {/* Per-step delay editor — sequence, non-first only */}
      {isSequence && editingStep && editingStepIndex > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
            Send this step
          </span>
          <input
            type="number"
            min={1}
            max={60}
            value={editingStep.delayDays}
            onChange={(e) => updateStepDelay(editingStepIndex, Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            className="w-16 px-2 py-1 rounded-lg text-xs outline-none text-center"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
          />
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
            day(s) after Step {editingStepIndex} was sent to the recipient.
          </span>
        </div>
      )}

      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Subject</label>
        <input
          type="text"
          value={currentSubject}
          onChange={(e) => updateCurrent({ subject: e.target.value })}
          placeholder="Subject line…"
          className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Body</label>
        <textarea
          value={currentBody}
          onChange={(e) => updateCurrent({ body: e.target.value })}
          placeholder="Message body…"
          rows={10}
          className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none resize-y"
          style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)', minHeight: 200 }}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleAiRegenerate}
          disabled={regenerateMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] disabled:opacity-50"
          style={{ background: 'rgba(139,92,246,0.16)', color: '#A78BFA' }}
        >
          {regenerateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          {regenerateMutation.isPending
            ? 'Regenerating…'
            : isSequence ? `Regenerate Step ${editingStepIndex + 1} with AI` : 'Regenerate with AI'}
        </button>

        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--t3)' }}>
          <input
            type="checkbox"
            checked={message.perRecipientPersonalisation}
            onChange={(e) => onChange({ ...message, perRecipientPersonalisation: e.target.checked })}
            className="w-4 h-4 cursor-pointer"
          />
          Personalise per recipient with AI profiles
          {autoPersonalise && (
            <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 600 }}>
              auto-on for this cohort size
            </span>
          )}
        </label>
      </div>

      {aiError && (
        <div className="rounded-xl p-3 text-xs flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{aiError}</span>
        </div>
      )}

      {/* Variables hint */}
      <div className="rounded-xl p-3 text-[11px]" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
        Variables available: <code>{`{first_name}`}</code> · <code>{`{last_name}`}</code> · <code>{`{event_name}`}</code> · <code>{`{event_date}`}</code> · <code>{`{expires_in_days}`}</code>
      </div>

      {/* Call to action — optional override for the email button.
          When both fields are empty the email shows the default
          "Book a Session" button linking to the club page. For
          sequence, applies to the currently-open step (each step
          can have its own CTA). */}
      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>
          Call to action {isSequence ? `for Step ${editingStepIndex + 1}` : ''} <span style={{ textTransform: 'none', color: 'var(--t4)', fontWeight: 400 }}>— leave blank for default &ldquo;Book a Session&rdquo; button</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2 mt-1">
          <input
            type="text"
            value={currentCtaLabel}
            onChange={(e) => updateCurrent({ ctaLabel: e.target.value })}
            placeholder="Button label (e.g. Renew now)"
            maxLength={100}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--subtle)',
              border: `1px solid ${ctaLabelMissing ? 'rgba(239,68,68,0.5)' : 'var(--card-border)'}`,
              color: 'var(--heading)',
            }}
          />
          <input
            type="url"
            value={currentCtaUrl}
            onChange={(e) => updateCurrent({ ctaUrl: e.target.value })}
            placeholder="https://yourclub.com/renew"
            maxLength={500}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--subtle)',
              border: `1px solid ${ctaUrlInvalid ? 'rgba(239,68,68,0.5)' : 'var(--card-border)'}`,
              color: 'var(--heading)',
            }}
          />
        </div>
        {ctaUrlInvalid && (
          <div className="mt-1 text-[11px]" style={{ color: '#F87171' }}>
            URL must start with http:// or https://
          </div>
        )}
        {ctaLabelMissing && (
          <div className="mt-1 text-[11px]" style={{ color: '#F87171' }}>
            Add a button label or clear the URL.
          </div>
        )}
      </div>

      {/* Test send (P1.6) — single-recipient preview, no Campaign/log row created */}
      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>
          Send test {isSequence ? `of Step ${editingStepIndex + 1}` : ''} to {testEmail.trim() ? '' : '(blank → your own inbox)'}
        </label>
        <div className="flex gap-2 mt-1">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="admin@yourclub.com"
            disabled={testSendMutation.isPending}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-50"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
          />
          <button
            onClick={handleTestSend}
            disabled={testSendMutation.isPending}
            className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--subtle)', color: 'var(--heading)', fontWeight: 600, border: '1px solid var(--card-border)' }}
          >
            {testSendMutation.isPending ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Sending…
              </>
            ) : (
              'Send test'
            )}
          </button>
        </div>
        {isSequence && (
          <div className="mt-1 text-[10px]" style={{ color: 'var(--t4)' }}>
            Sends only the currently-open step. Switch tabs above to test other steps.
          </div>
        )}
        {testSendOk && (
          <div className="mt-2 text-[11px]" style={{ color: '#10B981' }}>
            ✓ {testSendOk}
          </div>
        )}
        {testSendError && (
          <div className="mt-2 text-[11px]" style={{ color: '#F87171' }}>
            ✗ {testSendError}
          </div>
        )}
      </div>

      {/* Server error from launch */}
      {launchError && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="text-xs">{launchError}</span>
        </div>
      )}

      {/* Sequence-level "incomplete steps" warning when applicable */}
      {isSequence && sequenceInvalid && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#F59E0B' }} />
          <div className="text-xs" style={{ color: 'var(--heading)' }}>
            One or more steps have an empty subject or body. Fill them in (red-bordered tabs) to enable Launch.
          </div>
        </div>
      )}

      {/* Launch */}
      {!isLive && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#F59E0B' }} />
          <div className="text-xs" style={{ color: 'var(--heading)' }}>
            Live Mode is <strong>{liveMode}</strong>. Real sends are blocked.{' '}
            Switch to <strong>Live</strong> in <em>Settings → Automation</em> to launch.
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={onLaunch}
          disabled={launchDisabled}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
        >
          {isLaunching ? '…' : isSequence ? `✅ Launch sequence (${steps.length} step${steps.length === 1 ? '' : 's'})` : '✅ Launch'}
        </button>
      </div>
    </div>
  )
}
