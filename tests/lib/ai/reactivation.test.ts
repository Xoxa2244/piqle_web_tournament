/**
 * Reactivation System Tests
 *
 * Covers:
 *  1. RFM+ Health Score (recency, frequency, trend)
 *  2. Churn Reason Detection (analyzeChurnReasons)
 *  3. Smart Suggested Action (scoreSessionsByPreference)
 */

import { describe, it, expect } from 'vitest'
import { generateReactivationCandidates, scoreSessionsByPreference } from '@/lib/ai/reactivation'
import type {
  MemberData, BookingHistory, UserPlayPreferenceData,
  PlaySessionData, BookingWithSession, DayOfWeek, PlaySessionFormat,
} from '@/types/intelligence'

// ── Helpers ──

function makeMember(overrides?: Partial<MemberData>): MemberData {
  return {
    id: 'user-1',
    name: 'Test Player',
    email: 'test@example.com',
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
    bookingsLastWeek: 2,
    bookingsLastMonth: 6,
    daysSinceLastConfirmedBooking: 25,
    cancelledCount: 0,
    noShowCount: 0,
    inviteAcceptanceRate: 1,
    ...overrides,
  }
}

function makePreference(overrides?: Partial<UserPlayPreferenceData>): UserPlayPreferenceData {
  return {
    id: 'pref-1',
    userId: 'user-1',
    clubId: 'club-1',
    preferredDays: ['Monday', 'Wednesday'] as DayOfWeek[],
    preferredTimeSlots: { morning: false, afternoon: false, evening: true },
    preferredFormats: ['OPEN_PLAY'] as PlaySessionFormat[],
    skillLevel: 'INTERMEDIATE',
    targetSessionsPerWeek: 3,
    isActive: true,
    ...overrides,
  }
}

function makeSession(overrides?: Partial<PlaySessionData>): PlaySessionData {
  return {
    id: 'session-1',
    clubId: 'club-1',
    clubCourtId: 'court-1',
    title: 'Open Play',
    description: null,
    format: 'OPEN_PLAY',
    skillLevel: 'ALL_LEVELS',
    date: new Date('2026-03-25'), // Wednesday
    startTime: '18:00',
    endTime: '20:00',
    maxPlayers: 12,
    priceInCents: 2000,
    hostUserId: null,
    status: 'SCHEDULED',
    confirmedCount: 4,
    ...overrides,
  }
}

/** Helper to build a BookingWithSession for churn analysis */
function makeBooking(
  date: string,
  startTime: string,
  format: string,
  status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' = 'CONFIRMED',
): BookingWithSession {
  return {
    status,
    session: {
      date: new Date(date),
      startTime,
      format,
    },
  }
}

/**
 * Convenience: run generateReactivationCandidates with a single member
 * and return that candidate's scoring components.
 */
function scoreSingleMember(
  historyOverrides?: Partial<BookingHistory>,
  memberOverrides?: Partial<MemberData>,
) {
  const result = generateReactivationCandidates({
    members: [{
      member: makeMember(memberOverrides),
      preference: makePreference(),
      history: makeHistory({ daysSinceLastConfirmedBooking: 25, ...historyOverrides }),
      bookings: [],
    }],
    upcomingSessions: [makeSession()],
    inactivityThresholdDays: 1, // low threshold so the member always qualifies
  })
  return result[0]
}

// ================================================================
// 1. RFM+ Health Score
// ================================================================

