import { z } from 'zod'
import { getOutreachBypassReason, isOutreachBypassClub } from './outreach-club-bypass'

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export const agentOutreachRolloutActionKindSchema = z.enum([
  'create_campaign',
  'fill_session',
  'reactivate_members',
  'trial_follow_up',
  'renewal_reactivation',
])

export type AgentOutreachRolloutActionKind = z.infer<typeof agentOutreachRolloutActionKindSchema>

const AGENT_OUTREACH_ROLLOUT_LABELS: Record<AgentOutreachRolloutActionKind, string> = {
  create_campaign: 'Campaign sends',
  fill_session: 'Slot filler sends',
  reactivate_members: 'Reactivation sends',
  trial_follow_up: 'Trial follow-up sends',
  renewal_reactivation: 'Renewal outreach sends',
}

export interface AgentOutreachRolloutResolvedAction {
  actionKind: AgentOutreachRolloutActionKind
  enabled: boolean
  label: string
}

export interface AgentOutreachRolloutResolved {
  actions: Record<AgentOutreachRolloutActionKind, AgentOutreachRolloutResolvedAction>
}

export interface AgentOutreachRolloutStatus {
  envAllowlistConfigured: boolean
  clubAllowlisted: boolean
  clubBypassEnabled: boolean
  allowlistedClubIds: string[]
  enabledActionKinds: AgentOutreachRolloutActionKind[]
  summary: string
  actions: Record<AgentOutreachRolloutActionKind, AgentOutreachRolloutResolvedAction>
}

