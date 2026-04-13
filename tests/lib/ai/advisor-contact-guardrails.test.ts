import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateAdvisorContactGuardrails } from '@/lib/ai/advisor-contact-guardrails'

function createMockPrisma() {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    playSessionBooking: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userPlayPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    aIRecommendationLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

beforeEach(() => {
  mockPrisma = createMockPrisma()
})

describe('advisor contact guardrails', () => {
  it('downgrades both-channel outreach to email when SMS is unavailable', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'member-1', email: 'alex@example.com', phone: null, smsOptIn: false },
      { id: 'member-2', email: 'sam@example.com', phone: '+155555501', smsOptIn: true },
    ])

    const result = await evaluateAdvisorContactGuardrails({
      prisma: mockPrisma,
      clubId: 'club-1',
      type: 'SLOT_FILLER',
      requestedChannel: 'both',
      candidates: [{ memberId: 'member-1' }, { memberId: 'member-2' }],
      sessionId: 'session-1',
      timeZone: 'America/Los_Angeles',
      now: new Date('2026-04-13T18:00:00.000Z'),
    })

    expect(result.summary.eligibleCount).toBe(2)
    expect(result.summary.deliveryBreakdown.email).toBe(1)
    expect(result.summary.deliveryBreakdown.both).toBe(1)
    expect(result.summary.excludedCount).toBe(0)
    expect(result.eligibleCandidates.find((candidate) => candidate.memberId === 'member-1')?.channel).toBe('email')
  })

  it('excludes reactivation members who booked recently', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'member-1', email: 'alex@example.com', phone: null, smsOptIn: false },
      { id: 'member-2', email: 'sam@example.com', phone: null, smsOptIn: false },
    ])
    mockPrisma.playSessionBooking.findMany.mockResolvedValue([{ userId: 'member-2' }])

    const result = await evaluateAdvisorContactGuardrails({
      prisma: mockPrisma,
      clubId: 'club-1',
      type: 'REACTIVATION',
      requestedChannel: 'email',
      candidates: [{ memberId: 'member-1' }, { memberId: 'member-2' }],
      timeZone: 'America/New_York',
      now: new Date('2026-04-13T18:00:00.000Z'),
    })

    expect(result.summary.eligibleCount).toBe(1)
    expect(result.summary.excludedCount).toBe(1)
    expect(result.summary.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'recent_booking', count: 1 }),
      ]),
    )
  })

  it('shows a quiet hours warning without excluding eligible members', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'member-1', email: 'alex@example.com', phone: null, smsOptIn: false },
    ])

    const result = await evaluateAdvisorContactGuardrails({
      prisma: mockPrisma,
      clubId: 'club-1',
      type: 'REACTIVATION',
      requestedChannel: 'email',
      candidates: [{ memberId: 'member-1' }],
      timeZone: 'America/Los_Angeles',
      now: new Date('2026-04-13T12:00:00.000Z'),
    })

    expect(result.summary.eligibleCount).toBe(1)
    expect(result.summary.warnings[0]).toContain('Quiet hours are active')
  })
})
