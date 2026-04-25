import { describe, expect, it } from 'vitest'
import {
  buildAgentOutreachPilotSnapshot,
  resolveAgentOutreachActionKindFromRecommendationLog,
} from '@/lib/ai/agent-outreach-pilot'

describe('agent-outreach-pilot', () => {
  it('maps recommendation logs to rollout action kinds', () => {
    expect(
      resolveAgentOutreachActionKindFromRecommendationLog({
        type: 'SLOT_FILLER',
        reasoning: null,
      }),
    ).toBe('fill_session')

    expect(
      resolveAgentOutreachActionKindFromRecommendationLog({
        type: 'CHECK_IN',
        reasoning: { membershipLifecycle: 'trial_follow_up' },
      }),
    ).toBe('trial_follow_up')

    expect(
      resolveAgentOutreachActionKindFromRecommendationLog({
        type: 'EVENT_INVITE',
        reasoning: { actionKind: 'renewal_reactivation' },
      }),
    ).toBe('renewal_reactivation')
  })

  it('builds healthy pilot metrics with action summaries', () => {
    const snapshot = buildAgentOutreachPilotSnapshot({
      days: 7,
      logs: [
        { type: 'SLOT_FILLER', status: 'sent', deliveredAt: '2026-04-15T10:00:00.000Z' },
        { type: 'SLOT_FILLER', status: 'opened', openedAt: '2026-04-15T10:05:00.000Z' },
        { type: 'SLOT_FILLER', status: 'clicked', clickedAt: '2026-04-15T10:10:00.000Z' },
        { type: 'SLOT_FILLER', status: 'converted', respondedAt: '2026-04-15T11:00:00.000Z' },
      ],
    })

    expect(snapshot.health).toBe('healthy')
    expect(snapshot.totals.sent).toBe(4)
    expect(snapshot.totals.delivered).toBe(4)
    expect(snapshot.totals.opened).toBe(3)
    expect(snapshot.totals.clicked).toBe(2)
    expect(snapshot.totals.converted).toBe(1)
    expect(snapshot.summary).toContain('4 live sends')
    expect(snapshot.topAction?.actionKind).toBe('fill_session')
    expect(snapshot.topAction?.conversionRate).toBe(25)
  })

  it('marks risky pilot windows when failures and opt-outs pile up', () => {
    const snapshot = buildAgentOutreachPilotSnapshot({
      days: 14,
      logs: [
        { type: 'CHECK_IN', status: 'failed', bouncedAt: '2026-04-15T10:00:00.000Z', bounceType: 'sms_failed' },
        { type: 'CHECK_IN', status: 'bounced', bouncedAt: '2026-04-15T10:01:00.000Z', bounceType: 'hard' },
        { type: 'CHECK_IN', status: 'unsubscribed', bouncedAt: '2026-04-15T10:02:00.000Z', bounceType: 'unsub' },
        { type: 'CHECK_IN', status: 'sent', deliveredAt: '2026-04-15T10:03:00.000Z' },
      ],
    })

    expect(snapshot.health).toBe('at_risk')
    expect(snapshot.totals.failed).toBe(2)
    expect(snapshot.totals.unsubscribed).toBe(1)
    expect(snapshot.atRiskAction?.actionKind).toBe('create_campaign')
    expect(snapshot.atRiskAction?.health).toBe('at_risk')
    expect(snapshot.recommendation).toEqual({
      actionKind: 'create_campaign',
      label: 'Campaign sends',
      health: 'at_risk',
      reason: 'Move campaign sends back to shadow. Recent pilot window shows 2 failed sends and 1 opt-outs.',
    })
  })
})
