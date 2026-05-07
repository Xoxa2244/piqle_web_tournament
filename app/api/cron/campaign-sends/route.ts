/**
 * Engage P1.2 — campaign send queue cron.
 *
 * Per-tick logic:
 *  1. SELECT campaigns where status='running' AND (scheduledAt IS NULL OR <= now)
 *  2. For each campaign:
 *     a. Resolve Live Mode via resolveAgentControlPlane(club.automationSettings).
 *        Skip campaign if outreachSend.mode !== 'live' OR killSwitch=true.
 *        (Defense-in-depth — UI also blocks Launch when not live.)
 *     b. Atomically claim a batch of MAX_BATCH pending recipient logs
 *        (sent_at IS NULL, type='CAMPAIGN_SEND', this campaignId) via
 *        FOR UPDATE SKIP LOCKED, set sent_at=NOW() optimistically.
 *     c. For each claimed log:
 *        - Resolve user.email
 *        - Render subject/body with campaign template substitution
 *        - Call sendOutreachEmail with metadata.logId for webhook correlation
 *        - On success: increment Campaign.sent_count
 *        - On failure: revert sent_at to NULL, increment retry_count.
 *          If retry_count exceeds MAX_RETRIES OR error is permanent
 *          (blocked domain), set bouncedAt + bounceType, increment
 *          Campaign.failed_count.
 *  3. After processing batch: if (sent_count + failed_count >= total recipients)
 *     set Campaign.status='completed', completedAt=now.
 *
 * Idempotency: the FOR UPDATE SKIP LOCKED claim guarantees no two
 * concurrent ticks send the same recipient. If a tick crashes mid-loop
 * after claiming but before sending, the claimed rows show sent_at
 * but no Mandrill ack — we accept this as a known edge case for v1.
 * A "stuck claim recovery" sweep (sent_at < NOW - 5min AND no
 * external_message_id) is left for P1.3 follow-up if needed.
 *
 * See docs/ENGAGE_PRIORITY1_SPEC.md §2 P1.2.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { buildOutreachTemplateValues, sendOutreachEmail, isBlockedEmail } from '@/lib/email'
import { resolveAgentControlPlane } from '@/lib/ai/agent-control-plane'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_BATCH = 50
const MAX_RETRIES = 3

function getAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) {
    return { ok: true as const }
  }
  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

interface ClaimedRow {
  id: string
  userId: string
  retry_count: number
  sequence_step: number | null
}

interface SequenceStepData {
  stepIndex: number
  delayDays: number
  subject: string
  body: string
  ctaLabel?: string | null
  ctaUrl?: string | null
}

interface CampaignForCron {
  id: string
  clubId: string
  name: string
  subject: string | null
  body: string | null
  cohortSnapshot: any
  ctaLabel: string | null
  ctaUrl: string | null
  format: string
  steps: any
  exitOnBooking: boolean
  cohortId: string | null
  cronExpression: string | null
  recurringTimezone: string | null
  lastRecurringRun: Date | null
  channels: string[]
}

function getSequenceSteps(campaign: CampaignForCron): SequenceStepData[] {
  if (Array.isArray(campaign.steps)) {
    return campaign.steps as SequenceStepData[]
  }

  const snapshot = campaign.cohortSnapshot && typeof campaign.cohortSnapshot === 'object' && !Array.isArray(campaign.cohortSnapshot)
    ? campaign.cohortSnapshot as Record<string, unknown>
    : {}

  return Array.isArray(snapshot.steps)
    ? snapshot.steps as SequenceStepData[]
    : []
}

// ── Recurring runner — minimal in-tree cron matcher ────────────────────────
// Supports the small set of patterns the Wizard generates:
//   "0 H * * *"  — daily at H:00 (in tz)
//   "0 H * * D"  — weekly at H:00 on day-of-week D (0=Sun .. 6=Sat)
//   "0 H D * *"  — monthly at H:00 on day-of-month D (1..31)
// Custom cron text input is a v2 feature — we'll wire `cron-parser` then.

interface SimpleCron {
  hour: number
  dayOfWeek: number | null
  dayOfMonth: number | null
}

function parseSimpleCron(expr: string): SimpleCron | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [m, h, dom, mon, dow] = parts
  if (m !== '0') return null
  const hour = parseInt(h, 10)
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null
  // Daily
  if (dom === '*' && mon === '*' && dow === '*') {
    return { hour, dayOfWeek: null, dayOfMonth: null }
  }
  // Weekly: dow set, dom + mon stars
  if (dow !== '*' && dom === '*' && mon === '*') {
    const dayOfWeek = parseInt(dow, 10)
    if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null
    return { hour, dayOfWeek, dayOfMonth: null }
  }
  // Monthly: dom set, dow + mon stars
  if (dom !== '*' && dow === '*' && mon === '*') {
    const dayOfMonth = parseInt(dom, 10)
    if (Number.isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return null
    return { hour, dayOfWeek: null, dayOfMonth }
  }
  return null
}

/** Returns true if the campaign's cron expression matches "now" in the
 *  campaign's timezone AND we haven't run within the last 22 hours.
 *  22h is a coarse but effective de-dup that survives DST jumps. */
