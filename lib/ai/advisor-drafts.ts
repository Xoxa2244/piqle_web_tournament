import 'server-only'

import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import {
  stripAdvisorRecommendation,
  type AdvisorAction,
  type AdvisorActionCore,
} from './advisor-actions'
import { advisorSandboxRoutingSummarySchema } from './advisor-sandbox-routing'

export const advisorDraftStatusSchema = z.enum([
  'review_ready',
  'sandboxed',
  'draft_saved',
  'approved',
  'scheduled',
  'sent',
  'blocked',
  'snoozed',
  'declined',
])

export const advisorDraftSelectedPlanSchema = z.enum(['requested', 'recommended'])

export const advisorDraftMetadataSchema = z.object({
  id: z.string().uuid(),
  status: advisorDraftStatusSchema,
  selectedPlan: advisorDraftSelectedPlanSchema.default('requested'),
  sandboxMode: z.boolean().default(false),
  updatedAt: z.string().datetime(),
})

export type AdvisorDraftStatus = z.infer<typeof advisorDraftStatusSchema>
export type AdvisorDraftSelectedPlan = z.infer<typeof advisorDraftSelectedPlanSchema>
export type AdvisorDraftMetadata = z.infer<typeof advisorDraftMetadataSchema>

export const advisorDraftPreviewRecipientSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1).max(120),
  channel: z.enum(['email', 'sms', 'both']),
  score: z.number().int().min(0).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(3).optional(),
})

export const advisorDraftSandboxPreviewSchema = z.object({
  kind: z.string().min(1),
  channel: z.enum(['email', 'sms', 'both']).optional(),
  deliveryMode: z.enum(['send_now', 'send_later']),
  recipientCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0).default(0),
  scheduledLabel: z.string().max(120).optional(),
  note: z.string().max(240).optional(),
  routing: advisorSandboxRoutingSummarySchema.optional(),
  recipients: z.array(advisorDraftPreviewRecipientSchema).max(5).default([]),
})

export const advisorDraftProgrammingPreviewProposalSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  dayOfWeek: z.string().min(1).max(20),
  timeSlot: z.enum(['morning', 'afternoon', 'evening']),
  startTime: z.string().min(1).max(20),
  endTime: z.string().min(1).max(20),
  format: z.string().min(1).max(40),
  skillLevel: z.string().min(1).max(40),
  projectedOccupancy: z.number().int().min(0).max(100),
  estimatedInterestedMembers: z.number().int().nonnegative(),
  confidence: z.number().int().min(0).max(100),
})

export const advisorDraftProgrammingPreviewSchema = z.object({
  goal: z.string().min(1).max(180),
  publishMode: z.literal('draft_only').default('draft_only'),
  primary: advisorDraftProgrammingPreviewProposalSchema,
  alternatives: z.array(advisorDraftProgrammingPreviewProposalSchema).max(3).default([]),
  insights: z.array(z.string().min(1).max(220)).max(4).default([]),
})

export const advisorDraftProgrammingOpsSessionDraftSchema = z.object({
  id: z.string().min(1).max(120),
  sourceProposalId: z.string().min(1).max(80),
  origin: z.enum(['primary', 'alternative']),
  state: z.literal('ready_for_ops').default('ready_for_ops'),
  title: z.string().min(1).max(160),
  dayOfWeek: z.string().min(1).max(20),
  timeSlot: z.enum(['morning', 'afternoon', 'evening']),
  startTime: z.string().min(1).max(20),
  endTime: z.string().min(1).max(20),
  format: z.string().min(1).max(40),
  skillLevel: z.string().min(1).max(40),
  maxPlayers: z.number().int().min(2).max(24),
  projectedOccupancy: z.number().int().min(0).max(100),
  estimatedInterestedMembers: z.number().int().nonnegative(),
  confidence: z.number().int().min(0).max(100),
  note: z.string().min(1).max(220),
})

