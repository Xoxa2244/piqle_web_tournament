/**
 * Twilio Status Callback Webhook Endpoint
 *
 * Receives POST events from Twilio for SMS delivery tracking:
 *   - queued     → Message queued for sending
 *   - sent       → Message sent to carrier
 *   - delivered   → Message delivered to phone
 *   - undelivered → Message could not be delivered
 *   - failed      → Message failed to send
 *
 * The logId is passed as a query parameter in the statusCallback URL,
 * set when sending SMS via lib/sms.ts:
 *   statusCallback: `https://domain.com/api/webhooks/twilio?logId=xxx`
 *
 * Twilio authenticates via request signature in X-Twilio-Signature header.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Twilio Signature Verification ──

function verifyTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.warn('[Twilio Webhook] TWILIO_AUTH_TOKEN not set — skipping signature verification')
    return true // Allow in development
  }

  // Twilio signature: HMAC-SHA1 of URL + sorted POST params
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const key of sortedKeys) {
    data += key + params[key]
  }

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64')

  return signature === expectedSignature
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const logId = url.searchParams.get('logId')

    if (!logId) {
      return NextResponse.json({ error: 'Missing logId' }, { status: 400 })
    }

    // Parse form-encoded body from Twilio
    const formData = await request.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => { params[key] = String(value) })

    // Verify Twilio signature
    const signature = request.headers.get('x-twilio-signature') || ''
    // Use full URL with query params for signature verification
    const isValid = verifyTwilioSignature(signature, request.url, params)
    if (!isValid) {
      console.error('[Twilio Webhook] Invalid signature')
      return new NextResponse('Invalid signature', { status: 403 })
    }

    const messageStatus = params.MessageStatus
    const messageSid = params.MessageSid
    const errorCode = params.ErrorCode
    const errorMessage = params.ErrorMessage

    if (!messageStatus) {
      return NextResponse.json({ received: true })
    }

    // Find the log record
    const log = await prisma.aIRecommendationLog.findUnique({
      where: { id: logId },
    })

    if (!log) {
      console.warn(`[Twilio Webhook] Log not found: ${logId}`)
      return NextResponse.json({ received: true })
    }

    const now = new Date()

    switch (messageStatus) {
      case 'delivered':
        await prisma.aIRecommendationLog.update({
          where: { id: logId },
          data: {
            deliveredAt: now,
            status: 'delivered',
            externalMessageId: messageSid || log.externalMessageId,
          },
        })
        break

      case 'undelivered':
      case 'failed':
        await prisma.aIRecommendationLog.update({
          where: { id: logId },
          data: {
            status: 'failed',
            bounceType: `sms_${messageStatus}`,
            bouncedAt: now,
            externalMessageId: messageSid || log.externalMessageId,
            reasoning: {
              ...(typeof log.reasoning === 'object' && log.reasoning !== null ? log.reasoning : {}),
              smsError: errorCode ? `${errorCode}: ${errorMessage}` : messageStatus,
            },
          },
        })
        break

      case 'sent':
        // Intermediate state — message sent to carrier, awaiting delivery confirmation
        if (log.status === 'sent' || log.status === 'pending') {
          await prisma.aIRecommendationLog.update({
            where: { id: logId },
            data: {
              externalMessageId: messageSid || log.externalMessageId,
            },
          })
        }
        break

      default:
        // queued, sending — no action needed
        break
    }

    // Twilio expects 200 response
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[Twilio Webhook] Error:', (err as Error).message?.slice(0, 200))
    return NextResponse.json({ received: true })
  }
}
