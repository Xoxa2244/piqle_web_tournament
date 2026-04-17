/**
 * Mailchimp Transactional (Mandrill) Webhook Endpoint
 *
 * Receives POST events from Mandrill for email tracking:
 *   - open:    Email opened (tracking pixel loaded)
 *   - click:   Link clicked in email
 *   - hard_bounce / soft_bounce: Email bounced
 *   - reject:  Email rejected by Mandrill
 *
 * Each event contains metadata.log_id which maps to AIRecommendationLog.id,
 * allowing us to update tracking fields (openedAt, clickedAt, bouncedAt).
 *
 * Mandrill also sends HEAD requests to verify the webhook URL — we respond 200.
 *
 * Setup in Mandrill dashboard:
 *   Settings → Webhooks → Add webhook
 *   URL: https://your-domain.com/api/webhooks/mailchimp
 *   Events: Message Is Opened, Message Is Clicked, Message Is Bounced
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyMandrillWebhook } from '@/lib/mailchimp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mandrill sends HEAD to verify webhook URL
export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}

// Mandrill sends GET to verify webhook URL during setup
export async function GET() {
  return new NextResponse('OK', { status: 200 })
}

// ── Mandrill Event Types ──

interface MandrillEvent {
  event: 'open' | 'click' | 'hard_bounce' | 'soft_bounce' | 'reject' | 'spam' | 'unsub' | 'send' | 'deferral'
  msg: {
    _id: string           // Mandrill message ID (= our externalMessageId)
    email: string
    subject: string
    state: string
    metadata?: {
      log_id?: string     // Our AIRecommendationLog.id
      club_id?: string
      user_id?: string
      variant_id?: string
    }
    bounce_description?: string
    diag?: string
  }
  ts: number              // Unix timestamp
  url?: string            // For click events — which URL was clicked
}

export async function POST(request: Request) {
  try {
    // Mandrill sends form-encoded data with mandrill_events field
    const contentType = request.headers.get('content-type') || ''

    let events: MandrillEvent[]

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      const eventsJson = formData.get('mandrill_events') as string

      // Verify webhook signature
      const signature = request.headers.get('x-mandrill-signature') || ''
      const url = request.url
      const params: Record<string, string> = {}
      formData.forEach((value, key) => { params[key] = String(value) })

      const isValid = await verifyMandrillWebhook(signature, url, params)
      if (!isValid) {
        console.error('[Mandrill Webhook] Invalid signature')
        return new NextResponse('Invalid signature', { status: 403 })
      }

      if (!eventsJson) {
        return NextResponse.json({ received: true, processed: 0 })
      }

      events = JSON.parse(eventsJson)
    } else {
      // Fallback: JSON body (for testing)
      events = await request.json()
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
        console.error(`[Mandrill Webhook] Error processing event:`, (err as Error).message?.slice(0, 120))
      }
    }

    return NextResponse.json({ received: true, processed })
  } catch (err) {
    console.error('[Mandrill Webhook] Error:', (err as Error).message?.slice(0, 200))
    // Always return 200 to prevent Mandrill from retrying
    return NextResponse.json({ received: true, error: 'processing error' })
  }
}

// ── Process Individual Events ──

async function processMandrillEvent(event: MandrillEvent) {
  const logId = event.msg.metadata?.log_id
  const externalId = event.msg._id

  // We need at least one identifier to find the log record
  if (!logId && !externalId) return

  // Try logId first (most reliable — we control it), fall back to externalMessageId.
  // This handles the case where logId metadata was not set during send (legacy emails)
  // or was set but doesn't match (stale/recycled ID).
  let log = logId
    ? await prisma.aIRecommendationLog.findUnique({ where: { id: logId } })
    : null

  if (!log && externalId) {
    log = await prisma.aIRecommendationLog.findFirst({
      where: { externalMessageId: externalId },
    })
  }

  if (!log) {
    console.warn(`[Mandrill Webhook] Log not found: logId=${logId} externalId=${externalId}`)
    return
  }

  const eventTime = new Date(event.ts * 1000)

  switch (event.event) {
    case 'open':
      // Only record first open
      if (!log.openedAt) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: { openedAt: eventTime },
        })
      }
      break

    case 'click':
      // Only record first click
      if (!log.clickedAt) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            clickedAt: eventTime,
            // If clicked, mark as responded (user engaged)
            respondedAt: log.respondedAt || eventTime,
          },
        })
      }
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
          // Don't change status for soft bounces — may retry
        },
      })
      break

    case 'reject':
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          bouncedAt: eventTime,
          bounceType: 'rejected',
          status: 'failed',
        },
      })
      break

    case 'spam':
    case 'unsub':
      // User marked as spam or unsubscribed — record and respect
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          bouncedAt: eventTime,
          bounceType: event.event, // 'spam' or 'unsub'
          status: event.event === 'unsub' ? 'unsubscribed' : 'spam',
        },
      })
      // Also set notificationsOptOut so campaign engine skips this user
      if (log.userId && log.clubId) {
        await prisma.userPlayPreference.upsert({
          where: { userId_clubId: { userId: log.userId, clubId: log.clubId } },
          update: { notificationsOptOut: true },
          create: {
            userId: log.userId,
            clubId: log.clubId,
            notificationsOptOut: true,
            preferredDays: [],
            preferredFormats: [],
            targetSessionsPerWeek: 2,
            skillLevel: 'ALL_LEVELS',
          },
        }).catch(err => {
          console.warn('[Mandrill Webhook] Failed to set opt-out:', (err as Error).message?.slice(0, 100))
        })
      }
      break

    case 'send':
      // Mandrill confirmed send — update deliveredAt
      if (!log.deliveredAt) {
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: { deliveredAt: eventTime },
        })
      }
      break

    default:
      // Ignore deferral and unknown events
      break
  }
}
