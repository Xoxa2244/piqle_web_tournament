import { describe, expect, it } from 'vitest'
import type { AdvisorAction } from '@/lib/ai/advisor-actions'
import {
  buildAdvisorDraftPersistencePayload,
  detectAdvisorDraftSelectedPlan,
  getAdvisorDraftFromMetadata,
  withAdvisorDraftMetadata,
} from '@/lib/ai/advisor-drafts'

function buildCampaignAction(channel: 'email' | 'sms'): AdvisorAction {
  return {
    kind: 'create_campaign',
    title: 'Launch reactivation campaign',
    summary: `${channel.toUpperCase()} draft for 12 eligible members`,
    requiresApproval: true,
    audience: {
      name: 'Inactive 21+ day members',
      filters: [{ field: 'recency', op: 'gte', value: 21 }],
      count: 12,
    },
    campaign: {
      type: 'REACTIVATION',
      channel,
      subject: 'Come back this week',
      body: 'We saved you a spot this week.',
      execution: {
        mode: 'save_draft',
      },
      guardrails: {
        requestedChannel: channel,
        eligibleCount: 12,
        excludedCount: 0,
        deliveryBreakdown: { email: channel === 'email' ? 12 : 0, sms: channel === 'sms' ? 12 : 0, both: 0 },
        reasons: [],
        warnings: [],
      },
    },
  }
}

describe('advisor drafts', () => {
  it('builds requested and recommended payloads separately', () => {
    const requested = buildCampaignAction('email')
    const recommended = buildCampaignAction('sms')
    const action: AdvisorAction = {
      ...requested,
      recommendation: {
        title: 'Use SMS instead',
        why: ['Recent reactivation results are strongest via SMS for this club.'],
        highlights: ['Switch to SMS'],
        action: recommended,
      },
    }

    const payload = buildAdvisorDraftPersistencePayload({
      action,
      originalIntent: 'Send a renewal email',
    })

    expect(payload.selectedPlan).toBe('requested')
    expect(payload.requestedAction.kind).toBe('create_campaign')
    expect(payload.requestedAction.campaign.channel).toBe('email')
    expect(payload.recommendedAction?.campaign.channel).toBe('sms')
    expect(payload.workingAction.campaign.channel).toBe('email')
    expect(payload.sandboxMode).toBe(true)
  })

  it('detects when the recommended plan was chosen', () => {
    const requested = buildCampaignAction('email')
    const recommended = buildCampaignAction('sms')
    const action: AdvisorAction = {
      ...requested,
      recommendation: {
        title: 'Use SMS instead',
        why: ['Recent reactivation results are strongest via SMS for this club.'],
        highlights: [],
        action: recommended,
      },
    }

    expect(detectAdvisorDraftSelectedPlan(action, requested)).toBe('requested')
    expect(detectAdvisorDraftSelectedPlan(action, recommended)).toBe('recommended')
  })

  it('round-trips advisor draft metadata', () => {
    const metadata = withAdvisorDraftMetadata({}, {
      id: '4aa273d3-394f-4a9b-acbf-c71fd9a437bf',
      status: 'sandboxed',
      selectedPlan: 'requested',
      sandboxMode: true,
      updatedAt: '2026-04-13T22:30:00.000Z',
    })

    expect(getAdvisorDraftFromMetadata(metadata)).toEqual({
      id: '4aa273d3-394f-4a9b-acbf-c71fd9a437bf',
      status: 'sandboxed',
      selectedPlan: 'requested',
      sandboxMode: true,
      updatedAt: '2026-04-13T22:30:00.000Z',
    })
  })
})
