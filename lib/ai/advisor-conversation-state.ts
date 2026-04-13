import 'server-only'

import { z } from 'zod'
import {
  advisorCampaignDraftSchema,
  advisorCohortDraftSchema,
  advisorRenewalReactivationDraftSchema,
  advisorReactivationDraftSchema,
  advisorSessionDraftSchema,
  advisorTrialFollowUpDraftSchema,
  extractAdvisorAction,
  type AdvisorAction,
} from './advisor-actions'
import { advisorAutonomyPolicyDraftSchema } from './advisor-autonomy-policy'
import { isAdvisorActionHidden } from './advisor-action-state'
import { advisorContactPolicyDraftSchema } from './advisor-contact-policy'
import { advisorPendingClarificationSchema, type AdvisorPendingClarification } from './advisor-clarifications'
import { advisorOutcomeMemorySchema, type AdvisorOutcomeMemory } from './advisor-outcomes'
import { formatAdvisorScheduledLabel } from './advisor-scheduling'

const advisorActiveCampaignSchema = advisorCampaignDraftSchema.extend({
  audienceName: z.string().optional(),
  audienceCount: z.number().int().nonnegative().optional(),
})

export const advisorConversationStateSchema = z.object({
  currentAudience: advisorCohortDraftSchema.optional(),
  currentCampaign: advisorActiveCampaignSchema.optional(),
  currentSession: advisorSessionDraftSchema.optional(),
  currentReactivation: advisorReactivationDraftSchema.optional(),
  currentMembershipLifecycle: z.union([advisorTrialFollowUpDraftSchema, advisorRenewalReactivationDraftSchema]).optional(),
  currentContactPolicy: advisorContactPolicyDraftSchema.optional(),
  currentAutonomyPolicy: advisorAutonomyPolicyDraftSchema.optional(),
  latestOutcome: advisorOutcomeMemorySchema.optional(),
  recentOutcomes: z.array(advisorOutcomeMemorySchema).max(5).default([]),
  lastActionKind: z.enum(['create_cohort', 'create_campaign', 'fill_session', 'reactivate_members', 'trial_follow_up', 'renewal_reactivation', 'update_contact_policy', 'update_autonomy_policy']).optional(),
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

function finalizeAdvisorConversationState(state: Partial<AdvisorConversationState>): AdvisorConversationState {
  return advisorConversationStateSchema.parse(state)
}

function getStateFromMetadata(metadata: unknown): AdvisorConversationState | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const record = metadata as Record<string, unknown>
  return parseStateCandidate(record.advisorState)
}

export function getAdvisorConversationStateFromMetadata(metadata: unknown): AdvisorConversationState | null {
  return getStateFromMetadata(metadata)
}

export function buildAdvisorConversationStateFromAction(
  action: AdvisorAction,
  updatedAt: string = new Date().toISOString(),
): AdvisorConversationState {
  if (action.kind === 'create_cohort') {
    return finalizeAdvisorConversationState({
      currentAudience: action.cohort,
      lastActionKind: action.kind,
      lastActionTitle: action.title,
      updatedAt,
    })
  }

  if (action.kind === 'fill_session') {
    return finalizeAdvisorConversationState({
      currentSession: action.session,
      lastActionKind: action.kind,
      lastActionTitle: action.title,
      updatedAt,
    })
  }

  if (action.kind === 'reactivate_members') {
    return finalizeAdvisorConversationState({
      currentReactivation: action.reactivation,
      lastActionKind: action.kind,
      lastActionTitle: action.title,
      updatedAt,
    })
  }

  if (action.kind === 'trial_follow_up' || action.kind === 'renewal_reactivation') {
    return finalizeAdvisorConversationState({
      currentMembershipLifecycle: action.lifecycle,
      lastActionKind: action.kind,
      lastActionTitle: action.title,
      updatedAt,
    })
  }

  if (action.kind === 'update_contact_policy') {
    return finalizeAdvisorConversationState({
      currentContactPolicy: action.policy,
      lastActionKind: action.kind,
      lastActionTitle: action.title,
      updatedAt,
    })
  }

  if (action.kind === 'update_autonomy_policy') {
    return finalizeAdvisorConversationState({
      currentAutonomyPolicy: action.policy,
      lastActionKind: action.kind,
      lastActionTitle: action.title,
      updatedAt,
    })
  }

  return finalizeAdvisorConversationState({
    currentAudience: action.audience,
    currentCampaign: {
      ...action.campaign,
      audienceName: action.audience.name,
      audienceCount: action.audience.count,
    },
    lastActionKind: action.kind,
    lastActionTitle: action.title,
    updatedAt,
  })
}

export function withAdvisorPendingClarification(
  state: AdvisorConversationState | null,
  pendingClarification: AdvisorPendingClarification,
  updatedAt: string = new Date().toISOString(),
): AdvisorConversationState {
  return finalizeAdvisorConversationState({
    ...(state || {}),
    pendingClarification,
    updatedAt,
  })
}

export function clearAdvisorPendingClarification(
  state: AdvisorConversationState | null,
  updatedAt: string = new Date().toISOString(),
): AdvisorConversationState | null {
  if (!state?.pendingClarification) return state

  return finalizeAdvisorConversationState({
    ...state,
    pendingClarification: undefined,
    updatedAt,
  })
}

export function withAdvisorOutcome(
  state: AdvisorConversationState | null,
  outcome: AdvisorOutcomeMemory,
  updatedAt: string = new Date().toISOString(),
): AdvisorConversationState {
  const recentOutcomes = [
    outcome,
    ...((state?.recentOutcomes || []).filter((item) => item.summary !== outcome.summary || item.occurredAt !== outcome.occurredAt)),
  ].slice(0, 5)

  return finalizeAdvisorConversationState({
    ...(state || {}),
    latestOutcome: outcome,
    recentOutcomes,
    pendingClarification: undefined,
    lastActionKind: outcome.kind,
    lastActionTitle: outcome.title,
    updatedAt,
  })
}

export function deriveAdvisorConversationState(messages: ConversationMessageLike[]): AdvisorConversationState | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    if (isAdvisorActionHidden(message.metadata)) continue

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

  if (state.currentSession) {
    parts.push(`Active session: ${state.currentSession.title}`)
    parts.push(`Session timing: ${state.currentSession.date} ${state.currentSession.startTime}${state.currentSession.endTime ? `-${state.currentSession.endTime}` : ''}`)
    if (state.currentSession.court) parts.push(`Session court: ${state.currentSession.court}`)
    if (state.currentSession.format) parts.push(`Session format: ${state.currentSession.format}`)
    parts.push(`Open spots remaining: ${state.currentSession.spotsRemaining}`)
  }

  if (state.currentReactivation) {
    parts.push(`Active reactivation draft: ${state.currentReactivation.segmentLabel}`)
    parts.push(`Reactivation channel: ${state.currentReactivation.channel}`)
    parts.push(`Reactivation inactivity threshold: ${state.currentReactivation.inactivityDays} days`)
    parts.push(`Reactivation candidate count: ${state.currentReactivation.candidateCount}`)
    const sampleCandidates = state.currentReactivation.candidates
      .slice(0, 3)
      .map((candidate) => `${candidate.name} (${candidate.daysSinceLastActivity}d inactive)`)
    if (sampleCandidates.length > 0) parts.push(`Reactivation candidates: ${sampleCandidates.join(', ')}`)
    parts.push(`Reactivation note preview: ${state.currentReactivation.message.slice(0, 220)}`)
  }

  if (state.currentMembershipLifecycle) {
    parts.push(`Active membership flow: ${state.currentMembershipLifecycle.label}`)
    parts.push(`Lifecycle channel: ${state.currentMembershipLifecycle.channel}`)
    parts.push(`Lifecycle delivery mode: ${state.currentMembershipLifecycle.execution.mode}`)
    if (state.currentMembershipLifecycle.execution.mode === 'send_later' && state.currentMembershipLifecycle.execution.scheduledFor) {
      parts.push(
        `Lifecycle scheduled for: ${formatAdvisorScheduledLabel(
          state.currentMembershipLifecycle.execution.scheduledFor,
          state.currentMembershipLifecycle.execution.timeZone,
        )}`,
      )
    }
    parts.push(`Lifecycle candidate count: ${state.currentMembershipLifecycle.candidateCount}`)
    const lifecycleCandidates = state.currentMembershipLifecycle.candidates
      .slice(0, 3)
      .map((candidate) => `${candidate.name} (${candidate.membershipStatus}, ${candidate.daysSinceSignal}d)`)
    if (lifecycleCandidates.length > 0) parts.push(`Lifecycle candidates: ${lifecycleCandidates.join(', ')}`)
    parts.push(`Lifecycle message preview: ${state.currentMembershipLifecycle.message.slice(0, 220)}`)
  }

  if (state.currentContactPolicy) {
    parts.push(`Active contact policy draft: quiet hours ${state.currentContactPolicy.quietHours.startHour}:00-${state.currentContactPolicy.quietHours.endHour}:00`)
    parts.push(`Contact cooldown: ${state.currentContactPolicy.cooldownHours} hours`)
    parts.push(`Daily contact cap: ${state.currentContactPolicy.max24h}`)
    parts.push(`Weekly contact cap: ${state.currentContactPolicy.max7d}`)
    parts.push(`Recent booking suppression window: ${state.currentContactPolicy.recentBookingLookbackDays} days`)
    parts.push(`Contact policy time zone: ${state.currentContactPolicy.timeZone}`)
  }

  if (state.currentAutonomyPolicy) {
    parts.push(`Active autonomy policy draft: welcome ${state.currentAutonomyPolicy.welcome.mode}, slot filler ${state.currentAutonomyPolicy.slotFiller.mode}, check-in ${state.currentAutonomyPolicy.checkIn.mode}, retention ${state.currentAutonomyPolicy.retentionBoost.mode}, reactivation ${state.currentAutonomyPolicy.reactivation.mode}`)
    parts.push(`Slot filler auto thresholds: confidence ${state.currentAutonomyPolicy.slotFiller.minConfidenceAuto}, max ${state.currentAutonomyPolicy.slotFiller.maxRecipientsAuto}, membership required ${state.currentAutonomyPolicy.slotFiller.requireMembershipSignal ? 'yes' : 'no'}`)
    parts.push(`Reactivation auto thresholds: confidence ${state.currentAutonomyPolicy.reactivation.minConfidenceAuto}, max ${state.currentAutonomyPolicy.reactivation.maxRecipientsAuto}, membership required ${state.currentAutonomyPolicy.reactivation.requireMembershipSignal ? 'yes' : 'no'}`)
  }

  if (state.lastActionKind) {
    parts.push(`Last action: ${state.lastActionKind}${state.lastActionTitle ? ` (${state.lastActionTitle})` : ''}`)
  }

  if (state.latestOutcome) {
    parts.push(`Latest completed outcome: ${state.latestOutcome.summary}`)
  }

  if (state.recentOutcomes.length > 0) {
    parts.push(`Recent completed outcomes: ${state.recentOutcomes.slice(0, 3).map((outcome) => outcome.summary).join(' | ')}`)
  }

  if (state.pendingClarification) {
    parts.push(`Pending clarification: ${state.pendingClarification.question}`)
    if (state.pendingClarification.options.length > 0) {
      parts.push(`Clarification options: ${state.pendingClarification.options.join(' | ')}`)
    }
  }

  parts.push('If the user says "this audience", "that list", "those players", or "them", assume they mean the active audience above unless they clarify otherwise.')
  parts.push('If the user says "the campaign", "the draft", "the message", or asks to revise it, assume they mean the active campaign above unless they clarify otherwise.')
  parts.push('If the user says "this session", "that slot", or "fill it", assume they mean the active session above unless they clarify otherwise.')
  parts.push('If the user says "those inactive members", "the reactivation list", or asks to revise the win-back message, assume they mean the active reactivation draft above unless they clarify otherwise.')
  parts.push('If the user says "those rules", "that policy", or asks to tighten or relax messaging rules, assume they mean the active contact policy draft above unless they clarify otherwise.')
  parts.push('If the user says "autopilot", "autonomy rules", "approval matrix", or "that automation policy", assume they mean the active autonomy policy draft above unless they clarify otherwise.')
  parts.push('--- End of Active Advisor Working Memory ---')

  return parts.join('\n')
}
