/**
 * Onboarding Schema — Zod validation for Club Intelligence settings
 */

import { z } from 'zod'
import { agentAutonomyPolicySchema } from './agent-autonomy'
import { advisorContactPolicyDraftSchema } from './advisor-contact-policy'
import { advisorSandboxRoutingSettingsSchema } from './advisor-sandbox-routing'

const agentControlPlaneModeSchema = z.enum(['disabled', 'shadow', 'live'])
const clubAdminRoleSchema = z.enum(['ADMIN', 'MODERATOR'])
const normalizedMembershipStatusSchema = z.enum(['active', 'suspended', 'expired', 'cancelled', 'trial', 'guest', 'none'])
const normalizedMembershipTypeSchema = z.enum(['unlimited', 'monthly', 'package', 'drop_in', 'trial', 'guest', 'discounted', 'insurance', 'staff'])
const membershipMappingSourceSchema = z.enum(['type', 'status', 'either'])
const membershipMappingMatchModeSchema = z.enum(['contains', 'equals'])
const guestTrialOfferKindSchema = z.enum(['guest_pass', 'trial_pass', 'starter_pack', 'paid_intro', 'membership_offer'])
const guestTrialOfferAudienceSchema = z.enum(['guest', 'trial', 'either'])
const guestTrialOfferStageSchema = z.enum(['book_first_visit', 'protect_first_show_up', 'convert_to_paid', 'any'])
const guestTrialOfferDestinationTypeSchema = z.enum(['schedule', 'landing_page', 'external_url', 'manual_follow_up'])
const referralOfferKindSchema = z.enum(['bring_a_friend', 'vip_guest_pass', 'trial_invite', 'reward_credit', 'guest_pass'])
const referralOfferLaneSchema = z.enum(['vip_advocate', 'social_regular', 'dormant_advocate', 'any'])
const referralOfferDestinationTypeSchema = z.enum(['schedule', 'landing_page', 'external_url', 'manual_follow_up'])
const agentControlPlaneAuditChangeKeySchema = z.enum([
  'killSwitch',
  'outreachRollout',
  'outreachSend',
  'schedulePublish',
  'scheduleLiveEdit',
  'scheduleLiveRollback',
  'adminReminderExternal',
])
const agentOutreachRolloutSettingsSchema = z.object({
  actions: z.object({
    create_campaign: z.object({ enabled: z.boolean().optional() }).optional(),
    fill_session: z.object({ enabled: z.boolean().optional() }).optional(),
    reactivate_members: z.object({ enabled: z.boolean().optional() }).optional(),
    trial_follow_up: z.object({ enabled: z.boolean().optional() }).optional(),
    renewal_reactivation: z.object({ enabled: z.boolean().optional() }).optional(),
  }).partial().optional(),
})
const agentControlPlaneAuditSchema = z.object({
  lastChangedAt: z.string().optional(),
  lastChangedByUserId: z.string().optional(),
  lastChangedByLabel: z.string().optional(),
  summary: z.string().optional(),
  changes: z.array(z.object({
    key: agentControlPlaneAuditChangeKeySchema,
    label: z.string(),
    from: z.string(),
    to: z.string(),
  })).optional(),
})

const membershipMappingRuleSchema = z.object({
  rawLabel: z.string().trim().min(1, 'Raw membership label is required'),
  source: membershipMappingSourceSchema.default('type'),
  matchMode: membershipMappingMatchModeSchema.default('contains'),
  normalizedType: normalizedMembershipTypeSchema.optional(),
  normalizedStatus: normalizedMembershipStatusSchema.optional(),
}).refine(
  (value) => Boolean(value.normalizedType || value.normalizedStatus),
  { message: 'Map at least one canonical type or status' },
)

const membershipMappingSettingsSchema = z.object({
  rules: z.array(membershipMappingRuleSchema).default([]),
})

const guestTrialOfferSchema = z.object({
  key: z.string().trim().min(1, 'Offer key is required'),
  name: z.string().trim().min(1, 'Offer name is required'),
  kind: guestTrialOfferKindSchema,
  audience: guestTrialOfferAudienceSchema.default('either'),
  stage: guestTrialOfferStageSchema.default('any'),
  priceLabel: z.string().trim().optional().nullable(),
  durationLabel: z.string().trim().optional().nullable(),
  summary: z.string().trim().optional().nullable(),
  ctaLabel: z.string().trim().optional().nullable(),
  destinationType: guestTrialOfferDestinationTypeSchema.optional().nullable(),
  destinationLabel: z.string().trim().optional().nullable(),
  destinationUrl: z.string().trim().optional().nullable(),
  destinationNotes: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
  highlight: z.boolean().optional(),
})

