import { z } from 'zod'
import type {
  ReferralOffer,
  ReferralOfferDestinationType,
  ReferralOfferKind,
  ReferralOfferLane,
  ReferralOfferSettings,
} from '@/types/intelligence'

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

function normalizeReferralOffer(value: unknown): ReferralOffer | null {
  const record = toRecord(value)
  const key = typeof record.key === 'string' ? record.key.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!key || !name) return null

  const kind = (() => {
    const raw = record.kind
    if (
      raw === 'bring_a_friend'
      || raw === 'vip_guest_pass'
      || raw === 'trial_invite'
      || raw === 'reward_credit'
      || raw === 'guest_pass'
    ) {
      return raw
    }
    return 'bring_a_friend'
  })()

  const lane = (() => {
    const raw = record.lane
    if (
      raw === 'vip_advocate'
      || raw === 'social_regular'
      || raw === 'dormant_advocate'
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
    lane,
    rewardLabel: typeof record.rewardLabel === 'string' ? record.rewardLabel.trim() : null,
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

export function resolveReferralOffers(automationSettings?: unknown): ReferralOfferSettings {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const rawOffers = toRecord(intelligence.referralOffers)
  const offers = Array.isArray(rawOffers.offers) ? rawOffers.offers : []

  return {
    offers: offers
      .map((offer) => normalizeReferralOffer(offer))
      .filter((offer): offer is ReferralOffer => Boolean(offer)),
  }
}

export interface ResolvedReferralOffer extends ReferralOffer {
  generated?: boolean
  descriptor: string
  destinationDescriptor: string
}

export interface ReferralOfferAttribution {
  offerKey: string
  offerName: string
  offerLane: ReferralOfferLane
  offerKind: ReferralOfferKind
  destinationType: ReferralOfferDestinationType
  destinationDescriptor: string
  routeKey: string
  inferred: boolean
  matchedSignals: string[]
  advocateUserId?: string | null
  advocateName?: string | null
  advocateEmail?: string | null
}

export const referralExecutionContextSchema = z.object({
  source: z.literal('referral_engine').default('referral_engine'),
  lane: z.enum(['vip_advocate', 'social_regular', 'dormant_advocate']),
  offerKey: z.string().min(1).max(120),
  offerName: z.string().min(1).max(160),
  offerKind: z.enum(['bring_a_friend', 'vip_guest_pass', 'trial_invite', 'reward_credit', 'guest_pass']),
  destinationType: z.enum(['schedule', 'landing_page', 'external_url', 'manual_follow_up']),
  destinationDescriptor: z.string().min(1).max(240),
  routeKey: z.string().min(1).max(320),
  advocateUserId: z.string().uuid().optional().nullable(),
  advocateName: z.string().min(1).max(160).optional().nullable(),
  advocateEmail: z.string().email().max(320).optional().nullable(),
})

export type ReferralExecutionContext = z.infer<typeof referralExecutionContextSchema>

export function parseReferralExecutionContext(value: unknown): ReferralExecutionContext | null {
  if (!value) return null

  let candidate: unknown = value
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value)
    } catch {
      return null
    }
  }

  const parsed = referralExecutionContextSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

export function buildReferralOfferAttributionFromContext(
  context: ReferralExecutionContext,
): ReferralOfferAttribution {
  return {
    offerKey: context.offerKey,
    offerName: context.offerName,
    offerLane: context.lane,
    offerKind: context.offerKind,
    destinationType: context.destinationType,
    destinationDescriptor: context.destinationDescriptor,
    routeKey: context.routeKey,
    inferred: false,
    matchedSignals: ['structured_context'],
    advocateUserId: context.advocateUserId || null,
    advocateName: context.advocateName || null,
    advocateEmail: context.advocateEmail || null,
  }
}

export function formatReferralLaneLabel(lane: ReferralOfferLane) {
  if (lane === 'vip_advocate') return 'VIP advocate'
  if (lane === 'social_regular') return 'Social regular'
  if (lane === 'dormant_advocate') return 'Dormant advocate'
  return 'Referral'
}

export function describeReferralExecutionContext(
  context: ReferralExecutionContext,
  opts?: { includeLane?: boolean },
) {
  const descriptor = `${context.offerName} -> ${context.destinationDescriptor}`
  if (opts?.includeLane === false) return descriptor
  return `${formatReferralLaneLabel(context.lane)} · ${descriptor}`
}

export function appendReferralExecutionContextSummary(
  summary: string,
  context?: ReferralExecutionContext | null,
  maxLength: number = 240,
) {
  if (!context) return summary
  const suffix = describeReferralExecutionContext(context)
  const combined = `${summary} · ${suffix}`
  if (combined.length <= maxLength) return combined

  const fallbackSuffix = `${formatReferralLaneLabel(context.lane)} · ${context.offerName}`
  const fallback = `${summary} · ${fallbackSuffix}`
  if (fallback.length <= maxLength) return fallback

  return summary
}

export function describeReferralOffer(
  offer?: Pick<ReferralOffer, 'name' | 'rewardLabel'> | null,
) {
  if (!offer) return ''
  return offer.rewardLabel ? `${offer.name} (${offer.rewardLabel})` : offer.name
}

function getDefaultDestinationForLane(lane: ReferralOfferLane): {
  type: ReferralOfferDestinationType
  label: string
  notes: string | null
} {
  if (lane === 'vip_advocate') {
    return {
      type: 'landing_page',
      label: 'VIP referral landing page',
      notes: 'Make the invite feel premium, easy, and social.',
    }
  }

  if (lane === 'dormant_advocate') {
    return {
      type: 'manual_follow_up',
      label: 'comeback + referral follow-up flow',
      notes: 'Restart the relationship first, then stage the referral ask.',
    }
  }

  return {
    type: 'schedule',
    label: 'bring-a-friend booking path',
    notes: 'Send them straight into the easiest friend-invite booking route.',
  }
}

export function describeReferralOfferDestination(
  offer?: Pick<
    ReferralOffer,
    'lane' | 'destinationType' | 'destinationLabel' | 'destinationUrl' | 'destinationNotes'
  > | null,
) {
  if (!offer) return ''

  const fallback = getDefaultDestinationForLane(offer.lane || 'any')
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

export function inferReferralOfferAttribution(input: {
  automationSettings?: unknown
  subject?: string | null
  body?: string | null
  smsBody?: string | null
  source?: string | null
}): ReferralOfferAttribution | null {
  const haystack = normalizeText([
    input.subject,
    input.body,
    input.smsBody,
    input.source,
  ].filter(Boolean).join(' '))

  if (!haystack) return null

  const offers = resolveReferralOffers(input.automationSettings).offers
    .filter((offer) => offer.active !== false)
    .map((offer) => {
      const descriptor = describeReferralOffer(offer)
      const destinationDescriptor = describeReferralOfferDestination(offer)
      const destinationType = offer.destinationType || getDefaultDestinationForLane(offer.lane).type
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
      { label: 'reward label', value: offer.rewardLabel, weight: 18 },
      { label: 'summary', value: offer.summary, weight: 16 },
      { label: 'cta label', value: offer.ctaLabel, weight: 14 },
      { label: 'destination label', value: offer.destinationLabel, weight: 34 },
      { label: 'destination descriptor', value: offer.destinationDescriptor, weight: 24 },
      { label: 'destination notes', value: offer.destinationNotes, weight: 12 },
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

    if (offer.lane !== 'any' && matchedSignals.length > 0) {
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
    offerLane: best.offer.lane,
    offerKind: best.offer.kind,
    destinationType: best.offer.destinationType,
    destinationDescriptor: best.offer.destinationDescriptor,
    routeKey: `${best.offer.destinationType}:${best.offer.destinationDescriptor}`,
    inferred: true,
    matchedSignals: best.matchedSignals,
  }
}

function laneWeight(offerLane: ReferralOfferLane, requestedLane: ReferralOfferLane) {
  if (offerLane === requestedLane) return 40
  if (offerLane === 'any') return 18
  return 0
}

function kindWeight(kind: ReferralOfferKind, requestedLane: ReferralOfferLane) {
  if (requestedLane === 'vip_advocate') {
    if (kind === 'vip_guest_pass') return 34
    if (kind === 'bring_a_friend') return 26
    if (kind === 'reward_credit') return 20
    return 10
  }

  if (requestedLane === 'dormant_advocate') {
    if (kind === 'reward_credit') return 32
    if (kind === 'trial_invite') return 24
    if (kind === 'bring_a_friend') return 18
    return 10
  }

  if (kind === 'bring_a_friend') return 34
  if (kind === 'guest_pass') return 28
  if (kind === 'trial_invite') return 22
  return 12
}

function makeFallbackOffer(lane: ReferralOfferLane): ResolvedReferralOffer {
  if (lane === 'vip_advocate') {
    return {
      key: 'generated-vip-referral',
      name: 'VIP guest invite',
      kind: 'vip_guest_pass',
      lane,
      rewardLabel: 'Premium bring-a-friend invite',
      summary: 'Ask top-trust members to bring one guest into the easiest premium-friendly first visit.',
      ctaLabel: 'Invite your guest',
      destinationType: 'landing_page',
      destinationLabel: 'VIP referral landing page',
      destinationNotes: 'Keep the experience premium and low-friction.',
      active: true,
      highlight: true,
      generated: true,
      descriptor: describeReferralOffer({
        name: 'VIP guest invite',
        rewardLabel: 'Premium bring-a-friend invite',
      }),
      destinationDescriptor: describeReferralOfferDestination({
        lane,
        destinationType: 'landing_page',
        destinationLabel: 'VIP referral landing page',
        destinationNotes: 'Keep the experience premium and low-friction.',
      }),
    }
  }

  if (lane === 'dormant_advocate') {
    return {
      key: 'generated-dormant-referral',
      name: 'Comeback invite credit',
      kind: 'reward_credit',
      lane,
      rewardLabel: 'Soft comeback + invite credit',
      summary: 'Restart the relationship before asking for a referral, then give one clear comeback invite path.',
      ctaLabel: 'Restart the connection',
      destinationType: 'manual_follow_up',
      destinationLabel: 'comeback + referral follow-up flow',
      destinationNotes: 'Use a human handoff first, then reopen the referral motion.',
      active: true,
      highlight: true,
      generated: true,
      descriptor: describeReferralOffer({
        name: 'Comeback invite credit',
        rewardLabel: 'Soft comeback + invite credit',
      }),
      destinationDescriptor: describeReferralOfferDestination({
        lane,
        destinationType: 'manual_follow_up',
        destinationLabel: 'comeback + referral follow-up flow',
        destinationNotes: 'Use a human handoff first, then reopen the referral motion.',
      }),
    }
  }

  return {
    key: 'generated-social-referral',
    name: 'Bring-a-friend pass',
    kind: 'bring_a_friend',
    lane,
    rewardLabel: 'Simple guest-friendly invite',
    summary: 'Use the easiest social ask and route the invitee into the simplest first booking path.',
    ctaLabel: 'Bring a friend',
    destinationType: 'schedule',
    destinationLabel: 'bring-a-friend booking path',
    destinationNotes: 'Push the invite into the easiest social session booking route.',
    active: true,
    highlight: true,
    generated: true,
    descriptor: describeReferralOffer({
      name: 'Bring-a-friend pass',
      rewardLabel: 'Simple guest-friendly invite',
    }),
    destinationDescriptor: describeReferralOfferDestination({
      lane,
      destinationType: 'schedule',
      destinationLabel: 'bring-a-friend booking path',
      destinationNotes: 'Push the invite into the easiest social session booking route.',
    }),
  }
}

export function pickReferralOffer(input: {
  offers?: ReferralOfferSettings | null
  lane: ReferralOfferLane
}): ResolvedReferralOffer | null {
  const candidates = (input.offers?.offers || [])
    .filter((offer) => offer.active !== false)
    .filter((offer) => offer.lane === input.lane || offer.lane === 'any')
    .map((offer) => {
      const score =
        laneWeight(offer.lane, input.lane)
        + kindWeight(offer.kind, input.lane)
        + (offer.highlight ? 8 : 0)
        + (normalizeText(offer.name).includes('vip') && input.lane === 'vip_advocate' ? 4 : 0)

      return {
        ...offer,
        generated: false,
        descriptor: describeReferralOffer(offer),
        destinationDescriptor: describeReferralOfferDestination(offer),
        score,
      }
    })
    .sort((a, b) => b.score - a.score)

  if (candidates[0]) {
    const { score: _score, ...winner } = candidates[0]
    return winner
  }

  return makeFallbackOffer(input.lane)
}
