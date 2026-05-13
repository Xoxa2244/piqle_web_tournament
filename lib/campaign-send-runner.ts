import { buildOutreachTemplateValues, isBlockedEmail, sendOutreachEmail } from '@/lib/email'
import { resolveAgentControlPlane } from '@/lib/ai/agent-control-plane'
import { cronLogger as log } from '@/lib/logger'
import {
  getCampaignSequenceDueCandidates,
  parseRecurringCron,
  shouldFireRecurringNow,
} from '@/lib/campaign-scheduling'

const MAX_BATCH = 50
const MAX_RETRIES = 3
const FAN_OUT_LIMIT = 200

interface CampaignSendRunnerOptions {
  campaignId?: string
  limit?: number
  now?: Date
}

interface ClaimedRow {
  id: string
  userId: string
  retry_count: number
  sequence_step: number | null
}

interface CampaignUserRow {
  id: string
  email: string | null
  name: string | null
}

interface SequenceStepData {
  stepIndex: number
  delayDays: number
  delayMinutes?: number | null
  subject: string
  body: string
  ctaLabel?: string | null
  ctaUrl?: string | null
}

interface CampaignForRunner {
  id: string
  clubId: string
  name: string
  subject: string | null
  body: string | null
  cohortSnapshot: unknown
  ctaLabel: string | null
  ctaUrl: string | null
  format: string
  steps: unknown
  exitOnBooking: boolean
  cohortId: string | null
  cronExpression: string | null
  recurringTimezone: string | null
  lastRecurringRun: Date | null
  channels: string[]
  status: string
  scheduledAt: Date | null
  launchedAt: Date | null
  club: { id: string; automationSettings: unknown }
}

type SequenceLogSnapshot = {
  id: string
  userId: string
  sequenceStep: number | null
  status: string
  createdAt: Date
  sentAt: Date | null
  reasoning?: unknown
}

function toSnapshotRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function getCampaignSequenceSteps(campaign: Pick<CampaignForRunner, 'steps' | 'cohortSnapshot'>): SequenceStepData[] {
  if (Array.isArray(campaign.steps)) {
    return campaign.steps as SequenceStepData[]
  }

  const snapshot = toSnapshotRecord(campaign.cohortSnapshot)
  return Array.isArray(snapshot.steps) ? snapshot.steps as SequenceStepData[] : []
}

function getCampaignSnapshotUserIds(snapshotValue: unknown): string[] {
  const snapshot = toSnapshotRecord(snapshotValue)
  if (!Array.isArray(snapshot.userIds)) return []

  const userIds = snapshot.userIds
    .map((value) => (typeof value === 'string' ? value : null))
    .filter((value): value is string => Boolean(value))

  return Array.from(new Set(userIds))
}

function getPrimaryChannel(channels: string[]) {
  return channels.includes('email') ? 'email' : 'sms'
}

function buildSequenceReasoning(campaign: CampaignForRunner, stepIndex: number) {
  const steps = getCampaignSequenceSteps(campaign)
  return {
    campaignName: campaign.name,
    totalSteps: steps.length,
    sequenceStep: stepIndex,
    stepNumber: stepIndex + 1,
  }
}

export function authorizeCampaignSendCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  }

  const authHeader = request.headers.get('authorization')
  const forwardedAuthHeader = request.headers.get('upstash-forward-authorization')
  if (authHeader === `Bearer ${cronSecret}` || forwardedAuthHeader === `Bearer ${cronSecret}`) {
    return { ok: true as const }
  }

  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

async function activateCampaignIfDue(prisma: any, campaign: CampaignForRunner, now: Date) {
  if (campaign.status !== 'scheduled') {
    return campaign
  }

  if (campaign.scheduledAt && campaign.scheduledAt.getTime() > now.getTime()) {
    return null
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: 'running',
      launchedAt: campaign.launchedAt ?? now,
    },
    select: {
      id: true,
      clubId: true,
      name: true,
      subject: true,
      body: true,
      cohortSnapshot: true,
      ctaLabel: true,
      ctaUrl: true,
      format: true,
      steps: true,
      exitOnBooking: true,
      cohortId: true,
      cronExpression: true,
      recurringTimezone: true,
      lastRecurringRun: true,
      channels: true,
      status: true,
      scheduledAt: true,
      launchedAt: true,
      club: { select: { id: true, automationSettings: true } },
    },
  })

  return updated as CampaignForRunner
}

