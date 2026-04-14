import { getServerSession } from 'next-auth'
import { parse as parseCookie } from 'cookie'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { appRouter } from '@/server/routers/_app'
import { detectLanguage, type SupportedLanguage } from '@/lib/ai/llm/language'
import {
  buildAdvisorActionTag,
  extractAdvisorAction,
  getAdvisorActionFromMetadata,
  stripAdvisorRecommendation,
  type AdvisorAction,
  type AdvisorAdaptiveDefaultsApplied,
  type AdvisorActionCore,
} from '@/lib/ai/advisor-actions'
import { getAdvisorActionCopy, planAdvisorActionIntent, type AdvisorIntentPlan } from '@/lib/ai/advisor-action-planner'
import {
  isAdvisorActionHidden,
} from '@/lib/ai/advisor-action-state'
import {
  formatAdvisorAutonomyPolicyDigest,
  resolveAdvisorAutonomyPolicy,
  updateAdvisorAutonomyPolicyFromMessage,
  type AdvisorAutonomyPolicyDraft,
} from '@/lib/ai/advisor-autonomy-policy'
import {
  type AdvisorConversationState,
  buildAdvisorConversationStateFromAction,
  deriveAdvisorConversationState,
  withAdvisorCurrentDraft,
  withAdvisorPendingClarification,
} from '@/lib/ai/advisor-conversation-state'
import {
  persistAdvisorDraft,
  withAdvisorDraftMetadata,
} from '@/lib/ai/advisor-drafts'
import { getAdvisorEditCopy, maybeEditAdvisorDraft } from '@/lib/ai/advisor-draft-editor'
import {
  evaluateAdvisorContactGuardrails,
  formatAdvisorGuardrailDigest,
} from '@/lib/ai/advisor-contact-guardrails'
import {
  buildAdvisorPerformanceSignalForAction,
  resolveAdvisorAdaptiveDefaultsForAction,
} from '@/lib/ai/advisor-outcome-insights'
import { buildAdvisorRecommendation } from '@/lib/ai/advisor-recommendations'
import {
  formatAdvisorContactPolicyDigest,
  resolveAdvisorContactPolicy,
  updateAdvisorContactPolicyFromMessage,
  type AdvisorContactPolicyDraft,
} from '@/lib/ai/advisor-contact-policy'
import {
  formatAdvisorSandboxRoutingDigest,
  resolveAdvisorSandboxRoutingDraft,
  updateAdvisorSandboxRoutingFromMessage,
  type AdvisorSandboxRoutingDraft,
} from '@/lib/ai/advisor-sandbox-policy'
import {
  extractExplicitAdvisorChannel,
  maybeStartAdvisorClarification,
  resolveAdvisorClarification,
} from '@/lib/ai/advisor-clarifications'
import {
  buildAdvisorReactivationLabel,
  parseAdvisorInactivityDays,
} from '@/lib/ai/advisor-reactivation'
import {
  formatAdvisorScheduledLabel,
  parseAdvisorScheduledSend,
  resolveAdvisorClubTimeZone,
} from '@/lib/ai/advisor-scheduling'
import {
  buildAdvisorSlotSessionOptions,
  formatAdvisorSlotSessionLabel,
  resolveAdvisorSlotSession,
  type AdvisorSlotSessionOption,
} from '@/lib/ai/advisor-slot-filler'
import {
  getAdvisorMembershipLifecycleCandidates,
  getAdvisorMembershipLifecycleMeta,
  type AdvisorMembershipLifecycleKind,
} from '@/lib/ai/advisor-membership-lifecycle'
import {
  getAdvisorProgrammingDraft,
  type AdvisorProgrammingRequestSpec,
} from '@/lib/ai/advisor-programming'
import { buildCohortWhereClause, type CohortFilter } from '@/server/routers/intelligence'

async function getSessionFromRequest(req: Request) {
  try {
    const nextAuthSession = await getServerSession(authOptions)
    if (nextAuthSession?.user?.id) {
      return { userId: nextAuthSession.user.id, user: nextAuthSession.user }
    }
  } catch (e) {
    console.warn('[Advisor Action] getServerSession failed, falling back to cookie:', e)
  }

  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies = parseCookie(cookieHeader)
  const sessionToken =
    cookies['__Secure-next-auth.session-token'] ||
    cookies['__Host-next-auth.session-token'] ||
    cookies['next-auth.session-token'] ||
    cookies['_Secure-next-auth.session-token'] ||
    null

  if (!sessionToken) return null

  const dbSession = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  })

  if (!dbSession || dbSession.expires < new Date()) return null
  return { userId: dbSession.userId, user: dbSession.user }
}

async function verifyClubMembership(clubId: string, userId: string) {
  const [admin, follower] = await Promise.all([
    prisma.clubAdmin.findFirst({ where: { clubId, userId } }),
    prisma.clubFollower.findFirst({ where: { clubId, userId } }),
  ])

  return { isAdmin: !!admin, hasAccess: !!(admin || follower) }
}

