import { sendOutreachEmail } from '@/lib/email'
import { appendSmsOptOut, sendSms } from '@/lib/sms'
import { reportUsage } from '@/lib/stripe-usage'
import { evaluateAdvisorContactGuardrails } from './advisor-contact-guardrails'
import { evaluateAgentControlPlaneAction } from './agent-control-plane'
import {
  evaluateAgentOutreachRollout,
  type AgentOutreachRolloutActionKind,
} from './agent-outreach-rollout'
import { persistAgentDecisionRecord } from './agent-decision-records'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import {
  buildGuestTrialOfferAttributionFromContext,
  inferGuestTrialOfferAttribution,
  type GuestTrialExecutionContext,
} from './guest-trial-offers'
import {
  buildReferralOfferAttributionFromContext,
  inferReferralOfferAttribution,
  type ReferralExecutionContext,
} from './referral-offers'
import { generateUnsubscribeUrl } from '@/lib/unsubscribe'
import { normalizePhone } from '@/lib/phone-normalize'

type CampaignChannel = 'email' | 'sms' | 'both'
type CampaignType =
  | 'CHECK_IN'
  | 'RETENTION_BOOST'
  | 'REACTIVATION'
  | 'SLOT_FILLER'
  | 'EVENT_INVITE'
  | 'NEW_MEMBER_WELCOME'

type CampaignUser = {
  id: string
  email?: string | null
  name?: string | null
  phone?: string | null
  smsOptIn?: boolean | null
}

type CampaignClub = {
  id: string
  name: string
  automationSettings?: unknown
}

type CampaignDraftInput = {
  clubId: string
  type: CampaignType
  channel: CampaignChannel
  memberIds: string[]
  recipients?: Array<{
    memberId: string
    channel: CampaignChannel
  }>
  subject?: string
  body: string
  smsBody?: string
  ctaLabel?: string
  ctaUrl?: string
  sessionId?: string
  source?: string
  actionKind?: AgentOutreachRolloutActionKind
  guestTrialContext?: GuestTrialExecutionContext | null
  referralContext?: ReferralExecutionContext | null
  scheduledFor?: string
  timeZone?: string
  recipientRules?: {
    requireEmail?: boolean
    requirePhone?: boolean
    smsOptInOnly?: boolean
  } | null
}

type DeliveryResult = {
  status: 'sent' | 'failed' | 'skipped'
  externalMessageId: string | null
  emailDelivered: boolean
  smsDelivered: boolean
  emailSkipped: boolean
  smsSkipped: boolean
}