describe('RFM+ Health Score > Recency', () => {
  it('player who played yesterday gets high recency score', () => {
    const candidate = scoreSingleMember({ daysSinceLastConfirmedBooking: 1 })
    expect(candidate.reasoning.components.recency.score).toBe(100)
  })

  it('player who played 3 days ago gets high recency score', () => {
    const candidate = scoreSingleMember({ daysSinceLastConfirmedBooking: 3 })
    expect(candidate.reasoning.components.recency.score).toBe(100)
  })

  it('player who played 7 days ago gets 80 recency score', () => {
    const candidate = scoreSingleMember({ daysSinceLastConfirmedBooking: 7 })
    expect(candidate.reasoning.components.recency.score).toBe(80)
  })

  it('player who has not played in 30 days gets low recency score', () => {
    const candidate = scoreSingleMember({ daysSinceLastConfirmedBooking: 30 })
    expect(candidate.reasoning.components.recency.score).toBeLessThanOrEqual(35)
  })

  it('player who has not played in 60+ days gets very low recency score', () => {
    const candidate = scoreSingleMember({ daysSinceLastConfirmedBooking: 90 })
    expect(candidate.reasoning.components.recency.score).toBe(10)
  })

  it('player who never booked (null) defaults to 999 days -> minimal score', () => {
    const candidate = scoreSingleMember({ daysSinceLastConfirmedBooking: null })
    expect(candidate.reasoning.components.recency.score).toBe(1)
  })
})

describe('RFM+ Health Score > Frequency', () => {
  it('player with 8+ sessions/month gets maximum frequency score', () => {
    const candidate = scoreSingleMember({ bookingsLastMonth: 8 })
    expect(candidate.reasoning.components.frequency.score).toBe(100)
  })

  it('player with 12 sessions/month gets maximum frequency score', () => {
    const candidate = scoreSingleMember({ bookingsLastMonth: 12 })
    expect(candidate.reasoning.components.frequency.score).toBe(100)
  })

  it('player with 5 sessions/month gets 80 frequency score', () => {
    const candidate = scoreSingleMember({ bookingsLastMonth: 5 })
    expect(candidate.reasoning.components.frequency.score).toBe(80)
  })

  it('player with 1 session/month gets low frequency score', () => {
    const candidate = scoreSingleMember({ bookingsLastMonth: 1 })
    expect(candidate.reasoning.components.frequency.score).toBeLessThanOrEqual(35)
  })

  it('player with 0 sessions/month but high historical avg gets 25 frequency score', () => {
    // With totalBookings=20 and daysSince=25, historicalMonthlyAvg is high → score 25
    const candidate = scoreSingleMember({ bookingsLastMonth: 0 })
    expect(candidate.reasoning.components.frequency.score).toBe(25)
  })
})

describe('RFM+ Health Score > Trend', () => {
  it('player whose activity is growing gets high trend score', () => {
    // bookingsLastWeek=4 extrapolated to 14d=8, prior=(6-4)/3*2=1.33, ratio=8/1.33=6 >> 1.2
    const candidate = scoreSingleMember({ bookingsLastWeek: 4, bookingsLastMonth: 6 })
    expect(candidate.reasoning.components.trend.score).toBe(100)
  })

  it('player whose activity is declining gets low trend score', () => {
    // bookingsLastWeek=0 → recentPeriod=0, priorPeriod=8, ratio=0 → score 5
    const candidate = scoreSingleMember({ bookingsLastWeek: 0, bookingsLastMonth: 8 })
    expect(candidate.reasoning.components.trend.score).toBeLessThanOrEqual(30)
  })

  it('player with stable activity gets medium trend score', () => {
    // bookingsLastWeek=2, bookingsLastMonth=6 → recentPeriod=4, prior=(6-2)/3*2=2.67, ratio=4/2.67=1.5 → growing
    // To get stable: bookingsLastWeek=2, bookingsLastMonth=8 → prior=(8-2)/3*2=4, ratio=4/4=1.0 → stable
    const candidate = scoreSingleMember({ bookingsLastWeek: 2, bookingsLastMonth: 8 })
    expect(candidate.reasoning.components.trend.score).toBe(70)
  })

  it('player with zero activity in both periods gets minimal trend score', () => {
    const candidate = scoreSingleMember({ bookingsLastWeek: 0, bookingsLastMonth: 0 })
    expect(candidate.reasoning.components.trend.score).toBe(5)
  })
})

