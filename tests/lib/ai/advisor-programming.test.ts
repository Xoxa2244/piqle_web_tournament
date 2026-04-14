import { describe, expect, it } from 'vitest'
import {
  buildAdvisorProgrammingPlan,
  parseAdvisorProgrammingRequest,
} from '@/lib/ai/advisor-programming'

describe('advisor programming request parsing', () => {
  it('extracts day, time, format, skill, and max players from a request', () => {
    const parsed = parseAdvisorProgrammingRequest(
      'Add a beginner clinic on Tuesday at 6pm for 8 players',
    )

    expect(parsed).toMatchObject({
      dayOfWeek: 'Tuesday',
      timeSlot: 'evening',
      startTime: '18:00',
      format: 'CLINIC',
      skillLevel: 'BEGINNER',
      maxPlayers: 8,
    })
  })
})

describe('advisor programming planning', () => {
  const sessions = [
    {
      title: 'Intermediate Open Play',
      date: '2026-04-01',
      startTime: '18:00',
      endTime: '19:30',
      format: 'OPEN_PLAY' as const,
      skillLevel: 'INTERMEDIATE' as const,
      maxPlayers: 8,
      registeredCount: 7,
    },
    {
      title: 'Intermediate Open Play',
      date: '2026-04-08',
      startTime: '18:00',
      endTime: '19:30',
      format: 'OPEN_PLAY' as const,
      skillLevel: 'INTERMEDIATE' as const,
      maxPlayers: 8,
      registeredCount: 8,
    },
  ]

  const preferences = [
    {
      preferredDays: ['Wednesday'],
      preferredTimeMorning: false,
      preferredTimeAfternoon: false,
      preferredTimeEvening: true,
      skillLevel: 'INTERMEDIATE' as const,
      preferredFormats: ['Open Play'],
      targetSessionsPerWeek: 2,
      notificationsOptOut: false,
    },
    {
      preferredDays: ['Wednesday'],
      preferredTimeMorning: false,
      preferredTimeAfternoon: false,
      preferredTimeEvening: true,
      skillLevel: 'INTERMEDIATE' as const,
      preferredFormats: ['Open Play'],
      targetSessionsPerWeek: 3,
      notificationsOptOut: false,
    },
    {
      preferredDays: ['Wednesday'],
      preferredTimeMorning: false,
      preferredTimeAfternoon: false,
      preferredTimeEvening: true,
      skillLevel: 'INTERMEDIATE' as const,
      preferredFormats: ['Clinic'],
      targetSessionsPerWeek: 1,
      notificationsOptOut: false,
    },
  ]

  it('recommends expanding a high-demand peak window', () => {
    const plan = buildAdvisorProgrammingPlan({
      sessions,
      preferences,
      limit: 3,
    })

    expect(plan.recommended).toBeTruthy()
    expect(plan.proposals[0]).toMatchObject({
      dayOfWeek: 'Wednesday',
      timeSlot: 'evening',
      format: 'OPEN_PLAY',
      skillLevel: 'INTERMEDIATE',
      source: 'expand_peak',
    })
    expect(plan.insights[0]).toContain('Wednesday evening')
  })

  it('keeps the requested shape first while retaining alternatives', () => {
    const plan = buildAdvisorProgrammingPlan({
      sessions,
      preferences,
      request: parseAdvisorProgrammingRequest('Add a beginner clinic on Tuesday morning'),
      limit: 3,
    })

    expect(plan.requested).toBeTruthy()
    expect(plan.proposals[0]).toMatchObject({
      dayOfWeek: 'Tuesday',
      timeSlot: 'morning',
      format: 'CLINIC',
      skillLevel: 'BEGINNER',
    })
    expect(plan.proposals.length).toBeGreaterThan(1)
  })
})
