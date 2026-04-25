import { describe, expect, it } from 'vitest'
import {
  buildReferralOfferAttributionFromContext,
  inferReferralOfferAttribution,
  parseReferralExecutionContext,
  pickReferralOffer,
  resolveReferralOffers,
} from '@/lib/ai/referral-offers'

describe('referral offers', () => {
  it('resolves configured referral offers and picks lane-specific defaults', () => {
    const offers = resolveReferralOffers({
      intelligence: {
        referralOffers: {
          offers: [
            {
              key: 'vip_referral',
              name: 'VIP Guest Invite',
              kind: 'vip_guest_pass',
              lane: 'vip_advocate',
              rewardLabel: 'Premium plus-one invite',
              destinationType: 'landing_page',
              destinationLabel: 'VIP referral page',
              destinationNotes: 'Use the premium invite path.',
            },
            {
              key: 'social_referral',
              name: 'Bring-a-Friend Pass',
              kind: 'bring_a_friend',
              lane: 'social_regular',
              rewardLabel: 'Simple guest-friendly invite',
              destinationType: 'schedule',
              destinationLabel: 'bring-a-friend booking page',
              destinationNotes: 'Use the easiest friend-invite booking route.',
            },
          ],
        },
      },
    })

    expect(offers.offers).toHaveLength(2)

    const vipOffer = pickReferralOffer({ offers, lane: 'vip_advocate' })
    const socialOffer = pickReferralOffer({ offers, lane: 'social_regular' })
    const dormantOffer = pickReferralOffer({ offers, lane: 'dormant_advocate' })

    expect(vipOffer?.name).toBe('VIP Guest Invite')
    expect(vipOffer?.destinationDescriptor).toContain('VIP referral page')
    expect(socialOffer?.name).toBe('Bring-a-Friend Pass')
    expect(socialOffer?.destinationDescriptor).toContain('bring-a-friend booking page')
    expect(dormantOffer?.generated).toBe(true)
    expect(dormantOffer?.destinationType).toBe('manual_follow_up')
  })

  it('infers referral attribution from campaign copy', () => {
    const attribution = inferReferralOfferAttribution({
      automationSettings: {
        intelligence: {
          referralOffers: {
            offers: [
              {
                key: 'vip_referral',
                name: 'VIP Guest Invite',
                kind: 'vip_guest_pass',
                lane: 'vip_advocate',
                rewardLabel: 'Premium plus-one invite',
                destinationType: 'landing_page',
                destinationLabel: 'VIP referral page',
                destinationNotes: 'Use the premium invite path.',
              },
            ],
          },
        },
      },
      subject: 'Lead with our VIP Guest Invite',
      body: 'Send your best advocates through the VIP referral page this week.',
      source: 'referral_engine',
    })

    expect(attribution).toMatchObject({
      offerKey: 'vip_referral',
      offerName: 'VIP Guest Invite',
      offerLane: 'vip_advocate',
      destinationType: 'landing_page',
      inferred: true,
    })
    expect(attribution?.matchedSignals).toContain('offer name')
    expect(attribution?.matchedSignals).toContain('destination label')
  })

  it('builds exact referral attribution from structured context', () => {
    const context = parseReferralExecutionContext(JSON.stringify({
      source: 'referral_engine',
      lane: 'social_regular',
      offerKey: 'social_referral',
      offerName: 'Bring-a-Friend Pass',
      offerKind: 'bring_a_friend',
      destinationType: 'schedule',
      destinationDescriptor: 'bring-a-friend booking page (Send them straight into the easiest friend-invite booking route.)',
      routeKey: 'schedule:bring-a-friend booking page (Send them straight into the easiest friend-invite booking route.)',
      advocateUserId: '11111111-1111-4111-8111-111111111111',
      advocateName: 'Social Sam',
      advocateEmail: 'sam@example.com',
    }))

    expect(context).toBeTruthy()
    expect(buildReferralOfferAttributionFromContext(context!)).toMatchObject({
      offerKey: 'social_referral',
      offerName: 'Bring-a-Friend Pass',
      offerLane: 'social_regular',
      offerKind: 'bring_a_friend',
      destinationType: 'schedule',
      inferred: false,
      matchedSignals: ['structured_context'],
      advocateUserId: '11111111-1111-4111-8111-111111111111',
      advocateName: 'Social Sam',
      advocateEmail: 'sam@example.com',
    })
  })
})