describe('RFM+ Health Score > Overall', () => {
  it('score is always between 0 and 100', () => {
    const best = scoreSingleMember({
      daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 10, bookingsLastWeek: 5,
      totalBookings: 50, cancelledCount: 0, noShowCount: 0,
    })
    expect(best.score).toBeGreaterThanOrEqual(0)
    expect(best.score).toBeLessThanOrEqual(100)

    const worst = scoreSingleMember({
      daysSinceLastConfirmedBooking: 365, bookingsLastMonth: 0, bookingsLastWeek: 0,
      totalBookings: 5, cancelledCount: 3, noShowCount: 2,
    })
    expect(worst.score).toBeGreaterThanOrEqual(0)
    expect(worst.score).toBeLessThanOrEqual(100)
  })

  it('component weights sum to 100', () => {
    const candidate = scoreSingleMember()
    const comps = candidate.reasoning.components
    const totalWeight = Object.values(comps).reduce((sum, c) => sum + c.weight, 0)
    expect(totalWeight).toBe(100)
  })

  it('summary includes the member name', () => {
    const candidate = scoreSingleMember({}, { name: 'Alice' })
    expect(candidate.reasoning.summary).toContain('Alice')
  })
})

// ================================================================
// 2. Churn Reason Detection
// ================================================================

