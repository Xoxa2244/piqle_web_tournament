/**
 * Mandrill (Mailchimp Transactional) Webhook Endpoint
 *
 * Receives POST events from Mandrill for email tracking:
 *   - open:         Email opened (tracking pixel loaded) → set openedAt, status 'opened'
 *   - click:        Link clicked in email               → set clickedAt, status 'clicked'
 *   - hard_bounce:  Hard bounce                         → set bouncedAt, bounceType 'hard', status 'bounced'
 *   - soft_bounce:  Soft bounce                         → set bouncedAt, bounceType 'soft', status 'bounced'
 *   - reject:       Message rejected by Mandrill        → set bouncedAt, bounceType 'reject', status 'bounced'
 *
 * Matching: Mandrill msg._id maps to AIRecommendationLog.externalMessageId.
 *
 * Mandrill also sends HEAD requests to verify the webhook URL — we respond 200.
 *
 * Setup in Mandrill dashboard:
 *   Settings → Webhooks → Add webhook
 *   URL: https://your-domain.com/api/webhooks/mandrill
 *   Events: Message Is Opened, Message Is Clicked, Message Bounced, Message Rejected
 */

import { NextResponse } from 'next/server'
import { webhookLogger as wlog } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

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
    // Security: warn if no auth header present (full signature verification can be added later)
    const authHeader =
      request.headers.get('x-mandrill-signature') ||
      request.headers.get('authorization')
    if (!authHeader) {
      wlog.warn('[Mandrill Webhook] No auth header present — proceeding without verification')
    }

    // Mandrill sends form-encoded body with a `mandrill_events` field containing a JSON array
    const contentType = request.headers.get('content-type') || ''

    let events: MandrillEvent[]

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      const eventsJson = formData.get('mandrill_events') as string | null

      if (!eventsJson) {
        return NextResponse.json({ received: true, processed: 0 })
      }

      events = JSON.parse(eventsJson)
    } else {
      // Fallback: accept JSON body (useful for local testing)
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

  switch (event.event) {
    case 'open':
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          openedAt: log.openedAt ?? eventTime,
          // Only advance status if it's currently 'sent'
          status: log.status === 'sent' ? 'opened' : log.status,
        },
      })
      break

    case 'click':
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          clickedAt: log.clickedAt ?? eventTime,
          status: 'clicked',
        },
      })
      break

    case 'hard_bounce':
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          bouncedAt: eventTime,
          bounceType: 'hard',
          status: 'bounced',
        },
      })
      break

    case 'soft_bounce':
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          bouncedAt: eventTime,
          bounceType: 'soft',
          status: 'bounced',
        },
      })
      break

    case 'reject':
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          bouncedAt: eventTime,
          bounceType: 'reject',
          status: 'bounced',
        },
      })
      break

    default:
      // Ignore send, deferral, spam, unsub, and other event types
      break
  }
}
