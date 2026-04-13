/**
 * Slot Filler Automation — automated outreach for underfilled sessions.
 *
 * Two modes:
 * - "tomorrow": find tomorrow's sessions, invite best candidates (daily morning)
 * - "lastminute": find sessions starting in 2-6 hours, urgent invites (every 2h)
 *
 * Uses existing slot filler scoring, anti-spam, email/SMS infrastructure.
 * Dry run by default — auto-send only happens when the club is live, the run is not dry,
 * and autonomy policy allows slot filler to execute automatically.
 */

import { PrismaClient } from '@prisma/client'
import { generateSlotFillerRecommendations } from './slot-filler'
import { checkAntiSpam } from './anti-spam'
import { getFrequentPartnerIds } from './partners'
import { sendSlotFillerInviteEmail } from '../email'
import { inferPreferencesFromBookings } from './inferred-preferences'
import {
  buildAgentTriggerReasoning,
  evaluateAgentTriggerRuntime,
} from './agent-trigger-runtime'
import type { MemberData, UserPlayPreferenceData, BookingHistory, PlaySessionData } from '../../types/intelligence'

export type SlotFillerMode = 'tomorrow' | 'lastminute'

interface AutomationOptions {
  mode: SlotFillerMode
  dryRun?: boolean
  maxCandidatesPerSession?: number
  minScore?: number
}

interface ClubResult {
  clubId: string
  clubName: string
  sessionsProcessed: number
  candidatesFound: number
  messagesSent: number
  messagesSkipped: number
  errors: number
  details: SessionResult[]
}

interface SessionResult {
  sessionId: string
  sessionTitle: string
  sessionDate: string
  spotsLeft: number
  candidatesScored: number
  invitesSent: number
  invitesSkipped: number
}

export async function runSlotFillerAutomation(
  prisma: PrismaClient,
  options: AutomationOptions,
): Promise<{ clubs: ClubResult[]; totalSent: number; totalSkipped: number; dryRun: boolean }> {
  const { mode, dryRun = true, maxCandidatesPerSession = 5, minScore = 50 } = options

  // Get all clubs with automation enabled
  const clubs = await prisma.club.findMany({
    where: {
      connectors: { some: { status: 'connected' } },
    },
    select: { id: true, name: true, automationSettings: true },
  })

  const results: ClubResult[] = []
  let totalSent = 0
  let totalSkipped = 0

  for (const club of clubs) {
    const settings = (club.automationSettings as any)?.intelligence || {}
    const isLive = settings.agentLive === true

    try {
      const result = await processClub(prisma, club, mode, {
        dryRun,
        liveMode: isLive,
        maxCandidatesPerSession,
        minScore,
      })
      results.push(result)
      totalSent += result.messagesSent
      totalSkipped += result.messagesSkipped
    } catch (err: any) {
      console.error(`[SlotFiller Auto] Club ${club.name} failed:`, err.message)
      results.push({
        clubId: club.id, clubName: club.name,
        sessionsProcessed: 0, candidatesFound: 0,
        messagesSent: 0, messagesSkipped: 0, errors: 1, details: [],
      })
    }
  }

  return { clubs: results, totalSent, totalSkipped, dryRun }
}

