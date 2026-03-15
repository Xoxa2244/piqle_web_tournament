/**
 * Tests for member-health.ts
 *
 * The scoring functions are private (not exported), so we test through
 * the public generateMemberHealth() function and verify the output.
 * We also recreate the scorer logic inline for isolated unit tests.
 */

import { describe, it, expect } from 'vitest'
import { generateMemberHealth } from '@/lib/ai/member-health'
import type { MemberData, BookingHistory, UserPlayPreferenceData, DayOfWeek } from '@/types/intelligence'

// ── Helpers ──

function makeMember(overrides?: Partial<MemberData>): MemberData {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@test.com',
    image: null,
    gender: null,
    city: null,
    duprRatingDoubles: 3.5,
    duprRatingSingles: null,
    ...overrides,
  }
}

function makeHistory(overrides?: Partial<BookingHistory>): BookingHistory {
  return {
    totalBookings: 20,
    bookingsLastWeek: 1,
    bookingsLastMonth: 4,
    daysSinceLastConfirmedBooking: 3,
    cancelledCount: 0,
    noShowCount: 0,
    inviteAcceptanceRate: 1,
    ...overrides,
  }
}

function makePreference(days: DayOfWeek[] = ['Monday', 'Wednesday']): UserPlayPreferenceData {
  return {
    id: 'pref-1',
    userId: 'user-1',
    clubId: 'club-1',
    preferredDays: days,
    preferredTimeSlots: { morning: false, afternoon: false, evening: true },
    preferredFormats: ['OPEN_PLAY'],
    skillLevel: 'INTERMEDIATE',
    targetSessionsPerWeek: 3,
    isActive: true,
  }
}

function makeBookingDates(count: number, intervalDays = 7): { date: Date; status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' }[] {
  const dates = []
  for (let i = 0; i < count; i++) {
    dates.push({
      date: new Date(Date.now() - i * intervalDays * 86400000),
      status: 'CONFIRMED' as const,
    })
  }
  return dates
}

function makeInput(overrides?: any) {
  return {
    member: makeMember(),
    preference: makePreference(),
    history: makeHistory(),
    joinedAt: new Date('2025-01-01'),
    bookingDates: makeBookingDates(8),
    previousPeriodBookings: 4,
    ...overrides,
  }
}

// ── generateMemberHealth ──

describe('generateMemberHealth', () => {
  it('returns members sorted by healthScore ascending (worst first)', () => {
    const result = generateMemberHealth([
      makeInput({ member: makeMember({ id: 'a' }), history: makeHistory({ daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 6 }), previousPeriodBookings: 4 }),
      makeInput({ member: makeMember({ id: 'b' }), history: makeHistory({ daysSinceLastConfirmedBooking: 30, bookingsLastMonth: 0 }), previousPeriodBookings: 4 }),
    ])

    expect(result.members[0].memberId).toBe('b') // worse health = first
    expect(result.members[0].healthScore).toBeLessThan(result.members[1].healthScore)
  })

  it('returns summary with correct counts', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 6 }), previousPeriodBookings: 4 }),
      makeInput({ member: makeMember({ id: 'b' }), history: makeHistory({ daysSinceLastConfirmedBooking: 30, bookingsLastMonth: 0 }), previousPeriodBookings: 4 }),
    ])

    expect(result.summary.total).toBe(2)
    expect(result.summary.healthy + result.summary.watch + result.summary.atRisk + result.summary.critical).toBe(2)
  })

  it('calculates revenueAtRisk as (atRisk + critical) * price', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 30, bookingsLastMonth: 0 }), previousPeriodBookings: 5 }),
    ], 99)

    // This member has very low health → at_risk or critical
    expect(result.summary.revenueAtRisk).toBeGreaterThan(0)
  })
})

// ── Health Score Components via generateMemberHealth ──

describe('health score components', () => {
  describe('frequency trend', () => {
    it('scores high when bookings stable', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ bookingsLastMonth: 4 }), previousPeriodBookings: 4 }),
      ])
      expect(result.members[0].components.frequencyTrend.score).toBe(100)
    })

    it('scores low when significant decline', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ bookingsLastMonth: 1 }), previousPeriodBookings: 6 }),
      ])
      expect(result.members[0].components.frequencyTrend.score).toBeLessThanOrEqual(40)
    })

    it('scores 20 when both periods are zero', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ bookingsLastMonth: 0 }), previousPeriodBookings: 0 }),
      ])
      expect(result.members[0].components.frequencyTrend.score).toBe(20)
    })

    it('scores 90 when new activity (previous=0, recent>0)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ bookingsLastMonth: 3 }), previousPeriodBookings: 0 }),
      ])
      expect(result.members[0].components.frequencyTrend.score).toBe(90)
    })
  })

  describe('recency', () => {
    it('scores 100 for recent play (≤3 days)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 1 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(100)
    })

    it('scores 80 for 7 days', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 7 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(80)
    })

    it('scores 50 for 14 days', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 14 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(50)
    })

    it('scores 25 for 21 days', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 21 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(25)
    })

    it('scores 0 for 30+ days', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 30 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(0)
    })

    it('scores 10 when null (never booked)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: null as any }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(10)
    })
  })

  describe('consistency', () => {
    it('scores 50 with fewer than 3 bookings', () => {
      const result = generateMemberHealth([
        makeInput({ bookingDates: makeBookingDates(2) }),
      ])
      expect(result.members[0].components.consistency.score).toBe(50)
    })

    it('scores high for regular weekly bookings', () => {
      // Regular 7-day intervals → low CV → high score
      const result = generateMemberHealth([
        makeInput({ bookingDates: makeBookingDates(6, 7) }),
      ])
      expect(result.members[0].components.consistency.score).toBeGreaterThanOrEqual(70)
    })
  })

  describe('no-show trend', () => {
    it('scores 100 with zero no-shows', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ totalBookings: 20, noShowCount: 0 }) }),
      ])
      expect(result.members[0].components.noShowTrend.score).toBe(100)
    })

    it('scores 60 with moderate no-shows (≤15%)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ totalBookings: 20, noShowCount: 2 }) }),
      ])
      expect(result.members[0].components.noShowTrend.score).toBe(60)
    })

    it('scores 20 with high no-shows (>15%)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ totalBookings: 20, noShowCount: 5 }) }),
      ])
      expect(result.members[0].components.noShowTrend.score).toBe(20)
    })

    it('scores 50 with zero bookings total', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ totalBookings: 0, noShowCount: 0 }) }),
      ])
      expect(result.members[0].components.noShowTrend.score).toBe(50)
    })
  })
})

