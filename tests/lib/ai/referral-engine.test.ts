import { describe, expect, it } from 'vitest'
import { buildReferralSnapshot } from '@/lib/ai/referral-engine'

describe('buildReferralSnapshot', () => {
  it('builds referral lanes from social and activity signals', () => {
    const snapshot = buildReferralSnapshot({
      now: new Date('2026-04-15T12:00:00Z'),
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
                destinationNotes: 'Route top advocates into the premium invite path.',
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
              {
                key: 'dormant_referral',
                name: 'Comeback Invite Credit',
                kind: 'reward_credit',
                lane: 'dormant_advocate',
                rewardLabel: '$20 comeback invite credit',
                destinationType: 'manual_follow_up',
                destinationLabel: 'comeback + referral follow-up',
                destinationNotes: 'Restart the relationship before the referral ask.',
              },
            ],
          },
        },
      },
      rows: [
        {
          userId: 'vip-1',
          followedAt: '2025-10-01T00:00:00Z',
          userCreatedAt: '2025-10-01T00:00:00Z',
          name: 'VIP Alex',
          email: 'vip@example.com',
          membershipType: 'Unlimited Gold',
          membershipStatus: 'active',
          firstConfirmedBookingAt: '2025-10-10T00:00:00Z',
          lastConfirmedBookingAt: '2026-04-10T00:00:00Z',
          confirmedBookings: 18,
          recentConfirmedBookings: 4,
          activeCoPlayers: 5,
          totalCoPlayers: 7,
        },
        {
          userId: 'social-1',
          followedAt: '2025-11-01T00:00:00Z',
          userCreatedAt: '2025-11-01T00:00:00Z',
          name: 'Social Sam',
          email: 'sam@example.com',
          membershipType: 'Package 10',
          membershipStatus: 'active',
          firstConfirmedBookingAt: '2025-11-10T00:00:00Z',
          lastConfirmedBookingAt: '2026-04-08T00:00:00Z',
          confirmedBookings: 7,
          recentConfirmedBookings: 2,
          activeCoPlayers: 3,
          totalCoPlayers: 4,
        },
        {
          userId: 'dormant-1',
          followedAt: '2025-09-01T00:00:00Z',
          userCreatedAt: '2025-09-01T00:00:00Z',
          name: 'Dormant Drew',
          email: 'drew@example.com',
          membershipType: 'Monthly',
          membershipStatus: 'active',
          firstConfirmedBookingAt: '2025-09-10T00:00:00Z',
          lastConfirmedBookingAt: '2026-03-05T00:00:00Z',
          confirmedBookings: 9,
          recentConfirmedBookings: 0,
          activeCoPlayers: 0,
          totalCoPlayers: 6,
        },
      ],
      outcomeRows: [
        {
          id: 'log-vip',
          userId: 'guest-1',
          status: 'clicked',
          createdAt: '2026-04-12T00:00:00Z',
          clickedAt: '2026-04-12T01:00:00Z',
          reasoning: {
            guestTrialAttribution: {
              offerKey: 'guest_offer',
              offerName: 'Guest Pass',
              offerStage: 'book_first_visit',
              offerKind: 'guest_pass',
              destinationType: 'schedule',
              destinationDescriptor: 'guest booking path',
              routeKey: 'schedule:guest booking path',
              referralSource: {
                offerKey: 'vip_referral',
                offerName: 'VIP Guest Invite',
                offerLane: 'vip_advocate',
                destinationType: 'landing_page',
                destinationDescriptor: 'VIP referral page',
                routeKey: 'landing_page:VIP referral page',
                advocateUserId: 'vip-1',
                advocateName: 'VIP Alex',
                advocateEmail: 'vip@example.com',
              },
            },
            referralAttribution: {
              offerKey: 'vip_referral',
              offerName: 'VIP Guest Invite',
              offerLane: 'vip_advocate',
              destinationType: 'landing_page',
              destinationDescriptor: 'VIP referral page',
              routeKey: 'landing_page:VIP referral page',
            },
          },
        },
        {
          id: 'log-social',
          userId: 'guest-2',
          status: 'opened',
          createdAt: '2026-04-13T00:00:00Z',
          openedAt: '2026-04-13T01:00:00Z',
          reasoning: {
            guestTrialAttribution: {
              offerKey: 'trial_offer',
              offerName: 'Trial Pass',
              offerStage: 'protect_first_show_up',
              offerKind: 'trial_pass',
              destinationType: 'manual_follow_up',
              destinationDescriptor: 'show-up protection route',
              routeKey: 'manual_follow_up:show-up protection route',
              referralSource: {
                offerKey: 'social_referral',
                offerName: 'Bring-a-Friend Pass',
                offerLane: 'social_regular',
                destinationType: 'schedule',
                destinationDescriptor: 'bring-a-friend booking page',
                routeKey: 'schedule:bring-a-friend booking page',
                advocateUserId: 'social-1',
                advocateName: 'Social Sam',
                advocateEmail: 'sam@example.com',
              },
            },
            referralAttribution: {
              offerKey: 'social_referral',
              offerName: 'Bring-a-Friend Pass',
              offerLane: 'social_regular',
              destinationType: 'schedule',
              destinationDescriptor: 'bring-a-friend booking page',
              routeKey: 'schedule:bring-a-friend booking page',
            },
          },
        },
        {
          id: 'log-dormant',
          userId: 'guest-3',
          status: 'converted',
          createdAt: '2026-04-14T00:00:00Z',
          respondedAt: '2026-04-14T02:00:00Z',
          reasoning: {
            guestTrialAttribution: {
              offerKey: 'starter_offer',
              offerName: 'Starter Pack',
              offerStage: 'convert_to_paid',
              offerKind: 'starter_pack',
              destinationType: 'landing_page',
              destinationDescriptor: 'starter pack landing page',
              routeKey: 'landing_page:starter pack landing page',
              referralSource: {
                offerKey: 'dormant_referral',
                offerName: 'Comeback Invite Credit',
                offerLane: 'dormant_advocate',
                destinationType: 'manual_follow_up',
                destinationDescriptor: 'comeback + referral follow-up',
                routeKey: 'manual_follow_up:comeback + referral follow-up',
                advocateUserId: 'dormant-1',
                advocateName: 'Dormant Drew',
                advocateEmail: 'drew@example.com',
              },
            },
            referralAttribution: {
              offerKey: 'dormant_referral',
              offerName: 'Comeback Invite Credit',
              offerLane: 'dormant_advocate',
              destinationType: 'manual_follow_up',
              destinationDescriptor: 'comeback + referral follow-up',
              routeKey: 'manual_follow_up:comeback + referral follow-up',
            },
          },
        },
      ],
      capturedGuestRows: [
        {
          userId: 'guest-1',
          name: 'Referral Riley',
          email: 'riley@example.com',
          membershipType: 'Guest Pass',
          membershipStatus: 'guest',
          nextBookedSessionAt: '2026-04-18T00:00:00Z',
          firstPlayedAt: null,
          lastPlayedAt: null,
          confirmedBookings: 1,
          playedConfirmedBookings: 0,
        },
        {
          userId: 'guest-2',
          name: 'Trial Tori',
          email: 'tori@example.com',
          membershipType: 'Trial Active',
          membershipStatus: 'trial',
          nextBookedSessionAt: null,
          firstPlayedAt: '2026-04-10T00:00:00Z',
          lastPlayedAt: '2026-04-10T00:00:00Z',
          confirmedBookings: 1,
          playedConfirmedBookings: 1,
        },
        {
          userId: 'guest-3',
          name: 'Paid Parker',
          email: 'parker@example.com',
          membershipType: 'Starter Pack',
          membershipStatus: 'active',
          nextBookedSessionAt: null,
          firstPlayedAt: '2026-04-08T00:00:00Z',
          lastPlayedAt: '2026-04-14T00:00:00Z',
          confirmedBookings: 2,
          playedConfirmedBookings: 2,
        },
      ],
      limit: 8,
    })

    expect(snapshot.summary.totalCandidates).toBe(3)
    expect(snapshot.summary.vipAdvocateCount).toBe(1)
    expect(snapshot.summary.socialRegularCount).toBe(1)
    expect(snapshot.summary.dormantAdvocateCount).toBe(1)
    expect(snapshot.summary.funnel.socialReachCount).toBe(3)
    expect(snapshot.summary.laneLoop).toHaveLength(3)
    expect(snapshot.summary.offerLoop).toHaveLength(3)
    expect(snapshot.summary.routeLoop).toHaveLength(3)
    expect(snapshot.summary.outcomeFunnel.askCount).toBe(3)
    expect(snapshot.summary.outcomeFunnel.intentCount).toBe(2)
    expect(snapshot.summary.outcomeLoop).toHaveLength(3)
    expect(snapshot.summary.outcomeLoop.find((entry) => entry.lane === 'vip_advocate')?.intentCount).toBe(1)
    expect(snapshot.summary.outcomeLoop.find((entry) => entry.lane === 'dormant_advocate')?.strongSignalCount).toBe(1)
    expect(snapshot.summary.rewardLoop).toHaveLength(3)
    expect(snapshot.summary.rewardLoop.find((entry) => entry.key === 'vip_referral')?.status).toBe('ready_review')
    expect(snapshot.summary.rewardLoop.find((entry) => entry.key === 'social_referral')?.status).toBe('in_flight')
    expect(snapshot.summary.rewardSummary).toContain('manual review')
    expect(snapshot.summary.referredGuestFunnel.capturedCount).toBe(3)
    expect(snapshot.summary.referredGuestFunnel.bookedCount).toBe(3)
    expect(snapshot.summary.referredGuestFunnel.showedUpCount).toBe(2)
    expect(snapshot.summary.referredGuestFunnel.paidCount).toBe(1)
    expect(snapshot.summary.rewardIssuance.readyCount).toBe(1)
    expect(snapshot.summary.rewardIssuance.issuedCount).toBe(0)
    expect(snapshot.summary.offers.vipAdvocate?.name).toBe('VIP Guest Invite')
    expect(snapshot.summary.offers.socialRegular?.destinationDescriptor).toContain('bring-a-friend booking page')
    expect(snapshot.summary.routeLoop.find((entry) => entry.destinationType === 'landing_page')?.offerNames).toContain('VIP Guest Invite')
    expect(snapshot.referredGuests).toHaveLength(3)
    expect(snapshot.referredGuests.find((guest) => guest.guestUserId === 'guest-1')?.stage).toBe('booked_first_visit')
    expect(snapshot.referredGuests.find((guest) => guest.guestUserId === 'guest-2')?.stage).toBe('showed_up')
    expect(snapshot.referredGuests.find((guest) => guest.guestUserId === 'guest-3')?.stage).toBe('converted_to_paid')
    expect(snapshot.referredGuests.find((guest) => guest.guestUserId === 'guest-3')?.advocateUserId).toBe('dormant-1')
    expect(snapshot.referredGuests.find((guest) => guest.guestUserId === 'guest-1')?.guestTrialContext?.referralSource?.offerName).toBe('VIP Guest Invite')
    expect(snapshot.rewardIssuances).toHaveLength(1)
    expect(snapshot.rewardIssuances[0]).toMatchObject({
      advocateUserId: 'dormant-1',
      advocateName: 'Dormant Drew',
      referredGuestUserId: 'guest-3',
      referredGuestName: 'Paid Parker',
      status: 'ready_issue',
      rewardLabel: '$20 comeback invite credit',
    })
    expect(snapshot.candidates.find((candidate) => candidate.lane === 'social_regular')?.recommendedOffer?.name).toBe('Bring-a-Friend Pass')
    expect(snapshot.candidates.map((candidate) => candidate.lane)).toEqual([
      'vip_advocate',
      'social_regular',
      'dormant_advocate',
    ])
  })

  it('applies reward guardrails and rolls advocate ledger counts up', () => {
    const snapshot = buildReferralSnapshot({
      now: new Date('2026-04-15T12:00:00Z'),
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
              },
              {
                key: 'social_referral',
                name: 'Bring-a-Friend Pass',
                kind: 'bring_a_friend',
                lane: 'social_regular',
                rewardLabel: 'Simple guest-friendly invite',
                destinationType: 'schedule',
                destinationLabel: 'bring-a-friend booking page',
              },
              {
                key: 'dormant_referral',
                name: 'Comeback Invite Credit',
                kind: 'reward_credit',
                lane: 'dormant_advocate',
                rewardLabel: '$20 comeback invite credit',
                destinationType: 'manual_follow_up',
                destinationLabel: 'comeback + referral follow-up',
              },
            ],
          },
        },
      },
      rows: [
        {
          userId: 'vip-guard',
          followedAt: '2025-10-01T00:00:00Z',
          userCreatedAt: '2025-10-01T00:00:00Z',
          name: 'VIP Vivian',
          email: 'vip-guard@example.com',
          membershipType: 'Unlimited Gold',
          membershipStatus: 'active',
          firstConfirmedBookingAt: '2025-10-10T00:00:00Z',
          lastConfirmedBookingAt: '2026-04-12T00:00:00Z',
          confirmedBookings: 16,
          recentConfirmedBookings: 4,
          activeCoPlayers: 5,
          totalCoPlayers: 6,
        },
        {
          userId: 'social-guard',
          followedAt: '2025-11-01T00:00:00Z',
          userCreatedAt: '2025-11-01T00:00:00Z',
          name: 'Social Riley',
          email: 'social-guard@example.com',
          membershipType: 'Package 10',
          membershipStatus: 'active',
          firstConfirmedBookingAt: '2025-11-10T00:00:00Z',
          lastConfirmedBookingAt: '2026-04-10T00:00:00Z',
          confirmedBookings: 9,
          recentConfirmedBookings: 3,
          activeCoPlayers: 3,
          totalCoPlayers: 4,
        },
        {
          userId: 'dormant-guard',
          followedAt: '2025-09-01T00:00:00Z',
          userCreatedAt: '2025-09-01T00:00:00Z',
          name: 'Dormant Dana',
          email: 'dormant-guard@example.com',
          membershipType: 'Monthly',
          membershipStatus: 'active',
          firstConfirmedBookingAt: '2025-09-10T00:00:00Z',
          lastConfirmedBookingAt: '2026-04-09T00:00:00Z',
          confirmedBookings: 10,
          recentConfirmedBookings: 2,
          activeCoPlayers: 2,
          totalCoPlayers: 4,
        },
      ],
      outcomeRows: [
        {
          id: 'reward-log-blocked',
          userId: 'guest-blocked',
          status: 'converted',
          createdAt: '2026-04-14T00:00:00Z',
          respondedAt: '2026-04-14T01:00:00Z',
          reasoning: {
            guestTrialAttribution: {
              offerKey: 'starter_offer',
              offerName: 'Starter Pack',
              offerStage: 'convert_to_paid',
              offerKind: 'starter_pack',
              destinationType: 'landing_page',
              destinationDescriptor: 'starter pack landing page',
              routeKey: 'landing_page:starter pack landing page',
              referralSource: {
                offerKey: 'vip_referral',
                offerName: 'VIP Guest Invite',
                offerLane: 'vip_advocate',
                destinationType: 'landing_page',
                destinationDescriptor: 'VIP referral page',
                routeKey: 'landing_page:VIP referral page',
                advocateUserId: 'vip-guard',
                advocateName: 'VIP Vivian',
                advocateEmail: 'vip-guard@example.com',
              },
            },
            referralAttribution: {
              offerKey: 'vip_referral',
              offerName: 'VIP Guest Invite',
              offerLane: 'vip_advocate',
              destinationType: 'landing_page',
              destinationDescriptor: 'VIP referral page',
              routeKey: 'landing_page:VIP referral page',
            },
          },
        },
        {
          id: 'reward-log-review',
          userId: 'guest-review',
          status: 'converted',
          createdAt: '2026-04-14T00:00:00Z',
          respondedAt: '2026-04-14T02:00:00Z',
          reasoning: {
            guestTrialAttribution: {
              offerKey: 'starter_offer',
              offerName: 'Starter Pack',
              offerStage: 'convert_to_paid',
              offerKind: 'starter_pack',
              destinationType: 'landing_page',
              destinationDescriptor: 'starter pack landing page',
              routeKey: 'landing_page:starter pack landing page',
              referralSource: {
                offerKey: 'social_referral',
                offerName: 'Bring-a-Friend Pass',
                offerLane: 'social_regular',
                destinationType: 'schedule',
                destinationDescriptor: 'bring-a-friend booking page',
                routeKey: 'schedule:bring-a-friend booking page',
                advocateUserId: 'social-guard',
                advocateName: 'Social Riley',
                advocateEmail: 'social-guard@example.com',
              },
            },
            referralAttribution: {
              offerKey: 'social_referral',
              offerName: 'Bring-a-Friend Pass',
              offerLane: 'social_regular',
              destinationType: 'schedule',
              destinationDescriptor: 'bring-a-friend booking page',
              routeKey: 'schedule:bring-a-friend booking page',
            },
          },
        },
        {
          id: 'reward-log-clean',
          userId: 'guest-clean',
          status: 'converted',
          createdAt: '2026-04-14T00:00:00Z',
          respondedAt: '2026-04-14T03:00:00Z',
          reasoning: {
            guestTrialAttribution: {
              offerKey: 'starter_offer',
              offerName: 'Starter Pack',
              offerStage: 'convert_to_paid',
              offerKind: 'starter_pack',
              destinationType: 'landing_page',
              destinationDescriptor: 'starter pack landing page',
              routeKey: 'landing_page:starter pack landing page',
              referralSource: {
                offerKey: 'dormant_referral',
                offerName: 'Comeback Invite Credit',
                offerLane: 'dormant_advocate',
                destinationType: 'manual_follow_up',
                destinationDescriptor: 'comeback + referral follow-up',
                routeKey: 'manual_follow_up:comeback + referral follow-up',
                advocateUserId: 'dormant-guard',
                advocateName: 'Dormant Dana',
                advocateEmail: 'dormant-guard@example.com',
              },
            },
            referralAttribution: {
              offerKey: 'dormant_referral',
              offerName: 'Comeback Invite Credit',
              offerLane: 'dormant_advocate',
              destinationType: 'manual_follow_up',
              destinationDescriptor: 'comeback + referral follow-up',
              routeKey: 'manual_follow_up:comeback + referral follow-up',
            },
          },
        },
      ],
      capturedGuestRows: [
        {
          userId: 'guest-blocked',
          name: 'Blocked Blair',
          email: 'vip-guard@example.com',
          membershipType: 'Starter Pack',
          membershipStatus: 'active',
          nextBookedSessionAt: null,
          firstPlayedAt: '2026-04-10T00:00:00Z',
          lastPlayedAt: '2026-04-10T00:00:00Z',
          confirmedBookings: 1,
          playedConfirmedBookings: 1,
        },
        {
          userId: 'guest-review',
          name: 'Review Robin',
          email: 'review@example.com',
          membershipType: 'Starter Pack',
          membershipStatus: 'active',
          nextBookedSessionAt: null,
          firstPlayedAt: null,
          lastPlayedAt: null,
          confirmedBookings: 1,
          playedConfirmedBookings: 0,
        },
        {
          userId: 'guest-clean',
          name: 'Clean Casey',
          email: 'clean@example.com',
          membershipType: 'Starter Pack',
          membershipStatus: 'active',
          nextBookedSessionAt: null,
          firstPlayedAt: '2026-04-08T00:00:00Z',
          lastPlayedAt: '2026-04-14T00:00:00Z',
          confirmedBookings: 2,
          playedConfirmedBookings: 2,
        },
      ],
      limit: 8,
    })

    expect(snapshot.summary.rewardIssuance.readyCount).toBe(1)
    expect(snapshot.summary.rewardIssuance.reviewCount).toBe(1)
    expect(snapshot.summary.rewardIssuance.blockedCount).toBe(1)
    expect(snapshot.rewardIssuances.find((entry) => entry.advocateUserId === 'vip-guard')).toMatchObject({
      guardrailStatus: 'blocked',
      abuseRisk: true,
      autoIssueSuggested: false,
    })
    expect(snapshot.rewardIssuances.find((entry) => entry.advocateUserId === 'social-guard')).toMatchObject({
      guardrailStatus: 'review',
      duplicateRisk: false,
      autoIssueSuggested: false,
    })
    expect(snapshot.rewardIssuances.find((entry) => entry.advocateUserId === 'dormant-guard')).toMatchObject({
      guardrailStatus: 'clean',
      autoIssueSuggested: true,
    })
    expect(snapshot.rewardLedger.find((entry) => entry.advocateUserId === 'vip-guard')).toMatchObject({
      blockedCount: 1,
      reviewCount: 0,
      readyCount: 0,
    })
    expect(snapshot.rewardLedger.find((entry) => entry.advocateUserId === 'social-guard')).toMatchObject({
      blockedCount: 0,
      reviewCount: 1,
      readyCount: 0,
    })
    expect(snapshot.rewardLedger.find((entry) => entry.advocateUserId === 'dormant-guard')).toMatchObject({
      blockedCount: 0,
      reviewCount: 0,
      readyCount: 1,
    })
  })
})