function shouldFireRecurringNow(
  cron: SimpleCron,
  tz: string,
  now: Date,
  lastRun: Date | null,
): boolean {
  // Extract current local hour / weekday / day-of-month in `tz`.
  let hour = -1
  let weekdayShort = ''
  let day = -1
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      hour: 'numeric',
      weekday: 'short',
      day: 'numeric',
    })
    for (const p of fmt.formatToParts(now)) {
      if (p.type === 'hour') hour = parseInt(p.value, 10)
      else if (p.type === 'weekday') weekdayShort = p.value
      else if (p.type === 'day') day = parseInt(p.value, 10)
    }
  } catch {
    // Bad timezone string — fall back to UTC parts
    hour = now.getUTCHours()
    day = now.getUTCDate()
    weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getUTCDay()]
  }
  if (hour === 24) hour = 0

  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dayOfWeek = dowMap[weekdayShort] ?? -1

  // Day match
  if (cron.dayOfMonth !== null && cron.dayOfMonth !== day) return false
  if (cron.dayOfWeek !== null && cron.dayOfWeek !== dayOfWeek) return false

  // Hour reached (allow firing any time at-or-after the scheduled hour
  // until the next day, to be resilient to skipped cron ticks).
  if (hour < cron.hour) return false

  // De-dup: if we already ran within the last ~day, skip.
  if (lastRun) {
    const hoursAgo = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)
    if (hoursAgo < 22) return false
  }

  return true
}

/** Recurring fan-out: re-evaluate the cohort and create fresh recipient
 *  logs for this tick. Updates Campaign.lastRecurringRun on success
 *  (and on no-recipients) so we don't re-check every minute.
 *  Returns the number of logs created. */
async function fanOutRecurring(campaign: CampaignForCron): Promise<{ created: number }> {
  if (campaign.format !== 'recurring') return { created: 0 }
  if (!campaign.cronExpression) return { created: 0 }
  const cron = parseSimpleCron(campaign.cronExpression)
  if (!cron) return { created: 0 }
  const tz = campaign.recurringTimezone || 'UTC'
  const now = new Date()
  if (!shouldFireRecurringNow(cron, tz, now, campaign.lastRecurringRun)) {
    return { created: 0 }
  }

  // Re-evaluate the cohort. Recurring requires a cohortId (validated at
  // launch); guard defensively in case of orphaned data.
  if (!campaign.cohortId) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { lastRecurringRun: now } })
    return { created: 0 }
  }
  const cohort = await prisma.clubCohort.findUnique({ where: { id: campaign.cohortId } })
  if (!cohort || cohort.clubId !== campaign.clubId) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { lastRecurringRun: now } })
    return { created: 0 }
  }
  const filters = (cohort.filters as any) || []
  const { resolveCohortMembersForCron } = await import('@/server/routers/intelligence')
  const rows = await resolveCohortMembersForCron(prisma, campaign.clubId, filters, 2000)
  const userIds = rows.map((r) => r.id).filter((id): id is string => typeof id === 'string')

  if (userIds.length === 0) {
    // No recipients this tick — still bump lastRecurringRun so we don't
    // re-check every minute for the rest of the day.
    await prisma.campaign.update({ where: { id: campaign.id }, data: { lastRecurringRun: now } })
    return { created: 0 }
  }

  const primaryChannel = campaign.channels.includes('email') ? 'email' : 'sms'
  await prisma.aIRecommendationLog.createMany({
    data: userIds.map((userId) => ({
      clubId: campaign.clubId,
      userId,
      type: 'CAMPAIGN_SEND' as const,
      channel: primaryChannel,
      status: 'pending',
      campaignId: campaign.id,
      reasoning: {
        campaignName: campaign.name,
        recurringTickAt: now.toISOString(),
      },
    })),
    skipDuplicates: true,
  })

  await prisma.campaign.update({ where: { id: campaign.id }, data: { lastRecurringRun: now } })

  return { created: userIds.length }
}

