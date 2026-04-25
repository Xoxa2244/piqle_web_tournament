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

const programmingAction: AdvisorAction = {
  kind: 'program_schedule',
  title: 'Draft stronger weekday programming',
  summary: '2 schedule ideas around Wednesday Evening Intermediate Open Play',
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

const guestTrialCampaignAction: AdvisorAction = {
  ...createCampaignAction,
  campaign: {
    ...createCampaignAction.campaign,
    guestTrialContext: {
      source: 'guest_trial_booking',
      stage: 'convert_to_paid',
      offerKey: 'starter_membership',
      offerName: 'Starter Membership',
      offerKind: 'membership_offer',
      destinationType: 'landing_page',
      destinationDescriptor: 'starter membership checkout',
      routeKey: 'landing_page:starter membership checkout',
    },
  },
}

const guestTrialFollowUpAction: AdvisorAction = {
  ...trialFollowUpAction,
  lifecycle: {
    ...trialFollowUpAction.lifecycle,
    guestTrialContext: {
      source: 'guest_trial_booking',
      stage: 'book_first_visit',
      offerKey: 'guest_pass',
      offerName: 'Guest Pass',
      offerKind: 'guest_pass',
      destinationType: 'schedule',
      destinationDescriptor: 'beginner booking page',
      routeKey: 'schedule:beginner booking page',
    },
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

  it('builds sandbox preview summaries for campaign execution', () => {
    const outcome = buildAdvisorOutcomeMemory(
      createCampaignAction,
      {
        kind: 'create_campaign',
        sandboxed: true,
        previewRecipientCount: 7,
        scheduledLabel: 'Tue, Apr 14, 9:00 AM PDT',
      },
      '2026-04-13T18:25:00.000Z',
    )

    expect(outcome.summary).toContain('Campaign sandbox preview prepared')
    expect(outcome.summary).toContain('7 eligible members')
  })

  it('includes exact guest/trial context in campaign outcomes', () => {
    const outcome = buildAdvisorOutcomeMemory(
      guestTrialCampaignAction,
      {
        kind: 'create_campaign',
        savedAsDraft: true,
        memberCount: 5,
      },
      '2026-04-13T18:26:00.000Z',
    )

    expect(outcome.summary).toContain('Campaign draft saved')
    expect(outcome.summary).toContain('Starter Membership')
    expect(outcome.summary).toContain('starter membership checkout')
  })

  it('includes exact guest/trial context in trial follow-up outcomes', () => {
    const outcome = buildAdvisorOutcomeMemory(
      guestTrialFollowUpAction,
      {
        kind: 'trial_follow_up',
        deliveryMode: 'send_later',
        scheduledLabel: 'Tue, Apr 14, 9:00 AM PDT',
        memberCount: 4,
      },
      '2026-04-13T18:27:00.000Z',
    )

    expect(outcome.summary).toContain('Trial follow-up scheduled')
    expect(outcome.summary).toContain('Guest Pass')
    expect(outcome.summary).toContain('beginner booking page')
  })

  it('summarizes created ops drafts for programming actions', () => {
    const outcome = buildAdvisorOutcomeMemory(
      programmingAction,
      {
        kind: 'program_schedule',
        opsDraftsCreated: 2,
      },
      '2026-04-13T18:30:00.000Z',
    )

    expect(outcome.summary).toContain('Created 2 ops session drafts')
  })
})