function buildSessionForCaller(session: Awaited<ReturnType<typeof getSessionFromRequest>>) {
  if (!session) return null
  return {
    user: {
      id: session.userId,
      email: session.user?.email || null,
      name: session.user?.name || null,
      image: session.user?.image || null,
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
}

async function getOrCreateConversation(opts: {
  clubId: string
  userId: string
  conversationId?: string | null
  titleSource: string
  language: SupportedLanguage
}) {
  if (opts.conversationId) {
    const existing = await prisma.aIConversation.findFirst({
      where: { id: opts.conversationId, clubId: opts.clubId, userId: opts.userId },
      select: { id: true },
    })
    if (existing) return existing.id
  }

  const conversation = await prisma.aIConversation.create({
    data: {
      clubId: opts.clubId,
      userId: opts.userId,
      title: opts.titleSource.slice(0, 100) || 'New conversation',
      language: opts.language,
    },
    select: { id: true },
  })

  return conversation.id
}

async function getLastAdvisorAction(conversationId: string): Promise<AdvisorAction | null> {
  const priorMessages = await prisma.aIMessage.findMany({
    where: { conversationId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { content: true, metadata: true },
  })

  for (const message of priorMessages) {
    if (isAdvisorActionHidden(message.metadata)) continue
    const action = getAdvisorActionFromMetadata(message.metadata) || extractAdvisorAction(message.content)
    if (action) return action
  }

  return null
}

async function getAdvisorConversationMemory(conversationId: string) {
  const priorMessages = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { role: true, content: true, metadata: true },
  })

  let lastAction: AdvisorAction | null = null
  for (let index = priorMessages.length - 1; index >= 0; index -= 1) {
    const message = priorMessages[index]
    if (message.role !== 'assistant') continue
    if (isAdvisorActionHidden(message.metadata)) continue
    const action = getAdvisorActionFromMetadata(message.metadata) || extractAdvisorAction(message.content)
    if (action) {
      lastAction = action
      break
    }
  }

  return {
    state: deriveAdvisorConversationState(priorMessages),
    lastAction,
  }
}

function withSuggested(text: string, suggestions: string[]) {
  return `${text}\n\n<suggested>\n${suggestions.join('\n')}\n</suggested>`
}

function truncateAdvisorText(text: string, maxChars: number) {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trim()}…`
}

async function persistAdvisorExchange(opts: {
  clubId: string
  userId: string
  conversationId: string
  userMessage: string
  assistantMessage: string
  titleSource: string
  language: SupportedLanguage
  assistantState?: AdvisorConversationState | null
  action?: AdvisorAction | null
  existingDraftId?: string | null
}) {
  await prisma.aIMessage.create({
    data: {
      conversationId: opts.conversationId,
      role: 'user',
      content: opts.userMessage,
      metadata: {},
    },
  })

  const occurredAt = new Date().toISOString()
  const assistantMetadata = {
    source: 'advisor_action',
    handled: true,
    ...(opts.assistantState ? { advisorState: opts.assistantState } : {}),
    ...(opts.action ? { advisorResolvedAction: opts.action } : {}),
    ...(opts.action
      ? { advisorActionState: { status: 'active' as const, updatedAt: occurredAt } }
      : {}),
  }

  const assistantRecord = await prisma.aIMessage.create({
    data: {
      conversationId: opts.conversationId,
      role: 'assistant',
      content: opts.assistantMessage,
      metadata: assistantMetadata,
    },
    select: {
      id: true,
      metadata: true,
    },
  })

  let finalMetadata: any = assistantRecord.metadata

  if (opts.action) {
    const persistedDraft = await persistAdvisorDraft({
      prisma,
      clubId: opts.clubId,
      userId: opts.userId,
      conversationId: opts.conversationId,
      sourceMessageId: assistantRecord.id,
      existingDraftId: opts.existingDraftId,
      action: opts.action,
      originalIntent: opts.titleSource,
    })

    if (persistedDraft) {
      const nextState = withAdvisorCurrentDraft(
        opts.assistantState || buildAdvisorConversationStateFromAction(opts.action, occurredAt),
        persistedDraft,
        occurredAt,
      )

      finalMetadata = withAdvisorDraftMetadata(
        {
          ...assistantMetadata,
          advisorState: nextState,
        },
        persistedDraft,
      )

      await prisma.aIMessage.update({
        where: { id: assistantRecord.id },
        data: { metadata: finalMetadata as any },
      })
    }
  }

  await prisma.aIConversation.update({
    where: { id: opts.conversationId },
    data: {
      title: opts.titleSource.slice(0, 100),
      language: opts.language,
      updatedAt: new Date(),
    },
  }).catch(() => {})

  return {
    ...assistantRecord,
    metadata: finalMetadata,
  }
}

function buildCampaignReadyText(
  copy: ReturnType<typeof getAdvisorActionCopy>,
  count: number,
  name: string,
  mode: 'save_draft' | 'send_now' | 'send_later',
  scheduledLabel?: string | null,
) {
  if (mode === 'send_now') return copy.campaignReady(count, name)
  if (mode === 'send_later') return copy.campaignScheduledReady(count, name, scheduledLabel || 'the selected time')
  return copy.campaignDraftReady(count, name)
}

function humanizeAdvisorFlow(type: string) {
  return type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatAdvisorChannelLabel(channel: 'email' | 'sms' | 'both') {
  if (channel === 'sms') return 'SMS'
  if (channel === 'both') return 'Email + SMS'
  return 'Email'
}

function buildAdvisorAdaptiveDefaultsApplied(opts: {
  type: string
  channel?: 'email' | 'sms' | 'both'
  channelDerivedFromOutcomes?: boolean
  scheduledSend?: {
    scheduledFor: string
    timeZone: string
    label: string
  } | null
}): AdvisorAdaptiveDefaultsApplied | undefined {
  const flowLabel = humanizeAdvisorFlow(opts.type)
  const defaultsApplied: AdvisorAdaptiveDefaultsApplied = {}

  if (opts.channel && opts.channelDerivedFromOutcomes) {
    defaultsApplied.channel = {
      value: opts.channel,
      label: formatAdvisorChannelLabel(opts.channel),
      reason: `Agent defaulted the channel to ${formatAdvisorChannelLabel(opts.channel)} because recent ${flowLabel.toLowerCase()} results were strongest there.`,
    }
  }

  if (opts.scheduledSend) {
    defaultsApplied.scheduledSend = {
      scheduledFor: opts.scheduledSend.scheduledFor,
      timeZone: opts.scheduledSend.timeZone,
      label: opts.scheduledSend.label,
      reason: `Agent defaulted the send time to ${opts.scheduledSend.label} because that hour performed best recently for ${flowLabel.toLowerCase()} outreach.`,
    }
  }

  return defaultsApplied.channel || defaultsApplied.scheduledSend ? defaultsApplied : undefined
}

type AdvisorCampaignAction = Extract<AdvisorActionCore, { kind: 'create_campaign' }>
type AdvisorFillSessionAction = Extract<AdvisorActionCore, { kind: 'fill_session' }>
type AdvisorReactivationAction = Extract<AdvisorActionCore, { kind: 'reactivate_members' }>
type AdvisorContactPolicyAction = Extract<AdvisorActionCore, { kind: 'update_contact_policy' }>
type AdvisorAutonomyPolicyAction = Extract<AdvisorActionCore, { kind: 'update_autonomy_policy' }>
type AdvisorSandboxRoutingAction = Extract<AdvisorActionCore, { kind: 'update_sandbox_routing' }>
type AdvisorTrialFollowUpAction = Extract<AdvisorActionCore, { kind: 'trial_follow_up' }>
type AdvisorRenewalReactivationAction = Extract<AdvisorActionCore, { kind: 'renewal_reactivation' }>
type AdvisorMembershipLifecycleAction = AdvisorTrialFollowUpAction | AdvisorRenewalReactivationAction
type AdvisorProgrammingAction = Extract<AdvisorAction, { kind: 'program_schedule' }>

function buildRecommendationTitle(action: { kind: AdvisorActionCore['kind'] }) {
  if (action.kind === 'fill_session') return 'Agent recommendation for this session'
  if (action.kind === 'reactivate_members') return 'Agent recommendation for this win-back flow'
  if (action.kind === 'trial_follow_up') return 'Agent recommendation for this trial follow-up'
  if (action.kind === 'renewal_reactivation') return 'Agent recommendation for this renewal outreach'
  if (action.kind === 'program_schedule') return 'Agent recommendation for this programming plan'
  if (action.kind === 'create_campaign') return 'Agent recommendation for this campaign'
  return 'Agent recommendation'
}

function buildRecommendationChannelHighlight(channel: 'email' | 'sms' | 'both') {
  return `Switch to ${formatAdvisorChannelLabel(channel)}`
}

function getAdvisorActionEligibleCount(action: AdvisorAction | AdvisorActionCore) {
  if (action.kind === 'create_campaign') return action.campaign.guardrails?.eligibleCount ?? action.audience.count ?? 0
  if (action.kind === 'fill_session') return action.outreach.guardrails?.eligibleCount ?? action.outreach.candidateCount
  if (action.kind === 'reactivate_members') return action.reactivation.guardrails?.eligibleCount ?? action.reactivation.candidateCount
  if (action.kind === 'trial_follow_up' || action.kind === 'renewal_reactivation') {
    return action.lifecycle.guardrails?.eligibleCount ?? action.lifecycle.candidateCount
  }
  return 0
}

function sameProgrammingProposal(
  left: AdvisorProgrammingAction['program']['primary'],
  right: AdvisorProgrammingAction['program']['primary'],
) {
  return (
    left.dayOfWeek === right.dayOfWeek &&
    left.timeSlot === right.timeSlot &&
    left.format === right.format &&
    left.skillLevel === right.skillLevel &&
    left.startTime === right.startTime &&
    left.endTime === right.endTime
  )
}

function formatProgrammingTimeSlot(slot: 'morning' | 'afternoon' | 'evening') {
  if (slot === 'morning') return 'Morning'
  if (slot === 'afternoon') return 'Afternoon'
  return 'Evening'
}

function sameAdvisorScheduledMoment(a?: string, b?: string) {
  if (!a || !b) return false
  return new Date(a).getTime() === new Date(b).getTime()
}

function buildScheduleRecommendationHighlight(label: string) {
  return `Shift send time to ${label}`
}

async function queryAdvisorAudienceMembers(clubId: string, filters: CohortFilter[]) {
  const where = buildCohortWhereClause(filters)
  return prisma.$queryRawUnsafe<Array<{
    id: string
    name: string | null
    email: string | null
    phone: string | null
    smsOptIn: boolean | null
  }>>(`
    SELECT u.id, u.name, u.email, u.phone, u.sms_opt_in as "smsOptIn"
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    JOIN (
      SELECT DISTINCT psb."userId"
      FROM play_session_bookings psb
      JOIN play_sessions ps ON ps.id = psb."sessionId"
      WHERE ps."clubId" = $1 AND psb.status = 'CONFIRMED'
    ) active ON active."userId" = u.id
    WHERE cf.club_id = $1 AND ${where}
    ORDER BY u.name ASC
    LIMIT 500
  `, clubId)
}

function applyAdvisorCampaignRecipientRules(
  members: Array<{ id: string; email?: string | null; phone?: string | null; smsOptIn?: boolean | null }>,
  rules?: {
    requireEmail?: boolean
    requirePhone?: boolean
    smsOptInOnly?: boolean
  },
) {
  if (!rules) return members

  return members.filter((member) => {
    if (rules.requireEmail && !member.email) return false
    if (rules.requirePhone && !member.phone) return false
    if (rules.smsOptInOnly && !member.smsOptIn) return false
    return true
  })
}

function buildCampaignSummary(
  channel: 'email' | 'sms' | 'both',
  mode: 'save_draft' | 'send_now' | 'send_later',
  eligibleCount: number,
) {
  const modeLabel = mode === 'send_now'
    ? 'outreach'
    : mode === 'send_later'
      ? 'scheduled outreach'
      : 'draft'
  return `${channel.toUpperCase()} ${modeLabel} for ${eligibleCount} eligible member${eligibleCount === 1 ? '' : 's'}`
}

function buildMembershipLifecycleSummary(
  kind: AdvisorMembershipLifecycleKind,
  channel: 'email' | 'sms' | 'both',
  mode: 'save_draft' | 'send_now' | 'send_later',
  eligibleCount: number,
) {
  const modeLabel = mode === 'send_now'
    ? 'outreach'
    : mode === 'send_later'
      ? 'scheduled outreach'
      : 'draft'
  const flowLabel = kind === 'trial_follow_up' ? 'trial follow-up' : 'renewal outreach'
  return `${channel.toUpperCase()} ${modeLabel} for ${eligibleCount} eligible ${flowLabel} member${eligibleCount === 1 ? '' : 's'}`
}

async function hydrateAdvisorCampaignAction(opts: {
  clubId: string
  action: AdvisorCampaignAction
  timeZone?: string | null
  automationSettings?: unknown
}) {
  const members = await queryAdvisorAudienceMembers(opts.clubId, opts.action.audience.filters as CohortFilter[])
  const ruleEligibleMembers = applyAdvisorCampaignRecipientRules(
    members,
    opts.action.campaign.execution.recipientRules,
  )
  const guardrails = await evaluateAdvisorContactGuardrails({
    prisma,
    clubId: opts.clubId,
    type: opts.action.campaign.type,
    requestedChannel: opts.action.campaign.channel,
    candidates: ruleEligibleMembers.map((member) => ({ memberId: member.id })),
    timeZone: opts.action.campaign.execution.timeZone || opts.timeZone,
    automationSettings: opts.automationSettings,
    now: opts.action.campaign.execution.mode === 'send_later' && opts.action.campaign.execution.scheduledFor
      ? new Date(opts.action.campaign.execution.scheduledFor)
      : new Date(),
  })
  const excludedByRules = Math.max(0, members.length - ruleEligibleMembers.length)
  const signals = await buildAdvisorPerformanceSignalForAction({
    prisma,
    clubId: opts.clubId,
    type: opts.action.campaign.type,
    requestedChannel: opts.action.campaign.channel,
    advisorOutcomeKind: 'create_campaign',
    days: 30,
  }).catch(() => null)

  const action: AdvisorCampaignAction = {
    ...opts.action,
    summary: buildCampaignSummary(
      opts.action.campaign.channel,
      opts.action.campaign.execution.mode,
      guardrails.summary.eligibleCount,
    ),
    audience: {
      ...opts.action.audience,
      count: members.length,
    },
    campaign: {
      ...opts.action.campaign,
      guardrails: guardrails.summary,
    },
    signals: signals || undefined,
  }

  return {
    action,
    audienceCount: members.length,
    excludedByRules,
    guardrails: guardrails.summary,
  }
}

async function hydrateAdvisorMembershipLifecycleAction(opts: {
  clubId: string
  action: AdvisorMembershipLifecycleAction
  timeZone?: string | null
  automationSettings?: unknown
}) {
  const guardrails = await evaluateAdvisorContactGuardrails({
    prisma,
    clubId: opts.clubId,
    type: opts.action.lifecycle.campaignType,
    requestedChannel: opts.action.lifecycle.channel,
    candidates: opts.action.lifecycle.candidates.map((candidate) => ({ memberId: candidate.memberId })),
    timeZone: opts.action.lifecycle.execution.timeZone || opts.timeZone,
    automationSettings: opts.automationSettings,
    now: opts.action.lifecycle.execution.mode === 'send_later' && opts.action.lifecycle.execution.scheduledFor
      ? new Date(opts.action.lifecycle.execution.scheduledFor)
      : new Date(),
  })
  const candidates = opts.action.lifecycle.candidates
    .map((candidate) => {
      const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
      if (!eligible) return null
      return {
        ...candidate,
        channel: eligible.channel,
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)

  const signals = await buildAdvisorPerformanceSignalForAction({
    prisma,
    clubId: opts.clubId,
    type: opts.action.lifecycle.campaignType,
    requestedChannel: opts.action.lifecycle.channel,
    advisorOutcomeKind: opts.action.kind,
    days: 30,
  }).catch(() => null)

  const action = (
    opts.action.kind === 'trial_follow_up'
      ? {
          ...opts.action,
          summary: buildMembershipLifecycleSummary(
            opts.action.lifecycle.lifecycle,
            opts.action.lifecycle.channel,
            opts.action.lifecycle.execution.mode,
            guardrails.summary.eligibleCount,
          ),
          lifecycle: {
            ...opts.action.lifecycle,
            candidateCount: candidates.length,
            candidates,
            guardrails: guardrails.summary,
          },
          signals: signals || undefined,
        }
      : {
          ...opts.action,
          summary: buildMembershipLifecycleSummary(
            opts.action.lifecycle.lifecycle,
            opts.action.lifecycle.channel,
            opts.action.lifecycle.execution.mode,
            guardrails.summary.eligibleCount,
          ),
          lifecycle: {
            ...opts.action.lifecycle,
            candidateCount: candidates.length,
            candidates,
            guardrails: guardrails.summary,
          },
          signals: signals || undefined,
        }
  ) as AdvisorMembershipLifecycleAction

  return {
    action,
    guardrails: guardrails.summary,
  }
}

async function maybeAttachCampaignRecommendation(opts: {
  action: AdvisorCampaignAction
  clubId: string
  message: string
  timeZone?: string | null
  automationSettings?: unknown
}): Promise<AdvisorAction> {
  const explicitChannel = extractExplicitAdvisorChannel(opts.message)
  const suggestedDefaults = await resolveAdvisorAdaptiveDefaultsForAction({
    prisma,
    clubId: opts.clubId,
    type: opts.action.campaign.type,
    timeZone: opts.timeZone,
    days: 30,
  }).catch(() => null)

  const nextExecution = { ...opts.action.campaign.execution }
  let proposedChannel = opts.action.campaign.channel
  const why: string[] = []
  const highlights: string[] = []

  if (explicitChannel && suggestedDefaults?.channel && suggestedDefaults.channel !== opts.action.campaign.channel) {
    proposedChannel = suggestedDefaults.channel
    why.push(`Recent ${humanizeAdvisorFlow(opts.action.campaign.type).toLowerCase()} results are strongest via ${formatAdvisorChannelLabel(suggestedDefaults.channel)} for this club.`)
    highlights.push(buildRecommendationChannelHighlight(suggestedDefaults.channel))
  }

  if (
    opts.action.campaign.execution.mode === 'send_later' &&
    opts.action.campaign.execution.scheduledFor &&
    !opts.action.defaultsApplied?.scheduledSend &&
    suggestedDefaults?.scheduledSend &&
    !sameAdvisorScheduledMoment(opts.action.campaign.execution.scheduledFor, suggestedDefaults.scheduledSend.scheduledFor)
  ) {
    nextExecution.scheduledFor = suggestedDefaults.scheduledSend.scheduledFor
    nextExecution.timeZone = suggestedDefaults.scheduledSend.timeZone
    why.push(`Recent club outcomes point to ${suggestedDefaults.scheduledSend.label} as the stronger send window for this outreach.`)
    highlights.push(buildScheduleRecommendationHighlight(suggestedDefaults.scheduledSend.label))
  }

  if (why.length === 0) return opts.action

  const baseAction = stripAdvisorRecommendation(opts.action) as AdvisorCampaignAction
  const variant = await hydrateAdvisorCampaignAction({
    clubId: opts.clubId,
    action: {
      ...baseAction,
      campaign: {
        ...opts.action.campaign,
        channel: proposedChannel,
        execution: nextExecution,
      },
      defaultsApplied: undefined,
    },
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
  })

  if (variant.guardrails.eligibleCount < getAdvisorActionEligibleCount(opts.action)) {
    return opts.action
  }

  if (variant.action.signals?.headline) {
    why.unshift(variant.action.signals.headline)
  }

  return {
    ...opts.action,
    recommendation: buildAdvisorRecommendation({
      current: opts.action,
      recommended: variant.action,
      title: buildRecommendationTitle(variant.action),
      summary: variant.action.summary,
      why,
      highlights,
    }),
  }
}

async function maybeAttachFillSessionRecommendation(opts: {
  action: AdvisorFillSessionAction
  caller: ReturnType<typeof appRouter.createCaller>
  clubId: string
  language: SupportedLanguage
  message: string
  state: AdvisorConversationState | null
  timeZone?: string | null
  automationSettings?: unknown
}): Promise<AdvisorAction> {
  const explicitChannel = extractExplicitAdvisorChannel(opts.message)
  if (!explicitChannel) return opts.action

  const suggestedDefaults = await resolveAdvisorAdaptiveDefaultsForAction({
    prisma,
    clubId: opts.clubId,
    type: 'SLOT_FILLER',
    timeZone: opts.timeZone,
    days: 30,
  }).catch(() => null)

  if (!suggestedDefaults?.channel || suggestedDefaults.channel === opts.action.outreach.channel) {
    return opts.action
  }

  const variant = await buildFillSessionAssistantResponse({
    caller: opts.caller,
    prisma,
    clubId: opts.clubId,
    language: opts.language,
    state: opts.state,
    message: opts.message,
    sessionId: opts.action.session.id,
    channel: suggestedDefaults.channel,
    candidateLimit: opts.action.outreach.candidateCount,
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
    allowRecommendation: false,
  })

  const recommendedAction = variant.action
  if (!recommendedAction || recommendedAction.kind !== 'fill_session') return opts.action
  if (getAdvisorActionEligibleCount(recommendedAction) < getAdvisorActionEligibleCount(opts.action)) {
    return opts.action
  }

  const why = [
    `Recent slot filler results are strongest via ${formatAdvisorChannelLabel(suggestedDefaults.channel)} for this club.`,
  ]
  if (recommendedAction.signals?.headline) why.unshift(recommendedAction.signals.headline)

  return {
    ...opts.action,
    recommendation: buildAdvisorRecommendation({
      current: opts.action,
      recommended: recommendedAction,
      title: buildRecommendationTitle(recommendedAction as AdvisorActionCore),
      summary: recommendedAction.summary,
      why,
      highlights: [buildRecommendationChannelHighlight(suggestedDefaults.channel)],
    }),
  }
}

async function maybeAttachReactivationRecommendation(opts: {
  action: AdvisorReactivationAction
  caller: ReturnType<typeof appRouter.createCaller>
  clubId: string
  language: SupportedLanguage
  message: string
  state: AdvisorConversationState | null
  timeZone?: string | null
  automationSettings?: unknown
}): Promise<AdvisorAction> {
  const explicitChannel = extractExplicitAdvisorChannel(opts.message)
  if (!explicitChannel) return opts.action

  const suggestedDefaults = await resolveAdvisorAdaptiveDefaultsForAction({
    prisma,
    clubId: opts.clubId,
    type: 'REACTIVATION',
    timeZone: opts.timeZone,
    days: 30,
  }).catch(() => null)

  if (!suggestedDefaults?.channel || suggestedDefaults.channel === opts.action.reactivation.channel) {
    return opts.action
  }

  const variant = await buildReactivationAssistantResponse({
    caller: opts.caller,
    prisma,
    clubId: opts.clubId,
    language: opts.language,
    state: opts.state,
    message: opts.message,
    inactivityDays: opts.action.reactivation.inactivityDays,
    channel: suggestedDefaults.channel,
    candidateLimit: opts.action.reactivation.candidateCount,
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
    allowRecommendation: false,
  })

  const recommendedAction = variant.action
  if (!recommendedAction || recommendedAction.kind !== 'reactivate_members') return opts.action
  if (getAdvisorActionEligibleCount(recommendedAction) < getAdvisorActionEligibleCount(opts.action)) {
    return opts.action
  }

  const why = [
    `Recent reactivation results are strongest via ${formatAdvisorChannelLabel(suggestedDefaults.channel)} for this club.`,
  ]
  if (recommendedAction.signals?.headline) why.unshift(recommendedAction.signals.headline)

  return {
    ...opts.action,
    recommendation: buildAdvisorRecommendation({
      current: opts.action,
      recommended: recommendedAction,
      title: buildRecommendationTitle(recommendedAction as AdvisorActionCore),
      summary: recommendedAction.summary,
      why,
      highlights: [buildRecommendationChannelHighlight(suggestedDefaults.channel)],
    }),
  }
}

async function maybeAttachMembershipLifecycleRecommendation(opts: {
  action: AdvisorMembershipLifecycleAction
  caller: ReturnType<typeof appRouter.createCaller>
  clubId: string
  language: SupportedLanguage
  message: string
  state: AdvisorConversationState | null
  timeZone?: string | null
  automationSettings?: unknown
}): Promise<AdvisorAction> {
  const explicitChannel = extractExplicitAdvisorChannel(opts.message)
  const suggestedDefaults = await resolveAdvisorAdaptiveDefaultsForAction({
    prisma,
    clubId: opts.clubId,
    type: opts.action.lifecycle.campaignType,
    timeZone: opts.timeZone,
    days: 30,
  }).catch(() => null)

  const highlights: string[] = []
  const why: string[] = []
  let nextChannel = opts.action.lifecycle.channel
  let nextScheduledFor = opts.action.lifecycle.execution.scheduledFor
  let nextTimeZone = opts.action.lifecycle.execution.timeZone

  if (explicitChannel && suggestedDefaults?.channel && suggestedDefaults.channel !== opts.action.lifecycle.channel) {
    nextChannel = suggestedDefaults.channel
    why.push(`Recent ${humanizeAdvisorFlow(opts.action.lifecycle.campaignType).toLowerCase()} results are strongest via ${formatAdvisorChannelLabel(suggestedDefaults.channel)} for this club.`)
    highlights.push(buildRecommendationChannelHighlight(suggestedDefaults.channel))
  }

  if (
    opts.action.lifecycle.execution.mode === 'send_later' &&
    opts.action.lifecycle.execution.scheduledFor &&
    !opts.action.defaultsApplied?.scheduledSend &&
    suggestedDefaults?.scheduledSend &&
    !sameAdvisorScheduledMoment(opts.action.lifecycle.execution.scheduledFor, suggestedDefaults.scheduledSend.scheduledFor)
  ) {
    nextScheduledFor = suggestedDefaults.scheduledSend.scheduledFor
    nextTimeZone = suggestedDefaults.scheduledSend.timeZone
    why.push(`Recent club outcomes point to ${suggestedDefaults.scheduledSend.label} as the stronger send window for this membership flow.`)
    highlights.push(buildScheduleRecommendationHighlight(suggestedDefaults.scheduledSend.label))
  }

  if (why.length === 0) return opts.action

  const variant = await buildMembershipLifecycleAssistantResponse({
    caller: opts.caller,
    clubId: opts.clubId,
    language: opts.language,
    state: opts.state,
    message: opts.message,
    kind: opts.action.lifecycle.lifecycle,
    deliveryMode: opts.action.lifecycle.execution.mode,
    scheduledFor: nextScheduledFor,
    planTimeZone: nextTimeZone,
    channel: nextChannel,
    candidateLimit: opts.action.lifecycle.candidateCount,
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
    allowRecommendation: false,
  })

  const recommendedAction = variant.action
  if (!recommendedAction || (recommendedAction.kind !== 'trial_follow_up' && recommendedAction.kind !== 'renewal_reactivation')) {
    return opts.action
  }
  if (getAdvisorActionEligibleCount(recommendedAction) < getAdvisorActionEligibleCount(opts.action)) {
    return opts.action
  }

  if (recommendedAction.signals?.headline) why.unshift(recommendedAction.signals.headline)

  return {
    ...opts.action,
    recommendation: buildAdvisorRecommendation({
      current: opts.action,
      recommended: recommendedAction,
      title: buildRecommendationTitle(recommendedAction as AdvisorActionCore),
      summary: recommendedAction.summary,
      why,
      highlights,
    }),
  }
}

function buildContactPolicyAction(policy: AdvisorContactPolicyDraft): AdvisorContactPolicyAction {
  return {
    kind: 'update_contact_policy',
    title: 'Update club contact policy',
    summary: formatAdvisorContactPolicyDigest(policy),
    requiresApproval: true,
    policy,
  }
}

function buildAutonomyPolicyAction(policy: AdvisorAutonomyPolicyDraft): AdvisorAutonomyPolicyAction {
  return {
    kind: 'update_autonomy_policy',
    title: 'Update club autonomy policy',
    summary: formatAdvisorAutonomyPolicyDigest(policy),
    requiresApproval: true,
    policy,
  }
}

function buildSandboxRoutingAction(policy: AdvisorSandboxRoutingDraft): AdvisorSandboxRoutingAction {
  return {
    kind: 'update_sandbox_routing',
    title: 'Update sandbox routing',
    summary: formatAdvisorSandboxRoutingDigest(policy),
    requiresApproval: true,
    policy,
  }
}

function buildProgrammingSummary(action: AdvisorProgrammingAction) {
  const proposalCount = 1 + action.program.alternatives.length
  return `${proposalCount} draft session idea${proposalCount === 1 ? '' : 's'} led by ${action.program.primary.title}`
}

function buildProgrammingAction(input: {
  goal: string
  primary: AdvisorProgrammingAction['program']['primary']
  alternatives: AdvisorProgrammingAction['program']['alternatives']
  insights: string[]
}): AdvisorProgrammingAction {
  return {
    kind: 'program_schedule',
    title: 'Draft programming plan',
    summary: `${1 + input.alternatives.length} schedule idea${1 + input.alternatives.length === 1 ? '' : 's'} around ${input.primary.title}`,
    requiresApproval: true,
    program: {
      goal: input.goal,
      primary: input.primary,
      alternatives: input.alternatives,
      insights: input.insights,
      publishMode: 'draft_only',
    },
  }
}

function getProgrammingCopy(language: SupportedLanguage | string) {
  const locale = language === 'ru' || language === 'es' ? language : 'en'
  const actionCopy = getAdvisorActionCopy(locale)
  return {
    ready: actionCopy.programmingReady,
    empty: actionCopy.programmingEmpty,
    suggestions: actionCopy.suggestions.program_schedule,
  }
}

function getSlotFillerCopy(language: SupportedLanguage | string) {
  if (language === 'ru') {
    return {
      needSession: 'Какую недозаполненную сессию мне заполнить?',
      repeatSession: 'Мне все еще нужна конкретная сессия. Выбери одну из вариантов ниже или опиши ее по времени/формату.',
      noSessions: 'Я не вижу недозаполненных сессий на ближайшие дни. Когда появятся свободные слоты, я смогу подобрать игроков и подготовить приглашения.',
      noCandidates: (sessionLabel: string) => `Я нашел нужную сессию, но пока не вижу сильных кандидатов для приглашения на ${sessionLabel}.`,
      ready: (count: number, sessionLabel: string) => `Я подобрал ${count} кандидатов для ${sessionLabel}. Проверь приглашение ниже и подтверди отправку.`,
      suggestions: ['Переключи на SMS', 'Пригласи топ-8 игроков', 'Покажи другую недозаполненную сессию'],
    }
  }

  if (language === 'es') {
    return {
      needSession: '¿Qué sesión con huecos debo llenar?',
      repeatSession: 'Todavía necesito una sesión específica. Elige una de las opciones de abajo o descríbela por hora o formato.',
      noSessions: 'No veo sesiones con huecos en los próximos días. En cuanto aparezcan, podré elegir jugadores y preparar invitaciones.',
      noCandidates: (sessionLabel: string) => `Encontré la sesión correcta, pero todavía no veo buenos candidatos para invitar a ${sessionLabel}.`,
      ready: (count: number, sessionLabel: string) => `Elegí ${count} candidatos para ${sessionLabel}. Revisa la invitación abajo y apruébala para enviarla.`,
      suggestions: ['Usa SMS en su lugar', 'Invita a los mejores 8 jugadores', 'Muéstrame otra sesión con huecos'],
    }
  }

  return {
    needSession: 'Which underfilled session should I fill?',
    repeatSession: 'I still need a specific session. Pick one of the options below or describe it by time or format.',
    noSessions: `I don't see any underfilled sessions coming up right now. As soon as there are open spots, I can pick the best players and prepare invites.`,
    noCandidates: (sessionLabel: string) => `I found the right session, but I couldn't find strong invite candidates for ${sessionLabel} yet.`,
    ready: (count: number, sessionLabel: string) => `I picked ${count} candidates for ${sessionLabel}. Review the invite below, then approve to send it.`,
    suggestions: ['Use SMS instead', 'Invite the top 8 players', 'Show me another underfilled session'],
  }
}