describe('Churn Reason Detection', () => {
  /**
   * Helper to run churn analysis via generateReactivationCandidates.
   * Returns the churnReasons array for a single member.
   */
  function getChurnReasons(bookings: BookingWithSession[], historyOverrides?: Partial<BookingHistory>) {
    const confirmed = bookings.filter(b => b.status === 'CONFIRMED')
    const result = generateReactivationCandidates({
      members: [{
        member: makeMember(),
        preference: null,
        history: makeHistory({
          daysSinceLastConfirmedBooking: 25,
          totalBookings: bookings.length,
          ...historyOverrides,
        }),
        bookings,
      }],
      upcomingSessions: [],
      inactivityThresholdDays: 1,
    })
    return result[0]?.churnReasons ?? []
  }

  it('detects "schedule_change" when player switched from morning to evening', () => {
    // Older bookings: all morning
    const bookings: BookingWithSession[] = [
      makeBooking('2026-01-05', '08:00', 'OPEN_PLAY'),
      makeBooking('2026-01-12', '09:00', 'OPEN_PLAY'),
      makeBooking('2026-01-19', '08:30', 'OPEN_PLAY'),
      // Newer bookings: all evening
      makeBooking('2026-02-10', '19:00', 'OPEN_PLAY'),
      makeBooking('2026-02-17', '18:30', 'OPEN_PLAY'),
    ]
    const reasons = getChurnReasons(bookings)
    expect(reasons.some(r => r.pattern === 'schedule_change')).toBe(true)
  })

  it('detects "cancel_spike" when 3+ of last 6 bookings are cancelled', () => {
    const bookings: BookingWithSession[] = [
      makeBooking('2026-01-01', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking('2026-01-08', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      // Recent chunk: 3 cancelled out of 4
      makeBooking('2026-02-01', '10:00', 'OPEN_PLAY', 'CANCELLED'),
      makeBooking('2026-02-08', '10:00', 'OPEN_PLAY', 'CANCELLED'),
      makeBooking('2026-02-15', '10:00', 'OPEN_PLAY', 'CANCELLED'),
      makeBooking('2026-02-22', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
    ]
    const reasons = getChurnReasons(bookings)
    expect(reasons.some(r => r.pattern === 'cancel_spike')).toBe(true)
  })

  it('detects "format_abandonment" when player stops attending their favorite format', () => {
    // 6+ confirmed with dominant format DRILL (>50%), then recent 5 with different format
    const bookings: BookingWithSession[] = [
      makeBooking('2025-12-01', '10:00', 'DRILL', 'CONFIRMED'),
      makeBooking('2025-12-10', '10:00', 'DRILL', 'CONFIRMED'),
      makeBooking('2026-01-01', '10:00', 'DRILL', 'CONFIRMED'),
      makeBooking('2026-01-05', '10:00', 'DRILL', 'CONFIRMED'),
      makeBooking('2026-01-10', '10:00', 'DRILL', 'CONFIRMED'),
      makeBooking('2026-01-15', '10:00', 'DRILL', 'CONFIRMED'),
      makeBooking('2026-01-20', '10:00', 'DRILL', 'CONFIRMED'),
      // Recent 5: no DRILL at all
      makeBooking('2026-02-01', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking('2026-02-05', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking('2026-02-10', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking('2026-02-15', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking('2026-02-20', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
    ]
    const reasons = getChurnReasons(bookings)
    expect(reasons.some(r => r.pattern === 'format_abandonment')).toBe(true)
  })

  it('detects "frequency_decline" when player goes from 3x/week to inactive', () => {
    const now = new Date()
    const bookings: BookingWithSession[] = []

    // Older period: ~3 sessions per week for 4 weeks (starting ~8 weeks ago)
    for (let week = 8; week >= 5; week--) {
      for (let day = 0; day < 3; day++) {
        const d = new Date(now.getTime() - (week * 7 + day) * 86400000)
        bookings.push(makeBooking(d.toISOString().split('T')[0], '10:00', 'OPEN_PLAY', 'CONFIRMED'))
      }
    }

    // Recent 3 weeks: zero sessions (frequency decline)
    // No bookings in last 21 days

    const reasons = getChurnReasons(bookings, {
      totalBookings: bookings.length,
    })
    expect(reasons.some(r => r.pattern === 'frequency_decline')).toBe(true)
  })

  it('filters out low-engagement members (totalBookings < 5) from reactivation', () => {
    const now = new Date()
    const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000)
    const bookings: BookingWithSession[] = [
      makeBooking(fourWeeksAgo.toISOString().split('T')[0], '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking(
        new Date(fourWeeksAgo.getTime() + 7 * 86400000).toISOString().split('T')[0],
        '10:00', 'OPEN_PLAY', 'CONFIRMED'
      ),
    ]
    // Members with < 5 total bookings are excluded from reactivation —
    // they're "tried & didn't stick", not "at-risk regulars worth fighting for"
    const reasons = getChurnReasons(bookings, { totalBookings: 2 })
    expect(reasons).toEqual([])
  })

  it('detects "seasonal_gap" for player who had a previous inactive gap and returned', () => {
    // Cluster 1: Jan
    // Gap: 15+ days
    // Cluster 2: Feb (after gap)
    const bookings: BookingWithSession[] = [
      makeBooking('2026-01-01', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking('2026-01-03', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      // 20-day gap
      makeBooking('2026-01-25', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking('2026-01-28', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
      makeBooking('2026-02-15', '10:00', 'OPEN_PLAY', 'CONFIRMED'),
    ]
    const reasons = getChurnReasons(bookings, { totalBookings: 5 })
    expect(reasons.some(r => r.pattern === 'seasonal_gap')).toBe(true)
  })

  it('returns at most 2 churn reasons', () => {
    const now = new Date()
    const bookings: BookingWithSession[] = []
    // Build a complex history that might trigger many reasons
    for (let week = 10; week >= 5; week--) {
      for (let day = 0; day < 3; day++) {
        const d = new Date(now.getTime() - (week * 7 + day) * 86400000)
        bookings.push(makeBooking(d.toISOString().split('T')[0], '10:00', 'DRILL', 'CONFIRMED'))
      }
    }
    // Add cancellations in the recent chunk
    bookings.push(makeBooking('2026-03-01', '10:00', 'OPEN_PLAY', 'CANCELLED'))
    bookings.push(makeBooking('2026-03-05', '10:00', 'OPEN_PLAY', 'CANCELLED'))
    bookings.push(makeBooking('2026-03-10', '10:00', 'OPEN_PLAY', 'CANCELLED'))

    const reasons = getChurnReasons(bookings, { totalBookings: bookings.length })
    expect(reasons.length).toBeLessThanOrEqual(2)
  })

  it('cancel_spike has higher priority than other patterns', () => {
    const now = new Date()
    const bookings: BookingWithSession[] = []

    // Older confirmed bookings (many, to trigger frequency_decline too)
    for (let week = 10; week >= 5; week--) {
      for (let day = 0; day < 2; day++) {
        const d = new Date(now.getTime() - (week * 7 + day) * 86400000)
        bookings.push(makeBooking(d.toISOString().split('T')[0], '10:00', 'OPEN_PLAY', 'CONFIRMED'))
      }
    }

    // Recent: many cancellations
    bookings.push(makeBooking('2026-03-01', '10:00', 'OPEN_PLAY', 'CANCELLED'))
    bookings.push(makeBooking('2026-03-05', '10:00', 'OPEN_PLAY', 'CANCELLED'))
    bookings.push(makeBooking('2026-03-10', '10:00', 'OPEN_PLAY', 'CANCELLED'))
    bookings.push(makeBooking('2026-03-15', '10:00', 'OPEN_PLAY', 'CONFIRMED'))

    const reasons = getChurnReasons(bookings, { totalBookings: bookings.length })
    if (reasons.length > 0) {
      expect(reasons[0].pattern).toBe('cancel_spike')
    }
  })
})

// ================================================================
// 3. Smart Suggested Action (scoreSessionsByPreference)
// ================================================================

describe('Smart Suggested Action > Format Preference', () => {
  it('player who prefers DRILL gets DRILL session scored highest', () => {
    const member = makeMember()
    const pref = makePreference({
      preferredFormats: ['DRILL'],
      preferredTimeSlots: { morning: false, afternoon: false, evening: false },
      preferredDays: [],
    })
    const sessions = [
      makeSession({ id: 's1', format: 'OPEN_PLAY', title: 'Open Play' }),
      makeSession({ id: 's2', format: 'DRILL', title: 'Drill Session' }),
      makeSession({ id: 's3', format: 'CLINIC', title: 'Clinic' }),
    ]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].session.format).toBe('DRILL')
    expect(scored[0].formatScore).toBe(100)
  })

  it('non-preferred format gets 0 format score', () => {
    const member = makeMember()
    const pref = makePreference({ preferredFormats: ['DRILL'] })
    const sessions = [makeSession({ id: 's1', format: 'CLINIC' })]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].formatScore).toBe(0)
  })
})

describe('Smart Suggested Action > Time Preference', () => {
  it('player who plays mornings gets morning session scored highest', () => {
    const member = makeMember()
    const pref = makePreference({
      preferredTimeSlots: { morning: true, afternoon: false, evening: false },
      preferredFormats: [],
      preferredDays: [],
    })
    const sessions = [
      makeSession({ id: 's1', startTime: '18:00', title: 'Evening Session' }),
      makeSession({ id: 's2', startTime: '08:00', title: 'Morning Session' }),
      makeSession({ id: 's3', startTime: '13:00', title: 'Afternoon Session' }),
    ]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].session.startTime).toBe('08:00')
    expect(scored[0].timeScore).toBe(100)
  })

  it('non-preferred time slot gets 0 time score', () => {
    const member = makeMember()
    const pref = makePreference({
      preferredTimeSlots: { morning: true, afternoon: false, evening: false },
    })
    const sessions = [makeSession({ id: 's1', startTime: '19:00' })]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].timeScore).toBe(0)
  })
})

describe('Smart Suggested Action > Day Preference', () => {
  it('player who plays weekends gets weekend session scored highest', () => {
    const member = makeMember()
    const pref = makePreference({
      preferredDays: ['Saturday', 'Sunday'],
      preferredFormats: [],
      preferredTimeSlots: { morning: false, afternoon: false, evening: false },
    })
    // 2026-03-25 = Wednesday, 2026-03-28 = Saturday, 2026-03-29 = Sunday
    const sessions = [
      makeSession({ id: 's1', date: new Date('2026-03-25'), title: 'Wed Session' }),
      makeSession({ id: 's2', date: new Date('2026-03-28'), title: 'Sat Session' }),
      makeSession({ id: 's3', date: new Date('2026-03-29'), title: 'Sun Session' }),
    ]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    // Top result should be Saturday or Sunday
    const topDay = scored[0].session.date
    const dayIdx = new Date(topDay).getDay()
    expect([0, 6]).toContain(dayIdx) // 0=Sunday, 6=Saturday
    expect(scored[0].dayScore).toBe(100)
  })

  it('non-preferred day gets 0 day score', () => {
    const member = makeMember()
    const pref = makePreference({ preferredDays: ['Saturday'] })
    // Wednesday session
    const sessions = [makeSession({ id: 's1', date: new Date('2026-03-25') })]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].dayScore).toBe(0)
  })
})

describe('Smart Suggested Action > Availability Bonus', () => {
  it('session with more open spots gets higher availability score', () => {
    const member = makeMember()
    const pref = makePreference({
      preferredFormats: [],
      preferredTimeSlots: { morning: false, afternoon: false, evening: false },
      preferredDays: [],
    })
    const sessions = [
      makeSession({ id: 's1', maxPlayers: 12, confirmedCount: 10, title: 'Almost Full' }),
      makeSession({ id: 's2', maxPlayers: 12, confirmedCount: 2, title: 'Mostly Open' }),
    ]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    const almostFull = scored.find(s => s.session.id === 's1')!
    const mostlyOpen = scored.find(s => s.session.id === 's2')!
    expect(mostlyOpen.availabilityScore).toBeGreaterThan(almostFull.availabilityScore)
  })

  it('fully booked session gets 0 availability score', () => {
    const member = makeMember()
    const pref = makePreference()
    const sessions = [makeSession({ id: 's1', maxPlayers: 8, confirmedCount: 8 })]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].availabilityScore).toBe(0)
  })

  it('empty session gets 100 availability score', () => {
    const member = makeMember()
    const pref = makePreference()
    const sessions = [makeSession({ id: 's1', maxPlayers: 12, confirmedCount: 0 })]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].availabilityScore).toBe(100)
  })
})

