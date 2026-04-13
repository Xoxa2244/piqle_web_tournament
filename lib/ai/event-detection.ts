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
 */

import { cronLogger as log } from '@/lib/logger'
import { isAgentLive } from '@/lib/ai/agent-utils'
import { evaluateAgentAutonomy } from '@/lib/ai/agent-autonomy'

export interface EventResult {
  clubId: string
  clubName: string
  cancellations: number
  underfilled: number
  newMembers: number
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
    SELECT cf.user_id as "userId", u.name, u.email
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    WHERE cf.club_id = $1
      AND cf.created_at >= $2
      AND u.email NOT LIKE '%placeholder%'
      AND u.email NOT LIKE '%demo%'
  `, clubId, sinceDate.toISOString())

  // Log events
  if (cancellations.length > 0 || underfilled.length > 0 || newMembers.length > 0) {
    log.info(`Club ${clubName}: ${cancellations.length} cancels, ${underfilled.length} underfilled, ${newMembers.length} new members`)
  }

  // Act on underfilled sessions (slot filler autopilot)
  if (live && underfilled.length > 0) {
    for (const session of underfilled.slice(0, 5)) {
      const slotDecision = evaluateAgentAutonomy({
        action: 'slotFiller',
        automationSettings,
        liveMode: live,
        confidence: 75,
        recipientCount: 5,
        membershipSignal: 'weak',
      })
      if (slotDecision.outcome === 'blocked') continue

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
          reasoning: {
            source: 'event_detection',
            sessionTitle: session.title,
            sessionDate: session.date,
            confirmed: Number(session.confirmed),
            maxPlayers: session.maxPlayers,
            occupancy: Math.round(Number(session.confirmed) / session.maxPlayers * 100),
            confidence: 75,
            autoApproved: slotDecision.outcome === 'auto',
            autonomy: slotDecision,
          },
        },
      }).catch(() => {})
      actionsTaken++
    }
  }

  // Act on new members (onboarding)
  if (live && newMembers.length > 0) {
    for (const member of newMembers) {
      const welcomeDecision = evaluateAgentAutonomy({
        action: 'welcome',
        automationSettings,
        liveMode: live,
        confidence: 95,
        recipientCount: 1,
        membershipSignal: 'weak',
      })
      if (welcomeDecision.outcome === 'blocked') continue

      const alreadyWelcomed = await prisma.aIRecommendationLog.count({
        where: {
          clubId,
          userId: member.userId,
          type: 'NEW_MEMBER_WELCOME',
        },
      })
      if (alreadyWelcomed > 0) continue

      if (welcomeDecision.outcome === 'pending') {
        await prisma.aIRecommendationLog.create({
          data: {
            clubId,
            userId: member.userId,
            type: 'NEW_MEMBER_WELCOME',
            channel: 'email',
            status: 'pending',
            reasoning: {
              source: 'event_detection',
              confidence: 95,
              autoApproved: false,
              autonomy: welcomeDecision,
              memberName: member.name,
            },
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
            reasoning: {
              source: 'event_detection',
              confidence: 95,
              autoApproved: true,
              autonomy: welcomeDecision,
              memberName: member.name,
            },
          },
        }).catch(() => {})
        actionsTaken++
      } catch (err) {
        log.error(`Welcome email failed for ${member.name}:`, (err as Error).message?.slice(0, 80))
      }
    }
  }

  return {
    clubId,
    clubName,
    cancellations: cancellations.length,
    underfilled: underfilled.length,
    newMembers: newMembers.length,
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