export interface AgentOutreachRolloutEvaluation {
  actionKind: AgentOutreachRolloutActionKind
  allowed: boolean
  clubAllowlisted: boolean
  clubBypassEnabled: boolean
  envAllowlistConfigured: boolean
  actionEnabled: boolean
  label: string
  reason: string
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function getRawEnabled(actionSettings: Record<string, unknown>, actionKind: AgentOutreachRolloutActionKind) {
  return parseBoolean(toRecord(actionSettings[actionKind]).enabled)
}

function parseAllowlistedClubIds(raw: string | undefined) {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function resolveAgentOutreachRollout(automationSettings?: unknown): AgentOutreachRolloutResolved {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const controlPlane = toRecord(intelligence.controlPlane)
  const rollout = toRecord(controlPlane.outreachRollout)
  const actionSettings = toRecord(rollout.actions)

  return {
    actions: {
      create_campaign: {
        actionKind: 'create_campaign',
        enabled: getRawEnabled(actionSettings, 'create_campaign') ?? false,
        label: AGENT_OUTREACH_ROLLOUT_LABELS.create_campaign,
      },
      fill_session: {
        actionKind: 'fill_session',
        enabled: getRawEnabled(actionSettings, 'fill_session') ?? false,
        label: AGENT_OUTREACH_ROLLOUT_LABELS.fill_session,
      },
      reactivate_members: {
        actionKind: 'reactivate_members',
        enabled: getRawEnabled(actionSettings, 'reactivate_members') ?? false,
        label: AGENT_OUTREACH_ROLLOUT_LABELS.reactivate_members,
      },
      trial_follow_up: {
        actionKind: 'trial_follow_up',
        enabled: getRawEnabled(actionSettings, 'trial_follow_up') ?? false,
        label: AGENT_OUTREACH_ROLLOUT_LABELS.trial_follow_up,
      },
      renewal_reactivation: {
        actionKind: 'renewal_reactivation',
        enabled: getRawEnabled(actionSettings, 'renewal_reactivation') ?? false,
        label: AGENT_OUTREACH_ROLLOUT_LABELS.renewal_reactivation,
      },
    },
  }
}

export function formatAgentOutreachRolloutActionKind(actionKind: AgentOutreachRolloutActionKind) {
  return AGENT_OUTREACH_ROLLOUT_LABELS[actionKind]
}

export function buildAgentOutreachRolloutSummary(status: AgentOutreachRolloutStatus) {
  const clubSummary = status.clubBypassEnabled
    ? 'Club bypassed for QA outreach'
    : status.clubAllowlisted
    ? 'Club allowlisted'
    : status.envAllowlistConfigured
      ? 'Club not allowlisted'
      : 'No rollout clubs configured'
  const enabled = status.enabledActionKinds.length > 0
    ? status.enabledActionKinds.map((actionKind) => AGENT_OUTREACH_ROLLOUT_LABELS[actionKind]).join(', ')
    : 'No live outreach actions armed'
  return `${clubSummary} · ${enabled}`
}

export function getAgentOutreachRolloutStatus(input: {
  clubId: string
  automationSettings?: unknown
  clubName?: string | null
  clubSlug?: string | null
}): AgentOutreachRolloutStatus {
  const resolved = resolveAgentOutreachRollout(input.automationSettings)
  const allowlistedClubIds = parseAllowlistedClubIds(process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS)
  const envAllowlistConfigured = allowlistedClubIds.length > 0
  const clubBypassEnabled = isOutreachBypassClub({
    clubName: input.clubName,
    clubSlug: input.clubSlug,
  })
  const clubAllowlisted = clubBypassEnabled || allowlistedClubIds.includes(input.clubId)
  const enabledActionKinds = agentOutreachRolloutActionKindSchema.options.filter((actionKind) =>
    clubBypassEnabled || resolved.actions[actionKind].enabled,
  )
  const actions = Object.fromEntries(
    agentOutreachRolloutActionKindSchema.options.map((actionKind) => [
      actionKind,
      clubBypassEnabled
        ? {
            ...resolved.actions[actionKind],
            enabled: true,
          }
        : resolved.actions[actionKind],
    ]),
  ) as Record<AgentOutreachRolloutActionKind, AgentOutreachRolloutResolvedAction>

  return {
    envAllowlistConfigured,
    clubAllowlisted,
    clubBypassEnabled,
    allowlistedClubIds,
    enabledActionKinds,
    actions,
    summary: buildAgentOutreachRolloutSummary({
      envAllowlistConfigured,
      clubAllowlisted,
      clubBypassEnabled,
      allowlistedClubIds,
      enabledActionKinds,
      actions,
      summary: '',
    }),
  }
}

export function describeAgentOutreachRolloutAction(action: AgentOutreachRolloutResolvedAction) {
  return action.enabled
    ? `${action.label} are armed for live rollout once the club is allowlisted.`
    : `${action.label} stay shadow-only for this club until you arm them here.`
}

export function evaluateAgentOutreachRollout(input: {
  clubId: string
  automationSettings?: unknown
  actionKind: AgentOutreachRolloutActionKind
  clubName?: string | null
  clubSlug?: string | null
}): AgentOutreachRolloutEvaluation {
  const status = getAgentOutreachRolloutStatus({
    clubId: input.clubId,
    automationSettings: input.automationSettings,
    clubName: input.clubName,
    clubSlug: input.clubSlug,
  })
  const action = status.actions[input.actionKind]

  if (status.clubBypassEnabled) {
    return {
      actionKind: input.actionKind,
      allowed: true,
      clubAllowlisted: true,
      clubBypassEnabled: true,
      envAllowlistConfigured: status.envAllowlistConfigured,
      actionEnabled: true,
      label: action.label,
      reason: getOutreachBypassReason({
        clubName: input.clubName,
        clubSlug: input.clubSlug,
      }) || `${action.label} are live-enabled for this QA club.`,
    }
  }

  if (!status.envAllowlistConfigured) {
    return {
      actionKind: input.actionKind,
      allowed: false,
      clubAllowlisted: false,
      clubBypassEnabled: false,
      envAllowlistConfigured: false,
      actionEnabled: action.enabled,
      label: action.label,
      reason: 'No clubs are allowlisted for live outreach rollout in this environment yet.',
    }
  }

  if (!status.clubAllowlisted) {
    return {
      actionKind: input.actionKind,
      allowed: false,
      clubAllowlisted: false,
      clubBypassEnabled: false,
      envAllowlistConfigured: true,
      actionEnabled: action.enabled,
      label: action.label,
      reason: 'This club is not allowlisted for live outreach rollout yet.',
    }
  }

  if (!action.enabled) {
    return {
      actionKind: input.actionKind,
      allowed: false,
      clubAllowlisted: true,
      clubBypassEnabled: false,
      envAllowlistConfigured: true,
      actionEnabled: false,
      label: action.label,
      reason: `${action.label} are still held out of live outreach rollout for this club.`,
    }
  }

  return {
    actionKind: input.actionKind,
    allowed: true,
    clubAllowlisted: true,
    clubBypassEnabled: false,
    envAllowlistConfigured: true,
    actionEnabled: true,
    label: action.label,
    reason: `${action.label} are allowlisted for live outreach rollout in this club.`,
  }
}