export type AdvisorDraftSandboxPreview = z.infer<typeof advisorDraftSandboxPreviewSchema>
export type AdvisorDraftProgrammingPreview = z.infer<typeof advisorDraftProgrammingPreviewSchema>
export type AdvisorDraftProgrammingOpsSessionDraft = z.infer<typeof advisorDraftProgrammingOpsSessionDraftSchema>

function getAdvisorDraftExecution(action: AdvisorAction | AdvisorActionCore) {
  if (action.kind === 'create_campaign') return action.campaign.execution
  if (action.kind === 'trial_follow_up' || action.kind === 'renewal_reactivation') {
    return action.lifecycle.execution
  }
  return null
}

function buildAdvisorDraftWorkspaceMetadata(action: AdvisorAction | AdvisorActionCore) {
  if (action.kind === 'program_schedule') {
    return {
      programmingPreview: {
        goal: action.program.goal,
        publishMode: action.program.publishMode,
        primary: {
          id: action.program.primary.id,
          title: action.program.primary.title,
          dayOfWeek: action.program.primary.dayOfWeek,
          timeSlot: action.program.primary.timeSlot,
          startTime: action.program.primary.startTime,
          endTime: action.program.primary.endTime,
          format: action.program.primary.format,
          skillLevel: action.program.primary.skillLevel,
          projectedOccupancy: action.program.primary.projectedOccupancy,
          estimatedInterestedMembers: action.program.primary.estimatedInterestedMembers,
          confidence: action.program.primary.confidence,
        },
        alternatives: action.program.alternatives.map((proposal) => ({
          id: proposal.id,
          title: proposal.title,
          dayOfWeek: proposal.dayOfWeek,
          timeSlot: proposal.timeSlot,
          startTime: proposal.startTime,
          endTime: proposal.endTime,
          format: proposal.format,
          skillLevel: proposal.skillLevel,
          projectedOccupancy: proposal.projectedOccupancy,
          estimatedInterestedMembers: proposal.estimatedInterestedMembers,
          confidence: proposal.confidence,
        })),
        insights: action.program.insights,
      },
      opsSessionDrafts: [],
    }
  }

  return {}
}

export function buildAdvisorProgrammingOpsSessionDrafts(
  action: Extract<AdvisorAction | AdvisorActionCore, { kind: 'program_schedule' }>,
): AdvisorDraftProgrammingOpsSessionDraft[] {
  const proposals = [
    { proposal: action.program.primary, origin: 'primary' as const },
    ...action.program.alternatives.map((proposal) => ({
      proposal,
      origin: 'alternative' as const,
    })),
  ]

  return proposals.map(({ proposal, origin }) => ({
    id: `ops-${proposal.id}`,
    sourceProposalId: proposal.id,
    origin,
    state: 'ready_for_ops',
    title: proposal.title,
    dayOfWeek: proposal.dayOfWeek,
    timeSlot: proposal.timeSlot,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    format: proposal.format,
    skillLevel: proposal.skillLevel,
    maxPlayers: proposal.maxPlayers,
    projectedOccupancy: proposal.projectedOccupancy,
    estimatedInterestedMembers: proposal.estimatedInterestedMembers,
    confidence: proposal.confidence,
    note:
      origin === 'primary'
        ? 'Primary agent-backed session draft, ready for internal scheduling review.'
        : 'Alternative agent-backed session draft, ready for internal scheduling review.',
  }))
}

function safeJsonEqual(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function parseAdvisorDraftMetadata(value: unknown): AdvisorDraftMetadata | null {
  const parsed = advisorDraftMetadataSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function getAdvisorDraftFromMetadata(metadata: unknown): AdvisorDraftMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const record = metadata as Record<string, unknown>
  return parseAdvisorDraftMetadata(record.advisorDraft)
}

export function withAdvisorDraftMetadata(
  metadata: unknown,
  draft: AdvisorDraftMetadata,
) {
  const next =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}

  next.advisorDraft = draft
  return next
}

