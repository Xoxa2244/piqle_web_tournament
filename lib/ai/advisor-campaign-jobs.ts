import 'server-only'

import { sendOutreachEmail } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { reportUsage } from '@/lib/stripe-usage'

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
}

type CampaignDraftInput = {
  clubId: string
  type: CampaignType
  channel: CampaignChannel
  memberIds: string[]
  subject?: string
  body: string
  smsBody?: string
  sessionId?: string
  source?: string
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  const appUrl = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`
  return `${appUrl}/clubs/${clubId}/play`
}

function interpolateCampaignText(text: string, memberName: string, clubName: string) {
  return text
    .replace(/\{\{name\}\}/g, memberName)
    .replace(/\{\{club\}\}/g, clubName)
}

async function deliverCampaignToUser(opts: {
  club: CampaignClub
  user: CampaignUser
  channel: CampaignChannel
  subject?: string
  body: string
  smsBody?: string
  logId?: string
}) : Promise<DeliveryResult> {
  const { club, user, channel, logId } = opts
  const memberName = user.name?.split(' ')[0] || 'there'
  const bookingUrl = getBookingUrl(club.id)
  const shouldSendEmail = channel === 'email' || channel === 'both'
  const shouldSendSms = channel === 'sms' || channel === 'both'

  const emailSubject = opts.subject
    ? interpolateCampaignText(opts.subject, memberName, club.name)
    : `Message from ${club.name}`
  const emailBody = interpolateCampaignText(opts.body, memberName, club.name)
  const smsText = opts.smsBody
    ? interpolateCampaignText(opts.smsBody, memberName, club.name)
    : (shouldSendSms ? interpolateCampaignText(opts.body, memberName, club.name).slice(0, 300) : undefined)

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
    if (smsText && user.phone && user.smsOptIn) {
      try {
        const result = await sendSms({
          to: user.phone,
          body: smsText,
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
  const club = await prisma.club.findUnique({
    where: { id: input.clubId },
    select: { id: true, name: true },
  })
  if (!club) throw new Error('Club not found')

  const users = await prisma.user.findMany({
    where: { id: { in: input.memberIds } },
    select: { id: true, email: true, name: true, phone: true, smsOptIn: true },
  })

  return { club, users }
}

export async function sendCampaignNow(prisma: any, input: CampaignDraftInput) {
  const { club, users } = await getCampaignContext(prisma, input)

  let sent = 0
  let failed = 0
  let skipped = 0
  let emailSent = 0
  let smsSent = 0
  const results: { userId: string; status: string; channel: CampaignChannel; messageId?: string }[] = []

  for (const user of users) {
    const delivery = await deliverCampaignToUser({
      club,
      user,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      smsBody: input.smsBody,
    })

    await prisma.aIRecommendationLog.create({
      data: {
        clubId: input.clubId,
        userId: user.id,
        type: input.type,
        channel: input.channel,
        sessionId: input.sessionId || null,
        externalMessageId: delivery.externalMessageId,
        variantId: input.type,
        reasoning: {
          source: input.source || 'manual_campaign',
          subject: input.subject || null,
          bodyPreview: input.body.slice(0, 200),
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
      channel: input.channel,
      messageId: delivery.externalMessageId || undefined,
    })
  }

  if (emailSent > 0) await reportUsage(input.clubId, 'email', emailSent).catch(() => {})
  if (smsSent > 0) await reportUsage(input.clubId, 'sms', smsSent).catch(() => {})

  return { sent, failed, skipped, emailSent, smsSent, results }
}

export async function scheduleCampaignSend(prisma: any, input: CampaignDraftInput & {
  scheduledFor: string
  timeZone: string
}) {
  const { users } = await getCampaignContext(prisma, input)
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
      channel: input.channel,
      sessionId: input.sessionId || null,
      variantId: input.type,
      status: 'scheduled',
      reasoning: {
        source: 'advisor_scheduled_campaign',
        subject: input.subject || null,
        body: input.body,
        smsBody: input.smsBody || null,
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
        select: { id: true, name: true },
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
      const delivery = await deliverCampaignToUser({
        club: log.club,
        user: log.user,
        channel: (log.channel || 'email') as CampaignChannel,
        subject: typeof reasoning.subject === 'string' ? reasoning.subject : undefined,
        body: typeof reasoning.body === 'string' ? reasoning.body : '',
        smsBody: typeof reasoning.smsBody === 'string' ? reasoning.smsBody : undefined,
        logId: log.id,
      })

      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          status: delivery.status,
          externalMessageId: delivery.externalMessageId,
          reasoning: {
            ...reasoning,
            processedAt: new Date().toISOString(),
            emailDelivered: delivery.emailDelivered,
            smsDelivered: delivery.smsDelivered,
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