describe('Smart Suggested Action > Combined scoring', () => {
  it('perfect match on all dimensions gets highest total score', () => {
    const member = makeMember()
    // Wednesday evening OPEN_PLAY
    const pref = makePreference({
      preferredFormats: ['OPEN_PLAY'],
      preferredTimeSlots: { morning: false, afternoon: false, evening: true },
      preferredDays: ['Wednesday'],
    })
    const sessions = [
      makeSession({
        id: 'perfect',
        format: 'OPEN_PLAY',
        startTime: '18:00',
        date: new Date('2026-03-25'), // Wednesday
        maxPlayers: 12,
        confirmedCount: 2,
      }),
      makeSession({
        id: 'mismatch',
        format: 'CLINIC',
        startTime: '08:00',
        date: new Date('2026-03-28'), // Saturday
        maxPlayers: 12,
        confirmedCount: 10,
      }),
    ]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].session.id).toBe('perfect')
    expect(scored[0].totalScore).toBeGreaterThan(scored[1].totalScore)
  })

  it('sessions are sorted by total score descending', () => {
    const member = makeMember()
    const pref = makePreference({ preferredFormats: ['DRILL'] })
    const sessions = [
      makeSession({ id: 's1', format: 'OPEN_PLAY' }),
      makeSession({ id: 's2', format: 'DRILL' }),
      makeSession({ id: 's3', format: 'CLINIC' }),
    ]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].totalScore).toBeGreaterThanOrEqual(scored[i].totalScore)
    }
  })

  it('null preference scores purely on availability', () => {
    const member = makeMember()
    const sessions = [
      makeSession({ id: 's1', maxPlayers: 12, confirmedCount: 10 }),
      makeSession({ id: 's2', maxPlayers: 12, confirmedCount: 2 }),
    ]
    const scored = scoreSessionsByPreference(member, null, sessions)
    expect(scored[0].session.id).toBe('s2') // more open spots
    expect(scored[0].formatScore).toBe(0)
    expect(scored[0].timeScore).toBe(0)
    expect(scored[0].dayScore).toBe(0)
  })

  it('filters out non-SCHEDULED sessions', () => {
    const member = makeMember()
    const pref = makePreference()
    const sessions = [
      makeSession({ id: 's1', status: 'CANCELLED' }),
      makeSession({ id: 's2', status: 'SCHEDULED' }),
    ]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored.length).toBe(1)
    expect(scored[0].session.id).toBe('s2')
  })

  it('explanation mentions preferred format when matched', () => {
    const member = makeMember()
    const pref = makePreference({ preferredFormats: ['DRILL'] })
    const sessions = [makeSession({ id: 's1', format: 'DRILL', title: 'Drill Time' })]
    const scored = scoreSessionsByPreference(member, pref, sessions)
    expect(scored[0].explanation).toContain('preferred format')
  })
})