async function ensureSequenceRootLogs(prisma: any, campaign: CampaignForRunner) {
  if (campaign.format !== 'sequence') return { created: 0 }

  const steps = getCampaignSequenceSteps(campaign)
  if (steps.length === 0) return { created: 0 }

  const userIds = getCampaignSnapshotUserIds(campaign.cohortSnapshot)
  if (userIds.length === 0) return { created: 0 }

  const existingLogs = await prisma.aIRecommendationLog.findMany({
    where: {
      campaignId: campaign.id,
      type: 'CAMPAIGN_SEND',
      sequenceStep: 0,
      userId: { in: userIds },
    },
    select: { userId: true },
  })

  const existingUserIds = new Set(
    existingLogs
      .map((log: { userId?: string | null }) => (typeof log.userId === 'string' ? log.userId : null))
      .filter((value: string | null): value is string => Boolean(value)),
  )

  const missingUserIds = userIds.filter((userId) => !existingUserIds.has(userId))
  if (missingUserIds.length === 0) return { created: 0 }

  await prisma.aIRecommendationLog.createMany({
    data: missingUserIds.map((userId) => ({
      clubId: campaign.clubId,
      userId,
      type: 'CAMPAIGN_SEND' as const,
      channel: getPrimaryChannel(campaign.channels),
      status: 'pending',
      campaignId: campaign.id,
      sequenceStep: 0,
      reasoning: buildSequenceReasoning(campaign, 0),
    })),
  })

  return { created: missingUserIds.length }
}

async function fanOutRecurring(prisma: any, campaign: CampaignForRunner, now: Date): Promise<{ created: number }> {
  if (campaign.format !== 'recurring') return { created: 0 }
  if (!campaign.cronExpression) return { created: 0 }

  const cron = parseRecurringCron(campaign.cronExpression)
  if (!cron) return { created: 0 }

  const timezone = campaign.recurringTimezone || 'UTC'
  if (!shouldFireRecurringNow(cron, timezone, now, campaign.lastRecurringRun)) {
    return { created: 0 }
  }

  if (!campaign.cohortId) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { lastRecurringRun: now },
    })
    return { created: 0 }
  }

  const cohort = await prisma.clubCohort.findUnique({ where: { id: campaign.cohortId } })
  if (!cohort || cohort.clubId !== campaign.clubId) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { lastRecurringRun: now },
    })
    return { created: 0 }
  }

  const { resolveCohortMembersForCron } = await import('@/server/routers/intelligence')
  const filters = Array.isArray(cohort.filters) ? cohort.filters : (cohort.filters as any) || []
  const rows = await resolveCohortMembersForCron(prisma, campaign.clubId, filters, 2000)
  const userIds = Array.from(
    new Set(
      rows
        .map((row: { id?: string | null }) => (typeof row.id === 'string' ? row.id : null))
        .filter((value): value is string => Boolean(value)),
    ),
  )

  if (userIds.length === 0) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { lastRecurringRun: now },
    })
    return { created: 0 }
  }

  await prisma.aIRecommendationLog.createMany({
    data: userIds.map((userId) => ({
      clubId: campaign.clubId,
      userId,
      type: 'CAMPAIGN_SEND' as const,
      channel: getPrimaryChannel(campaign.channels),
      status: 'pending',
      campaignId: campaign.id,
      reasoning: {
        campaignName: campaign.name,
        recurringTickAt: now.toISOString(),
      },
    })),
  })

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { lastRecurringRun: now },
  })

  return { created: userIds.length }
}

