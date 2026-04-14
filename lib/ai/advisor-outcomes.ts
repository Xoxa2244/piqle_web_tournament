import { z } from 'zod'
import type { AdvisorAction } from './advisor-actions'

export const advisorOutcomeMemorySchema = z.object({
  kind: z.enum([
    'create_cohort',
    'create_campaign',
    'fill_session',
    'reactivate_members',
    'trial_follow_up',
    'renewal_reactivation',
    'program_schedule',
    'update_contact_policy',
    'update_autonomy_policy',
    'update_sandbox_routing',
  ]),
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(320),
  occurredAt: z.string().datetime(),
})

export type AdvisorOutcomeMemory = z.infer<typeof advisorOutcomeMemorySchema>

function parseAdvisorOutcomeMemory(value: unknown): AdvisorOutcomeMemory | null {
  const parsed = advisorOutcomeMemorySchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function getAdvisorLatestOutcome(metadata: unknown): AdvisorOutcomeMemory | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const record = metadata as Record<string, unknown>

  const direct = parseAdvisorOutcomeMemory(record.advisorOutcome)
  if (direct) return direct

  const advisorState = record.advisorState
  if (!advisorState || typeof advisorState !== 'object' || Array.isArray(advisorState)) return null
  const latest = (advisorState as Record<string, unknown>).latestOutcome
  return parseAdvisorOutcomeMemory(latest)
}

export function withAdvisorOutcomeMetadata(
  metadata: unknown,
  outcome: AdvisorOutcomeMemory,
) {
  const next =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}

  next.advisorOutcome = outcome
  return next
}

export function buildAdvisorOutcomeMemory(
  action: AdvisorAction,
  result: any,
  occurredAt: string = new Date().toISOString(),
): AdvisorOutcomeMemory {
  if (action.kind === 'create_cohort') {
    const memberCount = typeof result?.memberCount === 'number' ? result.memberCount : action.cohort.count || 0
    return {
      kind: action.kind,
      title: action.title,
      summary: `Audience created: ${result?.name || action.cohort.name} (${memberCount} members).`,
      occurredAt,
    }
  }

  if (action.kind === 'fill_session') {
    if (result?.sandboxed) {
      return {
        kind: action.kind,
        title: action.title,
        summary: `Sandbox preview prepared for ${result?.sessionTitle || action.session.title}: ${result?.previewRecipientCount || 0} eligible, ${result?.skipped || 0} skipped.`,
        occurredAt,
      }
    }

    return {
      kind: action.kind,
      title: action.title,
      summary: `Session fill finished for ${result?.sessionTitle || action.session.title}: ${result?.sent || 0} sent, ${result?.skipped || 0} skipped.`,
      occurredAt,
    }
  }

  if (action.kind === 'reactivate_members') {
    if (result?.sandboxed) {
      return {
        kind: action.kind,
        title: action.title,
        summary: `Sandbox preview prepared for ${result?.segmentLabel || action.reactivation.segmentLabel}: ${result?.previewRecipientCount || 0} eligible, ${result?.skipped || 0} skipped.`,
        occurredAt,
      }
    }

    return {
      kind: action.kind,
      title: action.title,
      summary: `Reactivation completed for ${result?.segmentLabel || action.reactivation.segmentLabel}: ${result?.sent || 0} sent, ${result?.skipped || 0} skipped.`,
      occurredAt,
    }
  }

  if (action.kind === 'trial_follow_up' || action.kind === 'renewal_reactivation') {
    const flowLabel = action.kind === 'trial_follow_up' ? 'Trial follow-up' : 'Renewal outreach'
    if (result?.sandboxed) {
      return {
        kind: action.kind,
        title: action.title,
        summary: `${flowLabel} sandbox preview prepared for ${result?.previewRecipientCount || 0} eligible members${result?.scheduledLabel ? ` at ${result.scheduledLabel}` : ''}.`,
        occurredAt,
      }
    }

    if (result?.savedAsDraft) {
      return {
        kind: action.kind,
        title: action.title,
        summary: `${flowLabel} draft saved for ${result?.memberCount || 0} eligible members.`,
        occurredAt,
      }
    }

    if (result?.deliveryMode === 'send_later') {
      return {
        kind: action.kind,
        title: action.title,
        summary: `${flowLabel} scheduled for ${result?.scheduledLabel || 'later'} with ${result?.memberCount || 0} eligible members.`,
        occurredAt,
      }
    }

    return {
      kind: action.kind,
      title: action.title,
      summary: `${flowLabel} sent to ${result?.sent || 0} members${result?.skipped ? ` with ${result.skipped} skipped` : ''}.`,
      occurredAt,
    }
  }

  if (action.kind === 'program_schedule') {
    const proposalCount = 1 + action.program.alternatives.length
    const opsDraftCount = typeof result?.opsDraftsCreated === 'number' ? result.opsDraftsCreated : 0
    return {
      kind: action.kind,
      title: action.title,
      summary: opsDraftCount > 0
        ? `Created ${opsDraftCount} ops session draft${opsDraftCount === 1 ? '' : 's'} from ${proposalCount} programming idea${proposalCount === 1 ? '' : 's'}.`
        : result?.savedAsDraft
          ? `Programming draft saved with ${proposalCount} schedule idea${proposalCount === 1 ? '' : 's'}.`
          : `Programming plan updated with ${proposalCount} schedule idea${proposalCount === 1 ? '' : 's'}.`,
      occurredAt,
    }
  }

  if (action.kind === 'update_contact_policy') {
    const changedCount = Array.isArray(result?.changedFields) ? result.changedFields.length : action.policy.changes.length
    return {
      kind: action.kind,
      title: action.title,
      summary: `Contact policy updated with ${changedCount} change${changedCount === 1 ? '' : 's'}.`,
      occurredAt,
    }
  }

  if (action.kind === 'update_autonomy_policy') {
    const changedCount = Array.isArray(result?.changedFields) ? result.changedFields.length : action.policy.changes.length
    return {
      kind: action.kind,
      title: action.title,
      summary: `Autopilot policy updated with ${changedCount} change${changedCount === 1 ? '' : 's'}.`,
      occurredAt,
    }
  }

  if (action.kind === 'update_sandbox_routing') {
    const changedCount = Array.isArray(result?.changedFields) ? result.changedFields.length : action.policy.changes.length
    return {
      kind: action.kind,
      title: action.title,
      summary: `Sandbox routing updated with ${changedCount} change${changedCount === 1 ? '' : 's'}.`,
      occurredAt,
    }
  }

  if (result?.savedAsDraft) {
    return {
      kind: action.kind,
      title: action.title,
      summary: `Campaign draft saved for ${result?.memberCount || 0} eligible members.`,
      occurredAt,
    }
  }

  if (result?.sandboxed) {
    return {
      kind: action.kind,
      title: action.title,
      summary: `Campaign sandbox preview prepared for ${result?.previewRecipientCount || 0} eligible members${result?.scheduledLabel ? ` at ${result.scheduledLabel}` : ''}.`,
      occurredAt,
    }
  }

  if (result?.deliveryMode === 'send_later') {
    return {
      kind: action.kind,
      title: action.title,
      summary: `Campaign scheduled for ${result?.scheduledLabel || 'later'} with ${result?.memberCount || 0} eligible members.`,
      occurredAt,
    }
  }

  return {
    kind: action.kind,
    title: action.title,
    summary: `Campaign sent to ${result?.sent || 0} members${result?.skipped ? ` with ${result.skipped} skipped` : ''}.`,
    occurredAt,
  }
}
