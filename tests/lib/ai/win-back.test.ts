import { describe, expect, it } from 'vitest'

import { buildWinBackSnapshot } from '../../../lib/ai/win-back'

describe('buildWinBackSnapshot', () => {
  it('builds win-back stages for expired, cancelled, and high-value lapsed members', () => {
    const snapshot = buildWinBackSnapshot({
      now: new Date('2026-04-15T12:00:00.000Z'),
      rows: [
        {
          userId: 'expired-1',
          followedAt: '2026-01-01T12:00:00.000Z',
          userCreatedAt: '2026-01-01T12:00:00.000Z',
          name: 'Expired Emma',
          email: 'expired@example.com',
          membershipType: 'Monthly Pass',
          membershipStatus: 'Expired',
          lastConfirmedBookingAt: '2026-04-08T12:00:00.000Z',
          confirmedBookings: 8,
        },
        {
          userId: 'cancelled-1',
          followedAt: '2026-01-01T12:00:00.000Z',
          userCreatedAt: '2026-01-01T12:00:00.000Z',
          name: 'Cancelled Carl',
          email: 'cancelled@example.com',
          membershipType: 'Unlimited',
          membershipStatus: 'Cancelled',
          lastConfirmedBookingAt: '2026-04-05T12:00:00.000Z',
          confirmedBookings: 12,
        },
        {
          userId: 'lapsed-1',
          followedAt: '2025-10-01T12:00:00.000Z',
          userCreatedAt: '2025-10-01T12:00:00.000Z',
          name: 'Quiet Quinn',
          email: 'quiet@example.com',
          membershipType: 'Monthly',
          membershipStatus: 'Currently Active',
          lastConfirmedBookingAt: '2026-03-16T12:00:00.000Z',
          confirmedBookings: 14,
        },
        {
          userId: 'ignore-1',
          followedAt: '2026-01-01T12:00:00.000Z',
          userCreatedAt: '2026-01-01T12:00:00.000Z',
          name: 'Too Cold',
          email: 'cold@example.com',
          membershipType: 'Monthly',
          membershipStatus: 'Expired',
          lastConfirmedBookingAt: '2025-12-01T12:00:00.000Z',
          confirmedBookings: 10,
        },
      ],
    })

    expect(snapshot.summary.totalCandidates).toBe(3)
    expect(snapshot.summary.expiredCount).toBe(1)
    expect(snapshot.summary.cancelledCount).toBe(1)
    expect(snapshot.summary.lapsedCount).toBe(1)
    expect(snapshot.summary.funnel.recoverableCount).toBe(3)
    expect(snapshot.summary.funnel.formerPaidCount).toBe(2)
    expect(snapshot.summary.funnel.warmWindowCount).toBe(2)
    expect(snapshot.summary.funnel.highIntentCount).toBe(3)
    expect(snapshot.summary.funnel.highValueLapsedCount).toBe(1)
    expect(snapshot.summary.funnel.warmWindowRate).toBe(100)
    expect(snapshot.summary.funnel.highIntentRate).toBe(100)
    expect(snapshot.summary.laneLoop).toHaveLength(3)
    expect(snapshot.summary.laneLoop.find((entry) => entry.stage === 'expired_membership')?.rate).toBe(100)
    expect(snapshot.summary.laneLoop.find((entry) => entry.stage === 'cancelled_membership')?.rate).toBe(100)
    expect(snapshot.summary.laneLoop.find((entry) => entry.stage === 'high_value_lapsed')?.rate).toBe(100)
    expect(snapshot.candidates.map((candidate) => candidate.stage).sort()).toEqual([
      'cancelled_membership',
      'expired_membership',
      'high_value_lapsed',
    ])
    expect(snapshot.candidates.find((candidate) => candidate.stage === 'high_value_lapsed')?.name).toBe('Quiet Quinn')
  })
})