async function fanOutNextSteps(prisma: any, campaign: CampaignForRunner, now: Date): Promise<{ created: number; exited: number }> {
  if (campaign.format !== 'sequence') return { created: 0, exited: 0 }

  const steps = getCampaignSequenceSteps(campaign)
  if (steps.length <= 1) return { created: 0, exited: 0 }

  const sequenceLogs: SequenceLogSnapshot[] = await prisma.aIRecommendationLog.findMany({
    where: {
      campaignId: campaign.id,
      type: 'CAMPAIGN_SEND',
      sequenceStep: { not: null },
    },
    select: {
      id: true,
      userId: true,
      status: true,
      sequenceStep: true,
      createdAt: true,
      sentAt: true,
      reasoning: true,
    },
  })

  if (sequenceLogs.length === 0) return { created: 0, exited: 0 }

  const sourceLogById = new Map(sequenceLogs.map((entry: SequenceLogSnapshot) => [entry.id, entry] as const))
  const candidates = getCampaignSequenceDueCandidates(steps, sequenceLogs, now).slice(0, FAN_OUT_LIMIT)
  if (candidates.length === 0) return { created: 0, exited: 0 }

  let exited = 0
  let queueCandidates = candidates

  if (campaign.exitOnBooking) {
    const userIds = Array.from(new Set(candidates.map((candidate) => candidate.userId)))
    const minSentAt = candidates.reduce<Date>(
      (min, candidate) => (candidate.sentAt < min ? candidate.sentAt : min),
      candidates[0].sentAt,
    )

    const bookings = await prisma.playSessionBooking.findMany({
      where: {
        userId: { in: userIds },
        bookedAt: { gte: minSentAt },
        status: 'CONFIRMED',
      },
      select: {
        userId: true,
        bookedAt: true,
      },
    })

    const latestBookingByUser = new Map<string, Date>()
    for (const booking of bookings) {
      const current = latestBookingByUser.get(booking.userId)
      if (!current || booking.bookedAt > current) {
        latestBookingByUser.set(booking.userId, booking.bookedAt)
      }
    }

    const exitedLogIds = new Set<string>()
    for (const candidate of candidates) {
      const bookedAt = latestBookingByUser.get(candidate.userId)
      if (!bookedAt || bookedAt < candidate.sentAt) continue

      exited += 1
      exitedLogIds.add(candidate.logId)

      const sourceLog = sourceLogById.get(candidate.logId)
      const baseReasoning = toSnapshotRecord(sourceLog?.reasoning)
      await prisma.aIRecommendationLog.update({
        where: { id: candidate.logId },
        data: {
          reasoning: {
            ...baseReasoning,
            sequenceExit: 'booked_session',
            exitedAt: bookedAt.toISOString(),
            exitedBeforeStep: candidate.nextStep + 1,
          },
        },
      })
    }

    queueCandidates = candidates.filter((candidate) => !exitedLogIds.has(candidate.logId))
  }

  if (queueCandidates.length === 0) {
    return { created: 0, exited }
  }

  const existingLogs = await prisma.aIRecommendationLog.findMany({
    where: {
      campaignId: campaign.id,
      type: 'CAMPAIGN_SEND',
      OR: queueCandidates.map((candidate) => ({
        userId: candidate.userId,
        sequenceStep: candidate.nextStep,
      })),
    },
    select: {
      userId: true,
      sequenceStep: true,
    },
  })

  const existingKeys = new Set(
    existingLogs.map((entry: { userId: string; sequenceStep: number | null }) => `${entry.userId}:${entry.sequenceStep ?? -1}`),
  )
  const newLogs = queueCandidates.filter((candidate) => !existingKeys.has(`${candidate.userId}:${candidate.nextStep}`))
  if (newLogs.length === 0) {
    return { created: 0, exited }
  }

  await prisma.aIRecommendationLog.createMany({
    data: newLogs.map((candidate) => ({
      clubId: campaign.clubId,
      userId: candidate.userId,
      type: 'CAMPAIGN_SEND' as const,
      channel: getPrimaryChannel(campaign.channels),
      status: 'pending',
      campaignId: campaign.id,
      sequenceStep: candidate.nextStep,
      parentLogId: candidate.logId,
      reasoning: buildSequenceReasoning(campaign, candidate.nextStep),
    })),
  })

  return { created: newLogs.length, exited }
}

function resolveContentForLog(
  campaign: CampaignForRunner,
  sequenceStep: number | null,
): { subject: string | null; body: string | null; ctaLabel: string | null; ctaUrl: string | null } {
  if (campaign.format === 'sequence') {
    const steps = getCampaignSequenceSteps(campaign)
    const step = steps[sequenceStep ?? 0]
    if (step) {
      return {
        subject: step.subject,
        body: step.body,
        ctaLabel: step.ctaLabel ?? null,
        ctaUrl: step.ctaUrl ?? null,
      }
    }
  }

  return {
    subject: campaign.subject,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    ctaUrl: campaign.ctaUrl,
  }
}

