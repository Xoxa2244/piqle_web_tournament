import { z } from 'zod'
import type {
  GuestTrialOffer,
  GuestTrialOfferAudience,
  GuestTrialOfferDestinationType,
  GuestTrialOfferKind,
  GuestTrialOfferSettings,
  GuestTrialOfferStage,
} from '@/types/intelligence'
import {
  buildReferralOfferAttributionFromContext,
  formatReferralLaneLabel,
  referralExecutionContextSchema,
  type ReferralExecutionContext,
  type ReferralOfferAttribution,
} from './referral-offers'

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeText(value?: string | null) {
  return value
    ? value.toLowerCase().trim().replace(/\s+/g, ' ')
    : ''
}

function normalizeGuestTrialOffer(value: unknown): GuestTrialOffer | null {
  const record = toRecord(value)
  const key = typeof record.key === 'string' ? record.key.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!key || !name) return null

  const kind = (() => {
    const raw = record.kind
    if (
      raw === 'guest_pass'
      || raw === 'trial_pass'
      || raw === 'starter_pack'
      || raw === 'paid_intro'
      || raw === 'membership_offer'
    ) {
      return raw
    }
    return 'paid_intro'
  })()

  const audience = (() => {
    const raw = record.audience
    if (raw === 'guest' || raw === 'trial' || raw === 'either') return raw
    return 'either'
  })()

  const stage = (() => {
    const raw = record.stage
    if (
      raw === 'book_first_visit'
      || raw === 'protect_first_show_up'
      || raw === 'convert_to_paid'
      || raw === 'any'
    ) {
      return raw
    }
    return 'any'
  })()

  const destinationType = (() => {
    const raw = record.destinationType
    if (
      raw === 'schedule'
      || raw === 'landing_page'
      || raw === 'external_url'
      || raw === 'manual_follow_up'
    ) {
      return raw
    }
    return null
  })()

  return {
    key,
    name,
    kind,
    audience,
    stage,
    priceLabel: typeof record.priceLabel === 'string' ? record.priceLabel.trim() : null,
    durationLabel: typeof record.durationLabel === 'string' ? record.durationLabel.trim() : null,
    summary: typeof record.summary === 'string' ? record.summary.trim() : null,
    ctaLabel: typeof record.ctaLabel === 'string' ? record.ctaLabel.trim() : null,
    destinationType,
    destinationLabel: typeof record.destinationLabel === 'string' ? record.destinationLabel.trim() : null,
    destinationUrl: typeof record.destinationUrl === 'string' ? record.destinationUrl.trim() : null,
    destinationNotes: typeof record.destinationNotes === 'string' ? record.destinationNotes.trim() : null,
    active: record.active !== false,
    highlight: record.highlight === true,
  }
}

export function resolveGuestTrialOffers(automationSettings?: unknown): GuestTrialOfferSettings {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const rawOffers = toRecord(intelligence.guestTrialOffers)
  const offers = Array.isArray(rawOffers.offers) ? rawOffers.offers : []

  return {
    offers: offers
      .map((offer) => normalizeGuestTrialOffer(offer))
      .filter((offer): offer is GuestTrialOffer => Boolean(offer)),
  }
}

export interface ResolvedGuestTrialOffer extends GuestTrialOffer {
  generated?: boolean
  descriptor: string
  destinationDescriptor: string
}

export interface GuestTrialOfferAttribution {
  offerKey: string
  offerName: string
  offerStage: GuestTrialOfferStage
  offerKind: GuestTrialOfferKind
  destinationType: GuestTrialOfferDestinationType
  destinationDescriptor: string
  routeKey: string
  inferred: boolean
  matchedSignals: string[]
  referralSource?: ReferralOfferAttribution | null
}

export const guestTrialExecutionContextSchema = z.object({
  source: z.literal('guest_trial_booking').default('guest_trial_booking'),
  stage: z.enum(['book_first_visit', 'protect_first_show_up', 'convert_to_paid']),
  offerKey: z.string().min(1).max(120),
  offerName: z.string().min(1).max(160),
  offerKind: z.enum(['guest_pass', 'trial_pass', 'starter_pack', 'paid_intro', 'membership_offer']),
  destinationType: z.enum(['schedule', 'landing_page', 'external_url', 'manual_follow_up']),
  destinationDescriptor: z.string().min(1).max(240),
  routeKey: z.string().min(1).max(320),
  referralSource: referralExecutionContextSchema.optional(),
})

export type GuestTrialExecutionContext = z.infer<typeof guestTrialExecutionContextSchema>

export function parseGuestTrialExecutionContext(value: unknown): GuestTrialExecutionContext | null {
  if (!value) return null

  let candidate: unknown = value
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value)
    } catch {
      return null
    }
  }

  const parsed = guestTrialExecutionContextSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

