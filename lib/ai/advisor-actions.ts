import { z } from 'zod'
import { advisorAutonomyPolicyDraftSchema } from './advisor-autonomy-policy'
import { advisorContactPolicyDraftSchema } from './advisor-contact-policy'
import { advisorSandboxRoutingDraftSchema } from './advisor-sandbox-policy'

export const advisorCampaignTypeEnum = z.enum([
  'CHECK_IN',
  'RETENTION_BOOST',
  'REACTIVATION',
  'SLOT_FILLER',
  'EVENT_INVITE',
  'NEW_MEMBER_WELCOME',
])

export const advisorChannelEnum = z.enum(['email', 'sms', 'both'])
export const advisorDeliveryModeEnum = z.enum(['save_draft', 'send_now', 'send_later'])
export const advisorMembershipLifecycleKindEnum = z.enum(['trial_follow_up', 'renewal_reactivation'])
export const advisorGuardrailReasonSchema = z.object({
  code: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  count: z.number().int().positive(),
})
export const advisorContactGuardrailsSchema = z.object({
  requestedChannel: advisorChannelEnum,
  eligibleCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  deliveryBreakdown: z.object({
    email: z.number().int().nonnegative(),
    sms: z.number().int().nonnegative(),
    both: z.number().int().nonnegative(),
  }),
  reasons: z.array(advisorGuardrailReasonSchema).max(8).default([]),
  warnings: z.array(z.string().min(1).max(200)).max(4).default([]),
})
export const advisorRecipientRulesSchema = z.object({
  requireEmail: z.boolean().optional(),
  requirePhone: z.boolean().optional(),
  smsOptInOnly: z.boolean().optional(),
})
export const advisorCampaignExecutionSchema = z.object({
  mode: advisorDeliveryModeEnum.default('save_draft'),
  recipientRules: advisorRecipientRulesSchema.optional(),
  scheduledFor: z.string().datetime().optional(),
  timeZone: z.string().min(1).max(80).optional(),
})
export const advisorProgramProposalSourceEnum = z.enum(['expand_peak', 'fill_gap'])
export const advisorPerformanceSignalSchema = z.object({
  headline: z.string().min(1).max(220),
  bullets: z.array(z.string().min(1).max(220)).max(4).default([]),
})
export const advisorAdaptiveChannelDefaultSchema = z.object({
  value: advisorChannelEnum,
  label: z.string().min(1).max(80),
  reason: z.string().min(1).max(220),
})
export const advisorAdaptiveScheduledDefaultSchema = z.object({
  scheduledFor: z.string().datetime(),
  timeZone: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  reason: z.string().min(1).max(220),
})
export const advisorAdaptiveDefaultsAppliedSchema = z.object({
  channel: advisorAdaptiveChannelDefaultSchema.optional(),
  scheduledSend: advisorAdaptiveScheduledDefaultSchema.optional(),
})

export const cohortFilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
})

export const advisorCohortDraftSchema = z.object({
  cohortId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  filters: z.array(cohortFilterSchema).min(1),
  count: z.number().int().nonnegative().optional(),
})

export const advisorCampaignDraftSchema = z.object({
  type: advisorCampaignTypeEnum,
  channel: advisorChannelEnum,
  subject: z.string().max(100).optional(),
  body: z.string().min(1).max(2000),
  smsBody: z.string().max(500).optional(),
  execution: advisorCampaignExecutionSchema.default({ mode: 'save_draft' }),
  guardrails: advisorContactGuardrailsSchema.optional(),
})

export const advisorSessionDraftSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  date: z.string().min(1).max(40),
  startTime: z.string().min(1).max(20),
  endTime: z.string().max(20).optional().nullable(),
  format: z.string().max(80).optional().nullable(),
  skillLevel: z.string().max(40).optional().nullable(),
  court: z.string().max(80).optional().nullable(),
  registered: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  occupancy: z.number().int().min(0).max(100),
  spotsRemaining: z.number().int().nonnegative(),
})

export const advisorSlotFillerCandidateSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1).max(120),
  score: z.number().int().min(0).max(100),
  likelihood: z.enum(['high', 'medium', 'low']).optional(),
  email: z.string().max(200).optional(),
  channel: advisorChannelEnum.optional(),
})

