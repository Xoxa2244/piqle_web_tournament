import { z } from 'zod'
import { advisorContactPolicyDraftSchema } from './advisor-contact-policy'

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

export const advisorActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create_cohort'),
    title: z.string().min(1).max(120),
    summary: z.string().max(240).optional(),
    requiresApproval: z.boolean().default(true),
    cohort: advisorCohortDraftSchema,
  }),
  z.object({
    kind: z.literal('create_campaign'),
    title: z.string().min(1).max(120),
    summary: z.string().max(240).optional(),
    requiresApproval: z.boolean().default(true),
    audience: advisorCohortDraftSchema,
    campaign: advisorCampaignDraftSchema,
  }),
  z.object({
    kind: z.literal('fill_session'),
    title: z.string().min(1).max(120),
    summary: z.string().max(240).optional(),
    requiresApproval: z.boolean().default(true),
    session: advisorSessionDraftSchema,
    outreach: advisorSlotFillerOutreachSchema,
  }),
  z.object({
    kind: z.literal('reactivate_members'),
    title: z.string().min(1).max(120),
    summary: z.string().max(240).optional(),
    requiresApproval: z.boolean().default(true),
    reactivation: advisorReactivationDraftSchema,
  }),
  z.object({
    kind: z.literal('update_contact_policy'),
    title: z.string().min(1).max(120),
    summary: z.string().max(240).optional(),
    requiresApproval: z.boolean().default(true),
    policy: advisorContactPolicyDraftSchema,
  }),
])

export type AdvisorAction = z.infer<typeof advisorActionSchema>

const ACTION_TAG_REGEX = /<action>\s*([\s\S]*?)\s*<\/action>/i

export function buildAdvisorActionTag(action: AdvisorAction) {
  return `<action>${JSON.stringify(action)}</action>`
}

export function extractAdvisorAction(text: string): AdvisorAction | null {
  const match = text.match(ACTION_TAG_REGEX)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1].trim())
    const result = advisorActionSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function stripAdvisorAction(text: string): string {
  return text.replace(ACTION_TAG_REGEX, '').replace(/\n{3,}/g, '\n\n').trim()
}