const guestTrialOfferSettingsSchema = z.object({
  offers: z.array(guestTrialOfferSchema).default([]),
})

const referralOfferSchema = z.object({
  key: z.string().trim().min(1, 'Referral offer key is required'),
  name: z.string().trim().min(1, 'Referral offer name is required'),
  kind: referralOfferKindSchema,
  lane: referralOfferLaneSchema.default('any'),
  rewardLabel: z.string().trim().optional().nullable(),
  summary: z.string().trim().optional().nullable(),
  ctaLabel: z.string().trim().optional().nullable(),
  destinationType: referralOfferDestinationTypeSchema.optional().nullable(),
  destinationLabel: z.string().trim().optional().nullable(),
  destinationUrl: z.string().trim().optional().nullable(),
  destinationNotes: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
  highlight: z.boolean().optional(),
})

const referralOfferSettingsSchema = z.object({
  offers: z.array(referralOfferSchema).default([]),
})

const agentPermissionSettingsSchema = z.object({
  actions: z.object({
    draftManage: z.object({ minimumRole: clubAdminRoleSchema.optional() }).optional(),
    approveActions: z.object({ minimumRole: clubAdminRoleSchema.optional() }).optional(),
    outreachSend: z.object({ minimumRole: clubAdminRoleSchema.optional() }).optional(),
    schedulePublish: z.object({ minimumRole: clubAdminRoleSchema.optional() }).optional(),
    scheduleLiveEdit: z.object({ minimumRole: clubAdminRoleSchema.optional() }).optional(),
    scheduleLiveRollback: z.object({ minimumRole: clubAdminRoleSchema.optional() }).optional(),
    controlPlaneManage: z.object({ minimumRole: clubAdminRoleSchema.optional() }).optional(),
  }).partial().optional(),
})

const agentControlPlaneSettingsSchema = z.object({
  killSwitch: z.boolean().optional(),
  actions: z.object({
    outreachSend: z.object({ mode: agentControlPlaneModeSchema.optional() }).optional(),
    schedulePublish: z.object({ mode: agentControlPlaneModeSchema.optional() }).optional(),
    scheduleLiveEdit: z.object({ mode: agentControlPlaneModeSchema.optional() }).optional(),
    scheduleLiveRollback: z.object({ mode: agentControlPlaneModeSchema.optional() }).optional(),
    adminReminderExternal: z.object({ mode: agentControlPlaneModeSchema.optional() }).optional(),
  }).partial().optional(),
  outreachRollout: agentOutreachRolloutSettingsSchema.optional(),
  audit: agentControlPlaneAuditSchema.optional(),
})

// ── Shared enums ──

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

export const PRICING_MODELS = ['per_session', 'membership', 'free', 'hybrid'] as const
export const COMMUNICATION_TONES = ['friendly', 'professional', 'casual'] as const
export const COMMUNICATION_CHANNELS = ['email', 'sms', 'both'] as const
export const CLUB_GOALS = [
  'fill_sessions', 'grow_membership', 'improve_retention',
  'increase_revenue', 'reduce_no_shows',
] as const

// ── Step schemas ──

export const step1Schema = z.object({
  timezone: z.string().min(1, 'Timezone is required'),
  sportTypes: z.array(z.string()).min(1, 'Select at least one sport'),
})

export const step2Schema = z.object({
  courtCount: z.number().int().min(1, 'At least 1 court').max(50),
  hasIndoorCourts: z.boolean(),
  hasOutdoorCourts: z.boolean(),
})

export const step3Schema = z.object({
  operatingDays: z.array(z.enum(DAYS_OF_WEEK)).min(1, 'Select at least one day'),
  operatingHours: z.object({
    open: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
    close: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  }),
  peakHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  }),
  typicalSessionDurationMinutes: z.number().int().min(15).max(240).default(90),
})

export const step4Schema = z.object({
  pricingModel: z.enum(PRICING_MODELS),
  avgSessionPriceCents: z.number().int().min(0).nullable(),
  communicationPreferences: z.object({
    preferredChannel: z.enum(COMMUNICATION_CHANNELS),
    maxMessagesPerWeek: z.number().int().min(1).max(7).default(3),
    tone: z.enum(COMMUNICATION_TONES),
  }),
})

export const step5Schema = z.object({
  goals: z.array(z.enum(CLUB_GOALS)).min(1, 'Select at least one goal'),
})

// ── Full settings schema ──