function getReactivationCopy(language: SupportedLanguage | string) {
  if (language === 'ru') {
    return {
      empty: (label: string) => `Сейчас я не вижу сильных кандидатов на реактивацию в сегменте "${label}".`,
      ready: (count: number, label: string) => `Я нашел ${count} кандидатов на реактивацию в сегменте "${label}". Проверь win-back сообщение ниже и подтверди отправку.`,
      suggestions: ['Переключи на SMS', 'Оставь только топ-5', 'Возьми тех, кто не играл 30+ дней'],
    }
  }

  if (language === 'es') {
    return {
      empty: (label: string) => `No encuentro buenos candidatos de reactivación en "${label}" ahora mismo.`,
      ready: (count: number, label: string) => `Encontré ${count} candidatos de reactivación en "${label}". Revisa el mensaje abajo y apruébalo para enviarlo.`,
      suggestions: ['Usa SMS en su lugar', 'Solo los mejores 5 miembros', 'Apunta a quienes llevan 30+ días inactivos'],
    }
  }

  return {
    empty: (label: string) => `I couldn't find strong reactivation candidates in "${label}" right now.`,
    ready: (count: number, label: string) => `I found ${count} reactivation candidates in "${label}". Review the win-back message below, then approve to send it.`,
    suggestions: ['Use SMS instead', 'Only top 5 members', 'Target 30+ day inactive members'],
  }
}

