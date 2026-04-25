/**
 * Attribution Backfill Cron
 *
 * Runs every 15 minutes. Scans CONFIRMED bookings from the last 48h that
 * don't have a linked AI recommendation and attempts to attribute each.
 *
 * Why a cron rather than a sync hook:
 *   • Bookings enter our DB via several paths — CourtReserve scheduled
 *     sync, bulk Excel imports, partners API. Hooking every create-site
 *     triples the blast radius for the sync code, and bulk paths don't
 *     return individual IDs anyway.
 *   • 15-min cadence is well below the windows we attribute on (72h min),
 *     so real-time isn't needed for correctness — only for dashboard
 *     freshness. Demo days can manually poke this endpoint.
 *
 * Safe to re-run repeatedly: attribution is idempotent per booking via
 * the partial unique index on ai_recommendation_logs.booking_id.
 *
 * Schedule: every 15 min (add to vercel.json crons).
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { cronHandler } from '@/lib/cron-wrapper'
import { runAttributionBackfill } from '@/lib/ai/attribution'
import { cronLogger as log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Look back 48h — well beyond our tightest window (72h), so a booking
// created just as a rec was sent has two passes to get linked.
const LOOKBACK_MS = 48 * 60 * 60 * 1000
const PER_CLUB_LIMIT = 200

export const POST = cronHandler('attribution-backfill', async () => {
  const clubs = await prisma.club.findMany({ select: { id: true, name: true } })
  const totals = { scanned: 0, linked: 0, deep_link: 0, direct_session_match: 0, time_window: 0 }

  for (const club of clubs) {
    try {
      const result = await runAttributionBackfill(prisma as any, {
        clubId: club.id,
        sinceMs: LOOKBACK_MS,
        limit: PER_CLUB_LIMIT,
      })
      totals.scanned += result.scanned
      totals.linked += result.linked
      totals.deep_link += result.byMethod.deep_link
      totals.direct_session_match += result.byMethod.direct_session_match
      totals.time_window += result.byMethod.time_window
    } catch (err) {
      // One club's attribution failing shouldn't stop the others.
      Sentry.captureException(err, {
        tags: { cron: 'attribution-backfill', clubId: club.id },
      })
      log.error(
        { cron: 'attribution-backfill', clubId: club.id, err: (err as Error).message?.slice(0, 200) },
        'Per-club attribution failed',
      )
    }
  }

  log.info(
    { cron: 'attribution-backfill', ...totals, clubsProcessed: clubs.length },
    'Attribution backfill complete',
  )

  return { clubsProcessed: clubs.length, ...totals }
})

// Vercel cron uses GET by default.
export const GET = POST
