import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAgentOutreachRolloutSummary,
  evaluateAgentOutreachRollout,
  getAgentOutreachRolloutStatus,
  resolveAgentOutreachRollout,
} from '@/lib/ai/agent-outreach-rollout'

const ORIGINAL_ALLOWLIST = process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS

afterEach(() => {
  if (ORIGINAL_ALLOWLIST === undefined) {
    delete process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS
    return
  }

  process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS = ORIGINAL_ALLOWLIST
})

describe('agent outreach rollout', () => {
  it('defaults every outreach action to shadow-only', () => {
    const resolved = resolveAgentOutreachRollout({ intelligence: {} })

    expect(resolved.actions.create_campaign.enabled).toBe(false)
    expect(resolved.actions.fill_session.enabled).toBe(false)
    expect(resolved.actions.trial_follow_up.enabled).toBe(false)
  })

  it('requires a server allowlist before any live outreach is allowed', () => {
    delete process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS

    const evaluation = evaluateAgentOutreachRollout({
      clubId: 'club_1',
      automationSettings: {
        intelligence: {
          controlPlane: {
            outreachRollout: {
              actions: {
                create_campaign: { enabled: true },
              },
            },
          },
        },
      },
      actionKind: 'create_campaign',
    })

    expect(evaluation.allowed).toBe(false)
    expect(evaluation.reason).toContain('No clubs are allowlisted')
  })

  it('allows live outreach only when the club is allowlisted and the action is armed', () => {
    process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS = 'club_1, club_2'

    const evaluation = evaluateAgentOutreachRollout({
      clubId: 'club_2',
      automationSettings: {
        intelligence: {
          controlPlane: {
            outreachRollout: {
              actions: {
                fill_session: { enabled: true },
              },
            },
          },
        },
      },
      actionKind: 'fill_session',
    })

    expect(evaluation.allowed).toBe(true)
    expect(evaluation.reason).toContain('allowlisted')
  })

  it('blocks allowlisted clubs when the action kind is still shadow-only', () => {
    process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS = 'club_live'

    const evaluation = evaluateAgentOutreachRollout({
      clubId: 'club_live',
      automationSettings: {
        intelligence: {
          controlPlane: {
            outreachRollout: {
              actions: {
                reactivate_members: { enabled: false },
              },
            },
          },
        },
      },
      actionKind: 'reactivate_members',
    })

    expect(evaluation.allowed).toBe(false)
    expect(evaluation.reason).toContain('held out of live outreach rollout')
  })

  it('builds a readable rollout status summary', () => {
    process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS = 'club_rollout'

    const status = getAgentOutreachRolloutStatus({
      clubId: 'club_rollout',
      automationSettings: {
        intelligence: {
          controlPlane: {
            outreachRollout: {
              actions: {
                create_campaign: { enabled: true },
                trial_follow_up: { enabled: true },
              },
            },
          },
        },
      },
    })

    expect(buildAgentOutreachRolloutSummary(status)).toContain('Club allowlisted')
    expect(buildAgentOutreachRolloutSummary(status)).toContain('Campaign sends')
    expect(buildAgentOutreachRolloutSummary(status)).toContain('Trial follow-up sends')
  })
})