function getMembershipLifecycleCopy(language: SupportedLanguage | string, kind: AdvisorMembershipLifecycleKind) {
  const locale = language === 'ru' || language === 'es' ? language : 'en'
  const actionCopy = getAdvisorActionCopy(locale)
  if (kind === 'trial_follow_up') {
    return {
      empty: actionCopy.trialEmpty,
      ready: actionCopy.trialReady,
      suggestions: actionCopy.suggestions.trial_follow_up,
    }
  }

  return {
    empty: actionCopy.renewalEmpty,
    ready: actionCopy.renewalReady,
    suggestions: actionCopy.suggestions.renewal_reactivation,
  }
}

function getContactPolicyCopy(language: SupportedLanguage | string) {
  if (language === 'ru') {
    return {
      needChanges: 'Скажи, что именно поменять в contact policy: quiet hours, cooldown, дневной лимит, недельный лимит или окно recent booking.',
    }
  }

  if (language === 'es') {
    return {
      needChanges: 'Dime que quieres cambiar en la politica de contacto: quiet hours, cooldown, limite diario, limite semanal o la ventana de recent booking.',
    }
  }

  return {
    needChanges: 'Tell me what to change in the contact policy: quiet hours, cooldown, daily cap, weekly cap, or the recent booking suppression window.',
  }
}

function getAutonomyPolicyCopy(language: SupportedLanguage | string) {
  if (language === 'ru') {
    return {
      needChanges: 'Скажи, что поменять в autonomy policy: какой action поставить в auto, approve или off, и нужны ли пороги confidence, лимит получателей или membership signal.',
    }
  }

  if (language === 'es') {
    return {
      needChanges: 'Dime que quieres cambiar en la politica de autonomia: que acciones van en auto, approve u off, y si quieres umbrales de confidence, limite de recipients o membership signal.',
    }
  }

  return {
    needChanges: 'Tell me what to change in the autonomy policy: which actions should be auto, approve, or off, and whether you want confidence thresholds, recipient caps, or membership signal requirements.',
  }
}

function getSandboxRoutingCopy(language: SupportedLanguage | string) {
  if (language === 'ru') {
    return {
      needChanges: 'Скажи, как должен работать sandbox: оставить только preview, маршрутизировать на test recipients, и какие email или SMS получатели должны быть в whitelist.',
    }
  }

  if (language === 'es') {
    return {
      needChanges: 'Dime como debe funcionar el sandbox: solo preview, routing a test recipients, y que emails o SMS deben quedar en whitelist.',
    }
  }

  return {
    needChanges: 'Tell me how sandbox should work: keep preview only, route to test recipients, and which email or SMS recipients should stay on the whitelist.',
  }
}

function normalizeSlotSession(raw: any): AdvisorSlotSessionOption {
  const registered = raw.registered ?? raw.confirmedCount ?? 0
  const maxPlayers = raw.maxPlayers || 1
  const occupancy = raw.occupancy ?? Math.round((registered / Math.max(maxPlayers, 1)) * 100)
  return {
    id: raw.id ?? raw.sessionId,
    title: raw.title || raw.format || 'Session',
    date: String(raw.date || ''),
    startTime: raw.startTime || raw.time || '',
    endTime: raw.endTime || null,
    format: raw.format || null,
    skillLevel: raw.skillLevel || null,
    court: raw.court || raw.courtName || null,
    registered,
    maxPlayers,
    occupancy,
    spotsRemaining: raw.spotsRemaining ?? Math.max(0, maxPlayers - registered),
  }
}

async function loadAdvisorSlotSessions(caller: ReturnType<typeof appRouter.createCaller>, clubId: string) {
  const result = await caller.intelligence.getUnderfilledSessions({ clubId, days: 14 })
  return ((result as any)?.sessions || []).map(normalizeSlotSession)
}

async function buildFillSessionAssistantResponse(opts: {
  caller: ReturnType<typeof appRouter.createCaller>
  prisma: any
  clubId: string
  language: SupportedLanguage
  state: AdvisorConversationState | null
  message: string
  sessionId?: string | null
  channel?: 'email' | 'sms' | 'both'
  candidateLimit?: number
  defaultsApplied?: AdvisorAdaptiveDefaultsApplied
  timeZone?: string | null
  automationSettings?: unknown
  allowRecommendation?: boolean
}) {
  const { caller, prisma, clubId, language, state, message, sessionId, channel = 'email' } = opts
  const slotCopy = getSlotFillerCopy(language)
  const sessions = await loadAdvisorSlotSessions(caller, clubId)

  if (sessions.length === 0) {
    const assistantState: AdvisorConversationState = {
      ...(state || {}),
      latestOutcome: state?.latestOutcome,
      recentOutcomes: state?.recentOutcomes || [],
      currentSession: undefined,
      lastActionKind: 'fill_session',
      lastActionTitle: 'Fill an underfilled session',
      updatedAt: new Date().toISOString(),
    }

    return {
      assistantState,
      assistantMessage: withSuggested(slotCopy.noSessions, slotCopy.suggestions),
    }
  }

  const explicitSession = sessionId
    ? sessions.find((session: AdvisorSlotSessionOption) => session.id === sessionId) || null
    : null
  const resolvedSession = explicitSession
    ? explicitSession
    : resolveAdvisorSlotSession({
        message,
        sessions,
        currentSession: state?.currentSession,
      }).session

  if (!resolvedSession) {
    const pending = {
      action: 'fill_session' as const,
      field: 'session' as const,
      question: slotCopy.needSession,
      options: buildAdvisorSlotSessionOptions(sessions),
      originalMessage: message,
      channel,
      candidateLimit: opts.candidateLimit,
      sessionOptions: sessions.slice(0, 6),
    }

    return {
      assistantState: withAdvisorPendingClarification(state, pending),
      assistantMessage: withSuggested(slotCopy.needSession, pending.options),
    }
  }

  const candidateLimit = Math.min(Math.max(opts.candidateLimit || 5, 1), 20)
  const recommendations = await caller.intelligence.getSlotFillerRecommendations({
    sessionId: resolvedSession.id,
    limit: candidateLimit,
    clubId,
  })
  const rawCandidates = ((recommendations as any)?.recommendations || [])
    .slice(0, candidateLimit)
    .map((candidate: any) => ({
      memberId: candidate.member?.id || candidate.memberId,
      name: candidate.member?.name || 'Unknown',
      score: Math.max(0, Math.min(100, Math.round(candidate.score || 0))),
      likelihood: candidate.estimatedLikelihood || undefined,
      email: candidate.member?.email || undefined,
    }))
    .filter((candidate: any) => !!candidate.memberId)

  const guardrails = await evaluateAdvisorContactGuardrails({
    prisma,
    clubId,
    type: 'SLOT_FILLER',
    requestedChannel: channel,
    candidates: rawCandidates.map((candidate: any) => ({ memberId: candidate.memberId })),
    sessionId: resolvedSession.id,
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
  })
  const candidates = rawCandidates
    .map((candidate: any) => {
      const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
      if (!eligible) return null
      return {
        ...candidate,
        channel: eligible.channel,
      }
    })
    .filter(Boolean)

  if (candidates.length === 0) {
    const assistantState: AdvisorConversationState = {
      ...(state || {}),
      latestOutcome: state?.latestOutcome,
      recentOutcomes: state?.recentOutcomes || [],
      currentSession: resolvedSession,
      lastActionKind: 'fill_session',
      lastActionTitle: `Fill session: ${resolvedSession.title}`,
      updatedAt: new Date().toISOString(),
    }

    return {
      assistantState,
      assistantMessage: withSuggested(
        `${slotCopy.noCandidates(formatAdvisorSlotSessionLabel(resolvedSession))} ${formatAdvisorGuardrailDigest(guardrails.summary)}`.trim(),
        slotCopy.suggestions,
      ),
    }
  }

  const generated = await caller.intelligence.generateCampaignMessage({
    clubId,
    campaignType: 'SLOT_FILLER',
    channel,
    audienceCount: candidates.length,
    context: {
      sessionTitle: resolvedSession.title,
    },
  })
  const signals = await buildAdvisorPerformanceSignalForAction({
    prisma,
    clubId,
    type: 'SLOT_FILLER',
    requestedChannel: channel,
    advisorOutcomeKind: 'fill_session',
    days: 30,
  }).catch(() => null)

  const baseAction: AdvisorFillSessionAction = {
    kind: 'fill_session',
    title: `Fill session: ${resolvedSession.title}`,
    summary: `${channel.toUpperCase()} invites for ${candidates.length} matched players`,
    requiresApproval: true,
    session: resolvedSession,
    outreach: {
      channel,
      candidateCount: candidates.length,
      message: channel === 'sms'
        ? (generated.smsBody || generated.body)
        : generated.body,
      candidates,
      guardrails: guardrails.summary,
    },
    signals: signals || undefined,
    defaultsApplied: opts.defaultsApplied,
  }
  const action = opts.allowRecommendation === false
    ? baseAction
    : await maybeAttachFillSessionRecommendation({
        action: baseAction,
        caller,
        clubId,
        language,
        message,
        state,
        timeZone: opts.timeZone,
        automationSettings: opts.automationSettings,
      })

  const guardrailNote = formatAdvisorGuardrailDigest(guardrails.summary)
  return {
    assistantState: buildAdvisorConversationStateFromAction(action),
    assistantMessage: withSuggested(
      `${slotCopy.ready(candidates.length, formatAdvisorSlotSessionLabel(resolvedSession))}${guardrailNote ? `\n\n${guardrailNote}` : ''}\n\n${buildAdvisorActionTag(action)}`,
      slotCopy.suggestions,
    ),
    action,
  }
}

