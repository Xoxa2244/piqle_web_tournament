'use client'

import {
  describeGuestTrialExecutionContext,
  formatGuestTrialStageLabel,
  type GuestTrialExecutionContext,
} from '@/lib/ai/guest-trial-offers'
import {
  describeReferralExecutionContext,
  formatReferralLaneLabel,
  type ReferralExecutionContext,
} from '@/lib/ai/referral-offers'

export function buildAdvisorContextHref(
  clubId: string,
  options: {
    prompt?: string
    conversationId?: string | null
    guestTrialContext?: GuestTrialExecutionContext | null
    referralContext?: ReferralExecutionContext | null
  },
) {
  const params = new URLSearchParams()
  if (options.conversationId) {
    params.set('conversationId', options.conversationId)
  } else if (options.prompt) {
    params.set('prompt', options.prompt)
  }
  if (options.guestTrialContext) {
    params.set('guestTrialContext', JSON.stringify(options.guestTrialContext))
  }
  if (options.referralContext) {
    params.set('referralContext', JSON.stringify(options.referralContext))
  }
  const query = params.toString()
  return `/clubs/${clubId}/intelligence/advisor${query ? `?${query}` : ''}`
}

export function buildGuestTrialExecutionContext(input: {
  stage: 'book_first_visit' | 'protect_first_show_up' | 'convert_to_paid'
  offer?: {
    key?: string | null
    name?: string | null
    kind?: string | null
    destinationType?: string | null
    destinationDescriptor?: string | null
  } | null
  referralSource?: ReferralExecutionContext | null
}): GuestTrialExecutionContext | null {
  if (!input.offer?.key || !input.offer?.name || !input.offer?.kind || !input.offer?.destinationDescriptor) return null
  if (
    input.offer.kind !== 'guest_pass'
    && input.offer.kind !== 'trial_pass'
    && input.offer.kind !== 'starter_pack'
    && input.offer.kind !== 'paid_intro'
    && input.offer.kind !== 'membership_offer'
  ) {
    return null
  }

  const destinationType = input.offer.destinationType
    || (input.stage === 'book_first_visit'
      ? 'schedule'
      : input.stage === 'protect_first_show_up'
        ? 'manual_follow_up'
        : 'landing_page')

  if (
    destinationType !== 'schedule'
    && destinationType !== 'landing_page'
    && destinationType !== 'external_url'
    && destinationType !== 'manual_follow_up'
  ) {
    return null
  }

  return {
    source: 'guest_trial_booking',
    stage: input.stage,
    offerKey: input.offer.key,
    offerName: input.offer.name,
    offerKind: input.offer.kind,
    destinationType,
    destinationDescriptor: input.offer.destinationDescriptor,
    routeKey: `${destinationType}:${input.offer.destinationDescriptor}`,
    ...(input.referralSource ? { referralSource: input.referralSource } : {}),
  }
}

export function buildReferralExecutionContext(input: {
  lane: 'vip_advocate' | 'social_regular' | 'dormant_advocate'
  offer?: {
    key?: string | null
    name?: string | null
    kind?: string | null
    destinationType?: string | null
    destinationDescriptor?: string | null
  } | null
  advocate?: {
    userId?: string | null
    name?: string | null
    email?: string | null
  } | null
}): ReferralExecutionContext | null {
  if (!input.offer?.key || !input.offer?.name || !input.offer?.kind || !input.offer?.destinationDescriptor) return null
  if (
    input.offer.kind !== 'bring_a_friend'
    && input.offer.kind !== 'vip_guest_pass'
    && input.offer.kind !== 'trial_invite'
    && input.offer.kind !== 'reward_credit'
    && input.offer.kind !== 'guest_pass'
  ) {
    return null
  }

  const destinationType = input.offer.destinationType
    || (input.lane === 'vip_advocate'
      ? 'landing_page'
      : input.lane === 'dormant_advocate'
        ? 'manual_follow_up'
        : 'schedule')

  if (
    destinationType !== 'schedule'
    && destinationType !== 'landing_page'
    && destinationType !== 'external_url'
    && destinationType !== 'manual_follow_up'
  ) {
    return null
  }

  return {
    source: 'referral_engine',
    lane: input.lane,
    offerKey: input.offer.key,
    offerName: input.offer.name,
    offerKind: input.offer.kind,
    destinationType,
    destinationDescriptor: input.offer.destinationDescriptor,
    routeKey: `${destinationType}:${input.offer.destinationDescriptor}`,
    advocateUserId: input.advocate?.userId || null,
    advocateName: input.advocate?.name || null,
    advocateEmail: input.advocate?.email || null,
  }
}

export function formatGuestTrialWorkspaceSummary(context: GuestTrialExecutionContext | null | undefined) {
  if (!context) return null
  return {
    stage: formatGuestTrialStageLabel(context.stage),
    detail: describeGuestTrialExecutionContext(context, { includeStage: false }),
  }
}

export function formatReferralWorkspaceSummary(context: ReferralExecutionContext | null | undefined) {
  if (!context) return null
  return {
    lane: formatReferralLaneLabel(context.lane),
    detail: describeReferralExecutionContext(context, { includeLane: false }),
  }
}

export function buildGrowthExecutionDisplay(args: {
  guestTrialContext?: GuestTrialExecutionContext | null
  referralContext?: ReferralExecutionContext | null
}) {
  const guestTrialWorkspaceSummary = formatGuestTrialWorkspaceSummary(args.guestTrialContext)
  const referralWorkspaceSummary = formatReferralWorkspaceSummary(args.referralContext)

  return {
    guestTrialWorkspaceSummary,
    referralWorkspaceSummary,
    guestTrialSummary: guestTrialWorkspaceSummary?.detail || null,
    referralSummary: referralWorkspaceSummary?.detail || null,
    guestTrialOutcomeSuffix: args.guestTrialContext
      ? ` · ${describeGuestTrialExecutionContext(args.guestTrialContext)}`
      : '',
    referralOutcomeSuffix: args.referralContext
      ? ` · ${describeReferralExecutionContext(args.referralContext)}`
      : '',
  }
}