function getBookingUrl(clubId: string) {
  return buildPlatformUrl(`/clubs/${clubId}/play`)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getCampaignRecipientNameParts(name?: string | null) {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  return {
    fullName: parts.join(' ') || 'there',
    firstName: parts[0] || 'there',
    lastName: parts.slice(1).join(' '),
  }
}

function interpolateCampaignText(
  text: string,
  replacements: Record<string, string>,
) {
  return Object.entries(replacements).reduce((result, [token, replacement]) => {
    const pattern = new RegExp(`\\{\\{${escapeRegExp(token)}\\}\\}|\\{${escapeRegExp(token)}\\}`, 'gi')
    return result.replace(pattern, replacement)
  }, text)
}

async function deliverCampaignToUser(opts: {
  club: CampaignClub
  user: CampaignUser
  channel: CampaignChannel
  subject?: string
  body: string
  smsBody?: string
  ctaLabel?: string
  ctaUrl?: string
  logId?: string
}) : Promise<DeliveryResult> {
  const { club, user, channel, logId } = opts
  const recipientName = getCampaignRecipientNameParts(user.name)
  const bookingUrl = getBookingUrl(club.id)
  const shouldSendEmail = channel === 'email' || channel === 'both'
  const shouldSendSms = channel === 'sms' || channel === 'both'
  const templateValues = {
    name: recipientName.firstName,
    first_name: recipientName.firstName,
    full_name: recipientName.fullName,
    last_name: recipientName.lastName,
    club: club.name,
    club_name: club.name,
    event_name: 'our upcoming event',
    event_date: 'a date to be confirmed',
    expires_in_days: 'soon',
  }

  const emailSubject = opts.subject
    ? interpolateCampaignText(opts.subject, templateValues)
    : `Message from ${club.name}`
  const emailBody = interpolateCampaignText(opts.body, templateValues)
  const smsText = opts.smsBody
    ? interpolateCampaignText(opts.smsBody, templateValues)
    : (shouldSendSms ? interpolateCampaignText(opts.body, templateValues).slice(0, 300) : undefined)

  let externalMessageId: string | null = null
  let emailDelivered = false
  let smsDelivered = false
  let emailSkipped = false
  let smsSkipped = false

  if (shouldSendEmail) {
    if (user.email) {
      try {
        const result = await sendOutreachEmail({
          to: user.email,
          subject: emailSubject,
          body: emailBody,
          clubName: club.name,
          bookingUrl,
          ctaLabel: opts.ctaLabel,
          ctaUrl: opts.ctaUrl,
        })
        emailDelivered = true
        externalMessageId = result.messageId || null
      } catch (error) {
        console.error(`[advisor-campaign-jobs] Email failed for ${user.id}:`, (error as Error).message)
      }
    } else {
      emailSkipped = true
    }
  }

  if (shouldSendSms) {
    // Defensive normalisation in case `user.phone` was written before
    // we started normalising at the sync layer (legacy rows). Twilio
    // rejects non-E.164 with a 400, so we'd rather skip than burn a
    // request + AIRecommendationLog row on a guaranteed failure.
    const smsTo = normalizePhone(user.phone) || user.phone || null
    if (smsText && smsTo && user.smsOptIn) {
      try {
        const optOutUrl = generateUnsubscribeUrl(user.id, club.id)
        const result = await sendSms({
          to: smsTo,
          body: appendSmsOptOut(smsText, optOutUrl),
          logId,
        })
        smsDelivered = true
        externalMessageId = externalMessageId || result.sid || null
      } catch (error) {
        console.error(`[advisor-campaign-jobs] SMS failed for ${user.id}:`, (error as Error).message)
      }
    } else {
      smsSkipped = true
    }
  }

  const sent = emailDelivered || smsDelivered
  const skipped = channel === 'email'
    ? emailSkipped
    : channel === 'sms'
      ? smsSkipped
      : emailSkipped && smsSkipped

  return {
    status: sent ? 'sent' : skipped ? 'skipped' : 'failed',
    externalMessageId,
    emailDelivered,
    smsDelivered,
    emailSkipped,
    smsSkipped,
  }
}

async function getCampaignContext(prisma: any, input: CampaignDraftInput) {
  const recipientMemberIds = Array.from(
    new Set((input.recipients || []).map((recipient) => recipient.memberId).filter(Boolean)),
  )
  const userIds = recipientMemberIds.length > 0 ? recipientMemberIds : input.memberIds
  const club = await prisma.club.findUnique({
    where: { id: input.clubId },
    select: { id: true, name: true, automationSettings: true },
  })
  if (!club) throw new Error('Club not found')

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true, phone: true, smsOptIn: true },
  })

  return { club, users }
}

function resolveScheduledCampaignActionKind(log: {
  type: CampaignType
  reasoning?: Record<string, any>
}): AgentOutreachRolloutActionKind {
  const explicit = typeof log.reasoning?.actionKind === 'string' ? log.reasoning.actionKind : null
  if (
    explicit === 'create_campaign'
    || explicit === 'fill_session'
    || explicit === 'reactivate_members'
    || explicit === 'trial_follow_up'
    || explicit === 'renewal_reactivation'
  ) {
    return explicit
  }

  if (log.reasoning?.membershipLifecycle === 'trial_follow_up') {
    return 'trial_follow_up'
  }
  if (log.reasoning?.membershipLifecycle === 'renewal_reactivation') {
    return 'renewal_reactivation'
  }
  if (log.type === 'SLOT_FILLER') {
    return 'fill_session'
  }
  if (log.type === 'REACTIVATION') {
    return 'reactivate_members'
  }

  return 'create_campaign'
}