async function buildReactivationAssistantResponse(opts: {
  caller: ReturnType<typeof appRouter.createCaller>
  prisma: any
  clubId: string
  language: SupportedLanguage
  state: AdvisorConversationState | null
  message: string
  inactivityDays?: number
  channel?: 'email' | 'sms' | 'both'
  candidateLimit?: number
  defaultsApplied?: AdvisorAdaptiveDefaultsApplied
  timeZone?: string | null
  automationSettings?: unknown
  allowRecommendation?: boolean
}) {
  const { caller, prisma, clubId, language, state, message, channel = 'email' } = opts
  const reactivationCopy = getReactivationCopy(language)
  const inactivityDays = parseAdvisorInactivityDays(message) || opts.inactivityDays || 21
  const candidateLimit = Math.min(Math.max(opts.candidateLimit || 10, 1), 25)
  const segmentLabel = buildAdvisorReactivationLabel(inactivityDays)

  const result = await caller.intelligence.getReactivationCandidates({
    clubId,
    inactivityDays,
    limit: candidateLimit,
  })

  const rawCandidates = ((result as any)?.candidates || [])
    .slice(0, candidateLimit)
    .map((candidate: any) => ({
      memberId: candidate.member?.id || candidate.memberId,
      name: candidate.member?.name || candidate.member?.email || 'Unknown',
      score: Math.max(0, Math.min(100, Math.round(candidate.score || 0))),
      daysSinceLastActivity: Math.max(0, Math.round(candidate.daysSinceLastActivity || 0)),
      topReason: candidate.churnReasons?.[0]?.summary || undefined,
      suggestedSessionTitle: candidate.suggestedSessions?.[0]?.title || undefined,
    }))
    .filter((candidate: any) => !!candidate.memberId)

  const guardrails = await evaluateAdvisorContactGuardrails({
    prisma,
    clubId,
    type: 'REACTIVATION',
    requestedChannel: channel,
    candidates: rawCandidates.map((candidate: any) => ({ memberId: candidate.memberId })),
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
  })
  const candidates = rawCandidates
    .map((candidate: any) => {
      const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
      if (!eligible) return null
      return {
        ...candidate,
        channel: eligible.channel,
      }
    })
    .filter(Boolean)

  if (candidates.length === 0) {
    const assistantState: AdvisorConversationState = {
      ...(state || {}),
      latestOutcome: state?.latestOutcome,
      recentOutcomes: state?.recentOutcomes || [],
      currentReactivation: undefined,
      lastActionKind: 'reactivate_members',
      lastActionTitle: `Reactivate: ${segmentLabel}`,
      updatedAt: new Date().toISOString(),
    }

    return {
      assistantState,
      assistantMessage: withSuggested(
        `${reactivationCopy.empty(segmentLabel)} ${formatAdvisorGuardrailDigest(guardrails.summary)}`.trim(),
        reactivationCopy.suggestions,
      ),
    }
  }

  const generated = await caller.intelligence.generateCampaignMessage({
    clubId,
    campaignType: 'REACTIVATION',
    channel,
    audienceCount: candidates.length,
    context: {
      riskSegment: segmentLabel,
      inactivityDays,
    },
  })
  const signals = await buildAdvisorPerformanceSignalForAction({
    prisma,
    clubId,
    type: 'REACTIVATION',
    requestedChannel: channel,
    advisorOutcomeKind: 'reactivate_members',
    days: 30,
  }).catch(() => null)

  const messagePreview = channel === 'email'
    ? truncateAdvisorText(generated.body, 500)
    : truncateAdvisorText(generated.smsBody || generated.body, 160)

  const baseAction: AdvisorReactivationAction = {
    kind: 'reactivate_members',
    title: `Reactivate: ${segmentLabel}`,
    summary: `${channel.toUpperCase()} win-back outreach for ${candidates.length} inactive members`,
    requiresApproval: true,
    reactivation: {
      segmentLabel,
      inactivityDays,
      channel,
      candidateCount: candidates.length,
      message: messagePreview,
      candidates,
      guardrails: guardrails.summary,
    },
    signals: signals || undefined,
    defaultsApplied: opts.defaultsApplied,
  }
  const action = opts.allowRecommendation === false
    ? baseAction
    : await maybeAttachReactivationRecommendation({
        action: baseAction,
        caller,
        clubId,
        language,
        message,
        state,
        timeZone: opts.timeZone,
        automationSettings: opts.automationSettings,
      })

  const guardrailNote = formatAdvisorGuardrailDigest(guardrails.summary)
  return {
    assistantState: buildAdvisorConversationStateFromAction(action),
    assistantMessage: withSuggested(
      `${reactivationCopy.ready(candidates.length, segmentLabel)}${guardrailNote ? `\n\n${guardrailNote}` : ''}\n\n${buildAdvisorActionTag(action)}`,
      reactivationCopy.suggestions,
    ),
    action,
  }
}

async function buildMembershipLifecycleAssistantResponse(opts: {
  caller: ReturnType<typeof appRouter.createCaller>
  clubId: string
  language: SupportedLanguage
  state: AdvisorConversationState | null
  message: string
  kind: AdvisorMembershipLifecycleKind
  deliveryMode?: AdvisorIntentPlan['deliveryMode']
  channel?: 'email' | 'sms' | 'both'
  candidateLimit?: number
  defaultsApplied?: AdvisorAdaptiveDefaultsApplied
  timeZone?: string | null
  automationSettings?: unknown
  scheduledFor?: string
  planTimeZone?: string
  allowRecommendation?: boolean
}) {
  const { caller, clubId, language, state, kind } = opts
  const meta = getAdvisorMembershipLifecycleMeta(kind)
  const lifecycleCopy = getMembershipLifecycleCopy(language, kind)
  const channel = opts.channel || 'email'
  const deliveryMode = opts.deliveryMode || 'save_draft'
  const candidateLimit = Math.min(Math.max(opts.candidateLimit || (kind === 'trial_follow_up' ? 5 : 8), 1), 25)
  const candidates = await getAdvisorMembershipLifecycleCandidates({
    prisma,
    clubId,
    kind,
    limit: candidateLimit,
  })

  if (candidates.length === 0) {
    const assistantState: AdvisorConversationState = {
      ...(state || {}),
      latestOutcome: state?.latestOutcome,
      recentOutcomes: state?.recentOutcomes || [],
      currentMembershipLifecycle: undefined,
      lastActionKind: kind,
      lastActionTitle: meta.title,
      updatedAt: new Date().toISOString(),
    }

    return {
      assistantState,
      assistantMessage: withSuggested(lifecycleCopy.empty(meta.label), lifecycleCopy.suggestions),
    }
  }

  const scheduledSend = deliveryMode === 'send_later' && opts.scheduledFor
    ? {
        scheduledFor: opts.scheduledFor,
        timeZone: opts.planTimeZone || opts.timeZone || 'America/Los_Angeles',
        label: formatAdvisorScheduledLabel(opts.scheduledFor, opts.planTimeZone || opts.timeZone || 'America/Los_Angeles'),
      }
    : null

  const generated = await caller.intelligence.generateCampaignMessage({
    clubId,
    campaignType: meta.campaignType,
    channel,
    audienceCount: candidates.length,
    context: {
      riskSegment: meta.label,
    },
  })

  const messagePreview = channel === 'email'
    ? truncateAdvisorText(generated.body, 500)
    : truncateAdvisorText(generated.smsBody || generated.body, 160)

  const baseAction: AdvisorMembershipLifecycleAction = kind === 'trial_follow_up'
    ? {
        kind: 'trial_follow_up',
        title: meta.title,
        summary: '',
        requiresApproval: true,
        lifecycle: {
          lifecycle: 'trial_follow_up',
          campaignType: 'RETENTION_BOOST',
          label: meta.label,
          channel,
          candidateCount: candidates.length,
          subject: generated.subject,
          message: messagePreview,
          smsBody: generated.smsBody || undefined,
          execution: {
            mode: deliveryMode,
            ...(scheduledSend ? {
              scheduledFor: scheduledSend.scheduledFor,
              timeZone: scheduledSend.timeZone,
            } : {}),
          },
          candidates,
        },
        defaultsApplied: opts.defaultsApplied,
      }
    : {
        kind: 'renewal_reactivation',
        title: meta.title,
        summary: '',
        requiresApproval: true,
        lifecycle: {
          lifecycle: 'renewal_reactivation',
          campaignType: 'REACTIVATION',
          label: meta.label,
          channel,
          candidateCount: candidates.length,
          subject: generated.subject,
          message: messagePreview,
          smsBody: generated.smsBody || undefined,
          execution: {
            mode: deliveryMode,
            ...(scheduledSend ? {
              scheduledFor: scheduledSend.scheduledFor,
              timeZone: scheduledSend.timeZone,
            } : {}),
          },
          candidates,
        },
        defaultsApplied: opts.defaultsApplied,
      }

  const hydrated = await hydrateAdvisorMembershipLifecycleAction({
    clubId,
    action: baseAction,
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
  })
  const action = opts.allowRecommendation === false
    ? hydrated.action
    : await maybeAttachMembershipLifecycleRecommendation({
        action: hydrated.action,
        caller,
        clubId,
        language,
        message: opts.message,
        state,
        timeZone: opts.timeZone,
        automationSettings: opts.automationSettings,
      })
  const lifecycleAction = action.kind === 'trial_follow_up' || action.kind === 'renewal_reactivation'
    ? action
    : hydrated.action
  const guardrailNote = formatAdvisorGuardrailDigest(hydrated.guardrails)

  return {
    assistantState: buildAdvisorConversationStateFromAction(action),
    assistantMessage: withSuggested(
      `${lifecycleCopy.ready(lifecycleAction.lifecycle.candidateCount, meta.label)}${guardrailNote ? `\n\n${guardrailNote}` : ''}\n\n${buildAdvisorActionTag(action)}`,
      lifecycleCopy.suggestions,
    ),
    action,
  }
}