/** Resolves the per-step content to render for a given log row.
 *  For one_time campaigns: returns campaign-level subject/body/cta.
 *  For sequence campaigns: pulls from `campaign.steps[log.sequenceStep]`. */
function resolveContentForLog(
  campaign: CampaignForCron,
  sequenceStep: number | null,
): { subject: string | null; body: string | null; ctaLabel: string | null; ctaUrl: string | null } {
  if (campaign.format === 'sequence') {
    const steps = getSequenceSteps(campaign)
    const idx = sequenceStep ?? 0
    const step = steps[idx]
    if (!step) {
      // Defensive — shouldn't happen, but fall back to top-level so we
      // don't lose the recipient if a steps[] mutation went wrong.
      return {
        subject: campaign.subject,
        body: campaign.body,
        ctaLabel: campaign.ctaLabel,
        ctaUrl: campaign.ctaUrl,
      }
    }
    return {
      subject: step.subject,
      body: step.body,
      ctaLabel: step.ctaLabel ?? null,
      ctaUrl: step.ctaUrl ?? null,
    }
  }
  return {
    subject: campaign.subject,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    ctaUrl: campaign.ctaUrl,
  }
}

/**
 * Sequence fan-out: for each Step N log that's been sent and whose
 * delayDays for Step N+1 have elapsed, create a Step N+1 log if one
 * doesn't already exist. exit_on_booking: skip recipients who booked
 * a session since their previous step was sent.
 *
 * Runs once per campaign per tick before the send claim/dispatch
 * pass. Bounded to FAN_OUT_LIMIT candidates per campaign per tick to
 * keep the cron predictable on large sequences.
 */
const FAN_OUT_LIMIT = 200

async function fanOutNextSteps(campaign: CampaignForCron): Promise<{ created: number; exited: number }> {
  if (campaign.format !== 'sequence') return { created: 0, exited: 0 }
  const steps = getSequenceSteps(campaign)
  if (steps.length <= 1) return { created: 0, exited: 0 }

  // For each non-final source step N, find logs at sequence_step=N whose
  // delay to step N+1 has elapsed and have no follow-up log yet.
  // Bounded loop — at most steps.length-1 queries per campaign per tick.
  const candidates: Array<{
    logId: string
    userId: string
    sequenceStep: number
    sentAt: Date
  }> = []

  for (let n = 0; n < steps.length - 1; n++) {
    const delayDays = steps[n + 1].delayDays | 0
    const rows = await prisma.$queryRaw<Array<{
      logId: string
      userId: string
      sequenceStep: number
      sentAt: Date
    }>>`
      SELECT
        log.id            AS "logId",
        log."userId"      AS "userId",
        log.sequence_step AS "sequenceStep",
        log.sent_at       AS "sentAt"
      FROM ai_recommendation_logs log
      WHERE log.campaign_id = ${campaign.id}::uuid
        AND log.type = 'CAMPAIGN_SEND'
        AND log.sent_at IS NOT NULL
        AND log.status IN ('sent', 'delivered', 'opened', 'clicked', 'converted')
        AND log.sequence_step = ${n}
        AND log.sent_at <= NOW() - (${delayDays} * INTERVAL '1 day')
        AND NOT EXISTS (
          SELECT 1 FROM ai_recommendation_logs nl
          WHERE nl.campaign_id = log.campaign_id
            AND nl."userId" = log."userId"
            AND nl.sequence_step = ${n + 1}
        )
      ORDER BY log.sent_at ASC
      LIMIT ${FAN_OUT_LIMIT}
    `
    candidates.push(...rows)
  }

  if (candidates.length === 0) return { created: 0, exited: 0 }

  // exit_on_booking: bulk-fetch booking activity since each candidate's
  // sent_at. Doing one big query per (userId, since) pair is awkward in
  // SQL, so we batch by min(sent_at) — gives a few false positives that
  // we filter in JS. Acceptable: a positive book is still a real signal
  // even if it happened slightly before the prior step's exact send time.
  let exited = 0
  let toCreate = candidates
  if (campaign.exitOnBooking) {
    const userIds = Array.from(new Set(candidates.map((c) => c.userId)))
    const minSentAt = candidates.reduce<Date>((min, c) => (c.sentAt < min ? c.sentAt : min), candidates[0].sentAt)

    const bookings = await prisma.$queryRaw<Array<{ userId: string; bookedAt: Date }>>`
      SELECT b."userId" AS "userId", b."bookedAt" AS "bookedAt"
      FROM play_session_bookings b
      WHERE b."userId" = ANY(${userIds})
        AND b."bookedAt" >= ${minSentAt}
        AND b.status = 'CONFIRMED'
    `

    // Build per-user latest booking time
    const latestBookingByUser = new Map<string, Date>()
    for (const b of bookings) {
      const cur = latestBookingByUser.get(b.userId)
      if (!cur || b.bookedAt > cur) latestBookingByUser.set(b.userId, b.bookedAt)
    }

    toCreate = candidates.filter((c) => {
      const last = latestBookingByUser.get(c.userId)
      if (last && last >= c.sentAt) {
        exited++
        return false
      }
      return true
    })
  }

  if (toCreate.length === 0) return { created: 0, exited }

  // Create the next-step logs. We tag each with parent_log_id pointing
  // to the previous step's log so analytics can walk the chain.
  // primary channel: best-effort match the launchCampaign convention
  // (email if 'email' is in campaign.channels, else sms).
  // We don't know channels here without re-fetching; default to 'email'
  // which is what the Wizard ships today.
  await prisma.aIRecommendationLog.createMany({
    data: toCreate.map((c) => ({
      clubId: campaign.clubId,
      userId: c.userId,
      type: 'CAMPAIGN_SEND' as const,
      channel: 'email',
      status: 'pending',
      campaignId: campaign.id,
      sequenceStep: c.sequenceStep + 1,
      parentLogId: c.logId,
      reasoning: {
        campaignName: campaign.name,
        totalSteps: steps.length,
        sequenceStep: c.sequenceStep + 1,
        stepNumber: c.sequenceStep + 2,
      },
    })),
    skipDuplicates: true,
  })

  return { created: toCreate.length, exited }
}

