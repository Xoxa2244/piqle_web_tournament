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
  lastActionKind: 'fill_session' as const,
  lastActionTitle: fillAction.title,
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