function maybeAttachProgrammingRecommendation(opts: {
  action: AdvisorProgrammingAction
  recommendedPrimary: AdvisorProgrammingAction['program']['primary'] | null
}): AdvisorProgrammingAction {
  const recommendedPrimary = opts.recommendedPrimary
  if (!recommendedPrimary) return opts.action
  if (sameProgrammingProposal(opts.action.program.primary, recommendedPrimary)) return opts.action
  if (recommendedPrimary.confidence < opts.action.program.primary.confidence + 5) return opts.action

  const deltaOccupancy = recommendedPrimary.projectedOccupancy - opts.action.program.primary.projectedOccupancy
  const recommendedAction = buildProgrammingAction({
    goal: opts.action.program.goal,
    primary: recommendedPrimary,
    alternatives: [
      opts.action.program.primary,
      ...opts.action.program.alternatives.filter((proposal) => !sameProgrammingProposal(proposal, recommendedPrimary)),
    ].slice(0, 3),
    insights: opts.action.program.insights,
  })

  return {
    ...opts.action,
    recommendation: buildAdvisorRecommendation({
      current: opts.action,
      recommended: recommendedAction,
      title: buildRecommendationTitle(recommendedAction),
      summary: buildProgrammingSummary(recommendedAction),
      why: [
        `The agent sees stronger demand in ${recommendedPrimary.dayOfWeek} ${formatProgrammingTimeSlot(recommendedPrimary.timeSlot).toLowerCase()} for this format mix.`,
        deltaOccupancy > 0
          ? `Projected fill improves from ${opts.action.program.primary.projectedOccupancy}% to ${recommendedPrimary.projectedOccupancy}%.`
          : `This window carries a stronger confidence score (${recommendedPrimary.confidence}/100).`,
        ...recommendedPrimary.rationale.slice(0, 2),
      ],
      highlights: [
        `Move to ${recommendedPrimary.dayOfWeek} ${formatProgrammingTimeSlot(recommendedPrimary.timeSlot)}`,
        `${recommendedPrimary.projectedOccupancy}% projected fill`,
      ].filter(Boolean),
    }),
  }
}

async function buildProgrammingAssistantResponse(opts: {
  prisma: any
  clubId: string
  language: SupportedLanguage
  state: AdvisorConversationState | null
  message: string
  currentRequest?: AdvisorProgrammingRequestSpec | null
  allowRecommendation?: boolean
}) {
  const programmingCopy = getProgrammingCopy(opts.language)
  const draft = await getAdvisorProgrammingDraft({
    prisma: opts.prisma,
    clubId: opts.clubId,
    message: opts.message,
    current: opts.currentRequest,
    limit: 3,
  })

  if (!draft.hasData || draft.proposals.length === 0) {
    const assistantState: AdvisorConversationState = {
      ...(opts.state || {}),
      latestOutcome: opts.state?.latestOutcome,
      recentOutcomes: opts.state?.recentOutcomes || [],
      currentProgramming: undefined,
      lastActionKind: 'program_schedule',
      lastActionTitle: 'Draft programming plan',
      updatedAt: new Date().toISOString(),
    }

    return {
      assistantState,
      assistantMessage: withSuggested(programmingCopy.empty, programmingCopy.suggestions),
    }
  }

  const requestedPrimary = draft.requested || draft.proposals[0]
  const alternatives = draft.proposals
    .filter((proposal) => !sameProgrammingProposal(proposal, requestedPrimary))
    .slice(0, 3)
  const baseAction = buildProgrammingAction({
    goal: truncateAdvisorText(opts.message, 180),
    primary: requestedPrimary,
    alternatives,
    insights: draft.insights,
  })
  const action = opts.allowRecommendation === false
    ? baseAction
    : maybeAttachProgrammingRecommendation({
        action: baseAction,
        recommendedPrimary: draft.requested ? draft.recommended : null,
      })

  return {
    assistantState: buildAdvisorConversationStateFromAction(action),
    assistantMessage: withSuggested(
      `${programmingCopy.ready(1 + action.program.alternatives.length, action.program.primary.title)}\n\nNothing will publish live from here. This stays as a draft-first programming plan until you explicitly approve and implement it.\n\n${buildAdvisorActionTag(action)}`,
      programmingCopy.suggestions,
    ),
    action,
  }
}

function isCampaignOnlyFollowUp(message: string) {
  const lower = message.toLowerCase()
  const hasCampaignVerb = /\b(campaign|email|sms|text|message|outreach|send|launch|draft|reactivat|invite)\b/.test(lower)
  const hasAudienceHint = /\b(audience|segment|cohort|group|list|players?|members?|this|that|those|them|inactive|morning|evening|weekday|weekend|beginner|intermediate|competitive|women|men|\d+\+)\b/.test(lower)
  return hasCampaignVerb && !hasAudienceHint
}

function getSuggestionKeyForPlanAction(action: AdvisorIntentPlan['action']) {
  switch (action) {
    case 'create_cohort':
      return 'create_cohort' as const
    case 'fill_session':
      return 'fill_session' as const
    case 'reactivate_members':
      return 'reactivate_members' as const
    case 'trial_follow_up':
      return 'trial_follow_up' as const
    case 'renewal_reactivation':
      return 'renewal_reactivation' as const
    case 'program_schedule':
      return 'program_schedule' as const
    case 'update_contact_policy':
      return 'update_contact_policy' as const
    case 'update_autonomy_policy':
      return 'update_autonomy_policy' as const
    case 'update_sandbox_routing':
      return 'update_sandbox_routing' as const
    default:
      return 'create_campaign' as const
  }
}

