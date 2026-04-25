'use client'

import Link from 'next/link'
import { ArrowRight, Check, Clock3, Loader2, Sparkles } from 'lucide-react'
import { formatReferralLaneLabel } from '@/lib/ai/referral-offers'
import {
  buildAdvisorContextHref,
  buildGuestTrialExecutionContext,
  buildReferralExecutionContext,
} from '../shared/growth-context'

const REFERRAL_LANE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  idle: { label: 'Idle', bg: 'rgba(148,163,184,0.14)', color: '#94A3B8' },
  healthy: { label: 'Healthy', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  watch: { label: 'Watch', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  at_risk: { label: 'At Risk', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
}

const REFERRAL_REWARD_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  quiet: { label: 'Quiet', bg: 'rgba(148,163,184,0.14)', color: '#94A3B8' },
  in_flight: { label: 'In Flight', bg: 'rgba(6,182,212,0.14)', color: '#06B6D4' },
  ready_review: { label: 'Needs Review', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
}

const REFERRAL_REWARD_ISSUANCE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  ready_issue: { label: 'Ready to Issue', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  on_hold: { label: 'On Hold', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  issued: { label: 'Issued', bg: 'rgba(59,130,246,0.14)', color: '#3B82F6' },
}

const REFERRAL_REWARD_GUARDRAIL_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  clean: { label: 'Clean', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  review: { label: 'Needs Review', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  blocked: { label: 'Blocked', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
}

const REFERRAL_CAPTURED_GUEST_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  captured: { label: 'Captured', bg: 'rgba(6,182,212,0.14)', color: '#06B6D4' },
  booked_first_visit: { label: 'Booked', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  showed_up: { label: 'Showed Up', bg: 'rgba(139,92,246,0.14)', color: '#8B5CF6' },
  converted_to_paid: { label: 'Paid', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
}

function formatReferralRouteType(destinationType: string) {
  switch (destinationType) {
    case 'schedule':
      return 'Booking route'
    case 'landing_page':
      return 'Referral landing path'
    case 'external_url':
      return 'External invite route'
    case 'manual_follow_up':
      return 'Follow-up route'
    default:
      return 'Invite route'
  }
}

function buildReferralOfferRemediationPrompt(input: {
  lane: 'vip_advocate' | 'social_regular' | 'dormant_advocate'
  status: 'healthy' | 'watch' | 'at_risk'
  offerName: string
  descriptor: string
  destinationDescriptor: string
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'

  if (input.lane === 'vip_advocate') {
    return {
      label: isRisky ? 'Tighten VIP referral offer' : 'Refine VIP referral offer',
      prompt: `Rework the VIP advocate referral offer. ${input.offerName} (${input.descriptor}) currently routes invites through ${input.destinationDescriptor}, and the lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members in scope. Keep the ask premium, social, and low-friction, then show me the first review-ready version.`,
    }
  }

  if (input.lane === 'social_regular') {
    return {
      label: isRisky ? 'Tighten friend invite offer' : 'Refine friend invite offer',
      prompt: `Rework the social regular referral offer. ${input.offerName} (${input.descriptor}) currently routes invites through ${input.destinationDescriptor}, and the lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members in scope. Make the bring-a-friend ask simpler and more natural, then keep the first draft review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Rework dormant advocate offer' : 'Refine dormant advocate offer',
    prompt: `Rework the dormant advocate referral offer. ${input.offerName} (${input.descriptor}) currently routes the comeback invite through ${input.destinationDescriptor}, and the lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members in scope. Rebuild the relationship first, then stage the referral ask safely, and keep the first version review-ready.`,
  }
}

function buildReferralRouteRemediationPrompt(input: {
  destinationType: string
  destinationDescriptor: string
  lanes: Array<'vip_advocate' | 'social_regular' | 'dormant_advocate'>
  offerNames: string[]
  status: 'healthy' | 'watch' | 'at_risk'
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
}) {
  const routeLabel = formatReferralRouteType(input.destinationType)
  const laneSummary = input.lanes
    .map((lane) => (
      lane === 'vip_advocate'
        ? 'VIP advocates'
        : lane === 'social_regular'
          ? 'social regulars'
          : 'dormant advocates'
    ))
    .join(', ')
  const offerSummary = input.offerNames.join(', ')
  const labelPrefix = input.status === 'watch' || input.status === 'at_risk' ? 'Rework' : 'Refine'

  return {
    label: `${labelPrefix} ${routeLabel.toLowerCase()}`,
    prompt: `Rework the referral ${routeLabel.toLowerCase()}. ${input.destinationDescriptor} currently carries ${laneSummary} via ${offerSummary}, and the combined route is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members in scope. Reduce friction, tighten the invite-to-booking handoff, and keep the first version review-ready.`,
  }
}

function buildReferralOutcomeRemediationPrompt(input: {
  lane: 'vip_advocate' | 'social_regular' | 'dormant_advocate'
  status: 'idle' | 'healthy' | 'watch' | 'at_risk'
  askCount: number
  engagedCount: number
  intentCount: number
  strongSignalCount: number
}) {
  const laneLabel = formatReferralLaneLabel(input.lane)

  if (input.status === 'idle') {
    return {
      label: 'Launch live referral ask',
      prompt: `Build the first live referral ask for the ${laneLabel.toLowerCase()} lane. There are no real outcome signals yet, so start with the safest review-ready version, make the CTA explicit, and keep the initial live motion low-friction.`,
    }
  }

  const label = input.status === 'at_risk'
    ? 'Rework live referral ask'
    : input.status === 'watch'
      ? 'Tighten live referral ask'
      : 'Scale live referral ask'

  return {
    label,
    prompt: `Review the live referral outcome loop for the ${laneLabel.toLowerCase()} lane. ${input.askCount} asks went out, ${input.engagedCount} advocates engaged, ${input.intentCount} showed intro intent, and ${input.strongSignalCount} produced the strongest response signals. Rework the ask, timing, and follow-up path so the next live version is safer and more effective, then keep it review-ready.`,
  }
}

function buildReferralRewardReviewPrompt(input: {
  lane: 'vip_advocate' | 'social_regular' | 'dormant_advocate'
  offerName: string
  rewardLabel: string
  destinationDescriptor: string
  status: 'quiet' | 'in_flight' | 'ready_review'
  askCount: number
  engagedCount: number
  reviewCount: number
}) {
  const laneLabel = formatReferralLaneLabel(input.lane)

  if (input.status === 'ready_review') {
    return {
      label: 'Review reward follow-up',
      prompt: `Review referral reward follow-up for ${input.offerName} in the ${laneLabel.toLowerCase()} lane. ${input.reviewCount} advocates now show strong enough signals to justify manual reward review. Reward label: ${input.rewardLabel}. Destination route: ${input.destinationDescriptor}. Draft the safest ops-ready follow-up and keep reward issuance manual.`,
    }
  }

  if (input.status === 'in_flight') {
    return {
      label: 'Plan reward ops',
      prompt: `Plan referral reward ops for ${input.offerName} in the ${laneLabel.toLowerCase()} lane. ${input.askCount} asks are in flight and ${input.engagedCount} advocates have engaged so far. Reward label: ${input.rewardLabel}. Destination route: ${input.destinationDescriptor}. Prepare the cleanest manual-review workflow before more advocates qualify.`,
    }
  }

  return {
    label: 'Set reward rubric',
    prompt: `Define the manual reward-review rubric for ${input.offerName} in the ${laneLabel.toLowerCase()} lane. Reward label: ${input.rewardLabel}. Destination route: ${input.destinationDescriptor}. Keep it simple, abuse-aware, and operator-reviewed first.`,
  }
}

function buildReferredGuestFollowUpPrompt(input: {
  guestName: string
  stage: 'captured' | 'booked_first_visit' | 'showed_up' | 'converted_to_paid'
  sourceOfferName: string | null
  sourceLane: string | null
  sourceRouteDescriptor: string | null
  guestOfferName: string | null
  guestDestinationDescriptor: string | null
  nextBestMove: string
}) {
  const laneLabel = input.sourceLane === 'vip_advocate'
    ? 'VIP advocate'
    : input.sourceLane === 'social_regular'
      ? 'social regular'
      : input.sourceLane === 'dormant_advocate'
        ? 'dormant advocate'
        : 'referral'
  const sourceSummary = input.sourceOfferName
    ? `${laneLabel} via ${input.sourceOfferName}${input.sourceRouteDescriptor ? ` -> ${input.sourceRouteDescriptor}` : ''}`
    : laneLabel

  if (input.stage === 'captured') {
    return {
      label: 'Draft first-booking follow-up',
      prompt: `Build a referred-guest first-booking follow-up for ${input.guestName} from ${sourceSummary}.${input.guestOfferName ? ` Move them into ${input.guestOfferName}` : ''}${input.guestDestinationDescriptor ? ` via ${input.guestDestinationDescriptor}` : ''}. ${input.nextBestMove} Keep the first version review-ready.`,
    }
  }

  if (input.stage === 'booked_first_visit') {
    return {
      label: 'Protect first show-up',
      prompt: `Build a referred-guest show-up protection flow for ${input.guestName} from ${sourceSummary}. They already booked the first visit.${input.guestDestinationDescriptor ? ` Protect the route through ${input.guestDestinationDescriptor}.` : ''} ${input.nextBestMove} Keep it review-ready and low-friction.`,
    }
  }

  if (input.stage === 'showed_up') {
    return {
      label: 'Draft paid conversion',
      prompt: `Build a referred-guest paid conversion follow-up for ${input.guestName} from ${sourceSummary}. They already showed up once.${input.guestOfferName ? ` Use ${input.guestOfferName} as the conversion context.` : ''} ${input.nextBestMove} Keep the first version review-ready.`,
    }
  }

  return {
    label: 'Review reward handoff',
    prompt: `Review the referral reward handoff for ${input.guestName} from ${sourceSummary}. They already converted to paid. ${input.nextBestMove} Draft the safest operator-ready follow-up, keep reward issuance manual, and preserve the evidence trail.`,
  }
}

interface ReferralCampaignsSectionProps {
  clubId: string
  referralSummary: any
  referralPlays: any[]
  referralHasLiveTracking: boolean
  referralFunnel: any
  referralOffers: any
  referralOutcomeFunnel: any
  referralLaneLoop: any[]
  referralOfferLoop: any[]
  referralRouteLoop: any[]
  referralOutcomeLoop: any[]
  referralRewardLoop: any[]
  referralRewardSummary: string
  referralRewardIssuanceSummary: any
  referralReferredGuestFunnel: any
  referralReferredGuests: any[]
  referralRewardIssuances: any[]
  referralRewardLedger: any[]
  guestTrialOffers: any
  activeReferralRewardIssuanceKey: string | null
  isRewardIssuancePending: boolean
  onUpdateReferralRewardIssuance: (issuance: any, status: 'ready_issue' | 'on_hold' | 'issued') => void
}

export function ReferralCampaignsSection(props: ReferralCampaignsSectionProps) {
  const {
    clubId,
    referralSummary,
    referralPlays,
    referralHasLiveTracking,
    referralFunnel,
    referralOffers,
    referralOutcomeFunnel,
    referralLaneLoop,
    referralOfferLoop,
    referralRouteLoop,
    referralOutcomeLoop,
    referralRewardLoop,
    referralRewardSummary,
    referralRewardIssuanceSummary,
    referralReferredGuestFunnel,
    referralReferredGuests,
    referralRewardIssuances,
    referralRewardLedger,
    guestTrialOffers,
    activeReferralRewardIssuanceKey,
    isRewardIssuancePending,
    onUpdateReferralRewardIssuance,
  } = props

  if (!referralSummary || (referralPlays.length === 0 && !referralHasLiveTracking)) {
    return null
  }

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Referral Campaigns</div>
          <div className="text-sm mt-1" style={{ color: 'var(--t2)', maxWidth: 780 }}>
            This lane turns co-player momentum into real growth motions: activate VIP advocates, ask social regulars to bring a friend, and restart dormant advocates before making the referral ask.
          </div>
        </div>
        <div
          className="px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
        >
          {referralSummary.totalCandidates} referral opportunities
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'In scope',
            value: referralSummary.totalCandidates,
            sub: 'referral-ready candidates',
            accent: '#06B6D4',
          },
          {
            label: 'VIP advocates',
            value: referralSummary.vipAdvocateCount,
            sub: 'high-trust asks',
            accent: '#F59E0B',
          },
          {
            label: 'Social regulars',
            value: referralSummary.socialRegularCount,
            sub: 'friend-invite lane',
            accent: '#06B6D4',
          },
          {
            label: 'Dormant advocates',
            value: referralSummary.dormantAdvocateCount,
            sub: 'restart before ask',
            accent: '#8B5CF6',
          },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl p-4" style={{ background: 'var(--subtle)' }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
            <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
            <div className="text-[11px] mt-1" style={{ color: item.accent }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {referralFunnel ? (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Referral funnel</div>
          <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
            {referralFunnel.summary}
            {referralOffers?.vipAdvocate ? ` Current VIP default: ${referralOffers.vipAdvocate.descriptor} via ${referralOffers.vipAdvocate.destinationDescriptor}.` : ''}
            {referralOffers?.socialRegular ? ` Current social default: ${referralOffers.socialRegular.descriptor} via ${referralOffers.socialRegular.destinationDescriptor}.` : ''}
            {referralOffers?.dormantAdvocate ? ` Current dormant restart: ${referralOffers.dormantAdvocate.descriptor} via ${referralOffers.dormantAdvocate.destinationDescriptor}.` : ''}
          </div>
          {referralOutcomeFunnel ? (
            <div className="text-sm mt-1.5" style={{ color: '#06B6D4', lineHeight: 1.7 }}>
              {referralOutcomeFunnel.summary}
            </div>
          ) : null}
        </div>
      ) : null}

      {referralOfferLoop.length > 0 ? (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Referral offer loop</div>
              <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                Which bring-a-friend offer is driving each referral lane right now, and where does the invite framing still need work?
              </div>
            </div>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
            >
              {referralOfferLoop.length} tracked offers
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-3 mt-4">
            {referralOfferLoop.map((offer: any) => {
              const tone = REFERRAL_LANE_STYLES[offer.status] || REFERRAL_LANE_STYLES.watch
              const referralSourceContext = buildReferralExecutionContext({
                lane: offer.lane,
                offer,
              })
              const referredGuestCaptureContext = guestTrialOffers?.firstVisit
                ? buildGuestTrialExecutionContext({
                    stage: 'book_first_visit',
                    offer: guestTrialOffers.firstVisit,
                    referralSource: referralSourceContext,
                  })
                : null
              const referredGuestCapturePrompt = guestTrialOffers?.firstVisit
                ? `Draft a referred guest capture campaign for invitees coming through ${offer.name} in the ${formatReferralLaneLabel(offer.lane).toLowerCase()} lane. Move referred guests into ${guestTrialOffers.firstVisit.descriptor} via ${guestTrialOffers.firstVisit.destinationDescriptor}, reduce friction between referral click and first booking, and keep the first version review-ready.`
                : null
              const remediation = buildReferralOfferRemediationPrompt({
                lane: offer.lane,
                status: offer.status,
                offerName: offer.name,
                descriptor: offer.descriptor,
                destinationDescriptor: offer.destinationDescriptor,
                rate: offer.rate,
                candidateCount: offer.candidateCount,
                outcomeCount: offer.outcomeCount,
                baseCount: offer.baseCount,
              })
              return (
                <div
                  key={offer.key}
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{offer.name}</div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>{offer.descriptor}</div>
                      <div className="text-xs mt-1.5" style={{ color: tone.color, lineHeight: 1.6 }}>
                        Route: {offer.destinationDescriptor}
                      </div>
                    </div>
                    <span
                      className="px-2 py-1 rounded-full text-[10px] font-semibold"
                      style={{ background: tone.bg, color: tone.color }}
                    >
                      {tone.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>In lane</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{offer.candidateCount}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Outcome</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{offer.outcomeCount}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Rate</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: tone.color }}>{offer.rate}%</div>
                    </div>
                  </div>

                  <div className="text-xs mt-4" style={{ color: tone.color, fontWeight: 700 }}>{offer.outcomeLabel}</div>
                  <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {offer.summary}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={buildAdvisorContextHref(clubId, {
                        prompt: remediation.prompt,
                        referralContext: referralSourceContext,
                      })}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px]"
                      style={{ background: tone.bg, color: tone.color }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {remediation.label}
                    </Link>
                    {referredGuestCapturePrompt && referredGuestCaptureContext ? (
                      <Link
                        href={buildAdvisorContextHref(clubId, {
                          prompt: referredGuestCapturePrompt,
                          guestTrialContext: referredGuestCaptureContext,
                        })}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px]"
                        style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Capture referred guest
                      </Link>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {referralRouteLoop.length > 0 ? (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Referral route loop</div>
              <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                Which invite path is carrying referral momentum right now, and where is the handoff from advocate to guest still too weak?
              </div>
            </div>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
            >
              {referralRouteLoop.length} tracked routes
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-3 mt-4">
            {referralRouteLoop.map((route: any) => {
              const tone = REFERRAL_LANE_STYLES[route.status] || REFERRAL_LANE_STYLES.watch
              const remediation = buildReferralRouteRemediationPrompt({
                destinationType: route.destinationType,
                destinationDescriptor: route.destinationDescriptor,
                lanes: route.lanes,
                offerNames: route.offerNames,
                status: route.status,
                rate: route.rate,
                candidateCount: route.candidateCount,
                outcomeCount: route.outcomeCount,
                baseCount: route.baseCount,
              })
              return (
                <div
                  key={route.key}
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{route.destinationDescriptor}</div>
                      <div className="text-xs mt-1.5" style={{ color: tone.color, lineHeight: 1.6 }}>
                        {formatReferralRouteType(route.destinationType)}
                      </div>
                    </div>
                    <span
                      className="px-2 py-1 rounded-full text-[10px] font-semibold"
                      style={{ background: tone.bg, color: tone.color }}
                    >
                      {tone.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {route.lanes.map((lane: string) => (
                      <span
                        key={`${route.key}-${lane}`}
                        className="px-2 py-1 rounded-full text-[10px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}
                      >
                        {lane === 'vip_advocate'
                          ? 'VIP'
                          : lane === 'social_regular'
                            ? 'Social'
                            : 'Dormant'}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>In play</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{route.candidateCount}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Outcome</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{route.outcomeCount}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Rate</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: tone.color }}>{route.rate}%</div>
                    </div>
                  </div>

                  <div className="text-xs mt-4" style={{ color: tone.color, fontWeight: 700 }}>{route.outcomeLabel}</div>
                  <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {route.summary}
                  </div>

                  <Link
                    href={buildAdvisorContextHref(clubId, { prompt: remediation.prompt })}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] mt-4"
                    style={{ background: tone.bg, color: tone.color }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {remediation.label}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {(referralOutcomeFunnel?.askCount || 0) > 0 || referralOutcomeLoop.length > 0 ? (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Referral outcome loop</div>
              <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                This is the live advocate-response layer: not downstream friend signups yet, but real referral ask traction by lane.
              </div>
            </div>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
            >
              {referralOutcomeFunnel?.askCount || 0} live asks
            </span>
          </div>

          {referralOutcomeFunnel ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mt-4">
              {[
                { label: 'Asks sent', value: referralOutcomeFunnel.askCount, sub: `${referralOutcomeFunnel.engagementRate}% engaged`, accent: '#06B6D4' },
                { label: 'Engaged', value: referralOutcomeFunnel.engagedCount, sub: 'opened or clicked', accent: '#10B981' },
                { label: 'Intent', value: referralOutcomeFunnel.intentCount, sub: `${referralOutcomeFunnel.intentRate}% intro intent`, accent: '#F59E0B' },
                { label: 'Strongest signal', value: referralOutcomeFunnel.strongSignalCount, sub: `${referralOutcomeFunnel.strongSignalRate}% strongest response`, accent: '#8B5CF6' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                  <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
                  <div className="text-[11px] mt-1" style={{ color: item.accent }}>{item.sub}</div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-3 mt-4">
            {referralOutcomeLoop.map((lane: any) => {
              const tone = REFERRAL_LANE_STYLES[lane.status] || REFERRAL_LANE_STYLES.watch
              const remediation = buildReferralOutcomeRemediationPrompt({
                lane: lane.lane,
                status: lane.status,
                askCount: lane.askCount,
                engagedCount: lane.engagedCount,
                intentCount: lane.intentCount,
                strongSignalCount: lane.strongSignalCount,
              })
              return (
                <div key={lane.key} className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{lane.title}</div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>{lane.outcomeLabel}</div>
                    </div>
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: tone.bg, color: tone.color }}>
                      {tone.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {[
                      { label: 'Asks', value: lane.askCount },
                      { label: 'Engaged', value: lane.engagedCount },
                      { label: 'Intent', value: lane.intentCount },
                      { label: 'Signal', value: lane.strongSignalCount },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                        <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                        <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {lane.summary}
                  </div>

                  <Link
                    href={buildAdvisorContextHref(clubId, {
                      prompt: remediation.prompt,
                      referralContext: buildReferralExecutionContext({
                        lane: lane.lane,
                        offer: referralOffers?.[lane.lane === 'vip_advocate' ? 'vipAdvocate' : lane.lane === 'social_regular' ? 'socialRegular' : 'dormantAdvocate'] || null,
                      }),
                    })}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] mt-4"
                    style={{ background: tone.bg, color: tone.color }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {remediation.label}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {referralRewardLoop.length > 0 ? (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Referral reward review</div>
              <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                Rewards stay manual here. This queue shows which referral motions have enough live advocate signal to deserve human review.
              </div>
            </div>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
            >
              {referralRewardSummary}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-3 mt-4">
            {referralRewardLoop.map((offer: any) => {
              const laneTone = REFERRAL_LANE_STYLES[offer.lane] || REFERRAL_LANE_STYLES.watch
              const statusTone = REFERRAL_REWARD_STYLES[offer.status] || REFERRAL_REWARD_STYLES.in_flight
              const remediation = buildReferralRewardReviewPrompt({
                lane: offer.lane,
                offerName: offer.name,
                rewardLabel: offer.rewardLabel,
                destinationDescriptor: offer.destinationDescriptor,
                status: offer.status,
                askCount: offer.askCount,
                engagedCount: offer.engagedCount,
                reviewCount: offer.reviewCount,
              })
              return (
                <div key={offer.key} className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{offer.name}</div>
                      <div className="text-xs mt-1.5" style={{ color: laneTone.color, lineHeight: 1.6 }}>
                        {formatReferralLaneLabel(offer.lane)} · {offer.rewardLabel}
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: statusTone.bg, color: statusTone.color }}>
                      {statusTone.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Asks</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{offer.askCount}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Engaged</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{offer.engagedCount}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Review</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: statusTone.color }}>{offer.reviewCount}</div>
                    </div>
                  </div>

                  <div className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {offer.summary}
                  </div>

                  <Link
                    href={buildAdvisorContextHref(clubId, {
                      prompt: remediation.prompt,
                      referralContext: buildReferralExecutionContext({
                        lane: offer.lane,
                        offer,
                      }),
                    })}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] mt-4"
                    style={{ background: statusTone.bg, color: statusTone.color }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {remediation.label}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {(referralReferredGuestFunnel?.capturedCount || 0) > 0 || referralReferredGuests.length > 0 ? (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Captured referred guests</div>
              <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                This is the concrete identity layer: real guests already inside the club funnel from a known referral motion, not just advocate-side send analytics.
              </div>
            </div>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
            >
              {referralReferredGuestFunnel?.capturedCount || referralReferredGuests.length} captured guests
            </span>
          </div>

          {referralReferredGuestFunnel ? (
            <div className="rounded-2xl p-4 mt-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                {referralReferredGuestFunnel.summary}
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mt-4">
                {[
                  { label: 'Captured', value: referralReferredGuestFunnel.capturedCount, sub: `${referralReferredGuestFunnel.bookingRate}% booked`, accent: '#06B6D4' },
                  { label: 'Booked', value: referralReferredGuestFunnel.bookedCount, sub: `${referralReferredGuestFunnel.showUpRate}% showed up`, accent: '#F59E0B' },
                  { label: 'Showed up', value: referralReferredGuestFunnel.showedUpCount, sub: `${referralReferredGuestFunnel.paidConversionRate}% paid`, accent: '#8B5CF6' },
                  { label: 'Paid', value: referralReferredGuestFunnel.paidCount, sub: 'converted members', accent: '#10B981' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl p-4" style={{ background: 'var(--subtle)' }}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                    <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
                    <div className="text-[11px] mt-1" style={{ color: item.accent }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-3 mt-4">
            {referralReferredGuests.slice(0, 6).map((guest: any) => {
              const stageTone = REFERRAL_CAPTURED_GUEST_STYLES[guest.stage] || REFERRAL_CAPTURED_GUEST_STYLES.captured
              const remediation = buildReferredGuestFollowUpPrompt({
                guestName: guest.name,
                stage: guest.stage,
                sourceOfferName: guest.sourceOfferName,
                sourceLane: guest.sourceLane,
                sourceRouteDescriptor: guest.sourceRouteDescriptor,
                guestOfferName: guest.guestOfferName,
                guestDestinationDescriptor: guest.guestDestinationDescriptor,
                nextBestMove: guest.nextBestMove,
              })

              return (
                <div key={guest.userId} className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{guest.name}</div>
                      <div className="text-xs mt-1.5" style={{ color: stageTone.color, lineHeight: 1.6 }}>
                        {stageTone.label}
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: stageTone.bg, color: stageTone.color }}>
                      {stageTone.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Membership</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: stageTone.color }}>
                        {guest.normalizedMembershipType || 'guest'}
                      </div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Source</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>
                        {guest.sourceOfferName || 'Referral'}
                      </div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Route</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>
                        {guest.guestDestinationDescriptor || guest.sourceRouteDescriptor || 'Follow-up'}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs mt-4" style={{ color: stageTone.color, fontWeight: 700 }}>{guest.stageLabel}</div>
                  <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {guest.nextBestMove}
                  </div>
                  <div className="text-[11px] mt-2" style={{ color: 'var(--t4)', lineHeight: 1.6 }}>
                    {guest.sourceRouteDescriptor ? `Referral route: ${guest.sourceRouteDescriptor}. ` : ''}
                    {guest.guestDestinationDescriptor ? `Guest route: ${guest.guestDestinationDescriptor}.` : ''}
                  </div>

                  <Link
                    href={buildAdvisorContextHref(clubId, {
                      prompt: remediation.prompt,
                      guestTrialContext: guest.guestTrialContext,
                    })}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] mt-4"
                    style={{ background: stageTone.bg, color: stageTone.color }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {remediation.label}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {referralRewardIssuanceSummary && referralRewardIssuances.length > 0 ? (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Reward issuance queue</div>
              <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                {referralRewardIssuanceSummary.summary}
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
              {referralRewardIssuanceSummary.readyCount} clean and ready
            </span>
          </div>

          <div className="grid gap-3 mt-4 md:grid-cols-5">
            {[
              { label: 'Ready', value: referralRewardIssuanceSummary.readyCount, color: '#10B981' },
              { label: 'Review', value: referralRewardIssuanceSummary.reviewCount, color: '#F59E0B' },
              { label: 'Blocked', value: referralRewardIssuanceSummary.blockedCount, color: '#EF4444' },
              { label: 'On hold', value: referralRewardIssuanceSummary.holdCount, color: '#F59E0B' },
              { label: 'Issued', value: referralRewardIssuanceSummary.issuedCount, color: '#3B82F6' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
                <div className="text-[11px] mt-1" style={{ color: item.color }}>identity-backed rewards</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-2 mt-4">
            {referralRewardIssuances.slice(0, 6).map((issuance: any) => {
              const tone = REFERRAL_REWARD_ISSUANCE_STYLES[issuance.status] || REFERRAL_REWARD_ISSUANCE_STYLES.ready_issue
              const guardrailTone = REFERRAL_REWARD_GUARDRAIL_STYLES[issuance.guardrailStatus] || REFERRAL_REWARD_GUARDRAIL_STYLES.clean
              const isBusy = activeReferralRewardIssuanceKey === issuance.key && isRewardIssuancePending
              return (
                <div key={issuance.key} className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                        {issuance.advocateName} → {issuance.referredGuestName}
                      </div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                        {issuance.rewardLabel} via {issuance.offerName}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: tone.bg, color: tone.color }}>
                        {tone.label}
                      </span>
                      <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: guardrailTone.bg, color: guardrailTone.color }}>
                        {guardrailTone.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--heading)' }}>
                      {issuance.offerName}
                    </span>
                    {issuance.destinationDescriptor ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold" style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}>
                        {issuance.destinationDescriptor}
                      </span>
                    ) : null}
                    {issuance.autoIssueSuggested ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
                        Issue now suggested
                      </span>
                    ) : null}
                    {issuance.duplicateRisk ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold" style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
                        Duplicate risk
                      </span>
                    ) : null}
                    {issuance.abuseRisk ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                        Abuse risk
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {issuance.summary}
                  </div>
                  <div className="text-xs mt-2 leading-relaxed" style={{ color: guardrailTone.color, fontWeight: 700 }}>
                    {issuance.guardrailSummary}
                  </div>
                  <div className="text-xs mt-2 leading-relaxed" style={{ color: tone.color, fontWeight: 700 }}>
                    {issuance.nextBestMove}
                  </div>
                  {issuance.guardrailReasons?.length ? (
                    <div className="mt-3 space-y-1">
                      {issuance.guardrailReasons.map((reason: string) => (
                        <div key={reason} className="text-[10px]" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                          • {reason}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 mt-4">
                    {issuance.status !== 'issued' ? (
                      <button
                        onClick={() => onUpdateReferralRewardIssuance(issuance, 'issued')}
                        disabled={isBusy || issuance.guardrailStatus === 'blocked'}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] disabled:opacity-60"
                        style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        {issuance.autoIssueSuggested ? 'Mark issued' : 'Issue after review'}
                      </button>
                    ) : (
                      <button
                        onClick={() => onUpdateReferralRewardIssuance(issuance, 'ready_issue')}
                        disabled={isBusy}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] disabled:opacity-60"
                        style={{ background: 'rgba(59,130,246,0.14)', color: '#3B82F6' }}
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                        Reopen
                      </button>
                    )}

                    {issuance.status !== 'on_hold' ? (
                      <button
                        onClick={() => onUpdateReferralRewardIssuance(issuance, 'on_hold')}
                        disabled={isBusy}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] disabled:opacity-60"
                        style={{ background: 'rgba(245,158,11,0.14)', color: '#F59E0B' }}
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock3 className="w-3.5 h-3.5" />}
                        Hold
                      </button>
                    ) : (
                      <button
                        onClick={() => onUpdateReferralRewardIssuance(issuance, 'ready_issue')}
                        disabled={isBusy}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] disabled:opacity-60"
                        style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Ready again
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {referralRewardLedger.length > 0 ? (
            <div className="rounded-2xl p-4 mt-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Advocate reward ledger</div>
                  <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.7 }}>
                    Reward state is rolled up by advocate so operators can spot clean issuance lanes, review-heavy cases and repeat reward volume fast.
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>
                  {referralRewardLedger.length} advocates tracked
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {referralRewardLedger.slice(0, 6).map((entry: any) => (
                  <div key={entry.advocateUserId} className="rounded-2xl p-4" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{entry.advocateName}</div>
                        <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                          {entry.lastRewardLabel ? `${entry.lastRewardLabel}${entry.lastGuestName ? ` for ${entry.lastGuestName}` : ''}` : 'No issued rewards yet'}
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--heading)' }}>
                        {entry.totalRewards} tracked rewards
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-2 mt-3">
                      {[
                        { label: 'Ready', value: entry.readyCount, color: '#10B981' },
                        { label: 'Review', value: entry.reviewCount, color: '#F59E0B' },
                        { label: 'Blocked', value: entry.blockedCount, color: '#EF4444' },
                        { label: 'Hold', value: entry.holdCount, color: '#F59E0B' },
                        { label: 'Issued', value: entry.issuedCount, color: '#3B82F6' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl px-2 py-2 text-center" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                          <div className="text-[10px]" style={{ color: 'var(--t4)', fontWeight: 600 }}>{item.label}</div>
                          <div className="text-sm mt-1" style={{ color: item.color, fontWeight: 800 }}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="text-xs mt-3" style={{ color: 'var(--t3)', lineHeight: 1.7 }}>
                      {entry.summary}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {referralLaneLoop.length > 0 ? (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Referral lane loop</div>
              <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                Each referral lane has its own health lens, so you can see where social momentum is strong and where the bring-a-friend ask still needs work.
              </div>
            </div>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
            >
              {referralLaneLoop.length} tracked lanes
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-3 mt-4">
            {referralLaneLoop.map((lane: any) => {
              const tone = REFERRAL_LANE_STYLES[lane.status] || REFERRAL_LANE_STYLES.watch
              const remediation = {
                label: lane.status === 'watch' || lane.status === 'at_risk'
                  ? lane.lane === 'vip_advocate'
                    ? 'Tighten VIP advocate ask'
                    : lane.lane === 'social_regular'
                      ? 'Tighten friend invite ask'
                      : 'Refine dormant advocate restart'
                  : lane.lane === 'vip_advocate'
                    ? 'Refine VIP advocate ask'
                    : lane.lane === 'social_regular'
                      ? 'Refine friend invite ask'
                      : 'Refine dormant advocate restart',
                prompt: lane.lane === 'vip_advocate'
                  ? `Rework the VIP advocate referral campaign. The "${lane.title}" lane is running at ${lane.rate}% (${lane.outcomeCount}/${lane.baseCount}) with ${lane.candidateCount} members in scope. Keep the ask premium, social, and low-friction, then show me the first review-ready version.`
                  : lane.lane === 'social_regular'
                    ? `Rework the social regular referral campaign. The "${lane.title}" lane is running at ${lane.rate}% (${lane.outcomeCount}/${lane.baseCount}) with ${lane.candidateCount} members in scope. Make the bring-a-friend ask simpler and more natural, then keep the first draft review-ready.`
                    : `Rework the dormant advocate referral restart. The "${lane.title}" lane is running at ${lane.rate}% (${lane.outcomeCount}/${lane.baseCount}) with ${lane.candidateCount} members in scope. Rebuild the relationship first, then stage the referral ask safely, and keep the first version review-ready.`,
              }
              return (
                <div key={lane.key} className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{lane.title}</div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>{lane.outcomeLabel}</div>
                    </div>
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: tone.bg, color: tone.color }}>
                      {tone.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>In lane</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{lane.candidateCount}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Outcome</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{lane.outcomeCount}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Rate</div>
                      <div className="text-lg font-semibold mt-1" style={{ color: tone.color }}>{lane.rate}%</div>
                    </div>
                  </div>

                  <div className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {lane.summary}
                  </div>

                  <Link
                    href={buildAdvisorContextHref(clubId, { prompt: remediation.prompt })}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] mt-4"
                    style={{ background: tone.bg, color: tone.color }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {remediation.label}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-3">
        {referralPlays.map((play: any) => (
          <Link
            key={play.key}
            href={play.href}
            className="rounded-2xl p-4 transition-all hover:-translate-y-[2px]"
            style={{
              background: play.tone.bg,
              border: `1px solid ${play.tone.border}`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{play.title}</div>
                <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t2)' }}>
                  {play.description}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 shrink-0" style={{ color: play.tone.color }} />
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <span
                className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}
              >
                {play.count} members
              </span>
              <span
                className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.08)', color: play.tone.color }}
              >
                {play.draftCount} related drafts
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
