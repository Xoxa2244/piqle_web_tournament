import { normalizeMembership, resolveMembershipMappings } from './membership-intelligence'

export type SmartFirstSessionStage =
  | 'book_first_session'
  | 'book_second_session'
  | 'convert_after_first_session'

export type SmartFirstSessionUrgency = 'low' | 'medium' | 'high'

export interface SmartFirstSessionRow {
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
}

export interface SmartFirstSessionCandidate {
  memberId: string
  name: string
  email: string | null
  score: number
  stage: SmartFirstSessionStage
  urgency: SmartFirstSessionUrgency
  daysSinceJoined: number
  daysSinceFirstBooking: number | null
  confirmedBookings: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  topReason: string
  nextBestMove: string
}

export interface SmartFirstSessionSuggestedCohort {
  key: string
  stage: SmartFirstSessionStage
  name: string
  count: number
  description: string
  createCohortPrompt: string
  draftCampaignPrompt: string
}

export interface SmartFirstSessionSnapshot {
  summary: {
    totalCandidates: number
    firstBookingCount: number
    secondSessionCount: number
    conversionReadyCount: number
    averageScore: number
    summary: string
    funnel: {
      newcomerCount: number
      firstBookedCount: number
      secondBookedCount: number
      paidMemberCount: number
      firstBookingRate: number
      secondSessionRate: number
      paidConversionRate: number
      summary: string
    }
  }
  candidates: SmartFirstSessionCandidate[]
  suggestedCohorts: SmartFirstSessionSuggestedCohort[]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(now: Date, earlier: Date) {
  return Math.max(0, Math.floor((now.getTime() - earlier.getTime()) / 86400000))
}

function getUrgency(days: number): SmartFirstSessionUrgency {
  if (days >= 7) return 'high'
  if (days >= 3) return 'medium'
  return 'low'
}

function isGuestLike(type: string, status: string) {
  return ['guest', 'drop_in'].includes(type) || ['guest', 'none'].includes(status)
}

function isTrialLike(type: string, status: string) {
  return type === 'trial' || status === 'trial'
}

function isPaidLike(type: string, status: string) {
  return ['package', 'monthly', 'unlimited', 'discounted'].includes(type)
    || (status === 'active' && !isGuestLike(type, status) && !isTrialLike(type, status))
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function scoreFirstBooking(input: {
  daysSinceJoined: number
  normalizedType: string
  normalizedStatus: string
  confidence: number
}) {
  const membershipBoost = isTrialLike(input.normalizedType, input.normalizedStatus)
    ? 10
    : isGuestLike(input.normalizedType, input.normalizedStatus)
      ? 6
      : 0
  const timingPenalty = Math.max(input.daysSinceJoined - 4, 0) * 4
  return clamp(84 + membershipBoost + input.confidence * 0.06 - timingPenalty, 55, 99)
}

function scoreSecondSession(input: {
  daysSinceFirstBooking: number
  normalizedType: string
  normalizedStatus: string
  confidence: number
}) {
  const membershipBoost = isTrialLike(input.normalizedType, input.normalizedStatus)
    ? 8
    : input.normalizedType === 'package'
      ? 5
      : 0
  return clamp(78 + membershipBoost + input.confidence * 0.05 - input.daysSinceFirstBooking * 3, 48, 95)
}

function scoreConversion(input: {
  daysSinceFirstBooking: number
  confidence: number
}) {
  return clamp(72 + input.confidence * 0.04 - input.daysSinceFirstBooking * 2, 40, 90)
}

export function buildSmartFirstSessionSnapshot(opts: {
  rows: SmartFirstSessionRow[]
  automationSettings?: unknown
  now?: Date
  windowDays?: number
  limit?: number
}): SmartFirstSessionSnapshot {
  const now = opts.now || new Date()
  const windowDays = opts.windowDays ?? 21
  const limit = opts.limit ?? 8
  const membershipMappings = resolveMembershipMappings(opts.automationSettings)

  const candidates = opts.rows.flatMap<SmartFirstSessionCandidate>((row) => {
    const joinedAt = toDate(row.followedAt) || toDate(row.userCreatedAt)
    const firstConfirmedBookingAt = toDate(row.firstConfirmedBookingAt)
    const lastConfirmedBookingAt = toDate(row.lastConfirmedBookingAt)
    const confirmedBookings = Number(row.confirmedBookings || 0)
    const displayName = row.name || row.email || 'Unknown'

    const normalizedMembership = normalizeMembership({
      membershipType: row.membershipType,
      membershipStatus: row.membershipStatus,
      membershipMappings,
    })

    const normalizedType = normalizedMembership.normalizedType
    const normalizedStatus = normalizedMembership.normalizedStatus

    if (joinedAt) {
      const daysSinceJoined = daysBetween(now, joinedAt)

      if (confirmedBookings === 0 && daysSinceJoined >= 1 && daysSinceJoined <= windowDays) {
        return [{
          memberId: row.userId,
          name: displayName,
          email: row.email,
          score: scoreFirstBooking({
            daysSinceJoined,
            normalizedType,
            normalizedStatus,
            confidence: normalizedMembership.confidence,
          }),
          stage: 'book_first_session' as const,
          urgency: getUrgency(daysSinceJoined),
          daysSinceJoined,
          daysSinceFirstBooking: null,
          confirmedBookings,
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          topReason: `${daysSinceJoined} day${daysSinceJoined === 1 ? '' : 's'} since joining and still no confirmed first booking.`,
          nextBestMove: isTrialLike(normalizedType, normalizedStatus)
            ? 'Draft a first-play follow-up into the safest beginner-friendly session.'
            : 'Recommend the easiest first session and nudge them to book now.',
        }]
      }
    }

    if (firstConfirmedBookingAt) {
      const daysSinceFirstBooking = daysBetween(now, firstConfirmedBookingAt)
      const safeDaysSinceJoined = joinedAt ? daysBetween(now, joinedAt) : daysSinceFirstBooking

      if (confirmedBookings === 1 && daysSinceFirstBooking <= 14) {
        return [{
          memberId: row.userId,
          name: displayName,
          email: row.email,
          score: scoreSecondSession({
            daysSinceFirstBooking,
            normalizedType,
            normalizedStatus,
            confidence: normalizedMembership.confidence,
          }),
          stage: 'book_second_session' as const,
          urgency: getUrgency(daysSinceFirstBooking),
          daysSinceJoined: safeDaysSinceJoined,
          daysSinceFirstBooking,
          confirmedBookings,
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          topReason: `Only one confirmed session so far, and the first booking happened ${daysSinceFirstBooking} day${daysSinceFirstBooking === 1 ? '' : 's'} ago.`,
          nextBestMove: 'Guide them into a second session quickly before the first-play momentum fades.',
        }]
      }

      if (
        confirmedBookings >= 1
        && daysSinceFirstBooking <= 14
        && (isGuestLike(normalizedType, normalizedStatus) || isTrialLike(normalizedType, normalizedStatus))
      ) {
        return [{
          memberId: row.userId,
          name: displayName,
          email: row.email,
          score: scoreConversion({
            daysSinceFirstBooking,
            confidence: normalizedMembership.confidence,
          }),
          stage: 'convert_after_first_session' as const,
          urgency: daysSinceFirstBooking >= 10 ? 'high' : 'medium',
          daysSinceJoined: safeDaysSinceJoined,
          daysSinceFirstBooking,
          confirmedBookings,
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          topReason: `They already tried the club, but are still sitting in a ${normalizedType === 'unknown' ? normalizedStatus : normalizedType} entry tier.`,
          nextBestMove: 'Offer the easiest next paid step while the first-session experience is still fresh.',
        }]
      }
    }

    return []
  })

  const deduped = new Map<string, SmartFirstSessionCandidate>()
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.memberId)
    if (!existing || candidate.score > existing.score) {
      deduped.set(candidate.memberId, candidate)
    }
  }

