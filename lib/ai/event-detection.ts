/**
 * Event Detection — reacts to recent changes for a specific club.
 *
 * Called immediately after CourtReserve sync completes for each club.
 * Also callable standalone via /api/agent/events for debugging.
 *
 * Detects:
 * 1. Booking cancellations → queue slot filler for that session
 * 2. Underfilled sessions (<50% in next 48h) → auto-invite top matches
 * 3. New members (API clubs) → start onboarding sequence
 * 4. Trial members with no booking yet → follow-up opportunity
 * 5. Recently active expired/suspended members → renewal/reactivation opportunity
 */

import { cronLogger as log } from '@/lib/logger'
import { isAgentLive } from '@/lib/ai/agent-utils'
import {
  buildAgentTriggerReasoning,
  evaluateAgentTriggerRuntime,
} from '@/lib/ai/agent-trigger-runtime'
import { normalizeMembership } from '@/lib/ai/membership-intelligence'

export interface EventResult {
  clubId: string
  clubName: string
  cancellations: number
  underfilled: number
  newMembers: number
  trialFollowUps: number
  renewalOpportunities: number
  actionsTaken: number
  dryRun: boolean
}

/**
 * Detect and react to events for a single club.
 * @param sinceMins — how far back to look for events (default: 75 min, covers hourly sync + buffer)
 */
