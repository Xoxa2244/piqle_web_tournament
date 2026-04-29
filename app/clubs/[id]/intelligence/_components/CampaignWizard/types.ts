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
  | 'onboard_new'
  | 'promote_event'
  | 'upsell_tier'
  | 'renewal_reminder'
  | 'custom'

export type CampaignChannel = 'email' | 'sms' | 'email+sms'

export type ScheduleMode = 'now' | 'scheduled' | 'triggered'

export type AudienceSourceKind = 'saved_cohort' | 'ai_suggested' | 'inline_userIds'

export interface AudienceSelection {
  kind: AudienceSourceKind
  cohortId: string | null            // existing cohort id (saved_cohort or ai_suggested mode)
  cohortName: string                 // display label
  userIds: string[]                  // hand-picked or AI-suggested userIds
  memberCount: number                // approximate
}

export interface MessageDraft {
  subject: string
  body: string
  /** Whether AI Profiles auto-personalisation is enabled (D6: auto when cohort ≤50). */
  perRecipientPersonalisation: boolean
  /** A/B variant — wired in v2; v1 ships single-variant. */
  abVariantBody?: string
}

export interface ScheduleSettings {
  mode: ScheduleMode
  /** ISO datetime; populated when mode='scheduled'. */
  scheduledAt: string | null
  channels: { email: boolean; sms: boolean }
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
  message: { subject: '', body: '', perRecipientPersonalisation: false },
  schedule: {
    mode: 'now',
    scheduledAt: null,
    channels: { email: true, sms: false },
  },
}
