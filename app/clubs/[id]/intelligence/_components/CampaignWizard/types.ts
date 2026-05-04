/**
 * Campaign Wizard shared types — P4-T1.
 *
 * Wizard state is held in the parent <CampaignWizard> and passed
 * down to each step. Each step receives the current value + an
 * onChange to mutate it.
 */

export type WizardStep = 1 | 2 | 3 | 4

export type CampaignGoal =
  | 'reactivate_dormant'
  | 'check_in'
  | 'retention_boost'
  | 'onboard_new'
  | 'promote_event'
  | 'upsell_tier'
  | 'renewal_reminder'
  | 'custom'

export type CampaignChannel = 'email' | 'sms' | 'email+sms'

export type ScheduleMode = 'now' | 'scheduled' | 'triggered'

/** P2-T9 / Phase 6 prep: send format. v1 ships only `one_time`; the other
 *  two are surfaced in the wizard as "Coming soon" placeholders. Real
 *  sequence runner + cron-based recurring runner land in a follow-up sprint. */
export type SendFormat = 'one_time' | 'sequence' | 'recurring'

export type AudienceSourceKind = 'saved_cohort' | 'ai_suggested' | 'inline_userIds'

export interface AudienceSelection {
  kind: AudienceSourceKind
  cohortId: string | null            // existing cohort id (saved_cohort or ai_suggested mode)
  cohortName: string                 // display label
  userIds: string[]                  // hand-picked or AI-suggested userIds
  memberCount: number                // approximate
}

/** A single step inside a sequence campaign. */
export interface SequenceStep {
  /** 0-based position within `MessageDraft.steps`. */
  stepIndex: number
  /** Days to wait after the previous step was sent. Always 0 for stepIndex=0. */
  delayDays: number
  subject: string
  body: string
  /** Optional CTA per step (overrides campaign-level ctaLabel/ctaUrl). */
  ctaLabel?: string
  ctaUrl?: string
}

/** MVP cap for steps in a single sequence — keeps the editor sane. */
export const MAX_SEQUENCE_STEPS = 5

export interface MessageDraft {
  subject: string
  body: string
  /** Whether AI Profiles auto-personalisation is enabled (D6: auto when cohort ≤50). */
  perRecipientPersonalisation: boolean
  /** A/B variant — wired in v2; v1 ships single-variant. */
  abVariantBody?: string
  /** Optional CTA button label override. Empty → email uses "Book a Session". */
  ctaLabel?: string
  /** Optional CTA URL override. Empty → email uses club page (bookingUrl). */
  ctaUrl?: string
  /** Sequence steps. Populated when ScheduleSettings.format === 'sequence'.
   *  When format=one_time the editor uses subject + body directly (above);
   *  this array stays untouched so toggling format back and forth doesn't
   *  lose the sequence draft. */
  steps?: SequenceStep[]
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly'

export interface ScheduleSettings {
  /** Send format — drives whether Step 4 renders 1 or N message editors. */
  format: SendFormat
  mode: ScheduleMode
  /** ISO datetime; populated when mode='scheduled'. */
  scheduledAt: string | null
  channels: { email: boolean; sms: boolean }
  /** Sequence: stop sending follow-up steps to a recipient who books
   *  between steps. Default true. Only meaningful when format='sequence'. */
  exitOnBooking: boolean
  /** Recurring (only meaningful when format='recurring'). UI renders a
   *  structured selector and computes `cronExpression` from these. */
  recurringFrequency?: RecurringFrequency
  /** 0=Sunday, 1=Monday, … 6=Saturday. Used when recurringFrequency='weekly'. */
  recurringDayOfWeek?: number
  /** 1..28 (clamped to 28 to avoid Feb edge cases in MVP). Used when
   *  recurringFrequency='monthly'. */
  recurringDayOfMonth?: number
  /** 0..23 — local hour to fire (interpreted in recurringTimezone). */
  recurringHour?: number
  /** IANA timezone string. Defaults to 'UTC'. */
  recurringTimezone?: string
}

/** Build the cron expression that the runner reads from frequency selectors.
 *  We only generate the small set of patterns the Wizard supports; admins
 *  cannot type custom cron in MVP. */
export function buildRecurringCron(s: ScheduleSettings): string | null {
  if (s.format !== 'recurring') return null
  const hour = Math.max(0, Math.min(23, s.recurringHour ?? 9))
  switch (s.recurringFrequency) {
    case 'daily':
      return `0 ${hour} * * *`
    case 'weekly': {
      const dow = Math.max(0, Math.min(6, s.recurringDayOfWeek ?? 1))
      return `0 ${hour} * * ${dow}`
    }
    case 'monthly': {
      const dom = Math.max(1, Math.min(28, s.recurringDayOfMonth ?? 1))
      return `0 ${hour} ${dom} * *`
    }
    default:
      return null
  }
}

export interface WizardState {
  audience: AudienceSelection | null
  goal: CampaignGoal | null
  message: MessageDraft
  schedule: ScheduleSettings
}

export const EMPTY_WIZARD_STATE: WizardState = {
  audience: null,
  goal: null,
  message: { subject: '', body: '', perRecipientPersonalisation: false, ctaLabel: '', ctaUrl: '' },
  schedule: {
    format: 'one_time',
    mode: 'now',
    scheduledAt: null,
    channels: { email: true, sms: false },
    exitOnBooking: true,
    recurringFrequency: 'weekly',
    recurringDayOfWeek: 1, // Monday
    recurringDayOfMonth: 1,
    recurringHour: 9,
    recurringTimezone: 'UTC',
  },
}