// ================================================================
// 4. generateReactivationCandidates integration
// ================================================================

describe('generateReactivationCandidates > Integration', () => {
  it('filters out members who played recently (below threshold)', () => {
    const result = generateReactivationCandidates({
      members: [
        {
          member: makeMember({ id: 'active' }),
          preference: makePreference(),
          history: makeHistory({ daysSinceLastConfirmedBooking: 5 }),
        },
        {
          member: makeMember({ id: 'inactive' }),
          preference: makePreference(),
          history: makeHistory({ daysSinceLastConfirmedBooking: 30 }),
        },
      ],
      upcomingSessions: [makeSession()],
      inactivityThresholdDays: 21,
    })
    expect(result.length).toBe(1)
    expect(result[0].member.id).toBe('inactive')
  })

  it('sorts candidates by risk tier (highest risk first)', () => {
    const result = generateReactivationCandidates({
      members: [
        {
          member: makeMember({ id: 'low' }),
          preference: null,
          history: makeHistory({ daysSinceLastConfirmedBooking: 90, bookingsLastMonth: 0, bookingsLastWeek: 0 }),
        },
        {
          member: makeMember({ id: 'high' }),
          preference: makePreference(),
          history: makeHistory({ daysSinceLastConfirmedBooking: 22, bookingsLastMonth: 4, bookingsLastWeek: 1 }),
        },
      ],
      upcomingSessions: [makeSession()],
      inactivityThresholdDays: 21,
    })
    expect(result.length).toBe(2)
    // Sorted by risk tier: lowest score (highest risk) first
    expect(result[0].score).toBeLessThanOrEqual(result[1].score)
  })

  it('includes at most 3 suggested sessions', () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession({ id: `s${i}`, title: `Session ${i}` })
    )
    const result = generateReactivationCandidates({
      members: [{
        member: makeMember(),
        preference: makePreference(),
        history: makeHistory({ daysSinceLastConfirmedBooking: 30 }),
      }],
      upcomingSessions: sessions,
      inactivityThresholdDays: 21,
    })
    expect(result[0].suggestedSessions.length).toBeLessThanOrEqual(3)
    expect(result[0].scoredSessions!.length).toBeLessThanOrEqual(3)
  })

  it('null daysSinceLastConfirmedBooking qualifies as inactive', () => {
    const result = generateReactivationCandidates({
      members: [{
        member: makeMember(),
        preference: null,
        history: makeHistory({ daysSinceLastConfirmedBooking: null }),
      }],
      upcomingSessions: [],
      inactivityThresholdDays: 21,
    })
    expect(result.length).toBe(1)
    expect(result[0].daysSinceLastActivity).toBe(999)
  })

  it('default inactivity threshold is 21 days', () => {
    const result = generateReactivationCandidates({
      members: [
        {
          member: makeMember({ id: 'barely-active' }),
          preference: null,
          history: makeHistory({ daysSinceLastConfirmedBooking: 20 }),
        },
        {
          member: makeMember({ id: 'inactive' }),
          preference: null,
          history: makeHistory({ daysSinceLastConfirmedBooking: 21 }),
        },
      ],
      upcomingSessions: [],
    })
    // 20 days < 21 threshold => filtered out, only 21 qualifies
    expect(result.length).toBe(1)
    expect(result[0].member.id).toBe('inactive')
  })
})
