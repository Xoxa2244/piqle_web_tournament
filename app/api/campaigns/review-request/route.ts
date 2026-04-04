/**
 * Google Review Request Cron — runs daily at 9 PM UTC
 *
 * After a member plays a session, sends a review request via email.
 * Logic:
 * 1. Find confirmed bookings where session ended 2-24 hours ago
 * 2. Filter: member hasn't received a review request in last 30 days
 * 3. Filter: club has googleReviewUrl configured
 * 4. Send short email: "Enjoyed your session? Leave us a review!"
 * 5. Log in ai_recommendation_logs as type 'REVIEW_REQUEST'
 *
 * Schedule: daily at 9 PM UTC (afternoon/evening in US)
 */

import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return { ok: true as const }
  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

async function sendReviewRequests() {
  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  // Find clubs with Google Review URL configured
  const clubs: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, name, automation_settings as "automationSettings"
    FROM clubs
    WHERE automation_settings::text LIKE '%googleReviewUrl%'
  `)

  let totalSent = 0
  let totalSkipped = 0

  for (const club of clubs) {
    const settings = typeof club.automationSettings === 'object' ? club.automationSettings : {}
    const googleReviewUrl = (settings as any)?.googleReviewUrl
    if (!googleReviewUrl) continue

    // Find members who played a session 2-24 hours ago
    const recentPlayers: any[] = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT
        b."userId",
        u.email,
        u.name,
        ps.title as session_title
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      JOIN users u ON u.id = b."userId"
      WHERE ps."clubId" = $1
        AND b.status = 'CONFIRMED'
        AND ps.date <= $2
        AND ps.date >= $3
        AND u.email IS NOT NULL
        -- Exclude members who got a review request in last 30 days
        AND NOT EXISTS (
          SELECT 1 FROM ai_recommendation_logs arl
          WHERE arl."userId" = b."userId"
            AND arl."clubId" = $1
            AND arl.type = 'REVIEW_REQUEST'
            AND arl."createdAt" >= $4
        )
      LIMIT 50
    `, club.id, twoHoursAgo.toISOString(), twentyFourHoursAgo.toISOString(), thirtyDaysAgo.toISOString())

    if (recentPlayers.length === 0) continue

    // Check email usage limits
    try {
      const { checkUsageLimit } = await import('@/lib/subscription')
      const emailCheck = await checkUsageLimit(club.id, 'emails', recentPlayers.length)
      if (!emailCheck.allowed) {
        log.warn(`[Review] Club ${club.id} email limit reached, skipping`)
        totalSkipped += recentPlayers.length
        continue
      }
    } catch { /* proceed if check fails */ }

    // Send review request emails
    for (const player of recentPlayers) {
      try {
        const firstName = player.name?.split(' ')[0] || 'there'
        const { sendOutreachEmail } = await import('@/lib/email')

        const result = await sendOutreachEmail({
          to: player.email,
          subject: `How was your session at ${club.name}? ⭐`,
          body: `Hey ${firstName}!\n\nWe hope you enjoyed your session${player.session_title ? ` (${player.session_title})` : ''} at ${club.name}.\n\nIf you had a great time, we'd love for you to leave us a quick review — it helps other players find our club!\n\nThanks for being part of our community! 🏓`,
          clubName: club.name,
          bookingUrl: googleReviewUrl,
        })

        // Log as REVIEW_REQUEST
        await prisma.aIRecommendationLog.create({
          data: {
            clubId: club.id,
            userId: player.userId,
            type: 'CHECK_IN', // Using CHECK_IN as closest type — REVIEW_REQUEST not in enum
            channel: 'email',
            variantId: 'review_request',
            externalMessageId: result.messageId || null,
            reasoning: { source: 'review_request_cron', sessionTitle: player.session_title },
            status: 'sent',
          },
        })

        totalSent++

        // Report usage to Stripe
        import('@/lib/stripe-usage').then(({ reportUsage }) => {
          reportUsage(club.id, 'email', 1)
        }).catch(() => {})

      } catch (err) {
        log.error(`[Review] Failed for ${player.userId}:`, (err as Error).message?.slice(0, 80))
        totalSkipped++
      }
    }
  }

  return { totalSent, totalSkipped, clubsProcessed: clubs.length }
}

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()
  try {
    const result = await sendReviewRequests()
    log.info(`[Review] Done: ${result.totalSent} sent, ${result.totalSkipped} skipped`)
    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - startedAt.getTime() })
  } catch (err) {
    log.error('[Review] Failed:', (err as Error).message)
    return NextResponse.json({ ok: false, error: (err as Error).message?.slice(0, 200) }, { status: 500 })
  }
}

export async function POST(request: Request) { return run(request) }
export async function GET(request: Request) { return run(request) }