async function applyAdvisorAdaptiveDefaults(opts: {
  prisma: any
  clubId: string
  plan: AdvisorIntentPlan
  message: string
  timeZone?: string | null
}) {
  const explicitChannel = extractExplicitAdvisorChannel(opts.message)
  if (
    opts.plan.action === 'none' ||
    opts.plan.action === 'create_cohort' ||
    opts.plan.action === 'program_schedule' ||
    opts.plan.action === 'update_contact_policy' ||
    opts.plan.action === 'update_autonomy_policy' ||
    opts.plan.action === 'update_sandbox_routing'
  ) {
    return {
      plan: opts.plan,
      defaultsApplied: undefined,
    }
  }

  const type = opts.plan.action === 'fill_session'
    ? 'SLOT_FILLER'
    : opts.plan.action === 'reactivate_members'
      ? 'REACTIVATION'
      : opts.plan.action === 'trial_follow_up'
        ? 'RETENTION_BOOST'
        : opts.plan.action === 'renewal_reactivation'
          ? 'REACTIVATION'
      : opts.plan.campaignType || 'REACTIVATION'

  const defaults = await resolveAdvisorAdaptiveDefaultsForAction({
    prisma: opts.prisma,
    clubId: opts.clubId,
    type,
    requestedChannel: explicitChannel || undefined,
    timeZone: opts.timeZone,
    days: 30,
  }).catch(() => null)

  const nextPlan: AdvisorIntentPlan = {
    ...opts.plan,
    channel: explicitChannel || defaults?.channel || opts.plan.channel || 'email',
  }

  if (
    (nextPlan.action === 'draft_campaign' || nextPlan.action === 'trial_follow_up' || nextPlan.action === 'renewal_reactivation') &&
    nextPlan.deliveryMode === 'send_later' &&
    !nextPlan.scheduledFor &&
    defaults?.scheduledSend
  ) {
    nextPlan.scheduledFor = defaults.scheduledSend.scheduledFor
    nextPlan.timeZone = defaults.scheduledSend.timeZone
  }

  const appliedScheduledSend = (
    (nextPlan.action === 'draft_campaign' || nextPlan.action === 'trial_follow_up' || nextPlan.action === 'renewal_reactivation') &&
    nextPlan.deliveryMode === 'send_later' &&
    !opts.plan.scheduledFor &&
    defaults?.scheduledSend
  ) ? defaults.scheduledSend : null

  return {
    plan: nextPlan,
    defaultsApplied: buildAdvisorAdaptiveDefaultsApplied({
      type,
      channel: defaults?.channel,
      channelDerivedFromOutcomes: defaults?.channelDerivedFromOutcomes,
      scheduledSend: appliedScheduledSend,
    }),
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    const { clubId, message, conversationId } = body as {
      clubId?: string
      message?: string
      conversationId?: string | null
    }

    if (!clubId || !message?.trim()) {
      return Response.json({ error: 'clubId and message are required' }, { status: 400 })
    }

    const access = await verifyClubMembership(clubId, session.userId)
    if (!access.hasAccess) {
      return new Response('Forbidden', { status: 403 })
    }

    const clubContext = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        automationSettings: true,
        address: true,
        state: true,
        country: true,
      },
    })
    const clubTimeZone = resolveAdvisorClubTimeZone({
      automationSettings: clubContext?.automationSettings,
      address: clubContext?.address,
      state: clubContext?.state,
      country: clubContext?.country,
    })

    const language = detectLanguage(message)

    const convId = await getOrCreateConversation({
      clubId,
      userId: session.userId,
      conversationId,
      titleSource: message,
      language,
    })

    const caller = appRouter.createCaller({
      prisma,
      session: buildSessionForCaller(session),
    } as any)

    const memory = await getAdvisorConversationMemory(convId)
    let effectiveMessage = message
    let plan = memory.state?.pendingClarification
      ? null
      : await planAdvisorActionIntent(message)
    let assistantMessage = ''
    const copy = getAdvisorActionCopy(language)
    let assistantState: AdvisorConversationState | null = null
    const hadPendingClarification = !!memory.state?.pendingClarification
    let defaultsApplied: AdvisorAdaptiveDefaultsApplied | undefined
    let draftIdToReuse: string | null = null

    if (access.isAdmin && memory.state?.pendingClarification) {
      if (
        memory.state.pendingClarification.action === 'fill_session' &&
        memory.state.pendingClarification.field === 'session'
      ) {
        const slotCopy = getSlotFillerCopy(language)
        const sessionOptions = memory.state.pendingClarification.sessionOptions || []
        const resolved = resolveAdvisorSlotSession({
          message,
          sessions: sessionOptions,
          currentSession: memory.state.currentSession,
        })

        if (!resolved.session) {
          assistantState = withAdvisorPendingClarification(memory.state, {
            ...memory.state.pendingClarification,
            question: slotCopy.repeatSession,
            options: buildAdvisorSlotSessionOptions(sessionOptions),
          })
          assistantMessage = withSuggested(slotCopy.repeatSession, buildAdvisorSlotSessionOptions(sessionOptions))
        } else {
          plan = {
            action: 'fill_session',
            usePreviousCohort: false,
            channel: memory.state.pendingClarification.channel,
            candidateLimit: memory.state.pendingClarification.candidateLimit,
            sessionId: resolved.session.id,
          }
        }
      } else {
        const resolution = resolveAdvisorClarification({
          message,
          pending: memory.state.pendingClarification,
          state: memory.state,
          language,
        })

        if (resolution?.clarification) {
          assistantState = withAdvisorPendingClarification(memory.state, resolution.clarification.pending)
          assistantMessage = withSuggested(resolution.clarification.text, resolution.clarification.suggestions)
        } else if (resolution?.plan) {
          plan = resolution.plan
          effectiveMessage = resolution.plan.audienceText || message
        }
      }
    }

    if (!plan) {
      plan = await planAdvisorActionIntent(effectiveMessage)
    }

    if (access.isAdmin) {
      const adaptiveDefaults = await applyAdvisorAdaptiveDefaults({
        prisma,
        clubId,
        plan,
        message: effectiveMessage,
        timeZone: clubTimeZone,
      })
      plan = adaptiveDefaults.plan
      defaultsApplied = adaptiveDefaults.defaultsApplied
    }

      if (!access.isAdmin) {
        if (plan.action !== 'none') {
          assistantMessage = withSuggested(copy.adminOnly, copy.suggestions[getSuggestionKeyForPlanAction(plan.action)])
        }
      } else {
      if (!assistantMessage && !hadPendingClarification) {
        const editedContactPolicy = memory.state?.currentContactPolicy
          ? updateAdvisorContactPolicyFromMessage({
              message,
              currentPolicy: memory.state.currentContactPolicy,
              allowImplicit: true,
            })
          : null
        if (editedContactPolicy) {
          draftIdToReuse = memory.state?.currentDraftId || null
          const action = buildContactPolicyAction(editedContactPolicy)
          assistantState = buildAdvisorConversationStateFromAction(action)
          assistantMessage = withSuggested(
            [
              copy.contactPolicyReady(action.policy.changes.length),
              ...action.policy.changes,
              buildAdvisorActionTag(action),
            ].join('\n\n'),
            copy.suggestions.update_contact_policy,
          )
        }
      }

      if (!assistantMessage && !hadPendingClarification) {
        const editedAutonomyPolicy = memory.state?.currentAutonomyPolicy
          ? updateAdvisorAutonomyPolicyFromMessage({
              message,
              currentPolicy: memory.state.currentAutonomyPolicy,
              allowImplicit: true,
            })
          : null
        if (editedAutonomyPolicy) {
          draftIdToReuse = memory.state?.currentDraftId || null
          const action = buildAutonomyPolicyAction(editedAutonomyPolicy)
          assistantState = buildAdvisorConversationStateFromAction(action)
          assistantMessage = withSuggested(
            [
              copy.autonomyPolicyReady(action.policy.changes.length),
              ...action.policy.changes,
              buildAdvisorActionTag(action),
            ].join('\n\n'),
            copy.suggestions.update_autonomy_policy,
          )
        }
      }

      if (!assistantMessage && !hadPendingClarification) {
        const editedSandboxRouting = memory.state?.currentSandboxRouting
          ? updateAdvisorSandboxRoutingFromMessage({
              message,
              currentPolicy: memory.state.currentSandboxRouting,
              allowImplicit: true,
            })
          : null
        if (editedSandboxRouting) {
          draftIdToReuse = memory.state?.currentDraftId || null
          const action = buildSandboxRoutingAction(editedSandboxRouting)
          assistantState = buildAdvisorConversationStateFromAction(action)
          assistantMessage = withSuggested(
            [
              copy.sandboxRoutingReady(action.policy.changes.length),
              ...action.policy.changes,
              buildAdvisorActionTag(action),
            ].join('\n\n'),
            copy.suggestions.update_sandbox_routing,
          )
        }
      }

      if (!assistantMessage && !hadPendingClarification) {
        const activeFillSession = memory.lastAction?.kind === 'fill_session'
        const fillSessionEditSessions = activeFillSession
          ? await loadAdvisorSlotSessions(caller, clubId)
          : undefined
        const editedAction = await maybeEditAdvisorDraft({
          message,
          state: memory.state,
          lastAction: memory.lastAction,
          sessions: fillSessionEditSessions,
          timeZone: clubTimeZone,
        })

        if (editedAction) {
          draftIdToReuse = memory.state?.currentDraftId || null
          if (editedAction.kind === 'fill_session') {
            const editedResponse = await buildFillSessionAssistantResponse({
              caller,
              prisma,
              clubId,
              language,
              state: memory.state,
              message,
              sessionId: editedAction.session.id,
              channel: editedAction.outreach.channel,
              candidateLimit: editedAction.outreach.candidateCount,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })

            assistantState = editedResponse.assistantState
            assistantMessage = editedResponse.assistantMessage
          } else if (editedAction.kind === 'reactivate_members') {
            const editedResponse = await buildReactivationAssistantResponse({
              caller,
              prisma,
              clubId,
              language,
              state: memory.state,
              message,
              inactivityDays: editedAction.reactivation.inactivityDays,
              channel: editedAction.reactivation.channel,
              candidateLimit: editedAction.reactivation.candidateCount,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })

            assistantState = editedResponse.assistantState
            assistantMessage = editedResponse.assistantMessage
          } else if (editedAction.kind === 'create_campaign') {
            const hydratedCampaign = await hydrateAdvisorCampaignAction({
              clubId,
              action: editedAction as AdvisorCampaignAction,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })
            const campaignAction = await maybeAttachCampaignRecommendation({
              action: hydratedCampaign.action,
              clubId,
              message,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })
            const resolvedCampaignAction = campaignAction.kind === 'create_campaign'
              ? campaignAction
              : hydratedCampaign.action
            const editCopy = getAdvisorEditCopy(language)
            const guardrailNote = formatAdvisorGuardrailDigest(hydratedCampaign.guardrails)
            const ruleNote = hydratedCampaign.excludedByRules > 0
              ? `${hydratedCampaign.excludedByRules} member${hydratedCampaign.excludedByRules === 1 ? '' : 's'} excluded by recipient rules.`
              : ''
            assistantState = buildAdvisorConversationStateFromAction(campaignAction)
            assistantMessage = withSuggested(
              [
                editCopy.campaignUpdated(
                  resolvedCampaignAction.audience.name,
                  resolvedCampaignAction.audience.count || 0,
                ),
                [ruleNote, guardrailNote].filter(Boolean).join(' ').trim(),
                buildAdvisorActionTag(campaignAction),
              ].filter(Boolean).join('\n\n'),
              editCopy.suggestions.create_campaign,
            )
          } else if (editedAction.kind === 'trial_follow_up' || editedAction.kind === 'renewal_reactivation') {
            const hydratedLifecycle = await hydrateAdvisorMembershipLifecycleAction({
              clubId,
              action: editedAction as AdvisorMembershipLifecycleAction,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })
            const lifecycleAction = await maybeAttachMembershipLifecycleRecommendation({
              action: hydratedLifecycle.action,
              caller,
              clubId,
              language,
              message,
              state: memory.state,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })
            const resolvedLifecycleAction = lifecycleAction.kind === 'trial_follow_up' || lifecycleAction.kind === 'renewal_reactivation'
              ? lifecycleAction
              : hydratedLifecycle.action
            const editCopy = getAdvisorEditCopy(language)
            const lifecycleMeta = getAdvisorMembershipLifecycleMeta(editedAction.lifecycle.lifecycle)
            const guardrailNote = formatAdvisorGuardrailDigest(hydratedLifecycle.guardrails)
            assistantState = buildAdvisorConversationStateFromAction(lifecycleAction)
            assistantMessage = withSuggested(
              [
                editCopy.membershipUpdated(
                  lifecycleMeta.label,
                  resolvedLifecycleAction.lifecycle.candidateCount,
                ),
                guardrailNote,
                buildAdvisorActionTag(lifecycleAction),
              ].filter(Boolean).join('\n\n'),
              editCopy.suggestions[editedAction.kind],
            )
          } else if (editedAction.kind === 'program_schedule') {
            const editedResponse = await buildProgrammingAssistantResponse({
              prisma,
              clubId,
              language,
              state: memory.state,
              message,
              currentRequest: {
                dayOfWeek: editedAction.program.primary.dayOfWeek,
                timeSlot: editedAction.program.primary.timeSlot,
                startTime: editedAction.program.primary.startTime,
                endTime: editedAction.program.primary.endTime,
                format: editedAction.program.primary.format,
                skillLevel: editedAction.program.primary.skillLevel,
                maxPlayers: editedAction.program.primary.maxPlayers,
              },
            })

            assistantState = editedResponse.assistantState
            assistantMessage = editedResponse.assistantMessage
          } else if (editedAction.kind === 'update_contact_policy') {
            assistantState = buildAdvisorConversationStateFromAction(editedAction)
            assistantMessage = withSuggested(
              [
                copy.contactPolicyReady(editedAction.policy.changes.length),
                ...editedAction.policy.changes,
                buildAdvisorActionTag(editedAction),
              ].join('\n\n'),
              copy.suggestions.update_contact_policy,
            )
          } else if (editedAction.kind === 'update_autonomy_policy') {
            assistantState = buildAdvisorConversationStateFromAction(editedAction)
            assistantMessage = withSuggested(
              [
                copy.autonomyPolicyReady(editedAction.policy.changes.length),
                ...editedAction.policy.changes,
                buildAdvisorActionTag(editedAction),
              ].join('\n\n'),
              copy.suggestions.update_autonomy_policy,
            )
          } else if (editedAction.kind === 'update_sandbox_routing') {
            assistantState = buildAdvisorConversationStateFromAction(editedAction)
            assistantMessage = withSuggested(
              [
                copy.sandboxRoutingReady(editedAction.policy.changes.length),
                ...editedAction.policy.changes,
                buildAdvisorActionTag(editedAction),
              ].join('\n\n'),
              copy.suggestions.update_sandbox_routing,
            )
          } else {
            const editCopy = getAdvisorEditCopy(language)
            assistantState = buildAdvisorConversationStateFromAction(editedAction)
            const audienceName = editedAction.cohort.name
            const audienceCount = editedAction.cohort.count || 0
            const editText = editCopy.audienceUpdated(audienceName, audienceCount)

            assistantMessage = withSuggested(
              `${editText}\n\n${buildAdvisorActionTag(editedAction)}`,
              editCopy.suggestions.create_cohort,
            )
          }
        }
      }

      if (!assistantMessage) {
        if (plan.action === 'fill_session') {
          const slotCopy = getSlotFillerCopy(language)
          const sessions = await loadAdvisorSlotSessions(caller, clubId)
          if (sessions.length === 0) {
            assistantState = {
              ...(memory.state || {}),
              latestOutcome: memory.state?.latestOutcome,
              recentOutcomes: memory.state?.recentOutcomes || [],
              currentSession: undefined,
              lastActionKind: 'fill_session',
              lastActionTitle: 'Fill an underfilled session',
              updatedAt: new Date().toISOString(),
            }
            assistantMessage = withSuggested(slotCopy.noSessions, slotCopy.suggestions)
          } else {
            const sessionId = plan.sessionId
            const explicitSession = sessionId
              ? sessions.find((session: AdvisorSlotSessionOption) => session.id === sessionId) || null
              : null
            const resolved = explicitSession
              ? { session: explicitSession, reason: 'best_match' as const }
              : resolveAdvisorSlotSession({
                  message: effectiveMessage,
                  sessions,
                  currentSession: memory.state?.currentSession,
                })

            if (!resolved.session) {
              const pending = {
                action: 'fill_session' as const,
                field: 'session' as const,
                question: slotCopy.needSession,
                options: buildAdvisorSlotSessionOptions(sessions),
                originalMessage: message,
                channel: plan.channel,
                candidateLimit: plan.candidateLimit,
                sessionOptions: sessions.slice(0, 6),
              }
              assistantState = withAdvisorPendingClarification(memory.state, pending)
              assistantMessage = withSuggested(slotCopy.needSession, pending.options)
            }
          }
        } else {
          const clarification = maybeStartAdvisorClarification({
            message: effectiveMessage,
            plan,
            state: memory.state,
            language,
            timeZone: clubTimeZone,
          })

          if (clarification) {
            assistantState = withAdvisorPendingClarification(memory.state, clarification.pending)
            assistantMessage = withSuggested(clarification.text, clarification.suggestions)
          }
        }
      }
    }

    if (assistantMessage) {
      const assistantAction = extractAdvisorAction(assistantMessage)
      const assistantRecord = await persistAdvisorExchange({
        clubId,
        userId: session.userId,
        conversationId: convId,
        userMessage: message,
        assistantMessage,
        titleSource: message,
        language,
        assistantState,
        action: assistantAction,
        existingDraftId: draftIdToReuse,
      })

      return Response.json({
        handled: true,
        conversationId: convId,
        assistantMessage,
        assistantMessageId: assistantRecord.id,
        assistantMetadata: assistantRecord.metadata,
      })
    }

    if (plan.action === 'none') {
      return Response.json({ handled: false })
    } else if (plan.action === 'create_cohort') {
      const parsed = await caller.intelligence.parseCohortFromText({
        clubId,
        text: plan.audienceText || message,
      })

      const action: AdvisorAction = {
        kind: 'create_cohort',
        title: `Create audience: ${parsed.name}`,
        summary: `${parsed.count} matching members`,
        requiresApproval: true,
        cohort: {
          name: parsed.name,
          description: parsed.description,
          filters: parsed.filters as any,
          count: parsed.count,
        },
      }

      assistantState = buildAdvisorConversationStateFromAction(action)
      assistantMessage = withSuggested(
        `${copy.audienceReady(parsed.count, parsed.name)}\n\n${buildAdvisorActionTag(action)}`,
        copy.suggestions.create_cohort,
      )
    } else if (plan.action === 'fill_session') {
      const fillSessionResponse = await buildFillSessionAssistantResponse({
        caller,
        prisma,
        clubId,
        language,
        state: memory.state,
        message: effectiveMessage,
        sessionId: plan.sessionId,
        channel: plan.channel,
        candidateLimit: plan.candidateLimit,
        defaultsApplied,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })

      assistantState = fillSessionResponse.assistantState
      assistantMessage = fillSessionResponse.assistantMessage
    } else if (plan.action === 'reactivate_members') {
      const reactivationResponse = await buildReactivationAssistantResponse({
        caller,
        prisma,
        clubId,
        language,
        state: memory.state,
        message: effectiveMessage,
        inactivityDays: plan.inactivityDays,
        channel: plan.channel,
        candidateLimit: plan.candidateLimit,
        defaultsApplied,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })

      assistantState = reactivationResponse.assistantState
      assistantMessage = reactivationResponse.assistantMessage
    } else if (plan.action === 'trial_follow_up') {
      const lifecycleResponse = await buildMembershipLifecycleAssistantResponse({
        caller,
        clubId,
        language,
        state: memory.state,
        message: effectiveMessage,
        kind: 'trial_follow_up',
        deliveryMode: plan.deliveryMode,
        scheduledFor: plan.scheduledFor,
        planTimeZone: plan.timeZone,
        channel: plan.channel,
        candidateLimit: plan.candidateLimit,
        defaultsApplied,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })

      assistantState = lifecycleResponse.assistantState
      assistantMessage = lifecycleResponse.assistantMessage
    } else if (plan.action === 'renewal_reactivation') {
      const lifecycleResponse = await buildMembershipLifecycleAssistantResponse({
        caller,
        clubId,
        language,
        state: memory.state,
        message: effectiveMessage,
        kind: 'renewal_reactivation',
        deliveryMode: plan.deliveryMode,
        scheduledFor: plan.scheduledFor,
        planTimeZone: plan.timeZone,
        channel: plan.channel,
        candidateLimit: plan.candidateLimit,
        defaultsApplied,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })

      assistantState = lifecycleResponse.assistantState
      assistantMessage = lifecycleResponse.assistantMessage
    } else if (plan.action === 'program_schedule') {
      const programmingResponse = await buildProgrammingAssistantResponse({
        prisma,
        clubId,
        language,
        state: memory.state,
        message: effectiveMessage,
      })

      assistantState = programmingResponse.assistantState
      assistantMessage = programmingResponse.assistantMessage
    } else if (plan.action === 'update_contact_policy') {
      const contactPolicyCopy = getContactPolicyCopy(language)
      const currentPolicy = resolveAdvisorContactPolicy({
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })
      const updatedPolicy = updateAdvisorContactPolicyFromMessage({
        message: effectiveMessage,
        currentPolicy,
      })

      if (!updatedPolicy) {
        assistantState = {
          ...(memory.state || {}),
          latestOutcome: memory.state?.latestOutcome,
          recentOutcomes: memory.state?.recentOutcomes || [],
          currentContactPolicy: currentPolicy,
          lastActionKind: 'update_contact_policy',
          lastActionTitle: 'Update club contact policy',
          updatedAt: new Date().toISOString(),
        }
        assistantMessage = withSuggested(
          contactPolicyCopy.needChanges,
          copy.suggestions.update_contact_policy,
        )
      } else {
        const action = buildContactPolicyAction(updatedPolicy)
        assistantState = buildAdvisorConversationStateFromAction(action)
        assistantMessage = withSuggested(
          [
            copy.contactPolicyReady(action.policy.changes.length),
            ...action.policy.changes,
            buildAdvisorActionTag(action),
          ].join('\n\n'),
          copy.suggestions.update_contact_policy,
        )
      }
    } else if (plan.action === 'update_autonomy_policy') {
      const autonomyPolicyCopy = getAutonomyPolicyCopy(language)
      const currentPolicy = resolveAdvisorAutonomyPolicy(clubContext?.automationSettings)
      const updatedPolicy = updateAdvisorAutonomyPolicyFromMessage({
        message: effectiveMessage,
        currentPolicy,
      })

      if (!updatedPolicy) {
        assistantState = {
          ...(memory.state || {}),
          latestOutcome: memory.state?.latestOutcome,
          recentOutcomes: memory.state?.recentOutcomes || [],
          currentAutonomyPolicy: currentPolicy,
          lastActionKind: 'update_autonomy_policy',
          lastActionTitle: 'Update club autonomy policy',
          updatedAt: new Date().toISOString(),
        }
        assistantMessage = withSuggested(
          autonomyPolicyCopy.needChanges,
          copy.suggestions.update_autonomy_policy,
        )
      } else {
        const action = buildAutonomyPolicyAction(updatedPolicy)
        assistantState = buildAdvisorConversationStateFromAction(action)
        assistantMessage = withSuggested(
          [
            copy.autonomyPolicyReady(action.policy.changes.length),
            ...action.policy.changes,
            buildAdvisorActionTag(action),
          ].join('\n\n'),
          copy.suggestions.update_autonomy_policy,
        )
      }
    } else if (plan.action === 'update_sandbox_routing') {
      const sandboxRoutingCopy = getSandboxRoutingCopy(language)
      const currentPolicy = resolveAdvisorSandboxRoutingDraft(clubContext?.automationSettings)
      const updatedPolicy = updateAdvisorSandboxRoutingFromMessage({
        message: effectiveMessage,
        currentPolicy,
      })

      if (!updatedPolicy) {
        assistantState = {
          ...(memory.state || {}),
          latestOutcome: memory.state?.latestOutcome,
          recentOutcomes: memory.state?.recentOutcomes || [],
          currentSandboxRouting: currentPolicy,
          lastActionKind: 'update_sandbox_routing',
          lastActionTitle: 'Update sandbox routing',
          updatedAt: new Date().toISOString(),
        }
        assistantMessage = withSuggested(
          sandboxRoutingCopy.needChanges,
          copy.suggestions.update_sandbox_routing,
        )
      } else {
        const action = buildSandboxRoutingAction(updatedPolicy)
        assistantState = buildAdvisorConversationStateFromAction(action)
        assistantMessage = withSuggested(
          [
            copy.sandboxRoutingReady(action.policy.changes.length),
            ...action.policy.changes,
            buildAdvisorActionTag(action),
          ].join('\n\n'),
          copy.suggestions.update_sandbox_routing,
        )
      }
    } else {
      let audienceDraft: AdvisorCampaignAction['audience']
      const shouldReuseAudience = plan.usePreviousCohort || isCampaignOnlyFollowUp(message)
      const activeMemory = shouldReuseAudience ? memory : null
      const previousAction = activeMemory?.lastAction || (shouldReuseAudience ? await getLastAdvisorAction(convId) : null)

      if (activeMemory?.state?.currentAudience) {
        audienceDraft = activeMemory.state.currentAudience
      } else if (previousAction?.kind === 'create_cohort') {
        audienceDraft = previousAction.cohort
      } else if (previousAction?.kind === 'create_campaign') {
        audienceDraft = previousAction.audience
      } else {
        const parsed = await caller.intelligence.parseCohortFromText({
          clubId,
          text: plan.audienceText || message,
        })
        audienceDraft = {
          name: parsed.name,
          description: parsed.description,
          filters: parsed.filters as any,
          count: parsed.count,
        }
      }

      const campaignType = plan.campaignType || 'REACTIVATION'
      const channel = plan.channel || 'email'
      const deliveryMode = plan.deliveryMode || 'save_draft'
      const scheduledSend = deliveryMode === 'send_later'
        ? (
            plan.scheduledFor
              ? {
                  scheduledFor: plan.scheduledFor,
                  timeZone: plan.timeZone || clubTimeZone,
                  label: formatAdvisorScheduledLabel(plan.scheduledFor, plan.timeZone || clubTimeZone),
                }
              : parseAdvisorScheduledSend({
                  message: effectiveMessage,
                  timeZone: plan.timeZone || clubTimeZone,
                })
          )
        : null
      const generated = await caller.intelligence.generateCampaignMessage({
        clubId,
        campaignType,
        channel,
        audienceCount: audienceDraft.count || 0,
        context: {
          riskSegment: audienceDraft.name,
        },
      })

      const baseAction: AdvisorCampaignAction = {
        kind: 'create_campaign',
        title: `Launch ${campaignType.replace(/_/g, ' ').toLowerCase()} campaign`,
        summary: `${channel.toUpperCase()} ${deliveryMode === 'send_now' ? 'outreach' : deliveryMode === 'send_later' ? 'scheduled outreach' : 'draft'} for ${audienceDraft.count || 0} members`,
        requiresApproval: true,
        audience: audienceDraft,
        campaign: {
          type: campaignType,
          channel,
          subject: generated.subject,
          body: generated.body,
          smsBody: generated.smsBody || undefined,
          execution: {
            mode: deliveryMode,
            ...(scheduledSend
              ? {
                  scheduledFor: scheduledSend.scheduledFor,
                  timeZone: scheduledSend.timeZone,
                }
              : {}),
          },
        },
        defaultsApplied,
      }
      const hydratedCampaign = await hydrateAdvisorCampaignAction({
        clubId,
        action: baseAction,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })
      const campaignAction = await maybeAttachCampaignRecommendation({
        action: hydratedCampaign.action,
        clubId,
        message: effectiveMessage,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })
      const resolvedCampaignAction = campaignAction.kind === 'create_campaign'
        ? campaignAction
        : hydratedCampaign.action
      const guardrailNote = formatAdvisorGuardrailDigest(hydratedCampaign.guardrails)
      const ruleNote = hydratedCampaign.excludedByRules > 0
        ? `${hydratedCampaign.excludedByRules} member${hydratedCampaign.excludedByRules === 1 ? '' : 's'} excluded by recipient rules.`
        : ''

      assistantState = buildAdvisorConversationStateFromAction(campaignAction)
      assistantMessage = withSuggested(
        [
          buildCampaignReadyText(
            copy,
            hydratedCampaign.guardrails.eligibleCount,
            resolvedCampaignAction.audience.name,
            deliveryMode,
            scheduledSend?.label,
          ),
          [ruleNote, guardrailNote].filter(Boolean).join(' ').trim(),
          buildAdvisorActionTag(campaignAction),
        ].filter(Boolean).join('\n\n'),
        copy.suggestions.create_campaign,
      )
    }

    const assistantAction = extractAdvisorAction(assistantMessage)
    const assistantRecord = await persistAdvisorExchange({
      clubId,
      userId: session.userId,
      conversationId: convId,
      userMessage: message,
      assistantMessage,
      titleSource: message,
      language,
      assistantState,
      action: assistantAction,
      existingDraftId: draftIdToReuse,
    })

    return Response.json({
      handled: true,
      conversationId: convId,
      assistantMessage,
      assistantMessageId: assistantRecord.id,
      assistantMetadata: assistantRecord.metadata,
    })
  } catch (error) {
    console.error('[Advisor Action] POST error:', error instanceof Error ? error.message : error)
    return Response.json({ handled: false, error: 'Internal server error' }, { status: 500 })
  }
}
