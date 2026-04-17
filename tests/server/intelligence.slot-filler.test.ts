/**
 * Integration test: intelligence.getSlotFillerRecommendations (hybrid path)
 *
 * After refactor (2026-04-17): the UUID path now uses the hybrid pipeline
 * from lib/ai/slot-filler-hybrid.ts:
 *   1. SQL pre-filter → top 100 candidates by booking-pattern score
 *   2. Batch-load rich per-candidate data (prefs, history, etc.)
 *   3. JS rich scorer (generateSlotFillerRecommendations) re-ranks to top N
 *
 * Before: inline SQL in router returned final results (different from cron,
 * no persona/DUPR/social-proof scoring).
 *
 * These tests assert the hybrid chain works end-to-end and that the rich
 * scorer IS actually called — catching future regressions if someone
 * accidentally reintroduces a simplified path.
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

function callerWithHybridFlow(opts: {
  prefilterRows: Array<{ user_id: string; booking_count: number; days_since_last: number | null }>
  users: any[]
  preferences?: any[]
  bookings?: any[]
}) {
  return createTestCaller({
    userId: 'admin-user',
    prismaOverrides: {
      // Router-level session lookup (shallow, for access check)
      playSession: {
        findUnique: vi.fn().mockResolvedValue({ clubId: CLUB_ID }),
        // Hybrid's inner session lookup (with bookings + _count)
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...makeMockSession(),
          clubCourt: { id: 'court-1', name: 'Court A' },
        }),
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

describe('integration: intelligence.getSlotFillerRecommendations (hybrid UUID path)', () => {
  it('calls SQL pre-filter AND rich scorer (hybrid pipeline)', async () => {
    const { caller, prisma } = await callerWithHybridFlow({
      prefilterRows: [
        { user_id: 'member-1', booking_count: 12, days_since_last: 2 },
        { user_id: 'member-2', booking_count: 8, days_since_last: 5 },
      ],
      users: [
        {
          id: 'member-1', email: 'alice@x.com', name: 'Alice', image: null,
          gender: 'F', city: 'Dallas', duprRatingDoubles: 3.5, duprRatingSingles: 3.4,
        },
        {
          id: 'member-2', email: 'bob@x.com', name: 'Bob', image: null,
          gender: 'M', city: 'Dallas', duprRatingDoubles: 3.6, duprRatingSingles: 3.5,
        },
      ],
    })

    const result = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 5,
    })

    // Contract
    expect(result).toBeDefined()
    expect(Array.isArray(result.recommendations)).toBe(true)

    // PRE-FILTER: $queryRawUnsafe was called once by the hybrid pipeline
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)

    // RICH SCORER: generateSlotFillerRecommendations was called
    // (was NOT called in the pre-refactor inline-SQL world)
    expect(generateSlotFillerRecommendations).toHaveBeenCalledTimes(1)
    const [scorerInput] = (generateSlotFillerRecommendations as any).mock.calls[0]
    expect(scorerInput.session.id).toBe(SESSION_ID)
    // Rich scorer only sees survivors of the pre-filter, not all club members
    expect(scorerInput.members.length).toBe(2)
    expect(scorerInput.alreadyBookedUserIds.has('booked-1')).toBe(true)
    expect(scorerInput.alreadyBookedUserIds.has('booked-2')).toBe(true)
  })

  it('returns rich scoring shape (score, reasoning, estimatedLikelihood) from real scorer', async () => {
    const { caller } = await callerWithHybridFlow({
      prefilterRows: [{ user_id: 'member-1', booking_count: 12, days_since_last: 2 }],
      users: [
        {
          id: 'member-1', email: 'alice@x.com', name: 'Alice', image: null,
          gender: 'F', city: 'Dallas', duprRatingDoubles: 3.5, duprRatingSingles: 3.4,
        },
      ],
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
    expect(generateSlotFillerRecommendations).not.toHaveBeenCalled()
  })

  it('router source tag reflects hybrid pipeline', async () => {
    const { caller } = await callerWithHybridFlow({
      prefilterRows: [{ user_id: 'member-1', booking_count: 12, days_since_last: 2 }],
      users: [
        {
          id: 'member-1', email: 'a@x.com', name: 'Alice', image: null,
          gender: 'F', city: 'Dallas', duprRatingDoubles: 3.5, duprRatingSingles: 3.4,
        },
      ],
    })

    const result: any = await caller.intelligence.getSlotFillerRecommendations({
      sessionId: SESSION_ID,
      limit: 5,
    })

    expect(result.source).toBe('hybrid_scorer')
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
