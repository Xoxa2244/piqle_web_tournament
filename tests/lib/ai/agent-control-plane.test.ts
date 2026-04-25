import { describe, expect, it } from 'vitest'
import {
  buildAgentControlPlaneChangeSummary,
  buildAgentControlPlaneSummary,
  evaluateAgentControlPlaneAction,
  getAgentControlPlaneAudit,
  diffAgentControlPlaneResolved,
  resolveAgentControlPlane,
} from '@/lib/ai/agent-control-plane'

describe('agent control plane', () => {
  it('defaults outreach to shadow and schedule actions to live when agentLive is false', () => {
    const resolved = resolveAgentControlPlane({ intelligence: { agentLive: false } })

    expect(resolved.killSwitch).toBe(false)
    expect(resolved.actions.outreachSend.mode).toBe('shadow')
    expect(resolved.actions.schedulePublish.mode).toBe('live')
    expect(resolved.actions.scheduleLiveEdit.mode).toBe('live')
    expect(resolved.actions.scheduleLiveRollback.mode).toBe('live')
  })

  it('promotes outreach to live when agentLive is true', () => {
    const resolved = resolveAgentControlPlane({ intelligence: { agentLive: true } })

    expect(resolved.actions.outreachSend.mode).toBe('live')
  })

  it('respects explicit per-action overrides', () => {
    const resolved = resolveAgentControlPlane({
      intelligence: {
        agentLive: true,
        controlPlane: {
          actions: {
            schedulePublish: { mode: 'shadow' },
            scheduleLiveRollback: { mode: 'disabled' },
          },
        },
      },
    })

    expect(resolved.actions.schedulePublish.mode).toBe('shadow')
    expect(resolved.actions.scheduleLiveRollback.mode).toBe('disabled')
    expect(resolved.actions.outreachSend.mode).toBe('live')
  })

  it('blocks every action when kill switch is active', () => {
    const evaluation = evaluateAgentControlPlaneAction({
      automationSettings: {
        intelligence: {
          controlPlane: { killSwitch: true },
        },
      },
      action: 'schedulePublish',
    })

    expect(evaluation.allowed).toBe(false)
    expect(evaluation.mode).toBe('disabled')
    expect(evaluation.reason).toContain('kill switch')
  })

  it('builds readable rollout summaries and diffs', () => {
    const previous = resolveAgentControlPlane({ intelligence: { agentLive: false } })
    const next = resolveAgentControlPlane({
      intelligence: {
        agentLive: true,
        controlPlane: {
          killSwitch: true,
          actions: {
            schedulePublish: { mode: 'shadow' },
          },
        },
      },
    })

    expect(buildAgentControlPlaneSummary(next)).toContain('Kill switch On')

    const changes = diffAgentControlPlaneResolved(previous, next)
    expect(changes).toEqual([
      { key: 'killSwitch', label: 'Kill switch', from: 'Off', to: 'On' },
      { key: 'outreachSend', label: 'Outreach send', from: 'Shadow', to: 'Live' },
      { key: 'schedulePublish', label: 'Schedule publish', from: 'Live', to: 'Shadow' },
    ])
    expect(buildAgentControlPlaneChangeSummary(changes)).toContain('Kill switch: Off -> On')
  })

  it('parses persisted control-plane audit metadata', () => {
    const audit = getAgentControlPlaneAudit({
      intelligence: {
        controlPlane: {
          audit: {
            lastChangedAt: '2026-04-15T12:00:00.000Z',
            lastChangedByUserId: 'user_123',
            lastChangedByLabel: 'Solomon',
            summary: 'Outreach send: Shadow -> Live',
            changes: [
              {
                key: 'outreachSend',
                label: 'Outreach send',
                from: 'Shadow',
                to: 'Live',
              },
            ],
          },
        },
      },
    })

    expect(audit).toEqual({
      lastChangedAt: '2026-04-15T12:00:00.000Z',
      lastChangedByUserId: 'user_123',
      lastChangedByLabel: 'Solomon',
      summary: 'Outreach send: Shadow -> Live',
      changes: [
        {
          key: 'outreachSend',
          label: 'Outreach send',
          from: 'Shadow',
          to: 'Live',
        },
      ],
    })
  })
})