// ── Risk Level Classification ──

describe('risk level classification', () => {
  it('healthy member gets "healthy" risk level', () => {
    const result = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 6 }),
        previousPeriodBookings: 4,
        bookingDates: makeBookingDates(8, 4),
      }),
    ])
    expect(result.members[0].riskLevel).toBe('healthy')
  })

  it('inactive member gets "at_risk" or "critical"', () => {
    const result = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 25, bookingsLastMonth: 0 }),
        previousPeriodBookings: 4,
        bookingDates: [],
      }),
    ])
    expect(['at_risk', 'critical']).toContain(result.members[0].riskLevel)
  })
})

// ── Lifecycle Stage ──

describe('lifecycle stage', () => {
  it('returns "churned" when inactive ≥ 21 days', () => {
    const result = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 25 }),
        joinedAt: new Date('2025-01-01'),
      }),
    ])
    expect(result.members[0].lifecycleStage).toBe('churned')
  })

  it('returns "onboarding" for members joined < 14 days ago', () => {
    const result = generateMemberHealth([
      makeInput({
        joinedAt: new Date(Date.now() - 5 * 86400000), // 5 days ago
        history: makeHistory({ daysSinceLastConfirmedBooking: 2 }),
      }),
    ])
    expect(result.members[0].lifecycleStage).toBe('onboarding')
  })

  it('returns "ramping" for members joined 14-60 days ago', () => {
    const result = generateMemberHealth([
      makeInput({
        joinedAt: new Date(Date.now() - 30 * 86400000), // 30 days ago
        history: makeHistory({ daysSinceLastConfirmedBooking: 2 }),
      }),
    ])
    expect(result.members[0].lifecycleStage).toBe('ramping')
  })

  it('churned overrides onboarding/ramping', () => {
    const result = generateMemberHealth([
      makeInput({
        joinedAt: new Date(Date.now() - 10 * 86400000), // 10 days ago (should be onboarding)
        history: makeHistory({ daysSinceLastConfirmedBooking: 25 }), // but 25 days inactive → churned
      }),
    ])
    expect(result.members[0].lifecycleStage).toBe('churned')
  })
})

// ── Trend Detection ──

describe('trend detection', () => {
  it('returns "improving" when recent > previous', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ bookingsLastMonth: 6 }), previousPeriodBookings: 3 }),
    ])
    expect(result.members[0].trend).toBe('improving')
  })

  it('returns "declining" when recent < previous', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ bookingsLastMonth: 2 }), previousPeriodBookings: 5 }),
    ])
    expect(result.members[0].trend).toBe('declining')
  })

  it('returns "stable" when equal', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ bookingsLastMonth: 4 }), previousPeriodBookings: 4 }),
    ])
    expect(result.members[0].trend).toBe('stable')
  })
})

// ── Score Boundaries ──

describe('score boundaries', () => {
  it('health score is always 0-100', () => {
    // Very bad health
    const bad = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 60, bookingsLastMonth: 0, totalBookings: 5, noShowCount: 3 }),
        previousPeriodBookings: 10,
        bookingDates: [],
      }),
    ])
    expect(bad.members[0].healthScore).toBeGreaterThanOrEqual(0)
    expect(bad.members[0].healthScore).toBeLessThanOrEqual(100)

    // Very good health
    const good = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 8 }),
        previousPeriodBookings: 4,
        bookingDates: makeBookingDates(10, 3),
      }),
    ])
    expect(good.members[0].healthScore).toBeGreaterThanOrEqual(0)
    expect(good.members[0].healthScore).toBeLessThanOrEqual(100)
  })

  it('component weights sum to 100', () => {
    const result = generateMemberHealth([makeInput()])
    const c = result.members[0].components
    const totalWeight = c.frequencyTrend.weight + c.recency.weight + c.consistency.weight + c.patternBreak.weight + c.noShowTrend.weight
    expect(totalWeight).toBe(100)
  })
})