async function processCampaign(prisma: any, campaign: CampaignForRunner): Promise<{ sent: number; failed: number; skipped: number }> {
  const claimed = await prisma.$queryRawUnsafe(
    `
    UPDATE ai_recommendation_logs
       SET sent_at = NOW()
     WHERE id IN (
        SELECT id FROM ai_recommendation_logs
         WHERE campaign_id = $1::uuid
           AND sent_at IS NULL
           AND type = 'CAMPAIGN_SEND'
           AND status = 'pending'
         ORDER BY "createdAt" ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id, "userId", retry_count, sequence_step
    `,
    campaign.id,
    MAX_BATCH,
  ) as ClaimedRow[]

  if (claimed.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  const users: CampaignUserRow[] = await prisma.user.findMany({
    where: { id: { in: claimed.map((row) => row.userId) } },
    select: { id: true, email: true, name: true },
  })
  const userById = new Map(users.map((user) => [user.id, user] as const))

  const club = await prisma.club.findUnique({
    where: { id: campaign.clubId },
    select: { name: true },
  })
  const clubName = club?.name ?? 'Your Club'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  const bookingUrl = `${baseUrl}/clubs/${campaign.clubId}`

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const row of claimed) {
    const user = userById.get(row.userId)
    if (!user?.email) {
      await prisma.aIRecommendationLog.update({
        where: { id: row.id },
        data: { status: 'failed', bouncedAt: new Date(), bounceType: 'no_email' },
      })
      failed += 1
      continue
    }

    if (isBlockedEmail(user.email)) {
      await prisma.aIRecommendationLog.update({
        where: { id: row.id },
        data: { status: 'failed', bouncedAt: new Date(), bounceType: 'blocked_domain' },
      })
      failed += 1
      continue
    }

    const content = resolveContentForLog(campaign, row.sequence_step)
    try {
      const { messageId } = await sendOutreachEmail({
        to: user.email,
        subject: content.subject ?? campaign.name,
        body: content.body ?? '',
        clubName,
        bookingUrl,
        templateValues: buildOutreachTemplateValues({
          fullName: user.name,
          clubName,
        }),
        ctaLabel: content.ctaLabel,
        ctaUrl: content.ctaUrl,
        metadata: {
          logId: row.id,
          clubId: campaign.clubId,
          userId: user.id,
        },
        tags: campaign.format === 'sequence'
          ? ['campaign', `campaign:${campaign.id}`, `step:${row.sequence_step ?? 0}`]
          : ['campaign', `campaign:${campaign.id}`],
      })

      await prisma.aIRecommendationLog.update({
        where: { id: row.id },
        data: { externalMessageId: messageId, status: 'sent' },
      })
      sent += 1
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 200)
      const newRetryCount = (row.retry_count ?? 0) + 1
      if (newRetryCount >= MAX_RETRIES) {
        await prisma.aIRecommendationLog.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            retryCount: newRetryCount,
            bouncedAt: new Date(),
            bounceType: 'retry_exhausted',
            reasoning: { lastError: message },
          },
        })
        failed += 1
      } else {
        await prisma.aIRecommendationLog.update({
          where: { id: row.id },
          data: { sentAt: null, retryCount: newRetryCount, status: 'pending' },
        })
        skipped += 1
      }

      log.warn?.(`[campaign-sends] send failed for log ${row.id}: ${message} (retry ${newRetryCount}/${MAX_RETRIES})`)
    }
  }

  if (sent > 0 || failed > 0) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sentCount: { increment: sent },
        failedCount: { increment: failed },
      },
    })
  }

  return { sent, failed, skipped }
}

async function maybeCompleteCampaign(prisma: any, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      sentCount: true,
      failedCount: true,
      cohortSnapshot: true,
      status: true,
    },
  })

  if (!campaign || campaign.status !== 'running') return false

  const totalRecipients = getCampaignSnapshotUserIds(campaign.cohortSnapshot).length
  if (totalRecipients === 0) return false

  const processed = (campaign.sentCount ?? 0) + (campaign.failedCount ?? 0)
  if (processed < totalRecipients) return false

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'completed', completedAt: new Date() },
  })
  return true
}

