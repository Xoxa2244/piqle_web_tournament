import 'server-only'

import { normalizeMembership, resolveMembershipMappings } from './membership-intelligence'

export type AdvisorMembershipLifecycleKind = 'trial_follow_up' | 'renewal_reactivation'

export type AdvisorMembershipLifecycleCandidate = {
  memberId: string
  name: string
  score: number
  daysSinceSignal: number
  membershipStatus: string
  topReason: string
}

type MembershipSignalRow = {
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

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function daysBetween(now: Date, earlier: Date) {
  return Math.max(0, Math.floor((now.getTime() - earlier.getTime()) / 86400000))
}

export function getAdvisorMembershipLifecycleMeta(kind: AdvisorMembershipLifecycleKind) {
  if (kind === 'trial_follow_up') {
    return {
      label: 'Trial members with no first booking',
      title: 'Prepare trial follow-up',
      campaignType: 'RETENTION_BOOST' as const,
      emptyTitle: 'I could not find trial members who still need a first-play follow-up right now.',
      readyText: (count: number) => `I found ${count} trial members who still need a first-play follow-up. Review the draft below and approve when you're ready.`,
      suggestions: [
        'Use SMS instead',
        'Only keep the top 3 trial members',
        'Schedule this for tomorrow at 6pm',
      ],
    }
  }

  return {
    label: 'Recently active members with expired membership',
    title: 'Prepare renewal outreach',
    campaignType: 'REACTIVATION' as const,
    emptyTitle: 'I could not find strong renewal outreach candidates right now.',
    readyText: (count: number) => `I found ${count} recently active members whose membership needs renewal outreach. Review the draft below and approve when you're ready.`,
    suggestions: [
      'Use SMS instead',
      'Only keep the top 5 renewal candidates',
      'Schedule this for tomorrow at 9am',
    ],
  }
}

async function loadMembershipLifecycleRows(prisma: any, clubId: string): Promise<MembershipSignalRow[]> {
  return prisma.$queryRawUnsafe(`
    SELECT
      cf.user_id as "userId",
      cf.created_at as "followedAt",
      u.created_at as "userCreatedAt",
      u.name,
      u.email,
      u.membership_type as "membershipType",
      u.membership_status as "membershipStatus",
      MAX(psb."bookedAt") FILTER (
        WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
      ) as "lastConfirmedBookingAt",
      COUNT(psb.id) FILTER (
        WHERE psb.status = 'CONFIRMED' AND ps."clubId" = $1
      )::int as "confirmedBookings"
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    LEFT JOIN play_session_bookings psb ON psb."userId" = u.id
    LEFT JOIN play_sessions ps ON ps.id = psb."sessionId"
    WHERE cf.club_id = $1
      AND u.email NOT LIKE '%placeholder%'
      AND u.email NOT LIKE '%demo%'
    GROUP BY
      cf.user_id,
      cf.created_at,
      u.created_at,
      u.name,
      u.email,
      u.membership_type,
      u.membership_status
  `, clubId) as Promise<MembershipSignalRow[]>
}

export async function getAdvisorMembershipLifecycleCandidates(opts: {
  prisma: any
  clubId: string
  kind: AdvisorMembershipLifecycleKind
  limit: number
  now?: Date
  automationSettings?: unknown
}): Promise<AdvisorMembershipLifecycleCandidate[]> {
  const rows = await loadMembershipLifecycleRows(opts.prisma, opts.clubId)
  const now = opts.now || new Date()
  const membershipMappings = resolveMembershipMappings(opts.automationSettings)

  const candidates = rows.flatMap((row) => {
    const normalizedMembership = normalizeMembership({
      membershipType: row.membershipType,
      membershipStatus: row.membershipStatus,
      membershipMappings,
    })
    const followedAt = row.followedAt ? new Date(row.followedAt) : null
    const userCreatedAt = row.userCreatedAt ? new Date(row.userCreatedAt) : null
    const joinedAt = followedAt || userCreatedAt
    const lastConfirmedBookingAt = row.lastConfirmedBookingAt ? new Date(row.lastConfirmedBookingAt) : null
    const confirmedBookings = Number(row.confirmedBookings || 0)
    const displayName = row.name || row.email || 'Unknown'

    if (opts.kind === 'trial_follow_up') {
      if (!joinedAt) return []
      const daysSinceJoined = daysBetween(now, joinedAt)
      const isTrial = normalizedMembership.normalizedStatus === 'trial' || normalizedMembership.normalizedType === 'trial'
      if (!isTrial) return []
      if (daysSinceJoined < 1 || daysSinceJoined > 14) return []
      if (confirmedBookings > 0) return []

      return [{
        memberId: row.userId,
        name: displayName,
        score: clampScore(96 - daysSinceJoined * 3 + normalizedMembership.confidence * 0.08, 55, 99),
        daysSinceSignal: daysSinceJoined,
        membershipStatus: normalizedMembership.normalizedStatus,
        topReason: `${daysSinceJoined} day${daysSinceJoined === 1 ? '' : 's'} since joining and still no confirmed first booking.`,
      }]
    }

    if (!lastConfirmedBookingAt) return []
    const daysSinceLastBooking = daysBetween(now, lastConfirmedBookingAt)
    const isRenewalCase = ['expired', 'cancelled', 'suspended'].includes(normalizedMembership.normalizedStatus)
    if (!isRenewalCase) return []
    if (daysSinceLastBooking > 21) return []

    return [{
      memberId: row.userId,
      name: displayName,
      score: clampScore(92 - daysSinceLastBooking * 2 + normalizedMembership.confidence * 0.08, 50, 98),
      daysSinceSignal: daysSinceLastBooking,
      membershipStatus: normalizedMembership.normalizedStatus,
      topReason: `Recently active ${daysSinceLastBooking} day${daysSinceLastBooking === 1 ? '' : 's'} ago before membership became ${normalizedMembership.normalizedStatus}.`,
    }]
  })

  return candidates
    .sort((a, b) => b.score - a.score || a.daysSinceSignal - b.daysSinceSignal)
    .slice(0, Math.max(1, opts.limit))
}