async function processClub(
  prisma: PrismaClient,
  club: { id: string; name: string; automationSettings?: unknown },
  mode: SlotFillerMode,
  options: { dryRun: boolean; liveMode: boolean; maxCandidatesPerSession: number; minScore: number },
): Promise<ClubResult> {
  const { dryRun, liveMode, maxCandidatesPerSession, minScore } = options
  const now = new Date()

  // Find target sessions based on mode
  let dateFrom: Date
  let dateTo: Date

  if (mode === 'tomorrow') {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    dateFrom = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())
    dateTo = new Date(dateFrom.getTime() + 86400000)
  } else {
    // lastminute: sessions starting in 2-6 hours
    dateFrom = new Date(now.getTime() + 2 * 3600000)
    dateTo = new Date(now.getTime() + 6 * 3600000)
  }

  const sessions = await prisma.playSession.findMany({
    where: {
      clubId: club.id,
      date: { gte: dateFrom, lt: dateTo },
      status: 'SCHEDULED',
    },
    include: {
      bookings: {
        where: { status: 'CONFIRMED' },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      clubCourt: { select: { name: true } },
    },
  })

  const result: ClubResult = {
    clubId: club.id, clubName: club.name,
    sessionsProcessed: 0, candidatesFound: 0,
    messagesSent: 0, messagesSkipped: 0, errors: 0, details: [],
  }

  for (const session of sessions) {
    const maxPlayers = session.maxPlayers || 8
    const spotsLeft = maxPlayers - session.bookings.length
    if (spotsLeft <= 0) continue

    result.sessionsProcessed++
    const bookedUserIds = new Set(session.bookings.map(b => b.userId))

    // Load active members not yet booked
    const members = await loadUnbookedMembers(prisma, club.id, bookedUserIds)
    if (members.length === 0) continue

    // Build session data for scoring
    const sessionData = {
      id: session.id,
      clubId: club.id,
      clubCourtId: null,
      title: session.title || 'Session',
      description: null,
      format: session.format as any,
      skillLevel: session.skillLevel as any,
      date: session.date,
      startTime: session.startTime || '00:00',
      endTime: session.endTime || '23:59',
      maxPlayers,
      priceInCents: null,
      hostUserId: null,
      status: 'SCHEDULED' as any,
    } as PlaySessionData

    // Score candidates
    const recommendations = generateSlotFillerRecommendations({
      session: sessionData,
      members,
      alreadyBookedUserIds: bookedUserIds,
    })

    const topCandidates = recommendations
      .filter(r => r.score >= minScore)
      .slice(0, maxCandidatesPerSession)

    result.candidatesFound += topCandidates.length

    const averageScore = topCandidates.length > 0
      ? Math.round(topCandidates.reduce((sum, rec) => sum + rec.score, 0) / topCandidates.length)
      : null
    const runtime = evaluateAgentTriggerRuntime({
      source: 'slot_filler_automation',
      triggerMode: 'immediate',
      action: 'slotFiller',
      automationSettings: club.automationSettings,
      liveMode: liveMode && !dryRun,
      confidence: averageScore,
      recipientCount: topCandidates.length,
      membershipSignal: 'weak',
    })

    const sessionResult: SessionResult = {
      sessionId: session.id,
      sessionTitle: session.title || 'Session',
      sessionDate: session.date.toISOString().split('T')[0],
      spotsLeft,
      candidatesScored: recommendations.length,
      invitesSent: 0,
      invitesSkipped: 0,
    }

    for (const rec of topCandidates) {
      // Anti-spam check
      const spamCheck = await checkAntiSpam({
        prisma,
        userId: rec.member.id,
        clubId: club.id,
        type: 'SLOT_FILLER',
        sessionId: session.id,
      })
      if (!spamCheck.allowed) {
        sessionResult.invitesSkipped++
        result.messagesSkipped++
        continue
      }

      // Build partner-aware social proof
      const socialProof = await buildSocialProof(prisma, rec.member.id, club.id, session.bookings)

      // Build message
      const isLastMinute = mode === 'lastminute'
      const subject = isLastMinute
        ? `Starting soon: ${session.title} at ${session.startTime}`
        : `${session.title} tomorrow — ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left`

      const body = socialProof
        ? `${socialProof} Join the group!`
        : `${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left for ${session.title}. Don't miss out!`

      const deliveryStatus = runtime.decision.outcome === 'blocked'
        ? 'blocked'
        : runtime.decision.outcome === 'pending'
          ? 'pending'
          : 'sent'

      // Send or log
      if (deliveryStatus === 'sent' && rec.member.email) {
        try {
          await sendSlotFillerInviteEmail({
            to: rec.member.email,
            memberName: rec.member.name || rec.member.email.split('@')[0],
            clubName: club.name,
            sessionTitle: session.title || 'Session',
            sessionDate: session.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            sessionTime: `${session.startTime} - ${session.endTime}`,
            spotsLeft,
            bookingUrl: `https://app.iqsport.ai/clubs/${club.id}/intelligence/sessions`,
            customSubject: subject,
            customMessage: body,
          })
        } catch (err: any) {
          console.error(`[SlotFiller Auto] Email failed for ${rec.member.email}:`, err.message)
          result.errors++
        }
      }

      // Log to AIRecommendationLog
      await prisma.aIRecommendationLog.create({
        data: {
          clubId: club.id,
          userId: rec.member.id,
          type: 'SLOT_FILLER',
          channel: isLastMinute ? 'both' : 'email',
          sessionId: session.id,
          score: rec.score,
          variantId: isLastMinute ? 'slot_filler_lastminute' : 'slot_filler_tomorrow',
          status: deliveryStatus,
          reasoning: {
            ...buildAgentTriggerReasoning(runtime, {
              mode,
              score: rec.score,
              estimatedLikelihood: rec.estimatedLikelihood,
              spotsLeft,
              socialProof: socialProof || null,
              dryRun: deliveryStatus !== 'sent',
            }),
          } as any,
        },
      }).catch(() => {})

      if (deliveryStatus === 'sent') {
        sessionResult.invitesSent++
        result.messagesSent++
      } else {
        sessionResult.invitesSkipped++
        result.messagesSkipped++
      }
    }

    result.details.push(sessionResult)
  }

  console.log(`[SlotFiller Auto] ${club.name} (${mode}): ${result.sessionsProcessed} sessions, ${result.messagesSent} sent, ${result.messagesSkipped} skipped${dryRun ? ' (DRY RUN)' : ''}`)
  return result
}

