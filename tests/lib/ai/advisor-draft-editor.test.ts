import { describe, expect, it } from 'vitest'
import type { AdvisorAction } from '@/lib/ai/advisor-actions'
import { maybeEditAdvisorDraft } from '@/lib/ai/advisor-draft-editor'

const sessions = [
  {
    id: 'session-1',
    title: 'Beginner Open Play',
    date: '2026-04-13',
    startTime: '18:00:00',
    endTime: '19:30:00',
    format: 'OPEN_PLAY',
    skillLevel: 'BEGINNER',
    court: 'Court 1',
    registered: 4,
    maxPlayers: 8,
    occupancy: 50,
    spotsRemaining: 4,
  },
  {
    id: 'session-2',
    title: 'Intermediate Ladder',
    date: '2026-04-14',
    startTime: '09:00:00',
    endTime: '10:30:00',
    format: 'LADDER',
    skillLevel: 'INTERMEDIATE',
    court: 'Court 2',
    registered: 2,
    maxPlayers: 8,
    occupancy: 25,
    spotsRemaining: 6,
  },
] as const

const fillAction: AdvisorAction = {
  kind: 'fill_session',
  title: 'Fill session: Beginner Open Play',
  summary: 'EMAIL invites for 5 matched players',
  requiresApproval: true,
  session: sessions[0],
  outreach: {
    channel: 'email',
    candidateCount: 5,
    message: 'Hi there! We have a few open spots in tomorrow evening’s beginner open play and would love to see you there.',
    candidates: [
      { memberId: 'member-1', name: 'Alex', score: 92, likelihood: 'high', email: 'alex@example.com' },
      { memberId: 'member-2', name: 'Sam', score: 87, likelihood: 'high', email: 'sam@example.com' },
      { memberId: 'member-3', name: 'Jordan', score: 84, likelihood: 'medium', email: 'jordan@example.com' },
      { memberId: 'member-4', name: 'Taylor', score: 81, likelihood: 'medium', email: 'taylor@example.com' },
      { memberId: 'member-5', name: 'Chris', score: 76, likelihood: 'medium', email: 'chris@example.com' },
    ],
  },
}

const state = {
  currentSession: sessions[0],
  recentOutcomes: [],
  lastActionKind: 'fill_session' as const,
  lastActionTitle: fillAction.title,
  updatedAt: '2026-04-12T16:00:00.000Z',
}

const reactivationAction: AdvisorAction = {
  kind: 'reactivate_members',
  title: 'Reactivate: 21+ day inactive members',
  summary: 'EMAIL win-back outreach for 8 inactive members',
  requiresApproval: true,
  reactivation: {
    segmentLabel: '21+ day inactive members',
    inactivityDays: 21,
    channel: 'email',
    candidateCount: 8,
    message: 'Hi {{name}}, we miss seeing you at {{club}}. We have new sessions coming up that match your level and would love to have you back.',
    candidates: [
      { memberId: 'member-a', name: 'Avery', score: 18, daysSinceLastActivity: 35, topReason: 'Gradual disengagement', suggestedSessionTitle: 'Beginner Open Play' },
      { memberId: 'member-b', name: 'Blake', score: 21, daysSinceLastActivity: 29, topReason: 'Cancellation pattern', suggestedSessionTitle: 'Intermediate Ladder' },
      { memberId: 'member-c', name: 'Casey', score: 25, daysSinceLastActivity: 31 },
      { memberId: 'member-d', name: 'Devon', score: 27, daysSinceLastActivity: 42 },
      { memberId: 'member-e', name: 'Emerson', score: 32, daysSinceLastActivity: 47 },
      { memberId: 'member-f', name: 'Finley', score: 34, daysSinceLastActivity: 53 },
      { memberId: 'member-g', name: 'Gray', score: 36, daysSinceLastActivity: 61 },
      { memberId: 'member-h', name: 'Harper', score: 39, daysSinceLastActivity: 68 },
    ],
  },
}

const reactivationState = {
  currentReactivation: reactivationAction.reactivation,
  recentOutcomes: [],
  lastActionKind: 'reactivate_members' as const,
  lastActionTitle: reactivationAction.title,
  updatedAt: '2026-04-12T16:00:00.000Z',
}

const trialFollowUpAction: AdvisorAction = {
  kind: 'trial_follow_up',
  title: 'Prepare trial follow-up',
  summary: 'EMAIL draft for 6 trial follow-up members',
  requiresApproval: true,
  lifecycle: {
    lifecycle: 'trial_follow_up',
    campaignType: 'RETENTION_BOOST',
    label: 'Trial members with no first booking',
    channel: 'email',
    candidateCount: 6,
    subject: 'Ready for your first game?',
    message: 'Hi {{name}}, your trial is active at {{club}} and we would love to help you lock in your first booking this week.',
    execution: {
      mode: 'save_draft',
    },
    candidates: [
      { memberId: 'trial-1', name: 'Avery', score: 96, daysSinceSignal: 3, membershipStatus: 'trial', topReason: 'Joined 3 days ago and has not booked yet.' },
      { memberId: 'trial-2', name: 'Blake', score: 92, daysSinceSignal: 4, membershipStatus: 'trial', topReason: 'Joined 4 days ago and has not booked yet.' },
      { memberId: 'trial-3', name: 'Casey', score: 89, daysSinceSignal: 5, membershipStatus: 'trial', topReason: 'Joined 5 days ago and has not booked yet.' },
      { memberId: 'trial-4', name: 'Devon', score: 85, daysSinceSignal: 6, membershipStatus: 'trial', topReason: 'Joined 6 days ago and has not booked yet.' },
      { memberId: 'trial-5', name: 'Emerson', score: 82, daysSinceSignal: 7, membershipStatus: 'trial', topReason: 'Joined 7 days ago and has not booked yet.' },
      { memberId: 'trial-6', name: 'Finley', score: 78, daysSinceSignal: 8, membershipStatus: 'trial', topReason: 'Joined 8 days ago and has not booked yet.' },
    ],
  },
}