export async function runCampaignSendTick(prisma: any, opts?: CampaignSendRunnerOptions) {
  const startedAt = new Date()
  const now = opts?.now ?? new Date()
  const limit = Math.max(1, Math.min(opts?.limit ?? 200, 500))

  const campaigns = await prisma.campaign.findMany({
    where: opts?.campaignId
      ? { id: opts.campaignId }
      : {
          status: { in: ['running', 'scheduled'] },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
    orderBy: { createdAt: 'asc' },
    take: opts?.campaignId ? undefined : limit,
    select: {
      id: true,
      clubId: true,
      name: true,
      subject: true,
      body: true,
      cohortSnapshot: true,
      ctaLabel: true,
      ctaUrl: true,
      format: true,
      steps: true,
      exitOnBooking: true,
      cohortId: true,
      cronExpression: true,
      recurringTimezone: true,
      lastRecurringRun: true,
      channels: true,
      status: true,
      scheduledAt: true,
      launchedAt: true,
      club: { select: { id: true, automationSettings: true } },
    },
  })

  if (campaigns.length === 0) {
    return {
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      campaignsProcessed: 0,
      liveModeSkipped: 0,
      totalSent: 0,
      totalFailed: 0,
      totalRetried: 0,
      completed: 0,
      sequenceSeeded: 0,
      sequenceFannedOut: 0,
      sequenceExited: 0,
      recurringFannedOut: 0,
    }
  }

  let totalSent = 0
  let totalFailed = 0
  let totalSkipped = 0
  let totalCompleted = 0
  let totalSequenceSeeded = 0
  let totalSequenceFannedOut = 0
  let totalSequenceExited = 0
  let totalRecurringFanOut = 0
  const liveModeSkips: string[] = []

  for (const rawCampaign of campaigns as CampaignForRunner[]) {
    try {
      const campaign = await activateCampaignIfDue(prisma, rawCampaign, now)
      if (!campaign) continue

      const controlPlane = resolveAgentControlPlane(campaign.club.automationSettings)
      if (controlPlane.killSwitch || controlPlane.actions.outreachSend.mode !== 'live') {
        liveModeSkips.push(campaign.id)
        continue
      }

      const seeded = await ensureSequenceRootLogs(prisma, campaign)
      totalSequenceSeeded += seeded.created

      const recurringResult = await fanOutRecurring(prisma, campaign, now)
      totalRecurringFanOut += recurringResult.created

      const fanOut = await fanOutNextSteps(prisma, campaign, now)
      totalSequenceFannedOut += fanOut.created
      totalSequenceExited += fanOut.exited

      const result = await processCampaign(prisma, campaign)
      totalSent += result.sent
      totalFailed += result.failed
      totalSkipped += result.skipped

      if (campaign.format === 'one_time') {
        const completed = await maybeCompleteCampaign(prisma, campaign.id)
        if (completed) totalCompleted += 1
      }
    } catch (error: any) {
      log.error?.(`[campaign-sends] processCampaign failed for ${rawCampaign.id}: ${String(error?.message ?? error).slice(0, 200)}`)
    }
  }

  const result = {
    ok: true,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    campaignsProcessed: campaigns.length - liveModeSkips.length,
    liveModeSkipped: liveModeSkips.length,
    totalSent,
    totalFailed,
    totalRetried: totalSkipped,
    completed: totalCompleted,
    sequenceSeeded: totalSequenceSeeded,
    sequenceFannedOut: totalSequenceFannedOut,
    sequenceExited: totalSequenceExited,
    recurringFannedOut: totalRecurringFanOut,
  }

  log.info?.(
    {
      cron: 'campaign-sends',
      campaignsProcessed: result.campaignsProcessed,
      liveModeSkipped: result.liveModeSkipped,
      totalSent: result.totalSent,
      totalFailed: result.totalFailed,
      totalRetried: result.totalRetried,
      completed: result.completed,
      sequenceSeeded: result.sequenceSeeded,
      sequenceFannedOut: result.sequenceFannedOut,
      sequenceExited: result.sequenceExited,
      recurringFannedOut: result.recurringFannedOut,
      durationMs: result.durationMs,
    },
    'campaign-sends tick complete',
  )

  return result
}
