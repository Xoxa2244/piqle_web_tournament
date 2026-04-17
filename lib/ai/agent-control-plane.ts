import { z } from 'zod'

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export const agentControlPlaneModeSchema = z.enum(['disabled', 'shadow', 'live'])
export const agentControlPlaneActionSchema = z.enum([
  'outreachSend',
  'schedulePublish',
  'scheduleLiveEdit',
  'scheduleLiveRollback',
  'adminReminderExternal',
])

export type AgentControlPlaneMode = z.infer<typeof agentControlPlaneModeSchema>
export type AgentControlPlaneAction = z.infer<typeof agentControlPlaneActionSchema>

export interface AgentControlPlaneResolvedAction {
  action: AgentControlPlaneAction
  mode: AgentControlPlaneMode
  label: string
  description: string
}

export interface AgentControlPlaneResolved {
  killSwitch: boolean
  actions: Record<AgentControlPlaneAction, AgentControlPlaneResolvedAction>
}

export interface AgentControlPlaneEvaluation {
  action: AgentControlPlaneAction
  mode: AgentControlPlaneMode
  allowed: boolean
  shadow: boolean
  label: string
  reason: string
}

export type AgentControlPlaneAuditChangeKey = AgentControlPlaneAction | 'killSwitch' | 'outreachRollout'

export interface AgentControlPlaneAuditChange {
  key: AgentControlPlaneAuditChangeKey
  label: string
  from: string
  to: string
}

export interface AgentControlPlaneAudit {
  lastChangedAt?: string
  lastChangedByUserId?: string
  lastChangedByLabel?: string
  summary?: string
  changes?: AgentControlPlaneAuditChange[]
}

const AGENT_CONTROL_PLANE_LABELS: Record<AgentControlPlaneAction, { label: string; description: string }> = {
  outreachSend: {
    label: 'Outreach send',
    description: 'Real member-facing delivery like campaigns and agent outreach.',
  },
  schedulePublish: {
    label: 'Schedule publish',
    description: 'Create live sessions from internal ops drafts.',
  },
  scheduleLiveEdit: {
    label: 'Live session edit',
    description: 'Edit already published schedule sessions.',
  },
  scheduleLiveRollback: {
    label: 'Live rollback',
    description: 'Roll a published session back to its planned state.',
  },
  adminReminderExternal: {
    label: 'Admin reminders',
    description: 'Email/SMS reminders sent to admins outside the app.',
  },
}

const AGENT_CONTROL_PLANE_MODE_LABELS: Record<AgentControlPlaneMode, string> = {
  disabled: 'Disabled',
  shadow: 'Shadow',
  live: 'Live',
}

const AGENT_CONTROL_PLANE_MODE_DESCRIPTIONS: Record<AgentControlPlaneMode, string> = {
  disabled: 'The agent cannot execute this live side effect until you re-enable it.',
  shadow: 'The agent can review and simulate this action without doing the real live side effect.',
  live: 'The agent is allowed to execute the real live side effect for this action.',
}

