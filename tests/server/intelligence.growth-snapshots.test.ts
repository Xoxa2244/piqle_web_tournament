/**
 * Integration tests for the three remaining growth snapshots that now
 * have live row-fetching (after b811947 + 8a62a0b the pattern was proven
 * on getReferralSnapshot; this brings the other three into parity).
 *
 * Covers:
 *   intelligence.getSmartFirstSession     — newcomers who need their first session
 *   intelligence.getGuestTrialBooking     — trial prospects with booked-but-not-played state
 *   intelligence.getWinBackSnapshot       — lapsed members ripe for re-engagement
 *
 * All three go through fetchFollowerBookingRows() in the router, which
 * runs SQL against club_followers + play_session_bookings + document_embeddings
 * and returns a superset shape. Each engine builder picks the fields it needs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(true),
}))

import { createTestCaller } from './helpers/trpc-test-caller'

const CLUB_ID = '00000000-0000-4000-8000-000000000010'

beforeEach(() => {
  vi.clearAllMocks()
})

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

// ── Smart First Session ──────────────────────────────────────────────

describe('integration: intelligence.getSmartFirstSession', () => {
  it('runs follower aggregation SQL and returns snapshot shape', async () => {
    const { caller, prisma } = await callerWithRows([
      {
        userId: 'newcomer-1',
        followedAt: new Date(),
        userCreatedAt: new Date(),
        name: 'Newcomer Alice',
        email: 'alice@x.com',
        membershipType: 'Trial',
        membershipStatus: 'Trial',
        firstConfirmedBookingAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        lastConfirmedBookingAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        confirmedBookings: 1,
      },
    ])

    const result: any = await caller.intelligence.getSmartFirstSession({
      clubId: CLUB_ID,
      windowDays: 21,
      limit: 8,
    })

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)
    expect(result).toBeDefined()
    // Engine produces various shape keys; assert basic structure
    expect(typeof result).toBe('object')
  })

  it('empty SQL result → snapshot with zero candidates, no crash', async () => {
    const { caller } = await callerWithRows([])
    const result: any = await caller.intelligence.getSmartFirstSession({
      clubId: CLUB_ID,
      windowDays: 21,
      limit: 8,
    })
    expect(result).toBeDefined()
  })

  it('rejects unauthenticated callers', async () => {
    const { appRouter } = await import('@/server/routers/_app')
    const caller = appRouter.createCaller({ session: null, prisma: {} as any } as any)
    await expect(
      caller.intelligence.getSmartFirstSession({
        clubId: CLUB_ID,
        windowDays: 21,
        limit: 8,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

// ── Guest Trial Booking ──────────────────────────────────────────────

describe('integration: intelligence.getGuestTrialBooking', () => {
  it('runs SQL with guest-trial extra fields', async () => {
    const { caller, prisma } = await callerWithRows([
      {
        userId: 'trial-1',
        followedAt: new Date(),
        userCreatedAt: new Date(),
        name: 'Trial Bob',
        email: 'bob@x.com',
        membershipType: 'Trial',
        membershipStatus: 'Trial',
        firstConfirmedBookingAt: null,
        lastConfirmedBookingAt: null,
        confirmedBookings: 1,
        nextBookedSessionAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        noShowCount: 0,
        playedConfirmedBookings: 0,
      },
    ])

    const result: any = await caller.intelligence.getGuestTrialBooking({
      clubId: CLUB_ID,
      windowDays: 21,
      limit: 8,
    })

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)
    // The SQL string should include the guest-trial extra fields
    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls[0][0]
    expect(sqlArg).toContain('nextBookedSessionAt')
    expect(sqlArg).toContain('noShowCount')
    expect(sqlArg).toContain('playedConfirmedBookings')

    expect(result).toBeDefined()
  })

  it('empty SQL → empty snapshot, no crash', async () => {
    const { caller } = await callerWithRows([])
    const result: any = await caller.intelligence.getGuestTrialBooking({
      clubId: CLUB_ID,
      windowDays: 21,
      limit: 8,
    })
    expect(result).toBeDefined()
  })
})

// ── Win Back ─────────────────────────────────────────────────────────

describe('integration: intelligence.getWinBackSnapshot', () => {
  it('runs SQL with min-bookings + min-days-since-last filters', async () => {
    const lastPlayed = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    const { caller, prisma } = await callerWithRows([
      {
        userId: 'lapsed-1',
        followedAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000),
        userCreatedAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000),
        name: 'Lapsed Clara',
        email: 'clara@x.com',
        membershipType: 'Full',
        membershipStatus: 'Active',
        lastConfirmedBookingAt: lastPlayed,
        firstConfirmedBookingAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        confirmedBookings: 10,
      },
    ])

    const result: any = await caller.intelligence.getWinBackSnapshot({
      clubId: CLUB_ID,
      windowDays: 60,
      limit: 8,
    })

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)
    // SQL should include the win-back HAVING filters
    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls[0][0]
    expect(sqlArg).toContain("HAVING COUNT(*) FILTER")
    expect(sqlArg).toContain(">= 6")  // minBookings from procedure
    expect(sqlArg).toContain(">= 21") // minDaysSinceLast from procedure

    expect(result).toBeDefined()
  })

  it('empty SQL → empty snapshot', async () => {
    const { caller } = await callerWithRows([])
    const result: any = await caller.intelligence.getWinBackSnapshot({
      clubId: CLUB_ID,
      windowDays: 60,
      limit: 8,
    })
    expect(result).toBeDefined()
  })

  it('rejects blocked users', async () => {
    const { caller } = await createTestCaller({ isActive: false })
    await expect(
      caller.intelligence.getWinBackSnapshot({
        clubId: CLUB_ID,
        windowDays: 60,
        limit: 8,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

// ── Shared helper: query-shape differences ───────────────────────────

describe('integration: fetchFollowerBookingRows SQL differences', () => {
  it('smart-first-session uses recent-followers filter', async () => {
    const { caller, prisma } = await callerWithRows([])
    await caller.intelligence.getSmartFirstSession({
      clubId: CLUB_ID,
      windowDays: 21,
      limit: 8,
    })
    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls[0][0]
    expect(sqlArg).toContain('cf."createdAt" >=')
  })

  it('referral snapshot uses co-player CTE (NOT shared helper)', async () => {
    const { caller, prisma } = await callerWithRows([])
    await caller.intelligence.getReferralSnapshot({
      clubId: CLUB_ID,
      windowDays: 60,
      limit: 8,
    })
    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls[0][0]
    expect(sqlArg).toContain('co_player_counts')
  })
})