/**
 * Build partner-aware social proof message.
 * Checks if any of the user's frequent partners are already booked.
 */
async function buildSocialProof(
  prisma: PrismaClient,
  userId: string,
  clubId: string,
  bookings: Array<{ userId: string; user: { id: string; name: string | null; email: string } }>,
): Promise<string | null> {
  try {
    const partnerIds = await getFrequentPartnerIds(prisma, userId, clubId, 3)
    const confirmedPartners = bookings
      .filter(b => partnerIds.includes(b.userId))
      .map(b => b.user?.name?.split(' ')[0])
      .filter(Boolean)

    if (confirmedPartners.length > 0) {
      return confirmedPartners.length === 1
        ? `Your partner ${confirmedPartners[0]} is already signed up!`
        : `Your partners ${confirmedPartners.join(' and ')} are already signed up!`
    }

    // Fallback: generic social proof with confirmed names
    const confirmedNames = bookings
      .map(b => b.user?.name?.split(' ')[0])
      .filter(Boolean)
      .slice(0, 3)

    if (confirmedNames.length > 0) {
      return `${confirmedNames.join(', ')} and others are playing.`
    }
  } catch {
    // Non-fatal — skip social proof
  }

  return null
}

/**
 * Load active club members not already booked for this session.
 * Returns data in the format expected by generateSlotFillerRecommendations.
 */
