/**
 * Health-Based Campaign Engine
 *
 * Runs daily via Vercel cron. For each club:
 * 1. Calculates current health scores for all members
 * 2. Compares against previous MemberHealthSnapshot
 * 3. Detects risk level worsening (threshold crossings)
 * 4. Sends appropriate outreach messages (CHECK_IN / RETENTION_BOOST)
 * 5. Saves new snapshots for all members
 *
 * Key design: only sends messages when risk level WORSENS, not on stable states.
 */

import { generateMemberHealth } from './member-health'
import { checkAntiSpam } from './anti-spam'
import { generateOutreachMessages } from './outreach-messages'
import { findBestSessionForMember, formatSessionDate, formatSessionTime } from './session-matcher'
import { resolvePreferences } from './inferred-preferences'
import { inferSkillLevel } from './scoring'
import { selectBestVariant } from './variant-optimizer'
import type { RiskLevel, DayOfWeek, PlaySessionFormat, BookingWithSession } from '../../types/intelligence'

// ── Types ──

export interface CampaignResult {
  clubId: string
  clubName: string
  membersProcessed: number
  messagesSent: number
  messagesSkipped: number
  snapshotsSaved: number
  transitions: Array<{
    userId: string
    from: string
    to: string
    action: string
    status: 'sent' | 'skipped' | 'failed'
  }>
}

interface ClubAutomationSettings {
  enabled: boolean
  triggers: {
    healthyToWatch: boolean
    watchToAtRisk: boolean
    atRiskToCritical: boolean
    churned: boolean
  }
  channel: 'email' | 'sms' | 'both'
}

const DEFAULT_SETTINGS: ClubAutomationSettings = {
  enabled: true,
  triggers: {
    healthyToWatch: true,
    watchToAtRisk: true,
    atRiskToCritical: true,
    churned: true,
  },
  channel: 'email',
}

// Risk severity order for detecting worsening
const RISK_SEVERITY: Record<string, number> = {
  healthy: 0,
  watch: 1,
  at_risk: 2,
  critical: 3,
}

function isWorsening(from: string, to: string): boolean {
  return (RISK_SEVERITY[to] ?? 0) > (RISK_SEVERITY[from] ?? 0)
}

function getOutreachType(newRisk: string): 'CHECK_IN' | 'RETENTION_BOOST' | null {
  if (newRisk === 'watch') return 'CHECK_IN'
  if (newRisk === 'at_risk' || newRisk === 'critical') return 'RETENTION_BOOST'
  return null
}

// ── HTML Builder for Mandrill sends ──

interface OutreachSessionCard {
  title: string
  date: string
  time: string
  format: string
  spotsLeft: number
  confirmedCount: number
  sameLevelCount: number
}