export function buildGuestTrialOfferAttributionFromContext(
  context: GuestTrialExecutionContext,
): GuestTrialOfferAttribution {
  return {
    offerKey: context.offerKey,
    offerName: context.offerName,
    offerStage: context.stage,
    offerKind: context.offerKind,
    destinationType: context.destinationType,
    destinationDescriptor: context.destinationDescriptor,
    routeKey: context.routeKey,
    inferred: false,
    matchedSignals: ['structured_context'],
    referralSource: context.referralSource
      ? buildReferralOfferAttributionFromContext(context.referralSource)
      : null,
  }
}

export function formatGuestTrialStageLabel(stage: GuestTrialOfferStage) {
  if (stage === 'book_first_visit') return 'First visit'
  if (stage === 'protect_first_show_up') return 'Show-up'
  if (stage === 'convert_to_paid') return 'Paid conversion'
  return 'Guest / trial'
}

export function describeGuestTrialReferralSource(
  source: ReferralExecutionContext,
  opts?: { includeLane?: boolean; includeRoute?: boolean },
) {
  const laneLabel = formatReferralLaneLabel(source.lane)
  const offerLabel = opts?.includeLane === false
    ? source.offerName
    : `${laneLabel} · ${source.offerName}`
  if (opts?.includeRoute === false) return offerLabel
  return `${offerLabel} -> ${source.destinationDescriptor}`
}

export function describeGuestTrialExecutionContext(
  context: GuestTrialExecutionContext,
  opts?: { includeStage?: boolean },
) {
  const referralSuffix = context.referralSource
    ? ` · from ${describeGuestTrialReferralSource(context.referralSource, { includeRoute: false })}`
    : ''
  const descriptor = `${context.offerName} -> ${context.destinationDescriptor}${referralSuffix}`
  if (opts?.includeStage === false) return descriptor
  return `${formatGuestTrialStageLabel(context.stage)} · ${descriptor}`
}

export function appendGuestTrialExecutionContextSummary(
  summary: string,
  context?: GuestTrialExecutionContext | null,
  maxLength: number = 240,
) {
  if (!context) return summary
  const suffix = describeGuestTrialExecutionContext(context)
  const combined = `${summary} · ${suffix}`
  if (combined.length <= maxLength) return combined

  const fallbackSuffix = `${formatGuestTrialStageLabel(context.stage)} · ${context.offerName}`
  const fallback = `${summary} · ${fallbackSuffix}`
  if (fallback.length <= maxLength) return fallback

  return summary
}

export function describeGuestTrialOffer(
  offer?: Pick<GuestTrialOffer, 'name' | 'priceLabel' | 'durationLabel'> | null,
) {
  if (!offer) return ''
  const suffix = [offer.priceLabel, offer.durationLabel].filter(Boolean).join(' • ')
  return suffix ? `${offer.name} (${suffix})` : offer.name
}

function getDefaultDestinationForStage(stage: GuestTrialOfferStage): {
  type: GuestTrialOfferDestinationType
  label: string
  notes: string | null
} {
  if (stage === 'book_first_visit') {
    return {
      type: 'schedule',
      label: 'club schedule',
      notes: 'Send them straight into the easiest first-booking path.',
    }
  }

  if (stage === 'protect_first_show_up') {
    return {
      type: 'manual_follow_up',
      label: 'show-up reminder flow',
      notes: 'Reconfirm the booking and give them one obvious backup path.',
    }
  }

  return {
    type: 'landing_page',
    label: 'paid offer page',
    notes: 'Move warm guests or trials into the first paid step.',
  }
}

export function describeGuestTrialOfferDestination(
  offer?: Pick<
    GuestTrialOffer,
    'stage' | 'destinationType' | 'destinationLabel' | 'destinationUrl' | 'destinationNotes'
  > | null,
) {
  if (!offer) return ''

  const fallback = getDefaultDestinationForStage(offer.stage || 'any')
  const destinationType = offer.destinationType || fallback.type
  const destinationLabel = offer.destinationLabel || fallback.label
  const destinationNotes = offer.destinationNotes || fallback.notes

  if (destinationType === 'external_url') {
    return destinationNotes
      ? `${destinationLabel} (${destinationNotes})`
      : destinationLabel
  }

  if (destinationNotes) {
    return `${destinationLabel} (${destinationNotes})`
  }

  return destinationLabel
}