async function loadUnbookedMembers(
  prisma: PrismaClient,
  clubId: string,
  bookedUserIds: Set<string>,
): Promise<Array<{ member: MemberData; preference: UserPlayPreferenceData | null; history: BookingHistory }>> {
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000)

  // Get active members (with bookings in last 90 days)
  const followers = await prisma.clubFollower.findMany({
    where: {
      clubId,
      userId: { notIn: Array.from(bookedUserIds) },
    },
    include: {
      user: {
        select: {
          id: true, name: true, email: true,
          duprRatingDoubles: true, duprRatingSingles: true,
          gender: true, city: true, skillLevel: true,
        },
      },
    },
    take: 500, // Safety limit
  })

  // Load preferences + recent bookings in batch
  const userIds = followers.map(f => f.userId)

  const [preferences, recentBookings] = await Promise.all([
    prisma.userPlayPreference.findMany({
      where: { clubId, userId: { in: userIds } },
    }),
    prisma.playSessionBooking.findMany({
      where: {
        userId: { in: userIds },
        playSession: { clubId },
        bookedAt: { gte: ninetyDaysAgo },
      },
      include: { playSession: { select: { date: true, format: true, startTime: true } } },
    }),
  ])

  const prefMap = new Map(preferences.map(p => [p.userId, p]))
  const bookingMap = new Map<string, typeof recentBookings>()
  for (const b of recentBookings) {
    const list = bookingMap.get(b.userId) || []
    list.push(b)
    bookingMap.set(b.userId, list)
  }

  return followers
    .filter(f => bookingMap.has(f.userId)) // Only active members
    .map(f => {
      const user = f.user
      const pref = prefMap.get(f.userId)
      const bookings = bookingMap.get(f.userId) || []
      const confirmed = bookings.filter(b => b.status === 'CONFIRMED')

      const lastBooking = confirmed.sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime())[0]
      const daysSinceLastBooking = lastBooking
        ? Math.floor((now.getTime() - lastBooking.bookedAt.getTime()) / 86400000)
        : 999

      // Infer preferences if not in DB
      const inferredPref = !pref ? inferPreferencesFromBookings(bookings.map(b => ({
        status: b.status as any,
        session: {
          date: b.playSession.date,
          startTime: b.playSession.startTime || '12:00',
          format: b.playSession.format || 'OPEN_PLAY',
        },
      }))) : null

      const member: MemberData = {
        id: user.id,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        image: null,
        gender: (user.gender as any) || null,
        city: user.city || null,
        duprRatingDoubles: user.duprRatingDoubles ? Number(user.duprRatingDoubles) : null,
        duprRatingSingles: null,
      }

      const preference: UserPlayPreferenceData | null = pref ? {
        id: pref.id,
        userId: pref.userId,
        clubId: pref.clubId,
        preferredDays: (pref.preferredDays as any[]) || [],
        preferredTimeSlots: {
          morning: pref.preferredTimeMorning,
          afternoon: pref.preferredTimeAfternoon,
          evening: pref.preferredTimeEvening,
        },
        skillLevel: (pref.skillLevel as any) || 'ALL_LEVELS',
        preferredFormats: (pref.preferredFormats as any[]) || [],
        targetSessionsPerWeek: pref.targetSessionsPerWeek || 2,
        isActive: true,
      } : inferredPref ? {
        id: '', userId: f.userId, clubId,
        preferredDays: (inferredPref.preferredDays as any[]) || [],
        preferredTimeSlots: inferredPref.preferredTimeSlots || { morning: false, afternoon: false, evening: true },
        skillLevel: 'ALL_LEVELS' as any,
        preferredFormats: (inferredPref.preferredFormats as any[]) || [],
        targetSessionsPerWeek: 2,
        isActive: true,
      } : null

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
      const history: BookingHistory = {
        totalBookings: confirmed.length,
        bookingsLastWeek: confirmed.filter(b => b.bookedAt >= new Date(now.getTime() - 7 * 86400000)).length,
        bookingsLastMonth: confirmed.filter(b => b.bookedAt >= thirtyDaysAgo).length,
        daysSinceLastConfirmedBooking: daysSinceLastBooking,
        cancelledCount: bookings.filter(b => b.status === 'CANCELLED').length,
        noShowCount: bookings.filter(b => b.status === 'NO_SHOW').length,
        inviteAcceptanceRate: 0.5,
      }

      return { member, preference, history }
    })
}
