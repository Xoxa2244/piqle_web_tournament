import { normalizeMembership, resolveMembershipMappings } from './membership-intelligence'
import {
  pickGuestTrialOffer,
  resolveGuestTrialOffers,
  type ResolvedGuestTrialOffer,
} from './guest-trial-offers'

export type GuestTrialBookingStage =
  | 'book_first_visit'
  | 'protect_first_show_up'
  | 'convert_to_paid'

export type GuestTrialBookingUrgency = 'low' | 'medium' | 'high'

export interface GuestTrialBookingRow {
  userId: string
  followedAt: string | Date | null
  userCreatedAt: string | Date | null
  name: string | null
  email: string | null
  membershipType: string | null
  membershipStatus: string | null
  nextBookedSessionAt: string | Date | null
  firstPlayedAt: string | Date | null
  lastPlayedAt: string | Date | null
  confirmedBookings: number | string | null
  playedConfirmedBookings: number | string | null
  noShowCount: number | string | null
}

export interface GuestTrialBookingCandidate {
  memberId: string
  name: string
  email: string | null
  score: number
  stage: GuestTrialBookingStage
  urgency: GuestTrialBookingUrgency
  daysSinceJoined: number
  daysUntilNextBooking: number | null
  daysSinceFirstPlayed: number | null
  confirmedBookings: number
  playedConfirmedBookings: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  recommendedOffer: ResolvedGuestTrialOffer | null
  topReason: string
  nextBestMove: string
}

