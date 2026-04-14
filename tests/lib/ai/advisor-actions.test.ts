import { describe, expect, it } from 'vitest'
import {
  buildAdvisorActionTag,
  extractAdvisorAction,
  stripAdvisorRecommendation,
  type AdvisorAction,
} from '@/lib/ai/advisor-actions'
import { buildAdvisorRecommendation } from '@/lib/ai/advisor-recommendations'

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

describe('advisor action recommendations', () => {
  it('parses action tags with embedded recommendation payloads', () => {
    const requested = buildCampaignAction('email')
    const recommended = buildCampaignAction('sms')
    const recommendation = buildAdvisorRecommendation({
      current: requested,
      recommended,
      title: 'Agent recommendation for this campaign',
      why: ['Recent reactivation results are strongest via SMS for this club.'],
      highlights: ['Switch to SMS'],
    })

    const tagged = buildAdvisorActionTag({
      ...requested,
      recommendation,
    })
    const parsed = extractAdvisorAction(tagged)

    if (!parsed || !parsed.recommendation || parsed.recommendation.action.kind !== 'create_campaign') {
      throw new Error('Expected a campaign recommendation to be parsed from the action tag')
    }

    expect(parsed?.kind).toBe('create_campaign')
    expect(parsed?.recommendation?.action.kind).toBe('create_campaign')
    expect(parsed.recommendation.action.campaign.channel).toBe('sms')
    expect(parsed?.recommendation?.highlights).toContain('Switch to SMS')
  })

  it('strips recommendation metadata before execution payload reuse', () => {
    const requested = buildCampaignAction('email')
    const recommended = buildCampaignAction('sms')

    const next = {
      ...requested,
      recommendation: buildAdvisorRecommendation({
        current: requested,
        recommended,
        title: 'Agent recommendation for this campaign',
        why: ['Recent reactivation results are strongest via SMS for this club.'],
      }),
    } satisfies AdvisorAction

    const stripped = stripAdvisorRecommendation(next)

    if (stripped.kind !== 'create_campaign') {
      throw new Error('Expected stripped action to remain a campaign draft')
    }

    expect(stripped.kind).toBe('create_campaign')
    expect('recommendation' in stripped).toBe(false)
    expect(stripped.campaign.channel).toBe('email')
  })
})