export async function sendCampaignNow(prisma: any, input: CampaignDraftInput) {
  const { club, users } = await getCampaignContext(prisma, input)
  const recipientChannelByUserId = new Map(
    (input.recipients || []).map((recipient) => [recipient.memberId, recipient.channel]),
  )
  const guestTrialAttribution = inferGuestTrialOfferAttribution({
    automationSettings: club.automationSettings,
    subject: input.subject,
    body: input.body,
    smsBody: input.smsBody,
    source: input.source,
  })
  const referralAttribution = inferReferralOfferAttribution({
    automationSettings: club.automationSettings,
    subject: input.subject,
    body: input.body,
    smsBody: input.smsBody,
    source: input.source,
  })
  const resolvedGuestTrialAttribution = input.guestTrialContext
    ? buildGuestTrialOfferAttributionFromContext(input.guestTrialContext)
    : guestTrialAttribution
  const resolvedReferralAttribution = input.referralContext
    ? buildReferralOfferAttributionFromContext(input.referralContext)
    : referralAttribution

  let sent = 0
  let failed = 0
  let skipped = 0
  let emailSent = 0
  let smsSent = 0
  const results: { userId: string; status: string; channel: CampaignChannel; messageId?: string }[] = []

  for (const user of users) {
    const resolvedChannel = recipientChannelByUserId.get(user.id) || input.channel
    const delivery = await deliverCampaignToUser({
      club,
      user,
      channel: resolvedChannel,
      subject: input.subject,
      body: input.body,
      smsBody: input.smsBody,
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
    })

    await prisma.aIRecommendationLog.create({
      data: {
        clubId: input.clubId,
        userId: user.id,
        type: input.type,
        channel: resolvedChannel,
        sessionId: input.sessionId || null,
        externalMessageId: delivery.externalMessageId,
        variantId: input.type,
        reasoning: {
          source: input.source || 'manual_campaign',
          actionKind: input.actionKind || null,
          subject: input.subject || null,
          bodyPreview: input.body.slice(0, 200),
          guestTrialAttribution: resolvedGuestTrialAttribution || null,
          referralAttribution: resolvedReferralAttribution || null,
          emailDelivered: delivery.emailDelivered,
          smsDelivered: delivery.smsDelivered,
        },
        status: delivery.status,
      },
    }).catch((error: unknown) => {
      console.error(`[advisor-campaign-jobs] Failed to log campaign for ${user.id}:`, error)
    })

    if (delivery.status === 'sent') {
      sent += 1
      if (delivery.emailDelivered) emailSent += 1
      if (delivery.smsDelivered) smsSent += 1
    } else if (delivery.status === 'skipped') {
      skipped += 1
    } else {
      failed += 1
    }

    results.push({
      userId: user.id,
      status: delivery.status,
      channel: resolvedChannel,
      messageId: delivery.externalMessageId || undefined,
    })
  }

  if (emailSent > 0) await reportUsage(input.clubId, 'email', emailSent).catch(() => {})
  if (smsSent > 0) await reportUsage(input.clubId, 'sms', smsSent).catch(() => {})

  return { sent, failed, skipped, emailSent, smsSent, results }
}

function mapWizardGoalToCampaignType(goal: string | null | undefined): CampaignType {
  switch (goal) {
    case 'reactivate_dormant':
      return 'REACTIVATION'
    case 'onboard_new':
      return 'NEW_MEMBER_WELCOME'
    case 'promote_event':
      return 'EVENT_INVITE'
    case 'upsell_tier':
      return 'RETENTION_BOOST'
    case 'renewal_reminder':
      return 'CHECK_IN'
    case 'custom':
    default:
      return 'CHECK_IN'
  }
}

function mapCampaignChannelsToDraftChannel(channels: unknown): CampaignChannel {
  const normalized = Array.isArray(channels)
    ? channels.filter((channel): channel is string => typeof channel === 'string')
    : []

  if (normalized.includes('email') && normalized.includes('sms')) return 'both'
  if (normalized.includes('sms')) return 'sms'
  return 'email'
}

