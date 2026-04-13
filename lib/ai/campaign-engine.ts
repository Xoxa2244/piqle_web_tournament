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
import { campaignLogger as log } from '@/lib/logger'
import { checkAntiSpam } from './anti-spam'
import { generateOutreachMessages, generateOutreachMessagesWithLLM } from './outreach-messages'
import type { OutreachMessageVariant, OutreachType } from './outreach-messages'
import { findBestSessionForMember, formatSessionDate, formatSessionTime } from './session-matcher'
import { resolvePreferences } from './inferred-preferences'
import { inferSkillLevel } from './scoring'
import { selectBestVariant } from './variant-optimizer'
import { processSequences, hasActiveSequence, getSequenceType } from './sequence-runner'
import { generateSequenceMessage, generateSequenceMessageVariants } from './sequence-messages'
import { interpolateVariant, type MessageGenerationContext } from './llm/message-generator'
import { mapOutreachTypeToAutonomyAction } from './agent-autonomy'
import {
  buildAgentTriggerReasoning,
  evaluateAgentTriggerRuntime,
} from './agent-trigger-runtime'
import { normalizeMembership } from './membership-intelligence'
import type { SequenceDecision } from './sequence-runner'
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
  /** Sequence follow-up results */
  sequenceFollowUps: number
  sequenceExits: number
  sequenceWaits: number
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
  /** Confidence threshold: auto-execute if >= this, queue if below. Default: 70 */
  autoApproveThreshold?: number
}

// ── Confidence Scoring ──

export interface ActionConfidence {
  score: number         // 0-100
  autoApproved: boolean // score >= threshold
  reasons: string[]     // why this score
}

/**
 * Calculate confidence for sending an outreach message.
 * High confidence = safe to auto-send.
 * Low confidence = needs human approval (goes to morning digest).
 */