export function inferGuestTrialOfferAttribution(input: {
  automationSettings?: unknown
  subject?: string | null
  body?: string | null
  smsBody?: string | null
  source?: string | null
}) : GuestTrialOfferAttribution | null {
  const haystack = normalizeText([
    input.subject,
    input.body,
    input.smsBody,
    input.source,
  ].filter(Boolean).join(' '))

  if (!haystack) return null

  const offers = resolveGuestTrialOffers(input.automationSettings).offers
    .filter((offer) => offer.active !== false)
    .map((offer) => {
      const descriptor = describeGuestTrialOffer(offer)
      const destinationDescriptor = describeGuestTrialOfferDestination(offer)
      const destinationType = offer.destinationType || getDefaultDestinationForStage(offer.stage).type
      return {
        ...offer,
        descriptor,
        destinationDescriptor,
        destinationType,
      }
    })

  let best: {
    offer: typeof offers[number]
    score: number
    matchedSignals: string[]
  } | null = null

  for (const offer of offers) {
    let score = 0
    const matchedSignals: string[] = []
    const checks: Array<{ label: string; value: string | null | undefined; weight: number }> = [
      { label: 'offer name', value: offer.name, weight: 60 },
      { label: 'offer descriptor', value: offer.descriptor, weight: 52 },
      { label: 'price label', value: offer.priceLabel, weight: 16 },
      { label: 'duration label', value: offer.durationLabel, weight: 12 },
      { label: 'summary', value: offer.summary, weight: 16 },
      { label: 'cta label', value: offer.ctaLabel, weight: 14 },
      { label: 'destination label', value: offer.destinationLabel, weight: 34 },
      { label: 'destination descriptor', value: offer.destinationDescriptor, weight: 24 },
      { label: 'destination notes', value: offer.destinationNotes, weight: 10 },
      { label: 'destination url', value: offer.destinationUrl, weight: 24 },
      { label: 'offer key', value: offer.key, weight: 20 },
    ]

    for (const check of checks) {
      const needle = normalizeText(check.value)
      if (!needle || needle.length < 3) continue
      if (haystack.includes(needle)) {
        score += check.weight
        matchedSignals.push(check.label)
      }
    }

    if (offer.stage !== 'any' && matchedSignals.length > 0) {
      score += 8
    }

    if (!best || score > best.score) {
      best = { offer, score, matchedSignals }
    }
  }

  if (!best || best.score < 34 || best.matchedSignals.length === 0) {
    return null
  }

  return {
    offerKey: best.offer.key,
    offerName: best.offer.name,
    offerStage: best.offer.stage,
    offerKind: best.offer.kind,
    destinationType: best.offer.destinationType,
    destinationDescriptor: best.offer.destinationDescriptor,
    routeKey: `${best.offer.destinationType}:${best.offer.destinationDescriptor}`,
    inferred: true,
    matchedSignals: best.matchedSignals,
  }
}

function matchesAudience(offerAudience: GuestTrialOfferAudience, memberAudience: 'guest' | 'trial') {
  return offerAudience === 'either' || offerAudience === memberAudience
}

function stageWeight(stage: GuestTrialOfferStage, requestedStage: GuestTrialOfferStage) {
  if (stage === requestedStage) return 40
  if (stage === 'any') return 18
  return 0
}

function kindWeight(kind: GuestTrialOfferKind, requestedStage: GuestTrialOfferStage, memberAudience: 'guest' | 'trial') {
  if (requestedStage === 'convert_to_paid') {
    if (kind === 'paid_intro') return 34
    if (kind === 'starter_pack') return 28
    if (kind === 'membership_offer') return 24
    return 8
  }

  if (memberAudience === 'trial') {
    if (kind === 'trial_pass') return 34
    if (kind === 'starter_pack') return 22
    if (kind === 'guest_pass') return 16
    return 10
  }

  if (kind === 'guest_pass') return 34
  if (kind === 'trial_pass') return 26
  if (kind === 'starter_pack') return 18
  return 10
}

