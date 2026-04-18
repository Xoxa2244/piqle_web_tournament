/**
 * Integration test: intelligence.getSlotFillerRecommendations (hybrid path)
 *
 * After the b811947 refactor, the UUID path uses the hybrid pipeline in
 * lib/ai/slot-filler-hybrid.ts:
 *   1. SQL pre-filter returns top ~100 candidates (fast booking-pattern match)
 *   2. Batch-load rich per-candidate data for the survivors
 *   3. generateSlotFillerRecommendations re-ranks with 6-factor scoring +
 *      persona + DUPR + social proof
 *   4. Router wraps in a try/catch that falls back to the inline SQL path
 *      on any hybrid failure (safety net during rollout)
 *
 * These tests assert the hybrid chain is actually invoked end-to-end.
 * If someone reverts to the inline-SQL-only path, these tests fail and
 * force a deliberate discussion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock subscription gate — always allow
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(true),
}))

// Spy on the rich scorer — we want to ASSERT IT IS CALLED from this path.
// Use importActual so the real scoring runs; the spy just lets us assert.
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

function makeMockUsers() {
  return [
    {
      id: 'member-1', email: 'alice@x.com', name: 'Alice', image: null,
      gender: 'F', city: 'Dallas', duprRatingDoubles: 3.5, duprRatingSingles: 3.4,
    },
    {
      id: 'member-2', email: 'bob@x.com', name: 'Bob', image: null,
      gender: 'M', city: 'Dallas', duprRatingDoubles: 3.6, duprRatingSingles: 3.5,
    },
  ]
}

/**
 * Build a caller that satisfies the hybrid pipeline's needs:
 *   - Shallow session lookup (router pre-access-check)
 *   - Rich session lookup (hybrid's findUniqueOrThrow)
 *   - Club admin check passes
 *   - SQL pre-filter returns the provided candidates
 *   - Rich data fetch returns the provided users
 */
function callerWithHybridFlow(opts: {
  prefilterRows: Array<{ user_id: string; booking_count: number; days_since_last: number | null }>
  users: any[]
  preferences?: any[]
  bookings?: any[]
}) {
  return createTestCaller({
    userId: 'admin-user',
    prismaOverrides: {
      // Router-level shallow session lookup (before access check)
      playSession: {
        findUnique: vi.fn().mockResolvedValue({ clubId: CLUB_ID }),
        // Hybrid's rich session lookup (with bookings + _count + clubCourt)
        findUniqueOrThrow: vi.fn().mockResolvedValue(makeMockSession()),
      },
      clubAdmin: {
        findFirst: vi.fn().mockResolvedValue({ userId: 'admin-user', clubId: CLUB_ID }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ isActive: true }),
        findMany: vi.fn().mockResolvedValue(opts.users),
      },
      userPlayPreference: {
        findMany: vi.fn().mockResolvedValue(opts.preferences || []),
      },
      playSessionBooking: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue(opts.bookings || []),
      },
      aIRecommendationLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      },
    },
    rawQueryRows: opts.prefilterRows,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('integration: intelligence.getSlotFillerRecommendations (hybrid UUID path)', () => {
  it('calls SQL pre-filter AND rich scorer (hybrid pipeline wired end-to-end)', async () => {
    const { caller, prisma } = await callerWithHybridFlow({
      prefilterRows: [
        { user_id: 'member-1', booking_count: 12, days_since_last: 2 },
        { user_id: 'member-2', booking_count: 8, days_since_last: 5 },
      ],
      users: makeMockUsers(),
    })

    const result = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 5,
    })

    // Contract — shape that UI depends on
    expect(result).toBeDefined()
    expect(Array.isArray(result.recommendations)).toBe(true)

    // PRE-FILTER ran once via $queryRawUnsafe
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)

    // RICH SCORER was invoked — this is the gap that b811947 closed
    expect(generateSlotFillerRecommendations).toHaveBeenCalledTimes(1)
    const [scorerInput] = (generateSlotFillerRecommendations as any).mock.calls[0]
    expect(scorerInput.session.id).toBe(SESSION_ID)
    // Only survivors of pre-filter go to the scorer
    expect(scorerInput.members.length).toBe(2)
    expect(scorerInput.alreadyBookedUserIds.has('booked-1')).toBe(true)
    expect(scorerInput.alreadyBookedUserIds.has('booked-2')).toBe(true)
  })

  it('router response has source=hybrid_scorer (proof the new path is live)', async () => {
    const { caller } = await callerWithHybridFlow({
      prefilterRows: [
        { user_id: 'member-1', booking_count: 10, days_since_last: 3 },
      ],
      users: [makeMockUsers()[0]],
    })

    const result: any = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 5,
    })

    expect(result.source).toBe('hybrid_scorer')
    expect(Array.isArray(result.aiEnhancements)).toBe(true)
  })

  it('returns rich scoring shape (score, reasoning, estimatedLikelihood)', async () => {
    const { caller } = await callerWithHybridFlow({
      prefilterRows: [
        { user_id: 'member-1', booking_count: 12, days_since_last: 2 },
      ],
      users: [makeMockUsers()[0]],
    })

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
      expect(['high', 'medium', 'low']).toContain(top.estimatedLikelihood)
      expect(typeof top.score).toBe('number')
      expect(top.score).toBeGreaterThanOrEqual(0)
      expect(top.score).toBeLessThanOrEqual(100)
    }
  })

  it('empty pre-filter → empty recommendations, rich scorer NOT invoked', async () => {
    const { caller } = await callerWithHybridFlow({
      prefilterRows: [],
      users: [],
    })

    const result = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 5,
    })

    expect(result.recommendations).toEqual([])
    // No candidates → scorer doesn't need to run
    expect(generateSlotFillerRecommendations).not.toHaveBeenCalled()
  })

  it('hybrid failure falls back to inline SQL path (safety net)', async () => {
    // Force hybrid path to throw by making findUniqueOrThrow reject
    const { caller } = await createTestCaller({
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
          // Hybrid tries findUniqueOrThrow → we throw → router catches → SQL fallback
          findUniqueOrThrow: vi.fn().mockRejectedValue(new Error('hybrid blew up')),
        },
        clubAdmin: {
          findFirst: vi.fn().mockResolvedValue({ userId: 'admin-user', clubId: CLUB_ID }),
        },
        playSessionBooking: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      rawQueryRows: [
        {
          user_id: 'member-1', name: 'Alice', email: 'a@x.com', image: null,
          booking_count: 5, days_since_last: 10, format_match: 2, skill_exact: 2,
          skill_compatible: 3, time_match: 1, dow_match: 1, court_match: 0,
          membership_type: 'Full', membership_status: 'Active',
        },
      ],
    })

    const result: any = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 5,
    })

    // Fallback response is shaped with source='frequent_players' (the old path)
    expect(result.source).toBe('frequent_players')
    // And the rich scorer never ran (fallback uses inline SQL)
    expect(generateSlotFillerRecommendations).not.toHaveBeenCalled()
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
