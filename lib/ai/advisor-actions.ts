import { z } from 'zod'

export const advisorCampaignTypeEnum = z.enum([
  'CHECK_IN',
  'RETENTION_BOOST',
  'REACTIVATION',
  'SLOT_FILLER',
  'EVENT_INVITE',
  'NEW_MEMBER_WELCOME',
])

export const advisorChannelEnum = z.enum(['email', 'sms', 'both'])
export const advisorDeliveryModeEnum = z.enum(['save_draft', 'send_now'])
export const advisorRecipientRulesSchema = z.object({
  requireEmail: z.boolean().optional(),
  requirePhone: z.boolean().optional(),
  smsOptInOnly: z.boolean().optional(),
})
export const advisorCampaignExecutionSchema = z.object({
  mode: advisorDeliveryModeEnum.default('save_draft'),
  recipientRules: advisorRecipientRulesSchema.optional(),
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