function parseMode(value: unknown): AgentControlPlaneMode | undefined {
  const parsed = agentControlPlaneModeSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function getRawActionMode(actionSettings: Record<string, unknown>, action: AgentControlPlaneAction) {
  return parseMode(toRecord(actionSettings[action]).mode)
}

function formatKillSwitchState(enabled: boolean) {
  return enabled ? 'On' : 'Off'
}

function parseAuditChange(value: unknown): AgentControlPlaneAuditChange | null {
  const raw = toRecord(value)
  const key = raw.key
  if (
    key !== 'killSwitch'
    && key !== 'outreachRollout'
    && !agentControlPlaneActionSchema.safeParse(key).success
  ) {
    return null
  }

  return {
    key: key as AgentControlPlaneAuditChangeKey,
    label: typeof raw.label === 'string' ? raw.label : '',
    from: typeof raw.from === 'string' ? raw.from : '',
    to: typeof raw.to === 'string' ? raw.to : '',
  }
}

export function formatAgentControlPlaneMode(mode: AgentControlPlaneMode) {
  return AGENT_CONTROL_PLANE_MODE_LABELS[mode]
}

export function describeAgentControlPlaneMode(mode: AgentControlPlaneMode, label?: string) {
  if (!label) {
    return AGENT_CONTROL_PLANE_MODE_DESCRIPTIONS[mode]
  }

  if (mode === 'disabled') {
    return `${label} is blocked until you re-enable it.`
  }

  if (mode === 'shadow') {
    return `${label} stays in review mode, so the agent can simulate it without making the real live side effect.`
  }

  return `${label} is armed for live execution.`
}

export function diffAgentControlPlaneResolved(
  previous: AgentControlPlaneResolved,
  next: AgentControlPlaneResolved,
): AgentControlPlaneAuditChange[] {
  const changes: AgentControlPlaneAuditChange[] = []

  if (previous.killSwitch !== next.killSwitch) {
    changes.push({
      key: 'killSwitch',
      label: 'Kill switch',
      from: formatKillSwitchState(previous.killSwitch),
      to: formatKillSwitchState(next.killSwitch),
    })
  }

  for (const action of agentControlPlaneActionSchema.options) {
    const previousMode = previous.actions[action].mode
    const nextMode = next.actions[action].mode
    if (previousMode === nextMode) continue

    changes.push({
      key: action,
      label: next.actions[action].label,
      from: formatAgentControlPlaneMode(previousMode),
      to: formatAgentControlPlaneMode(nextMode),
    })
  }

  return changes
}

export function buildAgentControlPlaneSummary(resolved: AgentControlPlaneResolved) {
  const orderedActions: AgentControlPlaneAction[] = [
    'outreachSend',
    'schedulePublish',
    'scheduleLiveEdit',
    'scheduleLiveRollback',
    'adminReminderExternal',
  ]

  const summary = orderedActions
    .map((action) => `${resolved.actions[action].label}: ${formatAgentControlPlaneMode(resolved.actions[action].mode)}`)
    .join(' · ')

  return `Kill switch ${formatKillSwitchState(resolved.killSwitch)} · ${summary}`
}

export function buildAgentControlPlaneChangeSummary(changes: AgentControlPlaneAuditChange[]) {
  if (changes.length === 0) {
    return 'No rollout changes recorded.'
  }

  const base = changes
    .slice(0, 3)
    .map((change) => `${change.label}: ${change.from} -> ${change.to}`)
    .join(' · ')

  if (changes.length <= 3) {
    return base
  }

  return `${base} · +${changes.length - 3} more`
}

export function getAgentControlPlaneAudit(automationSettings?: unknown): AgentControlPlaneAudit | null {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const controlPlane = toRecord(intelligence.controlPlane)
  const audit = toRecord(controlPlane.audit)

  const changes = Array.isArray(audit.changes)
    ? audit.changes.map(parseAuditChange).filter(Boolean) as AgentControlPlaneAuditChange[]
    : []

  const lastChangedAt = typeof audit.lastChangedAt === 'string' ? audit.lastChangedAt : undefined
  const lastChangedByUserId = typeof audit.lastChangedByUserId === 'string' ? audit.lastChangedByUserId : undefined
  const lastChangedByLabel = typeof audit.lastChangedByLabel === 'string' ? audit.lastChangedByLabel : undefined
  const summary = typeof audit.summary === 'string' ? audit.summary : undefined

  if (!lastChangedAt && !lastChangedByUserId && !lastChangedByLabel && !summary && changes.length === 0) {
    return null
  }

  return {
    lastChangedAt,
    lastChangedByUserId,
    lastChangedByLabel,
    summary,
    changes,
  }
}

export function resolveAgentControlPlane(automationSettings?: unknown): AgentControlPlaneResolved {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const controlPlane = toRecord(intelligence.controlPlane)
  const actionSettings = toRecord(controlPlane.actions)
  const agentLive = intelligence.agentLive === true

  const defaults: Record<AgentControlPlaneAction, AgentControlPlaneMode> = {
    outreachSend: agentLive ? 'live' : 'shadow',
    schedulePublish: 'live',
    scheduleLiveEdit: 'live',
    scheduleLiveRollback: 'live',
    adminReminderExternal: 'live',
  }

  return {
    killSwitch: controlPlane.killSwitch === true,
    actions: {
      outreachSend: {
        action: 'outreachSend',
        mode: getRawActionMode(actionSettings, 'outreachSend') ?? defaults.outreachSend,
        ...AGENT_CONTROL_PLANE_LABELS.outreachSend,
      },
      schedulePublish: {
        action: 'schedulePublish',
        mode: getRawActionMode(actionSettings, 'schedulePublish') ?? defaults.schedulePublish,
        ...AGENT_CONTROL_PLANE_LABELS.schedulePublish,
      },
      scheduleLiveEdit: {
        action: 'scheduleLiveEdit',
        mode: getRawActionMode(actionSettings, 'scheduleLiveEdit') ?? defaults.scheduleLiveEdit,
        ...AGENT_CONTROL_PLANE_LABELS.scheduleLiveEdit,
      },
      scheduleLiveRollback: {
        action: 'scheduleLiveRollback',
        mode: getRawActionMode(actionSettings, 'scheduleLiveRollback') ?? defaults.scheduleLiveRollback,
        ...AGENT_CONTROL_PLANE_LABELS.scheduleLiveRollback,
      },
      adminReminderExternal: {
        action: 'adminReminderExternal',
        mode: getRawActionMode(actionSettings, 'adminReminderExternal') ?? defaults.adminReminderExternal,
        ...AGENT_CONTROL_PLANE_LABELS.adminReminderExternal,
      },
    },
  }
}

export function evaluateAgentControlPlaneAction(input: {
  automationSettings?: unknown
  action: AgentControlPlaneAction
}): AgentControlPlaneEvaluation {
  const resolved = resolveAgentControlPlane(input.automationSettings)
  const rule = resolved.actions[input.action]

  if (resolved.killSwitch) {
    return {
      action: input.action,
      mode: 'disabled',
      allowed: false,
      shadow: false,
      label: rule.label,
      reason: 'Control plane kill switch is active for this club.',
    }
  }

  if (rule.mode === 'disabled') {
    return {
      action: input.action,
      mode: rule.mode,
      allowed: false,
      shadow: false,
      label: rule.label,
      reason: `${rule.label} is currently locked by the control plane.`,
    }
  }

  if (rule.mode === 'shadow') {
    return {
      action: input.action,
      mode: rule.mode,
      allowed: true,
      shadow: true,
      label: rule.label,
      reason: `${rule.label} is in shadow mode, so the agent can review it without making the live side effect.`,
    }
  }

  return {
    action: input.action,
    mode: rule.mode,
    allowed: true,
    shadow: false,
    label: rule.label,
    reason: `${rule.label} is live-enabled for this club.`,
  }
}
