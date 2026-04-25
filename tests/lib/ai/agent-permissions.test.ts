import { describe, expect, it } from 'vitest'
import {
  buildAgentPermissionSummary,
  describeAgentPermissionMinimumRole,
  evaluateAgentPermission,
  resolveAgentPermissions,
} from '@/lib/ai/agent-permissions'

describe('agent permissions', () => {
  it('defaults draft work to moderator and live actions to admin', () => {
    const resolved = resolveAgentPermissions({ intelligence: {} })

    expect(resolved.actions.draftManage.minimumRole).toBe('MODERATOR')
    expect(resolved.actions.approveActions.minimumRole).toBe('ADMIN')
    expect(resolved.actions.schedulePublish.minimumRole).toBe('ADMIN')
    expect(resolved.actions.controlPlaneManage.minimumRole).toBe('ADMIN')
  })

  it('respects explicit per-action overrides', () => {
    const resolved = resolveAgentPermissions({
      intelligence: {
        permissions: {
          actions: {
            approveActions: { minimumRole: 'MODERATOR' },
            scheduleLiveRollback: { minimumRole: 'MODERATOR' },
          },
        },
      },
    })

    expect(resolved.actions.approveActions.minimumRole).toBe('MODERATOR')
    expect(resolved.actions.scheduleLiveRollback.minimumRole).toBe('MODERATOR')
    expect(resolved.actions.outreachSend.minimumRole).toBe('ADMIN')
  })

  it('blocks moderators from admin-only actions', () => {
    const evaluation = evaluateAgentPermission({
      automationSettings: {
        intelligence: {
          permissions: {
            actions: {
              schedulePublish: { minimumRole: 'ADMIN' },
            },
          },
        },
      },
      action: 'schedulePublish',
      clubAdminRole: 'MODERATOR',
    })

    expect(evaluation.allowed).toBe(false)
    expect(evaluation.reason).toContain('admin access')
  })

  it('allows moderators when the action minimum role is relaxed', () => {
    const evaluation = evaluateAgentPermission({
      automationSettings: {
        intelligence: {
          permissions: {
            actions: {
              approveActions: { minimumRole: 'MODERATOR' },
            },
          },
        },
      },
      action: 'approveActions',
      clubAdminRole: 'MODERATOR',
    })

    expect(evaluation.allowed).toBe(true)
    expect(evaluation.reason).toContain('moderator role')
  })

  it('builds readable summaries and descriptions', () => {
    const resolved = resolveAgentPermissions({
      intelligence: {
        permissions: {
          actions: {
            draftManage: { minimumRole: 'MODERATOR' },
            approveActions: { minimumRole: 'ADMIN' },
          },
        },
      },
    })

    expect(buildAgentPermissionSummary(resolved)).toContain('Draft work: Moderator')
    expect(describeAgentPermissionMinimumRole('ADMIN', 'Publish schedule')).toContain('admin role')
  })
})
