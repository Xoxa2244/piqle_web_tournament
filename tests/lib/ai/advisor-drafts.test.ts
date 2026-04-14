import { describe, expect, it } from 'vitest'
import type { AdvisorAction } from '@/lib/ai/advisor-actions'
import {
  buildAdvisorDraftPersistencePayload,
  buildAdvisorProgrammingOpsSessionDrafts,
  detectAdvisorDraftSelectedPlan,
  getAdvisorDraftFromMetadata,
  getAdvisorDraftProgrammingOpsSessionDrafts,
  getAdvisorDraftProgrammingPreview,
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

function buildProgrammingAction(): Extract<AdvisorAction, { kind: 'program_schedule' }> {
  return {
    kind: 'program_schedule',
    title: 'Draft programming plan',
    summary: '3 schedule ideas around Wednesday Evening Intermediate Open Play',
    requiresApproval: true,
    program: {
      goal: 'Add a stronger weekday evening intermediate option',
      publishMode: 'draft_only',
      primary: {
        id: 'wed-evening-open-play',
        title: 'Wednesday Evening Intermediate Open Play',
        dayOfWeek: 'Wednesday',
        timeSlot: 'evening',
        startTime: '18:00',
        endTime: '19:30',
        format: 'OPEN_PLAY',
        skillLevel: 'INTERMEDIATE',
        maxPlayers: 8,
        projectedOccupancy: 84,
        estimatedInterestedMembers: 9,
        confidence: 87,
        source: 'expand_peak',
        rationale: ['Strong repeat demand in this window.'],
      },
      alternatives: [
        {
          id: 'thu-evening-open-play',
          title: 'Thursday Evening Intermediate Open Play',
          dayOfWeek: 'Thursday',
          timeSlot: 'evening',
          startTime: '18:00',
          endTime: '19:30',
          format: 'OPEN_PLAY',
          skillLevel: 'INTERMEDIATE',
          maxPlayers: 8,
          projectedOccupancy: 79,
          estimatedInterestedMembers: 7,
          confidence: 82,
          source: 'fill_gap',
          rationale: ['Secondary demand signal.'],
        },
      ],
      insights: ['Wednesday evening is the clearest programming opportunity right now.'],
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

    if (payload.requestedAction.kind !== 'create_campaign') {
      throw new Error('Expected requested action to be a campaign draft')
    }

    if (!payload.recommendedAction || payload.recommendedAction.kind !== 'create_campaign') {
      throw new Error('Expected recommended action to be a campaign draft')
    }

    if (payload.workingAction.kind !== 'create_campaign') {
      throw new Error('Expected working action to be a campaign draft')
    }

    expect(payload.selectedPlan).toBe('requested')
    expect(payload.requestedAction.kind).toBe('create_campaign')
    expect(payload.requestedAction.campaign.channel).toBe('email')
    expect(payload.recommendedAction.campaign.channel).toBe('sms')
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

  it('persists a compact programming preview in draft metadata', () => {
    const payload = buildAdvisorDraftPersistencePayload({
      action: buildProgrammingAction(),
      originalIntent: 'What should we add to the schedule next?',
    })

    const preview = getAdvisorDraftProgrammingPreview(payload.metadata)

    expect(preview).toMatchObject({
      goal: 'Add a stronger weekday evening intermediate option',
      publishMode: 'draft_only',
      primary: {
        title: 'Wednesday Evening Intermediate Open Play',
        projectedOccupancy: 84,
        estimatedInterestedMembers: 9,
      },
    })
    expect(preview?.alternatives).toHaveLength(1)
  })

  it('builds internal ops session drafts for programming plans', () => {
    const action = buildProgrammingAction()
    const opsDrafts = buildAdvisorProgrammingOpsSessionDrafts(action)

    expect(opsDrafts).toHaveLength(2)
    expect(opsDrafts[0]).toMatchObject({
      id: 'ops-wed-evening-open-play',
      sourceProposalId: 'wed-evening-open-play',
      origin: 'primary',
      state: 'ready_for_ops',
      title: 'Wednesday Evening Intermediate Open Play',
      maxPlayers: 8,
    })
    expect(opsDrafts[1]).toMatchObject({
      id: 'ops-thu-evening-open-play',
      origin: 'alternative',
      state: 'ready_for_ops',
    })
  })

  it('round-trips programming ops drafts from metadata', () => {
    const opsDrafts = buildAdvisorProgrammingOpsSessionDrafts(buildProgrammingAction())
    const payload = buildAdvisorDraftPersistencePayload({
      action: buildProgrammingAction(),
      metadata: { opsSessionDrafts: opsDrafts },
    })

    expect(getAdvisorDraftProgrammingOpsSessionDrafts(payload.metadata)).toEqual(opsDrafts)
  })
})
