import { describe, expect, it } from 'vitest'
import type { AdvisorAction } from '@/lib/ai/advisor-actions'
import {
  buildAdvisorDraftPersistencePayload,
  buildAdvisorProgrammingOpsSessionDrafts,
  detectAdvisorDraftSelectedPlan,
  getAdvisorDraftFromMetadata,
  getAdvisorDraftProgrammingOpsSessionDrafts,
  getAdvisorDraftProgrammingPreview,
  getAdvisorDraftSlotFillerPreview,
  withAdvisorDraftMetadata,
} from '@/lib/ai/advisor-drafts'

function buildCampaignAction(
  channel: 'email' | 'sms',
  guestTrialContext?: Extract<AdvisorAction, { kind: 'create_campaign' }>['campaign']['guestTrialContext'],
): AdvisorAction {
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
      guestTrialContext,
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
        conflict: {
          overlapRisk: 'low',
          cannibalizationRisk: 'low',
          courtPressureRisk: 'low',
          overallRisk: 'low',
          riskSummary: 'This window looks comparatively clean from a scheduling-conflict standpoint.',
          warnings: [],
        },
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
          conflict: {
            overlapRisk: 'medium',
            cannibalizationRisk: 'low',
            courtPressureRisk: 'low',
            overallRisk: 'medium',
            riskSummary: 'Good opportunity, but this slot should be compared against one safer alternative before moving into ops.',
            warnings: ['Thursday evening already carries enough supply that this should stay draft-first for now.'],
          },
        },
      ],
      insights: ['Wednesday evening is the clearest programming opportunity right now.'],
    },
  }
}

function buildFillSessionAction(): Extract<AdvisorAction, { kind: 'fill_session' }> {
  return {
    kind: 'fill_session',
    title: 'Fill session: Wednesday Evening Intermediate Open Play',
    summary: 'EMAIL invites for 4 matched players',
    requiresApproval: true,
    session: {
      id: 'session-123',
      title: 'Wednesday Evening Intermediate Open Play',
      date: '2026-04-15',
      startTime: '18:00',
      endTime: '19:30',
      format: 'OPEN_PLAY',
      skillLevel: 'INTERMEDIATE',
      court: 'Court 2',
      registered: 4,
      maxPlayers: 8,
      occupancy: 50,
      spotsRemaining: 4,
    },
    outreach: {
      channel: 'email',
      candidateCount: 4,
      message: 'We saved you a spot for Wednesday evening.',
      candidates: [
        {
          memberId: 'member-1',
          name: 'Alex Rider',
          score: 91,
          channel: 'email',
        },
      ],
      guardrails: {
        requestedChannel: 'email',
        eligibleCount: 4,
        excludedCount: 1,
        deliveryBreakdown: { email: 4, sms: 0, both: 0 },
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

  it('persists guest/trial execution context into draft workspace metadata', () => {
    const action = buildCampaignAction('email', {
      source: 'guest_trial_booking',
      stage: 'book_first_visit',
      offerKey: 'guest_pass',
      offerName: 'Guest Pass',
      offerKind: 'guest_pass',
      destinationType: 'schedule',
      destinationDescriptor: 'beginner booking page',
      routeKey: 'schedule:beginner booking page',
    })

    const payload = buildAdvisorDraftPersistencePayload({
      action,
      originalIntent: 'Help guests book their first visit',
    })

    expect(payload.metadata).toMatchObject({
      guestTrialContext: {
        stage: 'book_first_visit',
        offerName: 'Guest Pass',
        destinationDescriptor: 'beginner booking page',
      },
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
        conflict: {
          overallRisk: 'low',
        },
      },
    })
    expect(preview?.alternatives).toHaveLength(1)
  })

  it('persists a compact slot-filler preview in draft metadata', () => {
    const payload = buildAdvisorDraftPersistencePayload({
      action: buildFillSessionAction(),
      originalIntent: 'Fill the Wednesday evening session.',
    })

    expect(getAdvisorDraftSlotFillerPreview(payload.metadata)).toMatchObject({
      sessionId: 'session-123',
      title: 'Wednesday Evening Intermediate Open Play',
      occupancy: 50,
      spotsRemaining: 4,
      candidateCount: 4,
      channel: 'email',
    })
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
      handoff: {
        summary: 'Wednesday Evening Intermediate Open Play is the lead programming recommendation for "Add a stronger weekday evening intermediate option".',
        whyNow: 'Strong repeat demand in this window.',
      },
    })
    expect(opsDrafts[1]).toMatchObject({
      id: 'ops-thu-evening-open-play',
      origin: 'alternative',
      state: 'ready_for_ops',
      handoff: {
        nextStep: 'Assign an ops owner, sanity-check nearby sessions, then move it into the internal session draft queue.',
      },
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

  it('keeps structured handoff details in programming ops draft metadata', () => {
    const opsDrafts = buildAdvisorProgrammingOpsSessionDrafts(buildProgrammingAction())

    expect(opsDrafts[0].handoff).toMatchObject({
      summary: 'Wednesday Evening Intermediate Open Play is the lead programming recommendation for "Add a stronger weekday evening intermediate option".',
      whyNow: 'Strong repeat demand in this window.',
      nextStep: 'Assign an ops owner and move it into the internal session draft queue when the team is ready.',
    })
    expect(opsDrafts[1].handoff?.watchouts).toContain(
      'Thursday evening already carries enough supply that this should stay draft-first for now.',
    )
  })
})