function makeFallbackOffer(input: {
  stage: GuestTrialOfferStage
  memberAudience: 'guest' | 'trial'
  pricingModel?: string | null
  avgSessionPriceCents?: number | null
}): ResolvedGuestTrialOffer {
  const priceLabel = input.avgSessionPriceCents
    ? `~$${(input.avgSessionPriceCents / 100).toFixed(0)} first step`
    : null

  if (input.stage === 'convert_to_paid') {
    if (input.pricingModel === 'membership') {
      return {
        key: 'generated-membership-offer',
        name: 'First paid membership',
        kind: 'membership_offer',
        audience: 'either',
        stage: 'convert_to_paid',
      summary: 'Move warm guests and trials into the first recurring paid tier.',
      ctaLabel: 'Start membership',
      destinationType: 'landing_page',
      destinationLabel: 'membership checkout page',
      destinationNotes: 'Show the recurring paid tier right after a positive first experience.',
      active: true,
      highlight: true,
      generated: true,
      descriptor: describeGuestTrialOffer({
        name: 'First paid membership',
        priceLabel,
        durationLabel: null,
      }),
      destinationDescriptor: describeGuestTrialOfferDestination({
        stage: 'convert_to_paid',
        destinationType: 'landing_page',
        destinationLabel: 'membership checkout page',
        destinationNotes: 'Show the recurring paid tier right after a positive first experience.',
      }),
    }
  }

    return {
      key: 'generated-starter-pack',
      name: 'Starter pack',
      kind: 'starter_pack',
      audience: 'either',
      stage: 'convert_to_paid',
      priceLabel,
      summary: 'Offer a low-friction first paid step right after the first successful visit.',
      ctaLabel: 'Unlock starter pack',
      destinationType: 'landing_page',
      destinationLabel: 'starter pack landing page',
      destinationNotes: 'Keep the paid conversion step simple and low-friction.',
      active: true,
      highlight: true,
      generated: true,
      descriptor: describeGuestTrialOffer({
        name: 'Starter pack',
        priceLabel,
        durationLabel: null,
      }),
      destinationDescriptor: describeGuestTrialOfferDestination({
        stage: 'convert_to_paid',
        destinationType: 'landing_page',
        destinationLabel: 'starter pack landing page',
        destinationNotes: 'Keep the paid conversion step simple and low-friction.',
      }),
    }
  }

  const fallbackName = input.memberAudience === 'trial' ? 'Trial pass' : 'Guest pass'
  const fallbackDestination = input.stage === 'protect_first_show_up'
    ? {
        destinationType: 'manual_follow_up' as const,
        destinationLabel: 'show-up reminder flow',
        destinationNotes: 'Protect the first booking with reminders and one easy backup path.',
      }
    : {
        destinationType: 'schedule' as const,
        destinationLabel: 'club schedule',
        destinationNotes: 'Push them into the easiest first-booking flow.',
      }
  return {
    key: input.memberAudience === 'trial' ? 'generated-trial-pass' : 'generated-guest-pass',
    name: fallbackName,
    kind: input.memberAudience === 'trial' ? 'trial_pass' : 'guest_pass',
    audience: input.memberAudience,
    stage: input.stage,
    priceLabel,
    summary: 'Use the easiest first-entry offer to get the first booking locked in.',
    ctaLabel: input.memberAudience === 'trial' ? 'Activate trial' : 'Book first visit',
    destinationType: fallbackDestination.destinationType,
    destinationLabel: fallbackDestination.destinationLabel,
    destinationNotes: fallbackDestination.destinationNotes,
    active: true,
    highlight: true,
    generated: true,
    descriptor: describeGuestTrialOffer({
      name: fallbackName,
      priceLabel,
      durationLabel: null,
    }),
    destinationDescriptor: describeGuestTrialOfferDestination({
      stage: input.stage,
      destinationType: fallbackDestination.destinationType,
      destinationLabel: fallbackDestination.destinationLabel,
      destinationNotes: fallbackDestination.destinationNotes,
    }),
  }
}

export function pickGuestTrialOffer(input: {
  offers?: GuestTrialOfferSettings | null
  stage: GuestTrialOfferStage
  normalizedMembershipType?: string | null
  normalizedMembershipStatus?: string | null
  pricingModel?: string | null
  avgSessionPriceCents?: number | null
}): ResolvedGuestTrialOffer | null {
  const memberAudience: 'guest' | 'trial' = (
    input.normalizedMembershipType === 'trial' || input.normalizedMembershipStatus === 'trial'
  )
    ? 'trial'
    : 'guest'

  const candidates = (input.offers?.offers || [])
    .filter((offer) => offer.active !== false)
    .filter((offer) => matchesAudience(offer.audience, memberAudience))
    .map((offer) => {
      const score =
        stageWeight(offer.stage, input.stage)
        + kindWeight(offer.kind, input.stage, memberAudience)
        + (offer.highlight ? 8 : 0)
        + (normalizeText(offer.name).includes('intro') ? 2 : 0)

      return {
        ...offer,
        generated: false,
        descriptor: describeGuestTrialOffer(offer),
        destinationDescriptor: describeGuestTrialOfferDestination(offer),
        score,
      }
    })
    .sort((a, b) => b.score - a.score)

  if (candidates[0]) {
    const { score: _score, ...winner } = candidates[0]
    return winner
  }

  return makeFallbackOffer({
    stage: input.stage,
    memberAudience,
    pricingModel: input.pricingModel,
    avgSessionPriceCents: input.avgSessionPriceCents,
  })
}
