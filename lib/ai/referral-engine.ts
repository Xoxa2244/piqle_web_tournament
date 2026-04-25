import { normalizeMembership, resolveMembershipMappings } from './membership-intelligence'
import {
  pickReferralOffer,
  resolveReferralOffers,
  type ResolvedReferralOffer,
} from './referral-offers'

export type ReferralLane = 'vip_advocate' | 'social_regular' | 'dormant_advocate'
export type ReferralUrgency = 'low' | 'medium' | 'high'
export type ReferralOutcomeHealth = 'idle' | 'healthy' | 'watch' | 'at_risk'
export type ReferralRewardStatus = 'quiet' | 'in_flight' | 'ready_review'
export type ReferralRewardIssuanceStatus = 'ready_issue' | 'on_hold' | 'issued'
export type ReferralRewardGuardrailStatus = 'clean' | 'review' | 'blocked'

const ASK_EQUIVALENT_STATUSES = new Set([
  'sent',
  'delivered',
  'opened',
  'clicked',
  'converted',
  'failed',
  'bounced',
  'spam',
])
const DELIVERED_EQUIVALENT_STATUSES = new Set(['delivered', 'opened', 'clicked', 'converted'])
const OPENED_EQUIVALENT_STATUSES = new Set(['opened', 'clicked', 'converted'])
const CLICKED_EQUIVALENT_STATUSES = new Set(['clicked', 'converted'])
const FAILED_EQUIVALENT_STATUSES = new Set(['failed', 'bounced', 'spam'])

export interface ReferralRow {
  userId: string
  followedAt: string | Date | null
  userCreatedAt: string | Date | null
  name: string | null
  email: string | null
  membershipType: string | null
  membershipStatus: string | null
  firstConfirmedBookingAt: string | Date | null
  lastConfirmedBookingAt: string | Date | null
  confirmedBookings: number | string | null
  recentConfirmedBookings: number | string | null
  activeCoPlayers: number | string | null
  totalCoPlayers: number | string | null
}

export interface ReferralOutcomeRow {
  id?: string | null
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
  status?: string | null
  createdAt?: string | Date | null
  openedAt?: string | Date | null
  clickedAt?: string | Date | null
  respondedAt?: string | Date | null
  deliveredAt?: string | Date | null
  bouncedAt?: string | Date | null
  reasoning?: unknown
  referralOfferKey?: string | null
  referralOfferName?: string | null
  referralOfferLane?: string | null
  referralDestinationDescriptor?: string | null
  referralDestinationType?: string | null
  referralRouteKey?: string | null
}

export interface ReferralCapturedGuestRow {
  userId: string
  name: string | null
  email: string | null
  membershipType: string | null
  membershipStatus: string | null
  nextBookedSessionAt: string | Date | null
  firstPlayedAt: string | Date | null
  lastPlayedAt: string | Date | null
  confirmedBookings: number | string | null
  playedConfirmedBookings: number | string | null
}

export interface ReferralRewardIssuanceRow {
  advocateUserId: string
  referredGuestUserId: string
  offerKey: string
  status: 'READY' | 'ON_HOLD' | 'ISSUED' | string
  issuedAt?: string | Date | null
  reviewedAt?: string | Date | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  advocateUser?: {
    id: string
    name: string | null
    email: string | null
  } | null
  referredGuestUser?: {
    id: string
    name: string | null
    email: string | null
  } | null
}

export type ReferralCapturedGuestStage =
  | 'captured'
  | 'booked_first_visit'
  | 'showed_up'
  | 'converted_to_paid'

export interface ReferralCapturedGuest {
  guestUserId: string
  name: string
  email: string | null
  advocateUserId: string | null
  advocateName: string | null
  advocateEmail: string | null
  stage: ReferralCapturedGuestStage
  stageLabel: string
  capturedAt: string | Date | null
  lastTouchAt: string | Date | null
  confirmedBookings: number
  playedConfirmedBookings: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  sourceOfferName: string | null
  sourceLane: ReferralLane | null
  sourceRouteDescriptor: string | null
  guestOfferName: string | null
  guestStage: 'book_first_visit' | 'protect_first_show_up' | 'convert_to_paid' | null
  guestDestinationDescriptor: string | null
  guestDestinationType: string | null
  guestTrialContext: {
    source: 'guest_trial_booking'
    stage: 'book_first_visit' | 'protect_first_show_up' | 'convert_to_paid'
    offerKey: string
    offerName: string
    offerKind: 'guest_pass' | 'trial_pass' | 'starter_pack' | 'paid_intro' | 'membership_offer'
    destinationType: 'schedule' | 'landing_page' | 'external_url' | 'manual_follow_up'
    destinationDescriptor: string
    routeKey: string
    referralSource?: {
      source: 'referral_engine'
      lane: ReferralLane
      offerKey: string
      offerName: string
      destinationType: 'landing_page' | 'schedule' | 'external_url' | 'manual_follow_up'
      destinationDescriptor: string
      routeKey: string
      advocateUserId?: string | null
      advocateName?: string | null
      advocateEmail?: string | null
    } | null
  } | null
  nextBestMove: string
}

export interface ReferralRewardIssuanceCandidate {
  key: string
  advocateUserId: string
  advocateName: string
  advocateEmail: string | null
  referredGuestUserId: string
  referredGuestName: string
  referredGuestEmail: string | null
  offerKey: string
  offerName: string
  rewardLabel: string
  lane: ReferralLane
  destinationDescriptor: string | null
  status: ReferralRewardIssuanceStatus
  guardrailStatus: ReferralRewardGuardrailStatus
  guardrailReasons: string[]
  guardrailSummary: string
  autoIssueSuggested: boolean
  duplicateRisk: boolean
  abuseRisk: boolean
  issuedAt: string | Date | null
  reviewedAt: string | Date | null
  updatedAt: string | Date | null
  summary: string
  nextBestMove: string
}

export interface ReferralRewardAdvocateLedgerEntry {
  advocateUserId: string
  advocateName: string
  advocateEmail: string | null
  totalRewards: number
  readyCount: number
  reviewCount: number
  blockedCount: number
  holdCount: number
  issuedCount: number
  lastRewardLabel: string | null
  lastGuestName: string | null
  lastUpdatedAt: string | Date | null
  summary: string
}

export interface ReferralCandidate {
  memberId: string
  name: string
  email: string | null
  score: number
  lane: ReferralLane
  urgency: ReferralUrgency
  daysSinceLastBooking: number
  confirmedBookings: number
  recentConfirmedBookings: number
  activeCoPlayers: number
  totalCoPlayers: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  recommendedOffer?: ResolvedReferralOffer | null
  topReason: string
  nextBestMove: string
}

