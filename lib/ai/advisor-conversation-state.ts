import 'server-only'

import { z } from 'zod'
import {
  advisorCampaignDraftSchema,
  advisorCohortDraftSchema,
  extractAdvisorAction,
  type AdvisorAction,
} from './advisor-actions'
import { advisorPendingClarificationSchema, type AdvisorPendingClarification } from './advisor-clarifications'
import { formatAdvisorScheduledLabel } from './advisor-scheduling'

const advisorActiveCampaignSchema = advisorCampaignDraftSchema.extend({
  audienceName: z.string().optional(),
  audienceCount: z.number().int().nonnegative().optional(),
})

export const advisorConversationStateSchema = z.object({
  currentAudience: advisorCohortDraftSchema.optional(),
  currentCampaign: advisorActiveCampaignSchema.optional(),
  lastActionKind: z.enum(['create_cohort', 'create_campaign']).optional(),
  lastActionTitle: z.string().max(120).optional(),
  pendingClarification: advisorPendingClarificationSchema.optional(),
  updatedAt: z.string().optional(),
})

export type AdvisorConversationState = z.infer<typeof advisorConversationStateSchema>

type ConversationMessageLike = {
  role?: string | null
  content?: string | null
  metadata?: unknown
}

function parseStateCandidate(value: unknown): AdvisorConversationState | null {
  const parsed = advisorConversationStateSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function getStateFromMetadata(metadata: unknown): AdvisorConversationState | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const record = metadata as Record<string, unknown>
  return parseStateCandidate(record.advisorState)
}

export function buildAdvisorConversationStateFromAction(
  action: AdvisorAction,
  updatedAt: string = new Date().toISOString(),
): AdvisorConversationState {
  if (action.kind === 'create_cohort') {
    return {
      currentAudience: action.cohort,
      lastActionKind: action.kind,
      lastActionTitle: action.title,
      updatedAt,
    }
  }

  return {
    currentAudience: action.audience,
    currentCampaign: {
      ...action.campaign,
      audienceName: action.audience.name,
      audienceCount: action.audience.count,
    },
    lastActionKind: action.kind,
    lastActionTitle: action.title,
    updatedAt,
  }
}

export function withAdvisorPendingClarification(
  state: AdvisorConversationState | null,
  pendingClarification: AdvisorPendingClarification,
  updatedAt: string = new Date().toISOString(),
): AdvisorConversationState {
  return {
    ...(state || {}),
    pendingClarification,
    updatedAt,
  }
}

export function clearAdvisorPendingClarification(
  state: AdvisorConversationState | null,
  updatedAt: string = new Date().toISOString(),
): AdvisorConversationState | null {
  if (!state?.pendingClarification) return state

  return {
    ...state,
    pendingClarification: undefined,
    updatedAt,
  }
}

export function deriveAdvisorConversationState(messages: ConversationMessageLike[]): AdvisorConversationState | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue

    const metadataState = getStateFromMetadata(message.metadata)
    if (metadataState) return metadataState

    if (typeof message.content === 'string') {
      const action = extractAdvisorAction(message.content)
      if (action) return buildAdvisorConversationStateFromAction(action)
    }
  }

  return null
}

export function buildAdvisorStatePrompt(state: AdvisorConversationState | null): string {
  if (!state) return ''

  const parts = ['\n\n--- Active Advisor Working Memory ---']

  if (state.currentAudience) {
    const filters = state.currentAudience.filters
      .slice(0, 4)
      .map((filter) => `${filter.field} ${filter.op} ${Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}`)
      .join('; ')

    parts.push(`Active audience: ${state.currentAudience.name}`)
    if (state.currentAudience.description) parts.push(`Audience description: ${state.currentAudience.description}`)
    if (typeof state.currentAudience.count === 'number') parts.push(`Audience size preview: ${state.currentAudience.count}`)
    if (filters) parts.push(`Audience filters: ${filters}`)
  }

  if (state.currentCampaign) {
    parts.push(`Active campaign draft: ${state.currentCampaign.type} via ${state.currentCampaign.channel}`)
    parts.push(`Campaign delivery mode: ${state.currentCampaign.execution.mode}`)
    if (state.currentCampaign.execution.mode === 'send_later' && state.currentCampaign.execution.scheduledFor) {
      parts.push(
        `Campaign scheduled for: ${formatAdvisorScheduledLabel(
          state.currentCampaign.execution.scheduledFor,
          state.currentCampaign.execution.timeZone,
        )}`,
      )
    }
    if (state.currentCampaign.audienceName) parts.push(`Campaign audience: ${state.currentCampaign.audienceName}`)
    if (typeof state.currentCampaign.audienceCount === 'number') parts.push(`Campaign audience count: ${state.currentCampaign.audienceCount}`)
    const ruleParts = [
      state.currentCampaign.execution.recipientRules?.requireEmail ? 'require email' : null,
      state.currentCampaign.execution.recipientRules?.requirePhone ? 'require phone' : null,
      state.currentCampaign.execution.recipientRules?.smsOptInOnly ? 'SMS opt-in only' : null,
    ].filter(Boolean)
    if (ruleParts.length > 0) parts.push(`Campaign recipient rules: ${ruleParts.join(', ')}`)
    if (state.currentCampaign.subject) parts.push(`Campaign subject: ${state.currentCampaign.subject}`)
    parts.push(`Campaign body preview: ${state.currentCampaign.body.slice(0, 280)}`)
  }

  if (state.lastActionKind) {
    parts.push(`Last action: ${state.lastActionKind}${state.lastActionTitle ? ` (${state.lastActionTitle})` : ''}`)
  }

  if (state.pendingClarification) {
    parts.push(`Pending clarification: ${state.pendingClarification.question}`)
    if (state.pendingClarification.options.length > 0) {
      parts.push(`Clarification options: ${state.pendingClarification.options.join(' | ')}`)
    }
  }

  parts.push('If the user says "this audience", "that list", "those players", or "them", assume they mean the active audience above unless they clarify otherwise.')
  parts.push('If the user says "the campaign", "the draft", "the message", or asks to revise it, assume they mean the active campaign above unless they clarify otherwise.')
  parts.push('--- End of Active Advisor Working Memory ---')

  return parts.join('\n')
}