export function detectAdvisorDraftSelectedPlan(
  sourceAction: AdvisorAction | AdvisorActionCore,
  workingAction: AdvisorAction | AdvisorActionCore,
): AdvisorDraftSelectedPlan {
  const normalizedWorkingAction = stripAdvisorRecommendation(workingAction)

  if (
    'recommendation' in sourceAction &&
    sourceAction.recommendation?.action &&
    safeJsonEqual(sourceAction.recommendation.action, normalizedWorkingAction)
  ) {
    return 'recommended'
  }

  return 'requested'
}

export function resolveAdvisorDraftStatusFromResult(
  action: AdvisorAction | AdvisorActionCore,
  result: Record<string, any>,
): AdvisorDraftStatus {
  if (result?.blocked) return 'blocked'
  if (result?.sandboxed) return 'sandboxed'
  if (result?.savedAsDraft) return 'draft_saved'
  if (result?.deliveryMode === 'send_later') return 'scheduled'
  if (
    action.kind === 'create_cohort' ||
    action.kind === 'update_contact_policy' ||
    action.kind === 'update_autonomy_policy' ||
    action.kind === 'update_sandbox_routing'
  ) {
    return 'approved'
  }
  return 'sent'
}

export function buildAdvisorDraftPersistencePayload(opts: {
  action: AdvisorAction | AdvisorActionCore
  originalIntent?: string | null
  selectedPlan?: AdvisorDraftSelectedPlan
  status?: AdvisorDraftStatus
  sandboxMode?: boolean
  metadata?: Record<string, any> | null
}) {
  const selectedPlan = opts.selectedPlan || 'requested'
  const requestedAction = stripAdvisorRecommendation(opts.action)
  const recommendedAction =
    'recommendation' in opts.action && opts.action.recommendation?.action
      ? stripAdvisorRecommendation(opts.action.recommendation.action)
      : null
  const workingAction =
    selectedPlan === 'recommended' && recommendedAction
      ? recommendedAction
      : requestedAction
  const execution = getAdvisorDraftExecution(workingAction)
  const previewMetadata = buildAdvisorDraftWorkspaceMetadata(workingAction)

  return {
    kind: workingAction.kind,
    title: workingAction.title,
    summary: workingAction.summary || null,
    originalIntent: opts.originalIntent || null,
    selectedPlan,
    requestedAction,
    recommendedAction,
    workingAction,
    sandboxMode: opts.sandboxMode ?? true,
    status: opts.status || 'review_ready',
    scheduledFor: execution?.scheduledFor ? new Date(execution.scheduledFor) : null,
    timeZone: execution?.timeZone || null,
    metadata: {
      ...previewMetadata,
      ...(opts.metadata || {}),
    },
  }
}

