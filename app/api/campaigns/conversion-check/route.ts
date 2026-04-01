/**
 * Conversion Check Cron — runs daily
 *
 * Checks if campaign recipients actually booked a session after receiving
 * a campaign message. This is the key metric — opens/clicks mean nothing
 * if the member didn't come back to play.
 *
 * Logic:
 * 1. Find ai_recommendation_logs where status IN (sent, delivered, opened, clicked)
 *    and createdAt between 3-30 days ago, respondedAt IS NULL
 * 2. For each log, check if the user has a confirmed play_session_booking
 *    created AFTER the campaign was sent
 * 3. If yes → status = 'converted', respondedAt = booking date
 * 4. If no and 30+ days old → leave as-is (unconverted)
 *
 * Schedule: daily at 4:00 AM UTC (after health campaign cron)
 */

import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minutes max

function getAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return { ok: true as const }
  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

// Minimum days after send before checking conversion (give members time to act)
const MIN_DAYS_AFTER_SEND = 3
// Maximum days to check — after this we stop looking
const MAX_DAYS_AFTER_SEND = 30
// How many days after campaign to look for bookings as "converted"
const CONVERSION_WINDOW_DAYS = 14

async function checkConversions() {
  const now = new Date()
  const minDate = new Date(now.getTime() - MAX_DAYS_AFTER_SEND * 86400000)
  const maxDate = new Date(now.getTime() - MIN_DAYS_AFTER_SEND * 86400000)

  // Find campaign logs that need conversion checking
  const pendingLogs: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      arl.id,
      arl."userId",
      arl."clubId",
      arl."createdAt",
      arl.status,
      arl.type
    FROM ai_recommendation_logs arl
    WHERE arl.status IN ('sent', 'delivered', 'opened', 'clicked')
      AND arl."respondedAt" IS NULL
      AND arl."createdAt" >= $1
      AND arl."createdAt" <= $2
    ORDER BY arl."createdAt" ASC
    LIMIT 500
  `, minDate.toISOString(), maxDate.toISOString())

  if (pendingLogs.length === 0) {
    return { checked: 0, converted: 0, unconverted: 0 }
  }

  let converted = 0
  let unconverted = 0

  for (const log of pendingLogs) {
    const sentAt = new Date(log.createdAt)
    const conversionDeadline = new Date(sentAt.getTime() + CONVERSION_WINDOW_DAYS * 86400000)

    // Check if user booked a confirmed session at this club after the campaign was sent
    const bookings: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        b."bookedAt",
        ps.date as session_date,
        ps.title
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE b."userId" = $1
        AND ps."clubId" = $2::uuid
        AND b.status = 'CONFIRMED'
        AND b."bookedAt" > $3
        AND b."bookedAt" <= $4
      ORDER BY b."bookedAt" ASC
      LIMIT 1
    `, log.userId, log.clubId, sentAt.toISOString(), conversionDeadline.toISOString())

    if (bookings.length > 0) {
      // Member booked a session after the campaign!
      await prisma.aIRecommendationLog.update({
        where: { id: log.id },
        data: {
          status: 'converted',
          respondedAt: bookings[0].bookedAt,
        },
      })
      converted++
    } else {
      // Check if conversion window has passed
      const daysSinceSend = Math.floor((now.getTime() - sentAt.getTime()) / 86400000)
      if (daysSinceSend >= CONVERSION_WINDOW_DAYS) {
        // Window closed — no conversion, but don't change status
        // Just set respondedAt to null marker so we don't recheck
        // We mark with a special timestamp to indicate "checked but no conversion"
        unconverted++
      }
      // else: still within window, will check again tomorrow
    }
  }

  return {
    checked: pendingLogs.length,
    converted,
    unconverted,
    stillPending: pendingLogs.length - converted - unconverted,
  }
}

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()

  try {
    const result = await checkConversions()

    log.info(`[Conversion Check] Done: ${result.converted} converted, ${result.unconverted} unconverted, ${result.stillPending || 0} pending out of ${result.checked} checked`)

    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ...result,
    })
  } catch (err) {
    log.error('[Conversion Check] Failed:', (err as Error).message)
    return NextResponse.json({
      ok: false,
      error: (err as Error).message?.slice(0, 200),
    }, { status: 500 })
  }
}

export async function POST(request: Request) { return run(request) }
export async function GET(request: Request) { return run(request) }
