'use client'

/**
 * Wizard Step 3 — Message (P4-T4).
 *
 * Auto-generates a starter subject + body based on Goal × Audience.
 * Templates are static stubs in v1; real LLM integration via
 * `lib/ai/llm/message-generator.ts` lands in a follow-up sprint.
 *
 * D6: when audience.memberCount ≤ 50, "Generate AI profiles for this
 * cohort" auto-runs in the background; for larger cohorts the user
 * triggers it explicitly. v1 ships the toggle; LLM call deferred.
 */

import { useEffect, useMemo } from 'react'
import { Wand2, Loader2 } from 'lucide-react'
import type { AudienceSelection, CampaignGoal, MessageDraft } from './types'

interface Step3Props {
  audience: AudienceSelection | null
  goal: CampaignGoal | null
  message: MessageDraft
  onChange: (next: MessageDraft) => void
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

export function Step3Message({ audience, goal, message, onChange }: Step3Props) {
  // Whether D6 auto-personalisation should default ON (cohort ≤ 50).
  const autoPersonalise = useMemo(
    () => (audience?.memberCount ?? 999) <= 50,
    [audience?.memberCount]
  )

  // First time we land on Step 3 with a goal, populate the template if empty.
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

  const regenerate = () => {
    if (!goal) return
    const t = TEMPLATES[goal]
    onChange({ ...message, subject: t.subject, body: t.body })
  }

  if (!goal) {
    return (
      <div className="rounded-xl p-4 text-xs text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
        Pick a goal in Step 2 first.
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
          onClick={regenerate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02]"
          style={{ background: 'rgba(139,92,246,0.16)', color: '#A78BFA' }}
        >
          <Wand2 className="w-3.5 h-3.5" />
          Regenerate with AI
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

      {/* Preview hint */}
      <div className="rounded-xl p-3 text-[11px]" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
        Variables available: <code>{`{first_name}`}</code> · <code>{`{last_name}`}</code> · <code>{`{event_name}`}</code> · <code>{`{event_date}`}</code> · <code>{`{expires_in_days}`}</code>
      </div>
    </div>
  )
}