const trialFollowUpState = {
  currentMembershipLifecycle: trialFollowUpAction.lifecycle,
  recentOutcomes: [],
  lastActionKind: 'trial_follow_up' as const,
  lastActionTitle: trialFollowUpAction.title,
  updatedAt: '2026-04-12T16:00:00.000Z',
}

describe('advisor draft editor for fill session drafts', () => {
  it('switches the active fill session draft to SMS', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Use SMS instead',
      state,
      lastAction: fillAction,
      sessions: [...sessions],
    })

    expect(edited?.kind).toBe('fill_session')
    expect((edited as Extract<AdvisorAction, { kind: 'fill_session' }>).outreach.channel).toBe('sms')
  })

  it('reduces the invite list to the top 3 players', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Invite the top 3 players',
      state,
      lastAction: fillAction,
      sessions: [...sessions],
    })

    expect(edited?.kind).toBe('fill_session')
    const slotDraft = edited as Extract<AdvisorAction, { kind: 'fill_session' }>
    expect(slotDraft.outreach.candidateCount).toBe(3)
    expect(slotDraft.outreach.candidates).toHaveLength(3)
  })

  it('picks another session when the user asks for a different one', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Pick another session',
      state,
      lastAction: fillAction,
      sessions: [...sessions],
    })

    expect(edited?.kind).toBe('fill_session')
    expect((edited as Extract<AdvisorAction, { kind: 'fill_session' }>).session.id).toBe('session-2')
  })
})

describe('advisor draft editor for reactivation drafts', () => {
  it('switches the active reactivation draft to SMS', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Use SMS instead',
      state: reactivationState,
      lastAction: reactivationAction,
      sessions: [...sessions],
    })

    expect(edited?.kind).toBe('reactivate_members')
    expect((edited as Extract<AdvisorAction, { kind: 'reactivate_members' }>).reactivation.channel).toBe('sms')
  })

  it('reduces the reactivation draft to the top 5 members', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Only top 5 members',
      state: reactivationState,
      lastAction: reactivationAction,
      sessions: [...sessions],
    })

    expect(edited?.kind).toBe('reactivate_members')
    const reactivationDraft = edited as Extract<AdvisorAction, { kind: 'reactivate_members' }>
    expect(reactivationDraft.reactivation.candidateCount).toBe(5)
    expect(reactivationDraft.reactivation.candidates).toHaveLength(5)
  })

  it('retargets the reactivation draft to a new inactivity threshold', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Target members inactive 30 days',
      state: reactivationState,
      lastAction: reactivationAction,
      sessions: [...sessions],
    })

    expect(edited?.kind).toBe('reactivate_members')
    const reactivationDraft = edited as Extract<AdvisorAction, { kind: 'reactivate_members' }>
    expect(reactivationDraft.reactivation.inactivityDays).toBe(30)
    expect(reactivationDraft.reactivation.segmentLabel).toContain('30+')
  })
})

describe('advisor draft editor for membership lifecycle drafts', () => {
  it('switches the active trial follow-up draft to SMS', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Use SMS instead',
      state: trialFollowUpState,
      lastAction: trialFollowUpAction,
      sessions: [...sessions],
    })

    expect(edited?.kind).toBe('trial_follow_up')
    const lifecycleDraft = edited as Extract<AdvisorAction, { kind: 'trial_follow_up' }>
    expect(lifecycleDraft.lifecycle.channel).toBe('sms')
    expect(lifecycleDraft.lifecycle.smsBody).toBeTruthy()
  })

  it('reduces the active trial follow-up draft to the top 3 members', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Only keep the top 3 trial members',
      state: trialFollowUpState,
      lastAction: trialFollowUpAction,
      sessions: [...sessions],
    })

    expect(edited?.kind).toBe('trial_follow_up')
    const lifecycleDraft = edited as Extract<AdvisorAction, { kind: 'trial_follow_up' }>
    expect(lifecycleDraft.lifecycle.candidateCount).toBe(3)
    expect(lifecycleDraft.lifecycle.candidates).toHaveLength(3)
  })

  it('schedules the trial follow-up draft when asked', async () => {
    const edited = await maybeEditAdvisorDraft({
      message: 'Schedule this for tomorrow at 6pm',
      state: trialFollowUpState,
      lastAction: trialFollowUpAction,
      sessions: [...sessions],
      timeZone: 'America/Los_Angeles',
    })

    expect(edited?.kind).toBe('trial_follow_up')
    const lifecycleDraft = edited as Extract<AdvisorAction, { kind: 'trial_follow_up' }>
    expect(lifecycleDraft.lifecycle.execution.mode).toBe('send_later')
    expect(lifecycleDraft.lifecycle.execution.scheduledFor).toBeTruthy()
  })
})
