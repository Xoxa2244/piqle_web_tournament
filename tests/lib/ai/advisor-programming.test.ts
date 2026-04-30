import { describe, expect, it } from 'vitest'
import {
  buildAdvisorProgrammingPlan,
  buildProgrammingAudienceProfileFromMembers,
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

  it('keeps all explicitly requested days when a prompt mentions multiple mornings', () => {
    const parsed = parseAdvisorProgrammingRequest(
      'more morning sessions on tuesday and wednesday',
    )

    expect(parsed.dayOfWeek).toBe('Tuesday')
    expect(parsed.dayOfWeeks).toEqual(['Tuesday', 'Wednesday'])
    expect(parsed.timeSlot).toBe('morning')
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

  it('keeps multiple explicitly requested days at the front of the plan', () => {
    const plan = buildAdvisorProgrammingPlan({
      sessions,
      preferences,
      request: parseAdvisorProgrammingRequest('more morning sessions on tuesday and wednesday'),
      limit: 4,
    })

    expect(plan.requestedAlternates.map((proposal) => proposal.dayOfWeek)).toEqual([
      'Tuesday',
      'Wednesday',
    ])
    expect(plan.proposals.slice(0, 2).map((proposal) => proposal.dayOfWeek)).toEqual([
      'Tuesday',
      'Wednesday',
    ])
    expect(plan.proposals.slice(0, 2).every((proposal) => proposal.timeSlot === 'morning')).toBe(true)
  })

  it('marks windows that could cannibalize existing sessions', () => {
    const riskyPlan = buildAdvisorProgrammingPlan({
      sessions: [
        {
          title: 'Wednesday Evening Intermediate Open Play',
          date: '2026-04-01',
          startTime: '18:00',
          endTime: '19:30',
          format: 'OPEN_PLAY',
          skillLevel: 'INTERMEDIATE',
          maxPlayers: 8,
          registeredCount: 4,
        },
        {
          title: 'Wednesday Evening Intermediate Open Play',
          date: '2026-04-08',
          startTime: '18:00',
          endTime: '19:30',
          format: 'OPEN_PLAY',
          skillLevel: 'INTERMEDIATE',
          maxPlayers: 8,
          registeredCount: 5,
        },
        {
          title: 'Thursday Evening Intermediate Open Play',
          date: '2026-04-03',
          startTime: '18:00',
          endTime: '19:30',
          format: 'OPEN_PLAY',
          skillLevel: 'INTERMEDIATE',
          maxPlayers: 8,
          registeredCount: 7,
        },
        {
          title: 'Thursday Evening Intermediate Open Play',
          date: '2026-04-10',
          startTime: '18:00',
          endTime: '19:30',
          format: 'OPEN_PLAY',
          skillLevel: 'INTERMEDIATE',
          maxPlayers: 8,
          registeredCount: 8,
        },
      ],
      preferences: [
        ...preferences,
        {
          preferredDays: ['Thursday'],
          preferredTimeMorning: false,
          preferredTimeAfternoon: false,
          preferredTimeEvening: true,
          skillLevel: 'INTERMEDIATE' as const,
          preferredFormats: ['Open Play'],
          targetSessionsPerWeek: 2,
          notificationsOptOut: false,
        },
      ],
      request: parseAdvisorProgrammingRequest('Add a Wednesday evening intermediate open play'),
      limit: 10,
    })

    const riskyWednesday = riskyPlan.requested
    expect(riskyWednesday?.conflict?.cannibalizationRisk).toBe('high')
    expect(riskyWednesday?.conflict?.warnings.length).toBeGreaterThan(0)
    expect(riskyWednesday?.conflict?.saferAlternativeId).toBeTruthy()
  })

  it('uses queued interest requests as suppressed demand for programming', () => {
    const plan = buildAdvisorProgrammingPlan({
      sessions: [],
      preferences: [],
      interestRequests: [
        {
          preferredDays: ['Friday'],
          preferredFormats: ['Clinic'],
          preferredTimeSlots: { morning: false, afternoon: false, evening: true },
          status: 'pending',
          sessionId: null,
        },
        {
          preferredDays: ['Friday'],
          preferredFormats: ['Clinic'],
          preferredTimeSlots: { morning: false, afternoon: false, evening: true },
          status: 'notified',
          sessionId: null,
        },
      ],
      courtCount: 2,
      limit: 3,
    })

    expect(plan.recommended).toMatchObject({
      dayOfWeek: 'Friday',
      timeSlot: 'evening',
      format: 'CLINIC',
    })
    expect(plan.recommended?.rationale.join(' ')).toContain('notify-me')
    expect(plan.insights.join(' ')).toContain('queued notify-me demand')
  })

  it('still uses interest requests when the member did not specify a day', () => {
    const plan = buildAdvisorProgrammingPlan({
      sessions: [],
      preferences: Array.from({ length: 3 }, () => ({
        preferredDays: ['Tuesday'],
        preferredTimeMorning: false,
        preferredTimeAfternoon: false,
        preferredTimeEvening: true,
        skillLevel: 'ALL_LEVELS' as const,
        preferredFormats: [],
        targetSessionsPerWeek: 2,
        notificationsOptOut: false,
      })),
      interestRequests: [
        {
          preferredDays: [],
          preferredFormats: ['Clinic'],
          preferredTimeSlots: { morning: false, afternoon: false, evening: true },
          status: 'pending',
          sessionId: null,
        },
      ],
      courtCount: 2,
      limit: 5,
    })

    expect(
      plan.proposals.some(
        (proposal) =>
          proposal.dayOfWeek === 'Tuesday' &&
          proposal.format === 'CLINIC' &&
          proposal.timeSlot === 'evening',
      ),
    ).toBe(true)
    expect(plan.insights.join(' ')).toContain('notify-me')
  })

  it('bootstraps programming suggestions from member profile when history is thin', () => {
    const audienceProfile = buildProgrammingAudienceProfileFromMembers([
      ...Array.from({ length: 18 }, () => ({
        skillLevel: 'INTERMEDIATE',
        dateOfBirth: new Date('1994-05-10'),
      })),
      ...Array.from({ length: 10 }, () => ({
        skillLevel: 'BEGINNER',
        dateOfBirth: new Date('1986-03-15'),
      })),
    ])

    const plan = buildAdvisorProgrammingPlan({
      sessions: [],
      preferences: [],
      audienceProfile,
      courtCount: 2,
      limit: 5,
    })

    expect(plan.recommended).toBeTruthy()
    expect(plan.recommended?.source).toBe('fill_gap')
    expect(plan.proposals.length).toBeGreaterThan(0)
    expect(plan.proposals[0].confidence).toBeGreaterThanOrEqual(60)
    expect(plan.insights.join(' ')).toContain('member profile data')
  })

  it('raises court pressure risk when the club has limited active courts', () => {
    const plan = buildAdvisorProgrammingPlan({
      sessions: [
        {
          title: 'Friday Evening Open Play A',
          date: '2026-04-10',
          startTime: '18:00',
          endTime: '19:30',
          format: 'OPEN_PLAY',
          skillLevel: 'INTERMEDIATE',
          maxPlayers: 8,
          registeredCount: 7,
        },
        {
          title: 'Friday Evening Open Play B',
          date: '2026-04-10',
          startTime: '18:30',
          endTime: '20:00',
          format: 'OPEN_PLAY',
          skillLevel: 'INTERMEDIATE',
          maxPlayers: 8,
          registeredCount: 7,
        },
      ],
      preferences: [
        {
          preferredDays: ['Friday'],
          preferredTimeMorning: false,
          preferredTimeAfternoon: false,
          preferredTimeEvening: true,
          skillLevel: 'INTERMEDIATE' as const,
          preferredFormats: ['Open Play'],
          targetSessionsPerWeek: 2,
          notificationsOptOut: false,
        },
      ],
      request: parseAdvisorProgrammingRequest('Add a Friday evening open play'),
      courtCount: 1,
      limit: 5,
    })

    expect(plan.requested?.conflict?.courtPressureRisk).toBe('high')
    expect(plan.requested?.conflict?.warnings.join(' ')).toContain('active court')
  })
})