function buildOutreachHtml({
  body,
  clubName,
  bookingUrl,
  sessionCard,
}: {
  body: string
  clubName: string
  bookingUrl: string
  sessionCard?: OutreachSessionCard
}): string {
  const formatLabel = (f: string) => f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  let sessionCardHtml = ''
  if (sessionCard) {
    const socialProofLine = sessionCard.sameLevelCount > 0
      ? `<span style="color: #6b7280; font-size: 13px;">${sessionCard.sameLevelCount} player${sessionCard.sameLevelCount === 1 ? '' : 's'} at your level signed up</span>`
      : sessionCard.confirmedCount > 0
        ? `<span style="color: #6b7280; font-size: 13px;">${sessionCard.confirmedCount} player${sessionCard.confirmedCount === 1 ? '' : 's'} signed up</span>`
        : ''

    sessionCardHtml = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin: 16px 0;">
        <tr>
          <td style="padding: 14px 16px; background: #f8fafc;">
            <strong style="font-size: 16px; color: #111827;">${sessionCard.title}</strong><br/>
            <span style="color: #6b7280; font-size: 14px;">
              ${sessionCard.date} &middot; ${sessionCard.time} &middot; ${formatLabel(sessionCard.format)}
            </span><br/>
            <span style="color: ${sessionCard.spotsLeft <= 2 ? '#dc2626' : '#16a34a'}; font-size: 14px; font-weight: 600;">
              ${sessionCard.spotsLeft} spot${sessionCard.spotsLeft !== 1 ? 's' : ''} left
            </span>
            ${socialProofLine ? `<br/>${socialProofLine}` : ''}
          </td>
        </tr>
      </table>`
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td style="background: #fff; border-radius: 16px; padding: 32px 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              ${body.split('\n').map(line => line.trim() ? `<p style="margin: 0 0 12px 0; font-size: 15px;">${line}</p>` : '').join('\n')}
              ${sessionCardHtml}
              <div style="text-align: center; margin-top: 24px;">
                <a href="${bookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #84cc16, #22c55e); color: #fff; padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none;">
                  Book a Session
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 20px;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                Sent by ${clubName} via <a href="https://iqsport.ai" style="color: #84cc16; text-decoration: none;">IQSport.ai</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Main Campaign Runner ──

export async function runHealthCampaign(
  prisma: any,
  clubId: string,
): Promise<CampaignResult> {
  // Load club
  const club = await prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { id: true, name: true, slug: true, automationSettings: true },
  })

  const rawSettings = typeof club.automationSettings === 'object' && club.automationSettings !== null
    ? club.automationSettings as any : {}
  const settings: ClubAutomationSettings = {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
  }
  // Intelligence settings from onboarding wizard (overrides channel/tone if set)
  const intelligence = rawSettings.intelligence as { communicationPreferences?: { preferredChannel?: string; tone?: string; maxMessagesPerWeek?: number } } | undefined
  if (intelligence?.communicationPreferences?.preferredChannel) {
    settings.channel = intelligence.communicationPreferences.preferredChannel as 'email' | 'sms' | 'both'
  }
  const clubTone = intelligence?.communicationPreferences?.tone as 'friendly' | 'professional' | 'casual' | undefined

  if (!settings.enabled) {
    return {
      clubId, clubName: club.name,
      membersProcessed: 0, messagesSent: 0, messagesSkipped: 0, snapshotsSaved: 0,
      transitions: [],
    }
  }

  // Load members + bookings (same query as getMemberHealth tRPC)
  const followers = await prisma.clubFollower.findMany({
    where: { clubId },
    include: {
      user: {
        select: {
          id: true, email: true, name: true, image: true,
          gender: true, city: true,
          duprRatingDoubles: true, duprRatingSingles: true,
        },
      },
    },
  })

  const userIds = followers.map((f: any) => f.userId)
  if (userIds.length === 0) {
    return {
      clubId, clubName: club.name,
      membersProcessed: 0, messagesSent: 0, messagesSkipped: 0, snapshotsSaved: 0,
      transitions: [],
    }
  }

  const bookings = await prisma.playSessionBooking.findMany({
    where: {
      userId: { in: userIds },
      playSession: { clubId },
    },
    select: {
      userId: true, status: true, bookedAt: true,
      playSession: { select: { date: true, startTime: true, format: true } },
    },
    orderBy: { bookedAt: 'desc' },
  })

  const preferences = await prisma.userPlayPreference.findMany({
    where: { clubId, userId: { in: userIds } },
  })

  // Load upcoming sessions for session matching + social proof
  const upcomingSessions = await prisma.playSession.findMany({
    where: { clubId, status: 'SCHEDULED', date: { gte: new Date() } },
    include: {
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
      bookings: {
        where: { status: 'CONFIRMED' },
        select: { user: { select: { duprRatingDoubles: true } } },
      },
    },
    orderBy: { date: 'asc' },
    take: 20,
  })

  // Build health score inputs
  const now = new Date()
  const d30 = new Date(now.getTime() - 30 * 86400000)
  const d60 = new Date(now.getTime() - 60 * 86400000)

  const prefMap = new Map<string, any>(preferences.map((p: any) => [p.userId, p]))
  const bookingMap = new Map<string, any[]>()
  for (const b of bookings) {
    if (!bookingMap.has(b.userId)) bookingMap.set(b.userId, [])
    bookingMap.get(b.userId)!.push(b)
  }

  // Build resolved preferences (DB preference or inferred from booking history)
  const resolvedPrefMap = new Map<string, ReturnType<typeof resolvePreferences>>()
  for (const userId of userIds) {
    const dbPref = prefMap.get(userId)
    const dbPrefData = dbPref ? {
      id: dbPref.id, userId: dbPref.userId, clubId: dbPref.clubId,
      preferredDays: dbPref.preferredDays as DayOfWeek[],
      preferredTimeSlots: { morning: dbPref.preferredTimeMorning, afternoon: dbPref.preferredTimeAfternoon, evening: dbPref.preferredTimeEvening },
      skillLevel: dbPref.skillLevel, preferredFormats: dbPref.preferredFormats as PlaySessionFormat[],
      targetSessionsPerWeek: dbPref.targetSessionsPerWeek, isActive: true,
    } : null
    const userBookingsForInference: BookingWithSession[] = (bookingMap.get(userId) || [])
      .filter((b: any) => b.playSession)
      .map((b: any) => ({ status: b.status, session: { date: b.playSession.date, startTime: b.playSession.startTime, format: b.playSession.format } }))
    resolvedPrefMap.set(userId, resolvePreferences(dbPrefData, userBookingsForInference))
  }

  const memberInputs = followers.map((f: any) => {
    const userBookings = bookingMap.get(f.userId) || []
    const confirmed = userBookings.filter((b: any) => b.status === 'CONFIRMED')
    const lastConfirmed = confirmed[0]?.bookedAt ?? null
    const daysSinceLast = lastConfirmed
      ? Math.floor((now.getTime() - lastConfirmed.getTime()) / 86400000)
      : null

    const bookingsLast30 = confirmed.filter((b: any) => b.bookedAt >= d30).length
    const bookings30to60 = confirmed.filter((b: any) => b.bookedAt >= d60 && b.bookedAt < d30).length

    return {
      member: {
        id: f.user.id,
        email: f.user.email,
        name: f.user.name,
        image: f.user.image,
        gender: (f.user.gender as 'M' | 'F' | 'X') ?? null,
        city: f.user.city,
        duprRatingDoubles: f.user.duprRatingDoubles ? Number(f.user.duprRatingDoubles) : null,
        duprRatingSingles: f.user.duprRatingSingles ? Number(f.user.duprRatingSingles) : null,
      },
      preference: (() => {
        const pref = prefMap.get(f.userId)
        if (!pref) return null
        return {
          id: pref.id,
          userId: pref.userId,
          clubId: pref.clubId,
          preferredDays: pref.preferredDays as DayOfWeek[],
          preferredTimeSlots: {
            morning: pref.preferredTimeMorning,
            afternoon: pref.preferredTimeAfternoon,
            evening: pref.preferredTimeEvening,
          },
          skillLevel: pref.skillLevel,
          preferredFormats: pref.preferredFormats as PlaySessionFormat[],
          targetSessionsPerWeek: pref.targetSessionsPerWeek,
          isActive: true,
        }
      })(),
      history: {
        totalBookings: userBookings.length,
        bookingsLastWeek: confirmed.filter((b: any) => b.bookedAt >= new Date(now.getTime() - 7 * 86400000)).length,
        bookingsLastMonth: bookingsLast30,
        daysSinceLastConfirmedBooking: daysSinceLast,
        cancelledCount: userBookings.filter((b: any) => b.status === 'CANCELLED').length,
        noShowCount: userBookings.filter((b: any) => b.status === 'NO_SHOW').length,
        inviteAcceptanceRate: 0.7,
      },
      joinedAt: f.createdAt ?? new Date(),
      bookingDates: userBookings.map((b: any) => ({
        date: b.bookedAt,
        status: b.status as 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
      })),
      previousPeriodBookings: bookings30to60,
    }
  })

  // Calculate current health scores
  const healthData = generateMemberHealth(memberInputs)

  // Load previous snapshots (latest per user)
  const prevSnapshots = await prisma.memberHealthSnapshot.findMany({
    where: { clubId },
    orderBy: { date: 'desc' },
    distinct: ['userId'],
    select: { userId: true, riskLevel: true, healthScore: true },
  })
  const prevRiskMap = new Map<string, string>(prevSnapshots.map((s: any) => [s.userId, s.riskLevel as string]))

  // Detect transitions and send messages
  const transitions: CampaignResult['transitions'] = []
  let messagesSent = 0
  let messagesSkipped = 0

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  const appUrl = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`
  const bookingUrl = `${appUrl}/clubs/${club.slug || club.id}/play`

  for (const member of healthData.members) {
    const prevRisk = prevRiskMap.get(member.memberId) || 'healthy'
    const newRisk = member.riskLevel

    // Only act on worsening
    if (!isWorsening(prevRisk, newRisk)) continue

    // Check trigger settings
    const triggerKey = `${prevRisk}To${newRisk.charAt(0).toUpperCase() + newRisk.slice(1).replace('_', '')}` as string
    const triggerMap: Record<string, keyof ClubAutomationSettings['triggers']> = {
      healthyToWatch: 'healthyToWatch',
      watchToAt_risk: 'watchToAtRisk',
      watchToAtRisk: 'watchToAtRisk',
      at_riskToCritical: 'atRiskToCritical',
      atRiskToCritical: 'atRiskToCritical',
    }
    const settingsKey = triggerMap[triggerKey]
    if (settingsKey && !settings.triggers[settingsKey]) {
      transitions.push({ userId: member.memberId, from: prevRisk, to: newRisk, action: 'disabled', status: 'skipped' })
      messagesSkipped++
      continue
    }

    const outreachType = getOutreachType(newRisk)
    if (!outreachType) continue

    // Anti-spam check
    const spamCheck = await checkAntiSpam({
      prisma, userId: member.memberId, clubId, type: outreachType,
    })
    if (!spamCheck.allowed) {
      transitions.push({ userId: member.memberId, from: prevRisk, to: newRisk, action: outreachType, status: 'skipped' })
      messagesSkipped++
      continue
    }

    // Find best session for this member (uses resolved preferences: DB or inferred from history)
    const memberSkillLevel = inferSkillLevel(
      member.member.duprRatingDoubles ? Number(member.member.duprRatingDoubles) : null
    )
    const matched = findBestSessionForMember({
      memberSkillLevel,
      preference: resolvedPrefMap.get(member.memberId) || null,
      sessions: upcomingSessions,
      clubSlug: club.slug || club.id,
      appBaseUrl: appUrl,
    })

    // Generate and send message
    const lowComponents = Object.entries(member.components)
      .map(([key, comp]) => ({ key, label: comp.label, score: comp.score }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)

    const variants = generateOutreachMessages(outreachType, {
      memberName: member.member.name || 'there',
      clubName: club.name,
      healthScore: member.healthScore,
      riskLevel: member.riskLevel,
      lowComponents,
      daysSinceLastActivity: member.daysSinceLastBooking,
      preferredDays: resolvedPrefMap.get(member.memberId)?.preferredDays as string[] | undefined,
      suggestedSessionTitle: matched?.session.title,
      suggestedSessionDate: matched ? formatSessionDate(new Date(matched.session.date)) : undefined,
      suggestedSessionTime: matched ? formatSessionTime(matched.session.startTime, matched.session.endTime) : undefined,
      suggestedSessionFormat: matched?.session.format,
      confirmedCount: matched?.confirmedCount,
      sameLevelCount: matched?.sameLevelCount,
      spotsLeft: matched?.spotsLeft,
      totalBookings: member.totalBookings,
      tone: clubTone,
    })

    // Use variant optimizer to select best-performing variant (feedback loop)
    let variant = variants.find(v => v.recommended) || variants[0]
    let optimizerReason = 'default'
    try {
      const optimization = await selectBestVariant(prisma, clubId, outreachType, variants)
      const optimizedVariant = variants.find(v => v.id === optimization.recommendedVariantId)
      if (optimizedVariant) {
        variant = optimizedVariant
        optimizerReason = optimization.reason
      }
    } catch (err) {
      // Fallback to default variant if optimizer fails
      console.warn(`[Campaign] Variant optimizer failed, using default:`, (err as Error).message?.slice(0, 80))
    }

    const memberBookingUrl = matched?.deepLinkUrl || bookingUrl

    // Create log record FIRST to get logId for Mailchimp metadata
    let logId: string | null = null
    try {
      const logRecord = await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: member.memberId,
          type: outreachType,
          channel: settings.channel,
          variantId: variant.id,
          reasoning: {
            campaign: true,
            transition: `${prevRisk} → ${newRisk}`,
            variantId: variant.id,
            healthScore: member.healthScore,
            optimizerReason,
          },
          status: 'pending',
        },
      })
      logId = logRecord.id
    } catch (logErr) {
      console.error(`[Campaign] Log creation failed for ${member.memberId}:`, logErr)
    }

    // Send email via Mandrill (with tracking metadata) or SMTP fallback
    let sent = false
    let externalMessageId: string | null = null

    if (settings.channel === 'email' || settings.channel === 'both') {
      try {
        const userEmail = member.member.email
        if (userEmail) {
          const { isMandrillConfigured, sendViaMandrill } = await import('../mailchimp')

          if (isMandrillConfigured()) {
            // Send via Mandrill with tracking metadata
            const { sendOutreachEmail } = await import('../email')
            // Build HTML using existing email template
            const emailHtml = buildOutreachHtml({
              body: variant.emailBody,
              clubName: club.name,
              bookingUrl: memberBookingUrl,
              sessionCard: matched ? {
                title: matched.session.title,
                date: formatSessionDate(new Date(matched.session.date)),
                time: formatSessionTime(matched.session.startTime, matched.session.endTime),
                format: matched.session.format,
                spotsLeft: matched.spotsLeft,
                confirmedCount: matched.confirmedCount,
                sameLevelCount: matched.sameLevelCount,
              } : undefined,
            })

            const result = await sendViaMandrill({
              to: userEmail,
              subject: variant.emailSubject,
              html: emailHtml,
              metadata: logId ? {
                logId,
                clubId,
                userId: member.memberId,
                variantId: variant.id,
              } : undefined,
              tags: ['campaign', outreachType.toLowerCase(), variant.id],
            })

            externalMessageId = result.messageId
            sent = true
          } else {
            // Fallback to SMTP (no webhook tracking)
            const { sendOutreachEmail } = await import('../email')
            await sendOutreachEmail({
              to: userEmail,
              subject: variant.emailSubject,
              body: variant.emailBody,
              clubName: club.name,
              bookingUrl: memberBookingUrl,
              sessionCard: matched ? {
                title: matched.session.title,
                date: formatSessionDate(new Date(matched.session.date)),
                time: formatSessionTime(matched.session.startTime, matched.session.endTime),
                format: matched.session.format,
                spotsLeft: matched.spotsLeft,
                confirmedCount: matched.confirmedCount,
                sameLevelCount: matched.sameLevelCount,
              } : undefined,
            })
            sent = true
          }
        }
      } catch (err) {
        console.error(`[Campaign] Email failed for ${member.memberId}:`, (err as Error).message?.slice(0, 100))
      }
    }

    // Update log record with send result
    if (logId) {
      try {
        await prisma.aIRecommendationLog.update({
          where: { id: logId },
          data: {
            status: sent ? 'sent' : 'failed',
            externalMessageId,
          },
        })
      } catch (updateErr) {
        console.error(`[Campaign] Log update failed:`, updateErr)
      }
    }

    transitions.push({
      userId: member.memberId,
      from: prevRisk,
      to: newRisk,
      action: outreachType,
      status: sent ? 'sent' : 'failed',
    })
    if (sent) messagesSent++
    else messagesSkipped++
  }

  // Save new snapshots for ALL members
  let snapshotsSaved = 0
  for (const member of healthData.members) {
    try {
      await prisma.memberHealthSnapshot.create({
        data: {
          clubId,
          userId: member.memberId,
          healthScore: member.healthScore,
          riskLevel: member.riskLevel,
          lifecycleStage: member.lifecycleStage,
          features: {},
        },
      })
      snapshotsSaved++
    } catch (err) {
      // Ignore individual snapshot failures
    }
  }

  return {
    clubId,
    clubName: club.name,
    membersProcessed: healthData.members.length,
    messagesSent,
    messagesSkipped,
    snapshotsSaved,
    transitions,
  }
}

// ── Run for all clubs ──

export async function runHealthCampaignForAllClubs(
  prisma: any,
): Promise<{ results: CampaignResult[]; totalSent: number; totalSkipped: number }> {
  // Get clubs that have at least one follower (active clubs)
  const clubs = await prisma.club.findMany({
    where: {
      followers: { some: {} },
    },
    select: { id: true },
    take: 100, // safety limit
  })

  const results: CampaignResult[] = []
  let totalSent = 0
  let totalSkipped = 0

  for (const club of clubs) {
    try {
      const result = await runHealthCampaign(prisma, club.id)
      results.push(result)
      totalSent += result.messagesSent
      totalSkipped += result.messagesSkipped
    } catch (err) {
      console.error(`[Campaign] Failed for club ${club.id}:`, (err as Error).message?.slice(0, 120))
      results.push({
        clubId: club.id,
        clubName: 'Error',
        membersProcessed: 0,
        messagesSent: 0,
        messagesSkipped: 0,
        snapshotsSaved: 0,
        transitions: [],
      })
    }
  }

  return { results, totalSent, totalSkipped }
}
