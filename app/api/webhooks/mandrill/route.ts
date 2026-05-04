/**
 * Mandrill (Mailchimp Transactional) Webhook Endpoint
 *
 * Receives POST events from Mandrill for email tracking:
 *   - send:         Message handed to receiving SMTP    → set deliveredAt + bump Campaign.deliveredCount
 *   - open:         Email opened (tracking pixel loaded) → set openedAt, status 'opened' + bump Campaign.openedCount
 *   - click:        Link clicked in email               → set clickedAt, status 'clicked' + bump Campaign.clickedCount
 *   - hard_bounce:  Hard bounce                         → set bouncedAt, bounceType 'hard', status 'bounced' + bump Campaign.failedCount
 *   - soft_bounce:  Soft bounce                         → set bouncedAt, bounceType 'soft', status 'bounced'
 *   - reject:       Message rejected by Mandrill        → set bouncedAt, bounceType 'reject', status 'bounced' + bump Campaign.failedCount
 *
 * Matching: Mandrill msg._id maps to AIRecommendationLog.externalMessageId
 * (or msg.metadata.log_id if set, which is the canonical correlator).
 *
 * Mandrill also sends HEAD requests to verify the webhook URL — we respond 200.
 *
 * P1.3: Campaign-level counter rollup.
 * When a log row has campaignId set (i.e. it's a CAMPAIGN_SEND row, not a
 * CHECK_IN/REACTIVATION/etc. one-off), we also bump the parent Campaign's
 * counter columns. Bumps are idempotent: we only increment when the
 * relevant timestamp on the log row was previously NULL, so duplicate
 * Mandrill webhooks (which Mandrill is allowed to send) don't double-count.
 *
 * Setup in Mandrill dashboard:
 *   Settings → Webhooks → Add webhook
 *   URL: https://your-domain.com/api/webhooks/mandrill
 *   Events: Message Is Sent, Message Is Opened, Message Is Clicked, Message Bounced, Message Rejected
 */

import { NextResponse } from 'next/server'
import { webhookLogger as wlog } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { verifyMandrillWebhook } from '@/lib/mailchimp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Types ──

interface MandrillEvent {
  event: 'open' | 'click' | 'hard_bounce' | 'soft_bounce' | 'reject' | string
  msg: {
    _id: string        // Mandrill message ID — matches our externalMessageId
    email: string
    subject?: string
    state?: string
    metadata?: {
      log_id?: string  // Our AIRecommendationLog.id (set when sending)
      [key: string]: string | undefined
    }
    bounce_description?: string
    diag?: string
  }
  ts: number           // Unix timestamp (seconds)
  url?: string         // For click events — the URL that was clicked
}

// ── HEAD — Mandrill verifies the URL exists before registering the webhook ──

export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}

// ── GET — Mandrill may also GET the URL during setup ──

export async function GET() {
  return new NextResponse('OK', { status: 200 })
}

// ── POST — Receive Mandrill events ──

export async function POST(request: Request) {
  try {
    // Mandrill sends form-encoded body with a `mandrill_events` field containing a JSON array
    const contentType = request.headers.get('content-type') || ''

    let events: MandrillEvent[]
    let rawParams: Record<string, string> = {}

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      const eventsJson = formData.get('mandrill_events') as string | null

      if (!eventsJson) {
        return NextResponse.json({ received: true, processed: 0 })
      }

      // Build params map for signature verification
      formData.forEach((value, key) => { rawParams[key] = String(value) })

      // Verify Mandrill signature (strict — rejects in production if key missing)
      const signature = request.headers.get('x-mandrill-signature') || ''
      const isValid = await verifyMandrillWebhook(signature, request.url, rawParams)
      if (!isValid) {
        wlog.error('[Mandrill Webhook] Invalid signature — rejecting')
        return new NextResponse('Invalid signature', { status: 403 })
      }

      events = JSON.parse(eventsJson)
    } else {
      // Fallback: accept JSON body (useful for local testing only — not from real Mandrill)
      if (process.env.NODE_ENV === 'production') {
        wlog.error('[Mandrill Webhook] Non-form POST rejected in production')
        return new NextResponse('Invalid content-type', { status: 400 })
      }
      const text = await request.text()
      if (!text) {
        return NextResponse.json({ received: true, processed: 0 })
      }
      events = JSON.parse(text)
    }

    if (!Array.isArray(events)) {
      return NextResponse.json({ received: true, processed: 0 })
    }

    let processed = 0

    for (const event of events) {
      try {
        await processMandrillEvent(event)
        processed++
      } catch (err) {
        wlog.error(
          '[Mandrill Webhook] Error processing event:',
          (err as Error).message?.slice(0, 120),
        )
      }
    }

    wlog.info(`[Mandrill Webhook] Processed ${processed}/${events.length} events`)
    return NextResponse.json({ received: true, processed })
  } catch (err) {
    wlog.error('[Mandrill Webhook] Fatal error:', (err as Error).message?.slice(0, 200))
    // Always return 200 — Mandrill retries on non-200 responses
    return NextResponse.json({ received: true, error: 'processing_error' })
  }
}