export interface ReferralSnapshot {
  summary: {
    totalCandidates: number
    vipAdvocateCount: number
    socialRegularCount: number
    dormantAdvocateCount: number
    averageScore: number
    summary: string
    offers: {
      vipAdvocate: Pick<ResolvedReferralOffer, 'key' | 'name' | 'descriptor' | 'destinationDescriptor'> | null
      socialRegular: Pick<ResolvedReferralOffer, 'key' | 'name' | 'descriptor' | 'destinationDescriptor'> | null
      dormantAdvocate: Pick<ResolvedReferralOffer, 'key' | 'name' | 'descriptor' | 'destinationDescriptor'> | null
    }
    laneLoop: Array<{
      key: string
      lane: ReferralLane
      title: string
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    offerLoop: Array<{
      key: string
      lane: ReferralLane
      name: string
      descriptor: string
      destinationType: string
      destinationDescriptor: string
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    routeLoop: Array<{
      key: string
      destinationType: string
      destinationDescriptor: string
      laneCount: number
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      lanes: ReferralLane[]
      offerNames: string[]
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    outcomeFunnel: {
      askCount: number
      engagedCount: number
      intentCount: number
      strongSignalCount: number
      engagementRate: number
      intentRate: number
      strongSignalRate: number
      summary: string
    }
    outcomeLoop: Array<{
      key: string
      lane: ReferralLane
      title: string
      askCount: number
      engagedCount: number
      intentCount: number
      strongSignalCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: ReferralOutcomeHealth
    }>
    rewardSummary: string
    rewardLoop: Array<{
      key: string
      lane: ReferralLane
      offerName: string
      rewardLabel: string
      destinationDescriptor: string
      askCount: number
      engagedCount: number
      intentCount: number
      strongSignalCount: number
      reviewCount: number
      rate: number
      summary: string
      status: ReferralRewardStatus
    }>
    rewardIssuance: {
      readyCount: number
      reviewCount: number
      blockedCount: number
      holdCount: number
      issuedCount: number
      summary: string
    }
    referredGuestFunnel: {
      capturedCount: number
      bookedCount: number
      showedUpCount: number
      paidCount: number
      bookingRate: number
      showUpRate: number
      paidConversionRate: number
      summary: string
    }
    funnel: {
      socialReachCount: number
      activeAdvocateCount: number
      dormantAdvocateCount: number
      highConfidenceCount: number
      activeAdvocateRate: number
      referralReadyRate: number
      summary: string
    }
  }
  candidates: ReferralCandidate[]
  referredGuests: ReferralCapturedGuest[]
  rewardIssuances: ReferralRewardIssuanceCandidate[]
  rewardLedger: ReferralRewardAdvocateLedgerEntry[]
}

interface ReferralLaneSummary {
  key: string
  lane: ReferralLane
  title: string
  candidateCount: number
  outcomeCount: number
  baseCount: number
  rate: number
  outcomeLabel: string
  summary: string
  status: 'healthy' | 'watch' | 'at_risk'
}

interface ReferralOfferSummary {
  key: string
  lane: ReferralLane
  name: string
  descriptor: string
  destinationType: string
  destinationDescriptor: string
  candidateCount: number
  outcomeCount: number
  baseCount: number
  rate: number
  outcomeLabel: string
  summary: string
  status: 'healthy' | 'watch' | 'at_risk'
}

interface ReferralOutcomeLoopSummary {
  key: string
  lane: ReferralLane
  title: string
  askCount: number
  engagedCount: number
  intentCount: number
  strongSignalCount: number
  rate: number
  outcomeLabel: string
  summary: string
  status: ReferralOutcomeHealth
}

interface ReferralRewardLoopSummary {
  key: string
  lane: ReferralLane
  offerName: string
  rewardLabel: string
  destinationDescriptor: string
  askCount: number
  engagedCount: number
  intentCount: number
  strongSignalCount: number
  reviewCount: number
  rate: number
  summary: string
  status: ReferralRewardStatus
}

interface ReferralRewardIssuanceSummary {
  readyCount: number
  reviewCount: number
  blockedCount: number
  holdCount: number
  issuedCount: number
  summary: string
}

interface ReferralOutcomeMetrics {
  askCount: number
  deliveredCount: number
  engagedCount: number
  intentCount: number
  strongSignalCount: number
  failedCount: number
}

interface ReferralGuestAttribution {
  offerKey: string | null
  offerName: string | null
  offerStage: 'book_first_visit' | 'protect_first_show_up' | 'convert_to_paid' | null
  offerKind: string | null
  destinationType: string | null
  destinationDescriptor: string | null
  routeKey: string | null
  referralSource: {
    offerKey: string | null
    offerName: string | null
    offerLane: ReferralLane | null
    destinationDescriptor: string | null
    destinationType: string | null
    routeKey: string | null
    advocateUserId: string | null
    advocateName: string | null
    advocateEmail: string | null
  } | null
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toNumber(value: number | string | null | undefined) {
  return Number(value || 0)
}

function daysBetween(now: Date, earlier: Date) {
  return Math.max(0, Math.floor((now.getTime() - earlier.getTime()) / 86400000))
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function normalizeStatus(value?: string | null) {
  return (value || '').trim().toLowerCase()
}

function parseReferralLane(value: unknown): ReferralLane | null {
  return value === 'vip_advocate' || value === 'social_regular' || value === 'dormant_advocate'
    ? value
    : null
}

function createEmptyOutcomeMetrics(): ReferralOutcomeMetrics {
  return {
    askCount: 0,
    deliveredCount: 0,
    engagedCount: 0,
    intentCount: 0,
    strongSignalCount: 0,
    failedCount: 0,
  }
}

function mergeOutcomeMetrics(target: ReferralOutcomeMetrics, next: ReferralOutcomeMetrics) {
  target.askCount += next.askCount
  target.deliveredCount += next.deliveredCount
  target.engagedCount += next.engagedCount
  target.intentCount += next.intentCount
  target.strongSignalCount += next.strongSignalCount
  target.failedCount += next.failedCount
}

function getOutcomeMetricsForRow(row: ReferralOutcomeRow): ReferralOutcomeMetrics {
  const status = normalizeStatus(row.status)
  const opened = !!row.openedAt || OPENED_EQUIVALENT_STATUSES.has(status)
  const clicked = !!row.clickedAt || CLICKED_EQUIVALENT_STATUSES.has(status)
  const strongSignal = !!row.respondedAt || status === 'converted'
  const failed = !!row.bouncedAt || FAILED_EQUIVALENT_STATUSES.has(status)

  return {
    askCount: ASK_EQUIVALENT_STATUSES.has(status) ? 1 : 0,
    deliveredCount: !!row.deliveredAt || DELIVERED_EQUIVALENT_STATUSES.has(status) ? 1 : 0,
    engagedCount: opened || clicked || strongSignal ? 1 : 0,
    intentCount: clicked || strongSignal ? 1 : 0,
    strongSignalCount: strongSignal ? 1 : 0,
    failedCount: failed ? 1 : 0,
  }
}

function getOutcomeHealth(metrics: ReferralOutcomeMetrics): ReferralOutcomeHealth {
  if (metrics.askCount === 0) return 'idle'
  const intentRate = metrics.askCount > 0 ? metrics.intentCount / metrics.askCount : 0

  if (metrics.strongSignalCount > 0 || intentRate >= 0.3) return 'healthy'
  if (metrics.failedCount >= Math.max(2, Math.ceil(metrics.askCount * 0.35))) return 'at_risk'
  if (metrics.askCount >= 4 && metrics.intentCount === 0 && metrics.engagedCount === 0) return 'at_risk'
  if (metrics.intentCount > 0 || metrics.engagedCount > 0) return 'watch'
  return metrics.askCount >= 3 ? 'at_risk' : 'watch'
}

function getRewardStatus(metrics: ReferralOutcomeMetrics): ReferralRewardStatus {
  const reviewCount = metrics.strongSignalCount > 0 ? metrics.strongSignalCount : metrics.intentCount
  if (reviewCount > 0) return 'ready_review'
  if (metrics.askCount > 0 || metrics.engagedCount > 0) return 'in_flight'
  return 'quiet'
}

function parseRewardIssuanceStatus(value: unknown): ReferralRewardIssuanceStatus {
  if (value === 'ISSUED' || value === 'issued') return 'issued'
  if (value === 'ON_HOLD' || value === 'on_hold') return 'on_hold'
  return 'ready_issue'
}

function normalizeEmail(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

interface EvaluateReferralRewardGuardrailsInput {
  advocateUserId: string
  advocateEmail?: string | null
  referredGuestUserId: string
  referredGuestEmail?: string | null
  offerKey: string
  playedConfirmedBookings: number
  currentStatus?: ReferralRewardIssuanceStatus | null
  existingRows: ReferralRewardIssuanceRow[]
}

export function evaluateReferralRewardGuardrails(input: EvaluateReferralRewardGuardrailsInput) {
  const currentStatus = input.currentStatus || 'ready_issue'
  const samePairOtherOfferRows = input.existingRows.filter((row) =>
    row.advocateUserId === input.advocateUserId
      && row.referredGuestUserId === input.referredGuestUserId
      && row.offerKey !== input.offerKey,
  )
  const sameGuestOtherAdvocateRows = input.existingRows.filter((row) =>
    row.referredGuestUserId === input.referredGuestUserId
      && row.advocateUserId !== input.advocateUserId,
  )

  const duplicateRisk = samePairOtherOfferRows.length > 0 || sameGuestOtherAdvocateRows.length > 0
  const selfReferral =
    input.advocateUserId === input.referredGuestUserId
    || (
      !!normalizeEmail(input.advocateEmail)
      && normalizeEmail(input.advocateEmail) === normalizeEmail(input.referredGuestEmail)
    )
  const weakEvidence = input.playedConfirmedBookings < 1
  const alreadyIssuedElsewhere = samePairOtherOfferRows.some((row) => parseRewardIssuanceStatus(row.status) === 'issued')
    || sameGuestOtherAdvocateRows.some((row) => parseRewardIssuanceStatus(row.status) === 'issued')

  const guardrailReasons: string[] = []
  if (selfReferral) {
    guardrailReasons.push('Advocate and referred guest resolve to the same identity or email.')
  }
  if (alreadyIssuedElsewhere) {
    guardrailReasons.push('A reward has already been issued for this referred guest through another referral claim.')
  } else if (sameGuestOtherAdvocateRows.length > 0) {
    guardrailReasons.push('Another advocate is already linked to reward tracking for this referred guest.')
  } else if (samePairOtherOfferRows.length > 0) {
    guardrailReasons.push('This advocate and guest already have reward tracking under another referral offer.')
  }
  if (weakEvidence) {
    guardrailReasons.push('The referred guest converted to paid without a recorded attended session yet.')
  }

  const abuseRisk = selfReferral || alreadyIssuedElsewhere || sameGuestOtherAdvocateRows.length > 0
  const blocked = selfReferral || alreadyIssuedElsewhere || sameGuestOtherAdvocateRows.length > 0
  const review = !blocked && (samePairOtherOfferRows.length > 0 || weakEvidence)
  const guardrailStatus: ReferralRewardGuardrailStatus = blocked
    ? 'blocked'
    : review
      ? 'review'
      : 'clean'

  const autoIssueSuggested = currentStatus !== 'issued' && guardrailStatus === 'clean'
  const guardrailSummary = guardrailStatus === 'clean'
    ? 'Clean reward candidate: identity, conversion evidence and duplicate checks all look safe.'
    : guardrailStatus === 'review'
      ? `Needs operator review before issuing: ${guardrailReasons.join(' ')}`
      : `Blocked until resolved: ${guardrailReasons.join(' ')}`

  return {
    guardrailStatus,
    guardrailReasons,
    guardrailSummary,
    autoIssueSuggested,
    duplicateRisk,
    abuseRisk,
    blocked,
    review,
  }
}

function getReferralLaneTitle(lane: ReferralLane) {
  if (lane === 'vip_advocate') return 'VIP advocate ask'
  if (lane === 'social_regular') return 'Social regular referral ask'
  return 'Dormant advocate restart'
}

function getReferralAttribution(row: ReferralOutcomeRow) {
  const reasoning = toRecord(row.reasoning)
  const attribution = toRecord(reasoning.referralAttribution)

  const offerKey = typeof row.referralOfferKey === 'string'
    ? row.referralOfferKey
    : typeof attribution.offerKey === 'string'
      ? attribution.offerKey
      : null
  const offerName = typeof row.referralOfferName === 'string'
    ? row.referralOfferName
    : typeof attribution.offerName === 'string'
      ? attribution.offerName
      : null
  const offerLane = parseReferralLane(
    typeof row.referralOfferLane === 'string' ? row.referralOfferLane : attribution.offerLane,
  )
  const destinationDescriptor = typeof row.referralDestinationDescriptor === 'string'
    ? row.referralDestinationDescriptor
    : typeof attribution.destinationDescriptor === 'string'
      ? attribution.destinationDescriptor
      : null
  const destinationType = typeof row.referralDestinationType === 'string'
    ? row.referralDestinationType
    : typeof attribution.destinationType === 'string'
      ? attribution.destinationType
      : null
  const routeKey = typeof row.referralRouteKey === 'string'
    ? row.referralRouteKey
    : typeof attribution.routeKey === 'string'
      ? attribution.routeKey
      : destinationDescriptor

  if (!offerKey && !offerLane && !routeKey && !destinationDescriptor) return null

  return {
    offerKey,
    offerName,
    offerLane,
    destinationDescriptor,
    destinationType,
    routeKey,
  }
}

function getReferredGuestAttribution(row: ReferralOutcomeRow): ReferralGuestAttribution | null {
  const reasoning = toRecord(row.reasoning)
  const attribution = toRecord(reasoning.guestTrialAttribution)
  const referralSource = toRecord(attribution.referralSource)

  const offerKey = typeof attribution.offerKey === 'string' ? attribution.offerKey : null
  const offerName = typeof attribution.offerName === 'string' ? attribution.offerName : null
  const offerStage = (
    attribution.offerStage === 'book_first_visit'
    || attribution.offerStage === 'protect_first_show_up'
    || attribution.offerStage === 'convert_to_paid'
  )
    ? attribution.offerStage
    : null
  const offerKind = typeof attribution.offerKind === 'string' ? attribution.offerKind : null
  const destinationType = typeof attribution.destinationType === 'string' ? attribution.destinationType : null
  const destinationDescriptor = typeof attribution.destinationDescriptor === 'string'
    ? attribution.destinationDescriptor
    : null
  const routeKey = typeof attribution.routeKey === 'string'
    ? attribution.routeKey
    : destinationDescriptor

  const sourceLane = parseReferralLane(referralSource.offerLane)
  const sourceOfferKey = typeof referralSource.offerKey === 'string' ? referralSource.offerKey : null
  const sourceOfferName = typeof referralSource.offerName === 'string' ? referralSource.offerName : null
  const sourceDestinationDescriptor = typeof referralSource.destinationDescriptor === 'string'
    ? referralSource.destinationDescriptor
    : null
  const sourceDestinationType = typeof referralSource.destinationType === 'string'
    ? referralSource.destinationType
    : null
  const sourceRouteKey = typeof referralSource.routeKey === 'string'
    ? referralSource.routeKey
    : sourceDestinationDescriptor
  const sourceAdvocateUserId = typeof referralSource.advocateUserId === 'string'
    ? referralSource.advocateUserId
    : null
  const sourceAdvocateName = typeof referralSource.advocateName === 'string'
    ? referralSource.advocateName
    : null
  const sourceAdvocateEmail = typeof referralSource.advocateEmail === 'string'
    ? referralSource.advocateEmail
    : null

  if (!offerKey && !offerName && !offerStage && !destinationDescriptor && !sourceOfferKey && !sourceOfferName) {
    return null
  }

  if (!sourceOfferKey && !sourceOfferName && !sourceLane && !sourceDestinationDescriptor) {
    return null
  }

  return {
    offerKey,
    offerName,
    offerStage,
    offerKind,
    destinationType,
    destinationDescriptor,
    routeKey,
    referralSource: {
      offerKey: sourceOfferKey,
      offerName: sourceOfferName,
      offerLane: sourceLane,
      destinationDescriptor: sourceDestinationDescriptor,
      destinationType: sourceDestinationType,
      routeKey: sourceRouteKey,
      advocateUserId: sourceAdvocateUserId,
      advocateName: sourceAdvocateName,
      advocateEmail: sourceAdvocateEmail,
    },
  }
}

function isGuestTrialLike(type: string, status: string) {
  return ['guest', 'drop_in', 'trial'].includes(type)
    || ['guest', 'none', 'trial'].includes(status)
}

function isPaidLike(type: string, status: string) {
  return ['package', 'monthly', 'unlimited', 'discounted'].includes(type)
    || (status === 'active' && !isGuestTrialLike(type, status))
}

function getCapturedGuestStage(input: {
  normalizedType: string
  normalizedStatus: string
  confirmedBookings: number
  playedConfirmedBookings: number
  nextBookedSessionAt: Date | null
  firstPlayedAt: Date | null
}): ReferralCapturedGuestStage {
  if (isPaidLike(input.normalizedType, input.normalizedStatus)) return 'converted_to_paid'
  if (input.playedConfirmedBookings > 0 || !!input.firstPlayedAt) return 'showed_up'
  if (input.confirmedBookings > 0 || !!input.nextBookedSessionAt) return 'booked_first_visit'
  return 'captured'
}

function formatCapturedGuestStageLabel(stage: ReferralCapturedGuestStage) {
  if (stage === 'booked_first_visit') return 'Booked first visit'
  if (stage === 'showed_up') return 'Showed up'
  if (stage === 'converted_to_paid') return 'Converted to paid'
  return 'Captured'
}

function isVipLike(type: string, status: string, confirmedBookings: number) {
  return ['unlimited', 'monthly'].includes(type)
    || (status === 'active' && confirmedBookings >= 12)
}

function getReferralUrgency(lane: ReferralLane, daysSinceLastBooking: number): ReferralUrgency {
  if (lane === 'dormant_advocate') {
    if (daysSinceLastBooking <= 35) return 'high'
    if (daysSinceLastBooking <= 50) return 'medium'
    return 'low'
  }

  if (daysSinceLastBooking <= 7) return 'high'
  if (daysSinceLastBooking <= 14) return 'medium'
  return 'low'
}

function scoreVipAdvocate(input: {
  daysSinceLastBooking: number
  confirmedBookings: number
  recentConfirmedBookings: number
  activeCoPlayers: number
  confidence: number
}) {
  return clamp(
    78
      + input.activeCoPlayers * 5
      + Math.min(input.recentConfirmedBookings, 4) * 3
      + Math.min(input.confirmedBookings, 20) * 0.7
      + input.confidence * 0.04
      - Math.max(input.daysSinceLastBooking - 7, 0) * 2,
    55,
    99,
  )
}

function scoreSocialRegular(input: {
  daysSinceLastBooking: number
  confirmedBookings: number
  recentConfirmedBookings: number
  activeCoPlayers: number
  confidence: number
}) {
  return clamp(
    70
      + input.activeCoPlayers * 5
      + Math.min(input.recentConfirmedBookings, 4) * 3
      + Math.min(input.confirmedBookings, 12) * 0.8
      + input.confidence * 0.03
      - Math.max(input.daysSinceLastBooking - 10, 0) * 2.5,
    45,
    95,
  )
}

function scoreDormantAdvocate(input: {
  daysSinceLastBooking: number
  confirmedBookings: number
  totalCoPlayers: number
  confidence: number
}) {
  return clamp(
    66
      + input.totalCoPlayers * 4
      + Math.min(input.confirmedBookings, 16) * 0.8
      + input.confidence * 0.03
      - Math.max(input.daysSinceLastBooking - 21, 0) * 1.2,
    40,
    90,
  )
}

function getReferralLaneStatus(lane: ReferralLane, rate: number): 'healthy' | 'watch' | 'at_risk' {
  if (lane === 'dormant_advocate') {
    if (rate >= 45) return 'healthy'
    if (rate >= 25) return 'watch'
    return 'at_risk'
  }

  if (rate >= 60) return 'healthy'
  if (rate >= 35) return 'watch'
  return 'at_risk'
}

export function buildReferralSnapshot(opts: {
  rows: ReferralRow[]
  outcomeRows?: ReferralOutcomeRow[]
  capturedGuestRows?: ReferralCapturedGuestRow[]
  rewardIssuanceRows?: ReferralRewardIssuanceRow[]
  automationSettings?: unknown
  now?: Date
  windowDays?: number
  limit?: number
}): ReferralSnapshot {
  const now = opts.now || new Date()
  const windowDays = opts.windowDays ?? 60
  const limit = opts.limit ?? 8
  const membershipMappings = resolveMembershipMappings(opts.automationSettings)
  const referralOffers = resolveReferralOffers(opts.automationSettings)

  const candidates = opts.rows.flatMap<ReferralCandidate>((row) => {
    const confirmedBookings = toNumber(row.confirmedBookings)
    const recentConfirmedBookings = toNumber(row.recentConfirmedBookings)
    const activeCoPlayers = toNumber(row.activeCoPlayers)
    const totalCoPlayers = toNumber(row.totalCoPlayers)
    const lastConfirmedBookingAt = toDate(row.lastConfirmedBookingAt)
    if (!lastConfirmedBookingAt || confirmedBookings < 4 || totalCoPlayers < 2) return []

    const normalizedMembership = normalizeMembership({
      membershipType: row.membershipType,
      membershipStatus: row.membershipStatus,
      membershipMappings,
    })

    const normalizedType = normalizedMembership.normalizedType
    const normalizedStatus = normalizedMembership.normalizedStatus
    const displayName = row.name || row.email || 'Unknown'
    const daysSinceLastBooking = daysBetween(now, lastConfirmedBookingAt)

    if (daysSinceLastBooking > windowDays) return []

    if (
      daysSinceLastBooking <= 21
      && activeCoPlayers >= 3
      && confirmedBookings >= 8
      && isVipLike(normalizedType, normalizedStatus, confirmedBookings)
    ) {
      const recommendedOffer = pickReferralOffer({
        offers: referralOffers,
        lane: 'vip_advocate',
      })
      return [{
        memberId: row.userId,
        name: displayName,
        email: row.email,
        score: scoreVipAdvocate({
          daysSinceLastBooking,
          confirmedBookings,
          recentConfirmedBookings,
          activeCoPlayers,
          confidence: normalizedMembership.confidence,
        }),
        lane: 'vip_advocate',
        urgency: getReferralUrgency('vip_advocate', daysSinceLastBooking),
        daysSinceLastBooking,
        confirmedBookings,
        recentConfirmedBookings,
        activeCoPlayers,
        totalCoPlayers,
        normalizedMembershipType: normalizedType,
        normalizedMembershipStatus: normalizedStatus,
        recommendedOffer,
        topReason: `Active high-trust member with ${activeCoPlayers} active co-players, ${confirmedBookings} confirmed bookings, and a strong chance to bring a friend from their current routine.`,
        nextBestMove: recommendedOffer
          ? `Ask for a bring-a-friend intro with ${recommendedOffer.descriptor} and route the invite through ${recommendedOffer.destinationDescriptor} while their current playing habit is still active and social.`
          : 'Ask for a bring-a-friend intro while their current playing habit is still active and social.',
      }]
    }

    if (daysSinceLastBooking <= 21 && activeCoPlayers >= 2 && confirmedBookings >= 4) {
      const recommendedOffer = pickReferralOffer({
        offers: referralOffers,
        lane: 'social_regular',
      })
      return [{
        memberId: row.userId,
        name: displayName,
        email: row.email,
        score: scoreSocialRegular({
          daysSinceLastBooking,
          confirmedBookings,
          recentConfirmedBookings,
          activeCoPlayers,
          confidence: normalizedMembership.confidence,
        }),
        lane: 'social_regular',
        urgency: getReferralUrgency('social_regular', daysSinceLastBooking),
        daysSinceLastBooking,
        confirmedBookings,
        recentConfirmedBookings,
        activeCoPlayers,
        totalCoPlayers,
        normalizedMembershipType: normalizedType,
        normalizedMembershipStatus: normalizedStatus,
        recommendedOffer,
        topReason: `${activeCoPlayers} active co-players and ${recentConfirmedBookings || confirmedBookings} recent confirmed bookings make this member a good referral ask without needing a heavy incentive.`,
        nextBestMove: recommendedOffer
          ? `Use ${recommendedOffer.descriptor} as the friend-invite ask and drive the invite into ${recommendedOffer.destinationDescriptor} while their social momentum is still warm.`
          : 'Use a simple friend-invite ask tied to the next easiest session they are likely to book.',
      }]
    }

    if (daysSinceLastBooking >= 22 && totalCoPlayers >= 3 && confirmedBookings >= 6) {
      const recommendedOffer = pickReferralOffer({
        offers: referralOffers,
        lane: 'dormant_advocate',
      })
      return [{
        memberId: row.userId,
        name: displayName,
        email: row.email,
        score: scoreDormantAdvocate({
          daysSinceLastBooking,
          confirmedBookings,
          totalCoPlayers,
          confidence: normalizedMembership.confidence,
        }),
        lane: 'dormant_advocate',
        urgency: getReferralUrgency('dormant_advocate', daysSinceLastBooking),
        daysSinceLastBooking,
        confirmedBookings,
        recentConfirmedBookings,
        activeCoPlayers,
        totalCoPlayers,
        normalizedMembershipType: normalizedType,
        normalizedMembershipStatus: normalizedStatus,
        recommendedOffer,
        topReason: `They have a real social footprint (${totalCoPlayers} co-players, ${confirmedBookings} confirmed bookings) but have been quiet for ${daysSinceLastBooking} days.`,
        nextBestMove: recommendedOffer
          ? `Restart the relationship first, then reopen the referral motion with ${recommendedOffer.descriptor} routed through ${recommendedOffer.destinationDescriptor}.`
          : 'Restart the relationship first, then turn the comeback motion into a soft referral ask once they re-engage.',
      }]
    }

    return []
  })

  const deduped = new Map<string, ReferralCandidate>()
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.memberId)
    if (!existing || candidate.score > existing.score) {
      deduped.set(candidate.memberId, candidate)
    }
  }

  const allCandidates = Array.from(deduped.values())
  const sorted = allCandidates
    .sort((a, b) => b.score - a.score || a.daysSinceLastBooking - b.daysSinceLastBooking)
    .slice(0, Math.max(1, limit))

  const vipAdvocateCount = sorted.filter((candidate) => candidate.lane === 'vip_advocate').length
  const socialRegularCount = sorted.filter((candidate) => candidate.lane === 'social_regular').length
  const dormantAdvocateCount = sorted.filter((candidate) => candidate.lane === 'dormant_advocate').length
  const vipAdvocateOffer = pickReferralOffer({ offers: referralOffers, lane: 'vip_advocate' })
  const socialRegularOffer = pickReferralOffer({ offers: referralOffers, lane: 'social_regular' })
  const dormantAdvocateOffer = pickReferralOffer({ offers: referralOffers, lane: 'dormant_advocate' })
  const averageScore = sorted.length > 0
    ? Math.round(sorted.reduce((sum, candidate) => sum + candidate.score, 0) / sorted.length)
    : 0

  const summary = sorted.length === 0
    ? 'No strong referral advocates are showing up right now.'
    : `${sorted.length} members look referral-ready right now. ${vipAdvocateCount} are high-trust advocates, ${socialRegularCount} are active social regulars, and ${dormantAdvocateCount} are dormant advocates worth reactivating before the referral ask.${vipAdvocateOffer ? ` Lead the VIP lane with ${vipAdvocateOffer.descriptor} via ${vipAdvocateOffer.destinationDescriptor}.` : ''}`

  const socialReachCount = allCandidates.filter((candidate) => candidate.totalCoPlayers >= 2).length
  const activeAdvocateCount = allCandidates.filter((candidate) => candidate.daysSinceLastBooking <= 21).length
  const dormantCandidates = allCandidates.filter((candidate) => candidate.lane === 'dormant_advocate')
  const dormantAdvocateUniverseCount = dormantCandidates.length
  const highConfidenceCount = allCandidates.filter((candidate) => candidate.score >= 80).length
  const activeAdvocateRate = toPercent(activeAdvocateCount, socialReachCount)
  const referralReadyRate = toPercent(highConfidenceCount, socialReachCount)
  const funnelSummary = socialReachCount === 0
    ? 'No member referral funnel is active in the current window yet.'
    : `${activeAdvocateCount}/${socialReachCount} socially-connected members are still active, ${highConfidenceCount}/${socialReachCount} score as high-confidence referral asks, and ${dormantAdvocateUniverseCount} dormant advocates could be reactivated before asking for introductions.`

  const vipHighTrustCount = allCandidates.filter((candidate) => (
    candidate.lane === 'vip_advocate' && candidate.activeCoPlayers >= 4
  )).length
  const socialWarmCount = allCandidates.filter((candidate) => (
    candidate.lane === 'social_regular' && candidate.activeCoPlayers >= 3
  )).length
  const dormantWarmCount = allCandidates.filter((candidate) => (
    candidate.lane === 'dormant_advocate' && candidate.totalCoPlayers >= 5
  )).length

  const vipRate = toPercent(vipHighTrustCount, vipAdvocateCount)
  const socialRate = toPercent(socialWarmCount, socialRegularCount)
  const dormantRate = toPercent(dormantWarmCount, dormantAdvocateCount)

  const laneLoop = [
    vipAdvocateCount > 0 ? {
      key: 'vip-advocates',
      lane: 'vip_advocate' as const,
      title: 'VIP advocate ask',
      candidateCount: vipAdvocateCount,
      outcomeCount: vipHighTrustCount,
      baseCount: vipAdvocateCount,
      rate: vipRate,
      outcomeLabel: 'High-trust social reach',
      summary: `${vipHighTrustCount} of ${vipAdvocateCount} VIP advocates have 4+ active co-players right now, so this lane can support a higher-trust bring-a-friend ask.`,
      status: getReferralLaneStatus('vip_advocate', vipRate),
    } : null,
    socialRegularCount > 0 ? {
      key: 'social-regulars',
      lane: 'social_regular' as const,
      title: 'Social regular referral ask',
      candidateCount: socialRegularCount,
      outcomeCount: socialWarmCount,
      baseCount: socialRegularCount,
      rate: socialRate,
      outcomeLabel: 'Warm social momentum',
      summary: `${socialWarmCount} of ${socialRegularCount} social regulars already have 3+ active co-players, which makes the friend-invite ask safer and more natural.`,
      status: getReferralLaneStatus('social_regular', socialRate),
    } : null,
    dormantAdvocateCount > 0 ? {
      key: 'dormant-advocates',
      lane: 'dormant_advocate' as const,
      title: 'Dormant advocate restart',
      candidateCount: dormantAdvocateCount,
      outcomeCount: dormantWarmCount,
      baseCount: dormantAdvocateCount,
      rate: dormantRate,
      outcomeLabel: 'Strong comeback network',
      summary: `${dormantWarmCount} of ${dormantAdvocateCount} dormant advocates still have a 5+ player co-player footprint, so they are worth reactivating before asking for referrals.`,
      status: getReferralLaneStatus('dormant_advocate', dormantRate),
    } : null,
  ].filter((lane): lane is ReferralLaneSummary => Boolean(lane))

  const offerLoop: ReferralOfferSummary[] = []
  if (vipAdvocateCount > 0 && vipAdvocateOffer) {
    offerLoop.push({
      key: vipAdvocateOffer.key,
      lane: 'vip_advocate',
      name: vipAdvocateOffer.name,
      descriptor: vipAdvocateOffer.descriptor,
      destinationType: vipAdvocateOffer.destinationType || 'landing_page',
      destinationDescriptor: vipAdvocateOffer.destinationDescriptor,
      candidateCount: vipAdvocateCount,
      outcomeCount: vipHighTrustCount,
      baseCount: vipAdvocateCount,
      rate: vipRate,
      outcomeLabel: 'High-trust social reach',
      summary: `${vipAdvocateOffer.name} is the current VIP advocate motion. ${vipHighTrustCount} of ${vipAdvocateCount} candidates already show 4+ active co-players, so this lane can support a premium bring-a-friend ask.`,
      status: getReferralLaneStatus('vip_advocate', vipRate),
    })
  }
  if (socialRegularCount > 0 && socialRegularOffer) {
    offerLoop.push({
      key: socialRegularOffer.key,
      lane: 'social_regular',
      name: socialRegularOffer.name,
      descriptor: socialRegularOffer.descriptor,
      destinationType: socialRegularOffer.destinationType || 'schedule',
      destinationDescriptor: socialRegularOffer.destinationDescriptor,
      candidateCount: socialRegularCount,
      outcomeCount: socialWarmCount,
      baseCount: socialRegularCount,
      rate: socialRate,
      outcomeLabel: 'Warm social momentum',
      summary: `${socialRegularOffer.name} is the default social regular ask. ${socialWarmCount} of ${socialRegularCount} candidates already have 3+ active co-players, which makes the friend-invite motion safer and more natural.`,
      status: getReferralLaneStatus('social_regular', socialRate),
    })
  }
  if (dormantAdvocateCount > 0 && dormantAdvocateOffer) {
    offerLoop.push({
      key: dormantAdvocateOffer.key,
      lane: 'dormant_advocate',
      name: dormantAdvocateOffer.name,
      descriptor: dormantAdvocateOffer.descriptor,
      destinationType: dormantAdvocateOffer.destinationType || 'manual_follow_up',
      destinationDescriptor: dormantAdvocateOffer.destinationDescriptor,
      candidateCount: dormantAdvocateCount,
      outcomeCount: dormantWarmCount,
      baseCount: dormantAdvocateCount,
      rate: dormantRate,
      outcomeLabel: 'Strong comeback network',
      summary: `${dormantAdvocateOffer.name} is the current dormant-advocate restart. ${dormantWarmCount} of ${dormantAdvocateCount} candidates still have a 5+ player co-player footprint, so this lane is worth reactivating before the referral ask.`,
      status: getReferralLaneStatus('dormant_advocate', dormantRate),
    })
  }

  const routeMap = new Map<string, {
    key: string
    destinationType: string
    destinationDescriptor: string
    laneCount: number
    candidateCount: number
    outcomeCount: number
    baseCount: number
    lanes: Set<ReferralLane>
    offerNames: Set<string>
  }>()

  for (const offer of offerLoop) {
    const routeKey = `${offer.destinationType}:${offer.destinationDescriptor}`
    const existing = routeMap.get(routeKey) || {
      key: routeKey,
      destinationType: offer.destinationType,
      destinationDescriptor: offer.destinationDescriptor,
      laneCount: 0,
      candidateCount: 0,
      outcomeCount: 0,
      baseCount: 0,
      lanes: new Set<ReferralLane>(),
      offerNames: new Set<string>(),
    }
    existing.laneCount += 1
    existing.candidateCount += offer.candidateCount
    existing.outcomeCount += offer.outcomeCount
    existing.baseCount += offer.baseCount
    existing.lanes.add(offer.lane)
    existing.offerNames.add(offer.name)
    routeMap.set(routeKey, existing)
  }

  const routeLoop: ReferralSnapshot['summary']['routeLoop'] = Array.from(routeMap.values())
    .map((route) => {
      const rate = toPercent(route.outcomeCount, route.baseCount)
      const lanes = Array.from(route.lanes.values())
      const offerNames = Array.from(route.offerNames.values())
      const stageSummary = lanes.map((lane) => {
        if (lane === 'vip_advocate') return 'VIP advocates'
        if (lane === 'dormant_advocate') return 'dormant advocates'
        return 'social regulars'
      }).join(', ')
      const offerSummary = offerNames.join(', ')

      return {
        key: route.key,
        destinationType: route.destinationType,
        destinationDescriptor: route.destinationDescriptor,
        laneCount: route.laneCount,
        candidateCount: route.candidateCount,
        outcomeCount: route.outcomeCount,
        baseCount: route.baseCount,
        rate,
        lanes,
        offerNames,
        outcomeLabel: 'Combined referral lane momentum',
        summary: route.baseCount === 0
          ? `${route.destinationDescriptor} is configured for ${stageSummary}, but there is no live referral lane on that route yet.`
          : `${route.destinationDescriptor} is carrying ${stageSummary} via ${offerSummary}. Combined referral lane performance is ${rate}% (${route.outcomeCount}/${route.baseCount}), with ${route.candidateCount} members still in play across that route.`,
        status: (rate >= 60 ? 'healthy' : rate >= 35 ? 'watch' : 'at_risk') as 'healthy' | 'watch' | 'at_risk',
      }
    })
    .sort((a, b) => b.rate - a.rate || b.candidateCount - a.candidateCount)

  const offerCatalog = new Map(
    referralOffers.offers.map((offer) => [
      offer.key,
      {
        lane: parseReferralLane(offer.lane === 'any' ? null : offer.lane),
        rewardLabel: offer.rewardLabel || offer.name,
        destinationDescriptor: offer.destinationLabel || offer.destinationNotes || offer.name,
      },
    ]),
  )

  const totalOutcomeMetrics = createEmptyOutcomeMetrics()
  const outcomeByLane = new Map<ReferralLane, ReferralOutcomeMetrics>()
  const rewardByOffer = new Map<string, {
    lane: ReferralLane
    offerName: string
    rewardLabel: string
    destinationDescriptor: string
    metrics: ReferralOutcomeMetrics
  }>()

  for (const row of opts.outcomeRows || []) {
    const attribution = getReferralAttribution(row)
    if (!attribution) continue

    const catalogEntry = attribution.offerKey ? offerCatalog.get(attribution.offerKey) : null
    const lane = attribution.offerLane || catalogEntry?.lane || null
    if (!lane) continue

    const metrics = getOutcomeMetricsForRow(row)
    if (metrics.askCount === 0 && metrics.engagedCount === 0 && metrics.strongSignalCount === 0 && metrics.failedCount === 0) {
      continue
    }

    mergeOutcomeMetrics(totalOutcomeMetrics, metrics)

    const existingLane = outcomeByLane.get(lane) || createEmptyOutcomeMetrics()
    mergeOutcomeMetrics(existingLane, metrics)
    outcomeByLane.set(lane, existingLane)

    const offerKey = attribution.offerKey || `${lane}:${attribution.offerName || attribution.destinationDescriptor || 'referral-offer'}`
    const existingOffer = rewardByOffer.get(offerKey) || {
      lane,
      offerName: attribution.offerName || 'Referral offer',
      rewardLabel: catalogEntry?.rewardLabel || attribution.offerName || 'Referral reward',
      destinationDescriptor: attribution.destinationDescriptor || catalogEntry?.destinationDescriptor || 'Referral route',
      metrics: createEmptyOutcomeMetrics(),
    }
    mergeOutcomeMetrics(existingOffer.metrics, metrics)
    rewardByOffer.set(offerKey, existingOffer)
  }

  const outcomeFunnel = {
    askCount: totalOutcomeMetrics.askCount,
    engagedCount: totalOutcomeMetrics.engagedCount,
    intentCount: totalOutcomeMetrics.intentCount,
    strongSignalCount: totalOutcomeMetrics.strongSignalCount,
    engagementRate: toPercent(totalOutcomeMetrics.engagedCount, totalOutcomeMetrics.askCount),
    intentRate: toPercent(totalOutcomeMetrics.intentCount, totalOutcomeMetrics.askCount),
    strongSignalRate: toPercent(totalOutcomeMetrics.strongSignalCount, totalOutcomeMetrics.askCount),
    summary: totalOutcomeMetrics.askCount === 0
      ? 'No live referral ask outcomes in the current window yet.'
      : `${totalOutcomeMetrics.askCount} referral asks went out, ${totalOutcomeMetrics.engagedCount} advocates engaged, ${totalOutcomeMetrics.intentCount} showed intro intent, and ${totalOutcomeMetrics.strongSignalCount} produced the strongest response signals.`,
  }

  const outcomeLaneOrder = Array.from(new Set<ReferralLane>([
    ...laneLoop.map((lane) => lane.lane),
    ...Array.from(outcomeByLane.keys()),
  ]))

  const outcomeLoop: ReferralOutcomeLoopSummary[] = outcomeLaneOrder.map((laneKey) => {
    const lane = laneLoop.find((entry) => entry.lane === laneKey)
    const metrics = outcomeByLane.get(laneKey) || createEmptyOutcomeMetrics()
    const rate = toPercent(metrics.intentCount, metrics.askCount)
    return {
      key: `outcome-${laneKey}`,
      lane: laneKey,
      title: lane?.title || getReferralLaneTitle(laneKey),
      askCount: metrics.askCount,
      engagedCount: metrics.engagedCount,
      intentCount: metrics.intentCount,
      strongSignalCount: metrics.strongSignalCount,
      rate,
      outcomeLabel: 'Live advocate intro intent',
      summary: metrics.askCount === 0
        ? `No live referral asks have been sent into the ${(lane?.title || getReferralLaneTitle(laneKey)).toLowerCase()} yet, so this lane still needs a real-world outcome read.`
        : `${metrics.askCount} live asks went out in ${(lane?.title || getReferralLaneTitle(laneKey)).toLowerCase()}. ${metrics.engagedCount} advocates engaged, ${metrics.intentCount} showed intro intent, and ${metrics.strongSignalCount} produced the strongest response signals.`,
      status: getOutcomeHealth(metrics),
    }
  })

  const rewardOfferOrder = Array.from(new Set<string>([
    ...offerLoop.map((offer) => offer.key),
    ...Array.from(rewardByOffer.keys()),
  ]))

  const rewardLoop: ReferralRewardLoopSummary[] = rewardOfferOrder
    .map((offerKey) => {
      const offer = offerLoop.find((entry) => entry.key === offerKey)
      const tracked = rewardByOffer.get(offerKey)
      if (!offer && !tracked) return null

      const metrics = tracked?.metrics || createEmptyOutcomeMetrics()
      const reviewCount = metrics.strongSignalCount > 0 ? metrics.strongSignalCount : metrics.intentCount
      const lane = tracked?.lane || offer?.lane
      if (!lane) return null

      const offerName = tracked?.offerName || offer?.name || 'Referral offer'
      const rewardLabel = tracked?.rewardLabel || offerName
      const destinationDescriptor = tracked?.destinationDescriptor || offer?.destinationDescriptor || 'Referral route'

      return {
        key: offerKey,
        lane,
        offerName,
        rewardLabel,
        destinationDescriptor,
        askCount: metrics.askCount,
        engagedCount: metrics.engagedCount,
        intentCount: metrics.intentCount,
        strongSignalCount: metrics.strongSignalCount,
        reviewCount,
        rate: toPercent(reviewCount, metrics.askCount),
        summary: metrics.askCount === 0
          ? `${offerName} has no live referral asks in the current window yet, so there is no reward review queue for this motion.`
          : reviewCount > 0
            ? `${offerName} has ${reviewCount} advocates ready for manual reward review from ${metrics.askCount} live asks. Rewarding should stay operator-reviewed against ${rewardLabel}.`
            : `${offerName} is in flight with ${metrics.askCount} live asks and ${metrics.engagedCount} engaged advocates, but no reward review candidates are ready yet.`,
        status: getRewardStatus(metrics),
      }
    })
    .filter((offer): offer is ReferralRewardLoopSummary => Boolean(offer))
    .sort((a, b) => {
      if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount
      if (b.askCount !== a.askCount) return b.askCount - a.askCount
      return b.strongSignalCount - a.strongSignalCount
    })

  const rewardReviewCount = rewardLoop.reduce((sum, offer) => sum + offer.reviewCount, 0)
  const rewardSummary = rewardReviewCount === 0
    ? 'No referral rewards are ready for manual review yet.'
    : `${rewardReviewCount} referral reward candidate${rewardReviewCount === 1 ? '' : 's'} need manual review before issuing rewards.`

  const rewardIssuanceByKey = new Map(
    (opts.rewardIssuanceRows || []).map((row) => [
      `${row.advocateUserId}:${row.referredGuestUserId}:${row.offerKey}`,
      row,
    ] as const),
  )
  const rewardIssuanceRowsByGuest = new Map<string, ReferralRewardIssuanceRow[]>()
  for (const row of opts.rewardIssuanceRows || []) {
    const existing = rewardIssuanceRowsByGuest.get(row.referredGuestUserId) || []
    existing.push(row)
    rewardIssuanceRowsByGuest.set(row.referredGuestUserId, existing)
  }

  const capturedGuestRowById = new Map(
    (opts.capturedGuestRows || []).map((row) => [row.userId, row] as const),
  )
  const latestReferredGuestOutcomeByUser = new Map<string, {
    row: ReferralOutcomeRow
    attribution: ReferralGuestAttribution
    capturedAt: Date | null
  }>()

  for (const row of opts.outcomeRows || []) {
    if (!row.userId) continue
    const attribution = getReferredGuestAttribution(row)
    if (!attribution || !attribution.referralSource) continue
    const capturedAt = toDate(row.createdAt)
    const existing = latestReferredGuestOutcomeByUser.get(row.userId)
    if (!existing || ((capturedAt?.getTime() || 0) >= (existing.capturedAt?.getTime() || 0))) {
      latestReferredGuestOutcomeByUser.set(row.userId, { row, attribution, capturedAt })
    }
  }

  const referredGuests: ReferralCapturedGuest[] = []
  for (const [userId, captured] of Array.from(latestReferredGuestOutcomeByUser.entries())) {
    const guestRow = capturedGuestRowById.get(userId)
    if (!guestRow) continue

    const normalizedMembership = normalizeMembership({
      membershipType: guestRow.membershipType,
      membershipStatus: guestRow.membershipStatus,
      membershipMappings,
    })
    const normalizedType = normalizedMembership.normalizedType
    const normalizedStatus = normalizedMembership.normalizedStatus
    const confirmedBookings = toNumber(guestRow.confirmedBookings)
    const playedConfirmedBookings = toNumber(guestRow.playedConfirmedBookings)
    const nextBookedSessionAt = toDate(guestRow.nextBookedSessionAt)
    const firstPlayedAt = toDate(guestRow.firstPlayedAt)
    const lastPlayedAt = toDate(guestRow.lastPlayedAt)
    const stage = getCapturedGuestStage({
      normalizedType,
      normalizedStatus,
      confirmedBookings,
      playedConfirmedBookings,
      nextBookedSessionAt,
      firstPlayedAt,
    })
    const source = captured.attribution.referralSource || {
      offerKey: null,
      offerName: null,
      offerLane: null,
      destinationDescriptor: null,
      destinationType: null,
      routeKey: null,
      advocateUserId: null,
      advocateName: null,
      advocateEmail: null,
    }
    const displayName = guestRow.name || guestRow.email || 'Unknown guest'
    const guestOfferName = captured.attribution.offerName
    const guestDestinationDescriptor = captured.attribution.destinationDescriptor
    const sourceOfferName = source.offerName || 'referral ask'
    const nextBestMove = stage === 'captured'
      ? `Move ${displayName} from ${sourceOfferName} into the first-booking path${guestOfferName ? ` with ${guestOfferName}` : ''} and remove friction before the first visit.`
      : stage === 'booked_first_visit'
        ? `Protect ${displayName}'s first show-up after ${sourceOfferName} by tightening reminders and backup follow-through around ${guestDestinationDescriptor || 'the booking path'}.`
        : stage === 'showed_up'
          ? `Turn ${displayName}'s first successful visit from ${sourceOfferName} into a paid step while the referral momentum is still warm.`
          : `Review ${displayName}'s paid conversion after ${sourceOfferName} and decide whether the advocate reward is now ready to move forward.`

    referredGuests.push({
      guestUserId: userId,
      name: displayName,
      email: guestRow.email,
      advocateUserId: source.advocateUserId,
      advocateName: source.advocateName,
      advocateEmail: source.advocateEmail,
      stage,
      stageLabel: formatCapturedGuestStageLabel(stage),
      capturedAt: captured.capturedAt || captured.row.createdAt || null,
      lastTouchAt: lastPlayedAt || nextBookedSessionAt || captured.capturedAt || captured.row.createdAt || null,
      confirmedBookings,
      playedConfirmedBookings,
      normalizedMembershipType: normalizedType,
      normalizedMembershipStatus: normalizedStatus,
      sourceOfferName: source.offerName,
      sourceLane: source.offerLane,
      sourceRouteDescriptor: source.destinationDescriptor,
      guestOfferName,
      guestStage: captured.attribution.offerStage,
      guestDestinationDescriptor,
      guestDestinationType: captured.attribution.destinationType,
      guestTrialContext: (
        captured.attribution.offerKey
        && captured.attribution.offerName
        && captured.attribution.offerStage
        && captured.attribution.offerKind
        && captured.attribution.destinationType
        && captured.attribution.destinationDescriptor
        && captured.attribution.routeKey
      )
        ? {
          source: 'guest_trial_booking',
          stage: captured.attribution.offerStage,
          offerKey: captured.attribution.offerKey,
          offerName: captured.attribution.offerName,
          offerKind: captured.attribution.offerKind as 'guest_pass' | 'trial_pass' | 'starter_pack' | 'paid_intro' | 'membership_offer',
          destinationType: captured.attribution.destinationType as 'schedule' | 'landing_page' | 'external_url' | 'manual_follow_up',
          destinationDescriptor: captured.attribution.destinationDescriptor,
          routeKey: captured.attribution.routeKey,
          ...(source.offerLane
            && source.offerKey
            && source.offerName
            && source.destinationType
            && source.destinationDescriptor
            && source.routeKey
            ? {
              referralSource: {
                source: 'referral_engine' as const,
                lane: source.offerLane,
                offerKey: source.offerKey,
                offerName: source.offerName,
                destinationType: source.destinationType as 'landing_page' | 'schedule' | 'external_url' | 'manual_follow_up',
                destinationDescriptor: source.destinationDescriptor,
                routeKey: source.routeKey,
                advocateUserId: source.advocateUserId,
                advocateName: source.advocateName,
                advocateEmail: source.advocateEmail,
              },
            }
            : {}),
        }
        : null,
      nextBestMove,
    })
  }

  referredGuests.sort((a, b) => {
    const stageRank: Record<ReferralCapturedGuestStage, number> = {
      captured: 0,
      booked_first_visit: 1,
      showed_up: 2,
      converted_to_paid: 3,
    }
    if (stageRank[b.stage] !== stageRank[a.stage]) return stageRank[b.stage] - stageRank[a.stage]
    return (toDate(b.lastTouchAt)?.getTime() || 0) - (toDate(a.lastTouchAt)?.getTime() || 0)
  })

  const referredGuestCapturedCount = referredGuests.length
  const referredGuestBookedCount = referredGuests.filter((guest) => guest.stage !== 'captured').length
  const referredGuestShowedUpCount = referredGuests.filter((guest) => (
    guest.stage === 'showed_up' || guest.stage === 'converted_to_paid'
  )).length
  const referredGuestPaidCount = referredGuests.filter((guest) => guest.stage === 'converted_to_paid').length
  const referredGuestBookingRate = toPercent(referredGuestBookedCount, referredGuestCapturedCount)
  const referredGuestShowUpRate = toPercent(referredGuestShowedUpCount, referredGuestBookedCount)
  const referredGuestPaidConversionRate = toPercent(referredGuestPaidCount, referredGuestShowedUpCount)
  const referredGuestSummary = referredGuestCapturedCount === 0
    ? 'No referred guests have been captured into the club funnel yet.'
    : `${referredGuestCapturedCount} referred guest${referredGuestCapturedCount === 1 ? '' : 's'} are now tied to a concrete club member identity. ${referredGuestBookedCount} booked a first visit, ${referredGuestShowedUpCount} showed up, and ${referredGuestPaidCount} already converted to paid.`

  const offerCatalogByKey = new Map(
    referralOffers.offers.map((offer) => [offer.key, offer] as const),
  )

  const rewardIssuances: ReferralRewardIssuanceCandidate[] = referredGuests
    .flatMap((guest) => {
      if (
        guest.stage !== 'converted_to_paid'
        || !guest.advocateUserId
        || !guest.sourceLane
        || !guest.guestTrialContext?.referralSource?.offerKey
      ) {
        return []
      }

      const offerKey = guest.guestTrialContext.referralSource.offerKey
      const catalogOffer = offerCatalogByKey.get(offerKey)
      const issuanceRecord = rewardIssuanceByKey.get(`${guest.advocateUserId}:${guest.guestUserId}:${offerKey}`)
      const rewardLabel = catalogOffer?.rewardLabel || guest.sourceOfferName || 'Referral reward'
      const offerName = catalogOffer?.name || guest.sourceOfferName || 'Referral offer'
      const status = parseRewardIssuanceStatus(issuanceRecord?.status)
      const guardrails = evaluateReferralRewardGuardrails({
        advocateUserId: guest.advocateUserId,
        advocateEmail: guest.advocateEmail,
        referredGuestUserId: guest.guestUserId,
        referredGuestEmail: guest.email,
        offerKey,
        playedConfirmedBookings: guest.playedConfirmedBookings,
        currentStatus: status,
        existingRows: rewardIssuanceRowsByGuest.get(guest.guestUserId) || [],
      })
      const advocateName = guest.advocateName || guest.advocateEmail || 'Unknown advocate'
      const summary = status === 'issued'
        ? `${advocateName} already has a recorded reward issuance for ${guest.name} converting to paid through ${offerName}.`
        : guardrails.guardrailStatus === 'blocked'
          ? `${guest.name} converted to paid through ${offerName}, but reward issuance is blocked. ${guardrails.guardrailSummary}`
          : guardrails.guardrailStatus === 'review'
            ? `${guest.name} converted to paid through ${offerName}, but operator review is still required before issuing the reward. ${guardrails.guardrailSummary}`
            : guardrails.autoIssueSuggested
              ? `${guest.name} converted to paid through ${offerName}, so ${advocateName} is now clean to issue ${rewardLabel}.`
        : status === 'on_hold'
          ? `${advocateName}'s reward for ${guest.name} is currently on hold even though the referred guest already converted to paid.`
          : `${guest.name} converted to paid through ${offerName}, so ${advocateName} is now ready for reward issuance.`
      const nextBestMove = status === 'issued'
        ? `Reward already marked as issued for ${advocateName}. Reopen it only if the evidence trail needs correction.`
        : guardrails.guardrailStatus === 'blocked'
          ? `Keep ${rewardLabel} blocked for now and resolve the guardrail issue first. ${guardrails.guardrailReasons[0] || 'Check the evidence trail before changing status.'}`
          : guardrails.guardrailStatus === 'review'
            ? `Review the evidence trail for ${guest.name} before issuing ${rewardLabel}. ${guardrails.guardrailReasons[0] || 'Confirm the paid conversion and referral identity.'}`
            : guardrails.autoIssueSuggested
              ? `Issue ${rewardLabel} to ${advocateName} now; the current identity and duplicate checks look clean.`
        : status === 'on_hold'
          ? `Review the hold on ${advocateName}'s reward, confirm the paid conversion evidence for ${guest.name}, and either reopen or issue the reward.`
          : `Issue ${rewardLabel} to ${advocateName} now that ${guest.name} has reached paid conversion.`

      return [{
        key: `${guest.advocateUserId}:${guest.guestUserId}:${offerKey}`,
        advocateUserId: guest.advocateUserId,
        advocateName,
        advocateEmail: guest.advocateEmail,
        referredGuestUserId: guest.guestUserId,
        referredGuestName: guest.name,
        referredGuestEmail: guest.email,
        offerKey,
        offerName,
        rewardLabel,
        lane: guest.sourceLane,
        destinationDescriptor: guest.sourceRouteDescriptor,
        status,
        guardrailStatus: guardrails.guardrailStatus,
        guardrailReasons: guardrails.guardrailReasons,
        guardrailSummary: guardrails.guardrailSummary,
        autoIssueSuggested: guardrails.autoIssueSuggested,
        duplicateRisk: guardrails.duplicateRisk,
        abuseRisk: guardrails.abuseRisk,
        issuedAt: issuanceRecord?.issuedAt || null,
        reviewedAt: issuanceRecord?.reviewedAt || null,
        updatedAt: issuanceRecord?.updatedAt || issuanceRecord?.createdAt || guest.lastTouchAt,
        summary,
        nextBestMove,
      }]
    })
    .sort((a, b) => {
      const statusRank: Record<ReferralRewardIssuanceStatus, number> = {
        ready_issue: 0,
        on_hold: 1,
        issued: 2,
      }
      if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status]
      return (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0)
    })

  const rewardIssuanceReadyCount = rewardIssuances.filter((entry) => entry.status === 'ready_issue' && entry.guardrailStatus === 'clean').length
  const rewardIssuanceReviewCount = rewardIssuances.filter((entry) => entry.status !== 'issued' && entry.guardrailStatus === 'review').length
  const rewardIssuanceBlockedCount = rewardIssuances.filter((entry) => entry.status !== 'issued' && entry.guardrailStatus === 'blocked').length
  const rewardIssuanceHoldCount = rewardIssuances.filter((entry) => entry.status === 'on_hold').length
  const rewardIssuanceIssuedCount = rewardIssuances.filter((entry) => entry.status === 'issued').length

  const rewardIssuanceSummary: ReferralRewardIssuanceSummary = {
    readyCount: rewardIssuanceReadyCount,
    reviewCount: rewardIssuanceReviewCount,
    blockedCount: rewardIssuanceBlockedCount,
    holdCount: rewardIssuanceHoldCount,
    issuedCount: rewardIssuanceIssuedCount,
    summary: rewardIssuances.length === 0
      ? 'No advocate-linked referral rewards are ready for issuance yet.'
      : `${rewardIssuanceReadyCount} clean reward candidate${rewardIssuanceReadyCount === 1 ? '' : 's'} are ready to issue, ${rewardIssuanceReviewCount} need operator review, ${rewardIssuanceBlockedCount} are blocked by guardrails, ${rewardIssuanceHoldCount} are on hold, and ${rewardIssuanceIssuedCount} have already been recorded as issued.`,
  }

  const rewardLedger = Array.from(
    rewardIssuances.reduce((acc, issuance) => {
      const current = acc.get(issuance.advocateUserId) || {
        advocateUserId: issuance.advocateUserId,
        advocateName: issuance.advocateName,
        advocateEmail: issuance.advocateEmail,
        totalRewards: 0,
        readyCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        holdCount: 0,
        issuedCount: 0,
        lastRewardLabel: null,
        lastGuestName: null,
        lastUpdatedAt: null,
        summary: '',
      }

      current.totalRewards += 1
      if (issuance.status === 'issued') current.issuedCount += 1
      if (issuance.status === 'on_hold') current.holdCount += 1
      if (issuance.status === 'ready_issue' && issuance.guardrailStatus === 'clean') current.readyCount += 1
      if (issuance.status !== 'issued' && issuance.guardrailStatus === 'review') current.reviewCount += 1
      if (issuance.status !== 'issued' && issuance.guardrailStatus === 'blocked') current.blockedCount += 1

      if ((toDate(issuance.updatedAt)?.getTime() || 0) >= (toDate(current.lastUpdatedAt)?.getTime() || 0)) {
        current.lastUpdatedAt = issuance.updatedAt
        current.lastRewardLabel = issuance.rewardLabel
        current.lastGuestName = issuance.referredGuestName
      }

      current.summary = current.issuedCount > 0
        ? `${current.issuedCount} issued, ${current.readyCount} clean to issue, ${current.reviewCount} under review, ${current.blockedCount} blocked.`
        : current.readyCount > 0
          ? `${current.readyCount} clean reward${current.readyCount === 1 ? '' : 's'} are ready to issue.`
          : current.reviewCount > 0 || current.blockedCount > 0
            ? `${current.reviewCount} need review and ${current.blockedCount} are blocked by guardrails.`
            : `${current.totalRewards} reward candidate${current.totalRewards === 1 ? '' : 's'} tracked so far.`

      acc.set(issuance.advocateUserId, current)
      return acc
    }, new Map<string, ReferralRewardAdvocateLedgerEntry>()).values(),
  )
    .sort((a, b) => {
      if (b.issuedCount !== a.issuedCount) return b.issuedCount - a.issuedCount
      if (b.readyCount !== a.readyCount) return b.readyCount - a.readyCount
      return (toDate(b.lastUpdatedAt)?.getTime() || 0) - (toDate(a.lastUpdatedAt)?.getTime() || 0)
    })

  return {
    summary: {
      totalCandidates: sorted.length,
      vipAdvocateCount,
      socialRegularCount,
      dormantAdvocateCount,
      averageScore,
      summary,
      offers: {
        vipAdvocate: vipAdvocateOffer
          ? {
            key: vipAdvocateOffer.key,
            name: vipAdvocateOffer.name,
            descriptor: vipAdvocateOffer.descriptor,
            destinationDescriptor: vipAdvocateOffer.destinationDescriptor,
          }
          : null,
        socialRegular: socialRegularOffer
          ? {
            key: socialRegularOffer.key,
            name: socialRegularOffer.name,
            descriptor: socialRegularOffer.descriptor,
            destinationDescriptor: socialRegularOffer.destinationDescriptor,
          }
          : null,
        dormantAdvocate: dormantAdvocateOffer
          ? {
            key: dormantAdvocateOffer.key,
            name: dormantAdvocateOffer.name,
            descriptor: dormantAdvocateOffer.descriptor,
            destinationDescriptor: dormantAdvocateOffer.destinationDescriptor,
          }
          : null,
      },
      laneLoop,
      offerLoop,
      routeLoop,
      outcomeFunnel,
      outcomeLoop,
      rewardSummary,
      rewardLoop,
      rewardIssuance: rewardIssuanceSummary,
      referredGuestFunnel: {
        capturedCount: referredGuestCapturedCount,
        bookedCount: referredGuestBookedCount,
        showedUpCount: referredGuestShowedUpCount,
        paidCount: referredGuestPaidCount,
        bookingRate: referredGuestBookingRate,
        showUpRate: referredGuestShowUpRate,
        paidConversionRate: referredGuestPaidConversionRate,
        summary: referredGuestSummary,
      },
      funnel: {
        socialReachCount,
        activeAdvocateCount,
        dormantAdvocateCount: dormantAdvocateUniverseCount,
        highConfidenceCount,
        activeAdvocateRate,
        referralReadyRate,
        summary: funnelSummary,
      },
    },
    candidates: sorted,
    referredGuests,
    rewardIssuances,
    rewardLedger,
  }
}
