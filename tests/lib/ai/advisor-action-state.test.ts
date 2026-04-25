import { describe, expect, it } from 'vitest'

import { buildAdvisorActionTag } from '@/lib/ai/advisor-actions'
import { getAdvisorActionRuntimeState, isAdvisorActionHidden } from '@/lib/ai/advisor-action-state'
import { deriveAdvisorConversationState } from '@/lib/ai/advisor-conversation-state'

describe('advisor action runtime state', () => {
  it('defaults to active when metadata is missing', () => {
    expect(getAdvisorActionRuntimeState(undefined)).toEqual({ status: 'active' })
    expect(isAdvisorActionHidden(undefined)).toBe(false)
  })

  it('keeps future snoozes hidden', () => {
    const state = getAdvisorActionRuntimeState(
      {
        advisorActionState: {
          status: 'snoozed',
          snoozedUntil: '2026-04-20T16:00:00.000Z',
        },
      },
      new Date('2026-04-19T12:00:00.000Z'),
    )

    expect(state.status).toBe('snoozed')
    expect(isAdvisorActionHidden(
      {
        advisorActionState: {
          status: 'snoozed',
          snoozedUntil: '2026-04-20T16:00:00.000Z',
        },
      },
      new Date('2026-04-19T12:00:00.000Z'),
    )).toBe(true)
  })

  it('reactivates expired snoozes', () => {
    expect(
      getAdvisorActionRuntimeState(
        {
          advisorActionState: {
            status: 'snoozed',
            snoozedUntil: '2026-04-10T16:00:00.000Z',
            updatedAt: '2026-04-09T10:00:00.000Z',
          },
        },
        new Date('2026-04-12T12:00:00.000Z'),
      ),
    ).toEqual({
      status: 'active',
      updatedAt: '2026-04-09T10:00:00.000Z',
    })
  })

  it('skips declined advisor drafts when rebuilding working memory', () => {
    const previousAudienceAction = {
      kind: 'create_cohort' as const,
      title: 'Create audience: Inactive members',
      summary: '12 matching members',
      requiresApproval: true,
      cohort: {
        name: 'Inactive members',
        description: 'People inactive for 21 days',
        filters: [{ field: 'daysSinceLastPlay', op: 'gte' as const, value: 21 }],
        count: 12,
      },
    }

    const declinedCampaignAction = {
      kind: 'create_campaign' as const,
      title: 'Launch reactivation campaign',
      summary: 'EMAIL draft for 12 members',
      requiresApproval: true,
      audience: previousAudienceAction.cohort,
      campaign: {
        type: 'REACTIVATION' as const,
        channel: 'email' as const,
        subject: 'Come back this week',
        body: 'We miss you.',
        execution: { mode: 'save_draft' as const },
      },
    }

    const state = deriveAdvisorConversationState([
      {
        role: 'assistant',
        content: `Ready.\n\n${buildAdvisorActionTag(previousAudienceAction)}`,
      },
      {
        role: 'assistant',
        content: `Draft ready.\n\n${buildAdvisorActionTag(declinedCampaignAction)}`,
        metadata: {
          advisorActionState: {
            status: 'declined',
            updatedAt: '2026-04-13T09:40:00.000Z',
          },
        },
      },
    ])

    expect(state?.lastActionKind).toBe('create_cohort')
    expect(state?.currentAudience?.name).toBe('Inactive members')
    expect(state?.currentCampaign).toBeUndefined()
  })
})
