import { describe, expect, it } from 'vitest'

import { buildGuestTrialBookingSnapshot } from '@/lib/ai/guest-trial-booking'

describe('buildGuestTrialBookingSnapshot', () => {
  it('builds booking, show-up, and paid-conversion lanes for guest/trial members', () => {
    const snapshot = buildGuestTrialBookingSnapshot({
      now: new Date('2026-04-15T12:00:00.000Z'),
      automationSettings: {
        intelligence: {
          pricingModel: 'membership',
          avgSessionPriceCents: 3200,
          guestTrialOffers: {
            offers: [
              {
                key: 'guest_pass',
                name: 'Guest Pass',
                kind: 'guest_pass',
                audience: 'guest',
                stage: 'book_first_visit',
                priceLabel: '$15',
                destinationType: 'schedule',
                destinationLabel: 'beginner booking page',
                active: true,
              },
              {
                key: 'starter_membership',
                name: 'Starter Membership',
                kind: 'membership_offer',
                audience: 'either',
                stage: 'convert_to_paid',
                priceLabel: '$49/month',
                destinationType: 'landing_page',
                destinationLabel: 'starter membership checkout',
                active: true,
                highlight: true,
              },
              {
                key: 'show_up_nudge',
                name: 'Show-Up Nudge',
                kind: 'guest_pass',
                audience: 'guest',
                stage: 'protect_first_show_up',
                destinationType: 'schedule',
                destinationLabel: 'beginner booking page',
                active: true,
              },
            ],
          },
        },
      },
      rows: [
        {
          userId: 'trial-1',
          followedAt: '2026-04-11T12:00:00.000Z',
          userCreatedAt: '2026-04-11T12:00:00.000Z',
          name: 'Taylor Trial',
          email: 'trial@example.com',
          membershipType: 'Trial Pass',
          membershipStatus: 'Trial Active',
          nextBookedSessionAt: null,
          firstPlayedAt: null,
          lastPlayedAt: null,
          confirmedBookings: 0,
          playedConfirmedBookings: 0,
          noShowCount: 0,
        },
        {
          userId: 'guest-1',
          followedAt: '2026-04-09T12:00:00.000Z',
          userCreatedAt: '2026-04-09T12:00:00.000Z',
          name: 'Booked Brooke',
          email: 'booked@example.com',
          membershipType: 'Guest Pass',
          membershipStatus: 'No Membership',
          nextBookedSessionAt: '2026-04-17T12:00:00.000Z',
          firstPlayedAt: null,
          lastPlayedAt: null,
          confirmedBookings: 1,
          playedConfirmedBookings: 0,
          noShowCount: 0,
        },
        {
          userId: 'guest-2',
          followedAt: '2026-04-07T12:00:00.000Z',
          userCreatedAt: '2026-04-07T12:00:00.000Z',
          name: 'Convert Casey',
          email: 'convert@example.com',
          membershipType: 'Guest Pass',
          membershipStatus: 'No Membership',
          nextBookedSessionAt: null,
          firstPlayedAt: '2026-04-12T12:00:00.000Z',
          lastPlayedAt: '2026-04-13T12:00:00.000Z',
          confirmedBookings: 2,
          playedConfirmedBookings: 2,
          noShowCount: 0,
        },
        {
          userId: 'paid-1',
          followedAt: '2026-04-06T12:00:00.000Z',
          userCreatedAt: '2026-04-06T12:00:00.000Z',
          name: 'Paid Parker',
          email: 'paid@example.com',
          membershipType: 'Monthly Pass',
          membershipStatus: 'Currently Active',
          nextBookedSessionAt: null,
          firstPlayedAt: '2026-04-10T12:00:00.000Z',
          lastPlayedAt: '2026-04-14T12:00:00.000Z',
          confirmedBookings: 2,
          playedConfirmedBookings: 2,
          noShowCount: 0,
        },
      ],
    })

    expect(snapshot.summary.totalCandidates).toBe(3)
    expect(snapshot.summary.firstBookingCount).toBe(1)
    expect(snapshot.summary.showUpProtectionCount).toBe(1)
    expect(snapshot.summary.paidConversionCount).toBe(1)
    expect(snapshot.candidates.map((candidate) => candidate.stage).sort()).toEqual([
      'book_first_visit',
      'convert_to_paid',
      'protect_first_show_up',
    ])
    expect(snapshot.summary.funnel.entrantCount).toBe(4)
    expect(snapshot.summary.funnel.bookedCount).toBe(3)
    expect(snapshot.summary.funnel.showedUpCount).toBe(2)
    expect(snapshot.summary.funnel.paidCount).toBe(1)
    expect(snapshot.summary.funnel.bookingRate).toBe(75)
    expect(snapshot.summary.funnel.showUpRate).toBe(67)
    expect(snapshot.summary.funnel.paidConversionRate).toBe(50)
    expect(snapshot.summary.offers.firstVisit?.name).toBe('Guest Pass')
    expect(snapshot.summary.offers.paidConversion?.name).toBe('Starter Membership')
    expect(snapshot.summary.offerLoop).toHaveLength(3)
    expect(snapshot.summary.offerLoop.find((entry) => entry.stage === 'book_first_visit')?.name).toBe('Guest Pass')
    expect(snapshot.summary.offerLoop.find((entry) => entry.stage === 'book_first_visit')?.rate).toBe(75)
    expect(snapshot.summary.offerLoop.find((entry) => entry.stage === 'book_first_visit')?.destinationDescriptor).toContain('beginner booking page')
    expect(snapshot.summary.offerLoop.find((entry) => entry.stage === 'convert_to_paid')?.name).toBe('Starter Membership')
    expect(snapshot.summary.offerLoop.find((entry) => entry.stage === 'convert_to_paid')?.rate).toBe(50)
    expect(snapshot.summary.offerLoop.find((entry) => entry.stage === 'convert_to_paid')?.destinationDescriptor).toContain('starter membership checkout')
    expect(snapshot.summary.routeLoop.length).toBeGreaterThanOrEqual(2)
    expect(snapshot.summary.routeLoop.find((entry) => entry.destinationDescriptor.includes('beginner booking page'))?.stageCount).toBe(1)
    expect(snapshot.summary.routeLoop.find((entry) => entry.destinationDescriptor.includes('beginner booking page'))?.stages).toContain('book_first_visit')
    expect(snapshot.summary.routeLoop.find((entry) => entry.destinationDescriptor.includes('beginner booking page'))?.offerNames).toContain('Guest Pass')
    expect(snapshot.summary.routeLoop.find((entry) => entry.destinationDescriptor.includes('starter membership checkout'))?.stages).toContain('convert_to_paid')
    expect(snapshot.candidates.find((candidate) => candidate.stage === 'convert_to_paid')?.recommendedOffer?.name).toBe('Starter Membership')
    expect(snapshot.candidates.find((candidate) => candidate.stage === 'convert_to_paid')?.recommendedOffer?.destinationDescriptor).toContain('starter membership checkout')
  })
})