export function calculateConfidence(
  transition: { from: string; to: string },
  member: { healthScore: number; totalBookings: number; daysSinceLastBooking: number | null },
  outreachType: 'CHECK_IN' | 'RETENTION_BOOST',
  threshold: number = 70,
): ActionConfidence {
  let score = 50 // baseline
  const reasons: string[] = []

  // 1. Transition severity — low risk transitions = higher confidence
  if (transition.from === 'healthy' && transition.to === 'watch') {
    score += 30 // Very safe — just a friendly check-in
    reasons.push('Low-risk transition (Healthy→Watch)')
  } else if (transition.from === 'watch' && transition.to === 'at_risk') {
    score += 10 // Medium — worth doing but maybe review
    reasons.push('Medium transition (Watch→At-Risk)')
  } else if (transition.to === 'critical') {
    score -= 10 // High-value member leaving — human should review
    reasons.push('Critical transition — human review recommended')
  }

  // 2. Outreach type — check-in is safer than retention boost
  if (outreachType === 'CHECK_IN') {
    score += 15
    reasons.push('Check-in (low-impact action)')
  } else {
    score += 5
    reasons.push('Retention boost (medium-impact)')
  }

  // 3. Member value — high-value members need more care
  if (member.totalBookings > 50) {
    score -= 15 // Loyal member — let human craft the approach
    reasons.push(`High-value member (${member.totalBookings} bookings) — needs personal touch`)
  } else if (member.totalBookings < 5) {
    score += 10 // New member — standard message is fine
    reasons.push('New member — standard outreach OK')
  }

  // 4. Health score — very low = urgent, higher confidence to act fast
  if (member.healthScore < 20) {
    score += 5
    reasons.push('Urgent: health score < 20')
  }

  // 5. Days since last activity — longer absence = more confidence to reach out
  const days = member.daysSinceLastBooking ?? 999
  if (days > 30) {
    score += 5
    reasons.push(`${days} days inactive — outreach warranted`)
  }

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score))

  return {
    score,
    autoApproved: score >= threshold,
    reasons,
  }
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
  unsubscribeUrl,
}: {
  body: string
  clubName: string
  bookingUrl: string
  sessionCard?: OutreachSessionCard
  unsubscribeUrl?: string
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
                ${unsubscribeUrl ? `<br/><a href="${unsubscribeUrl}" style="color: #9ca3af; text-decoration: underline; font-size: 11px;">Unsubscribe</a>` : ''}
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

// ── Execute Sequence Follow-Up Step ──

async function executeSequenceStep(
  prisma: any,
  decision: SequenceDecision,
  club: { id: string; name: string; slug?: string },
  settings: ClubAutomationSettings,
  automationSettings: unknown,
  appUrl: string,
  upcomingSessions: any[],
  resolvedPrefMap: Map<string, any>,
  defaultBookingUrl: string,
): Promise<boolean> {
  const { sequence, action } = decision
  const userId = sequence.rootLog.userId
  const clubId = sequence.rootLog.clubId

  // Load user data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      duprRatingDoubles: true,
      phone: true,
      smsOptIn: true,
      membershipType: true,
      membershipStatus: true,
    },
  })
  if (!user) return false

  // Find best session for follow-up context
  const memberSkillLevel = inferSkillLevel(
    user.duprRatingDoubles ? Number(user.duprRatingDoubles) : null
  )
  const matched = findBestSessionForMember({
    memberSkillLevel,
    preference: resolvedPrefMap.get(userId) || null,
    sessions: upcomingSessions,
    clubSlug: club.slug || club.id,
    appBaseUrl: appUrl,
  })

  // Get original subject from Step 0 reasoning
  const step0Reasoning = sequence.rootLog.reasoning as any
  const autonomyAction = mapOutreachTypeToAutonomyAction(String(sequence.rootLog.type))
  const normalizedMembership = normalizeMembership({
    membershipType: user.membershipType,
    membershipStatus: user.membershipStatus,
  })
  const sequenceRuntime = autonomyAction
    ? evaluateAgentTriggerRuntime({
        source: 'sequence_engine',
        triggerMode: 'deferred',
        action: autonomyAction,
        automationSettings,
        liveMode: true,
        confidence: typeof step0Reasoning?.confidence === 'number' ? step0Reasoning.confidence : null,
        recipientCount: 1,
        membershipSignal: normalizedMembership.signal,
        membershipStatus: normalizedMembership.normalizedStatus,
        membershipType: normalizedMembership.normalizedType,
        membershipConfidence: normalizedMembership.confidence,
      })
    : null
  const inheritedApproval =
    sequenceRuntime?.decision.outcome === 'pending' &&
    sequenceRuntime.decision.configuredMode === 'approve'
  const sequenceRuntimeActual = inheritedApproval
    ? {
        outcome: 'auto' as const,
        reasons: ['Follow-up continued automatically because the parent sequence was already approved.'],
      }
    : undefined

  // Build member values for template interpolation
  const memberName = user.name || 'there'
  const firstName = memberName.split(' ')[0]
  const socialProofText = matched?.sameLevelCount && matched.sameLevelCount > 0
    ? `${matched.sameLevelCount} player${matched.sameLevelCount === 1 ? '' : 's'} at your level signed up`
    : matched?.confirmedCount && matched.confirmedCount > 0
      ? `${matched.confirmedCount} player${matched.confirmedCount === 1 ? '' : 's'} signed up`
      : ''
  const spotsText = matched?.spotsLeft
    ? `Only ${matched.spotsLeft} spot${matched.spotsLeft !== 1 ? 's' : ''} left`
    : ''

  // Compute days since last activity from booking history
  const lastConfirmedBooking = await prisma.playSessionBooking.findFirst({
    where: { userId, status: 'CONFIRMED' },
    orderBy: { bookedAt: 'desc' },
    select: { bookedAt: true },
  })
  const daysSinceLastActivity = lastConfirmedBooking
    ? Math.floor((Date.now() - new Date(lastConfirmedBooking.bookedAt).getTime()) / 86400000)
    : null

  const templateValues: Record<string, string> = {
    name: firstName,
    club: club.name,
    session: matched?.session.title || 'our next session',
    days: String(daysSinceLastActivity ?? 0),
    proof: socialProofText,
    spots: spotsText,
  }

  // Try LLM-powered variant generation with optimizer selection
  let message = generateSequenceMessage(action.messageType!, {
    memberName,
    clubName: club.name,
    daysSinceLastActivity,
    suggestedSessionTitle: matched?.session.title,
    suggestedSessionDate: matched ? formatSessionDate(new Date(matched.session.date)) : undefined,
    suggestedSessionTime: matched ? formatSessionTime(matched.session.startTime, matched.session.endTime) : undefined,
    confirmedCount: matched?.confirmedCount,
    sameLevelCount: matched?.sameLevelCount,
    spotsLeft: matched?.spotsLeft,
    originalSubject: step0Reasoning?.originalSubject,
    originalVariantId: sequence.rootLog.variantId || undefined,
  })
  let variantId = `seq_${action.messageType}`

  // Try LLM variants with optimizer (best-effort, fallback to hardcoded above)
  try {
    const llmClubContext: MessageGenerationContext = {
      clubName: club.name,
      tone: (settings as any).tone || 'friendly',
      topPerformers: [],
      bottomPerformers: [],
    }
    const seqVariants = await generateSequenceMessageVariants(
      prisma, clubId, action.messageType!, llmClubContext,
    )
    if (seqVariants.length > 0) {
      const optimization = await selectBestVariant(
        prisma, clubId, action.messageType! as any, seqVariants.map(v => ({ id: v.id })),
      )
      const bestVariant = seqVariants.find(v => v.id === optimization.recommendedVariantId) || seqVariants[0]
      // Interpolate template variables for this member
      const interpolated = interpolateVariant(
        { id: bestVariant.id, strategy: '', emailSubject: bestVariant.message.emailSubject, emailBody: bestVariant.message.emailBody, smsBody: bestVariant.message.smsBody },
        templateValues,
      )
      message = {
        channel: bestVariant.message.channel,
        emailSubject: interpolated.emailSubject,
        emailBody: interpolated.emailBody,
        smsBody: interpolated.smsBody,
      }
      variantId = bestVariant.id
    }
  } catch (err) {
    // LLM/optimizer failed — using hardcoded fallback (already set above)
    log.warn(`[Campaign] LLM sequence variant failed, using hardcoded:`, (err as Error).message?.slice(0, 80))
  }

  const memberBookingUrl = matched?.deepLinkUrl || defaultBookingUrl

  // Create log record for this step
  const logRecord = await prisma.aIRecommendationLog.create({
    data: {
      clubId,
      userId,
      type: sequence.rootLog.type,
      channel: action.action === 'send_sms' ? 'sms' : 'email',
      variantId,
      sequenceStep: action.stepNumber,
      parentLogId: sequence.rootLog.id,
      reasoning: sequenceRuntime
        ? buildAgentTriggerReasoning(
            sequenceRuntime,
            {
              sequenceFollowUp: true,
              parentLogId: sequence.rootLog.id,
              stepNumber: action.stepNumber,
              messageType: action.messageType,
              reason: action.reason,
              originalSubject: message.emailSubject,
              llmVariant: variantId.startsWith('llm_'),
            },
            sequenceRuntimeActual,
          )
        : {
            source: 'sequence_engine',
            sequenceFollowUp: true,
            parentLogId: sequence.rootLog.id,
            stepNumber: action.stepNumber,
            messageType: action.messageType,
            reason: action.reason,
            originalSubject: message.emailSubject,
            llmVariant: variantId.startsWith('llm_'),
          },
      status: 'pending',
    },
  })

  let sent = false
  let externalMessageId: string | null = null

  // Send via appropriate channel
  if (action.action === 'send_email') {
    try {
      const { isMandrillConfigured, sendViaMandrill } = await import('../mailchimp')

      if (isMandrillConfigured() && user.email) {
        const { generateUnsubscribeUrl } = await import('../unsubscribe')
        const unsubUrl = generateUnsubscribeUrl(userId, clubId)

        const emailHtml = buildOutreachHtml({
          body: message.emailBody,
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
          unsubscribeUrl: unsubUrl,
        })

        const result = await sendViaMandrill({
          to: user.email,
          subject: message.emailSubject,
          html: emailHtml,
          metadata: {
            logId: logRecord.id,
            clubId,
            userId,
            variantId,
          },
          tags: ['sequence', action.messageType || 'follow_up', `step_${action.stepNumber}`, variantId.startsWith('llm_') ? 'llm' : 'hardcoded'],
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })

        externalMessageId = result.messageId
        sent = true
      }
    } catch (err) {
      log.error(`[Campaign] Sequence email failed:`, (err as Error).message?.slice(0, 100))
    }
  } else if (action.action === 'send_sms') {
    try {
      // Anti-spam check for SMS
      const smsSpamCheck = await checkAntiSpam({
        prisma, userId, clubId, type: sequence.rootLog.type as any,
      })
      if (!smsSpamCheck.allowed) {
        log.warn(`[Campaign] SMS blocked by anti-spam for user ${userId}`)
        return false
      }

      const { sendSms, isTwilioConfigured } = await import('../sms')
      const phoneNumber = user.phone

      // Guard: only send SMS if user has explicitly opted in
      if (user.smsOptIn && phoneNumber && isTwilioConfigured()) {
        const result = await sendSms({
          to: phoneNumber,
          body: message.smsBody,
          logId: logRecord.id,
        })
        externalMessageId = result.sid
        sent = true
      } else if (!user.smsOptIn) {
        log.warn(`[Campaign] SMS skipped — user ${userId} has not opted in, falling back to email`)
      }

      if (!sent) {
        // No phone — fallback to email for SMS steps
        const { isMandrillConfigured, sendViaMandrill } = await import('../mailchimp')
        if (isMandrillConfigured() && user.email) {
          const { generateUnsubscribeUrl } = await import('../unsubscribe')
          const unsubUrl = generateUnsubscribeUrl(userId, clubId)

          const emailHtml = buildOutreachHtml({
            body: message.emailBody || message.smsBody,
            clubName: club.name,
            bookingUrl: memberBookingUrl,
            unsubscribeUrl: unsubUrl,
          })
          const result = await sendViaMandrill({
            to: user.email,
            subject: message.emailSubject || `${(user.name || 'there').split(' ')[0]}, update from ${club.name}`,
            html: emailHtml,
            metadata: { logId: logRecord.id, clubId, userId },
            tags: ['sequence', 'sms_fallback_email', `step_${action.stepNumber}`],
            headers: {
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          })
          externalMessageId = result.messageId
          sent = true
        }
      }
    } catch (err) {
      log.error(`[Campaign] Sequence SMS failed:`, (err as Error).message?.slice(0, 100))
    }
  }

  // Update log with send result
  await prisma.aIRecommendationLog.update({
    where: { id: logRecord.id },
    data: {
      status: sent ? 'sent' : 'failed',
      externalMessageId,
    },
  })

  return sent
}

