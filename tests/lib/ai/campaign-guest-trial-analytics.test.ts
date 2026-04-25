import { describe, expect, it } from 'vitest'
import { buildCampaignGuestTrialAnalytics } from '@/lib/ai/campaign-guest-trial-analytics'

describe('buildCampaignGuestTrialAnalytics', () => {
  it('enriches recent rows and aggregates offer and route filters', () => {
    const result = buildCampaignGuestTrialAnalytics([
      {
        id: 'log-1',
        type: 'CREATE_CAMPAIGN',
        status: 'sent',
        channel: 'email',
        createdAt: new Date('2026-04-15T12:00:00Z'),
        userName: 'Alex',
        reasoning: {
          guestTrialAttribution: {
            offerKey: 'starter-pack',
            offerName: 'Starter Pack',
            offerStage: 'convert_to_paid',
            routeKey: 'landing_page:starter',
            destinationDescriptor: 'Starter landing page',
            destinationType: 'landing_page',
            referralSource: {
              offerKey: 'vip-referral',
              offerName: 'VIP Guest Invite',
              offerLane: 'vip_advocate',
              routeKey: 'landing_page:vip-referral',
              destinationDescriptor: 'VIP referral page',
              destinationType: 'landing_page',
            },
          },
        },
      },
      {
        id: 'log-2',
        type: 'CREATE_CAMPAIGN',
        status: 'opened',
        channel: 'sms',
        createdAt: new Date('2026-04-15T13:00:00Z'),
        userName: 'Taylor',
        reasoning: {
          guestTrialAttribution: {
            offerKey: 'starter-pack',
            offerName: 'Starter Pack',
            offerStage: 'convert_to_paid',
            routeKey: 'landing_page:starter',
            destinationDescriptor: 'Starter landing page',
            destinationType: 'landing_page',
          },
        },
      },
      {
        id: 'log-3',
        type: 'TRIAL_FOLLOW_UP',
        status: 'clicked',
        channel: 'email',
        createdAt: new Date('2026-04-15T14:00:00Z'),
        userName: 'Jordan',
        reasoning: {
          referralAttribution: {
            offerKey: 'vip-referral',
            offerName: 'VIP Guest Invite',
            offerLane: 'vip_advocate',
            routeKey: 'landing_page:vip-referral',
            destinationDescriptor: 'VIP referral page',
            destinationType: 'landing_page',
          },
        },
      },
    ])

    expect(result.topGuestTrialOffers).toEqual([
      expect.objectContaining({
        key: 'starter-pack',
        label: 'Starter Pack',
        count: 2,
        stage: 'convert_to_paid',
      }),
    ])

    expect(result.topGuestTrialRoutes).toEqual([
      expect.objectContaining({
        key: 'landing_page:starter',
        label: 'Starter landing page',
        count: 2,
        destinationType: 'landing_page',
      }),
    ])

    expect(result.topReferralOffers).toEqual([
      expect.objectContaining({
        key: 'vip-referral',
        label: 'VIP Guest Invite',
        count: 1,
        lane: 'vip_advocate',
      }),
    ])

    expect(result.topReferralLanes).toEqual([
      expect.objectContaining({
        key: 'vip_advocate',
        label: 'vip advocate',
        count: 1,
      }),
    ])

    expect(result.topReferralRoutes).toEqual([
      expect.objectContaining({
        key: 'landing_page:vip-referral',
        label: 'VIP referral page',
        count: 1,
        destinationType: 'landing_page',
      }),
    ])

    expect(result.topReferredGuestSources).toEqual([
      expect.objectContaining({
        key: 'vip-referral',
        label: 'VIP Guest Invite',
        count: 1,
        lane: 'vip_advocate',
      }),
    ])

    expect(result.topReferredGuestRoutes).toEqual([
      expect.objectContaining({
        key: 'landing_page:vip-referral',
        label: 'VIP referral page',
        count: 1,
        destinationType: 'landing_page',
      }),
    ])

    expect(result.recentLogs).toEqual([
      expect.objectContaining({
        id: 'log-1',
        guestTrialOfferKey: 'starter-pack',
        guestTrialOfferName: 'Starter Pack',
        guestTrialRouteKey: 'landing_page:starter',
        guestTrialDestinationDescriptor: 'Starter landing page',
        referredGuestSourceOfferKey: 'vip-referral',
        referredGuestSourceOfferName: 'VIP Guest Invite',
        referredGuestSourceLane: 'vip_advocate',
        referredGuestSourceRouteKey: 'landing_page:vip-referral',
        referredGuestSourceDestinationDescriptor: 'VIP referral page',
      }),
      expect.objectContaining({
        id: 'log-2',
        guestTrialOfferKey: 'starter-pack',
        guestTrialOfferName: 'Starter Pack',
        guestTrialRouteKey: 'landing_page:starter',
      }),
      expect.objectContaining({
        id: 'log-3',
        guestTrialOfferKey: null,
        guestTrialRouteKey: null,
        referralOfferKey: 'vip-referral',
        referralOfferName: 'VIP Guest Invite',
        referralOfferLane: 'vip_advocate',
        referralRouteKey: 'landing_page:vip-referral',
        referralDestinationDescriptor: 'VIP referral page',
        referredGuestSourceOfferKey: null,
      }),
    ])
  })
})