export const advisorSlotFillerOutreachSchema = z.object({
  channel: advisorChannelEnum,
  candidateCount: z.number().int().positive(),
  message: z.string().min(1).max(2000),
  candidates: z.array(advisorSlotFillerCandidateSchema).min(1).max(20),
  guardrails: advisorContactGuardrailsSchema.optional(),
})

export const advisorReactivationCandidateSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1).max(120),
  score: z.number().int().min(0).max(100),
  daysSinceLastActivity: z.number().int().nonnegative(),
  topReason: z.string().max(240).optional(),
  suggestedSessionTitle: z.string().max(160).optional(),
  channel: advisorChannelEnum.optional(),
})

export const advisorReactivationDraftSchema = z.object({
  segmentLabel: z.string().min(1).max(120),
  inactivityDays: z.number().int().min(7).max(365),
  channel: advisorChannelEnum,
  candidateCount: z.number().int().positive(),
  message: z.string().min(1).max(500),
  candidates: z.array(advisorReactivationCandidateSchema).min(1).max(25),
  guardrails: advisorContactGuardrailsSchema.optional(),
})

export const advisorMembershipLifecycleCandidateSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1).max(120),
  score: z.number().int().min(0).max(100),
  daysSinceSignal: z.number().int().nonnegative(),
  membershipStatus: z.string().min(1).max(40),
  topReason: z.string().min(1).max(240),
  channel: advisorChannelEnum.optional(),
})

const advisorMembershipLifecycleDraftBaseSchema = z.object({
  label: z.string().min(1).max(140),
  channel: advisorChannelEnum,
  candidateCount: z.number().int().positive(),
  subject: z.string().max(100).optional(),
  message: z.string().min(1).max(600),
  smsBody: z.string().max(500).optional(),
  execution: advisorCampaignExecutionSchema.default({ mode: 'save_draft' }),
  candidates: z.array(advisorMembershipLifecycleCandidateSchema).min(1).max(25),
  guardrails: advisorContactGuardrailsSchema.optional(),
})

export const advisorTrialFollowUpDraftSchema = advisorMembershipLifecycleDraftBaseSchema.extend({
  lifecycle: z.literal('trial_follow_up'),
  campaignType: z.literal('RETENTION_BOOST'),
})

export const advisorRenewalReactivationDraftSchema = advisorMembershipLifecycleDraftBaseSchema.extend({
  lifecycle: z.literal('renewal_reactivation'),
  campaignType: z.literal('REACTIVATION'),
})

export const advisorProgrammingProposalSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  timeSlot: z.enum(['morning', 'afternoon', 'evening']),
  startTime: z.string().min(1).max(20),
  endTime: z.string().min(1).max(20),
  format: z.enum(['OPEN_PLAY', 'CLINIC', 'DRILL', 'LEAGUE_PLAY', 'SOCIAL']),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']),
  maxPlayers: z.number().int().min(2).max(24),
  projectedOccupancy: z.number().int().min(0).max(100),
  estimatedInterestedMembers: z.number().int().nonnegative(),
  confidence: z.number().int().min(0).max(100),
  source: advisorProgramProposalSourceEnum,
  rationale: z.array(z.string().min(1).max(220)).min(1).max(4),
})

export const advisorProgrammingDraftSchema = z.object({
  goal: z.string().min(1).max(180),
  primary: advisorProgrammingProposalSchema,
  alternatives: z.array(advisorProgrammingProposalSchema).max(3).default([]),
  insights: z.array(z.string().min(1).max(220)).max(4).default([]),
  publishMode: z.literal('draft_only').default('draft_only'),
})