export interface GuestTrialBookingSnapshot {
  summary: {
    totalCandidates: number
    firstBookingCount: number
    showUpProtectionCount: number
    paidConversionCount: number
    averageScore: number
    summary: string
    offers: {
      firstVisit: ResolvedGuestTrialOffer | null
      showUpProtection: ResolvedGuestTrialOffer | null
      paidConversion: ResolvedGuestTrialOffer | null
    }
    offerLoop: Array<{
      key: string
      stage: GuestTrialBookingStage
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
      stageCount: number
      stages: GuestTrialBookingStage[]
      offerNames: string[]
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    funnel: {
      entrantCount: number
      bookedCount: number
      showedUpCount: number
      paidCount: number
      bookingRate: number
      showUpRate: number
      paidConversionRate: number
      summary: string
    }
  }
  candidates: GuestTrialBookingCandidate[]
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

function daysUntil(now: Date, later: Date) {
  return Math.max(0, Math.ceil((later.getTime() - now.getTime()) / 86400000))
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function getStageLabel(stage: GuestTrialBookingStage) {
  switch (stage) {
    case 'book_first_visit':
      return 'first-visit booking'
    case 'protect_first_show_up':
      return 'first-show protection'
    default:
      return 'paid conversion'
  }
}

function getDestinationTypeForStage(stage: GuestTrialBookingStage) {
  if (stage === 'book_first_visit') return 'schedule'
  if (stage === 'protect_first_show_up') return 'manual_follow_up'
  return 'landing_page'
}

function mergeLoopStatus(
  current: 'healthy' | 'watch' | 'at_risk',
  next: 'healthy' | 'watch' | 'at_risk',
) {
  const severity = {
    healthy: 0,
    watch: 1,
    at_risk: 2,
  } as const
  return severity[next] > severity[current] ? next : current
}

function getOfferLoopStatus(stage: GuestTrialBookingStage, rate: number): 'healthy' | 'watch' | 'at_risk' {
  if (stage === 'book_first_visit') {
    if (rate >= 60) return 'healthy'
    if (rate >= 35) return 'watch'
    return 'at_risk'
  }

  if (stage === 'protect_first_show_up') {
    if (rate >= 75) return 'healthy'
    if (rate >= 50) return 'watch'
    return 'at_risk'
  }

  if (rate >= 30) return 'healthy'
  if (rate >= 15) return 'watch'
  return 'at_risk'
}

function isGuestLike(type: string, status: string) {
  return ['guest', 'drop_in'].includes(type) || ['guest', 'none'].includes(status)
}

function isTrialLike(type: string, status: string) {
  return type === 'trial' || status === 'trial'
}

function isGuestTrialLike(type: string, status: string) {
  return isGuestLike(type, status) || isTrialLike(type, status)
}

function isPaidLike(type: string, status: string) {
  return ['package', 'monthly', 'unlimited', 'discounted'].includes(type)
    || (status === 'active' && !isGuestTrialLike(type, status))
}

function getJoinedUrgency(daysSinceJoined: number): GuestTrialBookingUrgency {
  if (daysSinceJoined >= 6) return 'high'
  if (daysSinceJoined >= 3) return 'medium'
  return 'low'
}

function getShowUpUrgency(daysUntilNextBooking: number, noShowCount: number): GuestTrialBookingUrgency {
  if (noShowCount > 0 || daysUntilNextBooking <= 2) return 'high'
  if (daysUntilNextBooking <= 5) return 'medium'
  return 'low'
}

function getConversionUrgency(daysSinceFirstPlayed: number): GuestTrialBookingUrgency {
  if (daysSinceFirstPlayed >= 8) return 'high'
  if (daysSinceFirstPlayed >= 4) return 'medium'
  return 'low'
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
  const delayPenalty = Math.max(input.daysSinceJoined - 4, 0) * 4
  return clamp(86 + membershipBoost + input.confidence * 0.05 - delayPenalty, 54, 99)
}

function scoreShowUp(input: {
  daysUntilNextBooking: number
  noShowCount: number
  confidence: number
}) {
  const reliabilityPenalty = input.noShowCount > 0 ? 6 : 0
  return clamp(82 + input.confidence * 0.04 - input.daysUntilNextBooking * 2 - reliabilityPenalty, 50, 96)
}

function scoreConversion(input: {
  daysSinceFirstPlayed: number
  playedConfirmedBookings: number
  confidence: number
}) {
  return clamp(
    76 + Math.min(input.playedConfirmedBookings, 3) * 4 + input.confidence * 0.04 - input.daysSinceFirstPlayed * 2,
    44,
    94,
  )
}

export function buildGuestTrialBookingSnapshot(opts: {
  rows: GuestTrialBookingRow[]
  automationSettings?: unknown
  now?: Date
  windowDays?: number
  limit?: number
}): GuestTrialBookingSnapshot {
  const now = opts.now || new Date()
  const windowDays = opts.windowDays ?? 30
  const limit = opts.limit ?? 8
  const membershipMappings = resolveMembershipMappings(opts.automationSettings)
  const guestTrialOffers = resolveGuestTrialOffers(opts.automationSettings)
  const automationRecord = opts.automationSettings && typeof opts.automationSettings === 'object'
    ? opts.automationSettings as { intelligence?: { pricingModel?: string | null; avgSessionPriceCents?: number | null } }
    : {}
  const clubPricingModel = automationRecord.intelligence?.pricingModel || null
  const clubAvgSessionPriceCents = automationRecord.intelligence?.avgSessionPriceCents ?? null

  const rowsWithSignals = opts.rows.map((row) => {
    const joinedAt = toDate(row.followedAt) || toDate(row.userCreatedAt)
    const nextBookedSessionAt = toDate(row.nextBookedSessionAt)
    const firstPlayedAt = toDate(row.firstPlayedAt)
    const lastPlayedAt = toDate(row.lastPlayedAt)
    const confirmedBookings = Number(row.confirmedBookings || 0)
    const playedConfirmedBookings = Number(row.playedConfirmedBookings || 0)
    const noShowCount = Number(row.noShowCount || 0)
    const normalizedMembership = normalizeMembership({
      membershipType: row.membershipType,
      membershipStatus: row.membershipStatus,
      membershipMappings,
    })

    return {
      row,
      joinedAt,
      nextBookedSessionAt,
      firstPlayedAt,
      lastPlayedAt,
      confirmedBookings,
      playedConfirmedBookings,
      noShowCount,
      normalizedMembership,
    }
  })

  const candidates = rowsWithSignals.flatMap<GuestTrialBookingCandidate>((entry) => {
    const {
      row,
      joinedAt,
      nextBookedSessionAt,
      firstPlayedAt,
      confirmedBookings,
      playedConfirmedBookings,
      noShowCount,
      normalizedMembership,
    } = entry
    const displayName = row.name || row.email || 'Unknown'
    const normalizedType = normalizedMembership.normalizedType
    const normalizedStatus = normalizedMembership.normalizedStatus

    if (!isGuestTrialLike(normalizedType, normalizedStatus)) return []

    if (joinedAt) {
      const daysSinceJoined = daysBetween(now, joinedAt)

      if (confirmedBookings === 0 && daysSinceJoined >= 0 && daysSinceJoined <= windowDays) {
        const recommendedOffer = pickGuestTrialOffer({
          offers: guestTrialOffers,
          stage: 'book_first_visit',
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          pricingModel: clubPricingModel,
          avgSessionPriceCents: clubAvgSessionPriceCents,
        })
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
          stage: 'book_first_visit',
          urgency: getJoinedUrgency(daysSinceJoined),
          daysSinceJoined,
          daysUntilNextBooking: null,
          daysSinceFirstPlayed: null,
          confirmedBookings,
          playedConfirmedBookings,
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          recommendedOffer,
          topReason: `${daysSinceJoined} day${daysSinceJoined === 1 ? '' : 's'} since entering the club, and they still have no first booking locked in.`,
          nextBestMove: isTrialLike(normalizedType, normalizedStatus)
            ? `Lead with ${recommendedOffer?.descriptor || 'the club trial offer'} and drive them toward ${recommendedOffer?.destinationDescriptor || 'the cleanest first-booking path'} this week.`
            : `Lead with ${recommendedOffer?.descriptor || 'the easiest guest-friendly first offer'} and remove booking friction around ${recommendedOffer?.destinationDescriptor || 'the club booking path'}.`,
        }]
      }
    }

    if (nextBookedSessionAt && playedConfirmedBookings === 0) {
      const daysUntilNextBooking = daysUntil(now, nextBookedSessionAt)
      if (daysUntilNextBooking <= 10) {
        const recommendedOffer = pickGuestTrialOffer({
          offers: guestTrialOffers,
          stage: 'protect_first_show_up',
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          pricingModel: clubPricingModel,
          avgSessionPriceCents: clubAvgSessionPriceCents,
        })
        const safeDaysSinceJoined = joinedAt ? daysBetween(now, joinedAt) : 0
        const noShowText = noShowCount > 0
          ? ` They already have ${noShowCount} past no-show${noShowCount === 1 ? '' : 's'}, so this booking needs extra protection.`
          : ''
        return [{
          memberId: row.userId,
          name: displayName,
          email: row.email,
          score: scoreShowUp({
            daysUntilNextBooking,
            noShowCount,
            confidence: normalizedMembership.confidence,
          }),
          stage: 'protect_first_show_up',
          urgency: getShowUpUrgency(daysUntilNextBooking, noShowCount),
          daysSinceJoined: safeDaysSinceJoined,
          daysUntilNextBooking,
          daysSinceFirstPlayed: null,
          confirmedBookings,
          playedConfirmedBookings,
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          recommendedOffer,
          topReason: `First booking is scheduled in ${daysUntilNextBooking} day${daysUntilNextBooking === 1 ? '' : 's'}, but they have not shown up for a first session yet.${noShowText}`,
          nextBestMove: `Protect the ${recommendedOffer?.name || 'entry offer'} booking with a low-friction reminder, clear expectations, and one easy backup option through ${recommendedOffer?.destinationDescriptor || 'the show-up reminder path'}.`,
        }]
      }
    }

    if (firstPlayedAt && playedConfirmedBookings >= 1) {
      const daysSinceFirstPlayed = daysBetween(now, firstPlayedAt)
      const safeDaysSinceJoined = joinedAt ? daysBetween(now, joinedAt) : daysSinceFirstPlayed
      if (daysSinceFirstPlayed <= windowDays) {
        const recommendedOffer = pickGuestTrialOffer({
          offers: guestTrialOffers,
          stage: 'convert_to_paid',
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          pricingModel: clubPricingModel,
          avgSessionPriceCents: clubAvgSessionPriceCents,
        })
        return [{
          memberId: row.userId,
          name: displayName,
          email: row.email,
          score: scoreConversion({
            daysSinceFirstPlayed,
            playedConfirmedBookings,
            confidence: normalizedMembership.confidence,
          }),
          stage: 'convert_to_paid',
          urgency: getConversionUrgency(daysSinceFirstPlayed),
          daysSinceJoined: safeDaysSinceJoined,
          daysUntilNextBooking: nextBookedSessionAt ? daysUntil(now, nextBookedSessionAt) : null,
          daysSinceFirstPlayed,
          confirmedBookings,
          playedConfirmedBookings,
          normalizedMembershipType: normalizedType,
          normalizedMembershipStatus: normalizedStatus,
          recommendedOffer,
          topReason: `They already showed up for ${playedConfirmedBookings} session${playedConfirmedBookings === 1 ? '' : 's'} but are still sitting in a guest/trial tier ${daysSinceFirstPlayed} day${daysSinceFirstPlayed === 1 ? '' : 's'} later.`,
          nextBestMove: `Offer ${recommendedOffer?.descriptor || 'the safest paid next step'} while the first-play experience is still recent and positive, and send them toward ${recommendedOffer?.destinationDescriptor || 'the paid conversion path'}.`,
        }]
      }
    }

    return []
  })

  const deduped = new Map<string, GuestTrialBookingCandidate>()
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.memberId)
    if (!existing || candidate.score > existing.score) {
      deduped.set(candidate.memberId, candidate)
    }
  }

  const allCandidates = Array.from(deduped.values())
  const sorted = allCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))

  const firstBookingCount = sorted.filter((candidate) => candidate.stage === 'book_first_visit').length
  const showUpProtectionCount = sorted.filter((candidate) => candidate.stage === 'protect_first_show_up').length
  const paidConversionCount = sorted.filter((candidate) => candidate.stage === 'convert_to_paid').length
  const averageScore = sorted.length > 0
    ? Math.round(sorted.reduce((sum, candidate) => sum + candidate.score, 0) / sorted.length)
    : 0
  const firstVisitOffer = pickGuestTrialOffer({
    offers: guestTrialOffers,
    stage: 'book_first_visit',
    normalizedMembershipType: 'guest',
    normalizedMembershipStatus: 'guest',
    pricingModel: clubPricingModel,
    avgSessionPriceCents: clubAvgSessionPriceCents,
  })
  const showUpProtectionOffer = pickGuestTrialOffer({
    offers: guestTrialOffers,
    stage: 'protect_first_show_up',
    normalizedMembershipType: 'trial',
    normalizedMembershipStatus: 'trial',
    pricingModel: clubPricingModel,
    avgSessionPriceCents: clubAvgSessionPriceCents,
  })
  const paidConversionOffer = pickGuestTrialOffer({
    offers: guestTrialOffers,
    stage: 'convert_to_paid',
    normalizedMembershipType: 'trial',
    normalizedMembershipStatus: 'trial',
    pricingModel: clubPricingModel,
    avgSessionPriceCents: clubAvgSessionPriceCents,
  })

  const summary = sorted.length === 0
    ? 'No strong guest or trial booking opportunities right now.'
    : `${sorted.length} guest/trial booking opportunities are live right now. ${firstBookingCount} still need a first visit, ${showUpProtectionCount} need first-show protection, and ${paidConversionCount} are ready for a paid next step.${paidConversionOffer ? ` Lead paid conversion with ${paidConversionOffer.name} via ${paidConversionOffer.destinationDescriptor}.` : ''}`

  const recentEntrants = rowsWithSignals.filter((entry) => {
    if (!entry.joinedAt) return false
    return daysBetween(now, entry.joinedAt) <= windowDays
  })
  const entrantCount = recentEntrants.length
  const bookedCount = recentEntrants.filter((entry) => entry.confirmedBookings > 0).length
  const showedUpCount = recentEntrants.filter((entry) => entry.playedConfirmedBookings > 0).length
  const paidCount = recentEntrants.filter((entry) => isPaidLike(
    entry.normalizedMembership.normalizedType,
    entry.normalizedMembership.normalizedStatus,
  ) && entry.playedConfirmedBookings > 0).length
  const bookingRate = toPercent(bookedCount, entrantCount)
  const showUpRate = toPercent(showedUpCount, bookedCount)
  const paidConversionRate = toPercent(paidCount, showedUpCount)
  const funnelSummary = entrantCount === 0
    ? 'No recent guest/trial entrants in the current window yet.'
    : `${bookedCount}/${entrantCount} recent entrants have booked, ${showedUpCount}/${Math.max(bookedCount, 1)} have already shown up, and ${paidCount}/${Math.max(showedUpCount, 1)} have moved into a paid tier.`
  const offerLoop = [
    firstVisitOffer ? {
      key: firstVisitOffer.key,
      stage: 'book_first_visit' as const,
      name: firstVisitOffer.name,
      descriptor: firstVisitOffer.descriptor,
      destinationType: firstVisitOffer.destinationType || getDestinationTypeForStage('book_first_visit'),
      destinationDescriptor: firstVisitOffer.destinationDescriptor,
      candidateCount: firstBookingCount,
      outcomeCount: bookedCount,
      baseCount: entrantCount,
      rate: bookingRate,
      outcomeLabel: 'First visits booked',
      summary: entrantCount === 0
        ? `No recent entrants yet, so ${firstVisitOffer.name} is waiting for fresh guest/trial traffic.`
        : `${bookedCount} of ${entrantCount} recent guest/trial entrants have already booked. ${firstVisitOffer.name} is the current lead offer for the remaining ${firstBookingCount} first-visit opportunities.`,
      status: getOfferLoopStatus('book_first_visit', bookingRate),
    } : null,
    showUpProtectionOffer ? {
      key: showUpProtectionOffer.key,
      stage: 'protect_first_show_up' as const,
      name: showUpProtectionOffer.name,
      descriptor: showUpProtectionOffer.descriptor,
      destinationType: showUpProtectionOffer.destinationType || getDestinationTypeForStage('protect_first_show_up'),
      destinationDescriptor: showUpProtectionOffer.destinationDescriptor,
      candidateCount: showUpProtectionCount,
      outcomeCount: showedUpCount,
      baseCount: bookedCount,
      rate: showUpRate,
      outcomeLabel: 'Booked guests who showed up',
      summary: bookedCount === 0
        ? `No first bookings yet, so ${showUpProtectionOffer.name} has no show-up cohort to protect.`
        : `${showedUpCount} of ${bookedCount} booked guests/trials made it onto court. ${showUpProtectionOffer.name} is the current reminder anchor for the remaining ${showUpProtectionCount} first-show protection plays.`,
      status: getOfferLoopStatus('protect_first_show_up', showUpRate),
    } : null,
    paidConversionOffer ? {
      key: paidConversionOffer.key,
      stage: 'convert_to_paid' as const,
      name: paidConversionOffer.name,
      descriptor: paidConversionOffer.descriptor,
      destinationType: paidConversionOffer.destinationType || getDestinationTypeForStage('convert_to_paid'),
      destinationDescriptor: paidConversionOffer.destinationDescriptor,
      candidateCount: paidConversionCount,
      outcomeCount: paidCount,
      baseCount: showedUpCount,
      rate: paidConversionRate,
      outcomeLabel: 'Showed-up guests who paid',
      summary: showedUpCount === 0
        ? `No first-show cohort yet, so ${paidConversionOffer.name} has nobody ready for a paid step.`
        : `${paidCount} of ${showedUpCount} guests/trials who already showed up moved into a paid tier. ${paidConversionOffer.name} is the current conversion offer for the remaining ${paidConversionCount} warm paid-conversion candidates.`,
      status: getOfferLoopStatus('convert_to_paid', paidConversionRate),
    } : null,
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const routeMap = new Map<string, {
    key: string
    destinationType: string
    destinationDescriptor: string
    stages: Set<GuestTrialBookingStage>
    offerNames: Set<string>
    candidateCount: number
    outcomeCount: number
    baseCount: number
    status: 'healthy' | 'watch' | 'at_risk'
  }>()

  for (const offer of offerLoop) {
    const routeKey = `${offer.destinationType}:${offer.destinationDescriptor}`
    const existing = routeMap.get(routeKey) || {
      key: routeKey,
      destinationType: offer.destinationType,
      destinationDescriptor: offer.destinationDescriptor,
      stages: new Set<GuestTrialBookingStage>(),
      offerNames: new Set<string>(),
      candidateCount: 0,
      outcomeCount: 0,
      baseCount: 0,
      status: 'healthy' as const,
    }
    existing.stages.add(offer.stage)
    existing.offerNames.add(offer.name)
    existing.candidateCount += offer.candidateCount
    existing.outcomeCount += offer.outcomeCount
    existing.baseCount += offer.baseCount
    existing.status = mergeLoopStatus(existing.status, offer.status)
    routeMap.set(routeKey, existing)
  }

  const routeLoop = Array.from(routeMap.values())
    .map((route) => {
      const stages = Array.from(route.stages.values())
      const offerNames = Array.from(route.offerNames.values())
      const rate = toPercent(route.outcomeCount, route.baseCount)
      const stageSummary = stages.map((stage) => getStageLabel(stage)).join(', ')
      const offerSummary = offerNames.join(', ')
      return {
        key: route.key,
        destinationType: route.destinationType,
        destinationDescriptor: route.destinationDescriptor,
        stageCount: stages.length,
        stages,
        offerNames,
        candidateCount: route.candidateCount,
        outcomeCount: route.outcomeCount,
        baseCount: route.baseCount,
        rate,
        outcomeLabel: 'Combined routed outcomes',
        summary: route.baseCount === 0
          ? `${route.destinationDescriptor} is configured for ${stageSummary}, but there is no live guest/trial cohort on that route yet.`
          : `${route.destinationDescriptor} is carrying ${stageSummary} via ${offerSummary}. Combined stage performance is ${rate}% (${route.outcomeCount}/${route.baseCount}), with ${route.candidateCount} members still in play across that route.`,
        status: route.status,
      }
    })
    .sort((a, b) => {
      const severity = { at_risk: 0, watch: 1, healthy: 2 } as const
      const severityDelta = severity[a.status] - severity[b.status]
      if (severityDelta !== 0) return severityDelta
      return b.candidateCount - a.candidateCount
    })

  return {
    summary: {
      totalCandidates: sorted.length,
      firstBookingCount,
      showUpProtectionCount,
      paidConversionCount,
      averageScore,
      summary,
      offers: {
        firstVisit: firstVisitOffer,
        showUpProtection: showUpProtectionOffer,
        paidConversion: paidConversionOffer,
      },
      offerLoop,
      routeLoop,
      funnel: {
        entrantCount,
        bookedCount,
        showedUpCount,
        paidCount,
        bookingRate,
        showUpRate,
        paidConversionRate,
        summary: funnelSummary,
      },
    },
    candidates: sorted,
  }
}
