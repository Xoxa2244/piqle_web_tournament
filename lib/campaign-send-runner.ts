import { buildOutreachTemplateValues, isBlockedEmail, sendOutreachEmail } from '@/lib/email'
import { resolveAgentControlPlane } from '@/lib/ai/agent-control-plane'
import { cronLogger as log } from '@/lib/logger'
import {
  parseRecurringCron,
  resolveSequenceDelay,
  shouldFireRecurringNow,
} from '@/lib/campaign-scheduling'

const MAX_BATCH = 50
const MAX_RETRIES = 3
const REPAIR_LIMIT = 200

interface CampaignSendRunnerOptions {
  campaignId?: string
  limit?: number
  now?: Date
  debug?: boolean
}

interface ClaimedRow {
  id: string
  userId: string
  retry_count: number
  sequence_step: number | null
  parent_log_id: string | null
  scheduled_for: Date | null
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

type PendingLogSeed = {
  userId: string
  sequenceStep: number | null
  parentLogId?: string | null
  scheduledFor: Date
  reasoning?: Record<string, unknown>
}

type CampaignTickSummary = {
  id: string
  format: string
  status: string
  skippedReason?: string
  seeded: number
  queued: number
  sent: number
  failed: number
  retried: number
  exited: number
  pendingDue?: number
  pendingFuture?: number
  nextScheduledFor?: string | null
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

function buildSequenceReasoning(
  campaign: CampaignForRunner,
  stepIndex: number,
  opts?: { scheduledFor?: Date; parentLogId?: string | null },
) {
  const steps = getCampaignSequenceSteps(campaign)
  const step = steps[stepIndex]
  const delay = step ? resolveSequenceDelay(step) : null
  return {
    campaignName: campaign.name,
    totalSteps: steps.length,
    sequenceStep: stepIndex,
    stepNumber: stepIndex + 1,
    ...(delay ? { delayAmount: delay.amount, delayUnit: delay.unit } : {}),
    ...(opts?.scheduledFor ? { scheduledFor: opts.scheduledFor.toISOString() } : {}),
    ...(opts?.parentLogId ? { parentLogId: opts.parentLogId } : {}),
  }
}

function addSequenceDelay(base: Date, step: SequenceStepData) {
  const delay = resolveSequenceDelay(step)
  const delayMs = delay.unit === 'minutes'
    ? delay.amount * 60 * 1000
    : delay.amount * 24 * 60 * 60 * 1000
  return new Date(base.getTime() + delayMs)
}

function getCampaignLaunchBase(campaign: CampaignForRunner, now: Date) {
  if (campaign.launchedAt) return campaign.launchedAt
  if (campaign.scheduledAt && campaign.scheduledAt.getTime() <= now.getTime()) return campaign.scheduledAt
  return now
}

async function createMissingCampaignLogs(
  prisma: any,
  campaign: CampaignForRunner,
  seeds: PendingLogSeed[],
) {
  if (seeds.length === 0) return { created: 0 }

  const existingLogs = await prisma.aIRecommendationLog.findMany({
    where: {
      campaignId: campaign.id,
      type: 'CAMPAIGN_SEND',
      OR: seeds.map((seed) => ({
        userId: seed.userId,
        sequenceStep: seed.sequenceStep,
      })),
    },
    select: { userId: true, sequenceStep: true },
  })

  const existingKeys = new Set(
    existingLogs.map((entry: { userId: string; sequenceStep: number | null }) => `${entry.userId}:${entry.sequenceStep ?? -1}`),
  )
  const missing = seeds.filter((seed) => !existingKeys.has(`${seed.userId}:${seed.sequenceStep ?? -1}`))
  if (missing.length === 0) return { created: 0 }

  await prisma.aIRecommendationLog.createMany({
    data: missing.map((seed) => ({
      clubId: campaign.clubId,
      userId: seed.userId,
      type: 'CAMPAIGN_SEND' as const,
      channel: getPrimaryChannel(campaign.channels),
      status: 'pending',
      campaignId: campaign.id,
      sequenceStep: seed.sequenceStep,
      parentLogId: seed.parentLogId ?? null,
      scheduledFor: seed.scheduledFor,
      reasoning: seed.reasoning ?? {
        campaignName: campaign.name,
      },
    })),
  })

  return { created: missing.length }
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

async function ensureSequenceRootLogs(prisma: any, campaign: CampaignForRunner, now: Date) {
  if (campaign.format !== 'sequence') return { created: 0 }

  const steps = getCampaignSequenceSteps(campaign)
  if (steps.length === 0) return { created: 0 }

  const userIds = getCampaignSnapshotUserIds(campaign.cohortSnapshot)
  if (userIds.length === 0) return { created: 0 }

  const scheduledFor = getCampaignLaunchBase(campaign, now)
  return createMissingCampaignLogs(
    prisma,
    campaign,
    userIds.map((userId) => ({
      userId,
      sequenceStep: 0,
      scheduledFor,
      reasoning: buildSequenceReasoning(campaign, 0, { scheduledFor }),
    })),
  )
}

async function ensureOneTimeLogs(prisma: any, campaign: CampaignForRunner, now: Date) {
  if (campaign.format !== 'one_time') return { created: 0 }

  const userIds = getCampaignSnapshotUserIds(campaign.cohortSnapshot)
  if (userIds.length === 0) return { created: 0 }

  return createMissingCampaignLogs(
    prisma,
    campaign,
    userIds.map((userId) => ({
      userId,
      sequenceStep: null,
      scheduledFor: getCampaignLaunchBase(campaign, now),
      reasoning: {
        campaignName: campaign.name,
      },
    })),
  )
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
      scheduledFor: now,
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

async function queueNextSequenceStep(
  prisma: any,
  campaign: CampaignForRunner,
  sentLog: { id: string; userId: string; sequenceStep: number | null },
  sentAt: Date,
) {
  if (campaign.format !== 'sequence' || typeof sentLog.sequenceStep !== 'number') return { created: 0 }

  const steps = getCampaignSequenceSteps(campaign)
  const nextStep = sentLog.sequenceStep + 1
  const nextStepData = steps[nextStep]
  if (!nextStepData) return { created: 0 }

  const scheduledFor = addSequenceDelay(sentAt, nextStepData)
  return createMissingCampaignLogs(prisma, campaign, [{
    userId: sentLog.userId,
    sequenceStep: nextStep,
    parentLogId: sentLog.id,
    scheduledFor,
    reasoning: buildSequenceReasoning(campaign, nextStep, {
      scheduledFor,
      parentLogId: sentLog.id,
    }),
  }])
}

async function repairSequenceQueue(prisma: any, campaign: CampaignForRunner) {
  if (campaign.format !== 'sequence') return { created: 0 }

  const steps = getCampaignSequenceSteps(campaign)
  if (steps.length <= 1) return { created: 0 }

  const sentLogs: SequenceLogSnapshot[] = await prisma.aIRecommendationLog.findMany({
    where: {
      campaignId: campaign.id,
      type: 'CAMPAIGN_SEND',
      sequenceStep: { not: null },
      status: { in: ['sent', 'delivered', 'opened', 'clicked', 'converted'] },
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
    orderBy: { createdAt: 'asc' },
    take: REPAIR_LIMIT,
  })

  const seeds: PendingLogSeed[] = []
  for (const logEntry of sentLogs) {
    if (typeof logEntry.sequenceStep !== 'number') continue
    if (toSnapshotRecord(logEntry.reasoning).sequenceExit) continue

    const nextStep = logEntry.sequenceStep + 1
    const nextStepData = steps[nextStep]
    if (!nextStepData) continue

    const baseSentAt = logEntry.sentAt ?? logEntry.createdAt
    const scheduledFor = addSequenceDelay(baseSentAt, nextStepData)
    seeds.push({
      userId: logEntry.userId,
      sequenceStep: nextStep,
      parentLogId: logEntry.id,
      scheduledFor,
      reasoning: buildSequenceReasoning(campaign, nextStep, {
        scheduledFor,
        parentLogId: logEntry.id,
      }),
    })
  }

  return createMissingCampaignLogs(prisma, campaign, seeds)
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

async function getParentSequenceLog(prisma: any, row: ClaimedRow) {
  if (!row.parent_log_id) return null

  return prisma.aIRecommendationLog.findUnique({
    where: { id: row.parent_log_id },
    select: {
      id: true,
      userId: true,
      status: true,
      sentAt: true,
      createdAt: true,
      reasoning: true,
    },
  })
}

async function shouldExitSequenceRow(prisma: any, campaign: CampaignForRunner, row: ClaimedRow) {
  if (campaign.format !== 'sequence' || !campaign.exitOnBooking || !row.parent_log_id) {
    return { exit: false as const }
  }

  const parentLog = await getParentSequenceLog(prisma, row)
  if (!parentLog) return { exit: false as const }

  const parentSentAt = parentLog.sentAt ?? parentLog.createdAt
  const booking = await prisma.playSessionBooking.findFirst({
    where: {
      userId: row.userId,
      bookedAt: { gte: parentSentAt },
      status: 'CONFIRMED',
    },
    select: { bookedAt: true },
    orderBy: { bookedAt: 'desc' },
  })

  if (!booking) return { exit: false as const }

  return {
    exit: true as const,
    bookedAt: booking.bookedAt as Date,
    parentLog,
  }
}

async function processCampaign(prisma: any, campaign: CampaignForRunner, now: Date): Promise<{ sent: number; failed: number; skipped: number; exited: number; queued: number }> {
  const claimed = await prisma.$queryRawUnsafe(
    `
    UPDATE ai_recommendation_logs
       SET sent_at = $3::timestamptz
     WHERE id IN (
        SELECT id FROM ai_recommendation_logs
         WHERE campaign_id::text = $1
           AND sent_at IS NULL
           AND type = 'CAMPAIGN_SEND'
           AND status = 'pending'
           AND (scheduled_for IS NULL OR scheduled_for <= $3::timestamptz)
         ORDER BY "createdAt" ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id, "userId", retry_count, sequence_step, parent_log_id, scheduled_for
    `,
    campaign.id,
    MAX_BATCH,
    now,
  ) as ClaimedRow[]

  if (claimed.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, exited: 0, queued: 0 }
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
  let exited = 0
  let queued = 0

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

    const exit = await shouldExitSequenceRow(prisma, campaign, row)
    if (exit.exit) {
      await prisma.aIRecommendationLog.update({
        where: { id: row.id },
        data: {
          sentAt: null,
          status: 'exited',
          reasoning: {
            ...buildSequenceReasoning(campaign, row.sequence_step ?? 0),
            sequenceExit: 'booked_session',
            exitedAt: exit.bookedAt.toISOString(),
          },
        },
      })
      exited += 1
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
      const queuedNext = await queueNextSequenceStep(prisma, campaign, {
        id: row.id,
        userId: row.userId,
        sequenceStep: row.sequence_step,
      }, now)
      queued += queuedNext.created
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

  return { sent, failed, skipped, exited, queued }
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

async function attachQueueDebug(
  prisma: any,
  summary: CampaignTickSummary,
  campaignId: string,
  now: Date,
) {
  const pendingWhere = {
    campaignId,
    type: 'CAMPAIGN_SEND',
    status: 'pending',
    sentAt: null,
  }

  const [pendingDue, pendingFuture, nextPending] = await Promise.all([
    prisma.aIRecommendationLog.count({
      where: {
        ...pendingWhere,
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
      },
    }),
    prisma.aIRecommendationLog.count({
      where: {
        ...pendingWhere,
        scheduledFor: { gt: now },
      },
    }),
    prisma.aIRecommendationLog.findFirst({
      where: pendingWhere,
      select: { scheduledFor: true },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  summary.pendingDue = pendingDue
  summary.pendingFuture = pendingFuture
  summary.nextScheduledFor = nextPending?.scheduledFor
    ? nextPending.scheduledFor.toISOString()
    : null
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
      sequenceQueued: 0,
      campaigns: [] as CampaignTickSummary[],
    }
  }

  let totalSent = 0
  let totalFailed = 0
  let totalSkipped = 0
  let totalCompleted = 0
  let totalSequenceSeeded = 0
  let totalSequenceQueued = 0
  let totalSequenceExited = 0
  let totalRecurringFanOut = 0
  const liveModeSkips: string[] = []
  const campaignSummaries: CampaignTickSummary[] = []

  for (const rawCampaign of campaigns as CampaignForRunner[]) {
    const summary: CampaignTickSummary = {
      id: rawCampaign.id,
      format: rawCampaign.format,
      status: rawCampaign.status,
      seeded: 0,
      queued: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      exited: 0,
    }

    try {
      if (!['running', 'scheduled'].includes(rawCampaign.status)) {
        summary.skippedReason = `status_${rawCampaign.status}`
        campaignSummaries.push(summary)
        continue
      }

      const campaign = await activateCampaignIfDue(prisma, rawCampaign, now)
      if (!campaign) {
        summary.skippedReason = 'scheduled_in_future'
        campaignSummaries.push(summary)
        continue
      }
      summary.status = campaign.status

      const controlPlane = resolveAgentControlPlane(campaign.club.automationSettings)
      if (controlPlane.killSwitch || controlPlane.actions.outreachSend.mode !== 'live') {
        liveModeSkips.push(campaign.id)
        summary.skippedReason = controlPlane.killSwitch ? 'kill_switch' : `outreach_${controlPlane.actions.outreachSend.mode}`
        campaignSummaries.push(summary)
        continue
      }

      await ensureOneTimeLogs(prisma, campaign, now)
      const sequenceSeeded = await ensureSequenceRootLogs(prisma, campaign, now)
      totalSequenceSeeded += sequenceSeeded.created
      summary.seeded += sequenceSeeded.created

      const recurringResult = await fanOutRecurring(prisma, campaign, now)
      totalRecurringFanOut += recurringResult.created
      summary.queued += recurringResult.created

      const repaired = await repairSequenceQueue(prisma, campaign)
      totalSequenceQueued += repaired.created
      summary.queued += repaired.created

      const result = await processCampaign(prisma, campaign, now)
      totalSent += result.sent
      totalFailed += result.failed
      totalSkipped += result.skipped
      totalSequenceExited += result.exited
      totalSequenceQueued += result.queued
      summary.sent += result.sent
      summary.failed += result.failed
      summary.retried += result.skipped
      summary.exited += result.exited
      summary.queued += result.queued

      if (campaign.format === 'one_time') {
        const completed = await maybeCompleteCampaign(prisma, campaign.id)
        if (completed) totalCompleted += 1
      }
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 200)
      summary.skippedReason = `error:${message}`
      log.error?.(`[campaign-sends] processCampaign failed for ${rawCampaign.id}: ${message}`)
    } finally {
      if (opts?.debug) {
        await attachQueueDebug(prisma, summary, rawCampaign.id, now).catch((error: any) => {
          summary.skippedReason = summary.skippedReason ?? `debug_error:${String(error?.message ?? error).slice(0, 120)}`
        })
      }
      if (!campaignSummaries.includes(summary)) {
        campaignSummaries.push(summary)
      }
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
    sequenceFannedOut: totalSequenceQueued,
    sequenceQueued: totalSequenceQueued,
    sequenceExited: totalSequenceExited,
    recurringFannedOut: totalRecurringFanOut,
    campaigns: campaignSummaries,
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
      sequenceQueued: result.sequenceQueued,
      sequenceFannedOut: result.sequenceFannedOut,
      sequenceExited: result.sequenceExited,
      recurringFannedOut: result.recurringFannedOut,
      durationMs: result.durationMs,
    },
    'campaign-sends tick complete',
  )

  return result
}