const createCohortActionCoreSchema = z.object({
  kind: z.literal('create_cohort'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  cohort: advisorCohortDraftSchema,
})

const createCampaignActionCoreSchema = z.object({
  kind: z.literal('create_campaign'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  audience: advisorCohortDraftSchema,
  campaign: advisorCampaignDraftSchema,
  signals: advisorPerformanceSignalSchema.optional(),
  defaultsApplied: advisorAdaptiveDefaultsAppliedSchema.optional(),
})

const fillSessionActionCoreSchema = z.object({
  kind: z.literal('fill_session'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  session: advisorSessionDraftSchema,
  outreach: advisorSlotFillerOutreachSchema,
  signals: advisorPerformanceSignalSchema.optional(),
  defaultsApplied: advisorAdaptiveDefaultsAppliedSchema.optional(),
})

const reactivateMembersActionCoreSchema = z.object({
  kind: z.literal('reactivate_members'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  reactivation: advisorReactivationDraftSchema,
  signals: advisorPerformanceSignalSchema.optional(),
  defaultsApplied: advisorAdaptiveDefaultsAppliedSchema.optional(),
})

const trialFollowUpActionCoreSchema = z.object({
  kind: z.literal('trial_follow_up'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  lifecycle: advisorTrialFollowUpDraftSchema,
  signals: advisorPerformanceSignalSchema.optional(),
  defaultsApplied: advisorAdaptiveDefaultsAppliedSchema.optional(),
})

const renewalReactivationActionCoreSchema = z.object({
  kind: z.literal('renewal_reactivation'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  lifecycle: advisorRenewalReactivationDraftSchema,
  signals: advisorPerformanceSignalSchema.optional(),
  defaultsApplied: advisorAdaptiveDefaultsAppliedSchema.optional(),
})

const programScheduleActionCoreSchema = z.object({
  kind: z.literal('program_schedule'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  program: advisorProgrammingDraftSchema,
})

const updateContactPolicyActionCoreSchema = z.object({
  kind: z.literal('update_contact_policy'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  policy: advisorContactPolicyDraftSchema,
})

const updateAutonomyPolicyActionCoreSchema = z.object({
  kind: z.literal('update_autonomy_policy'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  policy: advisorAutonomyPolicyDraftSchema,
})

const updateSandboxRoutingActionCoreSchema = z.object({
  kind: z.literal('update_sandbox_routing'),
  title: z.string().min(1).max(120),
  summary: z.string().max(240).optional(),
  requiresApproval: z.boolean().default(true),
  policy: advisorSandboxRoutingDraftSchema,
})

export const advisorActionCoreSchema = z.discriminatedUnion('kind', [
  createCohortActionCoreSchema,
  createCampaignActionCoreSchema,
  fillSessionActionCoreSchema,
  reactivateMembersActionCoreSchema,
  trialFollowUpActionCoreSchema,
  renewalReactivationActionCoreSchema,
  programScheduleActionCoreSchema,
  updateContactPolicyActionCoreSchema,
  updateAutonomyPolicyActionCoreSchema,
  updateSandboxRoutingActionCoreSchema,
])

export const advisorActionRecommendationSchema = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().max(240).optional(),
  why: z.array(z.string().min(1).max(220)).min(1).max(4),
  highlights: z.array(z.string().min(1).max(120)).max(4).default([]),
  action: advisorActionCoreSchema,
})

export const advisorActionSchema = advisorActionCoreSchema.and(
  z.object({
    recommendation: advisorActionRecommendationSchema.optional(),
  }),
)

export type AdvisorActionCore = z.infer<typeof advisorActionCoreSchema>
export type AdvisorActionRecommendation = z.infer<typeof advisorActionRecommendationSchema>
export type AdvisorAction = z.infer<typeof advisorActionSchema>
export type AdvisorAdaptiveDefaultsApplied = z.infer<typeof advisorAdaptiveDefaultsAppliedSchema>

const ACTION_TAG_REGEX = /<action>\s*([\s\S]*?)\s*<\/action>/i

function parseAdvisorActionCandidate(value: unknown): AdvisorAction | null {
  const result = advisorActionSchema.safeParse(value)
  return result.success ? result.data : null
}

export function stripAdvisorRecommendation(action: AdvisorAction | AdvisorActionCore): AdvisorActionCore {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return action as AdvisorActionCore
  }

  const { recommendation: _recommendation, ...rest } = action as AdvisorAction & {
    recommendation?: AdvisorActionRecommendation
  }

  return rest as AdvisorActionCore
}

export function buildAdvisorActionTag(action: AdvisorAction) {
  return `<action>${JSON.stringify(action)}</action>`
}

export function extractAdvisorAction(text: string): AdvisorAction | null {
  const match = text.match(ACTION_TAG_REGEX)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1].trim())
    return parseAdvisorActionCandidate(parsed)
  } catch {
    return null
  }
}

export function getAdvisorActionFromMetadata(metadata: unknown): AdvisorAction | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const record = metadata as Record<string, unknown>
  return parseAdvisorActionCandidate(record.advisorResolvedAction ?? record.advisorAction)
}

export function stripAdvisorAction(text: string): string {
  return text.replace(ACTION_TAG_REGEX, '').replace(/\n{3,}/g, '\n\n').trim()
}