function extractCampaignSnapshotUserIds(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray((snapshot as Record<string, unknown>).userIds)) {
    return []
  }

  return Array.from(
    new Set(
      ((snapshot as Record<string, unknown>).userIds as unknown[])
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
    ),
  )
}

function extractCampaignSnapshotCta(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ctaLabel: undefined, ctaUrl: undefined }
  }

  const record = snapshot as Record<string, unknown>
  return {
    ctaLabel: typeof record.ctaLabel === 'string' && record.ctaLabel.trim().length > 0 ? record.ctaLabel.trim() : undefined,
    ctaUrl: typeof record.ctaUrl === 'string' && record.ctaUrl.trim().length > 0 ? record.ctaUrl.trim() : undefined,
  }
}

export async function processCampaignSendQueue(prisma: any, opts?: { limit?: number; campaignId?: string }) {
  const limit = Math.max(1, Math.min(opts?.limit || 50, 200))
  const now = new Date()
  const where = opts?.campaignId
    ? { id: opts.campaignId }
    : {
        status: { in: ['running', 'scheduled'] },
        sentCount: 0,
        failedCount: 0,
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: now } },
        ],
      }

  const campaigns = await prisma.campaign.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      clubId: true,
      goal: true,
      subject: true,
      body: true,
      channels: true,
      status: true,
      scheduledAt: true,
      launchedAt: true,
      createdAt: true,
      sentCount: true,
      deliveredCount: true,
      failedCount: true,
      cohortSnapshot: true,
    },
    ...(opts?.campaignId ? {} : { take: limit }),
  })

  if (campaigns.length === 0) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      emailSent: 0,
      smsSent: 0,
      campaigns: [] as Array<{
        id: string
        status: string
        sent: number
        skipped: number
        failed: number
        emailSent: number
        smsSent: number
      }>,
    }
  }

  let processed = 0
  let sent = 0
  let skipped = 0
  let failed = 0
  let emailSent = 0
  let smsSent = 0
  const results: Array<{
    id: string
    status: string
    sent: number
    skipped: number
    failed: number
    emailSent: number
    smsSent: number
  }> = []

  for (const campaign of campaigns) {
    const snapshot = (campaign.cohortSnapshot || {}) as Record<string, unknown>
    const campaignCta = extractCampaignSnapshotCta(snapshot)
    const memberIds = extractCampaignSnapshotUserIds(snapshot)
    const processedAt = new Date()
    const processedAtIso = processedAt.toISOString()

    if (memberIds.length === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        select: { id: true },
        data: {
          status: 'failed',
          completedAt: processedAt,
          failedCount: Math.max(campaign.failedCount || 0, 1),
          cohortSnapshot: {
            ...snapshot,
            processedAt: processedAtIso,
            error: 'Campaign snapshot has no recipient userIds',
          } as any,
        },
      })
      processed += 1
      failed += 1
      results.push({
        id: campaign.id,
        status: 'failed',
        sent: 0,
        skipped: 0,
        failed: 1,
        emailSent: 0,
        smsSent: 0,
      })
      continue
    }

    const body = typeof campaign.body === 'string' ? campaign.body.trim() : ''
    if (!body) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        select: { id: true },
        data: {
          status: 'failed',
          completedAt: processedAt,
          failedCount: Math.max(campaign.failedCount || 0, memberIds.length),
          cohortSnapshot: {
            ...snapshot,
            processedAt: processedAtIso,
            error: 'Campaign body is empty',
          } as any,
        },
      })
      processed += 1
      failed += memberIds.length
      results.push({
        id: campaign.id,
        status: 'failed',
        sent: 0,
        skipped: 0,
        failed: memberIds.length,
        emailSent: 0,
        smsSent: 0,
      })
      continue
    }

    const delivery = await sendCampaignNow(prisma, {
      clubId: campaign.clubId,
      type: mapWizardGoalToCampaignType(campaign.goal),
      channel: mapCampaignChannelsToDraftChannel(campaign.channels),
      memberIds,
      subject: typeof campaign.subject === 'string' ? campaign.subject : undefined,
      body,
      ctaLabel: campaignCta.ctaLabel,
      ctaUrl: campaignCta.ctaUrl,
      source: 'campaign_wizard',
      actionKind: 'create_campaign',
    })

    const nextStatus = delivery.sent > 0 || delivery.skipped > 0 ? 'completed' : 'failed'

    await prisma.campaign.update({
      where: { id: campaign.id },
      select: { id: true },
      data: {
        status: nextStatus,
        launchedAt: campaign.launchedAt || processedAt,
        completedAt: processedAt,
        sentCount: delivery.sent,
        deliveredCount: delivery.sent,
        failedCount: delivery.failed,
        cohortSnapshot: {
          ...snapshot,
          processedAt: processedAtIso,
          sendResult: {
            sent: delivery.sent,
            skipped: delivery.skipped,
            failed: delivery.failed,
            emailSent: delivery.emailSent,
            smsSent: delivery.smsSent,
          },
        } as any,
      },
    })

    processed += 1
    sent += delivery.sent
    skipped += delivery.skipped
    failed += delivery.failed
    emailSent += delivery.emailSent
    smsSent += delivery.smsSent
    results.push({
      id: campaign.id,
      status: nextStatus,
      sent: delivery.sent,
      skipped: delivery.skipped,
      failed: delivery.failed,
      emailSent: delivery.emailSent,
      smsSent: delivery.smsSent,
    })
  }

  return {
    processed,
    sent,
    skipped,
    failed,
    emailSent,
    smsSent,
    campaigns: results,
  }
}