  const sorted = Array.from(deduped.values())
    .sort((a, b) => b.score - a.score || a.daysSinceJoined - b.daysSinceJoined)
    .slice(0, Math.max(1, limit))

  const firstBookingCount = sorted.filter((candidate) => candidate.stage === 'book_first_session').length
  const secondSessionCount = sorted.filter((candidate) => candidate.stage === 'book_second_session').length
  const conversionReadyCount = sorted.filter((candidate) => candidate.stage === 'convert_after_first_session').length
  const averageScore = sorted.length > 0
    ? Math.round(sorted.reduce((sum, candidate) => sum + candidate.score, 0) / sorted.length)
    : 0

  const newcomerJourneys = opts.rows.flatMap((row) => {
    const joinedAt = toDate(row.followedAt) || toDate(row.userCreatedAt)
    if (!joinedAt) return []

    const daysSinceJoined = daysBetween(now, joinedAt)
    if (daysSinceJoined < 0 || daysSinceJoined > windowDays) return []

    const normalizedMembership = normalizeMembership({
      membershipType: row.membershipType,
      membershipStatus: row.membershipStatus,
      membershipMappings,
    })

    return [{
      confirmedBookings: Number(row.confirmedBookings || 0),
      normalizedMembershipType: normalizedMembership.normalizedType,
      normalizedMembershipStatus: normalizedMembership.normalizedStatus,
    }]
  })

