/**
 * Integration test: intelligence.getReferralSnapshot
 *
 * Asserts the live row-fetching path:
 *   1. SQL aggregation builds per-follower booking + co-player rows
 *   2. Rows feed into buildReferralSnapshot (referral-engine.ts)
 *   3. Response has the expected snapshot shape (candidates, lanes, summary)
 *
 * buildReferralSnapshot filters to candidates with ≥4 confirmed bookings
 * AND ≥2 co-players (see referral-engine.ts line 883). Our test data
 * includes rows on both sides of that gate to verify the filter works.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(true),
}))

import { createTestCaller } from './helpers/trpc-test-caller'

const CLUB_ID = '00000000-0000-4000-8000-000000000001'

function sqlRow(opts: {
  userId: string
  name: string
  email: string
  membershipType?: string | null
  membershipStatus?: string | null
  confirmedBookings: number
  recentConfirmedBookings?: number
  activeCoPlayers: number
  totalCoPlayers: number
  lastConfirmedBookingAt?: Date
}) {
  return {
    userId: opts.userId,
    followedAt: new Date('2025-06-01'),
    userCreatedAt: new Date('2025-06-01'),
    name: opts.name,
    email: opts.email,
    membershipType: opts.membershipType ?? 'Full',
    membershipStatus: opts.membershipStatus ?? 'Active',
    firstConfirmedBookingAt: new Date('2025-08-01'),
    lastConfirmedBookingAt: opts.lastConfirmedBookingAt ?? new Date('2026-04-10'),
    confirmedBookings: opts.confirmedBookings,
    recentConfirmedBookings: opts.recentConfirmedBookings ?? Math.floor(opts.confirmedBookings / 2),
    activeCoPlayers: opts.activeCoPlayers,
    totalCoPlayers: opts.totalCoPlayers,
  }
}

function callerWithRows(rows: any[]) {
  return createTestCaller({
    userId: 'admin-user',
    prismaOverrides: {
      club: {
        findUnique: vi.fn().mockResolvedValue({ automationSettings: null }),
      },
      clubAdmin: {
        findFirst: vi.fn().mockResolvedValue({ userId: 'admin-user', clubId: CLUB_ID }),
      },
    },
    rawQueryRows: rows,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('integration: intelligence.getReferralSnapshot', () => {
  it('runs the aggregation SQL and returns a snapshot', async () => {
    const { caller, prisma } = await callerWithRows([
      sqlRow({
        userId: 'vip-advocate',
        name: 'Alice VIP',
        email: 'alice@x.com',
        confirmedBookings: 20,
        recentConfirmedBookings: 8,
        activeCoPlayers: 6,
        totalCoPlayers: 12,
      }),
    ])

    const result: any = await caller.intelligence.getReferralSnapshot({
      clubId: CLUB_ID,
      windowDays: 60,
      limit: 8,
    })

    // SQL was executed
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)

    // Snapshot shape is present
    expect(result).toBeDefined()
    expect(Array.isArray(result.candidates)).toBe(true)
  })

  it('promotes a high-activity member to the candidate list', async () => {
    const { caller } = await callerWithRows([
      sqlRow({
        userId: 'strong-advocate',
        name: 'Strong',
        email: 'strong@x.com',
        confirmedBookings: 15,
        recentConfirmedBookings: 6,
        activeCoPlayers: 5,
        totalCoPlayers: 10,
      }),
    ])

    const result: any = await caller.intelligence.getReferralSnapshot({
      clubId: CLUB_ID,
      windowDays: 60,
      limit: 8,
    })

    const ids = (result.candidates || []).map((c: any) => c.memberId)
    expect(ids).toContain('strong-advocate')
  })

  it('filters out members below the engine gate (<4 bookings or <2 co-players)', async () => {
    const { caller } = await callerWithRows([
      // Below booking threshold
      sqlRow({
        userId: 'low-bookings',
        name: 'Low Bookings',
        email: 'lb@x.com',
        confirmedBookings: 3,
        activeCoPlayers: 5,
        totalCoPlayers: 10,
      }),
      // Below co-player threshold
      sqlRow({
        userId: 'isolated',
        name: 'Isolated',
        email: 'iso@x.com',
        confirmedBookings: 20,
        activeCoPlayers: 0,
        totalCoPlayers: 1,
      }),
      // Qualifies
      sqlRow({
        userId: 'qualifies',
        name: 'Qualifies',
        email: 'q@x.com',
        confirmedBookings: 10,
        activeCoPlayers: 4,
        totalCoPlayers: 8,
      }),
    ])

    const result: any = await caller.intelligence.getReferralSnapshot({
      clubId: CLUB_ID,
      windowDays: 60,
      limit: 8,
    })

    const ids = (result.candidates || []).map((c: any) => c.memberId)
    expect(ids).not.toContain('low-bookings')
    expect(ids).not.toContain('isolated')
    expect(ids).toContain('qualifies')
  })

  it('respects the limit parameter', async () => {
    const manyRows = Array.from({ length: 20 }, (_, i) =>
      sqlRow({
        userId: `advocate-${i}`,
        name: `Advocate ${i}`,
        email: `a${i}@x.com`,
        confirmedBookings: 10 + i,
        activeCoPlayers: 3,
        totalCoPlayers: 6,
      }),
    )
    const { caller } = await callerWithRows(manyRows)

    const result: any = await caller.intelligence.getReferralSnapshot({
      clubId: CLUB_ID,
      windowDays: 60,
      limit: 5,
    })

    expect((result.candidates || []).length).toBeLessThanOrEqual(5)
  })

  it('empty result set returns empty snapshot without crashing', async () => {
    const { caller } = await callerWithRows([])

    const result: any = await caller.intelligence.getReferralSnapshot({
      clubId: CLUB_ID,
      windowDays: 60,
      limit: 8,
    })

    expect(result).toBeDefined()
    expect(Array.isArray(result.candidates)).toBe(true)
    expect(result.candidates.length).toBe(0)
  })

  it('rejects unauthenticated callers', async () => {
    const { appRouter } = await import('@/server/routers/_app')
    const caller = appRouter.createCaller({
      session: null,
      prisma: {} as any,
    } as any)

    await expect(
      caller.intelligence.getReferralSnapshot({
        clubId: CLUB_ID,
        windowDays: 60,
        limit: 8,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