export async function scheduleCampaignSend(prisma: any, input: CampaignDraftInput & {
  scheduledFor: string
  timeZone: string
}) {
  const { users } = await getCampaignContext(prisma, input)
  const club = await prisma.club.findUnique({
    where: { id: input.clubId },
    select: { automationSettings: true },
  })
  const recipientChannelByUserId = new Map(
    (input.recipients || []).map((recipient) => [recipient.memberId, recipient.channel]),
  )
  const guestTrialAttribution = inferGuestTrialOfferAttribution({
    automationSettings: club?.automationSettings,
    subject: input.subject,
    body: input.body,
    smsBody: input.smsBody,
    source: input.source,
  })
  const referralAttribution = inferReferralOfferAttribution({
    automationSettings: club?.automationSettings,
    subject: input.subject,
    body: input.body,
    smsBody: input.smsBody,
    source: input.source,
  })
  const resolvedGuestTrialAttribution = input.guestTrialContext
    ? buildGuestTrialOfferAttributionFromContext(input.guestTrialContext)
    : guestTrialAttribution
  const resolvedReferralAttribution = input.referralContext
    ? buildReferralOfferAttributionFromContext(input.referralContext)
    : referralAttribution
  if (users.length === 0) {
    return {
      scheduled: 0,
      scheduledFor: input.scheduledFor,
      timeZone: input.timeZone,
    }
  }

  await prisma.aIRecommendationLog.createMany({
    data: users.map((user: CampaignUser) => ({
      clubId: input.clubId,
      userId: user.id,
      type: input.type,
      channel: recipientChannelByUserId.get(user.id) || input.channel,
      sessionId: input.sessionId || null,
      variantId: input.type,
      status: 'scheduled',
      reasoning: {
        source: 'advisor_scheduled_campaign',
        actionKind: input.actionKind || null,
        subject: input.subject || null,
        body: input.body,
        smsBody: input.smsBody || null,
        guestTrialAttribution: resolvedGuestTrialAttribution || null,
        referralAttribution: resolvedReferralAttribution || null,
        scheduledFor: input.scheduledFor,
        timeZone: input.timeZone,
        recipientRules: input.recipientRules || null,
      },
    })),
  })

  return {
    scheduled: users.length,
    scheduledFor: input.scheduledFor,
    timeZone: input.timeZone,
  }
}

