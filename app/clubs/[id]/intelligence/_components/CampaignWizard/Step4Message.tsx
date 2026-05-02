'use client'

/**
 * Wizard Step 4 — Message editor + Launch.
 *
 * Was Step 3. Moved to last position so the editor can render the right
 * number of message slots based on the SendFormat chosen in Step 3:
 *   - one_time → 1 subject + body
 *   - sequence → N subject+body editors (Coming soon)
 *   - recurring → 1 subject + body (renders on each tick)
 *
 * "Regenerate with AI" button now actually calls the LLM
 * (intelligence.generateCampaignMessage) instead of just resetting to
 * the static template — the previous implementation was a fake.
 *
 * Launch button lives here as the natural final action: write copy →
 * click Launch.
 */

import { useEffect, useMemo, useState } from 'react'
import { Wand2, Loader2, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import type { AudienceSelection, CampaignGoal, MessageDraft, ScheduleSettings } from './types'

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
  const [testEmail, setTestEmail] = useState('')

  const autoPersonalise = useMemo(
    () => (audience?.memberCount ?? 999) <= 50,
    [audience?.memberCount],
  )

  // Real LLM regenerate. Direct call (no `?.useMutation?.()` form — that
  // pattern crashes through the tRPC react-query proxy; same TypeError we
  // hit on Members AI Insight & bulk Add-to-existing).
  const regenerateMutation = trpc.intelligence.generateCampaignMessage.useMutation({
    onSuccess: (res: any) => {
      setAiError(null)
      onChange({
        ...message,
        subject: res?.subject ?? message.subject,
        body: res?.body ?? message.body,
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
    if (message.subject || message.body) return
    const t = TEMPLATES[goal]
    onChange({
      ...message,
      subject: t.subject,
      body: t.body,
      perRecipientPersonalisation: autoPersonalise,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal])

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
    || message.subject.trim().length === 0 || message.body.trim().length === 0

  if (!goal) {
    return (
      <div className="rounded-xl p-4 text-xs text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
        Pick a goal in Step 2 first.
      </div>
    )
  }

  // Sequence/recurring formats are not yet wired — show a placeholder until
  // the multi-message editor + runner ship.
  if (schedule.format !== 'one_time') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl p-4 text-xs flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#F59E0B' }} />
          <div style={{ color: 'var(--heading)' }}>
            Multi-message editor for <strong>{schedule.format === 'sequence' ? 'sequences' : 'recurring sends'}</strong> ships in the next sprint.
            Switch back to <em>One-time</em> in Step 3 to draft this campaign now.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--heading)' }}>Message</h3>
        <p className="text-xs" style={{ color: 'var(--t3)' }}>
          AI-drafted starter for {goal.replace(/_/g, ' ')}. Edit freely — variables in {`{curly_braces}`} are replaced per recipient at send time.
        </p>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Subject</label>
        <input
          type="text"
          value={message.subject}
          onChange={(e) => onChange({ ...message, subject: e.target.value })}
          placeholder="Subject line…"
          className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Body</label>
        <textarea
          value={message.body}
          onChange={(e) => onChange({ ...message, body: e.target.value })}
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
          {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate with AI'}
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

      {/* Test send */}
      <div>
        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Send test to</label>
        <div className="flex gap-2 mt-1">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="admin@yourclub.com"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
          />
          <button
            disabled
            title="Test-send wires up alongside real Launch"
            className="px-3 py-2 rounded-lg text-xs opacity-50 cursor-not-allowed"
            style={{ background: 'var(--subtle)', color: 'var(--t3)', fontWeight: 600 }}
          >
            Send test
          </button>
        </div>
      </div>

      {/* Server error from launch */}
      {launchError && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="text-xs">{launchError}</span>
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
          {isLaunching ? '…' : '✅ Launch'}
        </button>
      </div>
    </div>
  )
}