  const newcomerCount = newcomerJourneys.length
  const firstBookedCount = newcomerJourneys.filter((row) => row.confirmedBookings >= 1).length
  const secondBookedCount = newcomerJourneys.filter((row) => row.confirmedBookings >= 2).length
  const paidMemberCount = newcomerJourneys.filter((row) => (
    row.confirmedBookings >= 1
    && isPaidLike(row.normalizedMembershipType, row.normalizedMembershipStatus)
  )).length
  const firstBookingRate = toPercent(firstBookedCount, newcomerCount)
  const secondSessionRate = toPercent(secondBookedCount, firstBookedCount)
  const paidConversionRate = toPercent(paidMemberCount, firstBookedCount)
  const funnelSummary = newcomerCount === 0
    ? 'No newcomer funnel data in the current window yet.'
    : `${firstBookedCount}/${newcomerCount} reached a first booking, ${secondBookedCount}/${Math.max(firstBookedCount, 1)} held for a second session, and ${paidMemberCount}/${Math.max(firstBookedCount, 1)} already sit in a paid tier.`

  const summary = sorted.length === 0
    ? 'No strong first-session opportunities right now.'
    : `${sorted.length} newcomer${sorted.length === 1 ? '' : 's'} need help getting from signup to habit. ${firstBookingCount} still need a first booking, ${secondSessionCount} need a second session, and ${conversionReadyCount} are ready for a paid next step.`

  const suggestedCohorts: SmartFirstSessionSuggestedCohort[] = [
    firstBookingCount > 0 ? {
      key: 'newcomer-first-booking',
      stage: 'book_first_session',
      name: 'Newcomers needing first booking',
      count: firstBookingCount,
      description: 'Fresh trials and guests with no confirmed first session yet.',
      createCohortPrompt: `Create and save a cohort called "Newcomers needing first booking" for ${firstBookingCount} recent newcomer members who still have no confirmed first session. Focus on trials and guests who joined in the current smart first session window, and make the cohort reusable.`,
      draftCampaignPrompt: `Draft a first-booking outreach campaign for ${firstBookingCount} recent newcomer members who still have no confirmed first session. Recommend the safest beginner-friendly next booking and keep the first version review-ready.`,
    } : null,
    secondSessionCount > 0 ? {
      key: 'newcomer-second-session',
      stage: 'book_second_session',
      name: 'Newcomers needing second session',
      count: secondSessionCount,
      description: 'Members who booked once and need a second session to form a habit.',
      createCohortPrompt: `Create and save a cohort called "Newcomers needing second session" for ${secondSessionCount} newcomer members who only have one confirmed booking. Keep it focused on players still in their early habit-forming window.`,
      draftCampaignPrompt: `Draft a second-session follow-up campaign for ${secondSessionCount} newcomer members who only booked once. Focus on habit-building and lower-friction next sessions, and keep it review-ready first.`,
    } : null,
    conversionReadyCount > 0 ? {
      key: 'newcomer-paid-conversion',
      stage: 'convert_after_first_session',
      name: 'Newcomers ready for paid conversion',
      count: conversionReadyCount,
      description: 'Guests and trials who already played and are ready for the easiest paid next step.',
      createCohortPrompt: `Create and save a cohort called "Newcomers ready for paid conversion" for ${conversionReadyCount} newcomer members who already completed a first session and are still in a guest or trial tier. Keep it reusable for conversion campaigns.`,
      draftCampaignPrompt: `Draft a guest-to-paid conversion campaign for ${conversionReadyCount} newcomer members who already completed a first session and are ready for a paid next step. Recommend the safest offer and keep it draft-only for review.`,
    } : null,
  ].filter(Boolean) as SmartFirstSessionSuggestedCohort[]

  return {
    summary: {
      totalCandidates: sorted.length,
      firstBookingCount,
      secondSessionCount,
      conversionReadyCount,
      averageScore,
      summary,
      funnel: {
        newcomerCount,
        firstBookedCount,
        secondBookedCount,
        paidMemberCount,
        firstBookingRate,
        secondSessionRate,
        paidConversionRate,
        summary: funnelSummary,
      },
    },
    candidates: sorted,
    suggestedCohorts,
  }
}