export async function processScheduledAdvisorCampaigns(prisma: any, opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(opts?.limit || 200, 500))

  const dueRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text
    FROM ai_recommendation_logs
    WHERE status = 'scheduled'
      AND reasoning->>'source' = 'advisor_scheduled_campaign'
      AND COALESCE((reasoning->>'scheduledFor')::timestamptz, NOW() + interval '100 years') <= NOW()
    ORDER BY "createdAt" ASC
    LIMIT ${limit}
  `

  if (dueRows.length === 0) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      emailSent: 0,
      smsSent: 0,
    }
  }

  const dueIds = dueRows.map((row: { id: string }) => row.id)
  const logs = await prisma.aIRecommendationLog.findMany({
    where: { id: { in: dueIds } },
    include: {
      user: {
        select: { id: true, email: true, name: true, phone: true, smsOptIn: true },
      },
      club: {
        select: { id: true, name: true, automationSettings: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  let processed = 0
  let sent = 0
  let skipped = 0
  let failed = 0
  let emailSent = 0
  let smsSent = 0
  const usageByClub = new Map<string, { email: number; sms: number }>()

  for (const log of logs) {
    const claimed = await prisma.aIRecommendationLog.updateMany({
      where: { id: log.id, status: 'scheduled' },
      data: { status: 'processing' },
    })
    if (claimed.count === 0) continue

    processed += 1
    const reasoning = (log.reasoning || {}) as Record<string, any>

    try {
      const rolloutActionKind = resolveScheduledCampaignActionKind({
        type: log.type as CampaignType,
        reasoning,
      })
      const controlPlane = evaluateAgentControlPlaneAction({
        automationSettings: log.club.automationSettings,
        action: 'outreachSend',
        clubId: log.clubId,
      })
      const rollout = evaluateAgentOutreachRollout({
        clubId: log.clubId,
        automationSettings: log.club.automationSettings,
        actionKind: rolloutActionKind,
      })

      if (!controlPlane.allowed) {
        skipped += 1
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            status: 'skipped',
            reasoning: {
              ...reasoning,
              processedAt: new Date().toISOString(),
              controlPlane: {
                mode: controlPlane.mode,
                reason: controlPlane.reason,
              },
            },
          },
        })
        await persistAgentDecisionRecord(prisma, {
          clubId: log.clubId,
          actorType: 'system',
          action: 'outreachSend',
          targetType: 'recommendation_log',
          targetId: log.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: controlPlane.reason,
          metadata: {
            reason: 'control_plane_disabled',
            source: reasoning.source || 'advisor_scheduled_campaign',
            channel: log.channel,
            recipientUserId: log.userId,
          },
        })
        continue
      }

      if (!controlPlane.shadow && !rollout.allowed) {
        skipped += 1
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            status: 'skipped',
            reasoning: {
              ...reasoning,
              processedAt: new Date().toISOString(),
              rollout: {
                clubAllowlisted: rollout.clubAllowlisted,
                actionEnabled: rollout.actionEnabled,
                reason: rollout.reason,
              },
            },
          },
        })
        await persistAgentDecisionRecord(prisma, {
          clubId: log.clubId,
          actorType: 'system',
          action: 'outreachSend',
          targetType: 'recommendation_log',
          targetId: log.id,
          mode: controlPlane.mode,
          result: 'blocked',
          summary: rollout.reason,
          metadata: {
            reason: 'outreach_rollout_blocked',
            source: reasoning.source || 'advisor_scheduled_campaign',
            channel: log.channel,
            recipientUserId: log.userId,
            actionKind: rolloutActionKind,
          },
        })
        continue
      }

      const guardrails = await evaluateAdvisorContactGuardrails({
        prisma,
        clubId: log.clubId,
        type: log.type as CampaignType,
        requestedChannel: (log.channel || 'email') as CampaignChannel,
        candidates: [{ memberId: log.userId }],
        sessionId: log.sessionId || null,
        timeZone: typeof reasoning.timeZone === 'string' ? reasoning.timeZone : null,
        automationSettings: log.club.automationSettings,
        now: new Date(),
      })

      if (guardrails.eligibleCandidates.length === 0) {
        skipped += 1
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            status: 'skipped',
            reasoning: {
              ...reasoning,
              processedAt: new Date().toISOString(),
              guardrails: guardrails.summary,
            },
          },
        })
        continue
      }

      if (controlPlane.shadow) {
        skipped += 1
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            status: 'skipped',
            reasoning: {
              ...reasoning,
              processedAt: new Date().toISOString(),
              controlPlane: {
                mode: controlPlane.mode,
                reason: controlPlane.reason,
              },
              shadowed: true,
            },
          },
        })
        await persistAgentDecisionRecord(prisma, {
          clubId: log.clubId,
          actorType: 'system',
          action: 'outreachSend',
          targetType: 'recommendation_log',
          targetId: log.id,
          mode: controlPlane.mode,
          result: 'shadowed',
          summary: `Scheduled outreach for ${log.user.name || log.user.email || 'member'} was reviewed in shadow mode.`,
          metadata: {
            source: reasoning.source || 'advisor_scheduled_campaign',
            channel: log.channel,
            recipientUserId: log.userId,
          },
        })
        continue
      }

      const resolvedChannel = guardrails.eligibleCandidates[0]?.channel || (log.channel || 'email')
      const delivery = await deliverCampaignToUser({
        club: log.club,
        user: log.user,
        channel: resolvedChannel as CampaignChannel,
        subject: typeof reasoning.subject === 'string' ? reasoning.subject : undefined,
        body: typeof reasoning.body === 'string' ? reasoning.body : '',
        smsBody: typeof reasoning.smsBody === 'string' ? reasoning.smsBody : undefined,
        logId: log.id,
      })

      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          status: delivery.status,
          channel: resolvedChannel,
          externalMessageId: delivery.externalMessageId,
          reasoning: {
            ...reasoning,
            processedAt: new Date().toISOString(),
            emailDelivered: delivery.emailDelivered,
            smsDelivered: delivery.smsDelivered,
            guardrails: guardrails.summary,
          },
        },
      })

      if (delivery.status === 'sent') {
        sent += 1
        if (delivery.emailDelivered) {
          emailSent += 1
          const current = usageByClub.get(log.clubId) || { email: 0, sms: 0 }
          current.email += 1
          usageByClub.set(log.clubId, current)
        }
        if (delivery.smsDelivered) {
          smsSent += 1
          const current = usageByClub.get(log.clubId) || { email: 0, sms: 0 }
          current.sms += 1
          usageByClub.set(log.clubId, current)
        }
      } else if (delivery.status === 'skipped') {
        skipped += 1
      } else {
        failed += 1
      }

      await persistAgentDecisionRecord(prisma, {
        clubId: log.clubId,
        actorType: 'system',
        action: 'outreachSend',
        targetType: 'recommendation_log',
        targetId: log.id,
        mode: controlPlane.mode,
        result: delivery.status === 'sent' ? 'executed' : delivery.status === 'skipped' ? 'reviewed' : 'failed',
        summary: delivery.status === 'sent'
          ? `Scheduled outreach for ${log.user.name || log.user.email || 'member'} sent live.`
          : delivery.status === 'skipped'
            ? `Scheduled outreach for ${log.user.name || log.user.email || 'member'} was skipped at delivery time.`
            : `Scheduled outreach for ${log.user.name || log.user.email || 'member'} failed at delivery time.`,
        metadata: {
          source: reasoning.source || 'advisor_scheduled_campaign',
          channel: resolvedChannel,
          recipientUserId: log.userId,
          emailDelivered: delivery.emailDelivered,
          smsDelivered: delivery.smsDelivered,
        },
      })
    } catch (error) {
      failed += 1
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          status: 'failed',
          reasoning: {
            ...reasoning,
            processedAt: new Date().toISOString(),
            error: (error as Error).message,
          },
        },
      }).catch(() => {})
    }
  }

  await Promise.all(
    Array.from(usageByClub.entries()).flatMap(([clubId, usage]) => {
      const tasks: Promise<unknown>[] = []
      if (usage.email > 0) tasks.push(reportUsage(clubId, 'email', usage.email).catch(() => {}))
      if (usage.sms > 0) tasks.push(reportUsage(clubId, 'sms', usage.sms).catch(() => {}))
      return tasks
    }),
  )

  return { processed, sent, skipped, failed, emailSent, smsSent }
}