export async function detectEventsForClub(
  prisma: any,
  clubId: string,
  clubName: string,
  sinceMins: number = 75,
): Promise<EventResult> {
  const now = new Date()
  const sinceDate = new Date(now.getTime() - sinceMins * 60 * 1000)
  const fortyEightHours = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000)

  const live = await isAgentLive(prisma, clubId)
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { automationSettings: true },
  }).catch(() => null)
  const automationSettings = club?.automationSettings
  let actionsTaken = 0

  // 1. Recent cancellations → slot filler opportunity
  const cancellations: any[] = await prisma.$queryRawUnsafe(`
    SELECT b.id, b."sessionId", b."userId", ps.title, ps.date, ps."startTime", ps."maxPlayers",
      (SELECT COUNT(*) FROM play_session_bookings b2 WHERE b2."sessionId" = ps.id AND b2.status = 'CONFIRMED') as confirmed
    FROM play_session_bookings b
    JOIN play_sessions ps ON ps.id = b."sessionId"
    WHERE ps."clubId" = $1
      AND b.status = 'CANCELLED'
      AND b."cancelledAt" >= $2
      AND ps.date >= $3
      AND ps.date <= $4
  `, clubId, sinceDate.toISOString(), now.toISOString(), fortyEightHours.toISOString())

  // 2. Underfilled sessions in next 48h
  const underfilled: any[] = await prisma.$queryRawUnsafe(`
    SELECT ps.id, ps.title, ps.date, ps."startTime", ps."maxPlayers", ps.format, ps."skillLevel",
      (SELECT COUNT(*) FROM play_session_bookings b WHERE b."sessionId" = ps.id AND b.status = 'CONFIRMED') as confirmed
    FROM play_sessions ps
    WHERE ps."clubId" = $1
      AND ps.status = 'SCHEDULED'
      AND ps.date >= $2
      AND ps.date <= $3
      AND ps."maxPlayers" > 0
    HAVING (SELECT COUNT(*) FROM play_session_bookings b WHERE b."sessionId" = ps.id AND b.status = 'CONFIRMED')::float / ps."maxPlayers" < 0.5
    ORDER BY ps.date ASC
    LIMIT 10
  `, clubId, now.toISOString(), fortyEightHours.toISOString())

  // 3. New members (created since last sync)
  const newMembers: any[] = await prisma.$queryRawUnsafe(`
    SELECT cf.user_id as "userId", u.name, u.email, u.membership_type as "membershipType", u.membership_status as "membershipStatus"
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    WHERE cf.club_id = $1
      AND cf.created_at >= $2
      AND u.email NOT LIKE '%placeholder%'
      AND u.email NOT LIKE '%demo%'
  `, clubId, sinceDate.toISOString())

  const membershipSignals: any[] = await prisma.$queryRawUnsafe(`
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
  `, clubId)

  const trialCandidates = membershipSignals.filter((member) => {
    const normalizedMembership = normalizeMembership({
      membershipType: member.membershipType,
      membershipStatus: member.membershipStatus,
    })
    const followedAt = member.followedAt ? new Date(member.followedAt) : null
    const joinedAt = followedAt || (member.userCreatedAt ? new Date(member.userCreatedAt) : null)
    const confirmedBookings = Number(member.confirmedBookings || 0)

    if (!joinedAt) return false
    if (joinedAt > oneDayAgo || joinedAt < fourteenDaysAgo) return false
    if (!['trial'].includes(normalizedMembership.normalizedStatus) && !['trial'].includes(normalizedMembership.normalizedType)) return false

    return confirmedBookings === 0
  })

  const renewalCandidates = membershipSignals.filter((member) => {
    const normalizedMembership = normalizeMembership({
      membershipType: member.membershipType,
      membershipStatus: member.membershipStatus,
    })
    const lastConfirmedBookingAt = member.lastConfirmedBookingAt ? new Date(member.lastConfirmedBookingAt) : null

    if (!lastConfirmedBookingAt || lastConfirmedBookingAt < twentyOneDaysAgo) return false

    return ['expired', 'cancelled', 'suspended'].includes(normalizedMembership.normalizedStatus)
  })

  // Log events
  if (cancellations.length > 0 || underfilled.length > 0 || newMembers.length > 0 || trialCandidates.length > 0 || renewalCandidates.length > 0) {
    log.info(`Club ${clubName}: ${cancellations.length} cancels, ${underfilled.length} underfilled, ${newMembers.length} new members, ${trialCandidates.length} trial follow-ups, ${renewalCandidates.length} renewal opportunities`)
  }

  // Act on underfilled sessions (slot filler autopilot)
  if (live && underfilled.length > 0) {
    for (const session of underfilled.slice(0, 5)) {
      const slotRuntime = evaluateAgentTriggerRuntime({
        source: 'event_detection',
        triggerMode: 'deferred',
        action: 'slotFiller',
        automationSettings,
        liveMode: live,
        confidence: 75,
        recipientCount: 5,
        membershipSignal: 'weak',
      })
      if (slotRuntime.decision.outcome === 'blocked') continue

      const recentInvites = await prisma.aIRecommendationLog.count({
        where: {
          clubId,
          type: 'SLOT_FILLER',
          sessionId: session.id,
          createdAt: { gte: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
        },
      })
      if (recentInvites >= 5) continue

      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: 'system',
          type: 'SLOT_FILLER',
          sessionId: session.id,
          status: 'pending',
          reasoning: buildAgentTriggerReasoning(slotRuntime, {
            sessionTitle: session.title,
            sessionDate: session.date,
            confirmed: Number(session.confirmed),
            maxPlayers: session.maxPlayers,
            occupancy: Math.round(Number(session.confirmed) / session.maxPlayers * 100),
          }),
        },
      }).catch(() => {})
      actionsTaken++
    }
  }

  // Act on new members (onboarding)
  if (live && newMembers.length > 0) {
    for (const member of newMembers) {
      const normalizedMembership = normalizeMembership({
        membershipType: member.membershipType,
        membershipStatus: member.membershipStatus,
      })
      const welcomeRuntime = evaluateAgentTriggerRuntime({
        source: 'event_detection',
        triggerMode: 'immediate',
        action: 'welcome',
        automationSettings,
        liveMode: live,
        confidence: 95,
        recipientCount: 1,
        membershipSignal: normalizedMembership.signal,
        membershipStatus: normalizedMembership.normalizedStatus,
        membershipType: normalizedMembership.normalizedType,
        membershipConfidence: normalizedMembership.confidence,
      })
      if (welcomeRuntime.decision.outcome === 'blocked') continue

      const alreadyWelcomed = await prisma.aIRecommendationLog.count({
        where: {
          clubId,
          userId: member.userId,
          type: 'NEW_MEMBER_WELCOME',
        },
      })
      if (alreadyWelcomed > 0) continue

      if (welcomeRuntime.decision.outcome === 'pending') {
        await prisma.aIRecommendationLog.create({
          data: {
            clubId,
            userId: member.userId,
            type: 'NEW_MEMBER_WELCOME',
            channel: 'email',
            status: 'pending',
            reasoning: buildAgentTriggerReasoning(welcomeRuntime, {
              memberName: member.name,
            }),
          },
        }).catch(() => {})
        actionsTaken++
        continue
      }

      try {
        const { sendOutreachEmail } = await import('@/lib/email')
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
        const firstName = member.name?.split(' ')[0] || 'there'

        await sendOutreachEmail({
          to: member.email,
          subject: `Welcome to ${clubName}! 🏓`,
          body: `Hey ${firstName}!\n\nWelcome to ${clubName}! We're excited to have you join our community.\n\nCheck out our upcoming sessions and find the perfect game for your level. We have Open Play, Clinics, and Leagues — there's something for everyone.\n\nSee you on the courts!`,
          clubName,
          bookingUrl: `${baseUrl}/clubs/${clubId}/play`,
        })

        await prisma.aIRecommendationLog.create({
          data: {
            clubId,
            userId: member.userId,
            type: 'NEW_MEMBER_WELCOME',
            channel: 'email',
            sequenceStep: 0,
            status: 'sent',
            reasoning: buildAgentTriggerReasoning(welcomeRuntime, {
              memberName: member.name,
            }),
          },
        }).catch(() => {})
        actionsTaken++
      } catch (err) {
        log.error(`Welcome email failed for ${member.name}:`, (err as Error).message?.slice(0, 80))
      }
    }
  }

  let trialFollowUps = 0
  let renewalOpportunities = 0

  if (trialCandidates.length > 0) {
    for (const member of trialCandidates.slice(0, 8)) {
      const normalizedMembership = normalizeMembership({
        membershipType: member.membershipType,
        membershipStatus: member.membershipStatus,
      })
      const joinedAt = member.followedAt ? new Date(member.followedAt) : new Date(member.userCreatedAt)
      const daysSinceJoined = Math.max(1, Math.floor((now.getTime() - joinedAt.getTime()) / 86400000))
      const recentTrialLog = await prisma.aIRecommendationLog.count({
        where: {
          clubId,
          userId: member.userId,
          type: 'RETENTION_BOOST',
          createdAt: { gte: fourteenDaysAgo },
        },
      })
      if (recentTrialLog > 0) continue

      const runtime = evaluateAgentTriggerRuntime({
        source: 'event_detection',
        triggerMode: 'deferred',
        action: 'trialFollowUp',
        automationSettings,
        liveMode: live,
        confidence: Math.max(82, normalizedMembership.confidence),
        recipientCount: 1,
        membershipSignal: normalizedMembership.signal,
        membershipStatus: normalizedMembership.normalizedStatus,
        membershipType: normalizedMembership.normalizedType,
        membershipConfidence: normalizedMembership.confidence,
      })

      const actualOutcome = runtime.decision.outcome === 'blocked' ? 'blocked' : 'pending'
      const actualReasons = runtime.decision.outcome === 'blocked'
        ? runtime.decision.reasons
        : runtime.decision.outcome === 'auto'
          ? ['Trial follow-up is auto-ready under current policy, but direct lifecycle auto-send still stays in review until execution is enabled.']
          : ['Trial member follow-up queued for human review.']

      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: member.userId,
          type: 'RETENTION_BOOST',
          channel: 'email',
          status: actualOutcome === 'blocked' ? 'blocked' : 'pending',
          reasoning: buildAgentTriggerReasoning(runtime, {
            memberName: member.name,
            membershipLifecycle: 'trial_follow_up',
            transition: 'trial -> first booking',
            daysSinceJoined,
            confirmedBookings: 0,
          }, {
            outcome: actualOutcome,
            reasons: actualReasons,
          }),
        },
      }).catch(() => {})

      trialFollowUps++
      if (actualOutcome === 'pending') actionsTaken++
    }
  }

  if (renewalCandidates.length > 0) {
    for (const member of renewalCandidates.slice(0, 8)) {
      const normalizedMembership = normalizeMembership({
        membershipType: member.membershipType,
        membershipStatus: member.membershipStatus,
      })
      const lastConfirmedBookingAt = member.lastConfirmedBookingAt ? new Date(member.lastConfirmedBookingAt) : null
      if (!lastConfirmedBookingAt) continue

      const daysSinceLastBooking = Math.max(0, Math.floor((now.getTime() - lastConfirmedBookingAt.getTime()) / 86400000))
      const recentRenewalLog = await prisma.aIRecommendationLog.count({
        where: {
          clubId,
          userId: member.userId,
          type: 'REACTIVATION',
          createdAt: { gte: fourteenDaysAgo },
        },
      })
      if (recentRenewalLog > 0) continue

      const runtime = evaluateAgentTriggerRuntime({
        source: 'event_detection',
        triggerMode: 'deferred',
        action: 'renewalReactivation',
        automationSettings,
        liveMode: live,
        confidence: Math.max(88, normalizedMembership.confidence),
        recipientCount: 1,
        membershipSignal: normalizedMembership.signal,
        membershipStatus: normalizedMembership.normalizedStatus,
        membershipType: normalizedMembership.normalizedType,
        membershipConfidence: normalizedMembership.confidence,
      })

      const actualOutcome = runtime.decision.outcome === 'blocked' ? 'blocked' : 'pending'
      const actualReasons = runtime.decision.outcome === 'blocked'
        ? runtime.decision.reasons
        : runtime.decision.outcome === 'auto'
          ? ['Renewal outreach is auto-ready under current policy, but direct lifecycle auto-send still stays in review until execution is enabled.']
          : ['Renewal opportunity queued for human review.']

      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: member.userId,
          type: 'REACTIVATION',
          channel: 'email',
          status: actualOutcome === 'blocked' ? 'blocked' : 'pending',
          reasoning: buildAgentTriggerReasoning(runtime, {
            memberName: member.name,
            membershipLifecycle: 'renewal_reactivation',
            transition: `${normalizedMembership.normalizedStatus} -> renewal`,
            lastConfirmedBookingAt: lastConfirmedBookingAt.toISOString(),
            daysSinceLastBooking,
          }, {
            outcome: actualOutcome,
            reasons: actualReasons,
          }),
        },
      }).catch(() => {})

      renewalOpportunities++
      if (actualOutcome === 'pending') actionsTaken++
    }
  }

  return {
    clubId,
    clubName,
    cancellations: cancellations.length,
    underfilled: underfilled.length,
    newMembers: newMembers.length,
    trialFollowUps,
    renewalOpportunities,
    actionsTaken,
    dryRun: !live,
  }
}

/**
 * Detect events for ALL API-connected clubs.
 * Used by /api/agent/events route for manual/debug runs.
 */
export async function detectEventsAllClubs(prisma: any, sinceMins: number = 75): Promise<EventResult[]> {
  const clubs: any[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT cc.club_id as "clubId", c.name as "clubName"
    FROM club_connectors cc
    JOIN clubs c ON c.id = cc.club_id
    WHERE cc.provider = 'courtreserve'
      AND cc.auto_sync = true
      AND cc.status IN ('connected', 'error')
  `)

  const results: EventResult[] = []
  for (const club of clubs) {
    const result = await detectEventsForClub(prisma, club.clubId, club.clubName, sinceMins)
    results.push(result)
  }

  return results
}
