import 'server-only'

import type { PrismaClient } from '@prisma/client'
import { intelligenceLogger as log } from '@/lib/logger'
import type { AgentControlPlaneAction, AgentControlPlaneMode } from './agent-control-plane'

export type AgentDecisionRecordResult =
  | 'blocked'
  | 'shadowed'
  | 'executed'
  | 'reviewed'
  | 'failed'

export interface PersistAgentDecisionRecordInput {
  clubId: string
  userId?: string | null
  actorType?: 'user' | 'system'
  action: AgentControlPlaneAction | string
  targetType?: string | null
  targetId?: string | null
  mode: AgentControlPlaneMode | string
  result: AgentDecisionRecordResult | string
  summary: string
  metadata?: Record<string, unknown> | null
}

function isMissingAgentDecisionRecordTable(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error || '')

  return code === 'P2021'
    || message.includes('agent_decision_records')
    || message.includes('does not exist')
}

export async function persistAgentDecisionRecord(
  prisma: PrismaClient | any,
  input: PersistAgentDecisionRecordInput,
) {
  try {
    return await prisma.agentDecisionRecord.create({
      data: {
        clubId: input.clubId,
        userId: input.userId || null,
        actorType: input.actorType || 'user',
        action: input.action,
        targetType: input.targetType || null,
        targetId: input.targetId || null,
        mode: input.mode,
        result: input.result,
        summary: input.summary,
        metadata: input.metadata || {},
      },
      select: {
        id: true,
        action: true,
        mode: true,
        result: true,
        summary: true,
        createdAt: true,
      },
    })
  } catch (error) {
    if (isMissingAgentDecisionRecordTable(error)) {
      log.warn('[AgentDecisionRecords] Skipping persistence because agent_decision_records is unavailable:', error)
      return null
    }
    throw error
  }
}

export async function listAgentDecisionRecordsSafe(
  prisma: PrismaClient | any,
  input: { clubId: string; limit?: number; action?: string },
) {
  try {
    return await prisma.agentDecisionRecord.findMany({
      where: {
        clubId: input.clubId,
        action: input.action || undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(input.limit ?? 12, 50)),
      select: {
        id: true,
        action: true,
        mode: true,
        result: true,
        summary: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })
  } catch (error) {
    if (isMissingAgentDecisionRecordTable(error)) {
      log.warn('[AgentDecisionRecords] Returning empty list because agent_decision_records is unavailable:', error)
      return []
    }
    throw error
  }
}
