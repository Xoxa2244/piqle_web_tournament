import { z } from 'zod'

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export const clubAdminRoleSchema = z.enum(['ADMIN', 'MODERATOR'])
export const agentPermissionActionSchema = z.enum([
  'draftManage',
  'approveActions',
  'outreachSend',
  'schedulePublish',
  'scheduleLiveEdit',
  'scheduleLiveRollback',
  'controlPlaneManage',
])

export type ClubAdminRole = z.infer<typeof clubAdminRoleSchema>
export type AgentPermissionAction = z.infer<typeof agentPermissionActionSchema>

export interface AgentPermissionResolvedAction {
  action: AgentPermissionAction
  minimumRole: ClubAdminRole
  label: string
  description: string
}

export interface AgentPermissionResolved {
  actions: Record<AgentPermissionAction, AgentPermissionResolvedAction>
}

export interface AgentPermissionEvaluation {
  action: AgentPermissionAction
  minimumRole: ClubAdminRole
  clubRole: ClubAdminRole
  allowed: boolean
  label: string
  reason: string
}

const AGENT_PERMISSION_LABELS: Record<AgentPermissionAction, { label: string; description: string }> = {
  draftManage: {
    label: 'Draft work',
    description: 'Create or update advisor drafts, ops drafts, and queue workflow.',
  },
  approveActions: {
    label: 'Approve actions',
    description: 'Approve, decline, snooze, or execute advisor actions and pending reviews.',
  },
  outreachSend: {
    label: 'Send outreach',
    description: 'Send or schedule live member-facing outreach and approval sends.',
  },
  schedulePublish: {
    label: 'Publish schedule',
    description: 'Publish internal ops drafts into the live schedule.',
  },
  scheduleLiveEdit: {
    label: 'Edit live sessions',
    description: 'Change already published sessions in the live schedule.',
  },
  scheduleLiveRollback: {
    label: 'Rollback live sessions',
    description: 'Rollback a published live session back to the planned draft.',
  },
  controlPlaneManage: {
    label: 'Manage rollout',
    description: 'Change control-plane rollout modes and action-level permissions.',
  },
}

const DEFAULT_AGENT_PERMISSIONS: Record<AgentPermissionAction, ClubAdminRole> = {
  draftManage: 'MODERATOR',
  approveActions: 'ADMIN',
  outreachSend: 'ADMIN',
  schedulePublish: 'ADMIN',
  scheduleLiveEdit: 'ADMIN',
  scheduleLiveRollback: 'ADMIN',
  controlPlaneManage: 'ADMIN',
}

function parseRole(value: unknown): ClubAdminRole | undefined {
  const parsed = clubAdminRoleSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function getRawMinimumRole(permissionSettings: Record<string, unknown>, action: AgentPermissionAction) {
  return parseRole(toRecord(permissionSettings[action]).minimumRole)
}

export function formatClubAdminRole(role: ClubAdminRole) {
  return role === 'ADMIN' ? 'Admin' : 'Moderator'
}

export function buildAgentPermissionSummary(resolved: AgentPermissionResolved) {
  return agentPermissionActionSchema.options
    .map((action) => `${resolved.actions[action].label}: ${formatClubAdminRole(resolved.actions[action].minimumRole)}`)
    .join(' · ')
}

export function describeAgentPermissionMinimumRole(role: ClubAdminRole, label?: string) {
  const roleLabel = formatClubAdminRole(role)
  if (!label) {
    return `${roleLabel} role is required for this action.`
  }
  return `${label} requires the ${roleLabel.toLowerCase()} role or higher.`
}

export function resolveAgentPermissions(automationSettings?: unknown): AgentPermissionResolved {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const permissions = toRecord(intelligence.permissions)
  const actionSettings = toRecord(permissions.actions)

  return {
    actions: {
      draftManage: {
        action: 'draftManage',
        minimumRole: getRawMinimumRole(actionSettings, 'draftManage') ?? DEFAULT_AGENT_PERMISSIONS.draftManage,
        ...AGENT_PERMISSION_LABELS.draftManage,
      },
      approveActions: {
        action: 'approveActions',
        minimumRole: getRawMinimumRole(actionSettings, 'approveActions') ?? DEFAULT_AGENT_PERMISSIONS.approveActions,
        ...AGENT_PERMISSION_LABELS.approveActions,
      },
      outreachSend: {
        action: 'outreachSend',
        minimumRole: getRawMinimumRole(actionSettings, 'outreachSend') ?? DEFAULT_AGENT_PERMISSIONS.outreachSend,
        ...AGENT_PERMISSION_LABELS.outreachSend,
      },
      schedulePublish: {
        action: 'schedulePublish',
        minimumRole: getRawMinimumRole(actionSettings, 'schedulePublish') ?? DEFAULT_AGENT_PERMISSIONS.schedulePublish,
        ...AGENT_PERMISSION_LABELS.schedulePublish,
      },
      scheduleLiveEdit: {
        action: 'scheduleLiveEdit',
        minimumRole: getRawMinimumRole(actionSettings, 'scheduleLiveEdit') ?? DEFAULT_AGENT_PERMISSIONS.scheduleLiveEdit,
        ...AGENT_PERMISSION_LABELS.scheduleLiveEdit,
      },
      scheduleLiveRollback: {
        action: 'scheduleLiveRollback',
        minimumRole: getRawMinimumRole(actionSettings, 'scheduleLiveRollback') ?? DEFAULT_AGENT_PERMISSIONS.scheduleLiveRollback,
        ...AGENT_PERMISSION_LABELS.scheduleLiveRollback,
      },
      controlPlaneManage: {
        action: 'controlPlaneManage',
        minimumRole: getRawMinimumRole(actionSettings, 'controlPlaneManage') ?? DEFAULT_AGENT_PERMISSIONS.controlPlaneManage,
        ...AGENT_PERMISSION_LABELS.controlPlaneManage,
      },
    },
  }
}

function roleRank(role: ClubAdminRole) {
  return role === 'ADMIN' ? 2 : 1
}

export function evaluateAgentPermission(input: {
  automationSettings?: unknown
  action: AgentPermissionAction
  clubAdminRole: ClubAdminRole
}): AgentPermissionEvaluation {
  const resolved = resolveAgentPermissions(input.automationSettings)
  const rule = resolved.actions[input.action]
  const allowed = roleRank(input.clubAdminRole) >= roleRank(rule.minimumRole)

  return {
    action: input.action,
    minimumRole: rule.minimumRole,
    clubRole: input.clubAdminRole,
    allowed,
    label: rule.label,
    reason: allowed
      ? `${rule.label} is allowed for the ${formatClubAdminRole(input.clubAdminRole).toLowerCase()} role.`
      : `${rule.label} requires ${formatClubAdminRole(rule.minimumRole).toLowerCase()} access, but this user only has ${formatClubAdminRole(input.clubAdminRole).toLowerCase()} access.`,
  }
}
