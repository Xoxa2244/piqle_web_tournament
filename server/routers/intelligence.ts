import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { checkFeatureAccess } from '@/lib/subscription'
import type { DayOfWeek, PlaySessionFormat } from '@/types/intelligence'
import {
  getSlotFillerRecommendations,
  getWeeklyPlan,
  getReactivationCandidates,
  getEventRecommendations,
  sendInvites,
  sendReactivationMessages,
  sendEventInviteMessages,
  sendOutreachMessage,
  upsertPreferences,
  getPreferences,
} from '@/lib/ai/intelligence-service'
import { checkCampaignAlerts } from '@/lib/ai/scoring-optimizer'
import { generateMemberProfilesForClub, generateSingleMemberProfile } from '@/lib/ai/member-profile-generator'
import { generateClubInsights } from '@/lib/ai/insights-engine'
import { intelligenceLogger as log } from '@/lib/logger'
import { pushToUser } from '@/lib/realtime'
import { advisorActionSchema, extractAdvisorAction, getAdvisorActionFromMetadata } from '@/lib/ai/advisor-actions'
import { withAdvisorActionRuntimeState } from '@/lib/ai/advisor-action-state'
import {
  buildAdvisorConversationStateFromAction,
  getAdvisorConversationStateFromMetadata,
  withAdvisorCurrentDraft,
  withAdvisorOutcome,
} from '@/lib/ai/advisor-conversation-state'
import {
  buildAdvisorProgrammingOpsSessionDrafts,
  detectAdvisorDraftSelectedPlan,
  getAdvisorDraftFromMetadata,
  persistAdvisorDraft,
  resolveAdvisorDraftStatusFromResult,
  updateAdvisorDraftStatus,
  withAdvisorDraftMetadata,
} from '@/lib/ai/advisor-drafts'
import { buildOpsSessionPublishReview } from '@/lib/ai/ops-session-publish'
import { buildOpsSessionLiveFeedback } from '@/lib/ai/ops-session-feedback'
import { buildOpsSessionAftercareReview } from '@/lib/ai/ops-session-aftercare'
import { buildGuestTrialBookingSnapshot, type GuestTrialBookingRow } from '@/lib/ai/guest-trial-booking'
import { buildSmartFirstSessionSnapshot, type SmartFirstSessionRow } from '@/lib/ai/smart-first-session'
import { buildWinBackSnapshot, type WinBackRow } from '@/lib/ai/win-back'
import {
  buildReferralSnapshot,
  evaluateReferralRewardGuardrails,
  type ReferralCapturedGuestRow,
  type ReferralOutcomeRow,
  type ReferralRewardIssuanceRow,
  type ReferralRow,
} from '@/lib/ai/referral-engine'
import {
  buildAgentControlPlaneChangeSummary,
  diffAgentControlPlaneResolved,
  evaluateAgentControlPlaneAction,
  getAgentControlPlaneAudit,
  resolveAgentControlPlane,
} from '@/lib/ai/agent-control-plane'
import {
  buildAgentOutreachRolloutSummary,
  evaluateAgentOutreachRollout,
  getAgentOutreachRolloutStatus,
  resolveAgentOutreachRollout,
  type AgentOutreachRolloutActionKind,
} from '@/lib/ai/agent-outreach-rollout'
import { buildAgentOutreachPilotSnapshot } from '@/lib/ai/agent-outreach-pilot'
import { buildCampaignGuestTrialAnalytics } from '@/lib/ai/campaign-guest-trial-analytics'
import { buildIntegrationHealthSnapshot } from '@/lib/ai/integration-health'
import { syncIntegrationAnomalyHistory } from '@/lib/ai/integration-anomaly-history'
import {
  evaluateAgentPermission,
  formatClubAdminRole,
  resolveAgentPermissions,
  type AgentPermissionAction,
  type ClubAdminRole,
} from '@/lib/ai/agent-permissions'
import { normalizeMembership, resolveMembershipMappings } from '@/lib/ai/membership-intelligence'
import {
  listAgentDecisionRecordsSafe,
  persistAgentDecisionRecord,
} from '@/lib/ai/agent-decision-records'
import {
  scheduleCampaignSend,
  sendCampaignNow,
} from '@/lib/ai/advisor-campaign-jobs'
import { resolveAdvisorAutonomyPolicy } from '@/lib/ai/advisor-autonomy-policy'
import { resolveAdvisorAdminReminderRouting } from '@/lib/ai/advisor-admin-reminder-policy'
import { resolveAdvisorContactPolicy } from '@/lib/ai/advisor-contact-policy'
import { resolveAdvisorSandboxRoutingDraft } from '@/lib/ai/advisor-sandbox-policy'
import { buildAdvisorSandboxRoutingSummary } from '@/lib/ai/advisor-sandbox-routing'
import { buildAdvisorOutcomeMemory, withAdvisorOutcomeMetadata } from '@/lib/ai/advisor-outcomes'
import { buildAdvisorPerformanceSignalForAction } from '@/lib/ai/advisor-outcome-insights'
import { formatAdvisorScheduledLabel } from '@/lib/ai/advisor-scheduling'
import { evaluateAdvisorContactGuardrails } from '@/lib/ai/advisor-contact-guardrails'
import type { GuestTrialExecutionContext } from '@/lib/ai/guest-trial-offers'
import type { ReferralExecutionContext } from '@/lib/ai/referral-offers'
import { formatAdvisorSlotSessionLabel } from '@/lib/ai/advisor-slot-filler'

// In-memory cache for expensive co-player social graph query (30 min TTL)
const coPlayerCache = new Map<string, { ts: number; data: Map<string, { activeCoPlayers: number; totalCoPlayers: number }> }>()

// ── In-memory caches (per serverless instance, 5 min TTL) ──
const calendarCache = new Map<string, { data: any; ts: number }>()

// ── Helper: Check club admin access ──
async function requireClubAdmin(prisma: any, clubId: string, userId: string) {
  const admin = await prisma.clubAdmin.findFirst({
    where: { clubId, userId },
  })
  if (!admin) {
    // Also allow club followers (members) for some read operations
    const follower = await prisma.clubFollower.findFirst({
      where: { clubId, userId },
    })
    if (!follower) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You must be a club member or admin to access intelligence features.',
      })
    }
    return { isAdmin: false, isMember: true, role: null as ClubAdminRole | null }
  }
  return {
    isAdmin: true,
    isMember: true,
    role: admin.role as ClubAdminRole,
  }
}

function assertAgentPermissionForAdmin(input: {
  automationSettings?: unknown
  action: AgentPermissionAction
  adminRole: ClubAdminRole | null
}) {
  if (!input.adminRole) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only club admins can run this agent action.',
    })
  }

  const evaluation = evaluateAgentPermission({
    automationSettings: input.automationSettings,
    action: input.action,
    clubAdminRole: input.adminRole,
  })

  if (!evaluation.allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: evaluation.reason,
    })
  }

  return evaluation
}

async function enforceManualLiveOutreachGate(input: {
  prisma: any
  clubId: string
  userId: string
  automationSettings?: unknown
  adminRole: ClubAdminRole | null
  targetType: string
  targetId?: string | null
  actionKind: AgentOutreachRolloutActionKind
  channel: 'email' | 'sms' | 'both'
  recipientCount: number
  label: string
}) {
  assertAgentPermissionForAdmin({
    automationSettings: input.automationSettings,
    action: 'outreachSend',
    adminRole: input.adminRole,
  })

  const controlPlane = evaluateAgentControlPlaneAction({
    automationSettings: input.automationSettings,
    action: 'outreachSend',
  })

  if (!controlPlane.allowed || controlPlane.shadow) {
    const result = controlPlane.shadow ? 'shadowed' : 'blocked'
    const summary = controlPlane.shadow
      ? `${controlPlane.reason} This live send stays in shadow mode only.`
      : controlPlane.reason

    await persistAgentDecisionRecord(input.prisma, {
      clubId: input.clubId,
      userId: input.userId,
      action: 'outreachSend',
      targetType: input.targetType,
      targetId: input.targetId || null,
      mode: controlPlane.mode,
      result,
      summary,
      metadata: {
        reason: controlPlane.shadow ? 'control_plane_shadow' : 'control_plane_disabled',
        actionKind: input.actionKind,
        channel: input.channel,
        recipientCount: input.recipientCount,
        label: input.label,
      },
    })

    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: summary,
    })
  }

  const rollout = evaluateAgentOutreachRollout({
    clubId: input.clubId,
    automationSettings: input.automationSettings,
    actionKind: input.actionKind,
  })

  if (!rollout.allowed) {
    await persistAgentDecisionRecord(input.prisma, {
      clubId: input.clubId,
      userId: input.userId,
      action: 'outreachSend',
      targetType: input.targetType,
      targetId: input.targetId || null,
      mode: controlPlane.mode,
      result: 'blocked',
      summary: rollout.reason,
      metadata: {
        reason: 'outreach_rollout_blocked',
        actionKind: input.actionKind,
        channel: input.channel,
        recipientCount: input.recipientCount,
        label: input.label,
        rolloutClubAllowlisted: rollout.clubAllowlisted,
        rolloutActionEnabled: rollout.actionEnabled,
      },
    })

    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: rollout.reason,
    })
  }
}

function normalizeAdvisorSlotSession(raw: {
  id: string
  title: string | null
  date: Date | string
  startTime: string | null
  endTime: string | null
  format: string | null
  skillLevel: string | null
  court: string | null
  registered: number
  maxPlayers: number
}) {
  const registered = raw.registered ?? 0
  const maxPlayers = raw.maxPlayers || 1
  const occupancy = Math.round((registered / Math.max(maxPlayers, 1)) * 100)
  return {
    id: raw.id,
    title: raw.title || raw.format || 'Session',
    date: raw.date instanceof Date ? raw.date.toISOString().slice(0, 10) : String(raw.date || ''),
    startTime: raw.startTime || '',
    endTime: raw.endTime || null,
    format: raw.format || null,
    skillLevel: raw.skillLevel || null,
    court: raw.court || null,
    registered,
    maxPlayers,
    occupancy,
    spotsRemaining: Math.max(0, maxPlayers - registered),
  }
}

function buildScheduleFillDraftUserMessage(session: ReturnType<typeof normalizeAdvisorSlotSession>) {
  return `Prepare a fill plan for ${session.title} on ${session.date} at ${session.startTime}.`
}

function buildScheduleFillDraftAssistantMessage(opts: {
  session: ReturnType<typeof normalizeAdvisorSlotSession>
  candidateCount: number
  channel: 'email' | 'sms' | 'both'
}) {
  return `I prepared a slot-filler draft for ${formatAdvisorSlotSessionLabel(opts.session)}. It targets ${opts.candidateCount} matched players via ${opts.channel.toUpperCase()}. Review the shortlist and invite copy before sending.`
}

function buildScheduleFillDraftNoCandidateMessage(opts: {
  session: ReturnType<typeof normalizeAdvisorSlotSession>
  warning?: string | null
}) {
  const warning = opts.warning ? ` ${opts.warning}` : ''
  return `I checked ${formatAdvisorSlotSessionLabel(opts.session)}, but I could not build a sendable fill draft right now because there are no eligible members after guardrails.${warning}`
}

async function createAdvisorConversationFromAction(opts: {
  prisma: any
  clubId: string
  userId: string
  title: string
  userMessage: string
  assistantMessage: string
  action?: z.infer<typeof advisorActionSchema> | null
}) {
  const conversation = await opts.prisma.aIConversation.create({
    data: {
      clubId: opts.clubId,
      userId: opts.userId,
      title: opts.title.slice(0, 100),
      language: 'en',
    },
    select: {
      id: true,
    },
  })

  await opts.prisma.aIMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: opts.userMessage,
      metadata: {
        source: 'schedule_one_click',
      },
    },
  })

  const occurredAt = new Date().toISOString()
  const baseState = opts.action
    ? buildAdvisorConversationStateFromAction(opts.action, occurredAt)
    : null
  const assistantMetadata: Record<string, unknown> = {
    source: 'schedule_one_click',
    handled: true,
    ...(baseState ? { advisorState: baseState } : {}),
    ...(opts.action ? { advisorResolvedAction: opts.action } : {}),
    ...(opts.action ? { advisorActionState: { status: 'active' as const, updatedAt: occurredAt } } : {}),
  }

  const assistantRecord = await opts.prisma.aIMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: opts.assistantMessage,
      metadata: assistantMetadata as any,
    },
    select: {
      id: true,
      metadata: true,
    },
  })

  let finalMetadata = assistantRecord.metadata as Record<string, unknown> | null
  let draftId: string | null = null

  if (opts.action) {
    const persistedDraft = await persistAdvisorDraft({
      prisma: opts.prisma,
      clubId: opts.clubId,
      userId: opts.userId,
      conversationId: conversation.id,
      sourceMessageId: assistantRecord.id,
      action: opts.action,
      originalIntent: opts.userMessage,
    })

    if (persistedDraft) {
      draftId = persistedDraft.id
      const nextState = withAdvisorCurrentDraft(
        baseState || buildAdvisorConversationStateFromAction(opts.action, occurredAt),
        persistedDraft,
        occurredAt,
      )

      finalMetadata = withAdvisorDraftMetadata(
        {
          ...assistantMetadata,
          advisorState: nextState,
        },
        persistedDraft,
      ) as Record<string, unknown>

      await opts.prisma.aIMessage.update({
        where: { id: assistantRecord.id },
        data: {
          metadata: finalMetadata as any,
        },
      })
    }
  }

  await opts.prisma.aIConversation.update({
    where: { id: conversation.id },
    data: {
      title: opts.title.slice(0, 100),
      updatedAt: new Date(),
    },
  }).catch(() => undefined)

  return {
    conversationId: conversation.id,
    messageId: assistantRecord.id,
    draftId,
    metadata: finalMetadata,
  }
}

// ── Helper: describe agent action for pending queue ──
function describeAgentAction(type: string, reasoning: any): string {
  const sequenceLabel = reasoning?.sequenceFollowUp && typeof reasoning?.stepNumber === 'number'
    ? `Sequence step ${reasoning.stepNumber}: `
    : ''

  if (reasoning?.membershipLifecycle === 'trial_follow_up') {
    return `${sequenceLabel}Trial follow-up for ${reasoning?.memberName || 'trial member'}`
  }

  if (reasoning?.membershipLifecycle === 'renewal_reactivation') {
    return `${sequenceLabel}Renewal outreach for ${reasoning?.memberName || 'recently active member'}`
  }

  switch (type) {
    case 'CHECK_IN': return `${sequenceLabel}Check-in for ${reasoning?.transition || 'watch member'}`
    case 'RETENTION_BOOST': return `${sequenceLabel}Win-back for ${reasoning?.transition || 'at-risk member'}`
    case 'SLOT_FILLER': return `Fill session: ${reasoning?.sessionTitle || 'underfilled session'}`
    case 'NEW_MEMBER_WELCOME': return 'Welcome new member'
    case 'REACTIVATION': return 'Reactivation outreach'
    default: return `${sequenceLabel}${type}`
  }
}

function buildApprovedAgentMessage(opts: {
  type: string
  clubName: string
  clubId: string
  memberName?: string | null
  reasoning?: any
}) {
  const firstName = opts.memberName?.split(' ')[0] || 'there'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'

  if (opts.type === 'NEW_MEMBER_WELCOME') {
    return {
      subject: `Welcome to ${opts.clubName}!`,
      body: `Hey ${firstName}!\n\nWelcome to ${opts.clubName}. We're excited to have you in the club and we'd love to see you on court soon.`,
      bookingUrl: `${baseUrl}/clubs/${opts.clubId}/play`,
    }
  }

  if (opts.type === 'SLOT_FILLER') {
    const sessionTitle = opts.reasoning?.sessionTitle || 'an upcoming session'
    return {
      subject: `${opts.clubName} — spot open in ${sessionTitle}`,
      body: `Hey ${firstName}!\n\nA spot just opened in ${sessionTitle}. If you want in, now is a great time to jump on it.`,
      bookingUrl: `${baseUrl}/clubs/${opts.clubId}/intelligence/sessions`,
    }
  }

  if (opts.type === 'CHECK_IN') {
    return {
      subject: opts.reasoning?.originalSubject || `${opts.clubName} — checking in`,
      body: `Hey ${firstName}!\n\nJust checking in from ${opts.clubName}. We'd love to help you get back into a good rhythm on court.`,
      bookingUrl: `${baseUrl}/clubs/${opts.clubId}/play`,
    }
  }

  if (opts.reasoning?.membershipLifecycle === 'trial_follow_up') {
    return {
      subject: `${opts.clubName} — ready for your first game?`,
      body: `Hey ${firstName}!\n\nYour trial is active at ${opts.clubName}, and we'd love to help you get that first booking on the calendar.`,
      bookingUrl: `${baseUrl}/clubs/${opts.clubId}/play`,
    }
  }

  if (opts.reasoning?.membershipLifecycle === 'renewal_reactivation') {
    return {
      subject: `${opts.clubName} — let's get you back on court`,
      body: `Hey ${firstName}!\n\nYou've been active with ${opts.clubName} recently, and this is a great time to jump back in with a renewal or a fresh booking.`,
      bookingUrl: `${baseUrl}/clubs/${opts.clubId}/play`,
    }
  }

  return {
    subject: opts.reasoning?.originalSubject || `${opts.clubName} — we'd love to see you back!`,
    body: `Hey ${firstName}!\n\nWe noticed it's been a while, and we'd love to have you back at ${opts.clubName}.`,
    bookingUrl: `${baseUrl}/clubs/${opts.clubId}/play`,
  }
}

function buildAdvisorSandboxPreviewRecipients(
  recipients: Array<{ memberId: string; channel: 'email' | 'sms' | 'both' }>,
  detailsById: Map<string, { name?: string | null; email?: string | null; phone?: string | null; score?: number | null }>,
) {
  return recipients.slice(0, 5).map((recipient) => {
    const details = detailsById.get(recipient.memberId)
    return {
      memberId: recipient.memberId,
      name: details?.name || 'Unknown member',
      channel: recipient.channel,
      ...(typeof details?.score === 'number' ? { score: details.score } : {}),
      ...(details?.email ? { email: details.email } : {}),
      ...(details?.phone ? { phone: details.phone } : {}),
    }
  })
}

function buildAdvisorSandboxDraftMetadata(result: Record<string, any>) {
  return {
    sandboxPreview: result?.sandboxed
      ? {
          kind: result.kind,
          channel: result.channel,
          deliveryMode: result.deliveryMode || 'send_now',
          recipientCount: result.previewRecipientCount || 0,
          skippedCount: result.skipped || 0,
          scheduledLabel: result.scheduledLabel || undefined,
          note: result?.sandboxRouting?.note || 'Live delivery is safety-locked. This draft was executed in sandbox preview mode only.',
          routing: result?.sandboxRouting || undefined,
          recipients: Array.isArray(result.previewRecipients) ? result.previewRecipients : [],
        }
      : null,
    opsSessionDrafts: Array.isArray(result?.opsSessionDrafts) ? result.opsSessionDrafts : [],
  }
}

function mapOpsSessionDraftStatusForMetadata(status: string) {
  switch (status) {
    case 'SESSION_DRAFT':
      return 'session_draft' as const
    case 'REJECTED':
      return 'rejected' as const
    case 'ARCHIVED':
      return 'archived' as const
    default:
      return 'ready_for_ops' as const
  }
}

function serializeOpsSessionDraftRecordForMetadata(record: any) {
  const metadata =
    record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, any>)
      : null
  return {
    id: record.id,
    sourceProposalId: record.sourceProposalId,
    origin: record.origin === 'alternative' ? 'alternative' : 'primary',
    state: mapOpsSessionDraftStatusForMetadata(String(record.status || 'READY_FOR_OPS')),
    title: record.title,
    dayOfWeek: record.dayOfWeek,
    timeSlot: record.timeSlot,
    startTime: record.startTime,
    endTime: record.endTime,
    format: record.format,
    skillLevel: record.skillLevel,
    maxPlayers: record.maxPlayers,
    projectedOccupancy: record.projectedOccupancy,
    estimatedInterestedMembers: record.estimatedInterestedMembers,
    confidence: record.confidence,
    note: record.note,
    conflict: metadata?.conflict || undefined,
    handoff: metadata?.handoff || undefined,
    opsWorkflow: metadata?.opsWorkflow || undefined,
    timeline: Array.isArray(metadata?.timeline) ? metadata.timeline : undefined,
  }
}

function getOpsSessionDraftMetadataRoot(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  return { ...(metadata as Record<string, unknown>) }
}

function getOpsSessionDraftWorkflowMetadata(metadata: unknown) {
  const current = getOpsSessionDraftMetadataRoot(metadata).opsWorkflow
  if (!current || typeof current !== 'object' || Array.isArray(current)) return {}
  return { ...(current as Record<string, unknown>) }
}

function getOpsSessionDraftHandoffMetadata(metadata: unknown) {
  const current = getOpsSessionDraftMetadataRoot(metadata).handoff
  if (!current || typeof current !== 'object' || Array.isArray(current)) return {}
  return { ...(current as Record<string, unknown>) }
}

function getOpsSessionDraftTimelineMetadata(metadata: unknown) {
  const current = getOpsSessionDraftMetadataRoot(metadata).timeline
  if (!Array.isArray(current)) return []
  return current
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({ ...(entry as Record<string, unknown>) }))
}

function appendOpsSessionDraftTimelineEvent(
  metadata: unknown,
  event: {
    kind: string
    label: string
    detail?: string | null
    actorLabel?: string | null
    createdAt: string
  },
) {
  const existingTimeline = getOpsSessionDraftTimelineMetadata(metadata)
  const nextEvent = {
    id: `${event.kind}:${event.createdAt}`,
    kind: event.kind,
    label: event.label,
    ...(event.detail ? { detail: event.detail } : {}),
    ...(event.actorLabel ? { actorLabel: event.actorLabel } : {}),
    createdAt: event.createdAt,
  }
  return [nextEvent, ...existingTimeline].slice(0, 8)
}

function getOpsSessionDraftSessionMetadata(metadata: unknown) {
  const current = getOpsSessionDraftMetadataRoot(metadata).sessionDraft
  if (!current || typeof current !== 'object' || Array.isArray(current)) return {}
  return { ...(current as Record<string, unknown>) }
}

function buildOpsSessionDraftPlannedSnapshot(record: {
  title: string
  description?: string | null
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  maxPlayers: number
  createdAt?: Date | string | null
}, sessionDraft: Record<string, unknown>) {
  const targetDateIso =
    typeof sessionDraft.targetDateIso === 'string' && sessionDraft.targetDateIso
      ? sessionDraft.targetDateIso
      : null
  const targetDate =
    typeof sessionDraft.targetDate === 'string' && sessionDraft.targetDate
      ? `${sessionDraft.targetDate}T12:00:00.000Z`
      : null

  return {
    title:
      typeof sessionDraft.title === 'string' && sessionDraft.title.trim()
        ? sessionDraft.title
        : record.title,
    description:
      typeof sessionDraft.description === 'string'
        ? sessionDraft.description
        : record.description || null,
    date:
      targetDateIso
      || targetDate
      || (record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : typeof record.createdAt === 'string'
          ? record.createdAt
          : new Date().toISOString()),
    startTime: record.startTime,
    endTime: record.endTime,
    format: record.format,
    skillLevel: record.skillLevel,
    maxPlayers: record.maxPlayers,
  }
}

function buildOpsSessionDraftHref(clubId: string, draft: { id: string; dayOfWeek?: string | null }) {
  const params = new URLSearchParams({
    focus: 'ops-queue',
    opsDraftId: draft.id,
  })
  if (draft.dayOfWeek) params.set('day', draft.dayOfWeek)
  return `/clubs/${clubId}/intelligence/agent?${params.toString()}`
}

function parseSessionDraftPublishDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Publish date must be in YYYY-MM-DD format.',
    })
  }

  const date = new Date(`${value}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Publish date is invalid.',
    })
  }
  return date
}

function getSessionDraftPublishDayRange(value: string) {
  const dayStart = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(dayStart.getTime())) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Publish date is invalid.',
    })
  }
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
  return { dayStart, dayEnd }
}

async function buildOpsSessionDraftPublishReviewForDate(opts: {
  prisma: any
  clubId: string
  draft: {
    id: string
    title: string
    startTime: string
    endTime: string
    format: string
    skillLevel: string
  }
  publishDate: string
  ignoreSessionId?: string | null
}) {
  const { dayStart, dayEnd } = getSessionDraftPublishDayRange(opts.publishDate)
  const [existingSessions, courtCount] = await Promise.all([
    opts.prisma.playSession.findMany({
      where: {
        clubId: opts.clubId,
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
        status: {
          in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'],
        },
      },
      select: {
        id: true,
        title: true,
        date: true,
        startTime: true,
        endTime: true,
        format: true,
        skillLevel: true,
        status: true,
      },
      orderBy: [
        { date: 'asc' },
        { startTime: 'asc' },
      ],
    }),
    opts.prisma.clubCourt.count({
      where: { clubId: opts.clubId },
    }).catch(() => 0),
  ])

  return buildOpsSessionPublishReview({
    draft: {
      title: opts.draft.title,
      date: `${opts.publishDate}T12:00:00.000Z`,
      startTime: opts.draft.startTime,
      endTime: opts.draft.endTime,
      format: opts.draft.format,
      skillLevel: opts.draft.skillLevel,
    },
    existingSessions,
    courtCount,
    ignoreSessionId: opts.ignoreSessionId,
  })
}

async function createOpsOwnerPingRecord(opts: {
  prisma: any
  clubId: string
  userId: string
  draftId: string
  draftTitle: string
  dayOfWeek?: string | null
  description: string
  metadata?: Record<string, unknown>
}) {
  const dateKey = new Date().toISOString().slice(0, 10)
  const itemId = `ops-owner-ping:${opts.draftId}`
  const href = buildOpsSessionDraftHref(opts.clubId, { id: opts.draftId, dayOfWeek: opts.dayOfWeek })

  await opts.prisma.agentAdminTodoDecision.upsert({
    where: {
      clubId_userId_dateKey_itemId: {
        clubId: opts.clubId,
        userId: opts.userId,
        dateKey,
        itemId,
      },
    },
    create: {
      clubId: opts.clubId,
      userId: opts.userId,
      dateKey,
      itemId,
      decision: 'proactive_ping',
      title: opts.draftTitle,
      bucket: 'waiting',
      href,
      metadata: {
        description: opts.description,
        proactiveKind: 'owner_due',
        reminderChannel: 'in_app',
        remindAt: new Date().toISOString(),
        ...(opts.metadata || {}),
      } as any,
    },
    update: {
      title: opts.draftTitle,
      href,
      decision: 'proactive_ping',
      metadata: {
        description: opts.description,
        proactiveKind: 'owner_due',
        reminderChannel: 'in_app',
        remindAt: new Date().toISOString(),
        ...(opts.metadata || {}),
      } as any,
    },
  }).catch((error: unknown) => {
    log.warn('[Ops Session Draft] owner ping upsert failed:', error)
  })
}

async function syncAgentDraftOpsSessionDraftMetadata(prisma: any, agentDraftId: string) {
  try {
    const drafts = await prisma.opsSessionDraft.findMany({
      where: { agentDraftId },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    const metadataDrafts = drafts.map(serializeOpsSessionDraftRecordForMetadata)
    const agentDraft = await prisma.agentDraft.findUnique({
      where: { id: agentDraftId },
      select: { metadata: true },
    })

    if (!agentDraft) return metadataDrafts

    await prisma.agentDraft.update({
      where: { id: agentDraftId },
      data: {
        metadata: {
          ...((agentDraft.metadata as Record<string, any> | null) || {}),
          opsSessionDrafts: metadataDrafts,
        },
      } as any,
    })

    return metadataDrafts
  } catch (error) {
    console.warn('[Ops Session Draft] metadata sync skipped:', error instanceof Error ? error.message : error)
    return []
  }
}

async function upsertProgrammingOpsSessionDraftRecords(opts: {
  prisma: any
  clubId: string
  createdByUserId: string
  agentDraftId: string
  action: Extract<z.infer<typeof advisorActionSchema>, { kind: 'program_schedule' }>
  sourceProposalId?: string
}) {
  const drafts = buildAdvisorProgrammingOpsSessionDrafts(opts.action).filter((draft) =>
    opts.sourceProposalId ? draft.sourceProposalId === opts.sourceProposalId : true,
  )

  try {
    const existingDrafts = await opts.prisma.opsSessionDraft.findMany({
      where: {
        agentDraftId: opts.agentDraftId,
        sourceProposalId: { in: drafts.map((draft) => draft.sourceProposalId) },
      },
      select: {
        sourceProposalId: true,
        status: true,
        note: true,
        archivedAt: true,
        metadata: true,
      },
    })
    const existingBySourceProposalId = new Map<string, {
      sourceProposalId: string
      status: string
      note: string
      archivedAt: Date | null
      metadata: unknown
    }>(
      existingDrafts.map((existingDraft: any) => [existingDraft.sourceProposalId, existingDraft]),
    )

    const records = await Promise.all(drafts.map((draft) => {
        const existing = existingBySourceProposalId.get(draft.sourceProposalId)
        const existingMetadata = getOpsSessionDraftMetadataRoot(existing?.metadata)
        const preservedWorkflow = existingMetadata.opsWorkflow
        const preservedSessionDraft = existingMetadata.sessionDraft
        const preservedHandoff = getOpsSessionDraftHandoffMetadata(existing?.metadata)
        const preservedTimeline = getOpsSessionDraftTimelineMetadata(existing?.metadata)
        const nextHandoff = {
          ...(draft.handoff || {}),
          ...(preservedHandoff.ownerLabel ? { ownerLabel: preservedHandoff.ownerLabel } : {}),
          ...(preservedHandoff.ownerUserId ? { ownerUserId: preservedHandoff.ownerUserId } : {}),
          ...(preservedHandoff.ownerBrief ? { ownerBrief: preservedHandoff.ownerBrief } : {}),
        }
        const nextMetadata = {
          ...existingMetadata,
          conflict: draft.conflict || null,
          handoff: Object.keys(nextHandoff).length > 0 ? nextHandoff : null,
          ...(preservedWorkflow ? { opsWorkflow: preservedWorkflow } : {}),
          ...(preservedSessionDraft ? { sessionDraft: preservedSessionDraft } : {}),
          ...(preservedTimeline.length > 0 ? { timeline: preservedTimeline } : {}),
        }
        const shouldPreserveNote = !!getOpsSessionDraftWorkflowMetadata(existing?.metadata).lastNoteAt

        return opts.prisma.opsSessionDraft.upsert({
          where: {
            agentDraftId_sourceProposalId: {
              agentDraftId: opts.agentDraftId,
              sourceProposalId: draft.sourceProposalId,
            },
          },
          create: {
            clubId: opts.clubId,
            agentDraftId: opts.agentDraftId,
            createdByUserId: opts.createdByUserId,
            sourceProposalId: draft.sourceProposalId,
            origin: draft.origin,
            status: 'READY_FOR_OPS',
            title: draft.title,
            dayOfWeek: draft.dayOfWeek,
            timeSlot: draft.timeSlot,
            startTime: draft.startTime,
            endTime: draft.endTime,
            format: draft.format,
            skillLevel: draft.skillLevel,
            maxPlayers: draft.maxPlayers,
            projectedOccupancy: draft.projectedOccupancy,
            estimatedInterestedMembers: draft.estimatedInterestedMembers,
            confidence: draft.confidence,
            note: draft.note,
            metadata: {
              ...nextMetadata,
              timeline: appendOpsSessionDraftTimelineEvent(null, {
                kind: 'created',
                label: 'Agent created ops draft',
                detail: `${draft.title} was prepared for internal scheduling review.`,
                createdAt: new Date().toISOString(),
              }),
            },
          },
          update: {
            origin: draft.origin,
            status: existing?.status || 'READY_FOR_OPS',
            title: draft.title,
            dayOfWeek: draft.dayOfWeek,
            timeSlot: draft.timeSlot,
            startTime: draft.startTime,
            endTime: draft.endTime,
            format: draft.format,
            skillLevel: draft.skillLevel,
            maxPlayers: draft.maxPlayers,
            projectedOccupancy: draft.projectedOccupancy,
            estimatedInterestedMembers: draft.estimatedInterestedMembers,
            confidence: draft.confidence,
            note: shouldPreserveNote ? existing?.note || draft.note : draft.note,
            metadata: nextMetadata,
            archivedAt: existing?.archivedAt,
          },
        })
      }))

    const serialized = records.map(serializeOpsSessionDraftRecordForMetadata)
    await syncAgentDraftOpsSessionDraftMetadata(opts.prisma, opts.agentDraftId)
    return serialized
  } catch (error) {
    console.warn('[Ops Session Draft] persistence skipped:', error instanceof Error ? error.message : error)
    return drafts
  }
}

// ── Cohort filter helpers ──
export interface CohortFilter {
  field: string
  op: string
  value: string | number | string[]
}

const NORMALIZED_MEMBERSHIP_COHORT_FIELDS = new Set([
  'normalizedMembershipType',
  'normalizedMembershipStatus',
])

function isNormalizedMembershipCohortField(field: string) {
  return NORMALIZED_MEMBERSHIP_COHORT_FIELDS.has(field)
}

function splitCohortFilters(filters: CohortFilter[]) {
  return {
    sqlFilters: filters.filter((filter) => !isNormalizedMembershipCohortField(filter.field)),
    normalizedMembershipFilters: filters.filter((filter) => isNormalizedMembershipCohortField(filter.field)),
  }
}

function matchesCohortTextFilter(candidate: string | null | undefined, filter: CohortFilter) {
  const normalizedCandidate = (candidate || '').toLowerCase().trim()
  const rawValues = Array.isArray(filter.value) ? filter.value : [String(filter.value)]
  const values = rawValues
    .map((value) => String(value).toLowerCase().trim())
    .filter(Boolean)

  if (filter.op === 'contains') {
    return values.some((value) => normalizedCandidate.includes(value))
  }

  if (filter.op === 'neq') {
    return values.every((value) => normalizedCandidate !== value)
  }

  return values.some((value) => normalizedCandidate === value)
}

export function buildCohortWhereClause(filters: CohortFilter[]): string {
  if (filters.length === 0) return 'TRUE'
  return filters.map(f => {
    const val = typeof f.value === 'string' ? `'${f.value.replace(/'/g, "''")}'` : f.value
    switch (f.field) {
      case 'age':
        // age = years since date_of_birth
        const ageOp = f.op === 'gte' ? '<=' : f.op === 'lte' ? '>=' : f.op === 'gt' ? '<' : f.op === 'lt' ? '>' : '='
        return `u.date_of_birth IS NOT NULL AND u.date_of_birth ${ageOp} (CURRENT_DATE - INTERVAL '${f.value} years')`
      case 'gender':
        return f.op === 'eq' ? `u.gender = ${val}` : `u.gender != ${val}`
      case 'membershipType':
        return f.op === 'contains' ? `u.membership_type ILIKE '%' || ${val} || '%'` : `u.membership_type = ${val}`
      case 'membershipStatus':
        return f.op === 'contains' ? `u.membership_status ILIKE '%' || ${val} || '%'` : `u.membership_status = ${val}`
      case 'skillLevel':
        if (f.op === 'in') {
          // value can be string "2.5-2.99" or array ["2.5-2.99", "3.0-3.49"]
          const vals = Array.isArray(f.value) ? f.value : [String(f.value)]
          const orClauses = vals.map(v => `u.skill_level ILIKE '%${String(v).replace(/'/g, "''")}%'`).join(' OR ')
          return `(${orClauses})`
        }
        // For eq/contains, always use ILIKE to match partial skill_level strings
        return `u.skill_level ILIKE '%' || ${val} || '%'`
      case 'zipCode':
        return `u.zip_code = ${val}`
      case 'city':
        return f.op === 'contains' ? `u.city ILIKE '%' || ${val} || '%'` : `u.city = ${val}`
      case 'sessionFormat':
        // Players who have played in a specific session format
        return `u.id IN (SELECT psb."userId" FROM play_session_bookings psb JOIN play_sessions ps ON ps.id = psb."sessionId" WHERE ps."clubId" = $1 AND ps.format = ${val} AND psb.status = 'CONFIRMED')`
      case 'dayOfWeek': {
        // Players who play on a specific day of week (Monday=1, Sunday=0)
        const dayMap: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
        const dayNum = dayMap[String(f.value)] ?? 0
        return `u.id IN (SELECT psb."userId" FROM play_session_bookings psb JOIN play_sessions ps ON ps.id = psb."sessionId" WHERE ps."clubId" = $1 AND EXTRACT(DOW FROM ps.date) = ${dayNum} AND psb.status = 'CONFIRMED')`
      }
      case 'frequency': {
        // Sessions per month — players who play at least N times/month
        const freqVal = Number(f.value)
        const freqOp = f.op === 'gte' ? '>=' : f.op === 'lte' ? '<=' : f.op === 'gt' ? '>' : f.op === 'lt' ? '<' : '='
        return `u.id IN (SELECT psb."userId" FROM play_session_bookings psb JOIN play_sessions ps ON ps.id = psb."sessionId" WHERE ps."clubId" = $1 AND psb.status = 'CONFIRMED' AND psb."bookedAt" >= CURRENT_DATE - INTERVAL '30 days' GROUP BY psb."userId" HAVING COUNT(*) ${freqOp} ${freqVal})`
      }
      case 'recency': {
        // Days since last visit — players who visited within/after N days
        const recVal = Number(f.value)
        const recOp = f.op === 'lte' ? '>=' : f.op === 'gte' ? '<=' : f.op === 'lt' ? '>' : f.op === 'gt' ? '<' : '='
        return `u.id IN (SELECT psb."userId" FROM play_session_bookings psb JOIN play_sessions ps ON ps.id = psb."sessionId" WHERE ps."clubId" = $1 AND psb.status = 'CONFIRMED' GROUP BY psb."userId" HAVING MAX(ps.date) ${recOp} CURRENT_DATE - INTERVAL '${recVal} days')`
      }
      case 'userId':
        // Direct user ID filter (used for "cohort from session")
        if (f.op === 'in' && Array.isArray(f.value)) {
          const ids = f.value.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(',')
          return `u.id IN (${ids})`
        }
        return 'TRUE'
      case 'duprRating': {
        // Fallback: match against skill_level text when numeric DUPR is empty
        // skill_level values: "2.5-2.99 (Casual)", "3.0-3.49 (Intermediate)", "3.5-3.99 (Competitive)", "4.0+ (Advanced)"
        const numVal = Number(f.value)
        const op = f.op === 'gte' ? '>=' : f.op === 'lte' ? '<=' : f.op === 'gt' ? '>' : f.op === 'lt' ? '<' : '='
        const numericCheck = `COALESCE(u.dupr_rating_doubles, u.dupr_rating_singles, 0) ${op} ${numVal}`
        // Build skill level text matches for the same range
        const skillRanges = ['2.5-2.99', '3.0-3.49', '3.5-3.99', '4.0+']
        const rangeMins = [2.5, 3.0, 3.5, 4.0]
        const rangeMaxs = [2.99, 3.49, 3.99, 6.0]
        const matchingRanges: string[] = []
        for (let i = 0; i < skillRanges.length; i++) {
          const mid = (rangeMins[i] + rangeMaxs[i]) / 2
          if (f.op === 'gte' && mid >= numVal) matchingRanges.push(skillRanges[i])
          else if (f.op === 'lte' && mid <= numVal) matchingRanges.push(skillRanges[i])
          else if (f.op === 'gt' && mid > numVal) matchingRanges.push(skillRanges[i])
          else if (f.op === 'lt' && mid < numVal) matchingRanges.push(skillRanges[i])
          else if (f.op === 'eq' && numVal >= rangeMins[i] && numVal <= rangeMaxs[i]) matchingRanges.push(skillRanges[i])
        }
        if (matchingRanges.length > 0) {
          const skillOr = matchingRanges.map(r => `u.skill_level ILIKE '%${r}%'`).join(' OR ')
          return `(${numericCheck} OR (${skillOr}))`
        }
        return numericCheck
      }
      default:
        return 'TRUE'
    }
  }).join(' AND ')
}

// Active members = those with at least 1 confirmed booking
const ACTIVE_MEMBER_JOIN = `
  JOIN (
    SELECT DISTINCT psb."userId"
    FROM play_session_bookings psb
    JOIN play_sessions ps ON ps.id = psb."sessionId"
    WHERE ps."clubId" = $1 AND psb.status = 'CONFIRMED'
  ) active ON active."userId" = u.id
`

async function getClubCohortMembershipMappings(prisma: any, clubId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { automationSettings: true },
  })

  return resolveMembershipMappings(club?.automationSettings)
}

function hydrateCohortMembersWithNormalizedMembership(
  members: any[],
  filters: CohortFilter[],
  membershipMappings: ReturnType<typeof resolveMembershipMappings>,
) {
  const normalizedMembers = members.map((member) => {
    const normalizedMembership = normalizeMembership({
      membershipType: member.membershipType || null,
      membershipStatus: member.membershipStatus || null,
      membershipMappings,
    })

    return {
      ...member,
      normalizedMembershipType: normalizedMembership.normalizedType,
      normalizedMembershipStatus: normalizedMembership.normalizedStatus,
      membershipConfidence: normalizedMembership.confidence,
      membershipSignal: normalizedMembership.signal,
    }
  })

  if (filters.length === 0) return normalizedMembers

  return normalizedMembers.filter((member) =>
    filters.every((filter) => {
      if (filter.field === 'normalizedMembershipType') {
        return matchesCohortTextFilter(member.normalizedMembershipType, filter)
      }
      if (filter.field === 'normalizedMembershipStatus') {
        return matchesCohortTextFilter(member.normalizedMembershipStatus, filter)
      }
      return true
    }),
  )
}

async function countCohortMembers(prisma: any, clubId: string, filters: CohortFilter[]): Promise<number> {
  const { sqlFilters, normalizedMembershipFilters } = splitCohortFilters(filters)
  if (normalizedMembershipFilters.length > 0) {
    const members = await queryCohortMembers(prisma, clubId, filters, { limit: null })
    return members.length
  }

  const where = buildCohortWhereClause(sqlFilters)
  const result: [{ count: bigint }] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT cf.user_id) as count
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    ${ACTIVE_MEMBER_JOIN}
    WHERE cf.club_id = $1 AND ${where}
  `, clubId)
  return Number(result[0]?.count ?? 0)
}

async function queryCohortMembers(
  prisma: any,
  clubId: string,
  filters: CohortFilter[],
  options?: { limit?: number | null },
): Promise<any[]> {
  const { sqlFilters, normalizedMembershipFilters } = splitCohortFilters(filters)
  const where = buildCohortWhereClause(sqlFilters)
  const shouldLimitInSql = normalizedMembershipFilters.length === 0 && options?.limit && options.limit > 0
  const sqlLimitClause = shouldLimitInSql ? `LIMIT ${Math.trunc(options.limit as number)}` : ''

  const members = await prisma.$queryRawUnsafe(`
    SELECT u.id, u.name, u.email, u.gender, u.city, u.phone,
           u.sms_opt_in as "smsOptIn",
           u.date_of_birth as "dateOfBirth",
           CASE WHEN u.date_of_birth IS NOT NULL
             THEN EXTRACT(YEAR FROM age(CURRENT_DATE, u.date_of_birth))::int
             ELSE NULL END as age,
           u.membership_type as "membershipType",
           u.membership_status as "membershipStatus",
           u.skill_level as "skillLevel",
           u.zip_code as "zipCode",
           COALESCE(u.dupr_rating_doubles, 0) as "duprRating",
           u.image
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    ${ACTIVE_MEMBER_JOIN}
    WHERE cf.club_id = $1 AND ${where}
    ORDER BY u.name ASC
    ${sqlLimitClause}
  `, clubId)

  const membershipMappings = await getClubCohortMembershipMappings(prisma, clubId)
  const normalizedMembers = hydrateCohortMembersWithNormalizedMembership(
    members,
    normalizedMembershipFilters,
    membershipMappings,
  )

  if (options?.limit && options.limit > 0) {
    return normalizedMembers.slice(0, options.limit)
  }

  return normalizedMembers
}

function applyAdvisorRecipientRules(
  members: Array<{ id: string; email?: string | null; phone?: string | null; smsOptIn?: boolean | null }>,
  rules?: {
    requireEmail?: boolean
    requirePhone?: boolean
    smsOptInOnly?: boolean
  } | null,
) {
  if (!rules) return members

  return members.filter((member) => {
    if (rules.requireEmail && !member.email) return false
    if (rules.requirePhone && !member.phone) return false
    if (rules.smsOptInOnly && !member.smsOptIn) return false
    return true
  })
}

async function getLookalikeExportMembers(prisma: any, clubId: string) {
  type LookalikeExportMemberQueryRow = {
    userId: string
    name: string | null
    email: string | null
    phone: string | null
    city: string | null
    zipCode: string | null
    gender: string | null
    age: number | null
    duprRating: number | null
    joinedAt: Date | null
    daysSinceJoined: number | null
    lastPlayedAt: Date | null
    daysSinceLastVisit: number | null
    totalBookings: number
    bookingsLast30: number
    totalRevenue: number
    healthScore: number | null
    riskLevel: string | null
    lifecycleStage: string | null
    membershipType: string | null
    membershipStatus: string | null
  }

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { automationSettings: true },
  })
  const membershipMappings = resolveMembershipMappings(club?.automationSettings)

  const rows = await prisma.$queryRawUnsafe(`
    WITH latest_health AS (
      SELECT DISTINCT ON (mhs.user_id)
        mhs.user_id,
        mhs.health_score,
        mhs.risk_level,
        mhs.lifecycle_stage,
        mhs.date
      FROM member_health_snapshots mhs
      WHERE mhs.club_id = $1
      ORDER BY mhs.user_id, mhs.date DESC
    ),
    booking_stats AS (
      SELECT
        psb."userId" as user_id,
        COUNT(*) FILTER (WHERE psb.status = 'CONFIRMED')::int as total_bookings,
        COUNT(*) FILTER (
          WHERE psb.status = 'CONFIRMED'
            AND ps.date >= CURRENT_DATE - INTERVAL '30 days'
        )::int as bookings_last_30,
        MAX(ps.date) FILTER (WHERE psb.status = 'CONFIRMED') as last_played_at,
        COALESCE(
          SUM(
            CASE
              WHEN psb.status = 'CONFIRMED' THEN COALESCE(ps."pricePerSlot", 0)
              ELSE 0
            END
          ),
          0
        )::float as total_revenue
      FROM play_session_bookings psb
      JOIN play_sessions ps ON ps.id = psb."sessionId"
      WHERE ps."clubId" = $1
      GROUP BY psb."userId"
    )
    SELECT
      u.id as "userId",
      u.name,
      u.email,
      u.phone,
      u.city,
      u.zip_code as "zipCode",
      u.gender::text as gender,
      CASE
        WHEN u.date_of_birth IS NOT NULL THEN EXTRACT(YEAR FROM age(CURRENT_DATE, u.date_of_birth))::int
        ELSE NULL
      END as age,
      COALESCE(u.dupr_rating_doubles, u.dupr_rating_singles)::float as "duprRating",
      cf.created_at as "joinedAt",
      CASE
        WHEN cf.created_at IS NOT NULL THEN (CURRENT_DATE - cf.created_at::date)::int
        ELSE NULL
      END as "daysSinceJoined",
      bs.last_played_at as "lastPlayedAt",
      CASE
        WHEN bs.last_played_at IS NOT NULL THEN (CURRENT_DATE - bs.last_played_at::date)::int
        ELSE NULL
      END as "daysSinceLastVisit",
      COALESCE(bs.total_bookings, 0)::int as "totalBookings",
      COALESCE(bs.bookings_last_30, 0)::int as "bookingsLast30",
      COALESCE(bs.total_revenue, 0)::float as "totalRevenue",
      lh.health_score::int as "healthScore",
      lh.risk_level as "riskLevel",
      lh.lifecycle_stage as "lifecycleStage",
      u.membership_type as "membershipType",
      u.membership_status as "membershipStatus"
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    LEFT JOIN latest_health lh ON lh.user_id = u.id
    LEFT JOIN booking_stats bs ON bs.user_id = u.id
    WHERE cf.club_id = $1
    ORDER BY COALESCE(lh.health_score, 0) DESC, COALESCE(bs.total_revenue, 0) DESC, u.name ASC
  `, clubId) as LookalikeExportMemberQueryRow[]

  return rows.map((row) => {
    const normalizedMembership = normalizeMembership({
      membershipType: row.membershipType || null,
      membershipStatus: row.membershipStatus || null,
      membershipMappings,
    })

    return {
      ...row,
      totalRevenue: Number(row.totalRevenue || 0),
      duprRating: row.duprRating != null ? Number(row.duprRating) : null,
      normalizedMembershipType: normalizedMembership.normalizedType,
      normalizedMembershipStatus: normalizedMembership.normalizedStatus,
    }
  })
}

const COHORT_PARSE_SYSTEM = `You convert natural language cohort descriptions into JSON filter arrays.

Available fields and operators:
- age: gte, lte, gt, lt, eq (numeric, years old)
- gender: eq (values: "M" or "F")
- membershipType: contains, eq (text, e.g. "Open Play Pass", "Guest Pass")
- membershipStatus: contains, eq (text, e.g. "Active", "Expired", "Cancelled")
- normalizedMembershipType: eq (canonical values: "guest", "drop_in", "trial", "package", "monthly", "unlimited", "discounted", "insurance", "staff")
- normalizedMembershipStatus: eq (canonical values: "active", "suspended", "expired", "cancelled", "trial", "guest", "none")
- skillLevel: contains, eq, or "in" with array (text values in DB: "2.5-2.99 (Casual)", "3.0-3.49 (Intermediate)", "3.5-3.99 (Competitive)", "4.0+ (Advanced)")
- city: eq, contains (text)
- zipCode: eq (text)
- duprRating: gte, lte, gt, lt, eq (numeric — often empty, prefer skillLevel)

CRITICAL RULES:
- "55+" → age gte 55
- "under 30" → age lt 30
- For skill ranges spanning multiple levels, use ONE filter with op "in" and value as array:
  "level 2.5-3.5" → {"field":"skillLevel","op":"in","value":["2.5-2.99","3.0-3.49"]}
  "intermediate and above" → {"field":"skillLevel","op":"in","value":["3.0-3.49","3.5-3.99","4.0+"]}
- "beginners" or "casual" → skillLevel contains "Casual"
- "intermediate" → skillLevel contains "Intermediate"
- "competitive" → skillLevel contains "Competitive"
- "advanced" → skillLevel contains "Advanced"
- "men" or "male" → gender eq "M"
- "women" or "female" → gender eq "F"
- "active members" → normalizedMembershipStatus eq "active"
- "guests" or "guest players" → normalizedMembershipType eq "guest"
- "drop-ins" or "drop in players" → normalizedMembershipType eq "drop_in"
- "trial members" → normalizedMembershipStatus eq "trial"
- "package holders" → normalizedMembershipType eq "package"
- "monthly members" → normalizedMembershipType eq "monthly"
- "VIPs" or "unlimited members" → normalizedMembershipType eq "unlimited"
- "expired members" → normalizedMembershipStatus eq "expired"
- "cancelled members" → normalizedMembershipStatus eq "cancelled"
- NEVER use multiple skillLevel "contains" filters (they AND together and match nothing). Use ONE "in" filter with array instead.
- Generate a cohort name and short description too

Return ONLY valid JSON: {"name": "...", "description": "...", "filters": [...]}
Each filter: {"field": "...", "op": "...", "value": ...}
Value must be number for age, string or string[] for others.`

async function parseCohortPrompt(prompt: string): Promise<{ name: string; description: string; filters: CohortFilter[] } | null> {
  try {
    const { generateWithFallback } = await import('@/lib/ai/llm/provider')
    const result = await generateWithFallback({
      system: COHORT_PARSE_SYSTEM,
      prompt,
      tier: 'fast',
      maxTokens: 500,
    })
    const text = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(text)
  } catch {
    return null
  }
}

type ManualCampaignInput = {
  clubId: string
  type: 'CHECK_IN' | 'RETENTION_BOOST' | 'REACTIVATION' | 'SLOT_FILLER' | 'EVENT_INVITE' | 'NEW_MEMBER_WELCOME'
  channel: 'email' | 'sms' | 'both'
  memberIds: string[]
  recipients?: Array<{
    memberId: string
    channel: 'email' | 'sms' | 'both'
  }>
  subject?: string
  body: string
  smsBody?: string
  sessionId?: string
  source?: string
  actionKind?: AgentOutreachRolloutActionKind
  guestTrialContext?: GuestTrialExecutionContext | null
  referralContext?: ReferralExecutionContext | null
}

async function enforceCampaignUsageLimits(
  clubId: string,
  channel: ManualCampaignInput['channel'],
  recipientCount: number,
  deliveryBreakdown?: {
    email: number
    sms: number
    both: number
  } | null,
) {
  const { checkUsageLimit } = await import('@/lib/subscription')

  const campaignCheck = await checkUsageLimit(clubId, 'campaigns')
  if (!campaignCheck.allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: JSON.stringify({
        type: 'USAGE_LIMIT_REACHED',
        resource: 'campaigns',
        used: campaignCheck.used,
        limit: campaignCheck.limit,
        plan: campaignCheck.plan,
        message: `Campaign limit reached (${campaignCheck.used}/${campaignCheck.limit} this month). Upgrade your plan for more campaigns.`,
      }),
    })
  }

  const emailCount = deliveryBreakdown
    ? deliveryBreakdown.email + deliveryBreakdown.both
    : (channel === 'email' || channel === 'both') ? recipientCount : 0
  if (emailCount > 0) {
    const emailCheck = await checkUsageLimit(clubId, 'emails', emailCount)
    if (!emailCheck.allowed) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: JSON.stringify({
          type: 'USAGE_LIMIT_REACHED',
          resource: 'emails',
          used: emailCheck.used,
          limit: emailCheck.limit,
          remaining: emailCheck.remaining,
          plan: emailCheck.plan,
          message: `Email limit reached (${emailCheck.used}/${emailCheck.limit} this month). ${emailCheck.remaining} remaining, trying to send ${emailCount}.`,
        }),
      })
    }
  }

  const smsCount = deliveryBreakdown
    ? deliveryBreakdown.sms + deliveryBreakdown.both
    : (channel === 'sms' || channel === 'both') ? recipientCount : 0
  if (smsCount > 0) {
    const smsCheck = await checkUsageLimit(clubId, 'sms', smsCount)
    if (!smsCheck.allowed) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: JSON.stringify({
          type: 'USAGE_LIMIT_REACHED',
          resource: 'sms',
          used: smsCheck.used,
          limit: smsCheck.limit,
          remaining: smsCheck.remaining,
          plan: smsCheck.plan,
          message: `SMS limit reached (${smsCheck.used}/${smsCheck.limit} this month). Upgrade for more SMS.`,
        }),
      })
    }
  }
}

async function runCreateCampaign(prisma: any, input: ManualCampaignInput) {
  return sendCampaignNow(prisma, {
    ...input,
    source: input.source || 'manual_campaign',
    actionKind: input.actionKind || 'create_campaign',
  })
}

export const intelligenceRouter = createTRPCRouter({
  // ── Subscription: Get current club subscription ──
  getSubscription: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const subscription = await ctx.prisma.subscription.findUnique({
        where: { clubId: input.clubId },
      })
      return subscription
    }),

  // ── Club Data Status: Check if club has AI data ──
  getClubDataStatus: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // Query via raw SQL — Prisma can't model vector columns, PostgREST may cache stale schema
      let embeddings: { id: string; content_type: string; metadata: any; created_at: Date }[] = []
      try {
        embeddings = await ctx.prisma.$queryRaw`
          SELECT id::text, content_type, metadata, created_at
          FROM document_embeddings
          WHERE club_id = ${input.clubId}        `
      } catch (err) {
        log.error('[Intelligence] getClubDataStatus failed:', err)
        return {
          hasData: false,
          totalEmbeddings: 0,
          lastImportAt: null,
          sessionCount: 0,
          playerCount: 0,
          sourceFileName: null,
        }
      }
      const totalEmbeddings = embeddings.length

      // Extract import metadata from summary embedding
      let lastImportAt: string | null = null
      let sessionCount = 0
      let playerCount = 0
      let sourceFileName: string | null = null

      // Find the most recent embedding to determine last import time
      if (embeddings.length > 0) {
        const sorted = embeddings.sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        lastImportAt = sorted[0].created_at.toISOString()

        // Look for summary embedding with metadata
        const summaryEmbed = embeddings.find(
          (e: any) => e.content_type === 'club_info' && e.metadata?.sessionCount
        )
        if (summaryEmbed?.metadata) {
          sessionCount = (summaryEmbed.metadata as any).sessionCount || 0
          playerCount = (summaryEmbed.metadata as any).playerCount || 0
          sourceFileName = (summaryEmbed.metadata as any).sourceFileName || null
        }
      }

      return {
        hasData: totalEmbeddings > 0,
        totalEmbeddings,
        lastImportAt,
        sessionCount,
        playerCount,
        sourceFileName,
      }
    }),

  // ── Slot Filler: Recommend members for underfilled sessions ──
  getSlotFillerRecommendations: protectedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(5),
      enhance: z.boolean().default(false),
      clubId: z.string().uuid().optional(), // Required for CSV session IDs
    }))
    .query(async ({ ctx, input }) => {
      // Helper: find frequent players from booking history as fallback
      async function getFrequentPlayersFallback(
        prisma: any,
        clubId: string,
        sessionInfo: { format?: string; startTime?: string; courtId?: string | null; skillLevel?: string; date?: Date },
        alreadyBookedUserIds: Set<string>,
        limit: number,
      ) {
        try {
          // Full SQL scoring: format + skill + time + day-of-week + court + recency + membership
          const since = new Date()
          since.setDate(since.getDate() - 90)
          const sessionHour = sessionInfo.startTime ? parseInt(sessionInfo.startTime.split(':')[0] || '0') : -1
          const fmt = sessionInfo.format || ''
          const crtId = sessionInfo.courtId || ''
          const skill = sessionInfo.skillLevel || 'ALL_LEVELS'
          const sessionDow = sessionInfo.date ? sessionInfo.date.getDay() : -1 // 0=Sun, 6=Sat

          const rows: any[] = await prisma.$queryRawUnsafe(`
            SELECT
              b."userId" as user_id,
              u.name,
              u.email,
              u.image,
              COUNT(*)::int as booking_count,
              MAX(ps.date)::text as last_played,
              (CURRENT_DATE - MAX(ps.date)::date)::int as days_since_last,
              -- Format match: +3 per session in same format
              COUNT(*) FILTER (WHERE ps.format::text = $2)::int as format_match,
              -- Skill level match: +4 exact, +2 adjacent
              COUNT(*) FILTER (WHERE ps."skillLevel"::text = $7)::int as skill_exact,
              COUNT(*) FILTER (WHERE
                ($7 = 'BEGINNER' AND ps."skillLevel"::text IN ('BEGINNER', 'ALL_LEVELS'))
                OR ($7 = 'INTERMEDIATE' AND ps."skillLevel"::text IN ('INTERMEDIATE', 'ALL_LEVELS'))
                OR ($7 = 'ADVANCED' AND ps."skillLevel"::text IN ('ADVANCED', 'INTERMEDIATE'))
                OR ($7 = 'ALL_LEVELS')
              )::int as skill_compatible,
              -- Time match: +2 per session within ±1 hour
              CASE WHEN $3 >= 0 THEN
                COUNT(*) FILTER (WHERE ABS(EXTRACT(HOUR FROM ps."startTime"::time) - $3) <= 1)::int
              ELSE 0 END as time_match,
              -- Day-of-week match: +2 per session on same weekday
              CASE WHEN $8 >= 0 THEN
                COUNT(*) FILTER (WHERE EXTRACT(DOW FROM ps.date) = $8)::int
              ELSE 0 END as dow_match,
              -- Court match: +1 per session on same court
              COUNT(*) FILTER (WHERE ps."courtId"::text = $4)::int as court_match,
              -- Membership info from embeddings
              (SELECT de.metadata->>'membership' FROM document_embeddings de
               WHERE de.source_id = b."userId" AND de.content_type = 'member'
               AND de.source_table = 'csv_import' AND de.club_id = $1 LIMIT 1
              ) as membership_type,
              (SELECT de.metadata->>'membershipStatus' FROM document_embeddings de
               WHERE de.source_id = b."userId" AND de.content_type = 'member'
               AND de.source_table = 'csv_import' AND de.club_id = $1 LIMIT 1
              ) as membership_status
            FROM play_session_bookings b
            JOIN play_sessions ps ON ps.id = b."sessionId"
            JOIN users u ON u.id = b."userId"
            WHERE ps."clubId" = $1              AND ps.date >= $5
              AND b.status::text = 'CONFIRMED'
            GROUP BY b."userId", u.name, u.email, u.image
            HAVING (CURRENT_DATE - MAX(ps.date)::date) <= 60
            ORDER BY (
              COUNT(*)
              + COUNT(*) FILTER (WHERE ps.format::text = $2) * 3
              + COUNT(*) FILTER (WHERE ps."skillLevel"::text = $7) * 4
              + CASE WHEN $3 >= 0 THEN COUNT(*) FILTER (WHERE ABS(EXTRACT(HOUR FROM ps."startTime"::time) - $3) <= 1) * 2 ELSE 0 END
              + CASE WHEN $8 >= 0 THEN COUNT(*) FILTER (WHERE EXTRACT(DOW FROM ps.date) = $8) * 2 ELSE 0 END
              + COUNT(*) FILTER (WHERE ps."courtId"::text = $4)
              - (CURRENT_DATE - MAX(ps.date)::date)
            ) DESC
            LIMIT $6
          `, clubId, fmt, sessionHour, crtId, since, limit, skill, sessionDow)

          return rows.map((r: any) => {
            if (alreadyBookedUserIds.has(r.user_id)) return null
            if (r.membership_status === 'Suspended' || r.membership_status === 'Expired') return null

            const totalScore = r.booking_count + r.format_match * 3 + r.skill_exact * 4 + r.time_match * 2 + r.dow_match * 2 + r.court_match
            const maxPossible = Math.max(totalScore, 1)

            // Build reasoning
            const reasons: string[] = []
            if (r.format_match > 0) reasons.push(`plays this format (${r.format_match}x)`)
            if (r.skill_exact > 0) reasons.push(`matches skill level (${r.skill_exact}x)`)
            if (r.time_match > 0) reasons.push(`plays at this time (${r.time_match}x)`)
            if (r.dow_match > 0) reasons.push(`plays on this day (${r.dow_match}x)`)
            if (r.court_match > 0) reasons.push(`uses this court (${r.court_match}x)`)

            const memLabel = r.membership_type
              ? r.membership_type.split(' - ')[0].replace(/ \(Network\)$/, '')
              : null

            return {
              member: {
                id: r.user_id,
                name: r.name || 'Unknown',
                email: r.email || '',
                image: r.image,
                duprRating: null,
                duprRatingDoubles: null,
                lastPlayedDaysAgo: r.days_since_last,
                membershipType: memLabel,
              },
              score: Math.min(Math.round((totalScore / Math.max(r.booking_count, 1)) * 15), 99),
              estimatedLikelihood: (r.days_since_last <= 21 && r.format_match >= 3) ? 'high' as const
                : (r.days_since_last <= 45 && r.booking_count >= 5) ? 'medium' as const
                : 'low' as const,
              reasoning: {
                summary: reasons.length > 0
                  ? `${reasons.slice(0, 3).join(', ')} — ${r.booking_count} sessions in 90d, last played ${r.days_since_last}d ago`
                  : `${r.booking_count} sessions in 90d`,
                components: {
                  formatMatch: r.format_match,
                  skillMatch: r.skill_exact,
                  timeMatch: r.time_match,
                  dowMatch: r.dow_match,
                  courtMatch: r.court_match,
                  recencyDays: r.days_since_last,
                  membership: memLabel,
                },
              },
              factors: {
                preferredTimeMatch: r.time_match > 0,
                formatMatch: r.format_match > 0,
                skillMatch: r.skill_exact > 0 || r.skill_compatible > r.booking_count * 0.5,
                dayOfWeekMatch: r.dow_match > 0,
                frequentPlayer: r.booking_count >= 3,
                recentlyActive: r.days_since_last <= 14,
              },
              source: 'frequent_player' as const,
            }
          }).filter(Boolean)
        } catch (err) {
          log.warn('[SlotFiller] Frequent players fallback failed:', err)
          return []
        }
      }

      // CSV fallback path: session IDs like "csv-0", "csv-1"
      if (input.sessionId.startsWith('csv-')) {
        if (!input.clubId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'clubId required for CSV sessions' })
        }
        await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
        await checkFeatureAccess(input.clubId, 'slot-filler')
        const { getSlotFillerRecommendationsCsv } = await import('@/lib/ai/intelligence-service')
        const result = await getSlotFillerRecommendationsCsv(ctx.prisma, {
          sessionId: input.sessionId,
          clubId: input.clubId,
          limit: input.limit,
        })

        // Fallback: if no AI recommendations, show frequent players from booking data
        if (result.recommendations.length === 0) {
          const fallbackPlayers = await getFrequentPlayersFallback(
            ctx.prisma, input.clubId,
            { format: result.session.format, startTime: result.session.startTime },
            new Set(), input.limit,
          )
          if (fallbackPlayers.length > 0) {
            return { ...result, recommendations: fallbackPlayers, aiEnhancements: [], source: 'frequent_players' }
          }
        }

        return { ...result, aiEnhancements: [] }
      }

      // Standard PlaySession UUID path — delegate to hybrid (SQL pre-filter + rich re-rank).
      // Single source of truth: same logic as advisor drafts and cron automation.
      const session = await ctx.prisma.playSession.findUnique({
        where: { id: input.sessionId },
        select: { clubId: true },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
      }
      await requireClubAdmin(ctx.prisma, session.clubId, ctx.session.user.id)
      await checkFeatureAccess(session.clubId, 'slot-filler')

      const hybridResult = await getSlotFillerRecommendations(ctx.prisma, {
        sessionId: input.sessionId,
        limit: input.limit,
      })

      return {
        ...hybridResult,
        aiEnhancements: [],
        source: 'hybrid_scorer' as const,
      }
    }),

  // ── Weekly Plan: Personalized session plan for a player ──
  getWeeklyPlan: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      enhance: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const result = await getWeeklyPlan(ctx.prisma, {
        userId: ctx.session.user.id,
        clubId: input.clubId,
      })

      // Optional: enhance with LLM
      if (input.enhance && result.plan && result.plan.recommendedSessions.length > 0) {
        try {
          const { enhanceWeeklyPlanWithLLM } = await import('@/lib/ai/llm/enhancer')
          const enhancement = await enhanceWeeklyPlanWithLLM(result.plan)
          return { ...result, aiEnhancement: enhancement }
        } catch (err) {
          log.error('[Intelligence] Weekly plan LLM enhancement failed:', err)
        }
      }

      return { ...result, aiEnhancement: null }
    }),

  // ── Reactivation: Identify inactive members ──
  getReactivationCandidates: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      inactivityDays: z.number().int().min(7).default(21),
      limit: z.number().int().min(1).max(5000).default(500),
      enhance: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      await checkFeatureAccess(input.clubId, 'reactivation')
      const result = await getReactivationCandidates(ctx.prisma, input)

      // Optional: enhance with LLM
      if (input.enhance && result.candidates.length > 0) {
        try {
          const { enhanceReactivationWithLLM } = await import('@/lib/ai/llm/enhancer')
          const enhancements = await enhanceReactivationWithLLM(result.candidates)
          return { ...result, aiEnhancements: enhancements }
        } catch (err) {
          log.error('[Intelligence] Reactivation LLM enhancement failed:', err)
        }
      }

      return { ...result, aiEnhancements: [] }
    }),

  // ── Event Recommendations: AI-generated event suggestions ──
  getEventRecommendations: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(10).default(5),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      await checkFeatureAccess(input.clubId, 'slot-filler')
      return getEventRecommendations(ctx.prisma, input)
    }),

  // ── Send Invites: Invite recommended users to a session ──
  sendInvites: protectedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      clubId: z.string().uuid(),
      candidates: z.array(z.object({
        memberId: z.string(),
        channel: z.enum(['email', 'sms', 'both']),
        customMessage: z.string().max(1000).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'outreachSend',
        adminRole: adminAccess.role,
      })
      await checkFeatureAccess(input.clubId, 'slot-filler')
      await enforceManualLiveOutreachGate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        userId: ctx.session.user.id,
        automationSettings: clubAutomationContext?.automationSettings,
        adminRole: adminAccess.role,
        targetType: 'manual_slot_filler',
        targetId: input.sessionId,
        actionKind: 'fill_session',
        channel: input.candidates.some((candidate) => candidate.channel === 'both')
          ? 'both'
          : input.candidates.some((candidate) => candidate.channel === 'sms')
            ? input.candidates.some((candidate) => candidate.channel === 'email')
              ? 'both'
              : 'sms'
            : 'email',
        recipientCount: input.candidates.length,
        label: `Manual slot filler for ${input.candidates.length} candidates`,
      })
      return sendInvites(ctx.prisma, input)
    }),

  // ── Reactivation: Send re-engagement email/SMS to inactive members ──
  sendReactivationMessages: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      candidates: z.array(z.object({
        memberId: z.string().uuid(),
        channel: z.enum(['email', 'sms', 'both']),
      })),
      customMessage: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'outreachSend',
        adminRole: adminAccess.role,
      })
      await checkFeatureAccess(input.clubId, 'reactivation')

      // Usage limit checks
      const { checkUsageLimit } = await import('@/lib/subscription')
      const campaignCheck = await checkUsageLimit(input.clubId, 'campaigns')
      if (!campaignCheck.allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: JSON.stringify({ type: 'USAGE_LIMIT_REACHED', resource: 'campaigns', used: campaignCheck.used, limit: campaignCheck.limit, plan: campaignCheck.plan, message: `Campaign limit reached (${campaignCheck.used}/${campaignCheck.limit} this month). Upgrade for more.` }) })
      }
      const emailCount = input.candidates.filter(c => c.channel === 'email' || c.channel === 'both').length
      if (emailCount > 0) {
        const emailCheck = await checkUsageLimit(input.clubId, 'emails', emailCount)
        if (!emailCheck.allowed) {
          throw new TRPCError({ code: 'FORBIDDEN', message: JSON.stringify({ type: 'USAGE_LIMIT_REACHED', resource: 'emails', used: emailCheck.used, limit: emailCheck.limit, remaining: emailCheck.remaining, plan: emailCheck.plan, message: `Email limit reached (${emailCheck.used}/${emailCheck.limit}). ${emailCheck.remaining} remaining.` }) })
        }
      }
      const smsCount = input.candidates.filter(c => c.channel === 'sms' || c.channel === 'both').length
      if (smsCount > 0) {
        const smsCheck = await checkUsageLimit(input.clubId, 'sms', smsCount)
        if (!smsCheck.allowed) {
          throw new TRPCError({ code: 'FORBIDDEN', message: JSON.stringify({ type: 'USAGE_LIMIT_REACHED', resource: 'sms', used: smsCheck.used, limit: smsCheck.limit, remaining: smsCheck.remaining, plan: smsCheck.plan, message: `SMS limit reached (${smsCheck.used}/${smsCheck.limit}). Upgrade for more.` }) })
        }
      }

      await enforceManualLiveOutreachGate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        userId: ctx.session.user.id,
        automationSettings: clubAutomationContext?.automationSettings,
        adminRole: adminAccess.role,
        targetType: 'manual_reactivation',
        actionKind: 'reactivate_members',
        channel: input.candidates.some((candidate) => candidate.channel === 'both')
          ? 'both'
          : input.candidates.some((candidate) => candidate.channel === 'sms')
            ? input.candidates.some((candidate) => candidate.channel === 'email')
              ? 'both'
              : 'sms'
            : 'email',
        recipientCount: input.candidates.length,
        label: `Manual reactivation for ${input.candidates.length} members`,
      })

      return sendReactivationMessages(ctx.prisma, input)
    }),

  // ── Event Invites: Send personalized invites to matched players ──
  sendEventInvites: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      eventTitle: z.string(),
      eventDate: z.string(),
      eventTime: z.string(),
      eventPrice: z.number().optional(),
      candidates: z.array(z.object({
        memberId: z.string(),
        channel: z.enum(['email', 'sms', 'both']),
        customMessage: z.string().max(1000),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'outreachSend',
        adminRole: adminAccess.role,
      })
      await checkFeatureAccess(input.clubId, 'slot-filler')
      await enforceManualLiveOutreachGate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        userId: ctx.session.user.id,
        automationSettings: clubAutomationContext?.automationSettings,
        adminRole: adminAccess.role,
        targetType: 'manual_event_invites',
        actionKind: 'create_campaign',
        channel: input.candidates.some((candidate) => candidate.channel === 'both')
          ? 'both'
          : input.candidates.some((candidate) => candidate.channel === 'sms')
            ? input.candidates.some((candidate) => candidate.channel === 'email')
              ? 'both'
              : 'sms'
            : 'email',
        recipientCount: input.candidates.length,
        label: `Manual event invites for ${input.eventTitle}`,
      })
      return sendEventInviteMessages(ctx.prisma, input)
    }),

  // ── Preferences: Get/Set user play preferences ──
  getPreferences: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      return getPreferences(ctx.prisma, ctx.session.user.id, input.clubId)
    }),

  upsertPreferences: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      preferredDays: z.array(z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])),
      preferredTimeSlots: z.object({
        morning: z.boolean(),
        afternoon: z.boolean(),
        evening: z.boolean(),
      }),
      skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']),
      preferredFormats: z.array(z.enum(['OPEN_PLAY', 'CLINIC', 'DRILL', 'LEAGUE_PLAY', 'SOCIAL'])),
      targetSessionsPerWeek: z.number().int().min(1).max(7),
    }))
    .mutation(async ({ ctx, input }) => {
      return upsertPreferences(ctx.prisma, {
        userId: ctx.session.user.id,
        ...input,
      })
    }),

  // ── Dashboard: Club intelligence overview ──
  getDashboard: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const [
        totalMembers,
        totalCourts,
        upcomingSessions,
        recentBookings,
        underfilled,
      ] = await Promise.all([
        ctx.prisma.clubFollower.count({ where: { clubId: input.clubId } }),
        ctx.prisma.clubCourt.count({ where: { clubId: input.clubId, isActive: true } }),
        ctx.prisma.playSession.findMany({
          where: {
            clubId: input.clubId,
            status: 'SCHEDULED',
            date: { gte: now },
          },
          include: {
            clubCourt: true,
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
          orderBy: { date: 'asc' },
          take: 20,
        }),
        ctx.prisma.playSessionBooking.count({
          where: {
            status: 'CONFIRMED',
            playSession: { clubId: input.clubId },
            bookedAt: { gte: thirtyDaysAgo },
          },
        }),
        // Underfilled sessions (less than 50% capacity)
        ctx.prisma.playSession.findMany({
          where: {
            clubId: input.clubId,
            status: 'SCHEDULED',
            date: { gte: now },
          },
          include: {
            clubCourt: true,
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
          orderBy: { date: 'asc' },
        }),
      ])

      // Recent AI recommendations (gracefully handle if table not ready)
      let aiLogs = 0
      try {
        aiLogs = await ctx.prisma.aIRecommendationLog.count({
          where: {
            clubId: input.clubId,
            createdAt: { gte: sevenDaysAgo },
          },
        })
      } catch (err) {
        log.warn('[Intelligence] aIRecommendationLog query failed:', err)
      }

      // Calculate occupancy stats
      const underfilledSessions = underfilled.filter(
        (s: any) => s._count.bookings < s.maxPlayers * 0.5
      )

      const totalCapacity = upcomingSessions.reduce((sum: number, s: any) => sum + s.maxPlayers, 0)
      const totalBooked = upcomingSessions.reduce((sum: number, s: any) => sum + s._count.bookings, 0)
      const avgOccupancy = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0

      // Estimate lost revenue from empty slots
      const avgPricePerSlot = 15 // $15 per player slot default
      const emptySlots = upcomingSessions.reduce(
        (sum: number, s: any) => sum + (s.maxPlayers - s._count.bookings),
        0
      )
      const estimatedLostRevenue = emptySlots * avgPricePerSlot

      return {
        metrics: {
          totalMembers,
          totalCourts,
          avgOccupancy,
          recentBookings,
          underfilledCount: underfilledSessions.length,
          aiRecommendationsThisWeek: aiLogs,
          estimatedLostRevenue,
          emptySlots,
        },
        upcomingSessions: upcomingSessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          format: s.format,
          skillLevel: s.skillLevel,
          maxPlayers: s.maxPlayers,
          confirmedCount: s._count.bookings,
          spotsRemaining: s.maxPlayers - s._count.bookings,
          occupancyPercent: Math.round((s._count.bookings / s.maxPlayers) * 100),
          courtName: s.clubCourt?.name || null,
        })),
        underfilledSessions: underfilledSessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          format: s.format,
          maxPlayers: s.maxPlayers,
          confirmedCount: s._count.bookings,
          spotsRemaining: s.maxPlayers - s._count.bookings,
          courtName: s.clubCourt?.name || null,
        })),
      }
    }),

  // ── Dashboard V2: Full analytics overview ──
  getDashboardV2: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const now = new Date()
      const currentEnd = input.dateTo ? new Date(input.dateTo + 'T23:59:59') : now
      const currentStart = input.dateFrom ? new Date(input.dateFrom + 'T00:00:00')
        : new Date(currentEnd.getTime() - 30 * 86400000)
      const periodMs = currentEnd.getTime() - currentStart.getTime()
      const previousStart = new Date(currentStart.getTime() - periodMs)

      // Aliases for backward compatibility with existing DB queries
      let d30 = currentStart
      let d60 = previousStart
      let d7 = new Date(currentEnd.getTime() - 7 * 86400000)
      let d14 = new Date(currentEnd.getTime() - 14 * 86400000)
      const monthStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth(), 1)

      // ── Helper: compute trend ──
      function computeTrend(current: number, previous: number, sparkline: number[] = []): {
        value: number; previousValue: number; changePercent: number;
        direction: 'up' | 'down' | 'neutral'; sparkline: number[];
      } {
        const change = previous > 0
          ? Math.round(((current - previous) / previous) * 1000) / 10
          : current > 0 ? 100 : 0
        return {
          value: current,
          previousValue: previous,
          changePercent: change,
          direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
          sparkline,
        }
      }

      const emptyTrend = computeTrend(0, 0)

      // ── Member + CSV player queries ──
      const [followersCount, membersAt30dAgo, newMembersThisMonth, allMembersWithUser, csvPlayerCountRows] =
        await Promise.all([
          ctx.prisma.clubFollower.count({ where: { clubId: input.clubId } }),
          ctx.prisma.clubFollower.count({
            where: { clubId: input.clubId, createdAt: { lte: d30 } },
          }),
          ctx.prisma.clubFollower.count({
            where: { clubId: input.clubId, createdAt: { gte: monthStart } },
          }),
          ctx.prisma.clubFollower.findMany({
            where: { clubId: input.clubId },
            include: { user: { select: { id: true, duprRatingDoubles: true } } },
          }),
          // Count unique player names from CSV embeddings
          ctx.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(DISTINCT value) as count
            FROM document_embeddings,
              LATERAL jsonb_array_elements_text(metadata->'playerNames') as value
            WHERE club_id = ${input.clubId}              AND content_type = 'session'
              AND source_table = 'csv_import'
          `.catch(() => [{ count: BigInt(0) }]),
        ])

      // Use the larger of: followers vs unique CSV players
      const csvPlayerCount = Number(csvPlayerCountRows[0]?.count ?? 0)
      const membersNow = Math.max(followersCount, csvPlayerCount)

      // Member sparkline (always safe)
      const membersBase = Math.max(membersAt30dAgo, csvPlayerCount)
      const memberGrowth = membersNow - membersBase
      const memberSparkline: number[] = []
      for (let i = 0; i < 7; i++) {
        memberSparkline.push(Math.round(membersBase + (memberGrowth * (i + 1)) / 7))
      }

      // Skill level distribution (always safe)
      const skillBuckets: Record<string, number> = { Beginner: 0, Intermediate: 0, Advanced: 0, Unrated: 0 }
      for (const f of allMembersWithUser) {
        const rating = f.user?.duprRatingDoubles ? Number(f.user.duprRatingDoubles) : null
        if (!rating) skillBuckets['Unrated']++
        else if (rating < 3.0) skillBuckets['Beginner']++
        else if (rating < 4.5) skillBuckets['Intermediate']++
        else skillBuckets['Advanced']++
      }
      const totalMembers = allMembersWithUser.length || 1
      const bySkillLevel = Object.entries(skillBuckets)
        .filter(([, count]) => count > 0)
        .map(([label, count]) => ({
          label,
          count,
          percent: Math.round((count / totalMembers) * 100),
        }))

      // ── Auto-detect date range if CSV data is older than 30 days ──
      if (!input.dateFrom && !input.dateTo) {
        const latestSession = await ctx.prisma.playSession.findFirst({
          where: { clubId: input.clubId, status: 'COMPLETED' },
          orderBy: { date: 'desc' },
          select: { date: true },
        }).catch(() => null)

        if (latestSession && new Date(latestSession.date) < d30) {
          // Shift the window to cover actual data
          const latestDate = new Date(latestSession.date)
          latestDate.setHours(23, 59, 59, 999)
          d30 = new Date(latestDate.getTime() - 30 * 86400000)
          d60 = new Date(latestDate.getTime() - 60 * 86400000)
          d7 = new Date(latestDate.getTime() - 7 * 86400000)
          d14 = new Date(latestDate.getTime() - 14 * 86400000)
        }
      }

      // ── Session + Booking queries (may fail if booking table missing) ──
      try {
        const [
          completedSessions30d,
          completedSessionsPrev30d,
          bookings30d,
          bookingsPrev30d,
          upcomingSessions,
          recentBookers,
        ] = await Promise.all([
          ctx.prisma.playSession.findMany({
            where: { clubId: input.clubId, status: 'COMPLETED', date: { gte: d30, lte: currentEnd } },
            include: {
              clubCourt: true,
              _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
            },
          }),
          ctx.prisma.playSession.findMany({
            where: { clubId: input.clubId, status: 'COMPLETED', date: { gte: d60, lt: d30 } },
            include: {
              _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
            },
          }),
          ctx.prisma.playSessionBooking.count({
            where: { status: 'CONFIRMED', playSession: { clubId: input.clubId }, bookedAt: { gte: d30, lte: currentEnd } },
          }),
          ctx.prisma.playSessionBooking.count({
            where: { status: 'CONFIRMED', playSession: { clubId: input.clubId }, bookedAt: { gte: d60, lt: d30 } },
          }),
          ctx.prisma.playSession.findMany({
            where: { clubId: input.clubId, status: 'SCHEDULED', date: { gte: now } },
            include: {
              clubCourt: true,
              _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
            },
            orderBy: { date: 'asc' },
            take: 20,
          }),
          ctx.prisma.playSessionBooking.findMany({
            where: {
              status: 'CONFIRMED',
              playSession: { clubId: input.clubId, date: { gte: d30, lte: currentEnd } },
            },
            select: { userId: true },
            distinct: ['userId'],
          }),
        ])

        // If tables exist but have no session data, fall through to CSV fallback
        if (completedSessions30d.length === 0 && completedSessionsPrev30d.length === 0
          && upcomingSessions.length === 0 && bookings30d === 0) {
          throw new Error('NO_SESSION_DATA_FOUND')
        }

        // If sessions have registeredCount (CSV import), use that for bookings metric
        const hasRegisteredCount = completedSessions30d.some((s: any) => (s.registeredCount ?? 0) != null)
        const effectiveBookings30d = hasRegisteredCount
          ? completedSessions30d.reduce((sum: number, s: any) => sum + ((s.registeredCount ?? 0) ?? 0), 0)
          : bookings30d
        const effectiveBookingsPrev30d = hasRegisteredCount
          ? completedSessionsPrev30d.reduce((sum: number, s: any) => sum + ((s.registeredCount ?? 0) ?? 0), 0)
          : bookingsPrev30d

        // ── Helper: prefer registeredCount from CSV over booking count ──
        const getRegistered = (s: { registeredCount?: number | null; _count: { bookings: number } }) =>
          (s.registeredCount ?? 0) ?? s._count.bookings

        // ── Compute occupancy metrics ──
        const calcAvgOcc = (sessions: Array<{ maxPlayers: number; registeredCount?: number | null; _count: { bookings: number } }>) => {
          if (sessions.length === 0) return 0
          const total = sessions.reduce((sum, s) => {
            const reg = getRegistered(s)
            return sum + (s.maxPlayers > 0 ? (reg / s.maxPlayers) * 100 : 0)
          }, 0)
          return Math.round(total / sessions.length)
        }
        const avgOcc30d = calcAvgOcc(completedSessions30d)
        const avgOccPrev30d = calcAvgOcc(completedSessionsPrev30d)

        // Sparklines
        const bookingSparkline: number[] = []
        const occSparkline: number[] = []
        for (let i = 6; i >= 0; i--) {
          const dayStart = new Date(now.getTime() - i * 86400000)
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setHours(23, 59, 59, 999)
          const daySessions = completedSessions30d.filter(
            s => new Date(s.date) >= dayStart && new Date(s.date) <= dayEnd
          )
          bookingSparkline.push(daySessions.reduce((sum, s) => sum + getRegistered(s), 0))
          if (daySessions.length > 0) {
            const avg = daySessions.reduce((sum, s) =>
              sum + (s.maxPlayers > 0 ? (getRegistered(s) / s.maxPlayers) * 100 : 0), 0
            ) / daySessions.length
            occSparkline.push(Math.round(avg))
          } else {
            occSparkline.push(0)
          }
        }

        // Lost revenue
        const avgPricePerSlot = 15
        const emptySlots = upcomingSessions.reduce(
          (sum, s) => sum + Math.max(0, s.maxPlayers - getRegistered(s)), 0
        )
        const lostRevenue = emptySlots * avgPricePerSlot
        const prevEmptySlots = completedSessionsPrev30d.reduce(
          (sum, s) => sum + Math.max(0, s.maxPlayers - getRegistered(s)), 0
        )
        const prevLostRevenue = prevEmptySlots * avgPricePerSlot

        // Occupancy breakdowns
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const byDayMap: Record<string, { total: number; count: number }> = {}
        const bySlotMap: Record<string, { total: number; count: number }> = {}
        const byFormatMap: Record<string, { total: number; count: number }> = {}
        for (const s of completedSessions30d) {
          const occ = s.maxPlayers > 0 ? Math.round((getRegistered(s) / s.maxPlayers) * 100) : 0
          const dayName = dayNames[new Date(s.date).getDay()]
          if (!byDayMap[dayName]) byDayMap[dayName] = { total: 0, count: 0 }
          byDayMap[dayName].total += occ
          byDayMap[dayName].count++
          const hour = parseInt(s.startTime.split(':')[0], 10)
          const slot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
          if (!bySlotMap[slot]) bySlotMap[slot] = { total: 0, count: 0 }
          bySlotMap[slot].total += occ
          bySlotMap[slot].count++
          if (!byFormatMap[s.format]) byFormatMap[s.format] = { total: 0, count: 0 }
          byFormatMap[s.format].total += occ
          byFormatMap[s.format].count++
        }
        const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        const byDay = orderedDays.map(day => ({
          day,
          avgOccupancy: byDayMap[day] ? Math.round(byDayMap[day].total / byDayMap[day].count) : 0,
          sessionCount: byDayMap[day]?.count || 0,
        }))
        const slotOrder: Array<'morning' | 'afternoon' | 'evening'> = ['morning', 'afternoon', 'evening']
        const byTimeSlot = slotOrder.map(slot => ({
          slot,
          avgOccupancy: bySlotMap[slot] ? Math.round(bySlotMap[slot].total / bySlotMap[slot].count) : 0,
          sessionCount: bySlotMap[slot]?.count || 0,
        }))
        const byFormat = Object.entries(byFormatMap).map(([format, data]) => ({
          format: format as any,
          avgOccupancy: Math.round(data.total / data.count),
          sessionCount: data.count,
        })).sort((a, b) => b.sessionCount - a.sessionCount)

        // Session rankings
        const allSessionsWithOcc = completedSessions30d.map(s => ({
          id: s.id,
          title: s.title,
          date: s.date.toISOString(),
          startTime: s.startTime,
          endTime: s.endTime,
          format: s.format as any,
          courtName: s.clubCourt?.name || null,
          occupancyPercent: s.maxPlayers > 0 ? Math.round((getRegistered(s) / s.maxPlayers) * 100) : 0,
          confirmedCount: getRegistered(s),
          maxPlayers: s.maxPlayers,
        }))
        const sortedByOcc = [...allSessionsWithOcc].sort((a, b) => b.occupancyPercent - a.occupancyPercent)
        const topSessions = sortedByOcc.slice(0, 10)
        const problematicSessions = [...allSessionsWithOcc]
          .filter(s => s.occupancyPercent < 80)
          .sort((a, b) => a.occupancyPercent - b.occupancyPercent)
          .slice(0, 20)

        // Player activity — count unique users with confirmed bookings in period
        const activeUserIds = new Set(recentBookers.map(b => b.userId))
        const activeCount = activeUserIds.size
        const inactiveCount = Math.max(0, membersNow - activeCount)

        // Format preference — use registeredCount for accurate distribution
        const formatCounts: Record<string, number> = {}
        for (const s of completedSessions30d) {
          formatCounts[s.format] = (formatCounts[s.format] || 0) + getRegistered(s)
        }
        const fmtLabels: Record<string, string> = {
          OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
          LEAGUE_PLAY: 'League', SOCIAL: 'Social',
        }
        const totalFmtBookings = Object.values(formatCounts).reduce((a, b) => a + b, 0) || 1
        const byFormatDist = Object.entries(formatCounts)
          .map(([fmt, count]) => ({
            label: fmtLabels[fmt] || fmt,
            count,
            percent: Math.round((count / totalFmtBookings) * 100),
          }))
          .sort((a, b) => b.count - a.count)

        return {
          metrics: {
            members: {
              label: 'Active Players',
              value: activeCount,
              trend: computeTrend(activeCount, membersBase > activeCount ? activeCount : membersBase, memberSparkline),
              subtitle: `${membersNow} total members`,
              description: `Players with confirmed bookings in the selected period`,
            },
            occupancy: {
              label: 'Avg Occupancy',
              value: `${avgOcc30d}%`,
              trend: computeTrend(avgOcc30d, avgOccPrev30d, occSparkline),
              subtitle: `${completedSessions30d.length} sessions (30d)`,
              description: 'Average % of filled spots across all sessions',
            },
            lostRevenue: {
              label: 'Est. Lost Revenue',
              value: `$${lostRevenue.toLocaleString()}`,
              trend: computeTrend(lostRevenue, prevLostRevenue),
              subtitle: `${emptySlots} empty slots`,
              description: 'Revenue lost from unfilled spots based on pricing',
            },
            bookings: {
              label: 'Bookings',
              value: effectiveBookings30d,
              trend: computeTrend(effectiveBookings30d, effectiveBookingsPrev30d, bookingSparkline),
              subtitle: 'last 30 days',
              description: 'Total confirmed bookings across all sessions',
            },
          },
          occupancy: { byDay, byTimeSlot, byFormat },
          sessions: { topSessions, problematicSessions },
          players: {
            bySkillLevel,
            byFormat: byFormatDist,
            activeCount,
            inactiveCount,
            newThisMonth: newMembersThisMonth,
            membershipBreakdown: await (async () => {
              try {
                const rows = await ctx.prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
                  SELECT metadata->>'membershipStatus' as status, count(*) as cnt
                  FROM document_embeddings
                  WHERE club_id = ${input.clubId} AND content_type = 'member' AND source_table = 'csv_import'
                  GROUP BY metadata->>'membershipStatus'
                `
                if (rows.length === 0) return null
                const map: Record<string, number> = {}
                rows.forEach(r => { map[r.status] = Number(r.cnt) })
                return { active: map['Currently Active'] || 0, suspended: map['Suspended'] || 0, noMembership: map['No Membership'] || 0, expired: map['Expired'] || 0 }
              } catch { return null }
            })(),
          },
        }
      } catch (err) {
        // ── Fallback: read from document_embeddings (CSV-imported data) ──
        log.warn('[getDashboardV2] Fallback mode:', (err as Error).message?.slice(0, 120))

        interface CsvSessionMeta {
          date: string; startTime: string; endTime: string; court: string
          format: string; skillLevel: string; registered: number
          capacity: number; occupancy: number; playerNames: string[]
          pricePerPlayer?: number | null
          revenue?: number | null
          lostRevenue?: number | null
        }

        let allCsvSessions: CsvSessionMeta[] = []
        try {
          const rows = await ctx.prisma.$queryRaw<Array<{ metadata: any }>>`
            SELECT metadata FROM document_embeddings
            WHERE club_id = ${input.clubId}              AND content_type = 'session'
              AND source_table = 'csv_import'
          `
          allCsvSessions = rows
            .map(r => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as CsvSessionMeta)
            .filter(m => m && m.date && m.capacity > 0)
        } catch (embErr) {
          log.warn('[getDashboardV2] document_embeddings query failed:', (embErr as Error).message?.slice(0, 80))
        }

        if (allCsvSessions.length === 0) {
          // No CSV data — return member-only dashboard
          return {
            metrics: {
              members: {
                label: 'Members', value: membersNow,
                trend: computeTrend(membersNow, membersAt30dAgo, memberSparkline),
                subtitle: `${newMembersThisMonth} new this month`,
                description: 'Total active members following your club',
              },
              occupancy: { label: 'Avg Occupancy', value: 'N/A', trend: emptyTrend, subtitle: 'No session data', description: 'Average % of filled spots across all sessions' },
              lostRevenue: { label: 'Est. Lost Revenue', value: 'N/A', trend: emptyTrend, subtitle: 'No session data', description: 'Revenue lost from unfilled spots based on pricing' },
              bookings: { label: 'Bookings', value: 'N/A', trend: emptyTrend, subtitle: 'Import CSV to see data', description: 'Total confirmed bookings across all sessions' },
            },
            occupancy: {
              byDay: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => ({ day: d, avgOccupancy: 0, sessionCount: 0 })),
              byTimeSlot: (['morning', 'afternoon', 'evening'] as const).map(s => ({ slot: s, avgOccupancy: 0, sessionCount: 0 })),
              byFormat: [],
            },
            sessions: { topSessions: [], problematicSessions: [] },
            players: {
              bySkillLevel, byFormat: [],
              activeCount: 0, inactiveCount: membersNow,
              newThisMonth: newMembersThisMonth,
            },
          }
        }

        // ── Compute dashboard from CSV data ──
        // Use input date range if provided, otherwise default to latest CSV date
        const allDates = allCsvSessions.map(s => s.date).sort()
        const latestDateStr = allDates[allDates.length - 1]
        const latestDate = new Date(latestDateStr + 'T23:59:59')

        const effectiveEndStr = input.dateTo || latestDateStr
        const effectiveEnd = new Date(effectiveEndStr + 'T23:59:59')
        const defaultPeriodMs = 30 * 86400000
        const effectiveStartStr = input.dateFrom
          || new Date(effectiveEnd.getTime() - defaultPeriodMs).toISOString().slice(0, 10)
        const csvPeriodMs = effectiveEnd.getTime() - new Date(effectiveStartStr + 'T00:00:00').getTime()
        const csvPrevStartStr = new Date(new Date(effectiveStartStr + 'T00:00:00').getTime() - csvPeriodMs).toISOString().slice(0, 10)

        const csvD30Str = effectiveStartStr
        const csvD60Str = csvPrevStartStr
        const csvD14Str = new Date(effectiveEnd.getTime() - 14 * 86400000).toISOString().slice(0, 10)

        let currentSessions = allCsvSessions.filter(s => s.date >= csvD30Str && s.date <= effectiveEndStr)
        let previousSessions = allCsvSessions.filter(s => s.date >= csvD60Str && s.date < csvD30Str)

        // If no sessions in the recent 30d window, split all data into halves for trend comparison
        if (currentSessions.length === 0) {
          const sorted = [...allCsvSessions].sort((a, b) => a.date.localeCompare(b.date))
          const mid = Math.floor(sorted.length / 2)
          previousSessions = sorted.slice(0, mid)
          currentSessions = sorted.slice(mid)
        }

        // ── Metrics ──
        const avgOcc = currentSessions.length > 0
          ? Math.round(currentSessions.reduce((sum, s) => sum + s.occupancy, 0) / currentSessions.length)
          : 0
        const prevAvgOcc = previousSessions.length > 0
          ? Math.round(previousSessions.reduce((sum, s) => sum + s.occupancy, 0) / previousSessions.length)
          : 0
        const totalBookings = currentSessions.reduce((sum, s) => sum + s.registered, 0)
        const prevBookings = previousSessions.reduce((sum, s) => sum + s.registered, 0)
        const emptySlots = currentSessions.reduce((sum, s) => sum + Math.max(0, s.capacity - s.registered), 0)
        const prevEmpty = previousSessions.reduce((sum, s) => sum + Math.max(0, s.capacity - s.registered), 0)

        // Use actual prices from CSV when available, fall back to $15 estimate
        const hasRealPrices = currentSessions.some(s => s.pricePerPlayer != null && s.pricePerPlayer > 0)
        const lostRev = hasRealPrices
          ? currentSessions.reduce((sum, s) => sum + Math.max(0, s.capacity - s.registered) * (s.pricePerPlayer || 0), 0)
          : emptySlots * 15
        const prevLostRev = hasRealPrices
          ? previousSessions.reduce((sum, s) => sum + Math.max(0, s.capacity - s.registered) * (s.pricePerPlayer || 0), 0)
          : prevEmpty * 15
        const totalRevenue = hasRealPrices
          ? currentSessions.reduce((sum, s) => sum + s.registered * (s.pricePerPlayer || 0), 0)
          : 0

        // Sparklines (7 data points from the current period)
        const occSpark: number[] = []
        const bookSpark: number[] = []
        for (let i = 6; i >= 0; i--) {
          const dayStr = new Date(effectiveEnd.getTime() - i * 86400000).toISOString().slice(0, 10)
          const ds = currentSessions.filter(s => s.date === dayStr)
          occSpark.push(ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.occupancy, 0) / ds.length) : 0)
          bookSpark.push(ds.reduce((a, s) => a + s.registered, 0))
        }

        // ── Occupancy breakdowns ──
        const dayNamesArr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const byDayMap: Record<string, { total: number; count: number }> = {}
        const bySlotMap: Record<string, { total: number; count: number }> = {}
        const byFmtMap: Record<string, { total: number; count: number }> = {}
        const fmtLabelsMap: Record<string, string> = {
          OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
          LEAGUE_PLAY: 'League', SOCIAL: 'Social',
        }

        for (const s of currentSessions) {
          const occ = s.occupancy
          const dayName = dayNamesArr[new Date(s.date + 'T12:00:00').getDay()]
          if (!byDayMap[dayName]) byDayMap[dayName] = { total: 0, count: 0 }
          byDayMap[dayName].total += occ
          byDayMap[dayName].count++

          const hour = parseInt(s.startTime.split(':')[0], 10)
          const slot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
          if (!bySlotMap[slot]) bySlotMap[slot] = { total: 0, count: 0 }
          bySlotMap[slot].total += occ
          bySlotMap[slot].count++

          if (!byFmtMap[s.format]) byFmtMap[s.format] = { total: 0, count: 0 }
          byFmtMap[s.format].total += occ
          byFmtMap[s.format].count++
        }

        const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        const byDay = orderedDays.map(day => ({
          day,
          avgOccupancy: byDayMap[day] ? Math.round(byDayMap[day].total / byDayMap[day].count) : 0,
          sessionCount: byDayMap[day]?.count || 0,
        }))
        const byTimeSlot = (['morning', 'afternoon', 'evening'] as const).map(slot => ({
          slot,
          avgOccupancy: bySlotMap[slot] ? Math.round(bySlotMap[slot].total / bySlotMap[slot].count) : 0,
          sessionCount: bySlotMap[slot]?.count || 0,
        }))
        const byFormat = Object.entries(byFmtMap).map(([format, data]) => ({
          format: format as any,
          avgOccupancy: Math.round(data.total / data.count),
          sessionCount: data.count,
        })).sort((a, b) => b.sessionCount - a.sessionCount)

        // ── Session rankings ──
        const allMapped = currentSessions.map((s, i) => ({
          id: `csv-${i}`,
          title: `${fmtLabelsMap[s.format] || s.format} @ ${s.court}`,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          format: s.format as any,
          courtName: s.court,
          occupancyPercent: s.occupancy,
          confirmedCount: s.registered,
          maxPlayers: s.capacity,
        }))
        const topSessions = [...allMapped].sort((a, b) => b.occupancyPercent - a.occupancyPercent).slice(0, 10)
        const problematicSessions = [...allMapped].filter(s => s.occupancyPercent < 80).sort((a, b) => a.occupancyPercent - b.occupancyPercent).slice(0, 20)

        // ── Player activity from CSV player names ──
        // "Active" = played in the current period
        const prevPlayers = new Set<string>()
        const recentPlayers = new Set<string>()
        for (const s of previousSessions) {
          for (const name of (s.playerNames || [])) {
            prevPlayers.add(name)
          }
        }
        for (const s of currentSessions) {
          for (const name of (s.playerNames || [])) {
            recentPlayers.add(name)
          }
        }
        const csvActive = recentPlayers.size
        // Inactive = played in previous period but NOT in current period
        let csvInactive = 0
        prevPlayers.forEach(name => { if (!recentPlayers.has(name)) csvInactive++ })

        // Format preference from registrations
        const fmtBookings: Record<string, number> = {}
        for (const s of currentSessions) {
          const label = fmtLabelsMap[s.format] || s.format
          fmtBookings[label] = (fmtBookings[label] || 0) + s.registered
        }
        const totalFmtB = Object.values(fmtBookings).reduce((a, b) => a + b, 0) || 1
        const byFormatDist = Object.entries(fmtBookings)
          .map(([label, count]) => ({ label, count, percent: Math.round((count / totalFmtB) * 100) }))
          .sort((a, b) => b.count - a.count)

        // Player counts from CSV (more meaningful than clubFollower count)
        // csvPlayerCount = unique players in the current period (period-sensitive)
        const csvPlayerCount = recentPlayers.size
        const prevAllPlayers = new Set<string>()
        for (const s of previousSessions) {
          for (const name of (s.playerNames || [])) prevAllPlayers.add(name)
        }
        const prevPlayerCount = prevAllPlayers.size

        // Sparkline for players (unique players per day over last 7 data points)
        const playerSpark: number[] = []
        for (let i = 6; i >= 0; i--) {
          const dayStr = new Date(effectiveEnd.getTime() - i * 86400000).toISOString().slice(0, 10)
          const dayPlayers = new Set<string>()
          for (const s of currentSessions) {
            if (s.date === dayStr) {
              for (const n of (s.playerNames || [])) dayPlayers.add(n)
            }
          }
          playerSpark.push(dayPlayers.size)
        }

        // New players: in current period but not in previous period
        let newPlayers = 0
        recentPlayers.forEach(p => { if (!prevAllPlayers.has(p)) newPlayers++ })

        return {
          metrics: {
            members: {
              label: 'Players', value: csvPlayerCount,
              trend: computeTrend(csvPlayerCount, prevPlayerCount, playerSpark),
              subtitle: `${csvActive} active · ${csvInactive} inactive`,
              description: 'Total unique players from imported session data',
            },
            occupancy: {
              label: 'Avg Occupancy', value: `${avgOcc}%`,
              trend: computeTrend(avgOcc, prevAvgOcc, occSpark),
              subtitle: `${currentSessions.length} sessions`,
              description: 'Average % of filled spots across all sessions',
            },
            lostRevenue: {
              label: hasRealPrices ? 'Lost Revenue' : 'Est. Lost Revenue',
              value: `$${lostRev.toLocaleString()}`,
              trend: computeTrend(lostRev, prevLostRev),
              subtitle: hasRealPrices
                ? `$${totalRevenue.toLocaleString()} earned · ${emptySlots} empty slots`
                : `${emptySlots} empty slots (est. $15/slot)`,
              description: 'Revenue lost from unfilled spots based on pricing',
            },
            bookings: {
              label: 'Registrations', value: totalBookings,
              trend: computeTrend(totalBookings, prevBookings, bookSpark),
              subtitle: `${currentSessions.length} sessions`,
              description: 'Total confirmed registrations across all sessions',
            },
          },
          occupancy: { byDay, byTimeSlot, byFormat },
          sessions: { topSessions, problematicSessions },
          players: {
            bySkillLevel,
            byFormat: byFormatDist,
            activeCount: csvActive,
            inactiveCount: csvInactive,
            newThisMonth: newPlayers,
            // Real membership status from CourtReserve import
            membershipBreakdown: await (async () => {
              try {
                const rows = await ctx.prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
                  SELECT metadata->>'membershipStatus' as status, count(*) as cnt
                  FROM document_embeddings
                  WHERE club_id = ${input.clubId} AND content_type = 'member' AND source_table = 'csv_import'
                  GROUP BY metadata->>'membershipStatus'
                `
                const map: Record<string, number> = {}
                rows.forEach(r => { map[r.status] = Number(r.cnt) })
                return {
                  active: map['Currently Active'] || 0,
                  suspended: map['Suspended'] || 0,
                  noMembership: map['No Membership'] || 0,
                  expired: map['Expired'] || 0,
                }
              } catch { return null }
            })(),
          },
        }
      }
    }),

  // ── Sessions: List play sessions with filters ──
  listSessions: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const where: any = { clubId: input.clubId }
      if (input.status) where.status = input.status
      if (input.dateFrom || input.dateTo) {
        where.date = {}
        if (input.dateFrom) where.date.gte = input.dateFrom
        if (input.dateTo) where.date.lte = input.dateTo
      }

      return ctx.prisma.playSession.findMany({
        where,
        include: {
          clubCourt: true,
          _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
        },
        orderBy: { date: 'asc' },
      })
    }),

  // ── Courts: Manage club courts ──
  listCourts: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      return ctx.prisma.clubCourt.findMany({
        where: { clubId: input.clubId },
        orderBy: { name: 'asc' },
      })
    }),

  // ── AI Advisor: Conversation management ──
  listConversations: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.aIConversation.findMany({
          where: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
          },
          orderBy: { updatedAt: 'desc' },
          take: input.limit,
          include: {
            _count: { select: { messages: true } },
          },
        })
      } catch (err) {
        log.warn('[Intelligence] listConversations failed:', err)
        return []
      }
    }),

  listAdvisorDrafts: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(24),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.agentDraft.findMany({
          where: {
            clubId: input.clubId,
            createdByUserId: ctx.session.user.id,
          },
          orderBy: { updatedAt: 'desc' },
          take: input.limit,
          select: {
            id: true,
            kind: true,
            status: true,
            title: true,
            summary: true,
            originalIntent: true,
            selectedPlan: true,
            sandboxMode: true,
            scheduledFor: true,
            timeZone: true,
            metadata: true,
            updatedAt: true,
            createdAt: true,
            conversationId: true,
            conversation: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        })
      } catch (err) {
        log.warn('[Intelligence] listAdvisorDrafts failed:', err)
        return []
      }
    }),

  listOpsSessionDrafts: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(24),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const drafts = await ctx.prisma.opsSessionDraft.findMany({
          where: { clubId: input.clubId },
          orderBy: { updatedAt: 'desc' },
          take: input.limit,
          select: {
            id: true,
            sourceProposalId: true,
            origin: true,
            status: true,
            title: true,
            description: true,
            dayOfWeek: true,
            timeSlot: true,
            startTime: true,
            endTime: true,
            format: true,
            skillLevel: true,
            maxPlayers: true,
            projectedOccupancy: true,
            estimatedInterestedMembers: true,
            confidence: true,
            note: true,
            metadata: true,
            sessionDraftedAt: true,
            createdAt: true,
            updatedAt: true,
            agentDraft: {
              select: {
                id: true,
                title: true,
                conversationId: true,
                originalIntent: true,
                selectedPlan: true,
                conversation: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        })

        const publishedPlaySessionIds = Array.from(new Set(
          drafts
            .map((draft) => {
              const sessionDraft = getOpsSessionDraftSessionMetadata(draft.metadata)
              return typeof sessionDraft.publishedPlaySessionId === 'string'
                ? sessionDraft.publishedPlaySessionId
                : null
            })
            .filter((value): value is string => !!value),
        ))

        const publishedSessionsById = new Map<string, {
          id: string
          title: string
          description: string | null
          date: Date
          startTime: string
          endTime: string
          format: string
          skillLevel: string
          maxPlayers: number
          registeredCount: number | null
          status: string
          confirmedBookings: number
          waitlistCount: number
        }>()

        if (publishedPlaySessionIds.length > 0) {
          const publishedSessions = await ctx.prisma.playSession.findMany({
            where: {
              clubId: input.clubId,
              id: { in: publishedPlaySessionIds },
            },
            select: {
              id: true,
              title: true,
              description: true,
              date: true,
              startTime: true,
              endTime: true,
              format: true,
              skillLevel: true,
              maxPlayers: true,
              registeredCount: true,
              status: true,
              _count: {
                select: {
                  bookings: {
                    where: { status: 'CONFIRMED' },
                  },
                  waitlist: true,
                },
              },
            },
          }).catch((err) => {
            log.warn('[Intelligence] listOpsSessionDrafts published sessions lookup failed:', err)
            return []
          })

          for (const session of publishedSessions) {
            publishedSessionsById.set(session.id, {
              id: session.id,
              title: session.title,
              description: session.description,
              date: session.date,
              startTime: session.startTime,
              endTime: session.endTime,
              format: session.format,
              skillLevel: session.skillLevel,
              maxPlayers: session.maxPlayers,
              registeredCount: session.registeredCount,
              status: session.status,
              confirmedBookings: session._count.bookings,
              waitlistCount: session._count.waitlist,
            })
          }
        }

        return drafts.map((draft) => ({
          ...draft,
          origin: draft.origin === 'alternative' ? 'alternative' : 'primary',
          status: mapOpsSessionDraftStatusForMetadata(draft.status),
          conflict:
            draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
              ? (draft.metadata as Record<string, any>).conflict || null
              : null,
          metadata:
            draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
              ? (() => {
                  const metadataRoot = { ...(draft.metadata as Record<string, any>) }
                  const sessionDraft = getOpsSessionDraftSessionMetadata(draft.metadata)
                  const publishedPlaySessionId =
                    typeof sessionDraft.publishedPlaySessionId === 'string'
                      ? sessionDraft.publishedPlaySessionId
                      : null
                  const publishedSession = publishedPlaySessionId
                    ? publishedSessionsById.get(publishedPlaySessionId)
                    : null

                  if (!publishedPlaySessionId) {
                    return metadataRoot
                  }

                  if (!publishedSession) {
                    return {
                      ...metadataRoot,
                      sessionDraft: {
                        ...sessionDraft,
                        aftercare: buildOpsSessionAftercareReview({
                          draft: {
                            title: typeof sessionDraft.title === 'string' && sessionDraft.title.trim() ? sessionDraft.title : draft.title,
                            description: typeof sessionDraft.description === 'string' ? sessionDraft.description : draft.description,
                            date: typeof sessionDraft.targetDateIso === 'string' && sessionDraft.targetDateIso
                              ? sessionDraft.targetDateIso
                              : (typeof sessionDraft.targetDate === 'string' && sessionDraft.targetDate
                                ? `${sessionDraft.targetDate}T12:00:00.000Z`
                                : draft.createdAt),
                            startTime: draft.startTime,
                            endTime: draft.endTime,
                            format: draft.format,
                            skillLevel: draft.skillLevel,
                            maxPlayers: draft.maxPlayers,
                          },
                          liveSession: null,
                        }),
                        liveSession: null,
                      },
                    }
                  }

                  const confirmedCount =
                    (publishedSession.registeredCount != null && publishedSession.registeredCount > 0)
                      ? publishedSession.registeredCount
                      : publishedSession.confirmedBookings

                  return {
                    ...metadataRoot,
                    sessionDraft: {
                      ...sessionDraft,
                      liveFeedback: buildOpsSessionLiveFeedback({
                        projectedOccupancy: draft.projectedOccupancy,
                        maxPlayers: publishedSession.maxPlayers,
                        confirmedCount,
                        waitlistCount: publishedSession.waitlistCount,
                        sessionDate: publishedSession.date,
                      }),
                      aftercare: buildOpsSessionAftercareReview({
                        draft: {
                          title: typeof sessionDraft.title === 'string' && sessionDraft.title.trim() ? sessionDraft.title : draft.title,
                          description: typeof sessionDraft.description === 'string' ? sessionDraft.description : draft.description,
                          date: typeof sessionDraft.targetDateIso === 'string' && sessionDraft.targetDateIso
                            ? sessionDraft.targetDateIso
                            : (typeof sessionDraft.targetDate === 'string' && sessionDraft.targetDate
                              ? `${sessionDraft.targetDate}T12:00:00.000Z`
                              : publishedSession.date),
                          startTime: draft.startTime,
                          endTime: draft.endTime,
                          format: draft.format,
                          skillLevel: draft.skillLevel,
                          maxPlayers: draft.maxPlayers,
                        },
                        liveSession: {
                          id: publishedSession.id,
                          title: publishedSession.title,
                          description: publishedSession.description,
                          date: publishedSession.date,
                          startTime: publishedSession.startTime,
                          endTime: publishedSession.endTime,
                          format: publishedSession.format,
                          skillLevel: publishedSession.skillLevel,
                          maxPlayers: publishedSession.maxPlayers,
                          status: publishedSession.status,
                          confirmedCount,
                          waitlistCount: publishedSession.waitlistCount,
                        },
                      }),
                      liveSession: {
                        id: publishedSession.id,
                        title: publishedSession.title,
                        description: publishedSession.description,
                        date: publishedSession.date.toISOString(),
                        startTime: publishedSession.startTime,
                        endTime: publishedSession.endTime,
                        format: publishedSession.format,
                        skillLevel: publishedSession.skillLevel,
                        maxPlayers: publishedSession.maxPlayers,
                        status: publishedSession.status,
                      },
                    },
                  }
                })()
              : draft.metadata,
        }))
      } catch (err) {
        log.warn('[Intelligence] listOpsSessionDrafts failed:', err)
        return []
      }
    }),

  listOpsTeammates: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      try {
        const teammates = await ctx.prisma.clubAdmin.findMany({
          where: { clubId: input.clubId },
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        })

        return teammates.map((entry) => ({
          id: entry.user.id,
          role: entry.role,
          name: entry.user.name || entry.user.email || 'Club admin',
          email: entry.user.email || null,
          label: entry.user.name || entry.user.email || 'Club admin',
        }))
      } catch (err) {
        log.warn('[Intelligence] listOpsTeammates failed:', err)
        return []
      }
    }),

  listAdminTodoDecisions: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      dateKey: z.string().min(1).max(32),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      try {
        const recentDecisionWindow = new Date(Date.now() - 72 * 60 * 60 * 1000)
        return await ctx.prisma.agentAdminTodoDecision.findMany({
          where: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            OR: [
              { dateKey: input.dateKey },
              {
                decision: 'not_now',
                updatedAt: { gte: recentDecisionWindow },
              },
            ],
          },
          orderBy: { updatedAt: 'desc' },
          select: {
            dateKey: true,
            itemId: true,
            decision: true,
            title: true,
            bucket: true,
            href: true,
            metadata: true,
            updatedAt: true,
            createdAt: true,
          },
        })
      } catch (err) {
        log.warn('[Intelligence] listAdminTodoDecisions failed:', err)
        return []
      }
    }),

  listAgentDecisionRecords: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(24).optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      try {
        return await listAgentDecisionRecordsSafe(ctx.prisma, input)
      } catch (err) {
        log.warn('[Intelligence] listAgentDecisionRecords failed:', err)
        return []
      }
    }),

  getLookalikeExportHistory: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(24).optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      try {
        return await listAgentDecisionRecordsSafe(ctx.prisma, {
          clubId: input.clubId,
          limit: input.limit ?? 8,
          action: 'lookalike_export',
        })
      } catch (err) {
        log.warn('[Intelligence] getLookalikeExportHistory failed:', err)
        return []
      }
    }),

  getOutreachPilotHealth: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      days: z.number().int().min(3).max(30).optional().default(14),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const since = new Date(Date.now() - input.days * 86400000)
      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: {
          clubId: input.clubId,
          createdAt: { gte: since },
        },
        select: {
          type: true,
          channel: true,
          status: true,
          reasoning: true,
          createdAt: true,
          openedAt: true,
          clickedAt: true,
          respondedAt: true,
          deliveredAt: true,
          bouncedAt: true,
          bounceType: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      })

      return buildAgentOutreachPilotSnapshot({
        logs,
        days: input.days,
      })
    }),

  setAdminTodoDecision: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      dateKey: z.string().min(1).max(32),
      itemId: z.string().min(1),
      decision: z.enum(['accepted', 'declined', 'not_now']),
      title: z.string().min(1),
      bucket: z.string().min(1),
      href: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      try {
        const record = await ctx.prisma.agentAdminTodoDecision.upsert({
          where: {
            clubId_userId_dateKey_itemId: {
              clubId: input.clubId,
              userId: ctx.session.user.id,
              dateKey: input.dateKey,
              itemId: input.itemId,
            },
          },
          update: {
            decision: input.decision,
            title: input.title,
            bucket: input.bucket,
            href: input.href,
            metadata: (input.metadata || {}) as any,
          },
          create: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            dateKey: input.dateKey,
            itemId: input.itemId,
            decision: input.decision,
            title: input.title,
            bucket: input.bucket,
            href: input.href,
            metadata: (input.metadata || {}) as any,
          },
          select: {
            itemId: true,
            decision: true,
            updatedAt: true,
          },
        })

        pushToUser(ctx.session.user.id, { type: 'invalidate', keys: ['notification.list'] })

        return {
          ok: true,
          persisted: true,
          ...record,
        }
      } catch (err) {
        log.warn('[Intelligence] setAdminTodoDecision failed:', err)
        return {
          ok: false,
          persisted: false,
          itemId: input.itemId,
          decision: input.decision,
          updatedAt: new Date(),
        }
      }
    }),

  clearAdminTodoDecisions: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      dateKey: z.string().min(1).max(32),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      try {
        const result = await ctx.prisma.agentAdminTodoDecision.deleteMany({
          where: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            dateKey: input.dateKey,
          },
        })

        pushToUser(ctx.session.user.id, { type: 'invalidate', keys: ['notification.list'] })

        return {
          ok: true,
          persisted: true,
          count: result.count,
        }
      } catch (err) {
        log.warn('[Intelligence] clearAdminTodoDecisions failed:', err)
        return {
          ok: false,
          persisted: false,
          count: 0,
        }
      }
    }),

  getConversation: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const conversation = await ctx.prisma.aIConversation.findUnique({
          where: { id: input.conversationId },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        })
        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
        }
        if (conversation.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your conversation' })
        }
        return conversation
      } catch (err) {
        if (err instanceof TRPCError) throw err
        log.warn('[Intelligence] getConversation failed:', err)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load conversation' })
      }
    }),

  createConversation: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      title: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.aIConversation.create({
          data: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            title: input.title || 'New conversation',
          },
        })
      } catch (err) {
        log.warn('[Intelligence] createConversation failed:', err)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create conversation' })
      }
    }),

  deleteConversation: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const conversation = await ctx.prisma.aIConversation.findUnique({
          where: { id: input.conversationId },
        })
        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
        }
        if (conversation.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your conversation' })
        }
        await ctx.prisma.aIConversation.delete({
          where: { id: input.conversationId },
        })
        return { success: true }
      } catch (err) {
        if (err instanceof TRPCError) throw err
        log.warn('[Intelligence] deleteConversation failed:', err)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete conversation' })
      }
    }),

  deleteAllConversations: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Delete all messages first (FK constraint), then conversations
        await ctx.prisma.aIMessage.deleteMany({
          where: { conversation: { clubId: input.clubId, userId: ctx.session.user.id } },
        })
        await ctx.prisma.aIConversation.deleteMany({
          where: { clubId: input.clubId, userId: ctx.session.user.id },
        })
        return { success: true }
      } catch (err) {
        log.warn('[Intelligence] deleteAllConversations failed:', err)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete conversations' })
      }
    }),

  // ── Sessions Calendar: Per-session view with analysis ──
  getSessionsCalendar: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // In-memory cache: 5 min TTL per club
      const cacheKey = `calendar:${input.clubId}`
      const cached = calendarCache.get(cacheKey)
      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        return cached.data
      }

      let csvSessions: any[] = []

      // Primary: fast Prisma query on play_sessions (indexed, no JSON parsing)
      try {
        const dbSessions = await ctx.prisma.playSession.findMany({
          where: { clubId: input.clubId },
          select: {
            id: true, date: true, startTime: true, endTime: true, format: true,
            skillLevel: true, maxPlayers: true, pricePerSlot: true, registeredCount: true,
            title: true, courtId: true,
            clubCourt: { select: { name: true } },
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
        })
        csvSessions = dbSessions.map((s: any) => {
          // Prefer registeredCount (set during Excel/CSV import) over booking join count
          // _count.bookings may be 0 for Excel-imported sessions where members weren't matched
          const registered = (s.registeredCount != null && s.registeredCount > 0)
            ? s.registeredCount
            : s._count.bookings;
          return {
            id: s.id,
            date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10),
            startTime: s.startTime,
            endTime: s.endTime,
            court: s.clubCourt?.name || '',
            courtId: s.courtId,
            format: s.format,
            skillLevel: s.skillLevel,
            title: s.title,
            registered,
            capacity: s.maxPlayers,
            occupancy: s.maxPlayers > 0 ? Math.round((registered / s.maxPlayers) * 100) : 0,
            pricePerPlayer: s.pricePerSlot != null ? Number(s.pricePerSlot) : null,
            playerNames: [],
          };
        })
      } catch (err) {
        log.warn('[Intelligence] getSessionsCalendar play_sessions query failed:', (err as Error).message?.slice(0, 80))
      }

      // Fallback: embeddings (only if no play_sessions found)
      if (csvSessions.length === 0) {
        try {
          const rows = await ctx.prisma.$queryRaw<Array<{ metadata: any }>>`
            SELECT metadata FROM document_embeddings
            WHERE club_id = ${input.clubId}              AND content_type = 'session'
              AND source_table = 'csv_import'
          `
          csvSessions = rows
            .map(r => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata))
            .filter((m: any) => m && m.date && m.capacity > 0)
        } catch (err) {
          log.warn('[Intelligence] getSessionsCalendar embeddings fallback failed:', (err as Error).message?.slice(0, 80))
        }
      }

      const { buildSessionCalendarData } = await import('@/lib/ai/session-analysis')
      const result = buildSessionCalendarData(csvSessions, input.clubId)

      // Cache result
      calendarCache.set(cacheKey, { data: result, ts: Date.now() })

      return result
    }),

  // ── Member Health: AI-powered churn prediction ──
  getMemberHealth: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      const membershipMappings = resolveMembershipMappings(clubAutomationContext?.automationSettings)

      try {
        // Get only club members who have at least 1 confirmed booking.
        // Use Prisma instead of raw SQL to avoid production type/operator mismatches.
        const activeUserIds = await ctx.prisma.playSessionBooking.findMany({
          where: {
            status: 'CONFIRMED',
            playSession: { clubId: input.clubId },
          },
          select: { userId: true },
          distinct: ['userId'],
        })
        const activeSet = new Set(
          activeUserIds
            .map(r => r.userId)
            .filter((id): id is string => !!id)
        )

        const allFollowers = await ctx.prisma.clubFollower.findMany({
          where: { clubId: input.clubId },
          include: {
              user: {
              select: {
                id: true, email: true, name: true, image: true,
                gender: true, city: true,
                duprRatingDoubles: true, duprRatingSingles: true,
                membershipType: true, membershipStatus: true,
              },
            },
          },
        })
        // Only process members with bookings for health scoring
        const followers = allFollowers.filter(f => activeSet.has(f.userId))
        const dormantCount = allFollowers.length - followers.length
        log.info(
          `[Intelligence] getMemberHealth counts: activeUserRows=${activeUserIds.length} activeSet=${activeSet.size} followers=${allFollowers.length} activeFollowers=${followers.length} dormant=${dormantCount}`
        )

        // Load membership data from embeddings — match by email (source_id may not match userId due to duplicate users)
        let memberEmbeddings: Array<{ source_id: string; metadata: any }> = []
        try {
          memberEmbeddings = await ctx.prisma.$queryRaw<Array<{ source_id: string; metadata: any }>>`
            SELECT source_id, metadata FROM document_embeddings
            WHERE club_id = ${input.clubId} AND content_type = 'member' AND source_table = 'csv_import'
          `
        } catch (err) {
          log.warn('[Intelligence] getMemberHealth member embeddings query failed:', (err as Error).message?.slice(0, 120))
        }
        const membershipByEmail = new Map<string, { membership: string | null; membershipStatus: string | null; lastVisit: string | null; firstVisit: string | null }>()
        const membershipBySourceId = new Map<string, { membership: string | null; membershipStatus: string | null; lastVisit: string | null; firstVisit: string | null }>()
        for (const e of memberEmbeddings) {
          let m: any
          try {
            m = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata
          } catch (err) {
            log.warn('[Intelligence] getMemberHealth member embedding parse failed:', (err as Error).message?.slice(0, 120))
            continue
          }
          const info = {
            membership: m?.membership || null,
            membershipStatus: m?.membershipStatus || null,
            lastVisit: m?.lastVisit || null,
            firstVisit: m?.firstVisit || null,
          }
          membershipBySourceId.set(e.source_id, info)
          if (m?.email) membershipByEmail.set(String(m.email).toLowerCase().trim(), info)
        }
        // Build lookup: try userId first, then email
        const getMembershipInfo = (
          userId: string,
          email: string | null,
          membershipType: string | null | undefined,
          membershipStatus: string | null | undefined,
        ) => {
          const embedded = membershipBySourceId.get(userId)
            || (email ? membershipByEmail.get(email.toLowerCase().trim()) : null)
            || null

          if (!embedded && !membershipType && !membershipStatus) return null

          return {
            membership: membershipType || embedded?.membership || null,
            membershipStatus: membershipStatus || embedded?.membershipStatus || null,
            lastVisit: embedded?.lastVisit || null,
            firstVisit: embedded?.firstVisit || null,
            membershipMappings,
          }
        }

        // Get all bookings for these users at this club
        const userIds = followers.map(f => f.userId)
        const bookings = await ctx.prisma.playSessionBooking.findMany({
          where: {
            userId: { in: userIds },
            playSession: { clubId: input.clubId },
          },
          select: {
            userId: true, status: true, bookedAt: true,
            playSession: {
              select: { date: true, startTime: true, format: true, pricePerSlot: true },
            },
          },
          orderBy: { bookedAt: 'desc' },
        })
        log.info(`[Intelligence] getMemberHealth bookings: users=${userIds.length} bookings=${bookings.length}`)

        // Get preferences
        const preferences = await ctx.prisma.userPlayPreference.findMany({
          where: { clubId: input.clubId, userId: { in: userIds } },
        })
        log.info(`[Intelligence] getMemberHealth preferences: ${preferences.length}`)

        // Build input for health scoring
        const now = new Date()
        const d30 = new Date(now.getTime() - 30 * 86400000)
        const d60 = new Date(now.getTime() - 60 * 86400000)

        const prefMap = new Map(preferences.map(p => [p.userId, p]))
        const bookingMap = new Map<string, typeof bookings>()
        for (const b of bookings) {
          if (!bookingMap.has(b.userId)) bookingMap.set(b.userId, [])
          bookingMap.get(b.userId)!.push(b)
        }

        const memberInputs = followers.map(f => {
          const userBookings = bookingMap.get(f.userId) || []
          const confirmed = userBookings.filter(b => b.status === 'CONFIRMED')
          const lastConfirmed = confirmed[0]?.bookedAt ?? null
          const daysSinceLast = lastConfirmed
            ? Math.floor((now.getTime() - lastConfirmed.getTime()) / 86400000)
            : null

          const bookingsLast30 = confirmed.filter(b => b.bookedAt >= d30).length
          const bookings30to60 = confirmed.filter(b => b.bookedAt >= d60 && b.bookedAt < d30).length

          return {
            member: {
              id: f.user.id,
              email: f.user.email,
              name: f.user.name,
              image: f.user.image,
              gender: (f.user.gender as 'M' | 'F' | 'X') ?? null,
              city: f.user.city,
              duprRatingDoubles: f.user.duprRatingDoubles ? Number(f.user.duprRatingDoubles) : null,
              duprRatingSingles: f.user.duprRatingSingles ? Number(f.user.duprRatingSingles) : null,
            },
            preference: (() => {
              const pref = prefMap.get(f.userId)
              if (!pref) return null
              return {
                id: pref.id,
                userId: pref.userId,
                clubId: pref.clubId,
                preferredDays: pref.preferredDays as DayOfWeek[],
                preferredTimeSlots: {
                  morning: pref.preferredTimeMorning,
                  afternoon: pref.preferredTimeAfternoon,
                  evening: pref.preferredTimeEvening,
                },
                skillLevel: pref.skillLevel,
                preferredFormats: pref.preferredFormats as PlaySessionFormat[],
                targetSessionsPerWeek: pref.targetSessionsPerWeek,
                isActive: true,
              }
            })(),
            history: {
              totalBookings: userBookings.length,
              bookingsLastWeek: confirmed.filter(b => b.bookedAt >= new Date(now.getTime() - 7 * 86400000)).length,
              bookingsLastMonth: bookingsLast30,
              daysSinceLastConfirmedBooking: daysSinceLast,
              cancelledCount: userBookings.filter(b => b.status === 'CANCELLED').length,
              noShowCount: userBookings.filter(b => b.status === 'NO_SHOW').length,
              inviteAcceptanceRate: 0.7, // default
            },
            joinedAt: f.createdAt ?? new Date(),
            bookingDates: userBookings.map(b => ({
              date: b.bookedAt,
              status: b.status as 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
            })),
            previousPeriodBookings: bookings30to60,
            membershipInfo: getMembershipInfo(
              f.userId,
              f.user.email,
              f.user.membershipType,
              f.user.membershipStatus,
            ),
            bookingsWithSessions: userBookings.map(b => ({
              date: (b as any).playSession?.date ?? b.bookedAt,
              startTime: (b as any).playSession?.startTime ?? '12:00',
              format: (b as any).playSession?.format ?? 'OPEN_PLAY',
              pricePerSlot: (b as any).playSession?.pricePerSlot ?? null,
              status: b.status as 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
            })),
          }
        })
        log.info(`[Intelligence] getMemberHealth memberInputs: ${memberInputs.length}`)

        // ── Co-player social graph (Level 2) ──
        // Expensive self-join query (~700ms for 21K bookings) — cached for 30 minutes
        let coPlayerMap = new Map<string, { activeCoPlayers: number; totalCoPlayers: number }>()
        try {
          const cacheKey = `co_players_${input.clubId}`
          const cached = coPlayerCache.get(cacheKey)
          if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
            coPlayerMap = cached.data
          } else {
            const coPlayerRows: any[] = await ctx.prisma.$queryRawUnsafe(`
              WITH user_sessions AS (
                SELECT b."userId", b."sessionId"
                FROM play_session_bookings b
                WHERE b.status = 'CONFIRMED'
                  AND b."sessionId" IN (
                    SELECT id FROM play_sessions
                    WHERE "clubId" = $1                      AND date >= NOW() - INTERVAL '90 days'
                      AND date <= NOW()
                  )
              ),
              co_player_counts AS (
                SELECT us1."userId", us2."userId" as co_player_id, COUNT(*) as n
                FROM user_sessions us1
                JOIN user_sessions us2 ON us1."sessionId" = us2."sessionId"
                  AND us1."userId" != us2."userId"
                GROUP BY us1."userId", us2."userId"
                HAVING COUNT(*) >= 3
              ),
              top_co AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY n DESC) as rn
                FROM co_player_counts
              ),
              limited AS (SELECT "userId", co_player_id FROM top_co WHERE rn <= 10),
              result AS (
                SELECT l."userId", COUNT(*) as total_co_players,
                  COUNT(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM play_session_bookings b2
                    JOIN play_sessions ps2 ON ps2.id = b2."sessionId"
                    WHERE b2."userId" = l.co_player_id AND ps2."clubId" = $1                      AND b2.status = 'CONFIRMED' AND ps2.date >= NOW() - INTERVAL '21 days'
                  )) as active_co_players
                FROM limited l GROUP BY l."userId"
              )
              SELECT * FROM result
            `, input.clubId)

            for (const row of coPlayerRows) {
              coPlayerMap.set(row.userId, {
                totalCoPlayers: Number(row.total_co_players),
                activeCoPlayers: Number(row.active_co_players),
              })
            }
            coPlayerCache.set(cacheKey, { ts: Date.now(), data: coPlayerMap })
          }
        } catch (err) {
          log.warn('[Intelligence] Co-player query failed (non-critical):', (err as Error).message?.slice(0, 80))
        }

        // Attach co-player data to memberInputs
        for (const m of memberInputs as any[]) {
          m.coPlayerActivity = coPlayerMap.get(m.member.id) || undefined
        }

        const { generateMemberHealth } = await import('@/lib/ai/member-health')
        const result = generateMemberHealth(memberInputs)
        log.info(`[Intelligence] getMemberHealth result: members=${result.members.length} summaryTotal=${result.summary.total}`)

        // Add dormant count (followers with 0 bookings — filtered upfront for performance)
        result.summary.dormant = dormantCount
        result.summary.total = allFollowers.length

        return result
      } catch (err) {
        log.warn('[Intelligence] getMemberHealth failed:', (err as Error).message?.slice(0, 120))
        // Return empty data rather than throwing
        return {
          members: [],
          summary: { total: 0, healthy: 0, watch: 0, atRisk: 0, critical: 0, churned: 0, avgHealthScore: 0, revenueAtRisk: 0, trendVsPrevWeek: 0 },
        }
      }
    }),

  // ── Health-Based Outreach: Send CHECK_IN or RETENTION_BOOST ──
  sendOutreachMessage: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      memberId: z.string(),
      type: z.enum(['CHECK_IN', 'RETENTION_BOOST']),
      channel: z.enum(['email', 'sms', 'both']).default('email'),
      variantId: z.string().optional(),
      healthScore: z.number().optional(),
      riskLevel: z.string().optional(),
      lowComponents: z.array(z.object({
        key: z.string(),
        label: z.string(),
        score: z.number(),
      })).optional(),
      daysSinceLastActivity: z.number().nullable().optional(),
      preferredDays: z.array(z.string()).optional(),
      suggestedSessionTitle: z.string().optional(),
      totalBookings: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'outreachSend',
        adminRole: adminAccess.role,
      })
      return sendOutreachMessage(ctx.prisma, input)
    }),

  // ── Delete ALL imported data for a club (clean slate) ──
  deleteAllClubData: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { isAdmin } = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      if (!isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can delete club data' })

      const clubId = input.clubId
      const deleted: Record<string, number> = {}

      // 1. Bookings (depends on sessions)
      const d1 = await ctx.prisma.playSessionBooking.deleteMany({ where: { playSession: { clubId } } })
      deleted.bookings = d1.count

      // 2. Play sessions
      const d2 = await ctx.prisma.playSession.deleteMany({ where: { clubId } })
      deleted.sessions = d2.count

      // 3. Document embeddings (sessions, members, patterns, etc.)
      deleted.embeddings = Number(await ctx.prisma.$executeRaw`DELETE FROM document_embeddings WHERE club_id = ${clubId}`)

      // 4. AI profiles
      const d4 = await ctx.prisma.memberAiProfile.deleteMany({ where: { clubId } })
      deleted.aiProfiles = d4.count

      // 5. Health snapshots
      const d5 = await ctx.prisma.memberHealthSnapshot.deleteMany({ where: { clubId } })
      deleted.healthSnapshots = d5.count

      // 6. Recommendation logs
      const d6 = await ctx.prisma.aIRecommendationLog.deleteMany({ where: { clubId } })
      deleted.recommendationLogs = d6.count

      // 7. External ID mappings (all providers: crx_, pp_, cr_)
      deleted.externalMappings = Number(await ctx.prisma.$executeRaw`
        DELETE FROM external_id_mappings WHERE partner_id IN (
          SELECT id FROM partners WHERE code LIKE ${'%' + clubId + '%'}
        )
      `)
      // Also clean up partner records
      await ctx.prisma.$executeRaw`
        DELETE FROM partner_apps WHERE partner_id IN (
          SELECT id FROM partners WHERE code LIKE ${'%' + clubId + '%'}
        )
      `
      await ctx.prisma.$executeRaw`
        DELETE FROM partners WHERE code LIKE ${'%' + clubId + '%'}
      `

      // 8. Club followers (member associations)
      const d8 = await ctx.prisma.clubFollower.deleteMany({ where: { clubId } })
      deleted.followers = d8.count

      // 9. Weekly summaries
      const d9 = await ctx.prisma.weeklySummary.deleteMany({ where: { clubId } })
      deleted.weeklySummaries = d9.count

      // 10. Cohorts
      const d10 = await ctx.prisma.clubCohort.deleteMany({ where: { clubId } })
      deleted.cohorts = d10.count

      // Clear in-memory caches
      calendarCache.delete(`calendar:${clubId}`)

      log.info(`[deleteAllClubData] Club ${clubId} cleaned:`, deleted)
      return { ok: true, deleted }
    }),

  // ── RAG: Trigger embedding index for a club ──
  reindexClub: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { isAdmin } = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can reindex' })
      }
      const { indexAll } = await import('@/lib/ai/rag/indexer')
      return indexAll(input.clubId)
    }),

  // ── Intelligence Settings: Get onboarding/config ──
  getIntelligenceSettings: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const settings = club.automationSettings?.intelligence || null
      return {
        settings,
        clubRole: adminAccess.role,
        resolvedPermissions: resolveAgentPermissions({ intelligence: settings || {} }),
        outreachRolloutStatus: getAgentOutreachRolloutStatus({
          clubId: input.clubId,
          automationSettings: { intelligence: settings || {} },
        }),
      }
    }),

  // ── Intelligence Settings: Save onboarding/config ──
  saveIntelligenceSettings: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      settings: z.record(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const { isAdmin } = adminAccess
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update intelligence settings' })
      }
      const { intelligenceSettingsSchema } = await import('@/lib/ai/onboarding-schema')

      // Merge new settings into existing intelligence settings (supports partial updates)
      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const existing = club.automationSettings || {}
      const existingIntelligence = existing.intelligence || {}
      const previousControlPlane = resolveAgentControlPlane({ intelligence: existingIntelligence })
      const merged = { ...existingIntelligence, ...input.settings }

      let validated: any
      try {
        validated = intelligenceSettingsSchema.parse(merged)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid intelligence settings payload',
          cause: error,
        })
      }

      const controlPlaneChanged =
        input.settings.controlPlane !== undefined
        && JSON.stringify(input.settings.controlPlane) !== JSON.stringify(existingIntelligence.controlPlane || undefined)
      const permissionsChanged =
        input.settings.permissions !== undefined
        && JSON.stringify(input.settings.permissions) !== JSON.stringify(existingIntelligence.permissions || undefined)
      const previousOutreachRollout = getAgentOutreachRolloutStatus({
        clubId: input.clubId,
        automationSettings: { intelligence: existingIntelligence },
      })

      if (permissionsChanged || controlPlaneChanged) {
        assertAgentPermissionForAdmin({
          automationSettings: { intelligence: existingIntelligence },
          action: 'controlPlaneManage',
          adminRole: adminAccess.role,
        })
      }

      const nextControlPlane = resolveAgentControlPlane({ intelligence: validated })
      const controlPlaneChanges = diffAgentControlPlaneResolved(previousControlPlane, nextControlPlane)
      const nextOutreachRollout = getAgentOutreachRolloutStatus({
        clubId: input.clubId,
        automationSettings: { intelligence: validated },
      })
      if (previousOutreachRollout.summary !== nextOutreachRollout.summary) {
        controlPlaneChanges.push({
          key: 'outreachRollout',
          label: 'Outreach rollout',
          from: previousOutreachRollout.summary,
          to: nextOutreachRollout.summary,
        })
      }
      const previousControlPlaneAudit = getAgentControlPlaneAudit({ intelligence: existingIntelligence })
      const nextIntelligence = { ...validated }
      const sanitizedControlPlane = nextIntelligence.controlPlane
        ? { ...nextIntelligence.controlPlane }
        : undefined

      if (sanitizedControlPlane && 'audit' in sanitizedControlPlane) {
        delete sanitizedControlPlane.audit
      }

      if (controlPlaneChanges.length > 0) {
        nextIntelligence.controlPlane = {
          ...(sanitizedControlPlane || {}),
          audit: {
            ...(previousControlPlaneAudit || {}),
            lastChangedAt: new Date().toISOString(),
            lastChangedByUserId: ctx.session.user.id,
            lastChangedByLabel: ctx.session.user.name || ctx.session.user.email || 'Club admin',
            summary: buildAgentControlPlaneChangeSummary(controlPlaneChanges),
            changes: controlPlaneChanges,
          },
        }
      } else if (previousControlPlaneAudit) {
        nextIntelligence.controlPlane = {
          ...(sanitizedControlPlane || {}),
          audit: previousControlPlaneAudit,
        }
      } else if (sanitizedControlPlane) {
        nextIntelligence.controlPlane = sanitizedControlPlane
      }

      await (ctx.prisma.club as any).update({
        where: { id: input.clubId },
        data: {
          automationSettings: {
            ...existing,
            intelligence: nextIntelligence,
          },
        },
      })
      return {
        success: true,
        settings: nextIntelligence,
      }
    }),

  shadowBackOutreachRolloutAction: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      actionKind: z.enum(['create_campaign', 'fill_session', 'reactivate_members', 'trial_follow_up', 'renewal_reactivation']),
      reason: z.string().min(1).max(400).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      if (!adminAccess.isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update outreach rollout settings' })
      }

      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const existing = club.automationSettings || {}
      const existingIntelligence = existing.intelligence || {}

      assertAgentPermissionForAdmin({
        automationSettings: { intelligence: existingIntelligence },
        action: 'controlPlaneManage',
        adminRole: adminAccess.role,
      })

      const previousControlPlane = resolveAgentControlPlane({ intelligence: existingIntelligence })
      const previousOutreachRollout = getAgentOutreachRolloutStatus({
        clubId: input.clubId,
        automationSettings: { intelligence: existingIntelligence },
      })
      const nextIntelligence = {
        ...existingIntelligence,
        controlPlane: {
          ...(existingIntelligence.controlPlane || {}),
          outreachRollout: {
            ...(existingIntelligence.controlPlane?.outreachRollout || {}),
            actions: {
              ...(existingIntelligence.controlPlane?.outreachRollout?.actions || {}),
              [input.actionKind]: {
                ...(existingIntelligence.controlPlane?.outreachRollout?.actions?.[input.actionKind] || {}),
                enabled: false,
              },
            },
          },
        },
      }

      const nextControlPlane = resolveAgentControlPlane({ intelligence: nextIntelligence })
      const controlPlaneChanges = diffAgentControlPlaneResolved(previousControlPlane, nextControlPlane)
      const nextOutreachRollout = getAgentOutreachRolloutStatus({
        clubId: input.clubId,
        automationSettings: { intelligence: nextIntelligence },
      })
      if (previousOutreachRollout.summary !== nextOutreachRollout.summary) {
        controlPlaneChanges.push({
          key: 'outreachRollout',
          label: 'Outreach rollout',
          from: previousOutreachRollout.summary,
          to: nextOutreachRollout.summary,
        })
      }

      const previousControlPlaneAudit = getAgentControlPlaneAudit({ intelligence: existingIntelligence })
      const sanitizedControlPlane = nextIntelligence.controlPlane
        ? { ...nextIntelligence.controlPlane }
        : undefined
      if (sanitizedControlPlane && 'audit' in sanitizedControlPlane) {
        delete sanitizedControlPlane.audit
      }

      if (controlPlaneChanges.length > 0) {
        nextIntelligence.controlPlane = {
          ...(sanitizedControlPlane || {}),
          audit: {
            ...(previousControlPlaneAudit || {}),
            lastChangedAt: new Date().toISOString(),
            lastChangedByUserId: ctx.session.user.id,
            lastChangedByLabel: ctx.session.user.name || ctx.session.user.email || 'Club admin',
            summary: buildAgentControlPlaneChangeSummary(controlPlaneChanges),
            changes: controlPlaneChanges,
          },
        }
      } else if (previousControlPlaneAudit) {
        nextIntelligence.controlPlane = {
          ...(sanitizedControlPlane || {}),
          audit: previousControlPlaneAudit,
        }
      }

      await (ctx.prisma.club as any).update({
        where: { id: input.clubId },
        data: {
          automationSettings: {
            ...existing,
            intelligence: nextIntelligence,
          },
        },
      })

      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: input.clubId,
        userId: ctx.session.user.id,
        actorType: 'user',
        action: 'outreachRolloutShadowBack',
        targetType: 'outreach_action',
        targetId: input.actionKind,
        mode: 'shadow',
        result: 'reviewed',
        summary: `${ctx.session.user.name || ctx.session.user.email || 'Club admin'} moved ${input.actionKind} back to shadow.`,
        metadata: {
          actionKind: input.actionKind,
          label: nextOutreachRollout.actions[input.actionKind]?.label,
          reason: input.reason || null,
        },
      }).catch((err) => {
        log.warn('[Intelligence] Failed to persist outreach shadow-back decision:', err)
      })

      return {
        success: true,
        settings: nextIntelligence,
        outreachRolloutStatus: nextOutreachRollout,
      }
    }),

  // ── Automation Settings: Get campaign triggers ──
  getAutomationSettings: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const raw = club.automationSettings || {}
      return {
        settings: {
          enabled: raw.enabled ?? true,
          triggers: {
            healthyToWatch: raw.triggers?.healthyToWatch ?? true,
            watchToAtRisk: raw.triggers?.watchToAtRisk ?? true,
            atRiskToCritical: raw.triggers?.atRiskToCritical ?? true,
            churned: raw.triggers?.churned ?? true,
          },
        },
      }
    }),

  // ── Automation Settings: Save campaign triggers ──
  saveAutomationSettings: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      settings: z.object({
        enabled: z.boolean(),
        triggers: z.object({
          healthyToWatch: z.boolean(),
          watchToAtRisk: z.boolean(),
          atRiskToCritical: z.boolean(),
          churned: z.boolean(),
        }),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { isAdmin } = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update automation settings' })
      }
      const { automationTriggersSchema } = await import('@/lib/ai/onboarding-schema')
      const validated = automationTriggersSchema.parse(input.settings)

      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const existing = club.automationSettings || {}
      await (ctx.prisma.club as any).update({
        where: { id: input.clubId },
        data: {
          automationSettings: {
            ...existing,
            enabled: validated.enabled,
            triggers: validated.triggers,
          },
        },
      })
      return { success: true }
    }),

  // ── Campaign Analytics ──
  getCampaignAnalytics: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      days: z.number().int().min(7).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const since = new Date(Date.now() - input.days * 86400000)
      const weekAgo = new Date(Date.now() - 7 * 86400000)

      // ── Run all queries in parallel ──
      const [byType, byStatus, allLogs, recentLogs, club, logsWithPersona] = await Promise.all([
        // Stats by type
        ctx.prisma.aIRecommendationLog.groupBy({
          by: ['type'],
          where: { clubId: input.clubId, createdAt: { gte: since } },
          _count: true,
        }),
        // Stats by status
        ctx.prisma.aIRecommendationLog.groupBy({
          by: ['status'],
          where: { clubId: input.clubId, createdAt: { gte: since } },
          _count: true,
        }),
        // Logs for by-day aggregation (minimal select)
        ctx.prisma.aIRecommendationLog.findMany({
          where: { clubId: input.clubId, createdAt: { gte: since } },
          select: { createdAt: true, status: true },
          orderBy: { createdAt: 'asc' },
        }),
        // Recent 20 logs
        ctx.prisma.aIRecommendationLog.findMany({
          where: { clubId: input.clubId, createdAt: { gte: since } },
          select: {
            id: true, type: true, status: true, channel: true, reasoning: true, createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        // Club triggers
        ctx.prisma.club.findUniqueOrThrow({
          where: { id: input.clubId },
          select: { automationSettings: true },
        }),
        // Persona breakdown
        ctx.prisma.$queryRaw<Array<{
          persona: string | null; total: bigint; sent: bigint;
          delivered: bigint; opened: bigint; clicked: bigint; converted: bigint
        }>>`
          SELECT
            upp.detected_persona as persona,
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE arl.status IN ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'CONVERTED'))::bigint as sent,
            COUNT(*) FILTER (WHERE arl.status IN ('DELIVERED', 'OPENED', 'CLICKED', 'CONVERTED'))::bigint as delivered,
            COUNT(*) FILTER (WHERE arl.status IN ('OPENED', 'CLICKED', 'CONVERTED'))::bigint as opened,
            COUNT(*) FILTER (WHERE arl.status IN ('CLICKED', 'CONVERTED'))::bigint as clicked,
            COUNT(*) FILTER (WHERE arl.status = 'CONVERTED')::bigint as converted
          FROM ai_recommendation_logs arl
          LEFT JOIN user_play_preferences upp
            ON arl."userId" = upp."userId" AND arl."clubId" = upp."clubId"
          WHERE arl."clubId" = ${input.clubId}
            AND arl."createdAt" >= ${since}
          GROUP BY upp.detected_persona
          ORDER BY total DESC
        `,
      ])

      const byDay: Record<string, { sent: number; failed: number; skipped: number }> = {}
      for (const log of allLogs) {
        const day = log.createdAt.toISOString().slice(0, 10)
        if (!byDay[day]) byDay[day] = { sent: 0, failed: 0, skipped: 0 }
        const bucket = log.status === 'sent' ? 'sent' : log.status === 'failed' ? 'failed' : 'skipped'
        byDay[day][bucket]++
      }

      const triggers = ((club as any).automationSettings as any)?.triggers || {}
      const activeTriggers = Object.values(triggers).filter(Boolean).length
      const thisWeek = allLogs.filter(l => l.createdAt >= weekAgo && l.status === 'sent').length

      const byPersona = logsWithPersona.map(row => ({
        persona: row.persona || 'UNKNOWN',
        total: Number(row.total),
        sent: Number(row.sent),
        delivered: Number(row.delivered),
        opened: Number(row.opened),
        clicked: Number(row.clicked),
        converted: Number(row.converted),
        conversionRate: Number(row.sent) > 0
          ? Math.round((Number(row.converted) / Number(row.sent)) * 100)
          : 0,
        openRate: Number(row.delivered) > 0
          ? Math.round((Number(row.opened) / Number(row.delivered)) * 100)
          : 0,
        clickRate: Number(row.opened) > 0
          ? Math.round((Number(row.clicked) / Number(row.opened)) * 100)
          : 0,
      }))

      // ── Campaign Alerts ──
      const totalSentNum = byStatus.find((s: any) => s.status === 'sent')?._count || 0
      const totalConvertedNum = byPersona.reduce((s, p) => s + p.converted, 0)
      const totalBouncedNum = byStatus.find((s: any) => s.status === 'bounced')?._count || 0
      const totalUnsubscribedNum = byStatus.find((s: any) => s.status === 'unsubscribed')?._count || 0

      const alerts = checkCampaignAlerts({
        totalSent: totalSentNum,
        totalConverted: totalConvertedNum,
        totalBounced: totalBouncedNum,
        totalUnsubscribed: totalUnsubscribedNum,
        byPersona: byPersona.map(p => ({ persona: p.persona, sent: p.sent, converted: p.converted })),
      })

      const guestTrialAnalytics = buildCampaignGuestTrialAnalytics(recentLogs.map((log) => ({
        id: log.id,
        type: log.type,
        status: log.status,
        channel: log.channel,
        createdAt: log.createdAt,
        userName: log.user?.name || log.user?.email || 'Unknown',
        reasoning: log.reasoning,
      })))

      return {
        summary: {
          totalSent: totalSentNum,
          totalFailed: byStatus.find((s: any) => s.status === 'failed')?._count || 0,
          totalPending: byStatus.find((s: any) => s.status === 'pending')?._count || 0,
          totalConverted: totalConvertedNum,
          thisWeek,
          activeTriggers,
        },
        byType: byType.map(t => ({ type: t.type, count: t._count })),
        byDay: Object.entries(byDay).map(([date, counts]) => ({ date, ...counts })),
        byPersona,
        alerts,
        topGuestTrialOffers: guestTrialAnalytics.topGuestTrialOffers,
        topGuestTrialRoutes: guestTrialAnalytics.topGuestTrialRoutes,
        topReferralOffers: guestTrialAnalytics.topReferralOffers,
        topReferralLanes: guestTrialAnalytics.topReferralLanes,
        topReferralRoutes: guestTrialAnalytics.topReferralRoutes,
        topReferredGuestSources: guestTrialAnalytics.topReferredGuestSources,
        topReferredGuestRoutes: guestTrialAnalytics.topReferredGuestRoutes,
        recentLogs: guestTrialAnalytics.recentLogs,
      }
    }),

  // ── Member Outreach History ──
  getMemberOutreachHistory: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userId: z.string(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: { clubId: input.clubId, userId: input.userId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          type: true,
          channel: true,
          status: true,
          reasoning: true,
          createdAt: true,
        },
      })

      return { logs }
    }),

  // ── Variant Performance Analytics ──
  getVariantAnalytics: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      days: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const { getVariantAnalytics } = await import('@/lib/ai/variant-optimizer')
      return await getVariantAnalytics(ctx.prisma, input.clubId, undefined, input.days)
    }),

  // ── Sequence Chain Analytics ──
  getSequenceAnalytics: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const since = new Date(Date.now() - input.days * 86400000)

      // Sequence logs — limited to time window + max 500
      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: {
          clubId: input.clubId,
          sequenceStep: { not: null },
          createdAt: { gte: since },
        },
        select: {
          id: true,
          userId: true,
          type: true,
          status: true,
          sequenceStep: true,
          parentLogId: true,
          openedAt: true,
          clickedAt: true,
          bouncedAt: true,
          reasoning: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      })

      // Find root logs (step 0) and build chains
      const rootLogs = logs.filter(l => l.sequenceStep === 0)
      const childrenByParent = new Map<string, typeof logs>()
      for (const l of logs) {
        if (l.parentLogId) {
          const children = childrenByParent.get(l.parentLogId) || []
          children.push(l)
          childrenByParent.set(l.parentLogId, children)
        }
      }

      // Trace chains to find max step and status
      type ChainInfo = { userId: string; userName: string; type: string; maxStep: number; startedAt: Date; lastStepAt: Date; exited: boolean; exitReason?: string }
      const chains: ChainInfo[] = []

      for (const root of rootLogs) {
        let current = root
        let maxStep = 0
        let lastStepAt = root.createdAt
        let exited = false
        let exitReason: string | undefined

        // Walk the chain
        const visited = new Set<string>([root.id])
        let next = childrenByParent.get(current.id)?.[0]
        while (next && !visited.has(next.id)) {
          visited.add(next.id)
          maxStep = next.sequenceStep || 0
          lastStepAt = next.createdAt
          current = next
          next = childrenByParent.get(current.id)?.[0]
        }

        // Check if chain ended early
        const reasoning = (current.reasoning as any) || {}
        if (reasoning.sequenceExit) {
          exited = true
          exitReason = reasoning.sequenceExit
        } else if (current.bouncedAt) {
          exited = true
          exitReason = 'bounced'
        }

        const seqType = (root.reasoning as any)?.sequenceType || root.type
        chains.push({
          userId: root.userId,
          userName: root.user?.name || root.user?.email || 'Unknown',
          type: seqType,
          maxStep,
          startedAt: root.createdAt,
          lastStepAt,
          exited,
          exitReason,
        })
      }

      // Summary
      const activeChains = chains.filter(c => !c.exited && c.maxStep < 3)
      const completedChains = chains.filter(c => c.maxStep >= 3 || (c.exited && c.exitReason === 'max_steps'))
      const exitedChains = chains.filter(c => c.exited && c.exitReason !== 'max_steps')
      const avgSteps = chains.length > 0
        ? Math.round((chains.reduce((s, c) => s + c.maxStep, 0) / chains.length) * 10) / 10
        : 0

      // By type
      const typeGroups = ['WATCH', 'AT_RISK', 'CRITICAL']
      const byType = typeGroups.map(t => ({
        type: t,
        active: chains.filter(c => c.type === t && !c.exited && c.maxStep < 3).length,
        completed: chains.filter(c => c.type === t && (c.maxStep >= 3 || (c.exited && c.exitReason === 'max_steps'))).length,
        exited: chains.filter(c => c.type === t && c.exited && c.exitReason !== 'max_steps').length,
      }))

      // By step
      const byStep = [0, 1, 2, 3].map(step => {
        const stepLogs = logs.filter(l => l.sequenceStep === step)
        const opened = stepLogs.filter(l => l.openedAt).length
        return {
          step,
          count: stepLogs.length,
          openRate: stepLogs.length > 0 ? Math.round((opened / stepLogs.length) * 100) / 100 : 0,
        }
      })

      // Exit reasons
      const exitCounts = new Map<string, number>()
      for (const c of chains) {
        if (c.exited && c.exitReason) {
          exitCounts.set(c.exitReason, (exitCounts.get(c.exitReason) || 0) + 1)
        }
      }
      const EXIT_LABELS: Record<string, string> = {
        booked: 'Booked Session',
        health_improved: 'Health Improved',
        max_steps: 'Sequence Complete',
        opted_out: 'Opted Out',
        bounced: 'Bounced/Spam',
      }
      const exitReasons = Array.from(exitCounts.entries()).map(([reason, count]) => ({
        reason,
        count,
        label: EXIT_LABELS[reason] || reason,
      })).sort((a, b) => b.count - a.count)

      // Recent sequences (last 10 unique users)
      const seen = new Set<string>()
      const recentSequences = chains
        .sort((a, b) => b.lastStepAt.getTime() - a.lastStepAt.getTime())
        .filter(c => {
          if (seen.has(c.userId)) return false
          seen.add(c.userId)
          return true
        })
        .slice(0, 10)
        .map(c => ({
          userId: c.userId,
          userName: c.userName,
          type: c.type,
          currentStep: c.maxStep,
          startedAt: c.startedAt.toISOString(),
          lastStepAt: c.lastStepAt.toISOString(),
          status: c.exited ? (c.exitReason === 'max_steps' ? 'completed' : 'exited')
            : c.maxStep >= 3 ? 'completed' : 'active',
        }))

      return {
        summary: {
          activeSequences: activeChains.length,
          completedSequences: completedChains.length,
          exitedSequences: exitedChains.length,
          avgStepsCompleted: avgSteps,
        },
        byType,
        byStep,
        exitReasons,
        recentSequences,
      }
    }),

  // ── Weekly AI Summary ──
  getWeeklySummary: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const summary = await ctx.prisma.weeklySummary.findFirst({
        where: { clubId: input.clubId },
        orderBy: { weekStart: 'desc' },
      })

      if (!summary) {
        return { summary: null, weekStart: null, weekEnd: null, generatedAt: null, modelUsed: null }
      }

      return {
        summary: summary.summary,
        weekStart: summary.weekStart?.toISOString() ?? null,
        weekEnd: summary.weekEnd?.toISOString() ?? null,
        generatedAt: summary.generatedAt?.toISOString() ?? null,
        modelUsed: summary.modelUsed ?? null,
      }
    }),

  generateWeeklySummary: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      force: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const { generateAndStoreWeeklySummary } = await import('@/lib/ai/weekly-summary')
      const content = await generateAndStoreWeeklySummary(ctx.prisma, input.clubId, input.force)
      return { summary: content }
    }),

  // ── Member CSV Import ──
  importMembers: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      members: z.array(z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      })).min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const { randomUUID } = await import('crypto')
      let created = 0
      let alreadyExisted = 0
      let followersCreated = 0

      const userIds: string[] = []

      for (const member of input.members) {
        const email = member.email?.trim().toLowerCase()

        if (email) {
          // Upsert by email
          const user = await ctx.prisma.user.upsert({
            where: { email },
            create: {
              email,
              name: member.name.trim(),
              phone: member.phone?.trim() || null,
            },
            update: {
              name: member.name.trim(),
              ...(member.phone?.trim() ? { phone: member.phone.trim() } : {}),
            },
          })
          userIds.push(user.id)
          // Check if user was just created (no updatedAt would be close to createdAt)
          const isNew = Math.abs(user.createdAt.getTime() - user.updatedAt.getTime()) < 1000
          if (isNew) created++
          else alreadyExisted++
        } else {
          // No email — create with placeholder
          const placeholderEmail = `${randomUUID()}@imported.iqsport.ai`
          const user = await ctx.prisma.user.create({
            data: {
              email: placeholderEmail,
              name: member.name.trim(),
              phone: member.phone?.trim() || null,
            },
          })
          userIds.push(user.id)
          created++
        }
      }

      // Batch create ClubFollower records (skip duplicates)
      if (userIds.length > 0) {
        const result = await ctx.prisma.clubFollower.createMany({
          data: userIds.map(userId => ({
            clubId: input.clubId,
            userId,
          })),
          skipDuplicates: true,
        })
        followersCreated = result.count
      }

      // Re-match: link newly created users to existing PlaySession bookings by name
      const { rematchSessionBookings } = await import('@/lib/ai/session-importer')
      const rematchResult = await rematchSessionBookings(ctx.prisma, input.clubId)

      return {
        created,
        alreadyExisted,
        followersCreated,
        bookingsMatched: rematchResult.matched,
        totalProcessed: input.members.length,
      }
    }),

  // ══════════════════════════════════════════════════
  // ══════ NEW ANALYTICS ENDPOINTS (Tier 1) ═════════
  // ══════════════════════════════════════════════════

  // 1.1 Revenue Analytics
  getRevenueAnalytics: protectedProcedure
    .input(z.object({ clubId: z.string(), days: z.number().optional().default(30) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const now = new Date()
      const startDate = new Date(now)
      startDate.setDate(startDate.getDate() - input.days)
      const prevStart = new Date(startDate)
      prevStart.setDate(prevStart.getDate() - input.days)

      const sessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: startDate } },
        include: { bookings: true },
      })
      const prevSessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: prevStart, lt: startDate } },
        include: { bookings: true },
      })

      // Revenue by format
      const formatBuckets: Record<string, { revenue: number; sessions: number }> = {}
      sessions.forEach(s => {
        const rev = (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0)
        if (!formatBuckets[s.format]) formatBuckets[s.format] = { revenue: 0, sessions: 0 }
        formatBuckets[s.format].revenue += rev
        formatBuckets[s.format].sessions++
      })
      const totalRevenue = Object.values(formatBuckets).reduce((s, b) => s + b.revenue, 0)
      const revenueByFormat = Object.entries(formatBuckets)
        .sort(([, a], [, b]) => b.revenue - a.revenue)
        .map(([format, data]) => ({
          format,
          revenue: Math.round(data.revenue),
          sessions: data.sessions,
          pct: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
        }))

      // Daily revenue (last N days)
      const dailyRevenue: Array<{ date: string; revenue: number }> = []
      for (let d = 0; d < input.days; d++) {
        const dt = new Date(startDate)
        dt.setDate(dt.getDate() + d)
        const dateStr = dt.toISOString().slice(0, 10)
        const dayRev = sessions
          .filter(s => s.date.toISOString().slice(0, 10) === dateStr)
          .reduce((sum, s) => sum + (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0), 0)
        dailyRevenue.push({ date: dateStr, revenue: Math.round(dayRev) })
      }

      // Lost revenue
      const lostFromEmpty = sessions.reduce((sum, s) => {
        const empty = Math.max(0, s.maxPlayers - (s.registeredCount ?? 0))
        return sum + empty * (s.pricePerSlot ?? 0)
      }, 0)
      const cancelledBookings = sessions.reduce((sum, s) => {
        const cancelled = s.bookings.filter((b: any) => b.status === 'CANCELLED').length
        return sum + cancelled * (s.pricePerSlot ?? 0)
      }, 0)
      const noShows = sessions.reduce((sum, s) => {
        const ns = s.bookings.filter((b: any) => b.status === 'NO_SHOW').length
        return sum + ns * (s.pricePerSlot ?? 0)
      }, 0)

      // Period comparison
      const prevRevenue = prevSessions.reduce((sum, s) => sum + (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0), 0)
      const prevActiveMembers = new Set(prevSessions.flatMap(s => s.bookings.filter((b: any) => b.status === 'CONFIRMED').map((b: any) => b.userId))).size
      const activeMembers = new Set(sessions.flatMap(s => s.bookings.filter((b: any) => b.status === 'CONFIRMED').map((b: any) => b.userId))).size

      return {
        totalRevenue: Math.round(totalRevenue),
        prevTotalRevenue: Math.round(prevRevenue),
        revenueByFormat,
        dailyRevenue,
        lostRevenue: {
          emptySlots: Math.round(lostFromEmpty),
          cancelled: Math.round(cancelledBookings),
          noShows: Math.round(noShows),
          total: Math.round(lostFromEmpty + cancelledBookings + noShows),
        },
        activeMembers,
        prevActiveMembers,
        totalSessions: sessions.length,
        prevTotalSessions: prevSessions.length,
        avgOccupancy: sessions.length > 0
          ? Math.round(sessions.reduce((s, sess) => s + ((sess.registeredCount ?? 0) / Math.max(1, sess.maxPlayers)) * 100, 0) / sessions.length)
          : 0,
      }
    }),

  // 1.2 Campaign List (from AIRecommendationLog)
  getCampaignList: protectedProcedure
    .input(z.object({ clubId: z.string(), days: z.number().optional().default(90) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: { clubId: input.clubId, createdAt: { gte: since }, sequenceStep: 0 },
        select: {
          type: true, createdAt: true, channel: true,
          openedAt: true, clickedAt: true, respondedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2000, // cap to avoid loading entire history
      })

      // Group by type + date (day granularity) to form "campaigns"
      const campaignMap = new Map<string, any[]>()
      logs.forEach((log: any) => {
        const dateKey = log.createdAt.toISOString().slice(0, 10)
        const key = `${log.type}-${dateKey}`
        if (!campaignMap.has(key)) campaignMap.set(key, [])
        campaignMap.get(key)!.push(log)
      })

      const campaigns = Array.from(campaignMap.entries()).map(([key, entries]) => {
        const [type, date] = key.split('-', 2)
        const sent = entries.length
        const opened = entries.filter((e: any) => e.openedAt).length
        const clicked = entries.filter((e: any) => e.clickedAt).length
        const converted = entries.filter((e: any) => e.respondedAt).length
        const channels = Array.from(new Set(entries.map((e: any) => e.channel)))
        return {
          id: key,
          type,
          date,
          name: `${type === 'CHECK_IN' ? 'Friendly Check-in' : type === 'RETENTION_BOOST' ? 'Retention Boost' : type} — ${date}`,
          sent,
          opened,
          clicked,
          converted,
          openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          convRate: sent > 0 ? Math.round((converted / sent) * 100) : 0,
          channels,
          status: 'completed' as const,
        }
      })

      return { campaigns, totalCampaigns: campaigns.length }
    }),

  getCampaignDrilldown: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      type: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const dayStart = new Date(`${input.date}T00:00:00.000Z`)
      const dayEnd = new Date(dayStart.getTime() + 86400000)

      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: {
          clubId: input.clubId,
          type: input.type as any,
          createdAt: {
            gte: dayStart,
            lt: dayEnd,
          },
          sequenceStep: 0,
        },
        select: {
          id: true,
          userId: true,
          channel: true,
          status: true,
          variantId: true,
          reasoning: true,
          createdAt: true,
          openedAt: true,
          clickedAt: true,
          respondedAt: true,
          deliveredAt: true,
          bouncedAt: true,
          bounceType: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              membershipType: true,
              membershipStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      })

      const getOutcome = (log: typeof logs[number]) => {
        if (log.respondedAt) return 'booked'
        if (log.clickedAt) return 'clicked'
        if (log.openedAt) return 'opened'
        if (log.deliveredAt) return 'delivered'
        if (log.bouncedAt || log.status === 'bounced' || log.status === 'spam') return 'bounced'
        if (log.status === 'failed') return 'failed'
        if (log.status === 'pending') return 'pending'
        return 'sent'
      }

      const sent = logs.length
      const opened = logs.filter((log) => !!log.openedAt).length
      const clicked = logs.filter((log) => !!log.clickedAt).length
      const converted = logs.filter((log) => !!log.respondedAt).length
      const delivered = logs.filter((log) => !!log.deliveredAt).length
      const bounced = logs.filter((log) => !!log.bouncedAt || log.status === 'bounced' || log.status === 'spam').length
      const failed = logs.filter((log) => log.status === 'failed').length
      const pending = logs.filter((log) => log.status === 'pending').length

      const channelMap = new Map<string, { channel: string; sent: number; opened: number; clicked: number; converted: number; failed: number }>()
      const outcomeMap = new Map<string, number>()
      const sourceMap = new Map<string, number>()
      const variantMap = new Map<string, number>()
      const guestTrialOfferMap = new Map<string, {
        key: string
        label: string
        count: number
        stage: string | null
        destinationDescriptor: string | null
      }>()
      const guestTrialRouteMap = new Map<string, {
        key: string
        label: string
        count: number
        destinationType: string | null
      }>()
      const referralOfferMap = new Map<string, {
        key: string
        label: string
        count: number
        lane: string | null
        destinationDescriptor: string | null
      }>()
      const referralRouteMap = new Map<string, {
        key: string
        label: string
        count: number
        destinationType: string | null
      }>()
      const referredGuestSourceMap = new Map<string, {
        key: string
        label: string
        count: number
        lane: string | null
        destinationDescriptor: string | null
      }>()
      const referredGuestRouteMap = new Map<string, {
        key: string
        label: string
        count: number
        destinationType: string | null
      }>()

      for (const log of logs) {
        const channel = log.channel || 'unknown'
        const currentChannel = channelMap.get(channel) || {
          channel,
          sent: 0,
          opened: 0,
          clicked: 0,
          converted: 0,
          failed: 0,
        }
        currentChannel.sent += 1
        if (log.openedAt) currentChannel.opened += 1
        if (log.clickedAt) currentChannel.clicked += 1
        if (log.respondedAt) currentChannel.converted += 1
        if (log.status === 'failed' || log.status === 'bounced' || log.status === 'spam') currentChannel.failed += 1
        channelMap.set(channel, currentChannel)

        const outcome = getOutcome(log)
        outcomeMap.set(outcome, (outcomeMap.get(outcome) || 0) + 1)

        const reasoning = log.reasoning && typeof log.reasoning === 'object' && !Array.isArray(log.reasoning)
          ? log.reasoning as Record<string, unknown>
          : {}
        const source = typeof reasoning.source === 'string' ? reasoning.source : null
        if (source) sourceMap.set(source, (sourceMap.get(source) || 0) + 1)
        if (log.variantId) variantMap.set(log.variantId, (variantMap.get(log.variantId) || 0) + 1)

        const attribution = reasoning.guestTrialAttribution && typeof reasoning.guestTrialAttribution === 'object' && !Array.isArray(reasoning.guestTrialAttribution)
          ? reasoning.guestTrialAttribution as Record<string, unknown>
          : null
        const referralAttribution = reasoning.referralAttribution && typeof reasoning.referralAttribution === 'object' && !Array.isArray(reasoning.referralAttribution)
          ? reasoning.referralAttribution as Record<string, unknown>
          : null
        const offerKey = attribution && typeof attribution.offerKey === 'string' ? attribution.offerKey : null
        const offerName = attribution && typeof attribution.offerName === 'string' ? attribution.offerName : null
        const offerStage = attribution && typeof attribution.offerStage === 'string' ? attribution.offerStage : null
        const destinationDescriptor = attribution && typeof attribution.destinationDescriptor === 'string'
          ? attribution.destinationDescriptor
          : null
        const routeKey = attribution && typeof attribution.routeKey === 'string'
          ? attribution.routeKey
          : destinationDescriptor
        const destinationType = attribution && typeof attribution.destinationType === 'string'
          ? attribution.destinationType
          : null
        const referredGuestSource = attribution && attribution.referralSource && typeof attribution.referralSource === 'object' && !Array.isArray(attribution.referralSource)
          ? attribution.referralSource as Record<string, unknown>
          : null
        const referredGuestSourceOfferKey = referredGuestSource && typeof referredGuestSource.offerKey === 'string'
          ? referredGuestSource.offerKey
          : null
        const referredGuestSourceOfferName = referredGuestSource && typeof referredGuestSource.offerName === 'string'
          ? referredGuestSource.offerName
          : null
        const referredGuestSourceLane = referredGuestSource && typeof referredGuestSource.offerLane === 'string'
          ? referredGuestSource.offerLane
          : null
        const referredGuestSourceDestinationDescriptor = referredGuestSource && typeof referredGuestSource.destinationDescriptor === 'string'
          ? referredGuestSource.destinationDescriptor
          : null
        const referredGuestSourceRouteKey = referredGuestSource && typeof referredGuestSource.routeKey === 'string'
          ? referredGuestSource.routeKey
          : referredGuestSourceDestinationDescriptor
        const referredGuestSourceDestinationType = referredGuestSource && typeof referredGuestSource.destinationType === 'string'
          ? referredGuestSource.destinationType
          : null
        const referralOfferKey = referralAttribution && typeof referralAttribution.offerKey === 'string' ? referralAttribution.offerKey : null
        const referralOfferName = referralAttribution && typeof referralAttribution.offerName === 'string' ? referralAttribution.offerName : null
        const referralOfferLane = referralAttribution && typeof referralAttribution.offerLane === 'string' ? referralAttribution.offerLane : null
        const referralDestinationDescriptor = referralAttribution && typeof referralAttribution.destinationDescriptor === 'string'
          ? referralAttribution.destinationDescriptor
          : null
        const referralRouteKey = referralAttribution && typeof referralAttribution.routeKey === 'string'
          ? referralAttribution.routeKey
          : referralDestinationDescriptor
        const referralDestinationType = referralAttribution && typeof referralAttribution.destinationType === 'string'
          ? referralAttribution.destinationType
          : null

        if (offerKey && offerName) {
          const currentOffer = guestTrialOfferMap.get(offerKey) || {
            key: offerKey,
            label: offerName,
            count: 0,
            stage: offerStage,
            destinationDescriptor,
          }
          currentOffer.count += 1
          guestTrialOfferMap.set(offerKey, currentOffer)
        }

        if (routeKey && destinationDescriptor) {
          const currentRoute = guestTrialRouteMap.get(routeKey) || {
            key: routeKey,
            label: destinationDescriptor,
            count: 0,
            destinationType,
          }
          currentRoute.count += 1
          guestTrialRouteMap.set(routeKey, currentRoute)
        }

        if (referredGuestSourceOfferKey && referredGuestSourceOfferName) {
          const currentSource = referredGuestSourceMap.get(referredGuestSourceOfferKey) || {
            key: referredGuestSourceOfferKey,
            label: referredGuestSourceOfferName,
            count: 0,
            lane: referredGuestSourceLane,
            destinationDescriptor: referredGuestSourceDestinationDescriptor,
          }
          currentSource.count += 1
          referredGuestSourceMap.set(referredGuestSourceOfferKey, currentSource)
        }

        if (referredGuestSourceRouteKey && referredGuestSourceDestinationDescriptor) {
          const currentRoute = referredGuestRouteMap.get(referredGuestSourceRouteKey) || {
            key: referredGuestSourceRouteKey,
            label: referredGuestSourceDestinationDescriptor,
            count: 0,
            destinationType: referredGuestSourceDestinationType,
          }
          currentRoute.count += 1
          referredGuestRouteMap.set(referredGuestSourceRouteKey, currentRoute)
        }

        if (referralOfferKey && referralOfferName) {
          const currentOffer = referralOfferMap.get(referralOfferKey) || {
            key: referralOfferKey,
            label: referralOfferName,
            count: 0,
            lane: referralOfferLane,
            destinationDescriptor: referralDestinationDescriptor,
          }
          currentOffer.count += 1
          referralOfferMap.set(referralOfferKey, currentOffer)
        }

        if (referralRouteKey && referralDestinationDescriptor) {
          const currentRoute = referralRouteMap.get(referralRouteKey) || {
            key: referralRouteKey,
            label: referralDestinationDescriptor,
            count: 0,
            destinationType: referralDestinationType,
          }
          currentRoute.count += 1
          referralRouteMap.set(referralRouteKey, currentRoute)
        }
      }

      const channels = Array.from(channelMap.values()).sort((a, b) => b.sent - a.sent)
      const outcomes = Array.from(outcomeMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
      const topSources = Array.from(sourceMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      const topVariants = Array.from(variantMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      const topGuestTrialOffers = Array.from(guestTrialOfferMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      const topGuestTrialRoutes = Array.from(guestTrialRouteMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      const topReferralOffers = Array.from(referralOfferMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      const topReferralRoutes = Array.from(referralRouteMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      const topReferredGuestSources = Array.from(referredGuestSourceMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      const topReferredGuestRoutes = Array.from(referredGuestRouteMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)

      const recipients = logs.slice(0, 14).map((log) => {
        const reasoning = log.reasoning && typeof log.reasoning === 'object' && !Array.isArray(log.reasoning)
          ? log.reasoning as Record<string, unknown>
          : {}
        const attribution = reasoning.guestTrialAttribution && typeof reasoning.guestTrialAttribution === 'object' && !Array.isArray(reasoning.guestTrialAttribution)
          ? reasoning.guestTrialAttribution as Record<string, unknown>
          : null
        const referredGuestSource = attribution && attribution.referralSource && typeof attribution.referralSource === 'object' && !Array.isArray(attribution.referralSource)
          ? attribution.referralSource as Record<string, unknown>
          : null
        const referralAttribution = reasoning.referralAttribution && typeof reasoning.referralAttribution === 'object' && !Array.isArray(reasoning.referralAttribution)
          ? reasoning.referralAttribution as Record<string, unknown>
          : null
        return {
          id: log.id,
          userId: log.userId,
          name: log.user?.name || log.user?.email || 'Unknown member',
          email: log.user?.email || null,
          channel: log.channel || 'unknown',
          outcome: getOutcome(log),
          createdAt: log.createdAt,
          membershipType: log.user?.membershipType || null,
          membershipStatus: log.user?.membershipStatus || null,
          source: typeof reasoning.source === 'string' ? reasoning.source : null,
          variantId: log.variantId || null,
          guestTrialOfferName: attribution && typeof attribution.offerName === 'string' ? attribution.offerName : null,
          guestTrialOfferStage: attribution && typeof attribution.offerStage === 'string' ? attribution.offerStage : null,
          guestTrialDestinationDescriptor: attribution && typeof attribution.destinationDescriptor === 'string' ? attribution.destinationDescriptor : null,
          referredGuestSourceOfferName: referredGuestSource && typeof referredGuestSource.offerName === 'string' ? referredGuestSource.offerName : null,
          referredGuestSourceLane: referredGuestSource && typeof referredGuestSource.offerLane === 'string' ? referredGuestSource.offerLane : null,
          referredGuestSourceDestinationDescriptor: referredGuestSource && typeof referredGuestSource.destinationDescriptor === 'string' ? referredGuestSource.destinationDescriptor : null,
          referralOfferName: referralAttribution && typeof referralAttribution.offerName === 'string' ? referralAttribution.offerName : null,
          referralOfferLane: referralAttribution && typeof referralAttribution.offerLane === 'string' ? referralAttribution.offerLane : null,
          referralDestinationDescriptor: referralAttribution && typeof referralAttribution.destinationDescriptor === 'string' ? referralAttribution.destinationDescriptor : null,
        }
      })

      return {
        campaign: {
          id: `${input.type}-${input.date}`,
          type: input.type,
          date: input.date,
          name: `${input.type.replace(/_/g, ' ')} — ${input.date}`,
          sent,
          opened,
          clicked,
          converted,
          delivered,
          bounced,
          failed,
          pending,
        },
        channels,
        outcomes,
        topSources,
        topVariants,
        topGuestTrialOffers,
        topGuestTrialRoutes,
        topReferralOffers,
        topReferralRoutes,
        topReferredGuestSources,
        topReferredGuestRoutes,
        recipients,
      }
    }),

  // 1.3 Occupancy Heatmap
  getOccupancyHeatmap: protectedProcedure
    .input(z.object({ clubId: z.string(), days: z.number().optional().default(90) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const sessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: since }, startTime: { not: '00:00' } },
        select: { date: true, startTime: true, endTime: true, registeredCount: true, maxPlayers: true },
      })

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const timeSlots = ['6AM', '7AM', '8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM', '7PM', '8PM', '9PM', '10PM']
      const slotStartHours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]

      // Occupancy = avg(registeredCount / maxPlayers) per day × time slot
      const slotData: Record<string, { filled: number; capacity: number; count: number }> = {}
      days.forEach(d => { timeSlots.forEach(t => { slotData[`${d}-${t}`] = { filled: 0, capacity: 0, count: 0 } }) })

      sessions.forEach((s: any) => {
        const dayName = days[(s.date.getDay() + 6) % 7]
        const startH = parseInt(s.startTime?.split(':')[0] || '0')
        const endH = parseInt(s.endTime?.split(':')[0] || '0') || startH + 1

        // Fill ALL hours from start to end (e.g. 3PM-5PM fills 3PM and 4PM slots)
        for (let h = startH; h < endH && h < 23; h++) {
          let si = 0
          for (let i = slotStartHours.length - 1; i >= 0; i--) {
            if (h >= slotStartHours[i]) { si = i; break }
          }
          const key = `${dayName}-${timeSlots[si]}`
          if (slotData[key]) {
            slotData[key].filled += s.registeredCount || 0
            slotData[key].capacity += s.maxPlayers || 1
            slotData[key].count++
          }
        }
      })

      const heatmap = days.map(day => ({
        day,
        slots: timeSlots.map((time) => {
          const d = slotData[`${day}-${time}`]
          const value = d.capacity > 0 ? Math.round((d.filled / d.capacity) * 100) : 0
          return { time, value }
        }),
      }))

      return { heatmap, timeSlots, days }
    }),

  // 1.4 Member Growth
  getMemberGrowth: protectedProcedure
    .input(z.object({ clubId: z.string(), months: z.number().optional().default(6) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // Get snapshots grouped by month
      const since = new Date()
      since.setMonth(since.getMonth() - input.months)

      const snapshots = await ctx.prisma.memberHealthSnapshot.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, userId: true, riskLevel: true, lifecycleStage: true },
        orderBy: { date: 'asc' },
      })

      // Group by month
      const monthBuckets = new Map<string, { total: Set<string>; new: Set<string>; churned: Set<string> }>()
      snapshots.forEach((s: any) => {
        const month = s.date.toISOString().slice(0, 7) // YYYY-MM
        if (!monthBuckets.has(month)) monthBuckets.set(month, { total: new Set(), new: new Set(), churned: new Set() })
        const b = monthBuckets.get(month)!
        b.total.add(s.userId)
        if (s.lifecycleStage === 'onboarding') b.new.add(s.userId)
        if (s.riskLevel === 'critical' || s.lifecycleStage === 'churned') b.churned.add(s.userId)
      })

      const growth = Array.from(monthBuckets.entries()).map(([month, data]) => ({
        month,
        total: data.total.size,
        new: data.new.size,
        churned: data.churned.size,
      }))

      return { growth }
    }),

  // 1.5 Churn Trend
  getChurnTrend: protectedProcedure
    .input(z.object({ clubId: z.string(), months: z.number().optional().default(6) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setMonth(since.getMonth() - input.months)

      const snapshots = await ctx.prisma.memberHealthSnapshot.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, userId: true, riskLevel: true },
        orderBy: { date: 'asc' },
      })

      const monthBuckets = new Map<string, { atRisk: Set<string>; churned: Set<string>; reactivated: Set<string> }>()
      snapshots.forEach((s: any) => {
        const month = s.date.toISOString().slice(0, 7)
        if (!monthBuckets.has(month)) monthBuckets.set(month, { atRisk: new Set(), churned: new Set(), reactivated: new Set() })
        const b = monthBuckets.get(month)!
        if (s.riskLevel === 'at_risk') b.atRisk.add(s.userId)
        if (s.riskLevel === 'critical') b.churned.add(s.userId)
        if (s.riskLevel === 'healthy') b.reactivated.add(s.userId) // simplified: healthy after being tracked
      })

      const trend = Array.from(monthBuckets.entries()).map(([month, data]) => ({
        month,
        atRisk: data.atRisk.size,
        churned: data.churned.size,
        reactivated: data.reactivated.size,
      }))

      return { trend }
    }),

  // 1.6 Events List
  getEventsList: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // Events = sessions with specific formats (SOCIAL, LEAGUE_PLAY) or one-off sessions
      const sessions = await ctx.prisma.playSession.findMany({
        where: {
          clubId: input.clubId,
          format: { in: ['SOCIAL', 'LEAGUE_PLAY'] },
        },
        include: { bookings: true },
        orderBy: { date: 'desc' },
        take: 50,
      })

      const events = sessions.map((s: any) => ({
        id: s.id,
        name: s.title || `${s.format} — ${s.date.toISOString().slice(0, 10)}`,
        type: s.format,
        date: s.date.toISOString().slice(0, 10),
        startTime: s.startTime,
        endTime: s.endTime,
        court: s.courtId || 'TBD',
        registered: (s.registeredCount ?? 0),
        capacity: s.maxPlayers,
        revenue: (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0),
        status: s.status,
      }))

      // Revenue by month
      const monthRevenue = new Map<string, { revenue: number; events: number }>()
      sessions.forEach((s: any) => {
        const month = s.date.toISOString().slice(0, 7)
        if (!monthRevenue.has(month)) monthRevenue.set(month, { revenue: 0, events: 0 })
        const b = monthRevenue.get(month)!
        b.revenue += (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0)
        b.events++
      })
      const eventRevenue = Array.from(monthRevenue.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, revenue: Math.round(data.revenue), events: data.events }))

      return { events, eventRevenue, totalEvents: events.length }
    }),

  // 1.7 Upload History
  getUploadHistory: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const embeddings = await ctx.prisma.documentEmbedding.findMany({
        where: { clubId: input.clubId, contentType: { notIn: ['member', 'member_pattern', 'booking_trend', 'club_info'] } },
        select: { id: true, contentType: true, createdAt: true, sourceId: true, sourceTable: true, metadata: true },
        orderBy: { createdAt: 'desc' },
      })

      // Group by importBatchId (reliable) with fallback to time-based grouping (legacy)
      const batchMap = new Map<string, typeof embeddings>()
      const orphans: typeof embeddings = []

      for (const e of embeddings) {
        const meta = (e.metadata && typeof e.metadata === 'object') ? (e.metadata as Record<string, unknown>) : {}
        const batchId = meta.importBatchId as string | undefined
        if (batchId) {
          if (!batchMap.has(batchId)) batchMap.set(batchId, [])
          batchMap.get(batchId)!.push(e)
        } else {
          orphans.push(e)
        }
      }

      // Group orphans (legacy imports without batchId) by 5-min windows
      const sortedOrphans = [...orphans].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      for (const e of sortedOrphans) {
        let added = false
        const keys = Array.from(batchMap.keys())
        for (const key of keys) {
          if (key.startsWith('legacy-')) {
            const entries = batchMap.get(key)!
            const lastEntry = entries[entries.length - 1]
            if (Math.abs(e.createdAt.getTime() - lastEntry.createdAt.getTime()) < 5 * 60 * 1000) {
              entries.push(e)
              added = true
              break
            }
          }
        }
        if (!added) {
          const legacyKey = `legacy-${e.createdAt.getTime()}`
          batchMap.set(legacyKey, [e])
        }
      }

      const batchEntries: Array<[string, typeof embeddings]> = []
      batchMap.forEach((v, k) => batchEntries.push([k, v]))

      const uploads = batchEntries
        .map(([batchId, entries]) => {
          const sourceIds = entries.filter(e => e.sourceId).map(e => e.sourceId!)
          const dates = entries.map(e => e.createdAt.getTime())
          // Use marker metadata for accurate counts (Excel imports store membersImported + sessionsImported)
          const markerEntry = entries.find(e => e.contentType === 'import_marker') || entries[0]
          const meta = markerEntry.metadata as Record<string, unknown> | null
          const fileName = (meta?.sourceFileName as string) || null
          const membersImported = typeof meta?.membersImported === 'number' ? meta.membersImported : null
          const sessionsImported = typeof meta?.sessionsImported === 'number' ? meta.sessionsImported : null
          const membersAttempted = typeof meta?.membersAttempted === 'number' ? meta.membersAttempted : null
          const sessionsAttempted = typeof meta?.sessionsAttempted === 'number' ? meta.sessionsAttempted : null
          // Fallback: count non-marker session embeddings
          const sessionEntries = entries.filter(e => e.sourceTable === 'play_sessions' && e.contentType !== 'import_marker')
          const recordsFallback = sessionEntries.length || entries.filter(e => e.contentType !== 'import_marker').length || entries.length

          return {
            id: batchId,
            date: new Date(Math.min(...dates)).toISOString(),
            dateEnd: new Date(Math.max(...dates)).toISOString(),
            records: sessionsImported ?? recordsFallback,
            membersImported,
            sessionsImported,
            membersAttempted,
            sessionsAttempted,
            contentType: markerEntry.contentType,
            source: fileName || 'CSV Import',
            embeddingIds: entries.map(e => e.id),
            sessionSourceIds: Array.from(new Set(sourceIds)),
            importBatchId: batchId.startsWith('legacy-') ? null : batchId,
          }
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      return { uploads, totalUploads: uploads.length }
    }),

  deleteImport: protectedProcedure
    .input(z.object({
      clubId: z.string(),
      embeddingIds: z.array(z.string()),
      sessionSourceIds: z.array(z.string()),
      importBatchId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      let sessionsDeleted = 0
      let bookingsDeleted = 0
      let embeddingsDeleted = 0
      let healthDeleted = 0
      let followersDeleted = 0
      let aiRecsDeleted = 0

      // 1. Delete AI recommendation logs
      try {
        const arResult = await ctx.prisma.$executeRaw`
          DELETE FROM ai_recommendation_logs WHERE "clubId" = ${input.clubId}        `
        aiRecsDeleted = typeof arResult === 'number' ? arResult : 0
      } catch (err) {
        log.warn('[Delete Import] ai_recommendation_logs cleanup failed:', err)
      }

      // 2. Delete health snapshots
      const hResult = await ctx.prisma.$executeRaw`
        DELETE FROM member_health_snapshots WHERE club_id = ${input.clubId}      `
      healthDeleted = typeof hResult === 'number' ? hResult : 0

      // 3. Delete bookings for all sessions of this club
      const bResult = await ctx.prisma.$executeRaw`
        DELETE FROM play_session_bookings WHERE "sessionId" IN (
          SELECT id FROM play_sessions WHERE "clubId" = ${input.clubId}        )
      `
      bookingsDeleted = typeof bResult === 'number' ? bResult : 0

      // 4. Delete all play sessions for this club
      const sResult = await ctx.prisma.$executeRaw`
        DELETE FROM play_sessions WHERE "clubId" = ${input.clubId}      `
      sessionsDeleted = typeof sResult === 'number' ? sResult : 0

      // 5. Delete ALL document_embeddings for this club (not just one batch)
      const eResult = await ctx.prisma.$executeRaw`
        DELETE FROM document_embeddings WHERE club_id = ${input.clubId}      `
      embeddingsDeleted = typeof eResult === 'number' ? eResult : 0

      // 6. Delete placeholder users created during import (email like %@placeholder.iqsport.ai)
      try {
        const fResult = await ctx.prisma.$executeRaw`
          DELETE FROM club_followers
          WHERE club_id = ${input.clubId}            AND user_id IN (SELECT id FROM users WHERE email LIKE '%@placeholder.iqsport.ai')
        `
        followersDeleted = typeof fResult === 'number' ? fResult : 0
      } catch (err) {
        log.warn('[Delete Import] placeholder followers cleanup failed:', err)
      }

      // 7. Delete AI conversations and messages (reset AI advisor history)
      try {
        await ctx.prisma.$executeRaw`
          DELETE FROM ai_messages WHERE conversation_id IN (
            SELECT id FROM ai_conversations WHERE club_id = ${input.clubId}          )
        `
        await ctx.prisma.$executeRaw`
          DELETE FROM ai_conversations WHERE club_id = ${input.clubId}        `
      } catch (err) {
        log.warn('[Delete Import] AI conversations cleanup failed:', err)
      }

      log.info(`[Delete Import] Club ${input.clubId}: ${embeddingsDeleted} embeddings, ${sessionsDeleted} sessions, ${bookingsDeleted} bookings, ${healthDeleted} health, ${followersDeleted} placeholder users, ${aiRecsDeleted} ai recs deleted`)

      return { sessionsDeleted, bookingsDeleted, embeddingsDeleted, healthDeleted, followersDeleted, remainingEmbeddings: 0 }
    }),

  // 2.1 Pricing Opportunities (demand-based price suggestions)
  getPricingOpportunities: protectedProcedure
    .input(z.object({ clubId: z.string(), days: z.number().optional().default(90) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const sessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, startTime: true, maxPlayers: true, registeredCount: true, pricePerSlot: true },
      })

      // Group by day × time slot
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const slots: Record<string, { occSum: number; priceSum: number; regSum: number; count: number }> = {}

      sessions.forEach((s: any) => {
        const dayIdx = s.date.getDay()
        const dayName = days[(dayIdx + 6) % 7]
        const hour = parseInt(s.startTime?.split(':')[0] || '0')
        const timeLabel = hour < 12 ? (hour < 9 ? 'Morning' : 'Late Morning') : (hour < 17 ? 'Afternoon' : 'Evening')
        const key = `${dayName} ${timeLabel}`
        if (!slots[key]) slots[key] = { occSum: 0, priceSum: 0, regSum: 0, count: 0 }
        const occ = s.maxPlayers > 0 ? ((s.registeredCount ?? 0) / s.maxPlayers) * 100 : 0
        slots[key].occSum += occ
        slots[key].priceSum += (s.pricePerSlot ?? 0)
        slots[key].regSum += (s.registeredCount ?? 0)
        slots[key].count++
      })

      const opportunities = Object.entries(slots)
        .map(([slot, data]) => {
          const avgOcc = Math.round(data.occSum / data.count)
          const avgPrice = Math.round(data.priceSum / data.count)
          const avgReg = Math.round(data.regSum / data.count)
          if (avgPrice === 0) return null

          // Price elasticity formula
          const priceMultiplier = 1 + (avgOcc - 60) / 100
          const suggested = Math.max(5, Math.round(avgPrice * priceMultiplier))
          const diff = suggested - avgPrice
          if (Math.abs(diff) < 2) return null // not worth suggesting

          const impact = diff * avgReg * 4 // monthly estimate
          const demand = avgOcc > 80 ? 'Very High' : avgOcc > 60 ? 'High' : avgOcc > 40 ? 'Medium' : 'Low'
          const confidence = Math.min(95, avgOcc + 10)

          return { slot, current: avgPrice, suggested, demand, impact: `${impact > 0 ? '+' : ''}$${Math.abs(impact)}/mo`, confidence }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => Math.abs(parseInt(b.impact.replace(/[^0-9-]/g, ''))) - Math.abs(parseInt(a.impact.replace(/[^0-9-]/g, ''))))
        .slice(0, 4)

      return { opportunities }
    }),

  // 2.2 Revenue Forecast (weighted moving average)
  getRevenueForecast: protectedProcedure
    .input(z.object({ clubId: z.string(), monthsBack: z.number().optional().default(6), monthsForward: z.number().optional().default(3) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setMonth(since.getMonth() - input.monthsBack)

      const sessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, pricePerSlot: true, registeredCount: true },
      })

      if (sessions.length === 0) {
        return { actual: [], forecast: [], summary: null }
      }

      // Calculate fallback price from non-null sessions
      const nonNullPrices = sessions
        .filter((s: any) => s.pricePerSlot != null && s.pricePerSlot > 0)
        .map((s: any) => s.pricePerSlot as number)
      const avgPriceFromSessions = nonNullPrices.length > 0
        ? nonNullPrices.reduce((sum, p) => sum + p, 0) / nonNullPrices.length
        : null

      // If no session has a price, try club settings (automationSettings.intelligence.avgSessionPriceCents)
      let fallbackPrice = avgPriceFromSessions
      if (fallbackPrice == null) {
        const club: any = await ctx.prisma.club.findUnique({ where: { id: input.clubId } })
        const avgCents = club?.automationSettings?.intelligence?.avgSessionPriceCents
        fallbackPrice = avgCents != null ? avgCents / 100 : 15 // default $15 as last resort
      }

      // Aggregate monthly revenue using fallback for null pricePerSlot
      const monthlyRevenue = new Map<string, number>()
      const monthlySessionCount = new Map<string, number>()
      sessions.forEach((s: any) => {
        const month = s.date.toISOString().slice(0, 7)
        const price = (s.pricePerSlot != null && s.pricePerSlot > 0) ? s.pricePerSlot : fallbackPrice!
        const registered = s.registeredCount ?? 0
        monthlyRevenue.set(month, (monthlyRevenue.get(month) || 0) + price * registered)
        monthlySessionCount.set(month, (monthlySessionCount.get(month) || 0) + 1)
      })

      const sortedMonths = Array.from(monthlyRevenue.entries()).sort(([a], [b]) => a.localeCompare(b))
      if (sortedMonths.length < 1) {
        return { actual: [], forecast: [], summary: null }
      }

      const ys = sortedMonths.map(([, rev]) => rev)

      // Actual months
      const actual = sortedMonths.map(([month, rev]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        actual: Math.round(rev),
      }))

      // If only 1 month of data, return actuals with flat forecast
      if (sortedMonths.length < 2) {
        const lastRev = ys[0]
        const lastDate = new Date(sortedMonths[0][0] + '-01')
        const forecast: Array<{ month: string; forecast: number; low: number; high: number }> = []
        for (let m = 1; m <= input.monthsForward; m++) {
          const futureDate = new Date(lastDate)
          futureDate.setMonth(futureDate.getMonth() + m)
          forecast.push({
            month: futureDate.toLocaleDateString('en-US', { month: 'short' }),
            forecast: Math.round(lastRev),
            low: Math.round(lastRev * 0.75),
            high: Math.round(lastRev * 1.25),
          })
        }
        return {
          actual,
          forecast,
          summary: `Based on 1 month of data, forecast is estimated at $${Math.round(lastRev).toLocaleString()}/mo. More data will improve accuracy.`,
        }
      }

      // Calculate month-over-month growth rates
      const momGrowth: number[] = []
      for (let i = 1; i < ys.length; i++) {
        if (ys[i - 1] > 0) {
          momGrowth.push((ys[i] - ys[i - 1]) / ys[i - 1])
        }
      }

      // Weighted growth rate: recent months weighted more heavily (exponential)
      let weightedGrowthRate = 0
      if (momGrowth.length > 0) {
        const recentCount = Math.min(3, momGrowth.length)
        const recentGrowth = momGrowth.slice(-recentCount)
        let totalWeight = 0
        let weightedSum = 0
        recentGrowth.forEach((g, i) => {
          const weight = Math.pow(2, i) // exponential: 1, 2, 4
          weightedSum += g * weight
          totalWeight += weight
        })
        weightedGrowthRate = weightedSum / totalWeight
      }

      // Clamp growth rate to prevent wild forecasts
      weightedGrowthRate = Math.max(-0.3, Math.min(0.5, weightedGrowthRate))

      // Calculate standard deviation of monthly revenue for confidence bands
      const mean = ys.reduce((s, y) => s + y, 0) / ys.length
      const variance = ys.reduce((s, y) => s + Math.pow(y - mean, 2), 0) / ys.length
      const stddev = Math.sqrt(variance)

      // Forecast months using weighted moving average growth
      const forecast: Array<{ month: string; forecast: number; low: number; high: number }> = []
      const lastDate = new Date(sortedMonths[sortedMonths.length - 1][0] + '-01')
      let lastRev = ys[ys.length - 1]

      for (let m = 1; m <= input.monthsForward; m++) {
        const futureDate = new Date(lastDate)
        futureDate.setMonth(futureDate.getMonth() + m)
        const predicted = Math.max(0, Math.round(lastRev * (1 + weightedGrowthRate)))

        // Confidence bands: stddev * multiplier that grows with forecast horizon
        const bandMultiplier = m === 1 ? 1.5 : m === 2 ? 2.0 : 2.5
        const band = stddev * bandMultiplier

        forecast.push({
          month: futureDate.toLocaleDateString('en-US', { month: 'short' }),
          forecast: predicted,
          low: Math.max(0, Math.round(predicted - band)),
          high: Math.round(predicted + band),
        })
        lastRev = predicted
      }

      // Build summary text
      const lastActual = ys[ys.length - 1]
      const finalForecast = forecast[forecast.length - 1]
      const finalMonth = finalForecast.month
      const growthPct = Math.round(weightedGrowthRate * 100)
      const growthDir = growthPct >= 0 ? 'growth' : 'decline'
      const pricingUplift = Math.round(lastActual * 0.12) // estimate 12% uplift from pricing optimization
      const optimizedForecast = finalForecast.forecast + pricingUplift * input.monthsForward

      let summary: string
      if (Math.abs(growthPct) < 2) {
        summary = `Revenue is holding steady at ~$${Math.round(lastActual).toLocaleString()}/mo. You're projected to stay around $${finalForecast.forecast.toLocaleString()} by ${finalMonth}. Implementing pricing suggestions could push this to $${optimizedForecast.toLocaleString()}.`
      } else {
        summary = `Based on ${Math.abs(growthPct)}% monthly ${growthDir}, you're projected to hit $${finalForecast.forecast.toLocaleString()} by ${finalMonth}. Implementing pricing suggestions could push this to $${optimizedForecast.toLocaleString()}.`
      }

      return { actual, forecast, summary }
    }),

  // ── Member AI Profiles ──

  getMemberAiProfiles: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userIds: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where: any = { clubId: input.clubId }
      if (input.userIds?.length) where.userId = { in: input.userIds }
      const profiles = await ctx.prisma.memberAiProfile.findMany({
        where,
        orderBy: { riskScore: 'asc' },
      })
      return profiles
    }),

  getMemberAiProfile: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.memberAiProfile.findUnique({
        where: { userId_clubId: { userId: input.userId, clubId: input.clubId } },
      })
    }),

  regenerateMemberProfiles: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      forceRegenerate: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await checkFeatureAccess(input.clubId, 'reactivation')
      // Fire-and-forget in background
      generateMemberProfilesForClub(ctx.prisma, input.clubId, {
        forceRegenerate: input.forceRegenerate,
        batchSize: 10,
        delayMs: 300,
      }).catch(err => log.error('[tRPC] regenerateMemberProfiles failed:', err))
      return { status: 'started' }
    }),

  regenerateSingleMemberProfile: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { name: true },
      })
      const profile = await generateSingleMemberProfile(
        ctx.prisma, input.userId, input.clubId, club?.name || 'Your Club'
      )
      return profile
    }),

  // ── Session Interest Requests ──

  submitInterestRequest: publicProcedure
    .input(z.object({
      token: z.string(),
      preferredDays: z.array(z.string()),
      preferredFormats: z.array(z.string()),
      preferredTimeSlots: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { verifyInterestToken } = await import('@/lib/utils/interest-token')
      const decoded = verifyInterestToken(input.token)
      if (!decoded) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired link' })
      const { userId, clubId } = decoded
      await ctx.prisma.sessionInterestRequest.upsert({
        where: { userId_clubId: { userId, clubId } },
        create: {
          userId, clubId,
          preferredDays: input.preferredDays,
          preferredFormats: input.preferredFormats,
          preferredTimeSlots: input.preferredTimeSlots,
          token: input.token,
          status: 'pending',
        },
        update: {
          preferredDays: input.preferredDays,
          preferredFormats: input.preferredFormats,
          preferredTimeSlots: input.preferredTimeSlots,
          token: input.token,
          status: 'pending',
          notifiedAt: null,
        },
      })
      return { success: true }
    }),

  getInterestRequests: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const where: any = { clubId: input.clubId }
      if (input.status) where.status = input.status
      const requests = await ctx.prisma.sessionInterestRequest.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return requests
    }),

  notifyInterestedMembers: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userIds: z.array(z.string()),
      sessionId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const result = await ctx.prisma.sessionInterestRequest.updateMany({
        where: { clubId: input.clubId, userId: { in: input.userIds } },
        data: {
          status: 'notified',
          notifiedAt: new Date(),
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        },
      })
      return { updated: result.count }
    }),

  // ── Generate a Notify-Me link for a specific member ──
  generateNotifyMeLink: protectedProcedure
    .input(z.object({
      userId: z.string(),
      clubId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const { generateInterestToken } = await import('@/lib/utils/interest-token')
      const token = generateInterestToken(input.userId, input.clubId)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://iqsport.ai'
      return { url: `${baseUrl}/notify-me?t=${token}` }
    }),

  // ── AI Insights: SQL-based club insights ──
  getClubInsights: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const insights = await generateClubInsights(ctx.prisma, input.clubId)
      return insights
    }),

  // ── Session players: load registered players for a session ──
  getSessionPlayers: protectedProcedure
    .input(z.object({ sessionId: z.string(), clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const bookings = await ctx.prisma.playSessionBooking.findMany({
        where: { sessionId: input.sessionId, status: 'CONFIRMED' },
        select: { userId: true, user: { select: { id: true, name: true, image: true } } },
      })
      return { players: bookings.map((b: any) => ({ id: b.userId, name: b.user?.name || 'Unknown', image: b.user?.image })) }
    }),

  // ── Player Profile: full player analytics ──
  getFrequentPartners: protectedProcedure
    .input(z.object({ userId: z.string(), clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const partners = await ctx.prisma.$queryRaw<Array<{
        id: string; name: string; email: string; gender: string | null;
        shared_sessions: bigint; last_played_together: Date; favorite_format: string | null;
      }>>`
        SELECT
          u.id, u.name, u.email, u.gender,
          COUNT(DISTINCT b2."sessionId")::bigint as shared_sessions,
          MAX(ps.date) as last_played_together,
          MODE() WITHIN GROUP (ORDER BY ps.format) as favorite_format
        FROM play_session_bookings b1
        JOIN play_session_bookings b2 ON b1."sessionId" = b2."sessionId" AND b1."userId" != b2."userId"
        JOIN play_sessions ps ON ps.id = b1."sessionId"
        JOIN users u ON u.id = b2."userId"
        WHERE b1."userId" = ${input.userId}
          AND ps."clubId" = ${input.clubId}
          AND b1.status = 'CONFIRMED'
          AND b2.status = 'CONFIRMED'
        GROUP BY u.id, u.name, u.email, u.gender
        HAVING COUNT(DISTINCT b2."sessionId") >= 2
        ORDER BY shared_sessions DESC
        LIMIT 10
      `
      return partners.map(p => ({
        ...p,
        shared_sessions: Number(p.shared_sessions),
        last_played_together: p.last_played_together?.toISOString().split('T')[0] || null,
      }))
    }),

  getPlayerProfile: protectedProcedure
    .input(z.object({ userId: z.string(), clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const { userId, clubId } = input
      const db = ctx.prisma

      const [
        playerRows,
        weeklyRows,
        formatRows,
        timeRows,
        dayRows,
        courtRows,
        recentRows,
        gapRows,
      ] = await Promise.all([
        // 1. Player info
        db.$queryRawUnsafe<any[]>(`
          SELECT u.id, u.name, u.email, u.image,
            cf.created_at as "memberSince",
            (SELECT MAX(ps.date) FROM play_session_bookings b2
              JOIN play_sessions ps ON ps.id = b2."sessionId"
              WHERE b2."userId"::text = $1 AND ps."clubId"::text = $2              AND b2.status::text = 'CONFIRMED') as "lastPlayed",
            (SELECT COUNT(*)::int FROM play_session_bookings b3
              JOIN play_sessions ps2 ON ps2.id = b3."sessionId"
              WHERE b3."userId"::text = $1 AND ps2."clubId"::text = $2              AND b3.status::text = 'CONFIRMED') as "totalSessions",
            (SELECT mhs.health_score FROM member_health_snapshots mhs
              WHERE mhs.user_id::text = $1 AND mhs.club_id::text = $2              ORDER BY mhs.date DESC LIMIT 1) as "healthScore"
          FROM users u
          LEFT JOIN club_followers cf ON cf.user_id::text = u.id::text AND cf.club_id::text = $2          WHERE u.id::text = $1
          LIMIT 1
        `, userId, clubId),

        // 2. Sessions per week (last 12 weeks / 90 days)
        db.$queryRawUnsafe<any[]>(`
          SELECT DATE_TRUNC('week', ps.date)::date as week, COUNT(*)::int as count
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          WHERE b."userId"::text = $1 AND ps."clubId"::text = $2            AND b.status::text = 'CONFIRMED'
            AND ps.date >= NOW() - INTERVAL '90 days'
          GROUP BY week ORDER BY week
        `, userId, clubId),

        // 3. Top formats
        db.$queryRawUnsafe<any[]>(`
          SELECT ps.format::text as format, COUNT(*)::int as count
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          WHERE b."userId"::text = $1 AND ps."clubId"::text = $2            AND b.status::text = 'CONFIRMED'
          GROUP BY ps.format ORDER BY count DESC LIMIT 3
        `, userId, clubId),

        // 4. Top times (startTime is a text column like "08:00")
        db.$queryRawUnsafe<any[]>(`
          SELECT SPLIT_PART(ps."startTime", ':', 1)::int as hour, COUNT(*)::int as count
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          WHERE b."userId"::text = $1 AND ps."clubId"::text = $2            AND b.status::text = 'CONFIRMED'
          GROUP BY hour ORDER BY count DESC LIMIT 3
        `, userId, clubId),

        // 5. Top days of week
        db.$queryRawUnsafe<any[]>(`
          SELECT TRIM(TO_CHAR(ps.date, 'Day')) as day, COUNT(*)::int as count
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          WHERE b."userId"::text = $1 AND ps."clubId"::text = $2            AND b.status::text = 'CONFIRMED'
          GROUP BY day ORDER BY count DESC LIMIT 3
        `, userId, clubId),

        // 6. Top courts
        db.$queryRawUnsafe<any[]>(`
          SELECT cc.name as court, COUNT(*)::int as count
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          LEFT JOIN club_courts cc ON cc.id = ps."courtId"
          WHERE b."userId"::text = $1 AND ps."clubId"::text = $2            AND b.status::text = 'CONFIRMED'
            AND cc.name IS NOT NULL
          GROUP BY cc.name ORDER BY count DESC LIMIT 3
        `, userId, clubId),

        // 7. Recent sessions (last 10)
        db.$queryRawUnsafe<any[]>(`
          SELECT ps.date::text, ps.format::text as format,
            COALESCE(cc.name, 'N/A') as court,
            ps."startTime",
            ps."endTime",
            COALESCE(ps."skillLevel"::text, '') as "skillLevel"
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          LEFT JOIN club_courts cc ON cc.id = ps."courtId"
          WHERE b."userId"::text = $1 AND ps."clubId"::text = $2            AND b.status::text = 'CONFIRMED'
          ORDER BY ps.date DESC, ps."startTime" DESC
          LIMIT 10
        `, userId, clubId),

        // 8. Session dates for gap calculation
        db.$queryRawUnsafe<any[]>(`
          SELECT ps.date::date as d
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          WHERE b."userId"::text = $1 AND ps."clubId"::text = $2            AND b.status::text = 'CONFIRMED'
          ORDER BY ps.date DESC
        `, userId, clubId),
      ])

      const player = playerRows[0] || { id: userId, name: 'Unknown', email: '', image: null, memberSince: null, lastPlayed: null, totalSessions: 0, healthScore: null }

      // Activity trend: compare last 4 weeks vs prior 4
      const now = new Date()
      const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000)
      const eightWeeksAgo = new Date(now.getTime() - 56 * 86400000)
      const recent4 = weeklyRows.filter((w: any) => new Date(w.week) >= fourWeeksAgo).reduce((s: number, w: any) => s + w.count, 0)
      const prior4 = weeklyRows.filter((w: any) => new Date(w.week) >= eightWeeksAgo && new Date(w.week) < fourWeeksAgo).reduce((s: number, w: any) => s + w.count, 0)
      const trend = prior4 === 0 ? 'stable' as const : recent4 > prior4 * 1.2 ? 'increasing' as const : recent4 < prior4 * 0.8 ? 'declining' as const : 'stable' as const

      // Risk calculation
      const dates = gapRows.map((r: any) => new Date(r.d).getTime())
      let avgGapDays = 0
      if (dates.length > 1) {
        const gaps: number[] = []
        for (let i = 0; i < dates.length - 1; i++) gaps.push((dates[i] - dates[i + 1]) / 86400000)
        avgGapDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
      }
      const currentGapDays = dates.length > 0 ? Math.round((Date.now() - dates[0]) / 86400000) : 0
      const frequencyChange = prior4 === 0 ? 0 : Math.round(((recent4 - prior4) / prior4) * 100)
      const riskLevel = currentGapDays > avgGapDays * 2.5 || frequencyChange < -50 ? 'high' as const : currentGapDays > avgGapDays * 1.5 || frequencyChange < -25 ? 'medium' as const : 'low' as const

      return {
        player: {
          id: player.id,
          name: player.name,
          email: player.email,
          image: player.image,
          memberSince: player.memberSince ? new Date(player.memberSince).toISOString() : null,
          lastPlayed: player.lastPlayed ? new Date(player.lastPlayed).toISOString() : null,
          totalSessions: player.totalSessions || 0,
          healthScore: player.healthScore ?? null,
        },
        activity: {
          sessionsPerWeek: weeklyRows.map((w: any) => ({ week: new Date(w.week).toISOString().slice(0, 10), count: w.count })),
          trend,
        },
        patterns: {
          topFormats: formatRows.map((r: any) => ({ format: r.format || 'Unknown', count: r.count })),
          topTimes: timeRows.map((r: any) => ({ hour: r.hour, count: r.count })),
          topDays: dayRows.map((r: any) => ({ day: r.day, count: r.count })),
          topCourts: courtRows.map((r: any) => ({ court: r.court, count: r.count })),
        },
        risk: { level: riskLevel, avgGapDays, currentGapDays, frequencyChange },
        recentSessions: recentRows.map((r: any) => ({
          date: r.date, format: r.format, court: r.court,
          startTime: r.startTime, endTime: r.endTime, skillLevel: r.skillLevel,
        })),
      }
    }),

  // ── Underfilled Sessions (next N days, <80% occupancy) ──
  getUnderfilledSessions: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), days: z.number().default(14) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const sessions = await ctx.prisma.$queryRawUnsafe<any[]>(`
        SELECT ps.id, ps.title, ps.date::text, ps."startTime", ps."endTime",
          ps."maxPlayers", ps.format::text as format,
          COALESCE(ps."skillLevel"::text, 'ALL_LEVELS') as "skillLevel",
          COALESCE(cc.name, '') as court,
          (SELECT COUNT(*)::int FROM play_session_bookings b
            WHERE b."sessionId" = ps.id AND b.status::text = 'CONFIRMED') as registered
        FROM play_sessions ps
        LEFT JOIN club_courts cc ON cc.id = ps."courtId"
        WHERE ps."clubId" = $1          AND ps.date >= CURRENT_DATE
          AND ps.date <= CURRENT_DATE + ($2 || ' days')::interval
          AND ps.status::text = 'SCHEDULED'
        ORDER BY ps.date, ps."startTime"
      `, input.clubId, String(input.days))
      return {
        sessions: sessions
          .map((s: any) => ({ ...s, occupancy: Math.round((s.registered / (s.maxPlayers || 1)) * 100) }))
          .filter((s: any) => s.occupancy < 80)
      }
    }),

  // ── New Members (first booking within N days) ──
  // "New" = first confirmed booking at this club happened recently,
  // NOT when club_followers record was created (which is import date for CSV members)
  getNewMembers: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), joinedWithinDays: z.number().default(14) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.$queryRawUnsafe<any[]>(`
        SELECT u.id, u.name, u.email, u.image, first_booking."firstPlayedAt" as "joinedAt"
        FROM club_followers cf
        JOIN users u ON u.id = cf.user_id
        JOIN LATERAL (
          SELECT MIN(b."bookedAt") as "firstPlayedAt"
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          WHERE b."userId" = cf.user_id
            AND ps."clubId" = $1            AND b.status = 'CONFIRMED'
        ) first_booking ON true
        WHERE cf.club_id = $1          AND first_booking."firstPlayedAt" >= NOW() - ($2 || ' days')::interval
        ORDER BY first_booking."firstPlayedAt" DESC
      `, input.clubId, String(input.joinedWithinDays))
      return { members: rows, count: rows.length }
    }),

  getSmartFirstSession: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      windowDays: z.number().int().min(7).max(45).default(21),
      limit: z.number().int().min(1).max(20).default(8),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
        select: {
          automationSettings: true,
        },
      })

      const rows = await ctx.prisma.$queryRawUnsafe<SmartFirstSessionRow[]>(`
        SELECT
          cf.user_id as "userId",
          cf.created_at as "followedAt",
          u.created_at as "userCreatedAt",
          u.name,
          u.email,
          u.membership_type as "membershipType",
          u.membership_status as "membershipStatus",
          MIN(psb."bookedAt") FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
          ) as "firstConfirmedBookingAt",
          MAX(psb."bookedAt") FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
          ) as "lastConfirmedBookingAt",
          COUNT(psb.id) FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
          )::int as "confirmedBookings"
        FROM club_followers cf
        JOIN users u ON u.id = cf.user_id
        LEFT JOIN play_session_bookings psb ON psb."userId" = u.id
        LEFT JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE cf.club_id = $1
          AND u.email NOT LIKE '%placeholder%'
          AND u.email NOT LIKE '%demo%'
        GROUP BY
          cf.user_id,
          cf.created_at,
          u.created_at,
          u.name,
          u.email,
          u.membership_type,
          u.membership_status
      `, input.clubId)

      return buildSmartFirstSessionSnapshot({
        rows,
        automationSettings: club.automationSettings,
        windowDays: input.windowDays,
        limit: input.limit,
      })
    }),

  getGuestTrialBooking: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      windowDays: z.number().int().min(7).max(45).default(21),
      limit: z.number().int().min(1).max(20).default(8),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
        select: {
          automationSettings: true,
        },
      })

      const rows = await ctx.prisma.$queryRawUnsafe<GuestTrialBookingRow[]>(`
        SELECT
          cf.user_id as "userId",
          cf.created_at as "followedAt",
          u.created_at as "userCreatedAt",
          u.name,
          u.email,
          u.membership_type as "membershipType",
          u.membership_status as "membershipStatus",
          MIN(ps.date) FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date >= NOW()
          ) as "nextBookedSessionAt",
          MIN(ps.date) FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date < NOW()
          ) as "firstPlayedAt",
          MAX(ps.date) FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date < NOW()
          ) as "lastPlayedAt",
          COUNT(psb.id) FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
          )::int as "confirmedBookings",
          COUNT(psb.id) FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date < NOW()
          )::int as "playedConfirmedBookings",
          COUNT(psb.id) FILTER (
            WHERE psb.status = 'NO_SHOW' AND ps."clubId" = $1
          )::int as "noShowCount"
        FROM club_followers cf
        JOIN users u ON u.id = cf.user_id
        LEFT JOIN play_session_bookings psb ON psb."userId" = u.id
        LEFT JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE cf.club_id = $1
          AND u.email NOT LIKE '%placeholder%'
          AND u.email NOT LIKE '%demo%'
        GROUP BY
          cf.user_id,
          cf.created_at,
          u.created_at,
          u.name,
          u.email,
          u.membership_type,
          u.membership_status
      `, input.clubId)

      return buildGuestTrialBookingSnapshot({
        rows,
        automationSettings: club.automationSettings,
        windowDays: input.windowDays,
        limit: input.limit,
      })
    }),

  getWinBackSnapshot: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      windowDays: z.number().int().min(21).max(120).default(60),
      limit: z.number().int().min(1).max(20).default(8),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
        select: {
          automationSettings: true,
        },
      })

      const rows = await ctx.prisma.$queryRawUnsafe<WinBackRow[]>(`
        SELECT
          cf.user_id as "userId",
          cf.created_at as "followedAt",
          u.created_at as "userCreatedAt",
          u.name,
          u.email,
          u.membership_type as "membershipType",
          u.membership_status as "membershipStatus",
          MAX(psb."bookedAt") FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
          ) as "lastConfirmedBookingAt",
          COUNT(psb.id) FILTER (
            WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
          )::int as "confirmedBookings"
        FROM club_followers cf
        JOIN users u ON u.id = cf.user_id
        LEFT JOIN play_session_bookings psb ON psb."userId" = u.id
        LEFT JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE cf.club_id = $1
          AND u.email NOT LIKE '%placeholder%'
          AND u.email NOT LIKE '%demo%'
        GROUP BY
          cf.user_id,
          cf.created_at,
          u.created_at,
          u.name,
          u.email,
          u.membership_type,
          u.membership_status
      `, input.clubId)

      return buildWinBackSnapshot({
        rows,
        automationSettings: club.automationSettings,
        windowDays: input.windowDays,
        limit: input.limit,
      })
    }),

  getReferralSnapshot: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      windowDays: z.number().int().min(21).max(120).default(60),
      limit: z.number().int().min(1).max(20).default(8),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const lookbackDate = new Date()
      lookbackDate.setDate(lookbackDate.getDate() - input.windowDays)

      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
        select: {
          automationSettings: true,
        },
      })

      const rows = await ctx.prisma.$queryRawUnsafe<ReferralRow[]>(`
        WITH booking_stats AS (
          SELECT
            psb."userId",
            MIN(ps.date) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
            ) as "firstConfirmedBookingAt",
            MAX(ps.date) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
            ) as "lastConfirmedBookingAt",
            COUNT(psb.id) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
            )::int as "confirmedBookings",
            COUNT(psb.id) FILTER (
              WHERE psb.status = 'CONFIRMED'
                AND ps."clubId" = $1
                AND ps.date >= CURRENT_DATE - INTERVAL '21 days'
            )::int as "recentConfirmedBookings"
          FROM play_session_bookings psb
          JOIN play_sessions ps ON ps.id = psb."sessionId"
          GROUP BY psb."userId"
        ),
        user_sessions AS (
          SELECT b."userId", b."sessionId"
          FROM play_session_bookings b
          JOIN play_sessions ps ON ps.id = b."sessionId"
          WHERE b.status = 'CONFIRMED'
            AND ps."clubId" = $1
            AND ps.date >= CURRENT_DATE - INTERVAL '90 days'
            AND ps.date <= CURRENT_DATE
        ),
        co_player_counts AS (
          SELECT us1."userId", us2."userId" as co_player_id, COUNT(*) as n
          FROM user_sessions us1
          JOIN user_sessions us2 ON us1."sessionId" = us2."sessionId"
            AND us1."userId" != us2."userId"
          GROUP BY us1."userId", us2."userId"
          HAVING COUNT(*) >= 2
        ),
        top_co AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY n DESC) as rn
          FROM co_player_counts
        ),
        limited AS (
          SELECT "userId", co_player_id
          FROM top_co
          WHERE rn <= 12
        ),
        co_summary AS (
          SELECT
            l."userId",
            COUNT(*)::int as "totalCoPlayers",
            COUNT(*) FILTER (
              WHERE EXISTS (
                SELECT 1
                FROM play_session_bookings b2
                JOIN play_sessions ps2 ON ps2.id = b2."sessionId"
                WHERE b2."userId" = l.co_player_id
                  AND ps2."clubId" = $1
                  AND b2.status = 'CONFIRMED'
                  AND ps2.date >= CURRENT_DATE - INTERVAL '21 days'
              )
            )::int as "activeCoPlayers"
          FROM limited l
          GROUP BY l."userId"
        )
        SELECT
          cf.user_id as "userId",
          cf.created_at as "followedAt",
          u.created_at as "userCreatedAt",
          u.name,
          u.email,
          u.membership_type as "membershipType",
          u.membership_status as "membershipStatus",
          bs."firstConfirmedBookingAt",
          bs."lastConfirmedBookingAt",
          COALESCE(bs."confirmedBookings", 0)::int as "confirmedBookings",
          COALESCE(bs."recentConfirmedBookings", 0)::int as "recentConfirmedBookings",
          COALESCE(cs."activeCoPlayers", 0)::int as "activeCoPlayers",
          COALESCE(cs."totalCoPlayers", 0)::int as "totalCoPlayers"
        FROM club_followers cf
        JOIN users u ON u.id = cf.user_id
        LEFT JOIN booking_stats bs ON bs."userId" = u.id
        LEFT JOIN co_summary cs ON cs."userId" = u.id
        WHERE cf.club_id = $1
          AND u.email NOT LIKE '%placeholder%'
          AND u.email NOT LIKE '%demo%'
      `, input.clubId)

      const outcomeRows = await ctx.prisma.aIRecommendationLog.findMany({
        where: {
          clubId: input.clubId,
          createdAt: { gte: lookbackDate },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          createdAt: true,
          openedAt: true,
          clickedAt: true,
          respondedAt: true,
          deliveredAt: true,
          bouncedAt: true,
          reasoning: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 600,
      }) as ReferralOutcomeRow[]

      const referredGuestUserIds = Array.from(new Set(
        outcomeRows.flatMap((row) => {
          const reasoning = row.reasoning && typeof row.reasoning === 'object' && !Array.isArray(row.reasoning)
            ? row.reasoning as Record<string, unknown>
            : null
          const guestTrialAttribution = reasoning?.guestTrialAttribution
            && typeof reasoning.guestTrialAttribution === 'object'
            && !Array.isArray(reasoning.guestTrialAttribution)
            ? reasoning.guestTrialAttribution as Record<string, unknown>
            : null
          const referralSource = guestTrialAttribution?.referralSource
            && typeof guestTrialAttribution.referralSource === 'object'
            && !Array.isArray(guestTrialAttribution.referralSource)
            ? guestTrialAttribution.referralSource as Record<string, unknown>
            : null

          return row.userId && referralSource ? [row.userId] : []
        }),
      ))

      const capturedGuestRows = referredGuestUserIds.length > 0
        ? await ctx.prisma.$queryRawUnsafe<ReferralCapturedGuestRow[]>(`
          SELECT
            u.id as "userId",
            u.name,
            u.email,
            u.membership_type as "membershipType",
            u.membership_status as "membershipStatus",
            MIN(ps.date) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date >= NOW()
            ) as "nextBookedSessionAt",
            MIN(ps.date) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date < NOW()
            ) as "firstPlayedAt",
            MAX(ps.date) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date < NOW()
            ) as "lastPlayedAt",
            COUNT(psb.id) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
            )::int as "confirmedBookings",
            COUNT(psb.id) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date < NOW()
            )::int as "playedConfirmedBookings"
          FROM users u
          LEFT JOIN play_session_bookings psb ON psb."userId" = u.id
          LEFT JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE u.id IN (${referredGuestUserIds.map((id) => `'${id}'`).join(', ')})
          GROUP BY
            u.id,
            u.name,
            u.email,
            u.membership_type,
            u.membership_status
        `, input.clubId)
        : []

      const rewardIssuanceRows = await ctx.prisma.referralRewardIssuance.findMany({
        where: {
          clubId: input.clubId,
        },
        select: {
          advocateUserId: true,
          referredGuestUserId: true,
          offerKey: true,
          status: true,
          issuedAt: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }) as ReferralRewardIssuanceRow[]

      return buildReferralSnapshot({
        rows,
        outcomeRows,
        capturedGuestRows,
        rewardIssuanceRows,
        automationSettings: club.automationSettings,
        windowDays: input.windowDays,
        limit: input.limit,
      })
    }),

  updateReferralRewardIssuance: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      advocateUserId: z.string().uuid(),
      referredGuestUserId: z.string().uuid(),
      offerKey: z.string().min(1).max(120),
      lane: z.enum(['vip_advocate', 'social_regular', 'dormant_advocate']),
      offerName: z.string().min(1).max(160),
      rewardLabel: z.string().min(1).max(160),
      status: z.enum(['ready_issue', 'on_hold', 'issued']),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const [advocate, referredGuest, guestEvidence, existingIssuances] = await Promise.all([
        ctx.prisma.user.findUnique({
          where: { id: input.advocateUserId },
          select: { id: true, name: true, email: true },
        }),
        ctx.prisma.user.findUnique({
          where: { id: input.referredGuestUserId },
          select: { id: true, name: true, email: true },
        }),
        ctx.prisma.$queryRawUnsafe<Array<{
          confirmedBookings: number | string | null
          playedConfirmedBookings: number | string | null
        }>>(`
          SELECT
            COUNT(psb.id) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
            )::int as "confirmedBookings",
            COUNT(psb.id) FILTER (
              WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1 AND ps.date < NOW()
            )::int as "playedConfirmedBookings"
          FROM users u
          LEFT JOIN play_session_bookings psb ON psb."userId" = u.id
          LEFT JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE u.id = $2
          GROUP BY u.id
        `, input.clubId, input.referredGuestUserId),
        ctx.prisma.referralRewardIssuance.findMany({
          where: {
            clubId: input.clubId,
            referredGuestUserId: input.referredGuestUserId,
          },
          select: {
            advocateUserId: true,
            referredGuestUserId: true,
            offerKey: true,
            status: true,
            issuedAt: true,
            reviewedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ])

      const guardrails = evaluateReferralRewardGuardrails({
        advocateUserId: input.advocateUserId,
        advocateEmail: advocate?.email || null,
        referredGuestUserId: input.referredGuestUserId,
        referredGuestEmail: referredGuest?.email || null,
        offerKey: input.offerKey,
        playedConfirmedBookings: Number(guestEvidence?.[0]?.playedConfirmedBookings || 0),
        currentStatus: input.status,
        existingRows: existingIssuances as ReferralRewardIssuanceRow[],
      })

      if (input.status === 'issued' && guardrails.guardrailStatus === 'blocked') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: guardrails.guardrailSummary,
        })
      }

      const prismaStatus = input.status === 'issued'
        ? 'ISSUED'
        : input.status === 'on_hold'
          ? 'ON_HOLD'
          : 'READY'
      const now = new Date()
      const targetId = `${input.advocateUserId}:${input.referredGuestUserId}:${input.offerKey}`
      const mergedMetadata = {
        ...(input.metadata || {}),
        guardrailStatus: guardrails.guardrailStatus,
        guardrailReasons: guardrails.guardrailReasons,
        guardrailSummary: guardrails.guardrailSummary,
        autoIssueSuggested: guardrails.autoIssueSuggested,
        duplicateRisk: guardrails.duplicateRisk,
        abuseRisk: guardrails.abuseRisk,
        advocateName: advocate?.name || null,
        advocateEmail: advocate?.email || null,
        referredGuestName: referredGuest?.name || null,
        referredGuestEmail: referredGuest?.email || null,
        playedConfirmedBookings: Number(guestEvidence?.[0]?.playedConfirmedBookings || 0),
        confirmedBookings: Number(guestEvidence?.[0]?.confirmedBookings || 0),
        ...(input.status === 'issued' && guardrails.guardrailStatus === 'review'
          ? { issuedWithReview: true }
          : {}),
      }

      const record = await ctx.prisma.referralRewardIssuance.upsert({
        where: {
          clubId_advocateUserId_referredGuestUserId_offerKey: {
            clubId: input.clubId,
            advocateUserId: input.advocateUserId,
            referredGuestUserId: input.referredGuestUserId,
            offerKey: input.offerKey,
          },
        },
        update: {
          lane: input.lane,
          offerName: input.offerName,
          rewardLabel: input.rewardLabel,
          status: prismaStatus as any,
          metadata: mergedMetadata as any,
          reviewedAt: now,
          reviewedByUserId: ctx.session.user.id,
          issuedAt: input.status === 'issued' ? now : null,
        },
        create: {
          clubId: input.clubId,
          advocateUserId: input.advocateUserId,
          referredGuestUserId: input.referredGuestUserId,
          offerKey: input.offerKey,
          lane: input.lane,
          offerName: input.offerName,
          rewardLabel: input.rewardLabel,
          status: prismaStatus as any,
          metadata: mergedMetadata as any,
          reviewedAt: now,
          reviewedByUserId: ctx.session.user.id,
          ...(input.status === 'issued' ? { issuedAt: now } : {}),
        },
        select: {
          status: true,
          issuedAt: true,
          reviewedAt: true,
          updatedAt: true,
        },
      })

      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: input.clubId,
        userId: ctx.session.user.id,
        actorType: 'user',
        action: 'referralRewardIssuance',
        mode: 'manual_review',
        result: input.status === 'issued' ? 'executed' : 'reviewed',
        targetType: 'referral_reward_issuance',
        targetId,
        summary: input.status === 'issued'
          ? guardrails.guardrailStatus === 'review'
            ? `Marked ${input.rewardLabel} as issued for advocate ${input.advocateUserId} after review-only guardrails on referred guest ${input.referredGuestUserId}.`
            : `Marked ${input.rewardLabel} as issued for advocate ${input.advocateUserId} after referred guest ${input.referredGuestUserId} converted.`
          : input.status === 'on_hold'
            ? `Put ${input.rewardLabel} on hold for advocate ${input.advocateUserId}.`
            : `Re-opened ${input.rewardLabel} for advocate ${input.advocateUserId}.`,
        metadata: {
          advocateUserId: input.advocateUserId,
          referredGuestUserId: input.referredGuestUserId,
          offerKey: input.offerKey,
          lane: input.lane,
          ...mergedMetadata,
        },
      })

      return {
        ok: true,
        clientStatus: input.status,
        ...record,
      }
    }),

  // ── Generate Campaign Message (LLM-powered) ──
  generateCampaignMessage: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      campaignType: z.enum(['CHECK_IN', 'RETENTION_BOOST', 'REACTIVATION', 'SLOT_FILLER', 'EVENT_INVITE', 'NEW_MEMBER_WELCOME']),
      channel: z.enum(['email', 'sms', 'both']),
      audienceCount: z.number(),
      context: z.object({
        sessionTitle: z.string().optional(),
        riskSegment: z.string().optional(),
        inactivityDays: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const club = await ctx.prisma.club.findUnique({ where: { id: input.clubId }, select: { name: true } })
      const clubName = club?.name || 'Your Club'

      // Build prompt
      const campaignDescriptions: Record<string, string> = {
        CHECK_IN: 'Light check-in for members whose activity has slightly declined. Friendly, not pushy.',
        RETENTION_BOOST: 'Stronger outreach for at-risk members. Show they are valued, create motivation to return.',
        REACTIVATION: 'Win-back message for inactive members who haven\'t played in a while.',
        SLOT_FILLER: 'Fill empty spots in upcoming sessions. Create urgency around limited availability.',
        EVENT_INVITE: 'Invite members to a specific event or session.',
        NEW_MEMBER_WELCOME: 'Welcome message for new club members. Warm, inviting, help them get started.',
      }

      const contextLines: string[] = []
      if (input.context?.sessionTitle) contextLines.push(`Session: "${input.context.sessionTitle}"`)
      if (input.context?.riskSegment) contextLines.push(`Risk segment: ${input.context.riskSegment}`)
      if (input.context?.inactivityDays) contextLines.push(`Average inactivity: ${input.context.inactivityDays} days`)
      contextLines.push(`Audience size: ${input.audienceCount} members`)

      const systemPrompt = `You are a messaging specialist for racquet sports clubs (pickleball, padel, tennis).
You generate outreach messages for club campaigns.

RULES:
- Use template variables: {{name}} = member's first name, {{club}} = club name
- emailSubject: max 60 characters, compelling, personal
- emailBody: max 600 characters, warm and conversational, end with clear CTA. Sign off as "{{club}} Team"
- smsBody: max 155 characters, concise with clear action
- Never use ALL CAPS for emphasis
- Return ONLY valid JSON, no markdown

OUTPUT FORMAT:
{"subject": "...", "body": "...", "smsBody": "..."}`

      const userPrompt = `Generate a ${input.campaignType} campaign message.
Club: "${clubName}". Channel: ${input.channel}.
Purpose: ${campaignDescriptions[input.campaignType] || input.campaignType}
${contextLines.length > 0 ? '\nContext:\n' + contextLines.join('\n') : ''}`

      try {
        const { generateWithFallback } = await import('@/lib/ai/llm/provider')
        const result = await generateWithFallback({
          system: systemPrompt,
          prompt: userPrompt,
          tier: 'fast',
          maxTokens: 500,
        })

        // Parse JSON from response
        let jsonStr = result.text.trim()
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) jsonStr = jsonMatch[1].trim()
        const objStart = jsonStr.indexOf('{')
        const objEnd = jsonStr.lastIndexOf('}')
        if (objStart !== -1 && objEnd !== -1) jsonStr = jsonStr.slice(objStart, objEnd + 1)

        const parsed = JSON.parse(jsonStr)
        return {
          subject: (parsed.subject || parsed.emailSubject || '').slice(0, 60),
          body: (parsed.body || parsed.emailBody || '').slice(0, 600),
          smsBody: (parsed.smsBody || '').slice(0, 160),
        }
      } catch (err) {
        log.warn('[generateCampaignMessage] LLM failed, using fallback templates:', (err as Error).message?.slice(0, 100))
        // Hardcoded fallback templates
        const fallbacks: Record<string, { subject: string; body: string; smsBody: string }> = {
          CHECK_IN: {
            subject: `{{name}}, we miss you at {{club}}!`,
            body: `Hi {{name}},\n\nWe noticed you haven't been around lately and wanted to check in. There are some great sessions coming up that we think you'd enjoy.\n\nHope to see you soon!\n\n— {{club}} Team`,
            smsBody: `Hey {{name}}! We miss you at {{club}}. Check out our upcoming sessions!`,
          },
          RETENTION_BOOST: {
            subject: `{{name}}, your spot is waiting at {{club}}`,
            body: `Hi {{name}},\n\nWe value you as part of our community and wanted to reach out. There are exciting sessions and events happening — we'd love to see you back on the court.\n\n— {{club}} Team`,
            smsBody: `{{name}}, your {{club}} community misses you! Come back and play — great sessions this week.`,
          },
          REACTIVATION: {
            subject: `It's been a while, {{name}} — come back to {{club}}!`,
            body: `Hi {{name}},\n\nIt's been a while since your last visit, and we'd love to have you back. A lot has been happening at {{club}} — new sessions, new players, and plenty of fun.\n\n— {{club}} Team`,
            smsBody: `{{name}}, it's been too long! Come back to {{club}} — lots of new sessions waiting for you.`,
          },
          SLOT_FILLER: {
            subject: `Spots open this week at {{club}}, {{name}}!`,
            body: `Hi {{name}},\n\nWe have some open spots in upcoming sessions and thought you might be interested. Don't miss out — they tend to fill up fast!\n\n— {{club}} Team`,
            smsBody: `{{name}}, spots available at {{club}} this week! Book now before they fill up.`,
          },
          EVENT_INVITE: {
            subject: `You're invited, {{name}}!`,
            body: `Hi {{name}},\n\nWe have an exciting event coming up at {{club}} and we'd love for you to join. Save your spot now!\n\n— {{club}} Team`,
            smsBody: `{{name}}, you're invited to a special event at {{club}}! RSVP now.`,
          },
          NEW_MEMBER_WELCOME: {
            subject: `Welcome to {{club}}, {{name}}! 🎉`,
            body: `Hi {{name}},\n\nWelcome to {{club}}! We're thrilled to have you as part of our community. Check out our upcoming sessions and find the perfect one for your schedule and skill level.\n\nSee you on the court!\n\n— {{club}} Team`,
            smsBody: `Welcome to {{club}}, {{name}}! Check out our upcoming sessions and book your first game.`,
          },
        }
        return fallbacks[input.campaignType] || fallbacks.CHECK_IN
      }
    }),

  // ── Create Campaign (send messages to selected members) ──
  // ── Usage Summary (for billing UI) ──
  getUsageSummary: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const { getUsageSummary } = await import('@/lib/stripe-usage')
      return getUsageSummary(input.clubId)
    }),

  createCampaign: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      type: z.enum(['CHECK_IN', 'RETENTION_BOOST', 'REACTIVATION', 'SLOT_FILLER', 'EVENT_INVITE', 'NEW_MEMBER_WELCOME']),
      channel: z.enum(['email', 'sms', 'both']),
      memberIds: z.array(z.string()),
      subject: z.string().optional(),
      body: z.string(),
      smsBody: z.string().optional(),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'outreachSend',
        adminRole: adminAccess.role,
      })
      await enforceCampaignUsageLimits(input.clubId, input.channel, input.memberIds.length)
      await enforceManualLiveOutreachGate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        userId: ctx.session.user.id,
        automationSettings: clubAutomationContext?.automationSettings,
        adminRole: adminAccess.role,
        targetType: 'manual_campaign',
        actionKind: 'create_campaign',
        channel: input.channel,
        recipientCount: input.memberIds.length,
        label: `Manual ${input.type} campaign`,
      })
      return runCreateCampaign(ctx.prisma, input)
    }),

  executeAdvisorAction: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      messageId: z.string().uuid().optional(),
      action: advisorActionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const advisorMessage = input.messageId
        ? await ctx.prisma.aIMessage.findUnique({
            where: { id: input.messageId },
            select: {
              id: true,
              role: true,
              metadata: true,
              conversation: {
                select: {
                  clubId: true,
                  userId: true,
                },
              },
            },
          })
        : null

      if (input.messageId) {
        if (!advisorMessage) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Advisor draft not found.',
          })
        }

        if (advisorMessage.role !== 'assistant') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This message does not contain an executable advisor draft.',
          })
        }

        if (advisorMessage.conversation.clubId !== input.clubId || advisorMessage.conversation.userId !== ctx.session.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to execute this advisor draft.',
          })
        }
      }

      const sourceAdvisorAction = advisorMessage
        ? getAdvisorActionFromMetadata(advisorMessage.metadata)
        : null
      const advisorDraft = advisorMessage
        ? getAdvisorDraftFromMetadata(advisorMessage.metadata)
        : null
      const isSandboxExecution = advisorDraft?.sandboxMode ?? true
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'approveActions',
        adminRole: adminAccess.role,
      })
      const buildSandboxRouting = (channel: 'email' | 'sms' | 'both') =>
        buildAdvisorSandboxRoutingSummary({
          settings: clubAutomationContext?.automationSettings,
          channel,
        })
      const buildOutreachControlPlaneNote = (reason: string) =>
        `${reason} This outreach was reviewed in shadow mode only, so no live delivery happened.`
      const requireOutreachControlPlane = async (params: {
        targetType: string
        targetId?: string | null
        deliveryMode: 'send_now' | 'send_later'
        channel: 'email' | 'sms' | 'both'
        recipientCount: number
        actionKind: AgentOutreachRolloutActionKind
        summaryLabel: string
      }) => {
        assertAgentPermissionForAdmin({
          automationSettings: clubAutomationContext?.automationSettings,
          action: 'outreachSend',
          adminRole: adminAccess.role,
        })

        const controlPlane = evaluateAgentControlPlaneAction({
          automationSettings: clubAutomationContext?.automationSettings,
          action: 'outreachSend',
        })

        if (!controlPlane.allowed) {
          await persistAgentDecisionRecord(ctx.prisma, {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'outreachSend',
            targetType: params.targetType,
            targetId: params.targetId || null,
            mode: controlPlane.mode,
            result: 'blocked',
            summary: controlPlane.reason,
            metadata: {
              actionKind: params.actionKind,
              deliveryMode: params.deliveryMode,
              channel: params.channel,
              recipientCount: params.recipientCount,
              label: params.summaryLabel,
              reason: 'control_plane_disabled',
            },
          })
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: controlPlane.reason,
          })
        }

        if (!controlPlane.shadow) {
          const rollout = evaluateAgentOutreachRollout({
            clubId: input.clubId,
            automationSettings: clubAutomationContext?.automationSettings,
            actionKind: params.actionKind,
          })

          if (!rollout.allowed) {
            await persistAgentDecisionRecord(ctx.prisma, {
              clubId: input.clubId,
              userId: ctx.session.user.id,
              action: 'outreachSend',
              targetType: params.targetType,
              targetId: params.targetId || null,
              mode: controlPlane.mode,
              result: 'blocked',
              summary: rollout.reason,
              metadata: {
                actionKind: params.actionKind,
                deliveryMode: params.deliveryMode,
                channel: params.channel,
                recipientCount: params.recipientCount,
                label: params.summaryLabel,
                reason: 'outreach_rollout_blocked',
                rolloutClubAllowlisted: rollout.clubAllowlisted,
                rolloutActionEnabled: rollout.actionEnabled,
              },
            })
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: rollout.reason,
            })
          }
        }

        return controlPlane
      }

      const persistAdvisorOutcome = async <T extends Record<string, any>>(result: T): Promise<T> => {
        if (!advisorMessage) return result

        const occurredAt = new Date().toISOString()
        const outcome = buildAdvisorOutcomeMemory(input.action, result, occurredAt)
        const baseState =
          getAdvisorConversationStateFromMetadata(advisorMessage.metadata) ||
          buildAdvisorConversationStateFromAction(input.action, occurredAt)
        let nextState = withAdvisorOutcome(baseState, outcome, occurredAt)

        let metadata = withAdvisorActionRuntimeState(advisorMessage.metadata, {
          status: 'active',
          updatedAt: occurredAt,
        })
        metadata = withAdvisorOutcomeMetadata(metadata, outcome)
        if (advisorDraft?.id) {
          const selectedPlan = detectAdvisorDraftSelectedPlan(
            sourceAdvisorAction || input.action,
            input.action,
          )
          const persistedDraft = await persistAdvisorDraft({
            prisma: ctx.prisma,
            clubId: input.clubId,
            userId: ctx.session.user.id,
            existingDraftId: advisorDraft.id,
            sourceMessageId: advisorMessage.id,
            action: sourceAdvisorAction || input.action,
            selectedPlan,
            status: resolveAdvisorDraftStatusFromResult(input.action, result),
            sandboxMode: advisorDraft.sandboxMode,
            metadata: buildAdvisorSandboxDraftMetadata(result),
          })

          if (persistedDraft) {
            nextState = withAdvisorCurrentDraft(nextState, persistedDraft, occurredAt)
            metadata = withAdvisorDraftMetadata(metadata, persistedDraft)
          }
        }
        metadata = {
          ...(metadata as Record<string, unknown>),
          advisorResolvedAction: input.action,
          advisorState: nextState,
        }

        await ctx.prisma.aIMessage.update({
          where: { id: advisorMessage.id },
          data: { metadata: metadata as any },
        })

        return result
      }

      if (input.action.kind === 'create_cohort') {
        const count = await countCohortMembers(ctx.prisma, input.clubId, input.action.cohort.filters as CohortFilter[])
        const cohort = await ctx.prisma.clubCohort.create({
          data: {
            clubId: input.clubId,
            name: input.action.cohort.name,
            description: input.action.cohort.description,
            filters: input.action.cohort.filters as any,
            memberCount: count,
            createdBy: ctx.session.user.id,
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: 'create_cohort' as const,
          cohortId: cohort.id,
          name: cohort.name,
          memberCount: count,
        })
      }

      if (input.action.kind === 'fill_session') {
        await checkFeatureAccess(input.clubId, 'slot-filler')
        const fillAction = input.action
        const guardrails = await evaluateAdvisorContactGuardrails({
          prisma: ctx.prisma,
          clubId: input.clubId,
          type: 'SLOT_FILLER',
          requestedChannel: fillAction.outreach.channel,
          candidates: fillAction.outreach.candidates.map((candidate) => ({ memberId: candidate.memberId })),
          sessionId: fillAction.session.id,
        })
        const eligibleCandidates = fillAction.outreach.candidates
          .map((candidate) => {
            const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
            if (!eligible) return null
            return {
              memberId: candidate.memberId,
              channel: candidate.channel || eligible.channel,
              customMessage: fillAction.outreach.message,
            }
          })
          .filter(Boolean) as Array<{ memberId: string; channel: 'email' | 'sms' | 'both'; customMessage: string }>
        const previewRecipients = buildAdvisorSandboxPreviewRecipients(
          eligibleCandidates,
          new Map(
            fillAction.outreach.candidates.map((candidate) => [
              candidate.memberId,
              {
                name: candidate.name,
                score: candidate.score,
              },
            ]),
          ),
        )

        if (eligibleCandidates.length === 0) {
          return persistAdvisorOutcome({
            ok: true,
            kind: 'fill_session' as const,
            sessionId: fillAction.session.id,
            sessionTitle: fillAction.session.title,
            candidateCount: 0,
            channel: fillAction.outreach.channel,
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
            guardrails: guardrails.summary,
          })
        }

        if (isSandboxExecution) {
          return persistAdvisorOutcome({
            ok: true,
            sandboxed: true,
            kind: 'fill_session' as const,
            sessionId: fillAction.session.id,
            sessionTitle: fillAction.session.title,
            candidateCount: eligibleCandidates.length,
            channel: fillAction.outreach.channel,
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
            guardrails: guardrails.summary,
            deliveryMode: 'send_now' as const,
            previewRecipientCount: eligibleCandidates.length,
            previewRecipients,
            sandboxRouting: buildSandboxRouting(fillAction.outreach.channel),
          })
        }

        const fillControlPlane = await requireOutreachControlPlane({
          targetType: 'play_session',
          targetId: fillAction.session.id,
          deliveryMode: 'send_now',
          channel: fillAction.outreach.channel,
          recipientCount: eligibleCandidates.length,
          actionKind: 'fill_session',
          summaryLabel: fillAction.session.title,
        })

        if (fillControlPlane.shadow) {
          await persistAgentDecisionRecord(ctx.prisma, {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'outreachSend',
            targetType: 'play_session',
            targetId: fillAction.session.id,
            mode: fillControlPlane.mode,
            result: 'shadowed',
            summary: `Slot-filler outreach for ${fillAction.session.title} was reviewed in shadow mode.`,
            metadata: {
              actionKind: 'fill_session',
              deliveryMode: 'send_now',
              channel: fillAction.outreach.channel,
              recipientCount: eligibleCandidates.length,
            },
          })
          return persistAdvisorOutcome({
            ok: true,
            sandboxed: true,
            shadowed: true,
            kind: 'fill_session' as const,
            sessionId: fillAction.session.id,
            sessionTitle: fillAction.session.title,
            candidateCount: eligibleCandidates.length,
            channel: fillAction.outreach.channel,
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
            guardrails: guardrails.summary,
            deliveryMode: 'send_now' as const,
            previewRecipientCount: eligibleCandidates.length,
            previewRecipients,
            sandboxRouting: {
              ...buildSandboxRouting(fillAction.outreach.channel),
              note: buildOutreachControlPlaneNote(fillControlPlane.reason),
            },
            controlPlane: {
              mode: fillControlPlane.mode,
              reason: fillControlPlane.reason,
            },
          })
        }

        const inviteResult = await sendInvites(ctx.prisma, {
          clubId: input.clubId,
          sessionId: fillAction.session.id,
          candidates: eligibleCandidates,
        })

        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'outreachSend',
          targetType: 'play_session',
          targetId: fillAction.session.id,
          mode: fillControlPlane.mode,
          result: 'executed',
          summary: `Slot-filler outreach for ${fillAction.session.title} sent live to ${inviteResult.sent || 0} members.`,
          metadata: {
            actionKind: 'fill_session',
            deliveryMode: 'send_now',
            channel: fillAction.outreach.channel,
            recipientCount: eligibleCandidates.length,
            sent: inviteResult.sent || 0,
            failed: inviteResult.failed || 0,
            skipped: (inviteResult.skipped || 0) + guardrails.summary.excludedCount,
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: 'fill_session' as const,
          sessionId: fillAction.session.id,
          sessionTitle: fillAction.session.title,
          candidateCount: eligibleCandidates.length,
          channel: fillAction.outreach.channel,
          ...inviteResult,
          skipped: (inviteResult.skipped || 0) + guardrails.summary.excludedCount,
          guardrails: guardrails.summary,
        })
      }

      if (input.action.kind === 'reactivate_members') {
        await checkFeatureAccess(input.clubId, 'reactivation')
        const reactivationAction = input.action
        const guardrails = await evaluateAdvisorContactGuardrails({
          prisma: ctx.prisma,
          clubId: input.clubId,
          type: 'REACTIVATION',
          requestedChannel: reactivationAction.reactivation.channel,
          candidates: reactivationAction.reactivation.candidates.map((candidate) => ({ memberId: candidate.memberId })),
        })
        const eligibleCandidates = reactivationAction.reactivation.candidates
          .map((candidate) => {
            const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
            if (!eligible) return null
            return {
              memberId: candidate.memberId,
              channel: candidate.channel || eligible.channel,
            }
          })
          .filter(Boolean) as Array<{ memberId: string; channel: 'email' | 'sms' | 'both' }>
        const previewRecipients = buildAdvisorSandboxPreviewRecipients(
          eligibleCandidates,
          new Map(
            reactivationAction.reactivation.candidates.map((candidate) => [
              candidate.memberId,
              {
                name: candidate.name,
                score: candidate.score,
              },
            ]),
          ),
        )

        if (eligibleCandidates.length === 0) {
          return persistAdvisorOutcome({
            ok: true,
            kind: 'reactivate_members' as const,
            segmentLabel: reactivationAction.reactivation.segmentLabel,
            inactivityDays: reactivationAction.reactivation.inactivityDays,
            candidateCount: 0,
            channel: reactivationAction.reactivation.channel,
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
            guardrails: guardrails.summary,
          })
        }

        if (isSandboxExecution) {
          return persistAdvisorOutcome({
            ok: true,
            sandboxed: true,
            kind: 'reactivate_members' as const,
            segmentLabel: reactivationAction.reactivation.segmentLabel,
            inactivityDays: reactivationAction.reactivation.inactivityDays,
            candidateCount: eligibleCandidates.length,
            channel: reactivationAction.reactivation.channel,
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
            guardrails: guardrails.summary,
            deliveryMode: 'send_now' as const,
            previewRecipientCount: eligibleCandidates.length,
            previewRecipients,
            sandboxRouting: buildSandboxRouting(reactivationAction.reactivation.channel),
          })
        }

        const reactivationControlPlane = await requireOutreachControlPlane({
          targetType: 'reactivation_segment',
          targetId: null,
          deliveryMode: 'send_now',
          channel: reactivationAction.reactivation.channel,
          recipientCount: eligibleCandidates.length,
          actionKind: 'reactivate_members',
          summaryLabel: reactivationAction.reactivation.segmentLabel,
        })

        if (reactivationControlPlane.shadow) {
          await persistAgentDecisionRecord(ctx.prisma, {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'outreachSend',
            targetType: 'reactivation_segment',
            targetId: null,
            mode: reactivationControlPlane.mode,
            result: 'shadowed',
            summary: `Reactivation outreach for ${reactivationAction.reactivation.segmentLabel} was reviewed in shadow mode.`,
            metadata: {
              actionKind: 'reactivate_members',
              deliveryMode: 'send_now',
              channel: reactivationAction.reactivation.channel,
              recipientCount: eligibleCandidates.length,
            },
          })
          return persistAdvisorOutcome({
            ok: true,
            sandboxed: true,
            shadowed: true,
            kind: 'reactivate_members' as const,
            segmentLabel: reactivationAction.reactivation.segmentLabel,
            inactivityDays: reactivationAction.reactivation.inactivityDays,
            candidateCount: eligibleCandidates.length,
            channel: reactivationAction.reactivation.channel,
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
            guardrails: guardrails.summary,
            deliveryMode: 'send_now' as const,
            previewRecipientCount: eligibleCandidates.length,
            previewRecipients,
            sandboxRouting: {
              ...buildSandboxRouting(reactivationAction.reactivation.channel),
              note: buildOutreachControlPlaneNote(reactivationControlPlane.reason),
            },
            controlPlane: {
              mode: reactivationControlPlane.mode,
              reason: reactivationControlPlane.reason,
            },
          })
        }

        const sendResult = await sendReactivationMessages(ctx.prisma, {
          clubId: input.clubId,
          candidates: eligibleCandidates,
          customMessage: reactivationAction.reactivation.message,
        })

        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'outreachSend',
          targetType: 'reactivation_segment',
          targetId: null,
          mode: reactivationControlPlane.mode,
          result: 'executed',
          summary: `Reactivation outreach for ${reactivationAction.reactivation.segmentLabel} sent live to ${sendResult.sent || 0} members.`,
          metadata: {
            actionKind: 'reactivate_members',
            deliveryMode: 'send_now',
            channel: reactivationAction.reactivation.channel,
            recipientCount: eligibleCandidates.length,
            sent: sendResult.sent || 0,
            failed: sendResult.failed || 0,
            skipped: (sendResult.skipped || 0) + guardrails.summary.excludedCount,
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: 'reactivate_members' as const,
          segmentLabel: reactivationAction.reactivation.segmentLabel,
          inactivityDays: reactivationAction.reactivation.inactivityDays,
          candidateCount: eligibleCandidates.length,
          channel: reactivationAction.reactivation.channel,
          ...sendResult,
          skipped: (sendResult.skipped || 0) + guardrails.summary.excludedCount,
          guardrails: guardrails.summary,
        })
      }

      if (input.action.kind === 'trial_follow_up' || input.action.kind === 'renewal_reactivation') {
        const lifecycleAction = input.action
        const guardrails = await evaluateAdvisorContactGuardrails({
          prisma: ctx.prisma,
          clubId: input.clubId,
          type: lifecycleAction.lifecycle.campaignType,
          requestedChannel: lifecycleAction.lifecycle.channel,
          candidates: lifecycleAction.lifecycle.candidates.map((candidate) => ({ memberId: candidate.memberId })),
          timeZone: lifecycleAction.lifecycle.execution.timeZone || null,
          automationSettings: clubAutomationContext?.automationSettings,
          now: lifecycleAction.lifecycle.execution.mode === 'send_later' && lifecycleAction.lifecycle.execution.scheduledFor
            ? new Date(lifecycleAction.lifecycle.execution.scheduledFor)
            : new Date(),
        })
        const eligibleRecipients = lifecycleAction.lifecycle.candidates
          .map((candidate) => {
            const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
            if (!eligible) return null
            return {
              memberId: candidate.memberId,
              channel: candidate.channel || eligible.channel,
            }
          })
          .filter(Boolean) as Array<{ memberId: string; channel: 'email' | 'sms' | 'both' }>
        const memberIds = eligibleRecipients.map((recipient) => recipient.memberId)
        const previewRecipients = buildAdvisorSandboxPreviewRecipients(
          eligibleRecipients,
          new Map(
            lifecycleAction.lifecycle.candidates.map((candidate) => [
              candidate.memberId,
              {
                name: candidate.name,
                score: candidate.score,
              },
            ]),
          ),
        )

        if (lifecycleAction.lifecycle.execution.mode === 'save_draft') {
          return persistAdvisorOutcome({
            ok: true,
            kind: lifecycleAction.kind,
            lifecycle: lifecycleAction.lifecycle.lifecycle,
            label: lifecycleAction.lifecycle.label,
            memberCount: memberIds.length,
            candidateCount: lifecycleAction.lifecycle.candidates.length,
            channel: lifecycleAction.lifecycle.channel,
            guardrails: guardrails.summary,
            deliveryMode: 'save_draft' as const,
            savedAsDraft: true,
          })
        }

        if (isSandboxExecution) {
          const scheduledFor = lifecycleAction.lifecycle.execution.scheduledFor
          const timeZone = lifecycleAction.lifecycle.execution.timeZone || 'America/New_York'
          return persistAdvisorOutcome({
            ok: true,
            sandboxed: true,
            kind: lifecycleAction.kind,
            lifecycle: lifecycleAction.lifecycle.lifecycle,
            label: lifecycleAction.lifecycle.label,
            memberCount: memberIds.length,
            candidateCount: lifecycleAction.lifecycle.candidates.length,
            channel: lifecycleAction.lifecycle.channel,
            guardrails: guardrails.summary,
            deliveryMode: lifecycleAction.lifecycle.execution.mode,
            scheduledFor,
            timeZone,
            scheduledLabel: scheduledFor ? formatAdvisorScheduledLabel(scheduledFor, timeZone) : undefined,
            previewRecipientCount: memberIds.length,
            previewRecipients,
            sandboxRouting: buildSandboxRouting(lifecycleAction.lifecycle.channel),
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
          })
        }

        await enforceCampaignUsageLimits(
          input.clubId,
          lifecycleAction.lifecycle.channel,
          memberIds.length,
          guardrails.summary.deliveryBreakdown,
        )

        if (lifecycleAction.lifecycle.execution.mode === 'send_later') {
          const scheduledFor = lifecycleAction.lifecycle.execution.scheduledFor
          if (!scheduledFor) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Scheduled lifecycle outreach needs a send time before it can be approved.',
            })
          }

          const timeZone = lifecycleAction.lifecycle.execution.timeZone || 'America/New_York'
          if (eligibleRecipients.length === 0) {
            return persistAdvisorOutcome({
              ok: true,
              kind: lifecycleAction.kind,
              lifecycle: lifecycleAction.lifecycle.lifecycle,
              label: lifecycleAction.lifecycle.label,
              memberCount: 0,
              candidateCount: lifecycleAction.lifecycle.candidates.length,
              channel: lifecycleAction.lifecycle.channel,
              guardrails: guardrails.summary,
              deliveryMode: 'send_later' as const,
              scheduled: 0,
              scheduledFor,
              timeZone,
              scheduledLabel: formatAdvisorScheduledLabel(scheduledFor, timeZone),
            })
          }

          const lifecycleScheduleControlPlane = await requireOutreachControlPlane({
            targetType: 'advisor_lifecycle_campaign',
            targetId: advisorDraft?.id || advisorMessage?.id || null,
            deliveryMode: 'send_later',
            channel: lifecycleAction.lifecycle.channel,
            recipientCount: memberIds.length,
            actionKind: lifecycleAction.kind,
            summaryLabel: lifecycleAction.lifecycle.label,
          })

          if (lifecycleScheduleControlPlane.shadow) {
            await persistAgentDecisionRecord(ctx.prisma, {
              clubId: input.clubId,
              userId: ctx.session.user.id,
              action: 'outreachSend',
              targetType: 'advisor_lifecycle_campaign',
              targetId: advisorDraft?.id || advisorMessage?.id || null,
              mode: lifecycleScheduleControlPlane.mode,
              result: 'shadowed',
              summary: `${lifecycleAction.lifecycle.label} was reviewed for scheduled outreach but held in shadow mode.`,
              metadata: {
                actionKind: lifecycleAction.kind,
                deliveryMode: 'send_later',
                channel: lifecycleAction.lifecycle.channel,
                recipientCount: memberIds.length,
                scheduledFor,
                timeZone,
              },
            })
            return persistAdvisorOutcome({
              ok: true,
              sandboxed: true,
              shadowed: true,
              kind: lifecycleAction.kind,
              lifecycle: lifecycleAction.lifecycle.lifecycle,
              label: lifecycleAction.lifecycle.label,
              memberCount: memberIds.length,
              candidateCount: lifecycleAction.lifecycle.candidates.length,
              channel: lifecycleAction.lifecycle.channel,
              guardrails: guardrails.summary,
              deliveryMode: 'send_later' as const,
              scheduledFor,
              timeZone,
              scheduledLabel: formatAdvisorScheduledLabel(scheduledFor, timeZone),
              previewRecipientCount: memberIds.length,
              previewRecipients,
              sandboxRouting: {
                ...buildSandboxRouting(lifecycleAction.lifecycle.channel),
                note: buildOutreachControlPlaneNote(lifecycleScheduleControlPlane.reason),
              },
              sent: 0,
              failed: 0,
              skipped: guardrails.summary.excludedCount,
              controlPlane: {
                mode: lifecycleScheduleControlPlane.mode,
                reason: lifecycleScheduleControlPlane.reason,
              },
            })
          }

          const scheduled = await scheduleCampaignSend(ctx.prisma, {
            clubId: input.clubId,
            type: lifecycleAction.lifecycle.campaignType,
            channel: lifecycleAction.lifecycle.channel,
            memberIds,
            recipients: eligibleRecipients,
            subject: lifecycleAction.lifecycle.subject,
            body: lifecycleAction.lifecycle.message,
            smsBody: lifecycleAction.lifecycle.smsBody,
            scheduledFor,
            timeZone,
            source: lifecycleAction.kind,
            actionKind: lifecycleAction.kind,
            guestTrialContext: lifecycleAction.lifecycle.guestTrialContext || null,
          })

          await persistAgentDecisionRecord(ctx.prisma, {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'outreachSend',
            targetType: 'advisor_lifecycle_campaign',
            targetId: advisorDraft?.id || advisorMessage?.id || null,
            mode: lifecycleScheduleControlPlane.mode,
            result: 'executed',
            summary: `${lifecycleAction.lifecycle.label} was scheduled live for ${formatAdvisorScheduledLabel(scheduledFor, timeZone)}.`,
            metadata: {
              actionKind: lifecycleAction.kind,
              deliveryMode: 'send_later',
              channel: lifecycleAction.lifecycle.channel,
              recipientCount: memberIds.length,
              scheduledFor,
              timeZone,
            },
          })

          return persistAdvisorOutcome({
            ok: true,
            kind: lifecycleAction.kind,
            lifecycle: lifecycleAction.lifecycle.lifecycle,
            label: lifecycleAction.lifecycle.label,
            memberCount: memberIds.length,
            candidateCount: lifecycleAction.lifecycle.candidates.length,
            channel: lifecycleAction.lifecycle.channel,
            guardrails: guardrails.summary,
            deliveryMode: 'send_later' as const,
            scheduledLabel: formatAdvisorScheduledLabel(scheduledFor, timeZone),
            ...scheduled,
          })
        }

        if (eligibleRecipients.length === 0) {
          return persistAdvisorOutcome({
            ok: true,
            kind: lifecycleAction.kind,
            lifecycle: lifecycleAction.lifecycle.lifecycle,
            label: lifecycleAction.lifecycle.label,
            memberCount: 0,
            candidateCount: lifecycleAction.lifecycle.candidates.length,
            channel: lifecycleAction.lifecycle.channel,
            guardrails: guardrails.summary,
            deliveryMode: 'send_now' as const,
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
            emailSent: 0,
            smsSent: 0,
          })
        }

        const lifecycleSendControlPlane = await requireOutreachControlPlane({
          targetType: 'advisor_lifecycle_campaign',
          targetId: advisorDraft?.id || advisorMessage?.id || null,
          deliveryMode: 'send_now',
          channel: lifecycleAction.lifecycle.channel,
          recipientCount: memberIds.length,
          actionKind: lifecycleAction.kind,
          summaryLabel: lifecycleAction.lifecycle.label,
        })

        if (lifecycleSendControlPlane.shadow) {
          await persistAgentDecisionRecord(ctx.prisma, {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'outreachSend',
            targetType: 'advisor_lifecycle_campaign',
            targetId: advisorDraft?.id || advisorMessage?.id || null,
            mode: lifecycleSendControlPlane.mode,
            result: 'shadowed',
            summary: `${lifecycleAction.lifecycle.label} was reviewed for live outreach but held in shadow mode.`,
            metadata: {
              actionKind: lifecycleAction.kind,
              deliveryMode: 'send_now',
              channel: lifecycleAction.lifecycle.channel,
              recipientCount: memberIds.length,
            },
          })
          return persistAdvisorOutcome({
            ok: true,
            sandboxed: true,
            shadowed: true,
            kind: lifecycleAction.kind,
            lifecycle: lifecycleAction.lifecycle.lifecycle,
            label: lifecycleAction.lifecycle.label,
            memberCount: memberIds.length,
            candidateCount: lifecycleAction.lifecycle.candidates.length,
            channel: lifecycleAction.lifecycle.channel,
            guardrails: guardrails.summary,
            deliveryMode: 'send_now' as const,
            previewRecipientCount: memberIds.length,
            previewRecipients,
            sandboxRouting: {
              ...buildSandboxRouting(lifecycleAction.lifecycle.channel),
              note: buildOutreachControlPlaneNote(lifecycleSendControlPlane.reason),
            },
            sent: 0,
            failed: 0,
            skipped: guardrails.summary.excludedCount,
            controlPlane: {
              mode: lifecycleSendControlPlane.mode,
              reason: lifecycleSendControlPlane.reason,
            },
          })
        }

        const sendResult = await runCreateCampaign(ctx.prisma, {
          clubId: input.clubId,
          type: lifecycleAction.lifecycle.campaignType,
          channel: lifecycleAction.lifecycle.channel,
          memberIds,
          recipients: eligibleRecipients,
          subject: lifecycleAction.lifecycle.subject,
          body: lifecycleAction.lifecycle.message,
          smsBody: lifecycleAction.lifecycle.smsBody,
          source: lifecycleAction.kind,
          guestTrialContext: lifecycleAction.lifecycle.guestTrialContext || null,
        })

        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'outreachSend',
          targetType: 'advisor_lifecycle_campaign',
          targetId: advisorDraft?.id || advisorMessage?.id || null,
          mode: lifecycleSendControlPlane.mode,
          result: 'executed',
          summary: `${lifecycleAction.lifecycle.label} sent live to ${sendResult.sent || 0} members.`,
          metadata: {
            actionKind: lifecycleAction.kind,
            deliveryMode: 'send_now',
            channel: lifecycleAction.lifecycle.channel,
            recipientCount: memberIds.length,
            sent: sendResult.sent || 0,
            failed: sendResult.failed || 0,
            skipped: (sendResult.skipped || 0) + guardrails.summary.excludedCount,
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: lifecycleAction.kind,
          lifecycle: lifecycleAction.lifecycle.lifecycle,
          label: lifecycleAction.lifecycle.label,
          memberCount: memberIds.length,
          candidateCount: lifecycleAction.lifecycle.candidates.length,
          channel: lifecycleAction.lifecycle.channel,
          ...sendResult,
          skipped: (sendResult.skipped || 0) + guardrails.summary.excludedCount,
          guardrails: guardrails.summary,
        })
      }

      if (input.action.kind === 'program_schedule') {
        const opsSessionDrafts = advisorDraft?.id
          ? await upsertProgrammingOpsSessionDraftRecords({
              prisma: ctx.prisma,
              clubId: input.clubId,
              createdByUserId: ctx.session.user.id,
              agentDraftId: advisorDraft.id,
              action: input.action,
            })
          : buildAdvisorProgrammingOpsSessionDrafts(input.action)

        return persistAdvisorOutcome({
          ok: true,
          kind: 'program_schedule' as const,
          savedAsDraft: true,
          proposalCount: opsSessionDrafts.length,
          opsDraftsCreated: opsSessionDrafts.length,
          opsSessionDrafts,
          primaryTitle: input.action.program.primary.title,
          goal: input.action.program.goal,
        })
      }

      if (input.action.kind === 'update_contact_policy') {
        const club = await ctx.prisma.club.findUniqueOrThrow({
          where: { id: input.clubId },
          select: { automationSettings: true },
        })
        const currentPolicy = resolveAdvisorContactPolicy({
          automationSettings: club.automationSettings,
          timeZone: input.action.policy.timeZone,
        })
        const existingAutomationSettings = (club.automationSettings as Record<string, any> | null) || {}
        const existingIntelligence = existingAutomationSettings.intelligence || {}

        await ctx.prisma.club.update({
          where: { id: input.clubId },
          data: {
            automationSettings: {
              ...existingAutomationSettings,
              intelligence: {
                ...existingIntelligence,
                timezone: input.action.policy.timeZone,
                contactPolicy: {
                  quietHours: input.action.policy.quietHours,
                  recentBookingLookbackDays: input.action.policy.recentBookingLookbackDays,
                  max24h: input.action.policy.max24h,
                  max7d: input.action.policy.max7d,
                  cooldownHours: input.action.policy.cooldownHours,
                },
              },
            },
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: 'update_contact_policy' as const,
          policy: input.action.policy,
          changedFields: input.action.policy.changes,
          previousPolicy: currentPolicy,
        })
      }

      if (input.action.kind === 'update_autonomy_policy') {
        const club = await ctx.prisma.club.findUniqueOrThrow({
          where: { id: input.clubId },
          select: { automationSettings: true },
        })
        const currentPolicy = resolveAdvisorAutonomyPolicy(club.automationSettings)
        const existingAutomationSettings = (club.automationSettings as Record<string, any> | null) || {}
        const existingIntelligence = existingAutomationSettings.intelligence || {}

        await ctx.prisma.club.update({
          where: { id: input.clubId },
          data: {
            automationSettings: {
              ...existingAutomationSettings,
              intelligence: {
                ...existingIntelligence,
                autonomyPolicy: {
                  welcome: input.action.policy.welcome,
                  slotFiller: input.action.policy.slotFiller,
                  checkIn: input.action.policy.checkIn,
                  retentionBoost: input.action.policy.retentionBoost,
                  reactivation: input.action.policy.reactivation,
                  trialFollowUp: input.action.policy.trialFollowUp,
                  renewalReactivation: input.action.policy.renewalReactivation,
                },
              },
            },
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: 'update_autonomy_policy' as const,
          policy: input.action.policy,
          changedFields: input.action.policy.changes,
          previousPolicy: currentPolicy,
        })
      }

      if (input.action.kind === 'update_sandbox_routing') {
        const club = await ctx.prisma.club.findUniqueOrThrow({
          where: { id: input.clubId },
          select: { automationSettings: true },
        })
        const currentPolicy = resolveAdvisorSandboxRoutingDraft(club.automationSettings)
        const existingAutomationSettings = (club.automationSettings as Record<string, any> | null) || {}
        const existingIntelligence = existingAutomationSettings.intelligence || {}

        await ctx.prisma.club.update({
          where: { id: input.clubId },
          data: {
            automationSettings: {
              ...existingAutomationSettings,
              intelligence: {
                ...existingIntelligence,
                sandboxRouting: {
                  mode: input.action.policy.mode,
                  emailRecipients: input.action.policy.emailRecipients,
                  smsRecipients: input.action.policy.smsRecipients,
                },
              },
            },
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: 'update_sandbox_routing' as const,
          policy: input.action.policy,
          changedFields: input.action.policy.changes,
          previousPolicy: currentPolicy,
        })
      }

      if (input.action.kind === 'update_admin_reminder_routing') {
        const currentUser = await ctx.prisma.user.findUniqueOrThrow({
          where: { id: ctx.session.user.id },
          select: {
            adminReminderChannel: true,
            adminReminderEmail: true,
            adminReminderPhone: true,
          },
        })
        const currentPolicy = resolveAdvisorAdminReminderRouting(currentUser)

        await ctx.prisma.user.update({
          where: { id: ctx.session.user.id },
          data: {
            adminReminderChannel: input.action.policy.channel,
            adminReminderEmail: input.action.policy.email || null,
            adminReminderPhone: input.action.policy.phone || null,
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: 'update_admin_reminder_routing' as const,
          policy: input.action.policy,
          changedFields: input.action.policy.changes,
          previousPolicy: currentPolicy,
        })
      }

      let audience = input.action.audience
      let cohortId = audience.cohortId
      let cohortName = audience.name

      if (!cohortId) {
        const audienceCount = await countCohortMembers(ctx.prisma, input.clubId, audience.filters as CohortFilter[])
        const created = await ctx.prisma.clubCohort.create({
          data: {
            clubId: input.clubId,
            name: audience.name,
            description: audience.description,
            filters: audience.filters as any,
            memberCount: audienceCount,
            createdBy: ctx.session.user.id,
          },
        })
        cohortId = created.id
        cohortName = created.name
        audience = { ...audience, cohortId, count: audienceCount }
      }

      const members = await queryCohortMembers(ctx.prisma, input.clubId, audience.filters as CohortFilter[])
      const eligibleMembers = applyAdvisorRecipientRules(
        members,
        input.action.campaign.execution.recipientRules,
      )
      const guardrails = await evaluateAdvisorContactGuardrails({
        prisma: ctx.prisma,
        clubId: input.clubId,
        type: input.action.campaign.type,
        requestedChannel: input.action.campaign.channel,
        candidates: eligibleMembers.map((member: any) => ({ memberId: member.id })).filter((candidate: any) => !!candidate.memberId),
        sessionId: null,
        timeZone: input.action.campaign.execution.timeZone || null,
        automationSettings: clubAutomationContext?.automationSettings,
        now: input.action.campaign.execution.mode === 'send_later' && input.action.campaign.execution.scheduledFor
          ? new Date(input.action.campaign.execution.scheduledFor)
          : new Date(),
      })
      const recipients = eligibleMembers
        .map((member: any) => {
          const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === member.id)
          if (!eligible) return null
          return {
            memberId: member.id,
            channel: eligible.channel,
          }
        })
        .filter(Boolean) as Array<{ memberId: string; channel: 'email' | 'sms' | 'both' }>
      const memberIds = recipients.map((recipient) => recipient.memberId)
      const previewRecipients = buildAdvisorSandboxPreviewRecipients(
        recipients,
        new Map(
          eligibleMembers.map((member: any) => [
            member.id,
            {
              name: member.name,
              email: member.email,
              phone: member.phone,
            },
          ]),
        ),
      )
      const excludedByRules = Math.max(0, members.length - eligibleMembers.length)
      const excludedByGuardrails = guardrails.summary.excludedCount

      if (eligibleMembers.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: excludedByRules > 0
            ? 'No members match the current delivery rules for this action.'
            : 'This action has no matching members to message.',
        })
      }

      if (input.action.campaign.execution.mode === 'save_draft') {
        return persistAdvisorOutcome({
          ok: true,
          kind: 'create_campaign' as const,
          cohortId,
          cohortName,
          memberCount: memberIds.length,
          audienceCount: members.length,
          excludedByRules,
          excludedByGuardrails,
          guardrails: guardrails.summary,
          deliveryMode: 'save_draft' as const,
          savedAsDraft: true,
        })
      }

      if (isSandboxExecution) {
        const scheduledFor = input.action.campaign.execution.scheduledFor
        const timeZone = input.action.campaign.execution.timeZone || 'America/New_York'
        return persistAdvisorOutcome({
          ok: true,
          sandboxed: true,
          kind: 'create_campaign' as const,
          cohortId,
          cohortName,
          memberCount: memberIds.length,
          audienceCount: members.length,
          excludedByRules,
          excludedByGuardrails,
          guardrails: guardrails.summary,
          deliveryMode: input.action.campaign.execution.mode,
          scheduledFor,
          timeZone,
          scheduledLabel: scheduledFor ? formatAdvisorScheduledLabel(scheduledFor, timeZone) : undefined,
          previewRecipientCount: memberIds.length,
          previewRecipients,
          sandboxRouting: buildSandboxRouting(input.action.campaign.channel),
          sent: 0,
          failed: 0,
          emailSent: 0,
          smsSent: 0,
        })
      }

      await enforceCampaignUsageLimits(
        input.clubId,
        input.action.campaign.channel,
        memberIds.length,
        guardrails.summary.deliveryBreakdown,
      )
      if (input.action.campaign.execution.mode === 'send_later') {
        const scheduledFor = input.action.campaign.execution.scheduledFor
        if (!scheduledFor) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Scheduled campaigns need a send time before they can be approved.',
          })
        }

        const timeZone = input.action.campaign.execution.timeZone || 'America/New_York'
        if (recipients.length === 0) {
          return persistAdvisorOutcome({
            ok: true,
            kind: 'create_campaign' as const,
            cohortId,
            cohortName,
            memberCount: 0,
            audienceCount: members.length,
            excludedByRules,
            excludedByGuardrails,
            guardrails: guardrails.summary,
            deliveryMode: 'send_later' as const,
            scheduled: 0,
            scheduledFor,
            timeZone,
            scheduledLabel: formatAdvisorScheduledLabel(scheduledFor, timeZone),
          })
        }

        const campaignScheduleControlPlane = await requireOutreachControlPlane({
          targetType: 'advisor_campaign',
          targetId: advisorDraft?.id || advisorMessage?.id || cohortId || null,
          deliveryMode: 'send_later',
          channel: input.action.campaign.channel,
          recipientCount: memberIds.length,
          actionKind: 'create_campaign',
          summaryLabel: cohortName,
        })

        if (campaignScheduleControlPlane.shadow) {
          await persistAgentDecisionRecord(ctx.prisma, {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'outreachSend',
            targetType: 'advisor_campaign',
            targetId: advisorDraft?.id || advisorMessage?.id || cohortId || null,
            mode: campaignScheduleControlPlane.mode,
            result: 'shadowed',
            summary: `${cohortName} was reviewed for scheduled outreach but held in shadow mode.`,
            metadata: {
              actionKind: 'create_campaign',
              deliveryMode: 'send_later',
              channel: input.action.campaign.channel,
              recipientCount: memberIds.length,
              scheduledFor,
              timeZone,
            },
          })
          return persistAdvisorOutcome({
            ok: true,
            sandboxed: true,
            shadowed: true,
            kind: 'create_campaign' as const,
            cohortId,
            cohortName,
            memberCount: memberIds.length,
            audienceCount: members.length,
            excludedByRules,
            excludedByGuardrails,
            guardrails: guardrails.summary,
            deliveryMode: 'send_later' as const,
            scheduledFor,
            timeZone,
            scheduledLabel: formatAdvisorScheduledLabel(scheduledFor, timeZone),
            previewRecipientCount: memberIds.length,
            previewRecipients,
            sandboxRouting: {
              ...buildSandboxRouting(input.action.campaign.channel),
              note: buildOutreachControlPlaneNote(campaignScheduleControlPlane.reason),
            },
            sent: 0,
            failed: 0,
            skipped: excludedByGuardrails,
            emailSent: 0,
            smsSent: 0,
            controlPlane: {
              mode: campaignScheduleControlPlane.mode,
              reason: campaignScheduleControlPlane.reason,
            },
          })
        }

        const scheduled = await scheduleCampaignSend(ctx.prisma, {
          clubId: input.clubId,
          type: input.action.campaign.type,
          channel: input.action.campaign.channel,
          memberIds,
          recipients,
          subject: input.action.campaign.subject,
          body: input.action.campaign.body,
          smsBody: input.action.campaign.smsBody,
          scheduledFor,
          timeZone,
          recipientRules: input.action.campaign.execution.recipientRules || null,
          actionKind: 'create_campaign',
          guestTrialContext: input.action.campaign.guestTrialContext || null,
          referralContext: input.action.campaign.referralContext || null,
        })

        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'outreachSend',
          targetType: 'advisor_campaign',
          targetId: advisorDraft?.id || advisorMessage?.id || cohortId || null,
          mode: campaignScheduleControlPlane.mode,
          result: 'executed',
          summary: `${cohortName} was scheduled live for ${formatAdvisorScheduledLabel(scheduledFor, timeZone)}.`,
          metadata: {
            actionKind: 'create_campaign',
            deliveryMode: 'send_later',
            channel: input.action.campaign.channel,
            recipientCount: memberIds.length,
            scheduledFor,
            timeZone,
          },
        })

        return persistAdvisorOutcome({
          ok: true,
          kind: 'create_campaign' as const,
          cohortId,
          cohortName,
          memberCount: memberIds.length,
          audienceCount: members.length,
          excludedByRules,
          excludedByGuardrails,
          guardrails: guardrails.summary,
          deliveryMode: 'send_later' as const,
          scheduledLabel: formatAdvisorScheduledLabel(scheduledFor, timeZone),
          ...scheduled,
        })
      }

      if (recipients.length === 0) {
        return persistAdvisorOutcome({
          ok: true,
          kind: 'create_campaign' as const,
          cohortId,
          cohortName,
          memberCount: 0,
          audienceCount: members.length,
          excludedByRules,
          excludedByGuardrails,
          guardrails: guardrails.summary,
          deliveryMode: 'send_now' as const,
          sent: 0,
          failed: 0,
          skipped: excludedByGuardrails,
          emailSent: 0,
          smsSent: 0,
        })
      }

      const campaignSendControlPlane = await requireOutreachControlPlane({
        targetType: 'advisor_campaign',
        targetId: advisorDraft?.id || advisorMessage?.id || cohortId || null,
        deliveryMode: 'send_now',
        channel: input.action.campaign.channel,
        recipientCount: memberIds.length,
        actionKind: 'create_campaign',
        summaryLabel: cohortName,
      })

      if (campaignSendControlPlane.shadow) {
        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'outreachSend',
          targetType: 'advisor_campaign',
          targetId: advisorDraft?.id || advisorMessage?.id || cohortId || null,
          mode: campaignSendControlPlane.mode,
          result: 'shadowed',
          summary: `${cohortName} was reviewed for live outreach but held in shadow mode.`,
          metadata: {
            actionKind: 'create_campaign',
            deliveryMode: 'send_now',
            channel: input.action.campaign.channel,
            recipientCount: memberIds.length,
          },
        })
        return persistAdvisorOutcome({
          ok: true,
          sandboxed: true,
          shadowed: true,
          kind: 'create_campaign' as const,
          cohortId,
          cohortName,
          memberCount: memberIds.length,
          audienceCount: members.length,
          excludedByRules,
          excludedByGuardrails,
          guardrails: guardrails.summary,
          deliveryMode: 'send_now' as const,
          previewRecipientCount: memberIds.length,
          previewRecipients,
          sandboxRouting: {
            ...buildSandboxRouting(input.action.campaign.channel),
            note: buildOutreachControlPlaneNote(campaignSendControlPlane.reason),
          },
          sent: 0,
          failed: 0,
          skipped: excludedByGuardrails,
          emailSent: 0,
          smsSent: 0,
          controlPlane: {
            mode: campaignSendControlPlane.mode,
            reason: campaignSendControlPlane.reason,
          },
        })
      }

      const result = await runCreateCampaign(ctx.prisma, {
        clubId: input.clubId,
        type: input.action.campaign.type,
        channel: input.action.campaign.channel,
        memberIds,
        recipients,
        subject: input.action.campaign.subject,
        body: input.action.campaign.body,
        smsBody: input.action.campaign.smsBody,
        guestTrialContext: input.action.campaign.guestTrialContext || null,
        referralContext: input.action.campaign.referralContext || null,
      })

      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: input.clubId,
        userId: ctx.session.user.id,
        action: 'outreachSend',
        targetType: 'advisor_campaign',
        targetId: advisorDraft?.id || advisorMessage?.id || cohortId || null,
        mode: campaignSendControlPlane.mode,
        result: 'executed',
        summary: `${cohortName} sent live to ${result.sent || 0} members.`,
        metadata: {
          actionKind: 'create_campaign',
          deliveryMode: 'send_now',
          channel: input.action.campaign.channel,
          recipientCount: memberIds.length,
          sent: result.sent || 0,
          failed: result.failed || 0,
          skipped: (result.skipped || 0) + excludedByGuardrails,
        },
      })

      return persistAdvisorOutcome({
        ok: true,
        kind: 'create_campaign' as const,
        cohortId,
        cohortName,
        memberCount: memberIds.length,
        audienceCount: members.length,
        excludedByRules,
        excludedByGuardrails,
        guardrails: guardrails.summary,
        deliveryMode: 'send_now' as const,
        ...result,
        skipped: (result.skipped || 0) + excludedByGuardrails,
      })
    }),

  updateAdvisorActionState: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      messageId: z.string().uuid(),
      disposition: z.enum(['declined', 'snoozed']),
      snoozeHours: z.number().int().min(1).max(168).default(24),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'approveActions',
        adminRole: adminAccess.role,
      })

      const message = await ctx.prisma.aIMessage.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          conversation: {
            select: {
              clubId: true,
              userId: true,
            },
          },
        },
      })

      if (!message || message.role !== 'assistant') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Advisor draft not found.',
        })
      }

      if (message.conversation.clubId !== input.clubId || message.conversation.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to update this advisor draft.',
        })
      }

      const action = getAdvisorActionFromMetadata(message.metadata) || extractAdvisorAction(message.content)
      if (!action) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This message does not contain an actionable advisor draft.',
        })
      }

      const updatedAt = new Date()
      const snoozedUntil = input.disposition === 'snoozed'
        ? new Date(updatedAt.getTime() + input.snoozeHours * 60 * 60 * 1000).toISOString()
        : undefined

      let metadata = withAdvisorActionRuntimeState(
        message.metadata,
        {
          status: input.disposition,
          ...(snoozedUntil ? { snoozedUntil } : {}),
          updatedAt: updatedAt.toISOString(),
        },
      )
      const advisorDraft = getAdvisorDraftFromMetadata(message.metadata)

      if (advisorDraft?.id) {
        const persistedDraft = await updateAdvisorDraftStatus({
          prisma: ctx.prisma,
          clubId: input.clubId,
          userId: ctx.session.user.id,
          draftId: advisorDraft.id,
          status: input.disposition,
        })

        if (persistedDraft) {
          const baseState =
            getAdvisorConversationStateFromMetadata(message.metadata) ||
            buildAdvisorConversationStateFromAction(action, updatedAt.toISOString())
          metadata = withAdvisorDraftMetadata(metadata, persistedDraft)
          metadata = {
            ...(metadata as Record<string, unknown>),
            advisorState: withAdvisorCurrentDraft(baseState, persistedDraft, updatedAt.toISOString()),
          }
        }
      }

      await ctx.prisma.aIMessage.update({
        where: { id: input.messageId },
        data: { metadata: metadata as any },
      })

      return {
        ok: true,
        status: input.disposition,
        snoozedUntil,
        actionKind: action.kind,
      }
    }),

  promoteOpsSessionDraft: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      opsSessionDraftId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'draftManage',
        adminRole: adminAccess.role,
      })

      try {
        const draft = await ctx.prisma.opsSessionDraft.findFirst({
          where: {
            id: input.opsSessionDraftId,
            clubId: input.clubId,
          },
          select: {
            id: true,
            title: true,
            dayOfWeek: true,
            timeSlot: true,
            startTime: true,
            endTime: true,
            format: true,
            skillLevel: true,
            maxPlayers: true,
            projectedOccupancy: true,
            estimatedInterestedMembers: true,
            confidence: true,
            note: true,
            sourceProposalId: true,
            origin: true,
            status: true,
            metadata: true,
            agentDraftId: true,
          },
        })

        if (!draft) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ops session draft not found.',
          })
        }

        if (draft.status === 'SESSION_DRAFT') {
          return {
            ok: true,
            id: draft.id,
            status: 'session_draft' as const,
            title: draft.title,
          }
        }

        const now = new Date()
        const actorLabel = ctx.session.user.name || ctx.session.user.email || 'Admin'
        const nextTimeline = appendOpsSessionDraftTimelineEvent(draft.metadata, {
          kind: 'promoted',
          label: 'Converted to session draft',
          detail: 'Manual scheduling handoff is ready for a real date, court, and owner.',
          actorLabel,
          createdAt: now.toISOString(),
        })
        const sessionDraftMetadata = {
          ...((draft.metadata as Record<string, any> | null) || {}),
          sessionDraft: {
            stage: 'internal_session_draft',
            createdAt: now.toISOString(),
            publishMode: 'manual_only',
            title: draft.title,
            recommendedWindow: `${draft.dayOfWeek} ${draft.startTime}-${draft.endTime}`,
            nextStep: 'Assign a real date, court, and owner before any live publish.',
          },
          timeline: nextTimeline,
        }

        const updated = await ctx.prisma.opsSessionDraft.update({
          where: { id: draft.id },
          data: {
            status: 'SESSION_DRAFT',
            sessionDraftedAt: now,
            metadata: sessionDraftMetadata as any,
          },
          select: {
            id: true,
            title: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            format: true,
            skillLevel: true,
            projectedOccupancy: true,
            estimatedInterestedMembers: true,
            confidence: true,
            note: true,
            sourceProposalId: true,
            origin: true,
            status: true,
            sessionDraftedAt: true,
          },
        })

        await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)

        return {
          ok: true,
          id: updated.id,
          status: 'session_draft' as const,
          title: updated.title,
          sessionDraftedAt: updated.sessionDraftedAt?.toISOString() || now.toISOString(),
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        log.warn('[Intelligence] promoteOpsSessionDraft failed:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unable to promote ops session draft right now.',
        })
      }
    }),

  updateOpsSessionDraftWorkflow: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      opsSessionDraftId: z.string().uuid(),
      action: z.enum([
        'assign_self',
        'assign_teammate',
        'reassign_owner',
        'ping_owner',
        'due_today',
        'due_tomorrow',
        'add_note',
        'reject',
        'archive',
        'reopen_ready',
      ]),
      assigneeUserId: z.string().optional(),
      note: z.string().trim().max(400).optional(),
      reason: z.string().trim().max(240).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'draftManage',
        adminRole: adminAccess.role,
      })

      const draft = await ctx.prisma.opsSessionDraft.findFirst({
        where: {
          id: input.opsSessionDraftId,
          clubId: input.clubId,
        },
        select: {
          id: true,
          title: true,
          note: true,
          status: true,
          dayOfWeek: true,
          metadata: true,
          agentDraftId: true,
        },
      })

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ops session draft not found.',
        })
      }

      const now = new Date()
      const actorLabel = ctx.session.user.name || ctx.session.user.email || 'Admin'
      const opsWorkflow = getOpsSessionDraftWorkflowMetadata(draft.metadata)
      const handoff = getOpsSessionDraftHandoffMetadata(draft.metadata)
      const metadataRoot =
        draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
          ? { ...(draft.metadata as Record<string, unknown>) }
          : {}
      let timelineEvent:
        | {
            kind: string
            label: string
            detail?: string | null
          }
        | null = null

      let status = draft.status as 'READY_FOR_OPS' | 'SESSION_DRAFT' | 'REJECTED' | 'ARCHIVED'
      let archivedAt: Date | null | undefined = undefined
      let note = draft.note

      switch (input.action) {
        case 'assign_self':
          opsWorkflow.ownerUserId = ctx.session.user.id
          opsWorkflow.ownerLabel = ctx.session.user.name || ctx.session.user.email || 'Assigned owner'
          opsWorkflow.ownerAssignedAt = now.toISOString()
          handoff.ownerUserId = ctx.session.user.id
          handoff.ownerLabel = String(opsWorkflow.ownerLabel)
          handoff.ownerBrief = `${String(opsWorkflow.ownerLabel)} now owns this draft. ${typeof handoff.nextStep === 'string' ? handoff.nextStep : 'Move the draft through ops review next.'}`
          timelineEvent = {
            kind: 'assigned',
            label: 'Assigned owner',
            detail: `${String(opsWorkflow.ownerLabel)} took ownership of this ops draft.`,
          }
          break
        case 'assign_teammate': {
          const assigneeUserId = input.assigneeUserId?.trim()
          if (!assigneeUserId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Choose a teammate to assign this ops draft.',
            })
          }

          const assignee = await ctx.prisma.clubAdmin.findFirst({
            where: {
              clubId: input.clubId,
              userId: assigneeUserId,
            },
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          })

          if (!assignee?.user) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'That teammate is not available in this club team.',
            })
          }

          const teammateLabel = assignee.user.name || assignee.user.email || 'Assigned teammate'
          opsWorkflow.ownerUserId = assignee.user.id
          opsWorkflow.ownerLabel = teammateLabel
          opsWorkflow.ownerAssignedAt = now.toISOString()
          handoff.ownerUserId = assignee.user.id
          handoff.ownerLabel = teammateLabel
          handoff.ownerBrief = `${teammateLabel} was assigned this ops draft. ${typeof handoff.nextStep === 'string' ? handoff.nextStep : 'Move the draft through ops review next.'}`
          timelineEvent = {
            kind: 'assigned_teammate',
            label: 'Assigned to teammate',
            detail: `${teammateLabel} was assigned as the next owner for this ops draft.`,
          }

          await createOpsOwnerPingRecord({
            prisma: ctx.prisma,
            clubId: input.clubId,
            userId: assignee.user.id,
            draftId: draft.id,
            draftTitle: `A draft was assigned to you: ${draft.title}`,
            dayOfWeek: draft.dayOfWeek,
            description: `${actorLabel} assigned ${draft.title} to you for ops follow-through.`,
            metadata: {
              proactiveKind: 'owner_due',
              reminderChannel: 'in_app',
            },
          })
          pushToUser(assignee.user.id, { type: 'invalidate', keys: ['notification.list'] })
          break
        }
        case 'reassign_owner': {
          const previousOwner = typeof opsWorkflow.ownerLabel === 'string' ? opsWorkflow.ownerLabel : 'the current owner'
          delete opsWorkflow.ownerUserId
          delete opsWorkflow.ownerLabel
          delete opsWorkflow.ownerAssignedAt
          delete handoff.ownerUserId
          delete handoff.ownerLabel
          delete handoff.ownerBrief
          timelineEvent = {
            kind: 'reassigned',
            label: 'Returned to unassigned queue',
            detail: `${previousOwner} was cleared so the team can reassign this ops draft.`,
          }
          break
        }
        case 'ping_owner': {
          if (typeof opsWorkflow.ownerUserId !== 'string' || !opsWorkflow.ownerUserId.trim()) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'This ops draft does not currently have an owner to ping.',
            })
          }
          const ownerLabel = typeof opsWorkflow.ownerLabel === 'string' ? opsWorkflow.ownerLabel : 'the current owner'
          opsWorkflow.lastEscalatedAt = now.toISOString()
          opsWorkflow.lastEscalatedBy = actorLabel
          timelineEvent = {
            kind: 'owner_pinged',
            label: 'Escalated to owner',
            detail: `${ownerLabel} was pinged to move this draft forward.`,
          }

          await createOpsOwnerPingRecord({
            prisma: ctx.prisma,
            clubId: input.clubId,
            userId: String(opsWorkflow.ownerUserId),
            draftId: draft.id,
            draftTitle: `Your ops draft needs attention: ${draft.title}`,
            dayOfWeek: draft.dayOfWeek,
            description: `${actorLabel} escalated ${draft.title} because it is due soon or overdue.`,
            metadata: {
              proactiveKind: 'owner_due',
              reminderChannel: 'in_app',
            },
          })
          pushToUser(String(opsWorkflow.ownerUserId), { type: 'invalidate', keys: ['notification.list'] })
          break
        }
        case 'due_today': {
          const dueAt = new Date(now)
          dueAt.setHours(18, 0, 0, 0)
          opsWorkflow.dueAt = dueAt.toISOString()
          opsWorkflow.dueLabel = 'Due today'
          timelineEvent = {
            kind: 'due_set',
            label: 'Marked due today',
            detail: `Ops review is now due by ${dueAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
          }
          break
        }
        case 'due_tomorrow': {
          const dueAt = new Date(now)
          dueAt.setDate(dueAt.getDate() + 1)
          dueAt.setHours(12, 0, 0, 0)
          opsWorkflow.dueAt = dueAt.toISOString()
          opsWorkflow.dueLabel = 'Due tomorrow'
          timelineEvent = {
            kind: 'due_set',
            label: 'Moved to tomorrow',
            detail: `Ops review is now due tomorrow by ${dueAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
          }
          break
        }
        case 'add_note':
          note = input.note?.trim() || draft.note
          opsWorkflow.lastNoteAt = now.toISOString()
          opsWorkflow.lastNoteBy = ctx.session.user.name || ctx.session.user.email || 'Admin'
          timelineEvent = {
            kind: 'note_added',
            label: 'Added ops note',
            detail: note,
          }
          break
        case 'reject':
          status = 'REJECTED'
          archivedAt = null
          opsWorkflow.blockedReason = input.reason?.trim() || 'Rejected in ops review'
          opsWorkflow.blockedAt = now.toISOString()
          timelineEvent = {
            kind: 'rejected',
            label: 'Rejected in ops review',
            detail: String(opsWorkflow.blockedReason),
          }
          break
        case 'archive':
          status = 'ARCHIVED'
          archivedAt = now
          opsWorkflow.archivedAt = now.toISOString()
          timelineEvent = {
            kind: 'archived',
            label: 'Archived draft',
            detail: 'Kept for traceability only.',
          }
          break
        case 'reopen_ready':
          status = 'READY_FOR_OPS'
          archivedAt = null
          delete opsWorkflow.blockedReason
          delete opsWorkflow.blockedAt
          delete opsWorkflow.archivedAt
          timelineEvent = {
            kind: 'reopened',
            label: 'Reopened for ops',
            detail: 'The draft is back in the ready-for-ops queue.',
          }
          break
      }

      opsWorkflow.lastAction = input.action
      opsWorkflow.lastActionAt = now.toISOString()

      const metadata = {
        ...metadataRoot,
        handoff,
        opsWorkflow,
        timeline: timelineEvent
          ? appendOpsSessionDraftTimelineEvent(draft.metadata, {
              ...timelineEvent,
              actorLabel,
              createdAt: now.toISOString(),
            })
          : getOpsSessionDraftTimelineMetadata(draft.metadata),
      }

      const updated = await ctx.prisma.opsSessionDraft.update({
        where: { id: draft.id },
        data: {
          status,
          archivedAt,
          note,
          metadata: metadata as any,
        },
        select: {
          id: true,
          status: true,
          title: true,
          dayOfWeek: true,
          note: true,
          metadata: true,
          updatedAt: true,
        },
      })

      await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)

      return {
        ok: true,
        id: updated.id,
        title: updated.title,
        dayOfWeek: updated.dayOfWeek,
        status: mapOpsSessionDraftStatusForMetadata(updated.status),
        note: updated.note,
        metadata: updated.metadata,
        updatedAt: updated.updatedAt,
      }
    }),

  prepareOpsSessionDraftPublish: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      opsSessionDraftId: z.string().uuid(),
      publishDate: z.string().min(10).max(10),
      title: z.string().trim().min(3).max(140).optional(),
      description: z.string().trim().max(400).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'draftManage',
        adminRole: adminAccess.role,
      })

      const publishDate = parseSessionDraftPublishDate(input.publishDate)
      const draft = await ctx.prisma.opsSessionDraft.findFirst({
        where: {
          id: input.opsSessionDraftId,
          clubId: input.clubId,
        },
        select: {
          id: true,
          title: true,
          description: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          format: true,
          skillLevel: true,
          status: true,
          metadata: true,
          agentDraftId: true,
        },
      })

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ops session draft not found.',
        })
      }

      if (draft.status !== 'SESSION_DRAFT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only session-draft items can be prepared for publish.',
        })
      }

      const now = new Date()
      const actorLabel = ctx.session.user.name || ctx.session.user.email || 'Admin'
      const metadataRoot = getOpsSessionDraftMetadataRoot(draft.metadata)
      const sessionDraft = getOpsSessionDraftSessionMetadata(draft.metadata)
      const publishReview = await buildOpsSessionDraftPublishReviewForDate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        draft: {
          id: draft.id,
          title: input.title?.trim() || String(sessionDraft.title || draft.title),
          startTime: draft.startTime,
          endTime: draft.endTime,
          format: draft.format,
          skillLevel: draft.skillLevel,
        },
        publishDate: input.publishDate,
      })
      const nextTimeline = appendOpsSessionDraftTimelineEvent(draft.metadata, {
        kind: 'publish_prepared',
        label: 'Prepared for controlled publish',
        detail:
          publishReview.status === 'blocked'
            ? `Prepared for ${input.publishDate}, but live publish is blocked until the duplicate is resolved.`
            : `Prepared for ${input.publishDate} at ${draft.startTime}-${draft.endTime}.`,
        actorLabel,
        createdAt: now.toISOString(),
      })

      const nextMetadata = {
        ...metadataRoot,
        sessionDraft: {
          ...sessionDraft,
          stage: 'publish_review',
          publishMode: 'controlled_manual',
          title: input.title?.trim() || String(sessionDraft.title || draft.title),
          description: input.description?.trim() || draft.description || null,
          targetDate: input.publishDate,
          targetDateIso: publishDate.toISOString(),
          preparedAt: now.toISOString(),
          preparedBy: actorLabel,
          review: publishReview,
          nextStep:
            publishReview.status === 'blocked'
              ? publishReview.recommendedAction
              : publishReview.status === 'warn'
                ? publishReview.recommendedAction
                : 'Final review is ready. Publish only when the date and format look right for the live schedule.',
        },
        timeline: nextTimeline,
      }

      const updated = await ctx.prisma.opsSessionDraft.update({
        where: { id: draft.id },
        data: {
          metadata: nextMetadata as any,
        },
        select: {
          id: true,
          title: true,
          metadata: true,
          updatedAt: true,
        },
      })

      await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)

      return {
        ok: true,
        id: updated.id,
        title: updated.title,
        metadata: updated.metadata,
        updatedAt: updated.updatedAt,
      }
    }),

  publishOpsSessionDraftToSchedule: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      opsSessionDraftId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: club?.automationSettings,
        action: 'schedulePublish',
        adminRole: adminAccess.role,
      })
      const controlPlane = evaluateAgentControlPlaneAction({
        automationSettings: club?.automationSettings,
        action: 'schedulePublish',
      })

      const draft = await ctx.prisma.opsSessionDraft.findFirst({
        where: {
          id: input.opsSessionDraftId,
          clubId: input.clubId,
        },
        select: {
          id: true,
          title: true,
          description: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          format: true,
          skillLevel: true,
          maxPlayers: true,
          status: true,
          metadata: true,
          agentDraftId: true,
          archivedAt: true,
        },
      })

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ops session draft not found.',
        })
      }

      if (draft.status !== 'SESSION_DRAFT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only session-draft items can be published.',
        })
      }

      const metadataRoot = getOpsSessionDraftMetadataRoot(draft.metadata)
      const sessionDraft = getOpsSessionDraftSessionMetadata(draft.metadata)
      const targetDateRaw = typeof sessionDraft.targetDate === 'string' ? sessionDraft.targetDate : null
      if (!targetDateRaw) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Prepare this session draft with a real publish date before publishing it live.',
        })
      }

      const targetDate = parseSessionDraftPublishDate(targetDateRaw)
      const existingSessionId =
        typeof sessionDraft.publishedPlaySessionId === 'string' ? sessionDraft.publishedPlaySessionId : null

      if (existingSessionId) {
        const existingSession = await ctx.prisma.playSession.findUnique({
          where: { id: existingSessionId },
          select: { id: true, title: true, date: true },
        })

        if (existingSession) {
          return {
            ok: true,
            alreadyPublished: true,
            playSessionId: existingSession.id,
            title: existingSession.title,
            date: existingSession.date,
          }
        }
      }

      const title =
        (typeof sessionDraft.title === 'string' && sessionDraft.title.trim()) ||
        draft.title
      const description =
        (typeof sessionDraft.description === 'string' && sessionDraft.description.trim()) ||
        draft.description ||
        null
      const publishReview = await buildOpsSessionDraftPublishReviewForDate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        draft: {
          id: draft.id,
          title,
          startTime: draft.startTime,
          endTime: draft.endTime,
          format: draft.format,
          skillLevel: draft.skillLevel,
        },
        publishDate: targetDateRaw,
      })
      const actorLabel = ctx.session.user.name || ctx.session.user.email || 'Admin'
      const now = new Date()

      if (publishReview.status === 'blocked') {
        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'schedulePublish',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: publishReview.summary,
          metadata: {
            reason: 'publish_review_blocked',
            publishDate: targetDateRaw,
          },
        })
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: publishReview.summary,
        })
      }

      if (!controlPlane.allowed) {
        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'schedulePublish',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: controlPlane.reason,
          metadata: {
            reason: 'control_plane_disabled',
            publishDate: targetDateRaw,
          },
        })
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: controlPlane.reason,
        })
      }

      if (controlPlane.shadow) {
        const nextTimeline = appendOpsSessionDraftTimelineEvent(draft.metadata, {
          kind: 'publish_shadowed',
          label: 'Shadow-reviewed publish',
          detail: `${title} was reviewed for live publish, but the control plane kept it in shadow mode.`,
          actorLabel,
          createdAt: now.toISOString(),
        })

        const updated = await ctx.prisma.opsSessionDraft.update({
          where: { id: draft.id },
          data: {
            metadata: {
              ...metadataRoot,
              sessionDraft: {
                ...sessionDraft,
                stage: 'publish_review',
                publishMode: 'controlled_manual',
                title,
                description,
                targetDate: targetDateRaw,
                targetDateIso: targetDate.toISOString(),
                review: publishReview,
                nextStep: 'Control plane shadow mode kept this publish out of the live schedule. Review the draft and move the action to live mode when you are ready.',
                lastControlPlaneDecisionAt: now.toISOString(),
                lastControlPlaneDecisionBy: actorLabel,
                lastControlPlaneMode: controlPlane.mode,
              },
              timeline: nextTimeline,
            } as any,
          },
          select: {
            id: true,
            status: true,
            metadata: true,
          },
        })

        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'schedulePublish',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'shadowed',
          summary: `${title} was reviewed for publish but held in shadow mode.`,
          metadata: {
            publishDate: targetDateRaw,
            reviewStatus: publishReview.status,
          },
        })

        await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)

        return {
          ok: true,
          shadowMode: true,
          status: mapOpsSessionDraftStatusForMetadata(updated.status),
          metadata: updated.metadata,
        }
      }

      const playSession = await ctx.prisma.playSession.create({
        data: {
          clubId: input.clubId,
          title,
          description,
          date: targetDate,
          startTime: draft.startTime,
          endTime: draft.endTime,
          format: draft.format,
          skillLevel: draft.skillLevel,
          maxPlayers: draft.maxPlayers,
          registeredCount: 0,
          status: 'SCHEDULED',
        },
        select: {
          id: true,
          title: true,
          date: true,
        },
      })

      const nextTimeline = appendOpsSessionDraftTimelineEvent(draft.metadata, {
        kind: 'published',
        label: 'Published to live schedule',
        detail: `${title} is now on the live schedule for ${targetDateRaw}.`,
        actorLabel,
        createdAt: now.toISOString(),
      })

      const updated = await ctx.prisma.opsSessionDraft.update({
        where: { id: draft.id },
        data: {
          status: 'ARCHIVED',
          archivedAt: now,
          metadata: {
            ...metadataRoot,
            sessionDraft: {
              ...sessionDraft,
              stage: 'published',
              publishMode: 'controlled_manual',
              title,
              description,
              targetDate: targetDateRaw,
              targetDateIso: targetDate.toISOString(),
              review: publishReview,
              publishedAt: now.toISOString(),
              publishedBy: actorLabel,
              publishedPlaySessionId: playSession.id,
              nextStep: 'The session is live on the schedule. Watch bookings and fill risk from the schedule view.',
            },
            timeline: nextTimeline,
          } as any,
        },
        select: {
          id: true,
          status: true,
          metadata: true,
        },
      })

      await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)
      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: input.clubId,
        userId: ctx.session.user.id,
        action: 'schedulePublish',
        targetType: 'ops_session_draft',
        targetId: draft.id,
        mode: controlPlane.mode,
        result: 'executed',
        summary: `${title} was published to the live schedule.`,
        metadata: {
          publishDate: targetDateRaw,
          playSessionId: playSession.id,
        },
      })

      return {
        ok: true,
        playSessionId: playSession.id,
        title: playSession.title,
        date: playSession.date,
        status: mapOpsSessionDraftStatusForMetadata(updated.status),
        metadata: updated.metadata,
      }
    }),

  updatePublishedOpsSessionDraft: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      opsSessionDraftId: z.string().uuid(),
      publishDate: z.string().min(10).max(10),
      title: z.string().trim().min(3).max(140),
      description: z.string().trim().max(400).optional(),
      startTime: z.string().trim().min(4).max(5),
      endTime: z.string().trim().min(4).max(5),
      maxPlayers: z.number().int().min(2).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: club?.automationSettings,
        action: 'scheduleLiveEdit',
        adminRole: adminAccess.role,
      })
      const controlPlane = evaluateAgentControlPlaneAction({
        automationSettings: club?.automationSettings,
        action: 'scheduleLiveEdit',
      })

      const draft = await ctx.prisma.opsSessionDraft.findFirst({
        where: {
          id: input.opsSessionDraftId,
          clubId: input.clubId,
        },
        select: {
          id: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          format: true,
          skillLevel: true,
          maxPlayers: true,
          status: true,
          metadata: true,
          agentDraftId: true,
          createdAt: true,
        },
      })

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ops session draft not found.',
        })
      }

      const sessionDraft = getOpsSessionDraftSessionMetadata(draft.metadata)
      const publishedPlaySessionId =
        typeof sessionDraft.publishedPlaySessionId === 'string'
          ? sessionDraft.publishedPlaySessionId
          : null

      if (!publishedPlaySessionId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This ops draft does not currently have a live session to edit.',
        })
      }

      const liveSession = await ctx.prisma.playSession.findFirst({
        where: {
          id: publishedPlaySessionId,
          clubId: input.clubId,
        },
        select: {
          id: true,
          title: true,
          description: true,
          date: true,
          startTime: true,
          endTime: true,
          format: true,
          skillLevel: true,
          maxPlayers: true,
          status: true,
          _count: {
            select: {
              bookings: {
                where: { status: 'CONFIRMED' },
              },
              waitlist: true,
            },
          },
        },
      })

      if (!liveSession) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'The live session for this ops draft no longer exists.',
        })
      }

      const liveDateKey = liveSession.date.toISOString().slice(0, 10)
      const structuralChange =
        input.publishDate !== liveDateKey
        || input.startTime !== liveSession.startTime
        || input.endTime !== liveSession.endTime
        || input.maxPlayers !== liveSession.maxPlayers
      const confirmedCount = liveSession._count.bookings
      const waitlistCount = liveSession._count.waitlist

      if (input.maxPlayers < confirmedCount) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Max players cannot drop below the ${confirmedCount} confirmed booking${confirmedCount === 1 ? '' : 's'} already on this live session.`,
        })
      }

      if (
        structuralChange
        && (liveSession.status === 'IN_PROGRESS' || liveSession.status === 'COMPLETED')
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only title and description can change once a live session is in progress or completed.',
        })
      }

      if (structuralChange && (confirmedCount > 0 || waitlistCount > 0)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This live session already has players attached, so structural changes should stay manual-only.',
        })
      }

      const publishDate = parseSessionDraftPublishDate(input.publishDate)
      const publishReview = await buildOpsSessionDraftPublishReviewForDate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        draft: {
          id: draft.id,
          title: input.title.trim(),
          startTime: input.startTime,
          endTime: input.endTime,
          format: draft.format,
          skillLevel: draft.skillLevel,
        },
        publishDate: input.publishDate,
        ignoreSessionId: liveSession.id,
      })
      const now = new Date()
      const actorLabel = ctx.session.user.name || ctx.session.user.email || 'Admin'
      const metadataRoot = getOpsSessionDraftMetadataRoot(draft.metadata)

      if (publishReview.status === 'blocked') {
        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'scheduleLiveEdit',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: publishReview.summary,
          metadata: {
            reason: 'publish_review_blocked',
            publishDate: input.publishDate,
            liveSessionId: liveSession.id,
          },
        })
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: publishReview.summary,
        })
      }

      if (!controlPlane.allowed) {
        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'scheduleLiveEdit',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: controlPlane.reason,
          metadata: {
            reason: 'control_plane_disabled',
            liveSessionId: liveSession.id,
          },
        })
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: controlPlane.reason,
        })
      }

      if (controlPlane.shadow) {
        const nextTimeline = appendOpsSessionDraftTimelineEvent(draft.metadata, {
          kind: 'live_edit_shadowed',
          label: 'Shadow-reviewed live edit',
          detail: `${input.title.trim()} was reviewed for a live edit, but the control plane kept the current session unchanged.`,
          actorLabel,
          createdAt: now.toISOString(),
        })

        const updatedDraft = await ctx.prisma.opsSessionDraft.update({
          where: { id: draft.id },
          data: {
            metadata: {
              ...metadataRoot,
              sessionDraft: {
                ...sessionDraft,
                review: publishReview,
                nextStep: 'Control plane shadow mode reviewed this live edit without changing the session. Move the action to live mode when you want the edit applied.',
                lastControlPlaneDecisionAt: now.toISOString(),
                lastControlPlaneDecisionBy: actorLabel,
                lastControlPlaneMode: controlPlane.mode,
              },
              timeline: nextTimeline,
            } as any,
          },
          select: {
            id: true,
            metadata: true,
            updatedAt: true,
          },
        })

        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'scheduleLiveEdit',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'shadowed',
          summary: `${input.title.trim()} was reviewed for a live edit but held in shadow mode.`,
          metadata: {
            publishDate: input.publishDate,
            liveSessionId: liveSession.id,
          },
        })

        await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)

        return {
          ok: true,
          shadowMode: true,
          id: updatedDraft.id,
          playSessionId: liveSession.id,
          title: liveSession.title,
          date: liveSession.date,
          metadata: updatedDraft.metadata,
          updatedAt: updatedDraft.updatedAt,
        }
      }

      const nextTimeline = appendOpsSessionDraftTimelineEvent(draft.metadata, {
        kind: 'live_edited',
        label: 'Edited live session',
        detail: `${input.title.trim()} was updated directly on the live schedule.`,
        actorLabel,
        createdAt: now.toISOString(),
      })

      const updatedLiveSession = await ctx.prisma.playSession.update({
        where: { id: liveSession.id },
        data: {
          title: input.title.trim(),
          description: input.description?.trim() || null,
          date: publishDate,
          startTime: input.startTime,
          endTime: input.endTime,
          maxPlayers: input.maxPlayers,
        },
        select: {
          id: true,
          title: true,
          date: true,
        },
      })

      const updatedDraft = await ctx.prisma.opsSessionDraft.update({
        where: { id: draft.id },
        data: {
          metadata: {
            ...metadataRoot,
            sessionDraft: {
              ...sessionDraft,
              review: publishReview,
              nextStep: 'The live session was edited after publish. Keep watching whether it now tracks to plan or needs a fill push.',
              lastLiveEditedAt: now.toISOString(),
              lastLiveEditedBy: actorLabel,
            },
            timeline: nextTimeline,
          } as any,
        },
        select: {
          id: true,
          metadata: true,
          updatedAt: true,
        },
      })

      await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)
      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: input.clubId,
        userId: ctx.session.user.id,
        action: 'scheduleLiveEdit',
        targetType: 'ops_session_draft',
        targetId: draft.id,
        mode: controlPlane.mode,
        result: 'executed',
        summary: `${input.title.trim()} was edited directly on the live schedule.`,
        metadata: {
          publishDate: input.publishDate,
          liveSessionId: updatedLiveSession.id,
        },
      })

      return {
        ok: true,
        id: updatedDraft.id,
        playSessionId: updatedLiveSession.id,
        title: updatedLiveSession.title,
        date: updatedLiveSession.date,
        metadata: updatedDraft.metadata,
        updatedAt: updatedDraft.updatedAt,
      }
    }),

  rollbackPublishedOpsSessionDraft: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      opsSessionDraftId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: club?.automationSettings,
        action: 'scheduleLiveRollback',
        adminRole: adminAccess.role,
      })
      const controlPlane = evaluateAgentControlPlaneAction({
        automationSettings: club?.automationSettings,
        action: 'scheduleLiveRollback',
      })

      const draft = await ctx.prisma.opsSessionDraft.findFirst({
        where: {
          id: input.opsSessionDraftId,
          clubId: input.clubId,
        },
        select: {
          id: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          format: true,
          skillLevel: true,
          maxPlayers: true,
          metadata: true,
          agentDraftId: true,
          createdAt: true,
        },
      })

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ops session draft not found.',
        })
      }

      const sessionDraft = getOpsSessionDraftSessionMetadata(draft.metadata)
      const publishedPlaySessionId =
        typeof sessionDraft.publishedPlaySessionId === 'string'
          ? sessionDraft.publishedPlaySessionId
          : null

      if (!publishedPlaySessionId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This ops draft does not currently have a live session to roll back.',
        })
      }

      const liveSession = await ctx.prisma.playSession.findFirst({
        where: {
          id: publishedPlaySessionId,
          clubId: input.clubId,
        },
        select: {
          id: true,
          title: true,
          description: true,
          date: true,
          startTime: true,
          endTime: true,
          format: true,
          skillLevel: true,
          maxPlayers: true,
          status: true,
          _count: {
            select: {
              bookings: {
                where: { status: 'CONFIRMED' },
              },
              waitlist: true,
            },
          },
        },
      })

      const plannedSession = buildOpsSessionDraftPlannedSnapshot(draft, sessionDraft)
      const aftercareReview = buildOpsSessionAftercareReview({
        draft: plannedSession,
        liveSession: liveSession
          ? {
              id: liveSession.id,
              title: liveSession.title,
              description: liveSession.description,
              date: liveSession.date,
              startTime: liveSession.startTime,
              endTime: liveSession.endTime,
              format: liveSession.format,
              skillLevel: liveSession.skillLevel,
              maxPlayers: liveSession.maxPlayers,
              status: liveSession.status,
              confirmedCount: liveSession._count.bookings,
              waitlistCount: liveSession._count.waitlist,
            }
          : null,
      })

      if (!liveSession) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'The live session for this ops draft no longer exists.',
        })
      }

      if (!aftercareReview.canRollback) {
        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'scheduleLiveRollback',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: aftercareReview.rollbackSummary,
          metadata: {
            reason: 'aftercare_blocked',
            liveSessionId: liveSession.id,
          },
        })
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: aftercareReview.rollbackSummary,
        })
      }

      const plannedDateKey = String(plannedSession.date).slice(0, 10)
      const rollbackReview = await buildOpsSessionDraftPublishReviewForDate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        draft: {
          id: draft.id,
          title: plannedSession.title,
          startTime: plannedSession.startTime,
          endTime: plannedSession.endTime,
          format: plannedSession.format,
          skillLevel: plannedSession.skillLevel,
        },
        publishDate: plannedDateKey,
        ignoreSessionId: liveSession.id,
      })

      if (rollbackReview.status === 'blocked') {
        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'scheduleLiveRollback',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: rollbackReview.summary,
          metadata: {
            reason: 'publish_review_blocked',
            liveSessionId: liveSession.id,
          },
        })
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: rollbackReview.summary,
        })
      }

      const now = new Date()
      const actorLabel = ctx.session.user.name || ctx.session.user.email || 'Admin'
      const metadataRoot = getOpsSessionDraftMetadataRoot(draft.metadata)

      if (!controlPlane.allowed) {
        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'scheduleLiveRollback',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: controlPlane.reason,
          metadata: {
            reason: 'control_plane_disabled',
            liveSessionId: liveSession.id,
          },
        })
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: controlPlane.reason,
        })
      }

      if (controlPlane.shadow) {
        const nextTimeline = appendOpsSessionDraftTimelineEvent(draft.metadata, {
          kind: 'live_rollback_shadowed',
          label: 'Shadow-reviewed rollback',
          detail: `${plannedSession.title} was reviewed for rollback, but the control plane kept the live session unchanged.`,
          actorLabel,
          createdAt: now.toISOString(),
        })

        const updatedDraft = await ctx.prisma.opsSessionDraft.update({
          where: { id: draft.id },
          data: {
            metadata: {
              ...metadataRoot,
              sessionDraft: {
                ...sessionDraft,
                review: rollbackReview,
                nextStep: 'Control plane shadow mode reviewed the rollback without changing the live session. Move this action to live mode when you are ready to restore the original plan.',
                lastControlPlaneDecisionAt: now.toISOString(),
                lastControlPlaneDecisionBy: actorLabel,
                lastControlPlaneMode: controlPlane.mode,
              },
              timeline: nextTimeline,
            } as any,
          },
          select: {
            id: true,
            metadata: true,
            updatedAt: true,
          },
        })

        await persistAgentDecisionRecord(ctx.prisma, {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          action: 'scheduleLiveRollback',
          targetType: 'ops_session_draft',
          targetId: draft.id,
          mode: controlPlane.mode,
          result: 'shadowed',
          summary: `${plannedSession.title} was reviewed for rollback but held in shadow mode.`,
          metadata: {
            liveSessionId: liveSession.id,
          },
        })

        await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)

        return {
          ok: true,
          shadowMode: true,
          id: updatedDraft.id,
          playSessionId: liveSession.id,
          title: liveSession.title,
          date: liveSession.date,
          metadata: updatedDraft.metadata,
          updatedAt: updatedDraft.updatedAt,
        }
      }

      const nextTimeline = appendOpsSessionDraftTimelineEvent(draft.metadata, {
        kind: 'live_rolled_back',
        label: 'Rolled back live session',
        detail: `${plannedSession.title} was restored back to the original publish plan.`,
        actorLabel,
        createdAt: now.toISOString(),
      })

      const updatedLiveSession = await ctx.prisma.playSession.update({
        where: { id: liveSession.id },
        data: {
          title: plannedSession.title,
          description: plannedSession.description,
          date: parseSessionDraftPublishDate(plannedDateKey),
          startTime: plannedSession.startTime,
          endTime: plannedSession.endTime,
          format: plannedSession.format as any,
          skillLevel: plannedSession.skillLevel as any,
          maxPlayers: plannedSession.maxPlayers,
        },
        select: {
          id: true,
          title: true,
          date: true,
        },
      })

      const updatedDraft = await ctx.prisma.opsSessionDraft.update({
        where: { id: draft.id },
        data: {
          metadata: {
            ...metadataRoot,
            sessionDraft: {
              ...sessionDraft,
              review: rollbackReview,
              nextStep: 'The live session is back on the original publish plan. Watch bookings and decide whether it still needs a fill action.',
              lastRollbackAt: now.toISOString(),
              lastRollbackBy: actorLabel,
            },
            timeline: nextTimeline,
          } as any,
        },
        select: {
          id: true,
          metadata: true,
          updatedAt: true,
        },
      })

      await syncAgentDraftOpsSessionDraftMetadata(ctx.prisma, draft.agentDraftId)
      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: input.clubId,
        userId: ctx.session.user.id,
        action: 'scheduleLiveRollback',
        targetType: 'ops_session_draft',
        targetId: draft.id,
        mode: controlPlane.mode,
        result: 'executed',
        summary: `${plannedSession.title} was rolled back to the original publish plan.`,
        metadata: {
          liveSessionId: updatedLiveSession.id,
        },
      })

      return {
        ok: true,
        id: updatedDraft.id,
        playSessionId: updatedLiveSession.id,
        title: updatedLiveSession.title,
        date: updatedLiveSession.date,
        metadata: updatedDraft.metadata,
        updatedAt: updatedDraft.updatedAt,
      }
    }),

  createOpsSessionDraftFromAdvisorDraft: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      advisorDraftId: z.string().uuid(),
      sourceProposalId: z.string().min(1).max(120),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'draftManage',
        adminRole: adminAccess.role,
      })

      try {
        const agentDraft = await ctx.prisma.agentDraft.findFirst({
          where: {
            id: input.advisorDraftId,
            clubId: input.clubId,
            createdByUserId: ctx.session.user.id,
          },
          select: {
            id: true,
            conversationId: true,
            originalIntent: true,
            workingAction: true,
          },
        })

        if (!agentDraft) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Programming draft not found.',
          })
        }

        const action = advisorActionSchema.parse(agentDraft.workingAction)
        if (action.kind !== 'program_schedule') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only programming drafts can create ops session drafts.',
          })
        }

        const availableSourceIds = new Set([
          action.program.primary.id,
          ...action.program.alternatives.map((proposal) => proposal.id),
        ])

        if (!availableSourceIds.has(input.sourceProposalId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Programming option not found in this draft.',
          })
        }

        const opsSessionDrafts = await upsertProgrammingOpsSessionDraftRecords({
          prisma: ctx.prisma,
          clubId: input.clubId,
          createdByUserId: ctx.session.user.id,
          agentDraftId: agentDraft.id,
          action,
          sourceProposalId: input.sourceProposalId,
        })

        const created = opsSessionDrafts.find((draft) => draft.sourceProposalId === input.sourceProposalId) || opsSessionDrafts[0]

        if (!created) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Could not create ops session draft.',
          })
        }

        return {
          ok: true,
          advisorDraftId: agentDraft.id,
          conversationId: agentDraft.conversationId,
          originalIntent: agentDraft.originalIntent,
          opsSessionDraft: created,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        log.warn('[Intelligence] createOpsSessionDraftFromAdvisorDraft failed:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not create ops session draft.',
        })
      }
    }),

  createFillSessionDraftFromSchedule: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      sessionId: z.string().min(1),
      channel: z.enum(['email', 'sms', 'both']).default('email'),
      candidateLimit: z.number().int().min(1).max(20).default(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'draftManage',
        adminRole: adminAccess.role,
      })
      await checkFeatureAccess(input.clubId, 'slot-filler')

      try {
        const existingFillDrafts = await ctx.prisma.agentDraft.findMany({
          where: {
            clubId: input.clubId,
            createdByUserId: ctx.session.user.id,
            kind: 'fill_session',
            status: {
              in: ['review_ready', 'sandboxed', 'draft_saved', 'approved', 'scheduled'],
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 12,
          select: {
            id: true,
            conversationId: true,
            originalIntent: true,
            workingAction: true,
          },
        })

        const existingDraft = existingFillDrafts.find((draft) => {
          const parsed = advisorActionSchema.safeParse(draft.workingAction)
          return parsed.success && parsed.data.kind === 'fill_session' && parsed.data.session.id === input.sessionId
        })

        if (existingDraft) {
          return {
            ok: true,
            reused: true,
            advisorDraftId: existingDraft.id,
            conversationId: existingDraft.conversationId,
            originalIntent: existingDraft.originalIntent,
          }
        }

        const sessionRecord = await ctx.prisma.playSession.findFirst({
          where: {
            id: input.sessionId,
            clubId: input.clubId,
          },
          select: {
            id: true,
            title: true,
            date: true,
            startTime: true,
            endTime: true,
            format: true,
            skillLevel: true,
            maxPlayers: true,
            clubCourt: {
              select: {
                name: true,
              },
            },
            _count: {
              select: {
                bookings: {
                  where: {
                    status: 'CONFIRMED',
                  },
                },
              },
            },
          },
        })

        if (!sessionRecord) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Session not found.',
          })
        }

        const normalizedSession = normalizeAdvisorSlotSession({
          id: sessionRecord.id,
          title: sessionRecord.title,
          date: sessionRecord.date,
          startTime: sessionRecord.startTime,
          endTime: sessionRecord.endTime,
          format: sessionRecord.format as string | null,
          skillLevel: sessionRecord.skillLevel as string | null,
          court: sessionRecord.clubCourt?.name || null,
          registered: sessionRecord._count.bookings,
          maxPlayers: sessionRecord.maxPlayers,
        })

        const userMessage = buildScheduleFillDraftUserMessage(normalizedSession)
        const slotFiller = await getSlotFillerRecommendations(ctx.prisma, {
          sessionId: input.sessionId,
          limit: input.candidateLimit,
        })
        const rawCandidates = (slotFiller.recommendations || [])
          .slice(0, input.candidateLimit)
          .map((candidate: any) => ({
            memberId: candidate.member?.id || candidate.memberId,
            name: candidate.member?.name || 'Unknown',
            score: Math.max(0, Math.min(100, Math.round(candidate.score || 0))),
            likelihood: candidate.estimatedLikelihood || undefined,
            email: candidate.member?.email || undefined,
          }))
          .filter((candidate: any) => !!candidate.memberId)

        const guardrails = await evaluateAdvisorContactGuardrails({
          prisma: ctx.prisma,
          clubId: input.clubId,
          type: 'SLOT_FILLER',
          requestedChannel: input.channel,
          candidates: rawCandidates.map((candidate: any) => ({ memberId: candidate.memberId })),
          sessionId: input.sessionId,
        })

        const eligibleCandidates = rawCandidates
          .map((candidate: any) => {
            const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
            if (!eligible) return null
            return {
              ...candidate,
              channel: eligible.channel,
            }
          })
          .filter(Boolean) as Array<{
            memberId: string
            name: string
            score: number
            likelihood?: 'high' | 'medium' | 'low'
            email?: string
            channel: 'email' | 'sms' | 'both'
          }>

        if (eligibleCandidates.length === 0) {
          const emptyConversation = await createAdvisorConversationFromAction({
            prisma: ctx.prisma,
            clubId: input.clubId,
            userId: ctx.session.user.id,
            title: userMessage,
            userMessage,
            assistantMessage: buildScheduleFillDraftNoCandidateMessage({
              session: normalizedSession,
              warning: guardrails.summary.warnings[0] || null,
            }),
          })

          return {
            ok: true,
            blocked: true,
            advisorDraftId: null,
            conversationId: emptyConversation.conversationId,
            originalIntent: userMessage,
          }
        }

        const club = await ctx.prisma.club.findUnique({
          where: { id: input.clubId },
          select: { name: true },
        })
        const clubName = club?.name || 'your club'
        const inviteMessage = input.channel === 'sms'
          ? `Hey {{name}}! A spot just opened in ${normalizedSession.title} on ${normalizedSession.date} at ${normalizedSession.startTime}. Want in?`
          : `Hi {{name}},\n\nA spot just opened in ${normalizedSession.title} on ${normalizedSession.date} at ${normalizedSession.startTime} at ${clubName}. I pulled together a shortlist of players who look like a strong fit.\n\nWant me to send the invites?\n\n— ${clubName} Team`

        const signals = await buildAdvisorPerformanceSignalForAction({
          prisma: ctx.prisma,
          clubId: input.clubId,
          type: 'SLOT_FILLER',
          requestedChannel: input.channel,
          advisorOutcomeKind: 'fill_session',
          days: 30,
        }).catch(() => null)

        const action = advisorActionSchema.parse({
          kind: 'fill_session',
          title: `Fill session: ${normalizedSession.title}`,
          summary: `${input.channel.toUpperCase()} invites for ${eligibleCandidates.length} matched players`,
          requiresApproval: true,
          session: normalizedSession,
          outreach: {
            channel: input.channel,
            candidateCount: eligibleCandidates.length,
            message: inviteMessage,
            candidates: eligibleCandidates,
            guardrails: guardrails.summary,
          },
          ...(signals ? { signals } : {}),
        })

        const conversation = await createAdvisorConversationFromAction({
          prisma: ctx.prisma,
          clubId: input.clubId,
          userId: ctx.session.user.id,
          title: userMessage,
          userMessage,
          assistantMessage: buildScheduleFillDraftAssistantMessage({
            session: normalizedSession,
            candidateCount: eligibleCandidates.length,
            channel: input.channel,
          }),
          action,
        })

        return {
          ok: true,
          reused: false,
          advisorDraftId: conversation.draftId,
          conversationId: conversation.conversationId,
          messageId: conversation.messageId,
          originalIntent: userMessage,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        log.warn('[Intelligence] createFillSessionDraftFromSchedule failed:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not prepare a slot-filler draft right now.',
        })
      }
    }),

  // ══════ AI Agent Dashboard ══════

  getAgentActivity: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), days: z.number().default(7), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date(Date.now() - input.days * 86400000)
      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: { clubId: input.clubId, createdAt: { gte: since } },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      })
      // Stats
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const weekAgo = new Date(Date.now() - 7 * 86400000)
      const actionsToday = logs.filter(l => l.createdAt >= today && l.status !== 'pending').length
      const actionsWeek = logs.filter(l => l.createdAt >= weekAgo && l.status !== 'pending').length
      const autoApproved = logs.filter(l => (l.reasoning as any)?.autoApproved === true).length
      const totalWithConfidence = logs.filter(l => {
        const reasoning = (l.reasoning as any) || {}
        return reasoning?.confidence != null || reasoning?.triggerRuntime?.confidence != null
      }).length
      const converted = logs.filter(l => l.status === 'converted').length
      const sent = logs.filter(l => ['sent', 'delivered', 'opened', 'clicked', 'converted'].includes(l.status)).length

      return {
        logs: logs.map(l => {
          const reasoning = (l.reasoning as any) || {}
          const triggerRuntime = reasoning.triggerRuntime || null

          return {
          id: l.id,
          type: l.type,
          status: l.status,
          channel: l.channel,
          createdAt: l.createdAt,
          memberName: l.user?.name || l.user?.email || 'Unknown',
          confidence: reasoning?.confidence ?? triggerRuntime?.confidence ?? null,
          autoApproved: reasoning?.autoApproved ?? null,
          transition: reasoning?.transition ?? null,
          sessionTitle: reasoning?.sessionTitle ?? null,
          triggerSource: triggerRuntime?.source ?? reasoning?.source ?? null,
          triggerOutcome: triggerRuntime?.outcome ?? null,
          triggerConfiguredMode: triggerRuntime?.configuredMode ?? null,
          triggerReasons: Array.isArray(triggerRuntime?.reasons) ? triggerRuntime.reasons : [],
          triggerPolicyOutcome: triggerRuntime?.policyOutcome ?? null,
          triggerRecipientCount: triggerRuntime?.recipientCount ?? null,
          triggerMembershipSignal: triggerRuntime?.membershipSignal ?? null,
          triggerMembershipConfidence: triggerRuntime?.membershipConfidence ?? null,
          membershipLifecycle: reasoning?.membershipLifecycle ?? null,
          membershipStatus: triggerRuntime?.membershipStatus ?? null,
          membershipType: triggerRuntime?.membershipType ?? null,
          sequenceStep: reasoning?.stepNumber ?? reasoning?.sequenceStep ?? null,
          }
        }),
        stats: {
          actionsToday,
          actionsWeek,
          autoApprovedPct: totalWithConfidence > 0 ? Math.round(autoApproved / totalWithConfidence * 100) : 0,
          conversionRate: sent > 0 ? Math.round(converted / sent * 100) : 0,
        },
      }
    }),

  getPendingActions: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const pending = await ctx.prisma.aIRecommendationLog.findMany({
        where: { clubId: input.clubId, status: 'pending' },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      return pending.map(p => {
        const reasoning = (p.reasoning as any) || {}
        const triggerRuntime = reasoning.triggerRuntime || null

        return {
          id: p.id,
          type: p.type,
          memberName: p.user?.name || p.user?.email || 'System',
          confidence: reasoning?.confidence ?? triggerRuntime?.confidence ?? null,
          description: describeAgentAction(p.type, reasoning),
          createdAt: p.createdAt,
          triggerSource: triggerRuntime?.source ?? reasoning?.source ?? null,
          triggerOutcome: triggerRuntime?.outcome ?? null,
          triggerConfiguredMode: triggerRuntime?.configuredMode ?? null,
          triggerReasons: Array.isArray(triggerRuntime?.reasons) ? triggerRuntime.reasons : [],
          triggerPolicyOutcome: triggerRuntime?.policyOutcome ?? null,
          triggerRecipientCount: triggerRuntime?.recipientCount ?? null,
          triggerMembershipSignal: triggerRuntime?.membershipSignal ?? null,
          triggerMembershipConfidence: triggerRuntime?.membershipConfidence ?? null,
          membershipLifecycle: reasoning?.membershipLifecycle ?? null,
          membershipStatus: triggerRuntime?.membershipStatus ?? null,
          membershipType: triggerRuntime?.membershipType ?? null,
          sequenceStep: reasoning?.stepNumber ?? reasoning?.sequenceStep ?? null,
        }
      })
    }),

  approveAction: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), actionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'approveActions',
        adminRole: adminAccess.role,
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'outreachSend',
        adminRole: adminAccess.role,
      })
      const action = await ctx.prisma.aIRecommendationLog.findUnique({
        where: { id: input.actionId },
        include: { user: { select: { id: true, email: true, name: true } }, club: { select: { name: true } } },
      })
      if (!action || action.clubId !== input.clubId) throw new TRPCError({ code: 'NOT_FOUND' })
      if (action.status !== 'pending') return { status: action.status, message: 'Already processed' }

      // Send email
      if (action.user?.email) {
        const { sendOutreachEmail } = await import('@/lib/email')
        const emailPayload = buildApprovedAgentMessage({
          type: action.type,
          clubName: action.club.name,
          clubId: action.clubId,
          memberName: action.user.name,
          reasoning: action.reasoning as any,
        })
        await sendOutreachEmail({
          to: action.user.email,
          subject: emailPayload.subject,
          body: emailPayload.body,
          clubName: action.club.name,
          bookingUrl: emailPayload.bookingUrl,
        })
      }
      await ctx.prisma.aIRecommendationLog.update({
        where: { id: input.actionId },
        data: { status: 'sent' },
      })
      return { status: 'sent', message: 'Approved and sent' }
    }),

  skipAction: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), actionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'approveActions',
        adminRole: adminAccess.role,
      })
      await ctx.prisma.aIRecommendationLog.update({
        where: { id: input.actionId },
        data: { status: 'skipped' },
      })
      return { status: 'skipped' }
    }),

  snoozeAction: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), actionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      assertAgentPermissionForAdmin({
        automationSettings: clubAutomationContext?.automationSettings,
        action: 'approveActions',
        adminRole: adminAccess.role,
      })
      await ctx.prisma.aIRecommendationLog.update({
        where: { id: input.actionId },
        data: { createdAt: new Date() },
      })
      return { status: 'snoozed' }
    }),

  // ══════════════════════════════════════════════════
  // ══════ COHORTS ═══════════════════════════════════
  // ══════════════════════════════════════════════════

  getLookalikeAudienceExport: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const members = await getLookalikeExportMembers(ctx.prisma, input.clubId)
      const { buildLookalikeAudienceExport } = await import('@/lib/ai/lookalike-export')
      const snapshot = buildLookalikeAudienceExport({ members })
      return {
        summary: snapshot.summary,
        audiences: snapshot.audiences,
      }
    }),

  previewLookalikeAudienceExportConfig: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      audienceKeys: z.array(z.enum([
        'healthy_paid_core',
        'high_value_loyalists',
        'new_successful_converters',
        'vip_advocates',
      ])).min(1),
      preset: z.enum([
        'generic_csv',
        'meta_custom_audience',
        'google_customer_match',
        'tiktok_custom_audience',
      ]).default('generic_csv'),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const members = await getLookalikeExportMembers(ctx.prisma, input.clubId)
      const {
        buildLookalikeAudienceExport,
        buildLookalikeExportPreview,
      } = await import('@/lib/ai/lookalike-export')
      const snapshot = buildLookalikeAudienceExport({ members })
      const preview = buildLookalikeExportPreview({
        snapshot,
        audienceKeys: input.audienceKeys,
        preset: input.preset,
      })

      if (!preview) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lookalike audience preview not available' })
      }

      return preview
    }),

  exportLookalikeAudienceCsv: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      audienceKeys: z.array(z.enum([
        'healthy_paid_core',
        'high_value_loyalists',
        'new_successful_converters',
        'vip_advocates',
      ])).min(1),
      preset: z.enum([
        'generic_csv',
        'meta_custom_audience',
        'google_customer_match',
        'tiktok_custom_audience',
      ]).default('generic_csv'),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const members = await getLookalikeExportMembers(ctx.prisma, input.clubId)
      const {
        buildLookalikeAudienceExport,
        buildLookalikeAudienceCsv,
        buildSelectedLookalikeAudience,
      } = await import('@/lib/ai/lookalike-export')
      const snapshot = buildLookalikeAudienceExport({ members })
      const audience = buildSelectedLookalikeAudience({
        snapshot,
        audienceKeys: input.audienceKeys,
      })

      if (!audience) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lookalike audience not found' })
      }

      const payload = buildLookalikeAudienceCsv({ audience, preset: input.preset })

      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: input.clubId,
        userId: ctx.session.user.id,
        action: 'lookalike_export',
        targetType: 'lookalike_audience',
        targetId: input.audienceKeys.join('|'),
        mode: input.preset,
        result: 'executed',
        summary: `Exported ${audience.name} as ${input.preset}.`,
        metadata: {
          audienceKeys: input.audienceKeys,
          audienceName: audience.name,
          audienceNames: snapshot.audiences
            .filter((entry) => input.audienceKeys.includes(entry.key))
            .map((entry) => entry.name),
          preset: input.preset,
          memberCount: payload.memberCount,
          fileName: payload.fileName,
        },
      })

      return payload
    }),

  // Data coverage for cohort filters — shows what % of active members have each field filled
  getCohortDataCoverage: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const rows: [{ total: bigint; has_gender: bigint; has_dob: bigint; has_skill: bigint; has_membership: bigint; has_city: bigint }] = await ctx.prisma.$queryRawUnsafe(`
        WITH active AS (
          SELECT DISTINCT psb."userId"
          FROM play_session_bookings psb
          JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE ps."clubId" = $1 AND psb.status = 'CONFIRMED'
        )
        SELECT
          COUNT(*)::bigint as total,
          SUM(CASE WHEN u.gender IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_gender,
          SUM(CASE WHEN u.date_of_birth IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_dob,
          SUM(CASE WHEN u.skill_level IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_skill,
          SUM(CASE WHEN u.membership_type IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_membership,
          SUM(CASE WHEN u.city IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_city
        FROM active a
        JOIN users u ON u.id = a."userId"
      `, input.clubId)
      const r = rows[0]
      const total = Number(r.total) || 1
      return {
        totalActive: Number(r.total),
        fields: {
          age: { filled: Number(r.has_dob), percent: Math.round(Number(r.has_dob) / total * 100) },
          gender: { filled: Number(r.has_gender), percent: Math.round(Number(r.has_gender) / total * 100) },
          skillLevel: { filled: Number(r.has_skill), percent: Math.round(Number(r.has_skill) / total * 100) },
          membershipType: { filled: Number(r.has_membership), percent: Math.round(Number(r.has_membership) / total * 100) },
          city: { filled: Number(r.has_city), percent: Math.round(Number(r.has_city) / total * 100) },
        },
      }
    }),

  // Infer gender from first names using LLM for members without gender data
  inferGenders: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const { inferGendersForClub } = await import('@/lib/ai/gender-inference')
      return inferGendersForClub(input.clubId)
    }),

  // Enrich all member data (gender + skill level) from events + LLM
  enrichMemberData: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const { enrichMemberData } = await import('@/lib/ai/gender-inference')
      return enrichMemberData(input.clubId)
    }),

  listCohorts: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const cohorts = await ctx.prisma.clubCohort.findMany({
        where: { clubId: input.clubId },
        orderBy: { createdAt: 'desc' },
        include: { creator: { select: { name: true, email: true } } },
      })
      // Refresh member counts (active members only)
      for (const c of cohorts) {
        try {
          const count = await countCohortMembers(ctx.prisma, input.clubId, c.filters as unknown as CohortFilter[])
          if (count !== c.memberCount) {
            await ctx.prisma.clubCohort.update({ where: { id: c.id }, data: { memberCount: count } })
            ;(c as any).memberCount = count
          }
        } catch {}
      }
      return cohorts
    }),

  createCohortFromSession: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      sessionId: z.string().uuid(),
      name: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const bookings = await ctx.prisma.playSessionBooking.findMany({
        where: { sessionId: input.sessionId, status: 'CONFIRMED' },
        include: { playSession: true },
        distinct: ['userId'],
      })
      if (bookings.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No confirmed participants in this session' })

      const session = bookings[0].playSession
      const userIds = bookings.map(b => b.userId)
      const name = input.name || `${session.title || 'Session'} — ${session.date?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || 'Unknown date'}`

      return ctx.prisma.clubCohort.create({
        data: {
          clubId: input.clubId,
          name,
          filters: [{ field: 'userId', op: 'in', value: userIds }] as any,
          memberCount: userIds.length,
          createdBy: ctx.session.user.id,
        },
      })
    }),

  createCohort: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      filters: z.array(z.object({
        field: z.string(),
        op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
        value: z.union([z.string(), z.number(), z.array(z.string())]),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // Count matching members
      const count = await countCohortMembers(ctx.prisma, input.clubId, input.filters)

      return ctx.prisma.clubCohort.create({
        data: {
          clubId: input.clubId,
          name: input.name,
          description: input.description,
          filters: input.filters as any,
          memberCount: count,
          createdBy: ctx.session.user.id,
        },
      })
    }),

  updateCohort: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      cohortId: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      filters: z.array(z.object({
        field: z.string(),
        op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
        value: z.union([z.string(), z.number(), z.array(z.string())]),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const data: any = { updatedAt: new Date() }
      if (input.name) data.name = input.name
      if (input.description !== undefined) data.description = input.description
      if (input.filters) {
        data.filters = input.filters
        data.memberCount = await countCohortMembers(ctx.prisma, input.clubId, input.filters)
      }
      return ctx.prisma.clubCohort.update({ where: { id: input.cohortId }, data })
    }),

  deleteCohort: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), cohortId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      await ctx.prisma.clubCohort.delete({ where: { id: input.cohortId } })
      return { success: true }
    }),

  getCohortMembers: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), cohortId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const cohort = await ctx.prisma.clubCohort.findUnique({ where: { id: input.cohortId } })
      if (!cohort) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cohort not found' })

      const filters = (cohort.filters as any[]) || []
      const members = await queryCohortMembers(ctx.prisma, input.clubId, filters, { limit: 500 })
      const exactCount = await countCohortMembers(ctx.prisma, input.clubId, filters)

      // Refresh count
      if (exactCount !== cohort.memberCount) {
        await ctx.prisma.clubCohort.update({
          where: { id: input.cohortId },
          data: { memberCount: exactCount, updatedAt: new Date() },
        }).catch(() => {})
      }

      return {
        cohort: {
          ...cohort,
          memberCount: exactCount,
        },
        members,
      }
    }),

  parseCohortFromText: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      text: z.string().min(3).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const parsed = await parseCohortPrompt(input.text)
      if (!parsed || !parsed.filters?.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not parse cohort description. Try being more specific.' })
      }
      const count = await countCohortMembers(ctx.prisma, input.clubId, parsed.filters)
      return { ...parsed, count }
    }),

  generateCohortCampaign: protectedProcedure
    .input(z.object({ clubId: z.string().uuid(), cohortId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const cohort = await ctx.prisma.clubCohort.findUnique({ where: { id: input.cohortId } })
      if (!cohort) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cohort not found' })

      const club = await ctx.prisma.club.findUnique({ where: { id: input.clubId }, select: { name: true } })
      const filters = (cohort.filters as any[]) || []
      const filterDesc = filters.map((f: any) => `${f.field} ${f.op} ${f.value}`).join(', ')
      const cohortMembers = await queryCohortMembers(ctx.prisma, input.clubId, filters, { limit: null })
      const cohortUserIds = cohortMembers.map((member: any) => member.id).filter(Boolean)

      // Fetch real behavioral data for this cohort
      const behaviorData = cohortUserIds.length > 0
        ? await ctx.prisma.$queryRawUnsafe<any[]>(`
        WITH cohort_users AS (
          SELECT UNNEST(ARRAY[${cohortUserIds.map((id: string) => `'${id.replace(/'/g, "''")}'`).join(',')}])::text as user_id
        )
        SELECT
          to_char(ps.date, 'Day') as day_name,
          EXTRACT(DOW FROM ps.date)::int as dow,
          EXTRACT(HOUR FROM ps."startTime"::time)::int as hour,
          ps.format,
          COUNT(*) as bookings
        FROM play_session_bookings b
        JOIN play_sessions ps ON ps.id = b."sessionId"
        WHERE b."userId" IN (SELECT user_id FROM cohort_users)
          AND ps."clubId" = $1          AND b.status = 'CONFIRMED'
          AND ps.date >= NOW() - INTERVAL '90 days'
          AND ps.date <= NOW()
        GROUP BY 1, 2, 3, 4
        ORDER BY bookings DESC
      `, input.clubId).catch(() => [])
        : []

      // Aggregate: top days, top hours, top formats
      const dayAgg: Record<string, number> = {}
      const hourAgg: Record<number, number> = {}
      const formatAgg: Record<string, number> = {}
      for (const r of behaviorData) {
        const day = (r.day_name || '').trim()
        dayAgg[day] = (dayAgg[day] || 0) + Number(r.bookings)
        hourAgg[r.hour] = (hourAgg[r.hour] || 0) + Number(r.bookings)
        if (r.format) formatAgg[r.format] = (formatAgg[r.format] || 0) + Number(r.bookings)
      }
      const topDays = Object.entries(dayAgg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, c]) => `${d} (${c} bookings)`)
      const topHours = Object.entries(hourAgg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, c]) => `${h}:00 (${c} bookings)`)
      const topFormats = Object.entries(formatAgg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, c]) => `${f} (${c} bookings)`)

      // Avg sessions per member
      const totalBookings = Object.values(dayAgg).reduce((a, b) => a + b, 0)
      const cohortMemberCount = cohortMembers.length
      const avgPerMember = cohortMemberCount > 0 ? (totalBookings / cohortMemberCount).toFixed(1) : '0'

      const { generateWithFallback } = await import('@/lib/ai/llm/provider')
      const result = await generateWithFallback({
        system: `You are a marketing expert for sports/pickleball clubs. Generate 3 DIFFERENT campaign strategies for a member cohort. Each strategy has a different goal and timing. You have REAL behavioral data — use it.

Return ONLY valid JSON — an array of 3 objects:
[
  {
    "strategy": "before_peak",
    "strategyLabel": "Peak Day Boost",
    "subjectLine": "email subject (max 60 chars)",
    "body": "email body (2-3 paragraphs, with {{name}} placeholder)",
    "channel": "email",
    "bestTimeToSend": "day and time (1-2 days before their peak play day)",
    "tone": "friendly/exciting",
    "reasoning": "1 sentence based on data"
  },
  {
    "strategy": "re_engage",
    "strategyLabel": "Re-engage Inactive",
    "subjectLine": "...",
    "body": "... (win-back message for less active members in this cohort)",
    "channel": "email",
    "bestTimeToSend": "Monday or Tuesday morning (fresh start of week)",
    "tone": "warm/personal",
    "reasoning": "..."
  },
  {
    "strategy": "slot_filler",
    "strategyLabel": "Last-Minute Fill",
    "subjectLine": "...",
    "body": "... (urgency-driven, limited spots, tomorrow/today)",
    "channel": "sms",
    "bestTimeToSend": "day before their peak play day, evening",
    "tone": "urgent/fomo",
    "reasoning": "..."
  }
]`,
        prompt: `Club: ${club?.name || 'Sports Club'}
Cohort: "${cohort.name}" — ${cohort.description || 'No description'}
Filters: ${filterDesc}
Members: ${cohortMemberCount}

REAL BEHAVIORAL DATA (last 90 days):
- Most popular play days: ${topDays.join(', ') || 'No data'}
- Most popular play hours: ${topHours.join(', ') || 'No data'}
- Preferred formats: ${topFormats.join(', ') || 'No data'}
- Avg sessions per member (90d): ${avgPerMember}
- Total bookings: ${totalBookings}

Generate 3 campaign strategies with different goals and timings based on the data above.`,
        tier: 'fast',
        maxTokens: 1500,
      })

      try {
        const text = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const campaigns = JSON.parse(text)
        return { campaigns: Array.isArray(campaigns) ? campaigns : [campaigns] }
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to parse AI response' })
      }
    }),

  previewCohort: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      filters: z.array(z.object({
        field: z.string(),
        op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
        value: z.union([z.string(), z.number(), z.array(z.string())]),
      })),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const count = await countCohortMembers(ctx.prisma, input.clubId, input.filters)
      return { count }
    }),

  // ── Cross-Data Insights ──

  getInsightsSocialClusters: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      // Find groups of 3+ players who shared ≥5 sessions
      const pairs = await ctx.prisma.$queryRaw<Array<{
        user1: string; name1: string; user2: string; name2: string; shared: bigint
      }>>`
        SELECT b1."userId" as user1, u1.name as name1,
               b2."userId" as user2, u2.name as name2,
               COUNT(DISTINCT b1."sessionId")::bigint as shared
        FROM play_session_bookings b1
        JOIN play_session_bookings b2 ON b1."sessionId" = b2."sessionId" AND b1."userId" < b2."userId"
        JOIN play_sessions ps ON ps.id = b1."sessionId"
        JOIN users u1 ON u1.id = b1."userId"
        JOIN users u2 ON u2.id = b2."userId"
        WHERE ps."clubId" = ${input.clubId}
          AND b1.status = 'CONFIRMED' AND b2.status = 'CONFIRMED'
        GROUP BY b1."userId", u1.name, b2."userId", u2.name
        HAVING COUNT(DISTINCT b1."sessionId") >= 5
        ORDER BY shared DESC
        LIMIT 100
      `
      // Build clusters from pair edges using simple union-find
      const parent = new Map<string, string>()
      const nameMap = new Map<string, string>()
      const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)! } return x }
      const union = (a: string, b: string) => { parent.set(find(a), find(b)) }
      for (const p of pairs) {
        nameMap.set(p.user1, p.name1 || p.user1)
        nameMap.set(p.user2, p.name2 || p.user2)
        if (!parent.has(p.user1)) parent.set(p.user1, p.user1)
        if (!parent.has(p.user2)) parent.set(p.user2, p.user2)
        union(p.user1, p.user2)
      }
      const clusterMap = new Map<string, string[]>()
      parent.forEach((_, id) => {
        const root = find(id)
        const list = clusterMap.get(root) || []
        list.push(id)
        clusterMap.set(root, list)
      })
      const clusters: Array<{ members: Array<{ id: string; name: string }>; size: number }> = []
      clusterMap.forEach((ids) => {
        if (ids.length >= 3) {
          clusters.push({ members: ids.map(id => ({ id, name: nameMap.get(id) || id })), size: ids.length })
        }
      })
      return clusters
        .sort((a, b) => b.size - a.size)
        .slice(0, 20)
    }),

  getInsightsBookingLeadTime: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const data = await ctx.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT
          CASE
            WHEN EXTRACT(EPOCH FROM (ps.date - psb."bookedAt")) / 86400 < 0 THEN 'same_day'
            WHEN EXTRACT(EPOCH FROM (ps.date - psb."bookedAt")) / 86400 < 1 THEN 'last_minute'
            WHEN EXTRACT(EPOCH FROM (ps.date - psb."bookedAt")) / 86400 < 3 THEN '1_3_days'
            WHEN EXTRACT(EPOCH FROM (ps.date - psb."bookedAt")) / 86400 < 7 THEN '3_7_days'
            ELSE 'week_plus'
          END as bucket,
          COUNT(*)::bigint as count
        FROM play_session_bookings psb
        JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE ps."clubId" = ${input.clubId} AND psb.status = 'CONFIRMED'
        GROUP BY bucket
        ORDER BY count DESC
      `
      const total = data.reduce((s, d) => s + Number(d.count), 0)
      return {
        buckets: data.map(d => ({ label: d.bucket, count: Number(d.count), pct: total > 0 ? Math.round(Number(d.count) / total * 100) : 0 })),
        total,
      }
    }),

  getInsightsCancellationPatterns: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const [byFormat, byDay, topCancellers] = await Promise.all([
        ctx.prisma.$queryRaw<Array<{ format: string; total: bigint; cancelled: bigint }>>`
          SELECT ps.format, COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE psb.status = 'CANCELLED')::bigint as cancelled
          FROM play_session_bookings psb
          JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE ps."clubId" = ${input.clubId}
          GROUP BY ps.format
        `,
        ctx.prisma.$queryRaw<Array<{ dow: number; total: bigint; cancelled: bigint }>>`
          SELECT EXTRACT(DOW FROM ps.date)::int as dow, COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE psb.status = 'CANCELLED')::bigint as cancelled
          FROM play_session_bookings psb
          JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE ps."clubId" = ${input.clubId}
          GROUP BY dow
        `,
        ctx.prisma.$queryRaw<Array<{ user_id: string; name: string; cancelled: bigint; total: bigint }>>`
          SELECT psb."userId" as user_id, u.name,
            COUNT(*) FILTER (WHERE psb.status = 'CANCELLED')::bigint as cancelled,
            COUNT(*)::bigint as total
          FROM play_session_bookings psb
          JOIN users u ON u.id = psb."userId"
          JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE ps."clubId" = ${input.clubId}
          GROUP BY psb."userId", u.name
          HAVING COUNT(*) FILTER (WHERE psb.status = 'CANCELLED') >= 3
          ORDER BY cancelled DESC
          LIMIT 10
        `,
      ])
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return {
        byFormat: byFormat.map(r => ({ format: r.format, total: Number(r.total), cancelled: Number(r.cancelled), rate: Number(r.total) > 0 ? Math.round(Number(r.cancelled) / Number(r.total) * 100) : 0 })),
        byDay: byDay.map(r => ({ day: dayNames[r.dow] || String(r.dow), total: Number(r.total), cancelled: Number(r.cancelled), rate: Number(r.total) > 0 ? Math.round(Number(r.cancelled) / Number(r.total) * 100) : 0 })),
        topCancellers: topCancellers.map(r => ({ userId: r.user_id, name: r.name, cancelled: Number(r.cancelled), total: Number(r.total) })),
      }
    }),

  getInsightsSkillMigration: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      // Track skill levels played by each user per month
      const data = await ctx.prisma.$queryRaw<Array<{ user_id: string; month: string; skill_level: string }>>`
        SELECT psb."userId" as user_id,
          TO_CHAR(ps.date, 'YYYY-MM') as month,
          MODE() WITHIN GROUP (ORDER BY ps."skillLevel") as skill_level
        FROM play_session_bookings psb
        JOIN play_sessions ps ON ps.id = psb."sessionId"
        WHERE ps."clubId" = ${input.clubId} AND psb.status = 'CONFIRMED'
          AND ps."skillLevel" IS NOT NULL AND ps."skillLevel" != 'ALL_LEVELS'
        GROUP BY psb."userId", TO_CHAR(ps.date, 'YYYY-MM')
        ORDER BY user_id, month
      `
      // Detect transitions
      const transitions: Array<{ from: string; to: string; count: number }> = []
      const transMap = new Map<string, number>()
      let prevUser = '', prevLevel = ''
      for (const row of data) {
        if (row.user_id === prevUser && row.skill_level !== prevLevel) {
          const key = `${prevLevel}→${row.skill_level}`
          transMap.set(key, (transMap.get(key) || 0) + 1)
        }
        prevUser = row.user_id
        prevLevel = row.skill_level
      }
      transMap.forEach((count, key) => {
        const [from, to] = key.split('→')
        transitions.push({ from, to, count })
      })
      return transitions.sort((a, b) => b.count - a.count)
    }),

  getInsightsChurnRiskBySocialGraph: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      // Find players whose top partner hasn't played in 30+ days
      const atRiskPairs = await ctx.prisma.$queryRaw<Array<{
        user_id: string; user_name: string; partner_id: string; partner_name: string;
        shared_sessions: bigint; partner_last_played: Date | null;
      }>>`
        WITH partner_pairs AS (
          SELECT b1."userId" as user_id, b2."userId" as partner_id,
            COUNT(DISTINCT b1."sessionId")::bigint as shared_sessions
          FROM play_session_bookings b1
          JOIN play_session_bookings b2 ON b1."sessionId" = b2."sessionId" AND b1."userId" != b2."userId"
          JOIN play_sessions ps ON ps.id = b1."sessionId"
          WHERE ps."clubId" = ${input.clubId} AND b1.status = 'CONFIRMED' AND b2.status = 'CONFIRMED'
          GROUP BY b1."userId", b2."userId"
          HAVING COUNT(DISTINCT b1."sessionId") >= 5
        ),
        partner_activity AS (
          SELECT pp.user_id, pp.partner_id, pp.shared_sessions,
            MAX(ps2.date) as partner_last_played
          FROM partner_pairs pp
          LEFT JOIN play_session_bookings psb2 ON psb2."userId" = pp.partner_id AND psb2.status = 'CONFIRMED'
          LEFT JOIN play_sessions ps2 ON ps2.id = psb2."sessionId" AND ps2."clubId" = ${input.clubId}
          GROUP BY pp.user_id, pp.partner_id, pp.shared_sessions
        )
        SELECT pa.user_id, u1.name as user_name, pa.partner_id, u2.name as partner_name,
          pa.shared_sessions, pa.partner_last_played
        FROM partner_activity pa
        JOIN users u1 ON u1.id = pa.user_id
        JOIN users u2 ON u2.id = pa.partner_id
        WHERE pa.partner_last_played < CURRENT_DATE - INTERVAL '30 days'
          OR pa.partner_last_played IS NULL
        ORDER BY pa.shared_sessions DESC
        LIMIT 30
      `
      return atRiskPairs.map(p => ({
        userId: p.user_id, userName: p.user_name,
        partnerId: p.partner_id, partnerName: p.partner_name,
        sharedSessions: Number(p.shared_sessions),
        partnerLastPlayed: p.partner_last_played?.toISOString().split('T')[0] || null,
      }))
    }),

  getInsightsFillRate: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const data = await ctx.prisma.$queryRaw<Array<{
        format: string; dow: number; time_bucket: string;
        avg_fill: number; session_count: bigint;
      }>>`
        SELECT ps.format,
          EXTRACT(DOW FROM ps.date)::int as dow,
          CASE
            WHEN ps."startTime" < '12:00' THEN 'morning'
            WHEN ps."startTime" < '17:00' THEN 'afternoon'
            ELSE 'evening'
          END as time_bucket,
          ROUND(AVG(
            CASE WHEN ps."maxPlayers" > 0
              THEN (SELECT COUNT(*) FROM play_session_bookings b WHERE b."sessionId" = ps.id AND b.status = 'CONFIRMED')::numeric / ps."maxPlayers" * 100
              ELSE 0 END
          ))::int as avg_fill,
          COUNT(*)::bigint as session_count
        FROM play_sessions ps
        WHERE ps."clubId" = ${input.clubId} AND ps.status IN ('COMPLETED', 'SCHEDULED')
        GROUP BY ps.format, dow, time_bucket
        HAVING COUNT(*) >= 3
        ORDER BY avg_fill DESC
      `
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return data.map(r => ({
        format: r.format, day: dayNames[r.dow] || String(r.dow), timeBucket: r.time_bucket,
        avgFill: r.avg_fill, sessionCount: Number(r.session_count),
      }))
    }),

  // ── Integration Health Snapshot ──
  getIntegrationHealthSnapshot: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubId = input.clubId
      const now = new Date()

      const [memberRows, sessionRows, bookingRows, courtCount, connector] = await Promise.all([
        ctx.prisma.$queryRawUnsafe<[{
          total: bigint
          has_email: bigint
          has_phone: bigint
          has_gender: bigint
          has_dob: bigint
          has_skill: bigint
          has_membership: bigint
          has_city: bigint
          has_zip: bigint
          has_dupr: bigint
        }]>(`
          SELECT
            COUNT(*)::bigint as total,
            SUM(CASE WHEN u.email IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_email,
            SUM(CASE WHEN u.phone IS NOT NULL AND u.phone != '' THEN 1 ELSE 0 END)::bigint as has_phone,
            SUM(CASE WHEN u.gender IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_gender,
            SUM(CASE WHEN u.date_of_birth IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_dob,
            SUM(CASE WHEN u.skill_level IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_skill,
            SUM(CASE WHEN u.membership_type IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_membership,
            SUM(CASE WHEN u.city IS NOT NULL AND u.city != '' THEN 1 ELSE 0 END)::bigint as has_city,
            SUM(CASE WHEN u.zip_code IS NOT NULL AND u.zip_code != '' THEN 1 ELSE 0 END)::bigint as has_zip,
            SUM(CASE WHEN u.dupr_rating_doubles IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_dupr
          FROM club_followers cf
          JOIN users u ON u.id = cf.user_id
          WHERE cf.club_id = $1
        `, clubId),

        ctx.prisma.$queryRawUnsafe<[{
          total: bigint
          has_title: bigint
          has_format: bigint
          has_skill: bigint
          has_court: bigint
          has_price: bigint
          has_description: bigint
        }]>(`
          SELECT
            COUNT(*)::bigint as total,
            SUM(CASE WHEN title IS NOT NULL AND title != '' THEN 1 ELSE 0 END)::bigint as has_title,
            SUM(CASE WHEN format IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_format,
            SUM(CASE WHEN "skillLevel" IS NOT NULL AND "skillLevel" != 'ALL_LEVELS' THEN 1 ELSE 0 END)::bigint as has_skill,
            SUM(CASE WHEN "courtId" IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_court,
            SUM(CASE WHEN "pricePerSlot" IS NOT NULL AND "pricePerSlot" > 0 THEN 1 ELSE 0 END)::bigint as has_price,
            SUM(CASE WHEN description IS NOT NULL AND description != '' THEN 1 ELSE 0 END)::bigint as has_description
          FROM play_sessions
          WHERE "clubId" = $1
        `, clubId),

        ctx.prisma.$queryRawUnsafe<[{
          total: bigint
          has_cancelled_at: bigint
          has_checked_in: bigint
          confirmed: bigint
          cancelled: bigint
          no_show: bigint
        }]>(`
          SELECT
            COUNT(*)::bigint as total,
            SUM(CASE WHEN psb."cancelledAt" IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_cancelled_at,
            SUM(CASE WHEN psb."checkedInAt" IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_checked_in,
            SUM(CASE WHEN psb.status = 'CONFIRMED' THEN 1 ELSE 0 END)::bigint as confirmed,
            SUM(CASE WHEN psb.status = 'CANCELLED' THEN 1 ELSE 0 END)::bigint as cancelled,
            SUM(CASE WHEN psb.status = 'NO_SHOW' THEN 1 ELSE 0 END)::bigint as no_show
          FROM play_session_bookings psb
          JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE ps."clubId" = $1
        `, clubId),

        ctx.prisma.clubCourt.count({ where: { clubId, isActive: true } }),

        ctx.prisma.clubConnector.findFirst({
          where: { clubId, status: { not: 'disconnected' } },
          select: {
            provider: true,
            status: true,
            lastSyncAt: true,
            lastSyncResult: true,
            lastError: true,
            autoSync: true,
            syncIntervalHours: true,
          },
        }),
      ])

      const pct = (n: bigint, t: bigint) => Number(t) > 0 ? Math.round(Number(n) / Number(t) * 100) : 0
      const m = memberRows[0]
      const s = sessionRows[0]
      const b = bookingRows[0]

      const snapshot = buildIntegrationHealthSnapshot({
        coverage: {
          members: {
            total: Number(m.total),
            fields: {
              email: { filled: Number(m.has_email), percent: pct(m.has_email, m.total), label: 'Email' },
              phone: { filled: Number(m.has_phone), percent: pct(m.has_phone, m.total), label: 'Phone' },
              gender: { filled: Number(m.has_gender), percent: pct(m.has_gender, m.total), label: 'Gender' },
              dateOfBirth: { filled: Number(m.has_dob), percent: pct(m.has_dob, m.total), label: 'Date of Birth' },
              skillLevel: { filled: Number(m.has_skill), percent: pct(m.has_skill, m.total), label: 'Skill Level' },
              membershipType: { filled: Number(m.has_membership), percent: pct(m.has_membership, m.total), label: 'Membership' },
              city: { filled: Number(m.has_city), percent: pct(m.has_city, m.total), label: 'City' },
              zipCode: { filled: Number(m.has_zip), percent: pct(m.has_zip, m.total), label: 'Zip Code' },
              duprDoubles: { filled: Number(m.has_dupr), percent: pct(m.has_dupr, m.total), label: 'DUPR Rating' },
            },
          },
          sessions: {
            total: Number(s.total),
            fields: {
              title: { filled: Number(s.has_title), percent: pct(s.has_title, s.total), label: 'Title' },
              format: { filled: Number(s.has_format), percent: pct(s.has_format, s.total), label: 'Format' },
              skillLevel: { filled: Number(s.has_skill), percent: pct(s.has_skill, s.total), label: 'Skill Level' },
              court: { filled: Number(s.has_court), percent: pct(s.has_court, s.total), label: 'Court' },
              price: { filled: Number(s.has_price), percent: pct(s.has_price, s.total), label: 'Price' },
              description: { filled: Number(s.has_description), percent: pct(s.has_description, s.total), label: 'Description' },
            },
          },
          bookings: {
            total: Number(b.total),
            fields: {
              confirmed: { filled: Number(b.confirmed), percent: pct(b.confirmed, b.total), label: 'Confirmed' },
              cancelled: { filled: Number(b.cancelled), percent: pct(b.cancelled, b.total), label: 'Cancelled' },
              noShow: { filled: Number(b.no_show), percent: pct(b.no_show, b.total), label: 'No-Show' },
              cancelledAt: { filled: Number(b.has_cancelled_at), percent: pct(b.has_cancelled_at, b.total), label: 'Cancel Date' },
              checkedInAt: { filled: Number(b.has_checked_in), percent: pct(b.has_checked_in, b.total), label: 'Check-in' },
            },
          },
          courts: { total: courtCount },
        },
        connector: connector
          ? {
              provider: connector.provider,
              status: connector.status,
              lastSyncAt: connector.lastSyncAt,
              lastSyncResult: connector.lastSyncResult as Record<string, unknown> | null,
              lastError: connector.lastError,
              autoSync: connector.autoSync,
              syncIntervalHours: connector.syncIntervalHours,
            }
          : null,
        now,
      })

      return {
        ...snapshot,
        anomalyQueue: await syncIntegrationAnomalyHistory({
          prisma: ctx.prisma,
          clubId,
          queue: snapshot.anomalyQueue,
          now,
        }),
      }
    }),

  // ── Data Coverage Checklist ──
  getDataCoverageChecklist: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubId = input.clubId

      const [memberRows, sessionRows, bookingRows, courtCount, connector] = await Promise.all([
        ctx.prisma.$queryRawUnsafe<[{
          total: bigint; has_email: bigint; has_phone: bigint; has_gender: bigint;
          has_dob: bigint; has_skill: bigint; has_membership: bigint; has_city: bigint;
          has_zip: bigint; has_dupr: bigint;
        }]>(`
          SELECT
            COUNT(*)::bigint as total,
            SUM(CASE WHEN u.email IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_email,
            SUM(CASE WHEN u.phone IS NOT NULL AND u.phone != '' THEN 1 ELSE 0 END)::bigint as has_phone,
            SUM(CASE WHEN u.gender IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_gender,
            SUM(CASE WHEN u.date_of_birth IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_dob,
            SUM(CASE WHEN u.skill_level IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_skill,
            SUM(CASE WHEN u.membership_type IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_membership,
            SUM(CASE WHEN u.city IS NOT NULL AND u.city != '' THEN 1 ELSE 0 END)::bigint as has_city,
            SUM(CASE WHEN u.zip_code IS NOT NULL AND u.zip_code != '' THEN 1 ELSE 0 END)::bigint as has_zip,
            SUM(CASE WHEN u.dupr_rating_doubles IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_dupr
          FROM club_followers cf
          JOIN users u ON u.id = cf.user_id
          WHERE cf.club_id = $1
        `, clubId),

        ctx.prisma.$queryRawUnsafe<[{
          total: bigint; has_title: bigint; has_format: bigint; has_skill: bigint;
          has_court: bigint; has_price: bigint; has_description: bigint;
        }]>(`
          SELECT
            COUNT(*)::bigint as total,
            SUM(CASE WHEN title IS NOT NULL AND title != '' THEN 1 ELSE 0 END)::bigint as has_title,
            SUM(CASE WHEN format IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_format,
            SUM(CASE WHEN "skillLevel" IS NOT NULL AND "skillLevel" != 'ALL_LEVELS' THEN 1 ELSE 0 END)::bigint as has_skill,
            SUM(CASE WHEN "courtId" IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_court,
            SUM(CASE WHEN "pricePerSlot" IS NOT NULL AND "pricePerSlot" > 0 THEN 1 ELSE 0 END)::bigint as has_price,
            SUM(CASE WHEN description IS NOT NULL AND description != '' THEN 1 ELSE 0 END)::bigint as has_description
          FROM play_sessions
          WHERE "clubId" = $1
        `, clubId),

        ctx.prisma.$queryRawUnsafe<[{
          total: bigint; has_cancelled_at: bigint; has_checked_in: bigint;
          confirmed: bigint; cancelled: bigint; no_show: bigint;
        }]>(`
          SELECT
            COUNT(*)::bigint as total,
            SUM(CASE WHEN psb."cancelledAt" IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_cancelled_at,
            SUM(CASE WHEN psb."checkedInAt" IS NOT NULL THEN 1 ELSE 0 END)::bigint as has_checked_in,
            SUM(CASE WHEN psb.status = 'CONFIRMED' THEN 1 ELSE 0 END)::bigint as confirmed,
            SUM(CASE WHEN psb.status = 'CANCELLED' THEN 1 ELSE 0 END)::bigint as cancelled,
            SUM(CASE WHEN psb.status = 'NO_SHOW' THEN 1 ELSE 0 END)::bigint as no_show
          FROM play_session_bookings psb
          JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE ps."clubId" = $1
        `, clubId),

        ctx.prisma.clubCourt.count({ where: { clubId, isActive: true } }),

        ctx.prisma.clubConnector.findFirst({
          where: { clubId, status: { not: 'disconnected' } },
          select: { provider: true, status: true, lastSyncAt: true },
        }),
      ])

      const pct = (n: bigint, t: bigint) => Number(t) > 0 ? Math.round(Number(n) / Number(t) * 100) : 0
      const m = memberRows[0]
      const s = sessionRows[0]
      const b = bookingRows[0]

      return {
        members: {
          total: Number(m.total),
          fields: {
            email: { filled: Number(m.has_email), percent: pct(m.has_email, m.total), label: 'Email' },
            phone: { filled: Number(m.has_phone), percent: pct(m.has_phone, m.total), label: 'Phone' },
            gender: { filled: Number(m.has_gender), percent: pct(m.has_gender, m.total), label: 'Gender' },
            dateOfBirth: { filled: Number(m.has_dob), percent: pct(m.has_dob, m.total), label: 'Date of Birth' },
            skillLevel: { filled: Number(m.has_skill), percent: pct(m.has_skill, m.total), label: 'Skill Level' },
            membershipType: { filled: Number(m.has_membership), percent: pct(m.has_membership, m.total), label: 'Membership' },
            city: { filled: Number(m.has_city), percent: pct(m.has_city, m.total), label: 'City' },
            zipCode: { filled: Number(m.has_zip), percent: pct(m.has_zip, m.total), label: 'Zip Code' },
            duprDoubles: { filled: Number(m.has_dupr), percent: pct(m.has_dupr, m.total), label: 'DUPR Rating' },
          },
        },
        sessions: {
          total: Number(s.total),
          fields: {
            title: { filled: Number(s.has_title), percent: pct(s.has_title, s.total), label: 'Title' },
            format: { filled: Number(s.has_format), percent: pct(s.has_format, s.total), label: 'Format' },
            skillLevel: { filled: Number(s.has_skill), percent: pct(s.has_skill, s.total), label: 'Skill Level' },
            court: { filled: Number(s.has_court), percent: pct(s.has_court, s.total), label: 'Court' },
            price: { filled: Number(s.has_price), percent: pct(s.has_price, s.total), label: 'Price' },
            description: { filled: Number(s.has_description), percent: pct(s.has_description, s.total), label: 'Description' },
          },
        },
        bookings: {
          total: Number(b.total),
          fields: {
            confirmed: { filled: Number(b.confirmed), percent: pct(b.confirmed, b.total), label: 'Confirmed' },
            cancelled: { filled: Number(b.cancelled), percent: pct(b.cancelled, b.total), label: 'Cancelled' },
            noShow: { filled: Number(b.no_show), percent: pct(b.no_show, b.total), label: 'No-Show' },
            cancelledAt: { filled: Number(b.has_cancelled_at), percent: pct(b.has_cancelled_at, b.total), label: 'Cancel Date' },
            checkedInAt: { filled: Number(b.has_checked_in), percent: pct(b.has_checked_in, b.total), label: 'Check-in' },
          },
        },
        courts: { total: courtCount },
        connector: connector ? {
          provider: connector.provider,
          status: connector.status,
          lastSyncAt: connector.lastSyncAt?.toISOString() || null,
        } : null,
      }
    }),

  // ── Event Marketing Pipeline ──
  // "Fill This Session" — generate audience + AI message + preview in one call
  generateEventCampaign: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      sessionId: z.string(),
      maxRecipients: z.number().int().min(1).max(50).default(20),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // 1. Load session details
      const session = await ctx.prisma.playSession.findUnique({
        where: { id: input.sessionId },
        include: {
          bookings: { where: { status: 'CONFIRMED' }, include: { user: { select: { id: true, name: true, email: true } } } },
          clubCourt: { select: { name: true } },
        },
      })
      if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })

      const spotsLeft = (session.maxPlayers || 8) - session.bookings.length
      if (spotsLeft <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Session is already full' })

      const club = await ctx.prisma.club.findUnique({ where: { id: input.clubId }, select: { name: true } })

      // 2. Get slot filler recommendations (reuse existing scoring)
      const bookedUserIds = new Set(session.bookings.map(b => b.userId))
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const candidates: any[] = await ctx.prisma.$queryRawUnsafe(`
        SELECT u.id, u.name, u.email, u.phone,
          COUNT(DISTINCT psb."sessionId")::int as total_bookings,
          (CURRENT_DATE - MAX(ps.date)::date)::int as days_since_last,
          COUNT(*) FILTER (WHERE ps.format::text = $2)::int as format_match,
          COUNT(*) FILTER (WHERE ps."skillLevel"::text = $3)::int as skill_match
        FROM club_followers cf
        JOIN users u ON u.id = cf.user_id
        JOIN play_session_bookings psb ON psb."userId" = u.id AND psb.status = 'CONFIRMED'
        JOIN play_sessions ps ON ps.id = psb."sessionId" AND ps."clubId" = $1
        WHERE cf.club_id = $1
          AND u.id NOT IN (${Array.from(bookedUserIds).map((_, i) => `$${i + 5}`).join(',') || "''"})
          AND psb."bookedAt" >= $4
        GROUP BY u.id, u.name, u.email, u.phone
        ORDER BY format_match DESC, skill_match DESC, days_since_last ASC
        LIMIT $${bookedUserIds.size + 5}
      `, input.clubId, session.format || '', session.skillLevel || 'ALL_LEVELS', ninetyDaysAgo, ...Array.from(bookedUserIds), input.maxRecipients)

      // 3. Build partner-aware social proof per candidate
      const { getFrequentPartnerIds } = await import('@/lib/ai/partners')
      const confirmedNames = session.bookings.map(b => b.user?.name?.split(' ')[0]).filter(Boolean)

      const audience = await Promise.all(candidates.map(async (c) => {
        let socialProof = ''
        try {
          const partnerIds = await getFrequentPartnerIds(ctx.prisma as any, c.id, input.clubId, 3)
          const partnerBooked = session.bookings.filter(b => partnerIds.includes(b.userId)).map(b => b.user?.name?.split(' ')[0]).filter(Boolean)
          if (partnerBooked.length > 0) {
            socialProof = `Your partner ${partnerBooked[0]} is already signed up!`
          } else if (confirmedNames.length > 0) {
            socialProof = `${confirmedNames.slice(0, 3).join(', ')} and others are playing.`
          }
        } catch {}
        return {
          id: c.id,
          name: c.name || c.email?.split('@')[0] || 'Player',
          email: c.email,
          phone: c.phone,
          totalBookings: c.total_bookings,
          daysSinceLast: c.days_since_last,
          formatMatch: c.format_match,
          socialProof,
        }
      }))

      // 4. Generate AI message
      const sessionDate = session.date instanceof Date
        ? session.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        : String(session.date)
      const sessionTime = `${session.startTime || ''} - ${session.endTime || ''}`
      const formatLabel = (session.format || 'Session').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

      const subject = `${formatLabel} ${sessionDate} — ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left`
      const body = `Join us for ${formatLabel} at ${club?.name || 'the club'} on ${sessionDate}, ${sessionTime}. ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} remaining!`
      const bookingUrl = `https://app.iqsport.ai/clubs/${input.clubId}/intelligence/sessions`

      return {
        session: {
          id: session.id,
          title: session.title || formatLabel,
          date: sessionDate,
          time: sessionTime,
          court: session.clubCourt?.name || null,
          spotsLeft,
          registered: session.bookings.length,
          maxPlayers: session.maxPlayers,
        },
        audience,
        message: { subject, body, bookingUrl },
        clubName: club?.name || '',
      }
    }),

  // Send event campaign to selected recipients
  sendEventCampaign: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      sessionId: z.string(),
      recipientIds: z.array(z.string()).min(1).max(50),
      subject: z.string().min(1),
      body: z.string().min(1),
      channel: z.enum(['email', 'sms', 'both']).default('email'),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminAccess = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const clubAutomationContext = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      await enforceManualLiveOutreachGate({
        prisma: ctx.prisma,
        clubId: input.clubId,
        userId: ctx.session.user.id,
        automationSettings: clubAutomationContext?.automationSettings,
        adminRole: adminAccess.role,
        targetType: 'manual_event_campaign',
        targetId: input.sessionId,
        actionKind: 'create_campaign',
        channel: input.channel,
        recipientCount: input.recipientIds.length,
        label: `Event campaign for ${input.recipientIds.length} recipients`,
      })

      const club = await ctx.prisma.club.findUnique({ where: { id: input.clubId }, select: { name: true } })
      const session = await ctx.prisma.playSession.findUnique({
        where: { id: input.sessionId },
        select: { title: true, date: true, startTime: true, endTime: true, maxPlayers: true, format: true },
      })
      if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })

      const recipients = await ctx.prisma.user.findMany({
        where: { id: { in: input.recipientIds } },
        select: { id: true, name: true, email: true, phone: true },
      })

      const { sendSlotFillerInviteEmail } = await import('@/lib/email')
      const { checkAntiSpam } = await import('@/lib/ai/anti-spam')

      let sent = 0, skipped = 0, errors = 0
      const spotsLeft = (session.maxPlayers || 8) - await ctx.prisma.playSessionBooking.count({ where: { sessionId: input.sessionId, status: 'CONFIRMED' } })
      const sessionDate = session.date instanceof Date
        ? session.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : String(session.date)

      for (const user of recipients) {
        // Anti-spam check
        const spamCheck = await checkAntiSpam({
          prisma: ctx.prisma, userId: user.id, clubId: input.clubId,
          type: 'SLOT_FILLER', sessionId: input.sessionId,
        })
        if (!spamCheck.allowed) { skipped++; continue }

        try {
          if (input.channel !== 'sms' && user.email) {
            await sendSlotFillerInviteEmail({
              to: user.email,
              memberName: user.name || user.email.split('@')[0],
              clubName: club?.name || 'Your Club',
              sessionTitle: session.title || 'Session',
              sessionDate,
              sessionTime: `${session.startTime} - ${session.endTime}`,
              spotsLeft,
              bookingUrl: `https://app.iqsport.ai/clubs/${input.clubId}/intelligence/sessions`,
              customSubject: input.subject,
              customMessage: input.body,
            })
          }

          // Log
          await ctx.prisma.aIRecommendationLog.create({
            data: {
              clubId: input.clubId, userId: user.id, type: 'SLOT_FILLER',
              channel: input.channel, sessionId: input.sessionId,
              variantId: 'event_campaign_manual', status: 'sent',
              reasoning: { source: 'event_marketing_pipeline', subject: input.subject } as any,
            },
          }).catch(() => {})

          sent++
        } catch (err: any) {
          console.error(`[EventCampaign] Failed for ${user.email}:`, err.message)
          errors++
        }
      }

      return { sent, skipped, errors, total: recipients.length }
    }),
})