async function processCampaign(campaign: CampaignForCron): Promise<{ sent: number; failed: number; skipped: number }> {
  // Atomically claim up to MAX_BATCH pending logs for this campaign.
  // FOR UPDATE SKIP LOCKED prevents two concurrent ticks from racing
  // on the same row; sent_at=NOW() is the optimistic claim marker.
  const claimed = await prisma.$queryRawUnsafe<ClaimedRow[]>(
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
  )

  if (claimed.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  // Hydrate user emails in one query.
  const users = await prisma.user.findMany({
    where: { id: { in: claimed.map((r) => r.userId) } },
    select: { id: true, email: true, name: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  // Club name for the email footer ("Sent by …").
  const club = await prisma.club.findUnique({
    where: { id: campaign.clubId },
    select: { name: true },
  })
  const clubName = club?.name ?? 'Your Club'

  // Booking URL — for P1.2 we point at the club's intelligence dashboard.
  // Future: campaign-specific landing page with deep-link tracking.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  const bookingUrl = `${baseUrl}/clubs/${campaign.clubId}`

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const row of claimed) {
    const user = userById.get(row.userId)
    if (!user?.email) {
      // No email — drop straight to failed_count, do not retry.
      await prisma.aIRecommendationLog.update({
        where: { id: row.id },
        data: { status: 'failed', bouncedAt: new Date(), bounceType: 'no_email' },
      })
      failed++
      continue
    }

    // For sequence campaigns, pick the right step's content based on the
    // log's sequence_step. For one_time, this returns campaign-level fields.
    const content = resolveContentForLog(campaign, row.sequence_step)

    const templateValues = buildOutreachTemplateValues({
      fullName: user.name,
      clubName,
    })
    const stepCtaLabel = content.ctaLabel
    const stepCtaUrl = content.ctaUrl

    // Pre-flight blocked-domain check — counts as failed_count, NOT silent.
    if (isBlockedEmail(user.email)) {
      await prisma.aIRecommendationLog.update({
        where: { id: row.id },
        data: { status: 'failed', bouncedAt: new Date(), bounceType: 'blocked_domain' },
      })
      failed++
      continue
    }

    try {
      const { messageId } = await sendOutreachEmail({
        to: user.email,
        subject: content.subject ?? campaign.name,
        body: content.body ?? '',
        clubName,
        bookingUrl,
        templateValues,
        ctaLabel: stepCtaLabel,
        ctaUrl: stepCtaUrl,
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
      sent++
    } catch (err: any) {
      const message = String(err?.message ?? err).slice(0, 200)
      const newRetryCount = (row.retry_count ?? 0) + 1
      const exhausted = newRetryCount >= MAX_RETRIES

    if (exhausted) {
      // Give up — count as failed, won't be re-claimed.
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
      failed++
      } else {
        // Revert sent_at so the row re-enters the queue on the next tick.
        await prisma.aIRecommendationLog.update({
          where: { id: row.id },
          data: { sentAt: null, retryCount: newRetryCount, status: 'pending' },
        })
        skipped++
      }
      log.warn?.(`[campaign-sends] send failed for log ${row.id}: ${message} (retry ${newRetryCount}/${MAX_RETRIES})`)
    }
  }

  // Bump campaign-level counters in one query.
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

async function maybeCompleteCampaign(campaignId: string): Promise<boolean> {
  // Read fresh counters + total recipients to decide if we're done.
  const c = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { sentCount: true, failedCount: true, cohortSnapshot: true, status: true },
  })
  if (!c || c.status !== 'running') return false
  const snapshot = (c.cohortSnapshot as any) || {}
  const totalRecipients = Array.isArray(snapshot.userIds) ? snapshot.userIds.length : 0
  if (totalRecipients === 0) return false
  const processed = (c.sentCount ?? 0) + (c.failedCount ?? 0)
  if (processed >= totalRecipients) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed', completedAt: new Date() },
    })
    return true
  }
  return false
}

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()

  try {
    const now = new Date()
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: 'running',
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      select: {
        id: true, clubId: true, name: true, subject: true, body: true,
        cohortSnapshot: true,
        ctaLabel: true, ctaUrl: true,
        format: true, steps: true, exitOnBooking: true,
        cohortId: true,
        cronExpression: true, recurringTimezone: true, lastRecurringRun: true,
        channels: true,
        club: { select: { id: true, automationSettings: true } },
      },
    })

    if (campaigns.length === 0) {
      return NextResponse.json({
        ok: true,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        campaignsProcessed: 0,
      })
    }

    let totalSent = 0
    let totalFailed = 0
    let totalSkipped = 0
    let totalCompleted = 0
    let totalFannedOut = 0
    let totalExited = 0
    let totalRecurringFanOut = 0
    const liveModeSkips: string[] = []

    for (const campaign of campaigns) {
      // P1.4: Live Mode gate at cron layer. Resolves the same control-plane
      // settings the UI surfaces in Settings → Automation. Skip the
      // campaign for this tick (do not mark as failed; admin may flip
      // mode back to 'live' later).
      const controlPlane = resolveAgentControlPlane(campaign.club.automationSettings)
      if (controlPlane.killSwitch || controlPlane.actions.outreachSend.mode !== 'live') {
        liveModeSkips.push(campaign.id)
        continue
      }

      try {
        // R4: Recurring fan-out — re-evaluate cohort and create fresh
        // recipient logs if the cron expression matches now. No-op for
        // one_time / sequence.
        const recurringResult = await fanOutRecurring(campaign as CampaignForCron)
        totalRecurringFanOut += recurringResult.created

        // S4: Sequence fan-out — for sequence campaigns, create logs for
        // recipients whose previous step delay has elapsed. No-op for
        // one_time / recurring.
        const fanOut = await fanOutNextSteps(campaign as CampaignForCron)
        totalFannedOut += fanOut.created
        totalExited += fanOut.exited

        const result = await processCampaign(campaign as CampaignForCron)
        totalSent += result.sent
        totalFailed += result.failed
        totalSkipped += result.skipped

        // Auto-complete is meaningful only for one_time. Sequence keeps
        // running until admin marks complete (or a future sweeper does);
        // recurring is open-ended by definition.
        if (campaign.format === 'one_time') {
          const completed = await maybeCompleteCampaign(campaign.id)
          if (completed) totalCompleted++
        }
      } catch (err: any) {
        log.error?.(`[campaign-sends] processCampaign failed for ${campaign.id}: ${String(err?.message ?? err).slice(0, 200)}`)
      }
    }

    log.info?.(
      {
        cron: 'campaign-sends',
        campaignsProcessed: campaigns.length - liveModeSkips.length,
        liveModeSkipped: liveModeSkips.length,
        totalSent,
        totalFailed,
        totalRetried: totalSkipped,
        completed: totalCompleted,
        sequenceFannedOut: totalFannedOut,
        sequenceExited: totalExited,
        recurringFannedOut: totalRecurringFanOut,
        durationMs: Date.now() - startedAt.getTime(),
      },
      'campaign-sends tick complete',
    )

    return NextResponse.json({
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
      sequenceFannedOut: totalFannedOut,
      sequenceExited: totalExited,
      recurringFannedOut: totalRecurringFanOut,
    })
  } catch (error: any) {
    log.error?.(`[Cron campaign-sends] Failed: ${String(error?.message ?? error).slice(0, 200)}`)
    return NextResponse.json(
      { error: 'campaign-sends failed', message: String(error?.message ?? error).slice(0, 200) },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return run(request)
}

export async function GET(request: Request) {
  return run(request)
}
