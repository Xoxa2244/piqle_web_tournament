import { describe, expect, it } from 'vitest'

import {
  buildGuestTrialOfferAttributionFromContext,
  inferGuestTrialOfferAttribution,
  parseGuestTrialExecutionContext,
} from '@/lib/ai/guest-trial-offers'

describe('inferGuestTrialOfferAttribution', () => {
  it('matches a configured guest/trial offer and route from campaign copy', () => {
    const attribution = inferGuestTrialOfferAttribution({
      automationSettings: {
        intelligence: {
          guestTrialOffers: {
            offers: [
              {
                key: 'guest_pass',
                name: 'Guest Pass',
                kind: 'guest_pass',
                audience: 'guest',
                stage: 'book_first_visit',
                destinationType: 'schedule',
                destinationLabel: 'beginner booking page',
                summary: 'Easy first-visit path for new guests',
                active: true,
              },
              {
                key: 'starter_membership',
                name: 'Starter Membership',
                kind: 'membership_offer',
                audience: 'either',
                stage: 'convert_to_paid',
                destinationType: 'landing_page',
                destinationLabel: 'starter membership checkout',
                active: true,
              },
            ],
          },
        },
      },
      subject: 'Book your first visit with our Guest Pass',
      body: 'Lead with Guest Pass and send members through the beginner booking page this week.',
      source: 'manual_campaign',
    })

    expect(attribution).toMatchObject({
      offerKey: 'guest_pass',
      offerName: 'Guest Pass',
      offerStage: 'book_first_visit',
      destinationType: 'schedule',
      destinationDescriptor: 'beginner booking page (Send them straight into the easiest first-booking path.)',
      routeKey: 'schedule:beginner booking page (Send them straight into the easiest first-booking path.)',
      inferred: true,
    })
    expect(attribution?.matchedSignals).toContain('offer name')
    expect(attribution?.matchedSignals).toContain('destination label')
  })

  it('returns null when copy does not match any configured guest/trial offer', () => {
    const attribution = inferGuestTrialOfferAttribution({
      automationSettings: {
        intelligence: {
          guestTrialOffers: {
            offers: [
              {
                key: 'starter_membership',
                name: 'Starter Membership',
                kind: 'membership_offer',
                audience: 'either',
                stage: 'convert_to_paid',
                destinationType: 'landing_page',
                destinationLabel: 'starter membership checkout',
                active: true,
              },
            ],
          },
        },
      },
      subject: 'VIP appreciation night',
      body: 'Invite our best regulars back for a social event.',
      source: 'manual_campaign',
    })

    expect(attribution).toBeNull()
  })

  it('builds exact attribution from structured guest/trial execution context', () => {
    const context = parseGuestTrialExecutionContext(JSON.stringify({
      source: 'guest_trial_booking',
      stage: 'book_first_visit',
      offerKey: 'guest_pass',
      offerName: 'Guest Pass',
      offerKind: 'guest_pass',
      destinationType: 'schedule',
      destinationDescriptor: 'beginner booking page (Send them straight into the easiest first-booking path.)',
      routeKey: 'schedule:beginner booking page (Send them straight into the easiest first-booking path.)',
      referralSource: {
        source: 'referral_engine',
        lane: 'vip_advocate',
        offerKey: 'vip-referral',
        offerName: 'VIP Guest Invite',
        offerKind: 'vip_guest_pass',
        destinationType: 'landing_page',
        destinationDescriptor: 'VIP referral page',
        routeKey: 'landing_page:vip-referral',
      },
    }))

    expect(context).toBeTruthy()
    expect(buildGuestTrialOfferAttributionFromContext(context!)).toMatchObject({
      offerKey: 'guest_pass',
      offerName: 'Guest Pass',
      offerStage: 'book_first_visit',
      offerKind: 'guest_pass',
      destinationType: 'schedule',
      inferred: false,
      matchedSignals: ['structured_context'],
      referralSource: {
        offerKey: 'vip-referral',
        offerName: 'VIP Guest Invite',
        offerLane: 'vip_advocate',
        destinationDescriptor: 'VIP referral page',
        routeKey: 'landing_page:vip-referral',
      },
    })
  })
})