export async function persistAdvisorDraft(opts: {
  prisma: PrismaClient
  clubId: string
  userId: string
  conversationId?: string | null
  sourceMessageId?: string | null
  existingDraftId?: string | null
  action: AdvisorAction | AdvisorActionCore
  originalIntent?: string | null
  selectedPlan?: AdvisorDraftSelectedPlan
  status?: AdvisorDraftStatus
  sandboxMode?: boolean
  metadata?: Record<string, any> | null
}): Promise<AdvisorDraftMetadata | null> {
  const payload = buildAdvisorDraftPersistencePayload({
    action: opts.action,
    originalIntent: opts.originalIntent,
    selectedPlan: opts.selectedPlan,
    status: opts.status,
    sandboxMode: opts.sandboxMode,
    metadata: opts.metadata,
  })

  try {
    const relationFields = {
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
      ...(opts.sourceMessageId ? { sourceMessageId: opts.sourceMessageId } : {}),
    }
    const existing =
      opts.existingDraftId
        ? await opts.prisma.agentDraft.findFirst({
            where: {
              id: opts.existingDraftId,
              clubId: opts.clubId,
              createdByUserId: opts.userId,
            },
            select: {
              id: true,
              metadata: true,
            },
          })
        : null

    const nextMetadata = existing
      ? {
          ...((existing.metadata as Record<string, any> | null) || {}),
          ...((payload.metadata as Record<string, any> | null) || {}),
        }
      : payload.metadata

    const record = existing
      ? await opts.prisma.agentDraft.update({
          where: { id: existing.id },
          data: {
            ...payload,
            metadata: nextMetadata,
            ...relationFields,
          } as any,
          select: {
            id: true,
            status: true,
            selectedPlan: true,
            sandboxMode: true,
            updatedAt: true,
          },
        })
      : await opts.prisma.agentDraft.create({
          data: {
            clubId: opts.clubId,
            createdByUserId: opts.userId,
            ...payload,
            metadata: nextMetadata,
            ...relationFields,
          } as any,
          select: {
            id: true,
            status: true,
            selectedPlan: true,
            sandboxMode: true,
            updatedAt: true,
          },
        })

    return {
      id: record.id,
      status: record.status as AdvisorDraftStatus,
      selectedPlan: record.selectedPlan as AdvisorDraftSelectedPlan,
      sandboxMode: record.sandboxMode,
      updatedAt: record.updatedAt.toISOString(),
    }
  } catch (error) {
    console.warn('[Advisor Draft] persistence skipped:', error instanceof Error ? error.message : error)
    return null
  }
}

export async function updateAdvisorDraftStatus(opts: {
  prisma: PrismaClient
  clubId: string
  userId: string
  draftId: string
  status: Extract<AdvisorDraftStatus, 'declined' | 'snoozed'>
}): Promise<AdvisorDraftMetadata | null> {
  try {
    const existing = await opts.prisma.agentDraft.findFirst({
      where: {
        id: opts.draftId,
        clubId: opts.clubId,
        createdByUserId: opts.userId,
      },
      select: {
        id: true,
        selectedPlan: true,
        sandboxMode: true,
      },
    })

    if (!existing) return null

    const updated = await opts.prisma.agentDraft.update({
      where: { id: existing.id },
      data: {
        status: opts.status,
      },
      select: {
        id: true,
        status: true,
        selectedPlan: true,
        sandboxMode: true,
        updatedAt: true,
      },
    })

    return {
      id: updated.id,
      status: updated.status as AdvisorDraftStatus,
      selectedPlan: updated.selectedPlan as AdvisorDraftSelectedPlan,
      sandboxMode: updated.sandboxMode,
      updatedAt: updated.updatedAt.toISOString(),
    }
  } catch (error) {
    console.warn('[Advisor Draft] status update skipped:', error instanceof Error ? error.message : error)
    return null
  }
}

export function getAdvisorDraftSandboxPreview(
  metadata: unknown,
): AdvisorDraftSandboxPreview | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const preview = (metadata as Record<string, unknown>).sandboxPreview
  const parsed = advisorDraftSandboxPreviewSchema.safeParse(preview)
  return parsed.success ? parsed.data : null
}

export function getAdvisorDraftProgrammingPreview(
  metadata: unknown,
): AdvisorDraftProgrammingPreview | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const preview = (metadata as Record<string, unknown>).programmingPreview
  const parsed = advisorDraftProgrammingPreviewSchema.safeParse(preview)
  return parsed.success ? parsed.data : null
}

export function getAdvisorDraftProgrammingOpsSessionDrafts(
  metadata: unknown,
): AdvisorDraftProgrammingOpsSessionDraft[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  const value = (metadata as Record<string, unknown>).opsSessionDrafts
  const parsed = z.array(advisorDraftProgrammingOpsSessionDraftSchema).max(4).safeParse(value)
  return parsed.success ? parsed.data : []
}
