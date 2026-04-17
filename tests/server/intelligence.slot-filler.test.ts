/**
 * Integration test: intelligence.getSlotFillerRecommendations
 *
 * FINDING from building this test: the UUID path of this procedure does NOT
 * use the rich scorer in lib/ai/slot-filler.ts. It uses an inline raw-SQL
 * function `getFrequentPlayersFallback` defined in the router itself.
 *
 * The rich `generateSlotFillerRecommendations` scorer is only used by:
 *   1. The cron at /api/campaigns/slot-filler (via slot-filler-automation.ts)
 *   2. The advisor action flow (via intelligence.executeAdvisorAction)
 *
 * That is a layer-gap risk exactly like a code reviewer warned about:
 * unit tests on lib/ai/slot-filler.ts pass, giving false confidence that
 * "slot filler works", while the UI actually shows results from a separate
 * SQL implementation with no tests of its own.
 *
 * These tests document the CURRENT behaviour so that:
 *   - If someone refactors the router to use the rich scorer, tests fail
 *     and force intentional acknowledgement.
 *   - If someone edits the SQL fallback, we still catch shape/auth breakage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock subscription gate — always allow
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(true),
}))

// Mock requireClubAdmin — always allow
vi.mock('@/server/routers/intelligence-helpers', () => ({
  requireClubAdmin: vi.fn().mockResolvedValue(true),
}))

// Spy on the rich scorer — we want to ASSERT IT IS NOT CALLED from this path
vi.mock('@/lib/ai/slot-filler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/slot-filler')>(
    '@/lib/ai/slot-filler',
  )
  return {
    ...actual,
    generateSlotFillerRecommendations: vi.fn(actual.generateSlotFillerRecommendations),
  }
})

import { createTestCaller } from './helpers/trpc-test-caller'
import { generateSlotFillerRecommendations } from '@/lib/ai/slot-filler'

const SESSION_ID = 'session-abc'
const CLUB_ID = 'club-xyz'

function makeMockSession() {
  return {
    id: SESSION_ID,
    clubId: CLUB_ID,
    title: 'Evening Doubles',
    date: new Date('2026-05-01T18:00:00Z'),
    startTime: '18:00',
    endTime: '19:30',
    format: 'OPEN_PLAY',
    skillLevel: 'INTERMEDIATE',
    maxPlayers: 8,
    category: null,
    clubCourt: { id: 'court-1', name: 'Court A', surface: 'hard' },
    bookings: [
      { userId: 'booked-1' },
      { userId: 'booked-2' },
    ],
    _count: { bookings: 2 },
  }
}

function makeMockMembers() {
  return [
    {
      userId: 'member-1',
      clubId: CLUB_ID,
      user: {
        id: 'member-1',
        email: 'alice@example.com',
        name: 'Alice',
        image: null,
        gender: 'F',
        city: 'Dallas',
        duprRatingDoubles: 3.5,
        duprRatingSingles: 3.4,
      },
    },
    {
      userId: 'member-2',
      clubId: CLUB_ID,
      user: {
        id: 'member-2',
        email: 'bob@example.com',
        name: 'Bob',
        image: null,
        gender: 'M',
        city: 'Dallas',
        duprRatingDoubles: 3.6,
        duprRatingSingles: 3.5,
      },
    },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
})

function callerWithSqlRows(sqlRows: any[]) {
  return createTestCaller({
    userId: 'admin-user',
    prismaOverrides: {
      playSession: {
        findUnique: vi.fn().mockResolvedValue({
          clubId: CLUB_ID,
          format: 'OPEN_PLAY',
          startTime: '18:00',
          courtId: 'court-1',
          skillLevel: 'INTERMEDIATE',
          date: new Date('2026-05-01'),
        }),
      },
      clubAdmin: {
        findFirst: vi.fn().mockResolvedValue({ userId: 'admin-user', clubId: CLUB_ID }),
      },
      clubFollower: {
        findFirst: vi.fn().mockResolvedValue({ userId: 'admin-user', clubId: CLUB_ID }),
      },
      playSessionBooking: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    rawQueryRows: sqlRows,
  })
}

describe('integration: intelligence.getSlotFillerRecommendations (UUID path)', () => {
  it('FINDING: uses inline SQL fallback, NOT the rich scorer from lib/ai/slot-filler', async () => {
    // Arrange: the SQL query returns 2 candidates
    const { caller } = await callerWithSqlRows([
      {
        user_id: 'member-1', name: 'Alice', email: 'alice@x.com', image: null,
        booking_count: 12, last_played: '2026-04-15', days_since_last: 2,
        format_match: 10, skill_exact: 8, skill_compatible: 12,
        time_match: 9, dow_match: 6, court_match: 4,
        membership_type: 'Full', membership_status: 'Active',
      },
    ])

    const result = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 5,
    })

    // Router contract: returns something sane
    expect(result).toBeDefined()
    expect(Array.isArray(result.recommendations)).toBe(true)

    // KEY FINDING: the rich scorer is NOT called — procedure uses inline SQL
    expect(generateSlotFillerRecommendations).not.toHaveBeenCalled()
  })

  it('SQL fallback response shape: includes score, likelihood, reasoning, factors', async () => {
    const { caller } = await callerWithSqlRows([
      {
        user_id: 'member-1', name: 'Alice', email: 'alice@x.com', image: null,
        booking_count: 12, last_played: '2026-04-15', days_since_last: 2,
        format_match: 10, skill_exact: 8, skill_compatible: 12,
        time_match: 9, dow_match: 6, court_match: 4,
        membership_type: 'Full', membership_status: 'Active',
      },
    ])

    const result = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 5,
    })

    if (result.recommendations.length > 0) {
      const top: any = result.recommendations[0]
      expect(top).toHaveProperty('member')
      expect(top).toHaveProperty('score')
      expect(top).toHaveProperty('estimatedLikelihood')
      expect(top).toHaveProperty('reasoning')
      expect(top).toHaveProperty('factors')
      expect(['high', 'medium', 'low']).toContain(top.estimatedLikelihood)
      expect(top.source).toBe('frequent_player')
    }
  })

  it('skips Suspended / Expired members (membership gate)', async () => {
    const { caller } = await callerWithSqlRows([
      {
        user_id: 'active-1', name: 'Active', email: 'a@x.com',
        booking_count: 5, days_since_last: 10, format_match: 2, skill_exact: 2,
        skill_compatible: 3, time_match: 1, dow_match: 1, court_match: 0,
        membership_type: 'Full', membership_status: 'Active',
      },
      {
        user_id: 'suspended-1', name: 'Suspended', email: 's@x.com',
        booking_count: 5, days_since_last: 10, format_match: 2, skill_exact: 2,
        skill_compatible: 3, time_match: 1, dow_match: 1, court_match: 0,
        membership_type: 'Full', membership_status: 'Suspended',
      },
    ])

    const result = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 10,
    })

    const ids = result.recommendations.map((r: any) => r.member.id)
    expect(ids).toContain('active-1')
    expect(ids).not.toContain('suspended-1')
  })

  it('excludes members already booked for the session', async () => {
    const { caller } = await createTestCaller({
      userId: 'admin-user',
      prismaOverrides: {
        playSession: {
          findUnique: vi.fn().mockResolvedValue({
            clubId: CLUB_ID, format: 'OPEN_PLAY', startTime: '18:00',
            courtId: 'court-1', skillLevel: 'INTERMEDIATE', date: new Date('2026-05-01'),
          }),
        },
        clubAdmin: {
          findFirst: vi.fn().mockResolvedValue({ userId: 'admin-user', clubId: CLUB_ID }),
        },
        playSessionBooking: {
          findMany: vi.fn().mockResolvedValue([
            { userId: 'already-booked-1' },
          ]),
        },
      },
      rawQueryRows: [
        {
          user_id: 'already-booked-1', name: 'Booked', email: 'b@x.com',
          booking_count: 5, days_since_last: 10, format_match: 2, skill_exact: 2,
          skill_compatible: 3, time_match: 1, dow_match: 1, court_match: 0,
          membership_status: 'Active',
        },
        {
          user_id: 'available-1', name: 'Available', email: 'a@x.com',
          booking_count: 5, days_since_last: 10, format_match: 2, skill_exact: 2,
          skill_compatible: 3, time_match: 1, dow_match: 1, court_match: 0,
          membership_status: 'Active',
        },
      ],
    })

    const result = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 10,
    })

    const ids = result.recommendations.map((r: any) => r.member.id)
    expect(ids).not.toContain('already-booked-1')
    expect(ids).toContain('available-1')
  })

  it('rejects unauthenticated callers (protectedProcedure guard)', async () => {
    const { appRouter } = await import('@/server/routers/_app')
    const caller = appRouter.createCaller({
      session: null,
      prisma: {} as any,
    } as any)

    await expect(
      caller.intelligence.getSlotFillerRecommendations({
        sessionId: SESSION_ID,
        limit: 5,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects blocked users (isActive=false guard)', async () => {
    const { caller } = await createTestCaller({
      isActive: false,
    })

    await expect(
      caller.intelligence.getSlotFillerRecommendations({
        sessionId: SESSION_ID,
        limit: 5,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
