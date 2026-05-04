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
 *        - Render subject/body with {{name}} substitution
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
import { sendOutreachEmail, isBlockedEmail } from '@/lib/email'
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
}

async function processCampaign(campaign: {
  id: string
  clubId: string
  name: string
  subject: string | null
  body: string | null
  cohortSnapshot: any
  ctaLabel: string | null
  ctaUrl: string | null
}): Promise<{ sent: number; failed: number; skipped: number }> {
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
        ORDER BY "createdAt" ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id, "userId", retry_count
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
        data: { bouncedAt: new Date(), bounceType: 'no_email' },
      })
      failed++
      continue
    }

    // Substitute {{name}} placeholder. More substitutions can land later.
    const firstName = (user.name ?? '').trim().split(/\s+/)[0] || 'there'
    const subject = (campaign.subject ?? campaign.name).replace(/\{\{\s*name\s*\}\}/gi, firstName)
    const body = (campaign.body ?? '').replace(/\{\{\s*name\s*\}\}/gi, firstName)

    // Pre-flight blocked-domain check — counts as failed_count, NOT silent.
    if (isBlockedEmail(user.email)) {
      await prisma.aIRecommendationLog.update({
        where: { id: row.id },
        data: { bouncedAt: new Date(), bounceType: 'blocked_domain' },
      })
      failed++
      continue
    }

    try {
      const { messageId } = await sendOutreachEmail({
        to: user.email,
        subject,
        body,
        clubName,
        bookingUrl,
        ctaLabel: campaign.ctaLabel,
        ctaUrl: campaign.ctaUrl,
        metadata: {
          logId: row.id,
          clubId: campaign.clubId,
          userId: user.id,
        },
        tags: ['campaign', `campaign:${campaign.id}`],
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
          data: { sentAt: null, retryCount: newRetryCount },
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
        const result = await processCampaign(campaign)
        totalSent += result.sent
        totalFailed += result.failed
        totalSkipped += result.skipped

        const completed = await maybeCompleteCampaign(campaign.id)
        if (completed) totalCompleted++
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