// ── Process a single Mandrill event ──

async function processMandrillEvent(event: MandrillEvent) {
  const externalId = event.msg._id
  const logId = event.msg.metadata?.log_id

  // We need at least one identifier
  if (!externalId && !logId) return

  // Find the log record — prefer log_id metadata, fall back to externalMessageId
  const log = logId
    ? await prisma.aIRecommendationLog.findFirst({ where: { id: logId } })
    : await prisma.aIRecommendationLog.findFirst({ where: { externalMessageId: externalId } })

  if (!log) {
    wlog.warn(
      `[Mandrill Webhook] Log not found — externalId=${externalId} logId=${logId}`,
    )
    return
  }

  const eventTime = new Date(event.ts * 1000)

  // Helper — bump a Campaign counter column iff the log belongs to a
  // campaign AND the relevant log timestamp was null pre-update (i.e.
  // this is the first webhook for this state, not a duplicate retry).
  // Mandrill is allowed to deliver webhooks more than once, so all
  // Campaign-level increments must be idempotent.
  const bumpCampaignCounter = async (
    field: 'deliveredCount' | 'openedCount' | 'clickedCount' | 'failedCount',
  ) => {
    if (!log.campaignId) return
    await prisma.campaign.update({
      where: { id: log.campaignId },
      select: { id: true },
      data: { [field]: { increment: 1 } },
    })
  }

  switch (event.event) {
    case 'send':
      // Mandrill 'send' = message handed to the receiving SMTP server.
      // It's the closest signal to "delivered" we get — true inbox
      // confirmation isn't possible over SMTP.
      if (log.deliveredAt == null) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: { deliveredAt: eventTime },
        })
        await bumpCampaignCounter('deliveredCount')
      }
      break

    case 'open':
      if (log.openedAt == null) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            openedAt: eventTime,
            // Only advance status if it's currently 'sent'
            status: log.status === 'sent' ? 'opened' : log.status,
          },
        })
        await bumpCampaignCounter('openedCount')
      }
      break

    case 'click':
      if (log.clickedAt == null) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: { clickedAt: eventTime, status: 'clicked' },
        })
        await bumpCampaignCounter('clickedCount')
      }
      break

    case 'hard_bounce':
      if (log.bouncedAt == null) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: { bouncedAt: eventTime, bounceType: 'hard', status: 'bounced' },
        })
        await bumpCampaignCounter('failedCount')
      }
      break

    case 'soft_bounce':
      // Soft bounces can recover — don't count toward failedCount yet.
      // (Cron's retry_count exhaustion path bumps failedCount when truly dead.)
      if (log.bouncedAt == null) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: { bouncedAt: eventTime, bounceType: 'soft', status: 'bounced' },
        })
      }
      break

    case 'reject':
      if (log.bouncedAt == null) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: { bouncedAt: eventTime, bounceType: 'reject', status: 'bounced' },
        })
        await bumpCampaignCounter('failedCount')
      }
      break

    default:
      // Ignore deferral, spam, unsub, and other event types
      break
  }
}