// ── Main Campaign Runner ──

export async function runHealthCampaign(
  prisma: any,
  clubId: string,
  options?: { dryRun?: boolean },
): Promise<CampaignResult> {
  const dryRun = options?.dryRun ?? false
  // Load club
  const club = await prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { id: true, name: true, automationSettings: true },
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
      sequenceFollowUps: 0, sequenceExits: 0, sequenceWaits: 0,
    }
  }

  // Check email/campaign usage limits before proceeding
  try {
    const { checkUsageLimit } = await import('@/lib/subscription')
    const emailCheck = await checkUsageLimit(clubId, 'emails', 10) // estimate ~10 emails per cron run
    if (!emailCheck.allowed) {
      log.warn(`[Campaign] Club ${clubId} email limit reached (${emailCheck.used}/${emailCheck.limit}), skipping auto campaign`)
      return {
        clubId, clubName: club.name,
        membersProcessed: 0, messagesSent: 0, messagesSkipped: 0, snapshotsSaved: 0,
        transitions: [],
        sequenceFollowUps: 0, sequenceExits: 0, sequenceWaits: 0,
      }
    }
  } catch {
    // Non-critical — proceed if limit check fails (subscription table may not exist)
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
      sequenceFollowUps: 0, sequenceExits: 0, sequenceWaits: 0,
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

  // ── Pre-generate LLM message variants per club (shared across members) ──
  const llmVariantCache = new Map<OutreachType, OutreachMessageVariant[]>()
  const llmClubContext: MessageGenerationContext = {
    clubName: club.name,
    tone: clubTone || 'friendly',
    topPerformers: [],
    bottomPerformers: [],
  }

  // Pre-generate for both types (best-effort, fallback to hardcoded per member)
  for (const ot of ['CHECK_IN', 'RETENTION_BOOST'] as OutreachType[]) {
    try {
      const llmVariants = await generateOutreachMessagesWithLLM(prisma, clubId, ot, llmClubContext)
      if (llmVariants.length > 0) {
        llmVariantCache.set(ot, llmVariants)
      }
    } catch (err) {
      log.warn(`[Campaign] LLM pre-generation failed for ${ot}:`, (err as Error).message?.slice(0, 80))
    }
  }

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

    // Skip if user already has an active sequence
    const activeSeq = await hasActiveSequence(prisma, member.memberId, clubId)
    if (activeSeq) {
      transitions.push({ userId: member.memberId, from: prevRisk, to: newRisk, action: 'active_sequence', status: 'skipped' })
      messagesSkipped++
      continue
    }

    // Anti-spam check
    const spamCheck = await checkAntiSpam({
      prisma, userId: member.memberId, clubId, type: outreachType,
    })
    if (!spamCheck.allowed) {
      transitions.push({ userId: member.memberId, from: prevRisk, to: newRisk, action: outreachType, status: 'skipped' })
      messagesSkipped++
      // Log anti-spam rejection for audit trail
      try {
        await prisma.aIRecommendationLog.create({
          data: {
            clubId,
            userId: member.memberId,
            type: outreachType,
            channel: 'system',
            status: 'blocked',
            reasoning: {
              reason: 'anti_spam',
              spamCheckReason: spamCheck.reason,
              riskTransition: { from: prevRisk, to: newRisk },
            },
          },
        })
      } catch { /* non-critical */ }
      continue
    }

    // ── Confidence scoring — auto-approve or queue for digest ──
    const autoApproveThreshold = settings.autoApproveThreshold ?? 70
    const confidence = calculateConfidence(
      { from: prevRisk, to: newRisk },
      { healthScore: member.healthScore, totalBookings: member.totalBookings, daysSinceLastBooking: member.daysSinceLastBooking },
      outreachType,
      autoApproveThreshold,
    )

    const autonomyAction = mapOutreachTypeToAutonomyAction(outreachType)
    const normalizedMembership = normalizeMembership({
      membershipType: member.membershipType,
      membershipStatus: member.membershipStatus,
    })
    const runtime = autonomyAction
      ? evaluateAgentTriggerRuntime({
          source: 'campaign_engine',
          triggerMode: 'immediate',
          action: autonomyAction,
          automationSettings: rawSettings,
          liveMode: !dryRun,
          confidence: confidence.score,
          recipientCount: 1,
          membershipSignal: normalizedMembership.signal,
          membershipStatus: normalizedMembership.normalizedStatus,
          membershipType: normalizedMembership.normalizedType,
          membershipConfidence: normalizedMembership.confidence,
        })
      : null

    if (runtime?.decision.outcome === 'blocked') {
      try {
        await prisma.aIRecommendationLog.create({
          data: {
            clubId,
            userId: member.memberId,
            type: outreachType,
            channel: settings.channel,
            status: 'blocked',
            reasoning: {
              ...(runtime
                ? buildAgentTriggerReasoning(runtime, {
                    transition: `${prevRisk} → ${newRisk}`,
                    healthScore: member.healthScore,
                    confidenceReasons: confidence.reasons,
                  })
                : {}),
            },
          },
        })
      } catch { /* non-critical */ }
      transitions.push({ userId: member.memberId, from: prevRisk, to: newRisk, action: `${outreachType.toLowerCase()} blocked`, status: 'skipped' })
      messagesSkipped++
      continue
    }

    if ((runtime?.decision.outcome === 'pending') || (!confidence.autoApproved && !dryRun)) {
      // Queue for morning digest — don't send, just log as pending
      try {
        await prisma.aIRecommendationLog.create({
          data: {
            clubId,
            userId: member.memberId,
            type: outreachType,
            channel: settings.channel,
            status: 'pending',
            reasoning: {
              ...(runtime
                ? buildAgentTriggerReasoning(runtime, {
                    transition: `${prevRisk} → ${newRisk}`,
                    healthScore: member.healthScore,
                    confidenceReasons: confidence.reasons,
                  })
                : {}),
            },
          },
        })
      } catch { /* non-critical */ }
      const queueReason = runtime?.decision.reasons?.[0] || `confidence ${confidence.score}%`
      transitions.push({ userId: member.memberId, from: prevRisk, to: newRisk, action: `queued (${queueReason})`, status: 'skipped' })
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

    // Generate hardcoded variants (always available as baseline)
    const hardcodedVariants = generateOutreachMessages(outreachType, {
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

    // Combine LLM variants (if available) + hardcoded baseline for optimizer
    let allVariants: OutreachMessageVariant[] = [...hardcodedVariants]
    const cachedLLM = llmVariantCache.get(outreachType)
    if (cachedLLM && cachedLLM.length > 0) {
      // Interpolate LLM template variables for this member
      const memberName = member.member.name || 'there'
      const firstName = memberName.split(' ')[0]
      const socialProof = matched?.sameLevelCount && matched.sameLevelCount > 0
        ? `${matched.sameLevelCount} player${matched.sameLevelCount === 1 ? '' : 's'} at your level signed up`
        : matched?.confirmedCount && matched.confirmedCount > 0
          ? `${matched.confirmedCount} player${matched.confirmedCount === 1 ? '' : 's'} signed up`
          : ''
      const spotsText = matched?.spotsLeft
        ? `Only ${matched.spotsLeft} spot${matched.spotsLeft !== 1 ? 's' : ''} left`
        : ''

      const interpolatedLLM = cachedLLM.map(v => {
        const interp = interpolateVariant(
          { id: v.id, strategy: '', emailSubject: v.emailSubject, emailBody: v.emailBody, smsBody: v.smsBody },
          {
            name: firstName,
            club: club.name,
            session: matched?.session.title || 'our next session',
            days: String(member.daysSinceLastBooking ?? 0),
            proof: socialProof,
            spots: spotsText,
          },
        )
        return { ...v, emailSubject: interp.emailSubject, emailBody: interp.emailBody, smsBody: interp.smsBody }
      })
      allVariants = [...interpolatedLLM, ...hardcodedVariants]
    }

    // Use variant optimizer to select best-performing variant (feedback loop)
    let variant = allVariants.find(v => v.recommended) || allVariants[0]
    let optimizerReason = 'default'
    try {
      const optimization = await selectBestVariant(prisma, clubId, outreachType, allVariants)
      const optimizedVariant = allVariants.find(v => v.id === optimization.recommendedVariantId)
      if (optimizedVariant) {
        variant = optimizedVariant
        optimizerReason = optimization.reason
      }
    } catch (err) {
      // Fallback to default variant if optimizer fails
      log.warn(`[Campaign] Variant optimizer failed, using default:`, (err as Error).message?.slice(0, 80))
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
          sequenceStep: 0,           // Mark as Step 0 (root of sequence chain)
          reasoning: {
            campaign: true,
            transition: `${prevRisk} → ${newRisk}`,
            variantId: variant.id,
            healthScore: member.healthScore,
            confidence: confidence.score,
            confidenceAutoApproved: confidence.autoApproved,
            confidenceReasons: confidence.reasons,
            ...(runtime ? buildAgentTriggerReasoning(runtime) : {}),
            optimizerReason,
            sequenceType: getSequenceType(newRisk),
            originalSubject: variant.emailSubject,
            llmVariant: variant.id.startsWith('llm_'),
          },
          status: 'pending',
        },
      })
      logId = logRecord.id
    } catch (logErr) {
      log.error(`[Campaign] Log creation failed for ${member.memberId}:`, logErr)
    }

    // Send email via Mandrill (with tracking metadata) or SMTP fallback
    let sent = false
    let externalMessageId: string | null = null

    if ((settings.channel === 'email' || settings.channel === 'both') && !dryRun) {
      try {
        const userEmail = member.member.email
        if (userEmail) {
          const { isMandrillConfigured, sendViaMandrill } = await import('../mailchimp')

          if (isMandrillConfigured()) {
            // Generate unsubscribe URL for CAN-SPAM compliance
            const { generateUnsubscribeUrl } = await import('../unsubscribe')
            const unsubUrl = generateUnsubscribeUrl(member.memberId, clubId)

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
              unsubscribeUrl: unsubUrl,
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
              headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
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
        log.error(`[Campaign] Email failed for ${member.memberId}:`, (err as Error).message?.slice(0, 100))
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
        log.error(`[Campaign] Log update failed:`, updateErr)
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

  // ── Process Sequence Follow-ups ──
  let sequenceFollowUps = 0
  let sequenceExits = 0
  let sequenceWaits = 0

  try {
    const { results: seqDecisions, summary: seqSummary } = await processSequences(prisma, clubId)
    sequenceExits = seqSummary.exits
    sequenceWaits = seqSummary.waits

    // Execute follow-up actions
    for (const decision of seqDecisions) {
      try {
        const sent = await executeSequenceStep(
          prisma,
          decision,
          club,
          settings,
          rawSettings,
          appUrl,
          upcomingSessions,
          resolvedPrefMap,
          bookingUrl,
        )
        if (sent) sequenceFollowUps++
      } catch (err) {
        log.error(`[Campaign] Sequence step failed for ${decision.sequence.rootLog.userId}:`, (err as Error).message?.slice(0, 100))
      }
    }
  } catch (err) {
    log.error(`[Campaign] Sequence processing failed for ${clubId}:`, (err as Error).message?.slice(0, 100))
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
      log.warn(`[Campaign] Snapshot failed for ${member.memberId}:`, (err as Error).message?.slice(0, 80))
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
    sequenceFollowUps,
    sequenceExits,
    sequenceWaits,
  }
}

// ── Run for all clubs ──

export async function runHealthCampaignForAllClubs(
  prisma: any,
  options?: { dryRun?: boolean },
): Promise<{ results: CampaignResult[]; totalSent: number; totalSkipped: number }> {
  // Get clubs that have at least one follower AND agent is live (opt-in)
  // Without agentLive=true, club only gets dryRun regardless of param
  const allClubs = await prisma.club.findMany({
    where: {
      followers: { some: {} },
    },
    select: { id: true, automationSettings: true },
    take: 100, // safety limit
  })
  // Filter: only clubs with agentLive=true get real emails; others forced dryRun
  const clubs = allClubs.map((c: any) => ({
    id: c.id,
    forceDryRun: !(c.automationSettings as any)?.intelligence?.agentLive,
  }))

  const results: CampaignResult[] = []
  let totalSent = 0
  let totalSkipped = 0

  for (const club of clubs) {
    try {
      const effectiveOptions = club.forceDryRun ? { ...options, dryRun: true } : options
      const result = await runHealthCampaign(prisma, club.id, effectiveOptions)
      results.push(result)
      totalSent += result.messagesSent
      totalSkipped += result.messagesSkipped
    } catch (err) {
      const errMsg = (err as Error).message ?? String(err)
      const errStack = (err as Error).stack?.slice(0, 300) ?? ''
      log.error(`[Campaign] Failed for club ${club.id}:`, errMsg, errStack)
      results.push({
        clubId: club.id,
        clubName: 'Error',
        membersProcessed: 0,
        messagesSent: 0,
        messagesSkipped: 0,
        snapshotsSaved: 0,
        transitions: [],
        sequenceFollowUps: 0, sequenceExits: 0, sequenceWaits: 0,
        error: errMsg.slice(0, 500),
      } as any)
    }
  }

  return { results, totalSent, totalSkipped }
}
