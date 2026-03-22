/**
 * Resend Webhook Endpoint
 *
 * Receives POST events from Resend for email delivery tracking:
 *   - email.delivered  → Email delivered to inbox
 *   - email.opened     → Email opened by recipient
 *   - email.clicked    → Link clicked in email
 *   - email.bounced    → Email bounced (hard/soft)
 *   - email.complained → Marked as spam
 *
 * Setup in Resend Dashboard:
 *   Webhook URL: https://app.iqsport.ai/api/webhooks/resend
 *   Events: email.delivered, email.opened, email.clicked, email.bounced, email.complained
 *
 * The logId is passed via X-Metadata-logId header when sending email.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Resend Webhook Signature Verification ──

function verifyResendSignature(
  payload: string,
  signature: string,
): boolean {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.warn('[Resend Webhook] RESEND_WEBHOOK_SECRET not set — skipping signature verification')
    return true // Allow in development
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    headers?: Array<{ name: string; value: string }>
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()

    // Verify signature
    const signature = request.headers.get('resend-signature') || ''
    if (signature && !verifyResendSignature(rawBody, signature)) {
      console.error('[Resend Webhook] Invalid signature')
      return new NextResponse('Invalid signature', { status: 403 })
    }

    const event: ResendWebhookEvent = JSON.parse(rawBody)
    const { type, data } = event

    // Extract logId from email headers (set when sending)
    const logIdHeader = data.headers?.find(h => h.name === 'X-Metadata-logId')
    const logId = logIdHeader?.value

    // Also try to find by externalMessageId (Resend email_id)
    const emailId = data.email_id

    if (!logId && !emailId) {
      return NextResponse.json({ received: true })
    }

    // Find the log record
    let log = null
    if (logId) {
      log = await prisma.aIRecommendationLog.findUnique({ where: { id: logId } })
    }
    if (!log && emailId) {
      log = await prisma.aIRecommendationLog.findFirst({
        where: { externalMessageId: emailId },
      })
    }

    if (!log) {
      console.warn(`[Resend Webhook] Log not found for logId=${logId}, emailId=${emailId}`)
      return NextResponse.json({ received: true })
    }

    const now = new Date()

    switch (type) {
      case 'email.delivered':
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            deliveredAt: now,
            status: 'DELIVERED',
            externalMessageId: emailId || log.externalMessageId,
          },
        })
        break

      case 'email.opened':
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            openedAt: now,
            status: 'OPENED',
          },
        })
        break

      case 'email.clicked':
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            clickedAt: now,
            status: 'CLICKED',
          },
        })
        break

      case 'email.bounced':
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            status: 'BOUNCED',
            bounceType: 'email_bounce',
            bouncedAt: now,
            reasoning: {
              ...(typeof log.reasoning === 'object' && log.reasoning !== null ? log.reasoning : {}),
              emailBounce: `Bounced: ${data.to?.join(', ')}`,
            },
          },
        })
        break

      case 'email.complained':
        // User marked as spam → auto opt-out
        await prisma.aIRecommendationLog.update({
          where: { id: log.id },
          data: {
            status: 'UNSUBSCRIBED',
            bounceType: 'email_complaint',
            bouncedAt: now,
          },
        })

        // Auto opt-out user from future emails
        if (log.userId && log.clubId) {
          await prisma.userPlayPreference.updateMany({
            where: { userId: log.userId, clubId: log.clubId },
            data: { notificationsOptOut: true },
          })
          console.log(`[Resend Webhook] Auto opt-out user ${log.userId} after spam complaint`)
        }
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[Resend Webhook] Error:', (err as Error).message?.slice(0, 200))
    return NextResponse.json({ received: true })
  }
}
