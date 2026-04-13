import { describe, expect, it } from 'vitest'

import { getAdvisorActionFromMetadata, type AdvisorAction } from '@/lib/ai/advisor-actions'
import {
  buildAdvisorConversationStateFromAction,
  buildAdvisorStatePrompt,
  withAdvisorOutcome,
} from '@/lib/ai/advisor-conversation-state'
import { buildAdvisorOutcomeMemory, getAdvisorLatestOutcome } from '@/lib/ai/advisor-outcomes'

const createCampaignAction: AdvisorAction = {
  kind: 'create_campaign',
  title: 'Draft reactivation campaign',
  summary: 'EMAIL draft for 12 members',
  requiresApproval: true,
  audience: {
    name: 'Inactive members',
    description: 'Members inactive for 21 days',
    filters: [{ field: 'daysSinceLastPlay', op: 'gte', value: 21 }],
    count: 12,
  },
  campaign: {
    type: 'REACTIVATION',
    channel: 'email',
    subject: 'Come back this week',
    body: 'We miss you on the courts.',
    execution: {
      mode: 'send_later',
      scheduledFor: '2026-04-14T16:00:00.000Z',
      timeZone: 'America/Los_Angeles',
    },
  },
}

const trialFollowUpAction: AdvisorAction = {
  kind: 'trial_follow_up',
  title: 'Prepare trial follow-up',
  summary: 'EMAIL draft for 6 eligible trial members',
  requiresApproval: true,
  lifecycle: {
    lifecycle: 'trial_follow_up',
    campaignType: 'RETENTION_BOOST',
    label: 'Trial members with no first booking',
    channel: 'email',
    candidateCount: 6,
    subject: 'Ready for your first game?',
    message: 'Hi {{name}}, your trial is active at {{club}} and we would love to help you book your first session.',
    execution: {
      mode: 'send_later',
      scheduledFor: '2026-04-14T16:00:00.000Z',
      timeZone: 'America/Los_Angeles',
    },
    candidates: [
      { memberId: 'trial-1', name: 'Avery', score: 96, daysSinceSignal: 3, membershipStatus: 'trial', topReason: 'Joined 3 days ago and has not booked yet.' },
    ],
  },
}

describe('advisor outcomes', () => {
  it('reads the resolved advisor action from metadata', () => {
    expect(
      getAdvisorActionFromMetadata({
        advisorResolvedAction: createCampaignAction,
      }),
    ).toEqual(createCampaignAction)
  })

  it('stores the latest outcome in working memory and prompt text', () => {
    const baseState = buildAdvisorConversationStateFromAction(createCampaignAction, '2026-04-13T18:00:00.000Z')
    const outcome = buildAdvisorOutcomeMemory(
      createCampaignAction,
      {
        kind: 'create_campaign',
        deliveryMode: 'send_later',
        scheduledLabel: 'Tue, Apr 14, 9:00 AM PDT',
        memberCount: 9,
      },
      '2026-04-13T18:15:00.000Z',
    )

    const state = withAdvisorOutcome(baseState, outcome, '2026-04-13T18:15:00.000Z')

    expect(state.latestOutcome?.summary).toContain('Campaign scheduled')
    expect(state.recentOutcomes).toHaveLength(1)
    expect(buildAdvisorStatePrompt(state)).toContain('Latest completed outcome: Campaign scheduled')
  })

  it('keeps only the most recent five outcomes', () => {
    let state = buildAdvisorConversationStateFromAction(createCampaignAction, '2026-04-13T18:00:00.000Z')

    for (let index = 0; index < 6; index += 1) {
      const outcome = buildAdvisorOutcomeMemory(
        createCampaignAction,
        {
          kind: 'create_campaign',
          sent: index + 1,
          skipped: 0,
        },
        `2026-04-13T18:1${index}:00.000Z`,
      )
      state = withAdvisorOutcome(state, outcome, `2026-04-13T18:1${index}:00.000Z`)
    }

    expect(state.recentOutcomes).toHaveLength(5)
    expect(state.latestOutcome?.occurredAt).toBe('2026-04-13T18:15:00.000Z')
    expect(
      getAdvisorLatestOutcome({
        advisorState: state,
      })?.summary,
    ).toContain('Campaign sent to 6 members')
  })

  it('stores native membership lifecycle outcomes in advisor memory', () => {
    const baseState = buildAdvisorConversationStateFromAction(trialFollowUpAction, '2026-04-13T18:00:00.000Z')
    const outcome = buildAdvisorOutcomeMemory(
      trialFollowUpAction,
      {
        kind: 'trial_follow_up',
        deliveryMode: 'send_later',
        scheduledLabel: 'Tue, Apr 14, 9:00 AM PDT',
        memberCount: 4,
      },
      '2026-04-13T18:20:00.000Z',
    )

    const state = withAdvisorOutcome(baseState, outcome, '2026-04-13T18:20:00.000Z')

    expect(state.latestOutcome?.summary).toContain('Trial follow-up scheduled')
    expect(buildAdvisorStatePrompt(state)).toContain('Latest completed outcome: Trial follow-up scheduled')
  })
})
