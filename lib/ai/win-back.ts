import { normalizeMembership, resolveMembershipMappings } from './membership-intelligence'

export type WinBackStage = 'expired_membership' | 'cancelled_membership' | 'high_value_lapsed'
export type WinBackUrgency = 'low' | 'medium' | 'high'

export interface WinBackCandidate {
  memberId: string
  name: string
  email: string | null
  score: number
  stage: WinBackStage
  urgency: WinBackUrgency
  daysSinceLastBooking: number
  confirmedBookings: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  topReason: string
  nextBestMove: string
}

export interface WinBackSnapshot {
  summary: {
    totalCandidates: number
    expiredCount: number
    cancelledCount: number
    lapsedCount: number
    averageScore: number
    summary: string
    laneLoop: Array<{
      key: string
      stage: WinBackStage
      title: string
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    funnel: {
      recoverableCount: number
      formerPaidCount: number
      warmWindowCount: number
      highIntentCount: number
      highValueLapsedCount: number
      warmWindowRate: number
      highIntentRate: number
      summary: string
    }
  }
  candidates: WinBackCandidate[]
}

export interface WinBackRow {
  userId: string
  followedAt: string | Date | null
  userCreatedAt: string | Date | null
  name: string | null
  email: string | null
  membershipType: string | null
  membershipStatus: string | null
  lastConfirmedBookingAt: string | Date | null
  confirmedBookings: number | string | null
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

function getUrgency(daysSinceLastBooking: number): WinBackUrgency {
  if (daysSinceLastBooking <= 14) return 'high'
  if (daysSinceLastBooking <= 30) return 'medium'
  return 'low'
}

function isPaidLike(type: string, status: string) {
  return ['package', 'monthly', 'unlimited', 'discounted'].includes(type)
    || (status === 'active' && !['guest', 'trial', 'none', 'unknown'].includes(type))
}

function scoreExpired(daysSinceLastBooking: number, confirmedBookings: number, confidence: number) {
  return clamp(94 - daysSinceLastBooking * 1.5 + Math.min(confirmedBookings, 14) * 1.6 + confidence * 0.05, 55, 99)
}

function scoreCancelled(daysSinceLastBooking: number, confirmedBookings: number, confidence: number) {
  return clamp(90 - daysSinceLastBooking * 1.4 + Math.min(confirmedBookings, 14) * 1.8 + confidence * 0.05, 52, 97)
}

function scoreHighValueLapsed(daysSinceLastBooking: number, confirmedBookings: number, confidence: number) {
  return clamp(84 - Math.max(daysSinceLastBooking - 21, 0) * 0.9 + Math.min(confirmedBookings, 24) * 1.4 + confidence * 0.04, 48, 95)
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function getWinBackLaneStatus(stage: WinBackStage, rate: number): 'healthy' | 'watch' | 'at_risk' {
  if (stage === 'high_value_lapsed') {
    if (rate >= 45) return 'healthy'
    if (rate >= 25) return 'watch'
    return 'at_risk'
  }

  if (rate >= 55) return 'healthy'
  if (rate >= 30) return 'watch'
  return 'at_risk'
}

export function buildWinBackSnapshot(opts: {
  rows: WinBackRow[]
  automationSettings?: unknown
  now?: Date
  windowDays?: number
  limit?: number
}): WinBackSnapshot {
  const now = opts.now || new Date()
  const windowDays = opts.windowDays ?? 60
  const limit = opts.limit ?? 8
  const membershipMappings = resolveMembershipMappings(opts.automationSettings)

  const candidates = opts.rows.flatMap<WinBackCandidate>((row) => {
    const lastConfirmedBookingAt = toDate(row.lastConfirmedBookingAt)
    const confirmedBookings = Number(row.confirmedBookings || 0)
    if (!lastConfirmedBookingAt || confirmedBookings <= 0) return []

    const normalizedMembership = normalizeMembership({
      membershipType: row.membershipType,
      membershipStatus: row.membershipStatus,
      membershipMappings,
    })

    const normalizedType = normalizedMembership.normalizedType
    const normalizedStatus = normalizedMembership.normalizedStatus
    const daysSinceLastBooking = daysBetween(now, lastConfirmedBookingAt)
    const displayName = row.name || row.email || 'Unknown'

    if (daysSinceLastBooking > windowDays) return []

    if (normalizedStatus === 'expired') {
      return [{
        memberId: row.userId,
        name: displayName,
        email: row.email,
        score: scoreExpired(daysSinceLastBooking, confirmedBookings, normalizedMembership.confidence),
        stage: 'expired_membership',
        urgency: getUrgency(daysSinceLastBooking),
        daysSinceLastBooking,
        confirmedBookings,
        normalizedMembershipType: normalizedType,
        normalizedMembershipStatus: normalizedStatus,
        topReason: `Membership expired ${daysSinceLastBooking} day${daysSinceLastBooking === 1 ? '' : 's'} after their last confirmed play, so this is still a warm renewal window.`,
        nextBestMove: 'Lead with a simple renewal offer tied to the next easiest session they can book.',
      }]
    }

    if (normalizedStatus === 'cancelled') {
      return [{
        memberId: row.userId,
        name: displayName,
        email: row.email,
        score: scoreCancelled(daysSinceLastBooking, confirmedBookings, normalizedMembership.confidence),
        stage: 'cancelled_membership',
        urgency: getUrgency(daysSinceLastBooking),
        daysSinceLastBooking,
        confirmedBookings,
        normalizedMembershipType: normalizedType,
        normalizedMembershipStatus: normalizedStatus,
        topReason: `Membership was cancelled even though they already logged ${confirmedBookings} confirmed session${confirmedBookings === 1 ? '' : 's'} with the club.`,
        nextBestMove: 'Use a softer win-back message that acknowledges the break and offers the easiest way back in.',
      }]
    }

    if (
      confirmedBookings >= 6
      && daysSinceLastBooking >= 21
      && daysSinceLastBooking <= windowDays
      && !['expired', 'cancelled', 'suspended', 'trial', 'guest', 'none'].includes(normalizedStatus)
      && isPaidLike(normalizedType, normalizedStatus)
    ) {
      return [{
        memberId: row.userId,
        name: displayName,
        email: row.email,
        score: scoreHighValueLapsed(daysSinceLastBooking, confirmedBookings, normalizedMembership.confidence),
        stage: 'high_value_lapsed',
        urgency: daysSinceLastBooking >= 35 ? 'high' : 'medium',
        daysSinceLastBooking,
        confirmedBookings,
        normalizedMembershipType: normalizedType,
        normalizedMembershipStatus: normalizedStatus,
        topReason: `High-value member with ${confirmedBookings} confirmed sessions has been quiet for ${daysSinceLastBooking} days without formally churning.`,
        nextBestMove: 'Treat this like a save, not a blast: personalize the comeback path around their past play habit.',
      }]
    }

    return []
  })

  const deduped = new Map<string, WinBackCandidate>()
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

  const expiredCount = sorted.filter((candidate) => candidate.stage === 'expired_membership').length
  const cancelledCount = sorted.filter((candidate) => candidate.stage === 'cancelled_membership').length
  const lapsedCount = sorted.filter((candidate) => candidate.stage === 'high_value_lapsed').length
  const averageScore = sorted.length > 0
    ? Math.round(sorted.reduce((sum, candidate) => sum + candidate.score, 0) / sorted.length)
    : 0

  const summary = sorted.length === 0
    ? 'No strong win-back opportunities right now.'
    : `${sorted.length} members are in a live win-back window. ${expiredCount} are expired, ${cancelledCount} are cancelled, and ${lapsedCount} are high-value lapsed members who may still come back with the right nudge.`

  const recoverableCount = allCandidates.length
  const formerPaidCount = allCandidates.filter((candidate) => (
    candidate.stage === 'expired_membership' || candidate.stage === 'cancelled_membership'
  )).length
  const warmWindowCount = allCandidates.filter((candidate) => (
    (candidate.stage === 'expired_membership' || candidate.stage === 'cancelled_membership')
    && candidate.daysSinceLastBooking <= 14
  )).length
  const highIntentCount = allCandidates.filter((candidate) => candidate.score >= 80).length
  const highValueLapsedCount = allCandidates.filter((candidate) => candidate.stage === 'high_value_lapsed').length
  const warmWindowRate = toPercent(warmWindowCount, formerPaidCount)
  const highIntentRate = toPercent(highIntentCount, recoverableCount)
  const funnelSummary = recoverableCount === 0
    ? 'No live win-back funnel data in the current window yet.'
    : `${formerPaidCount}/${recoverableCount} are former paid members, ${warmWindowCount}/${Math.max(formerPaidCount, 1)} are still in a warm comeback window, ${highIntentCount}/${recoverableCount} score as high-intent win-back candidates, and ${highValueLapsedCount} are high-value lapsed saves.`
  const expiredWarmCount = allCandidates.filter((candidate) => (
    candidate.stage === 'expired_membership' && candidate.daysSinceLastBooking <= 14
  )).length
  const cancelledWarmCount = allCandidates.filter((candidate) => (
    candidate.stage === 'cancelled_membership' && candidate.daysSinceLastBooking <= 14
  )).length
  const lapsedHighIntentCount = allCandidates.filter((candidate) => (
    candidate.stage === 'high_value_lapsed' && candidate.score >= 80
  )).length
  const expiredWarmRate = toPercent(expiredWarmCount, expiredCount)
  const cancelledWarmRate = toPercent(cancelledWarmCount, cancelledCount)
  const lapsedHighIntentRate = toPercent(lapsedHighIntentCount, lapsedCount)
  const laneLoop = [
    expiredCount > 0 ? {
      key: 'expired-renewal-lane',
      stage: 'expired_membership' as const,
      title: 'Expired renewal rescue',
      candidateCount: expiredCount,
      outcomeCount: expiredWarmCount,
      baseCount: expiredCount,
      rate: expiredWarmRate,
      outcomeLabel: 'Still in the warm renewal window',
      summary: `${expiredWarmCount} of ${expiredCount} expired members are still within 14 days of their last confirmed play, so this lane should be treated like a warm renewal rescue rather than a cold blast.`,
      status: getWinBackLaneStatus('expired_membership', expiredWarmRate),
    } : null,
    cancelledCount > 0 ? {
      key: 'cancelled-comeback-lane',
      stage: 'cancelled_membership' as const,
      title: 'Cancelled comeback',
      candidateCount: cancelledCount,
      outcomeCount: cancelledWarmCount,
      baseCount: cancelledCount,
      rate: cancelledWarmRate,
      outcomeLabel: 'Still in the warm comeback window',
      summary: `${cancelledWarmCount} of ${cancelledCount} cancelled members are still close enough to their last session that a soft comeback motion can work better than a generic win-back.`,
      status: getWinBackLaneStatus('cancelled_membership', cancelledWarmRate),
    } : null,
    lapsedCount > 0 ? {
      key: 'high-value-save-lane',
      stage: 'high_value_lapsed' as const,
      title: 'High-value save',
      candidateCount: lapsedCount,
      outcomeCount: lapsedHighIntentCount,
      baseCount: lapsedCount,
      rate: lapsedHighIntentRate,
      outcomeLabel: 'High-intent saves',
      summary: `${lapsedHighIntentCount} of ${lapsedCount} high-value lapsed members still score as high-intent saves, which means this lane benefits from stronger personalization and tighter comeback sequencing.`,
      status: getWinBackLaneStatus('high_value_lapsed', lapsedHighIntentRate),
    } : null,
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  return {
    summary: {
      totalCandidates: sorted.length,
      expiredCount,
      cancelledCount,
      lapsedCount,
      averageScore,
      summary,
      laneLoop,
      funnel: {
        recoverableCount,
        formerPaidCount,
        warmWindowCount,
        highIntentCount,
        highValueLapsedCount,
        warmWindowRate,
        highIntentRate,
        summary: funnelSummary,
      },
    },
    candidates: sorted,
  }
}
