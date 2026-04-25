import { describe, expect, it } from 'vitest'
import { buildSmartFirstSessionSnapshot } from '@/lib/ai/smart-first-session'

describe('smart-first-session', () => {
  it('prioritizes trial members who still need their first booking', () => {
    const snapshot = buildSmartFirstSessionSnapshot({
      now: new Date('2026-04-15T12:00:00.000Z'),
      rows: [
        {
          userId: 'trial-1',
          followedAt: '2026-04-10T12:00:00.000Z',
          userCreatedAt: '2026-04-10T12:00:00.000Z',
          name: 'Taylor Trial',
          email: 'taylor@example.com',
          membershipType: 'Trial Pass',
          membershipStatus: 'Trial Active',
          firstConfirmedBookingAt: null,
          lastConfirmedBookingAt: null,
          confirmedBookings: 0,
        },
      ],
    })

    expect(snapshot.summary.totalCandidates).toBe(1)
    expect(snapshot.summary.firstBookingCount).toBe(1)
    expect(snapshot.candidates[0]?.stage).toBe('book_first_session')
    expect(snapshot.candidates[0]?.score).toBeGreaterThanOrEqual(80)
    expect(snapshot.candidates[0]?.topReason).toContain('still no confirmed first booking')
  })

  it('flags one-session newcomers for the second-session habit loop', () => {
    const snapshot = buildSmartFirstSessionSnapshot({
      now: new Date('2026-04-15T12:00:00.000Z'),
      rows: [
        {
          userId: 'member-1',
          followedAt: '2026-04-04T12:00:00.000Z',
          userCreatedAt: '2026-04-04T12:00:00.000Z',
          name: 'Casey Club',
          email: 'casey@example.com',
          membershipType: 'Monthly Pass',
          membershipStatus: 'Currently Active',
          firstConfirmedBookingAt: '2026-04-11T12:00:00.000Z',
          lastConfirmedBookingAt: '2026-04-11T12:00:00.000Z',
          confirmedBookings: 1,
        },
      ],
    })

    expect(snapshot.summary.secondSessionCount).toBe(1)
    expect(snapshot.candidates[0]?.stage).toBe('book_second_session')
    expect(snapshot.candidates[0]?.nextBestMove).toContain('second session')
  })

  it('creates a paid-step conversion signal after the first guest session', () => {
    const snapshot = buildSmartFirstSessionSnapshot({
      now: new Date('2026-04-15T12:00:00.000Z'),
      rows: [
        {
          userId: 'guest-1',
          followedAt: '2026-04-06T12:00:00.000Z',
          userCreatedAt: '2026-04-06T12:00:00.000Z',
          name: 'Gina Guest',
          email: 'gina@example.com',
          membershipType: 'Guest Pass',
          membershipStatus: 'No Membership',
          firstConfirmedBookingAt: '2026-04-13T12:00:00.000Z',
          lastConfirmedBookingAt: '2026-04-14T12:00:00.000Z',
          confirmedBookings: 2,
        },
      ],
    })

    expect(snapshot.summary.conversionReadyCount).toBe(1)
    expect(snapshot.candidates[0]?.stage).toBe('convert_after_first_session')
    expect(snapshot.candidates[0]?.normalizedMembershipType).toBe('guest')
  })

  it('builds a newcomer funnel snapshot for campaign-side outcome loops', () => {
    const snapshot = buildSmartFirstSessionSnapshot({
      now: new Date('2026-04-15T12:00:00.000Z'),
      rows: [
        {
          userId: 'new-1',
          followedAt: '2026-04-13T12:00:00.000Z',
          userCreatedAt: '2026-04-13T12:00:00.000Z',
          name: 'No Booking Yet',
          email: 'nobook@example.com',
          membershipType: 'Trial Pass',
          membershipStatus: 'Trial Active',
          firstConfirmedBookingAt: null,
          lastConfirmedBookingAt: null,
          confirmedBookings: 0,
        },
        {
          userId: 'new-2',
          followedAt: '2026-04-11T12:00:00.000Z',
          userCreatedAt: '2026-04-11T12:00:00.000Z',
          name: 'One Booking',
          email: 'one@example.com',
          membershipType: 'Guest Pass',
          membershipStatus: 'No Membership',
          firstConfirmedBookingAt: '2026-04-14T12:00:00.000Z',
          lastConfirmedBookingAt: '2026-04-14T12:00:00.000Z',
          confirmedBookings: 1,
        },
        {
          userId: 'new-3',
          followedAt: '2026-04-10T12:00:00.000Z',
          userCreatedAt: '2026-04-10T12:00:00.000Z',
          name: 'Ready To Convert',
          email: 'convert@example.com',
          membershipType: 'Guest Pass',
          membershipStatus: 'No Membership',
          firstConfirmedBookingAt: '2026-04-12T12:00:00.000Z',
          lastConfirmedBookingAt: '2026-04-14T12:00:00.000Z',
          confirmedBookings: 2,
        },
        {
          userId: 'new-4',
          followedAt: '2026-04-09T12:00:00.000Z',
          userCreatedAt: '2026-04-09T12:00:00.000Z',
          name: 'Habit Builder',
          email: 'habit@example.com',
          membershipType: 'Monthly Pass',
          membershipStatus: 'Currently Active',
          firstConfirmedBookingAt: '2026-04-10T12:00:00.000Z',
          lastConfirmedBookingAt: '2026-04-14T12:00:00.000Z',
          confirmedBookings: 2,
        },
      ],
    })

    expect(snapshot.summary.funnel.newcomerCount).toBe(4)
    expect(snapshot.summary.funnel.firstBookedCount).toBe(3)
    expect(snapshot.summary.funnel.secondBookedCount).toBe(2)
    expect(snapshot.summary.funnel.paidMemberCount).toBe(1)
    expect(snapshot.summary.funnel.firstBookingRate).toBe(75)
    expect(snapshot.summary.funnel.secondSessionRate).toBe(67)
    expect(snapshot.summary.funnel.paidConversionRate).toBe(33)
    expect(snapshot.suggestedCohorts.map((cohort) => cohort.stage)).toEqual([
      'book_first_session',
      'book_second_session',
      'convert_after_first_session',
    ])
  })
})