export const intelligenceSettingsSchema = z.object({
  timezone: z.string().min(1),
  sportTypes: z.array(z.string()).min(1),
  operatingDays: z.array(z.enum(DAYS_OF_WEEK)).min(1),
  operatingHours: z.object({
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  peakHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  typicalSessionDurationMinutes: z.number().int().min(15).max(240),
  courtCount: z.number().int().min(1).max(50),
  hasIndoorCourts: z.boolean(),
  hasOutdoorCourts: z.boolean(),
  pricingModel: z.enum(PRICING_MODELS),
  avgSessionPriceCents: z.number().int().min(0).nullable(),
  communicationPreferences: z.object({
    preferredChannel: z.enum(COMMUNICATION_CHANNELS),
    maxMessagesPerWeek: z.number().int().min(1).max(7),
    tone: z.enum(COMMUNICATION_TONES),
  }),
  membershipMappings: membershipMappingSettingsSchema.optional(),
  guestTrialOffers: guestTrialOfferSettingsSchema.optional(),
  referralOffers: referralOfferSettingsSchema.optional(),
  agentLive: z.boolean().optional(),
  permissions: agentPermissionSettingsSchema.optional(),
  controlPlane: agentControlPlaneSettingsSchema.optional(),
  lifecycleAutoExecutionEnabled: z.boolean().optional(),
  sandboxRouting: advisorSandboxRoutingSettingsSchema.optional(),
  autoApproveThreshold: z.number().int().min(0).max(100).optional(),
  notificationEmail: z.string().email().optional(),
  contactPolicy: advisorContactPolicyDraftSchema.omit({ changes: true }).optional(),
  autonomyPolicy: agentAutonomyPolicySchema.optional(),
  goals: z.array(z.enum(CLUB_GOALS)).min(1),
  onboardingCompletedAt: z.string().nullable(),
  onboardingVersion: z.number().int(),
})

export type IntelligenceSettingsInput = z.infer<typeof intelligenceSettingsSchema>

// ── Automation triggers schema (top-level automationSettings) ──

export const automationTriggersSchema = z.object({
  enabled: z.boolean().default(true),
  triggers: z.object({
    healthyToWatch: z.boolean().default(true),
    watchToAtRisk: z.boolean().default(true),
    atRiskToCritical: z.boolean().default(true),
    churned: z.boolean().default(true),
  }),
})

export type AutomationTriggersInput = z.infer<typeof automationTriggersSchema>

export const DEFAULT_AUTOMATION_TRIGGERS: AutomationTriggersInput = {
  enabled: true,
  triggers: {
    healthyToWatch: true,
    watchToAtRisk: true,
    atRiskToCritical: true,
    churned: true,
  },
}

// ── Default settings ──

export const DEFAULT_INTELLIGENCE_SETTINGS: IntelligenceSettingsInput = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  sportTypes: ['pickleball'],
  operatingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  operatingHours: { open: '07:00', close: '21:00' },
  peakHours: { start: '17:00', end: '20:00' },
  typicalSessionDurationMinutes: 90,
  courtCount: 4,
  hasIndoorCourts: false,
  hasOutdoorCourts: true,
  pricingModel: 'per_session',
  avgSessionPriceCents: 1500,
  communicationPreferences: {
    preferredChannel: 'email',
    maxMessagesPerWeek: 3,
    tone: 'friendly',
  },
  membershipMappings: {
    rules: [],
  },
  guestTrialOffers: {
    offers: [],
  },
  referralOffers: {
    offers: [],
  },
  permissions: {
    actions: {
      draftManage: { minimumRole: 'MODERATOR' },
      approveActions: { minimumRole: 'ADMIN' },
      outreachSend: { minimumRole: 'ADMIN' },
      schedulePublish: { minimumRole: 'ADMIN' },
      scheduleLiveEdit: { minimumRole: 'ADMIN' },
      scheduleLiveRollback: { minimumRole: 'ADMIN' },
      controlPlaneManage: { minimumRole: 'ADMIN' },
    },
  },
  controlPlane: {
    killSwitch: false,
    actions: {
      outreachSend: { mode: 'shadow' },
      schedulePublish: { mode: 'live' },
      scheduleLiveEdit: { mode: 'live' },
      scheduleLiveRollback: { mode: 'live' },
      adminReminderExternal: { mode: 'live' },
    },
    outreachRollout: {
      actions: {
        create_campaign: { enabled: false },
        fill_session: { enabled: false },
        reactivate_members: { enabled: false },
        trial_follow_up: { enabled: false },
        renewal_reactivation: { enabled: false },
      },
    },
  },
  lifecycleAutoExecutionEnabled: false,
  sandboxRouting: {
    mode: 'preview_only',
    emailRecipients: [],
    smsRecipients: [],
  },
  goals: ['fill_sessions'],
  onboardingCompletedAt: null,
  onboardingVersion: 1,
}
