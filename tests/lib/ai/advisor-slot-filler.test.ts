import { describe, expect, it } from 'vitest'
import {
  buildAdvisorSlotSessionOptions,
  formatAdvisorSlotSessionLabel,
  resolveAdvisorSlotSession,
} from '@/lib/ai/advisor-slot-filler'

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

const now = new Date('2026-04-12T16:00:00.000Z')

describe('advisor slot filler session resolution', () => {
  it('reuses the current session when the user says this session', () => {
    const result = resolveAdvisorSlotSession({
      message: 'Fill this session with SMS invites',
      sessions: [...sessions],
      currentSession: sessions[0],
      now,
    })

    expect(result.session?.id).toBe('session-1')
    expect(result.reason).toBe('current')
  })

  it('matches a session from time and skill hints', () => {
    const result = resolveAdvisorSlotSession({
      message: "Fill tomorrow's 6pm beginner session",
      sessions: [...sessions],
      now,
    })

    expect(result.session?.id).toBe('session-1')
    expect(result.reason).toBe('best_match')
  })

  it('picks the most underfilled session when asked for the most urgent one', () => {
    const result = resolveAdvisorSlotSession({
      message: 'Fill the most underfilled session this week',
      sessions: [...sessions],
      now,
    })

    expect(result.session?.id).toBe('session-2')
    expect(result.reason).toBe('most_underfilled')
  })

  it('builds readable session options for clarification', () => {
    const label = formatAdvisorSlotSessionLabel(sessions[0])
    const options = buildAdvisorSlotSessionOptions([...sessions], 2)

    expect(label).toContain('Apr')
    expect(label).toContain('6:00 PM')
    expect(options).toHaveLength(2)
    expect(options[0]).toContain('spots left')
  })

  it('understands today when the base time is fixed', () => {
    const result = resolveAdvisorSlotSession({
      message: 'Fill today 6pm beginner session',
      sessions: [
        {
          ...sessions[0],
          id: 'session-today',
          date: '2026-04-12',
        },
        sessions[1],
      ],
      now,
    })

    expect(result.session?.id).toBe('session-today')
  })
})
