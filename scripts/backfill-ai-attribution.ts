/**
 * One-shot AI-attribution backfill.
 *
 * The attribution-backfill cron only looks back 48h on each run (fine for
 * ongoing operation, but leaves all pre-deploy recommendation logs without
 * a booking link). This script walks the entire history and attempts to
 * attribute every CONFIRMED booking in the window to the best matching
 * recommendation.
 *
 * Idempotent — re-running is safe (per-booking via the partial unique
 * index on ai_recommendation_logs.booking_id).
 *
 * Usage:
 *   DATABASE_URL=<prod_url> npx tsx scripts/backfill-ai-attribution.ts
 *
 * Flags:
 *   --days=N       Lookback in days (default 365 — full history)
 *   --club=<uuid>  Backfill one club only (default all)
 *   --batch=N      Bookings per club per pass (default 2000)
 *
 * Expected runtime: ~2-3 min for 36k bookings + 1k rec logs on our
 * current dataset. Each booking does at most 3 small indexed queries.
 */

import { prisma } from '../lib/prisma'
import { runAttributionBackfill } from '../lib/ai/attribution'

type Args = {
  days: number
  clubId?: string
  batch: number
}

function parseArgs(argv: string[]): Args {
  const out: Args = { days: 365, batch: 2000 }
  for (const arg of argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key === 'days') out.days = Number(value) || out.days
    else if (key === 'club') out.clubId = value
    else if (key === 'batch') out.batch = Number(value) || out.batch
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv)
  const sinceMs = args.days * 24 * 60 * 60 * 1000
  const sinceDate = new Date(Date.now() - sinceMs)

  console.log('══════════════════════════════════════════════════════════════')
  console.log('  AI Attribution — One-shot Historical Backfill')
  console.log('══════════════════════════════════════════════════════════════')
  console.log(`  Lookback: ${args.days} days (since ${sinceDate.toISOString().slice(0, 10)})`)
  console.log(`  Batch:    ${args.batch} bookings / club / pass`)
  console.log(`  Club:     ${args.clubId ?? 'ALL'}`)
  console.log('')

  // Snapshot before — so we can report the net change.
  const [beforeLinked] = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM ai_recommendation_logs WHERE booking_id IS NOT NULL`,
  )
  const [totalLogs] = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM ai_recommendation_logs`,
  )
  console.log(`  Before: ${beforeLinked.count} / ${totalLogs.count} logs have a linked booking`)
  console.log('')

  const clubs = args.clubId
    ? await prisma.club.findMany({ where: { id: args.clubId }, select: { id: true, name: true } })
    : await prisma.club.findMany({ select: { id: true, name: true } })

  const grand = { scanned: 0, linked: 0, deep_link: 0, direct_session_match: 0, time_window: 0 }
  const start = Date.now()

  for (const club of clubs) {
    const tClub = Date.now()
    // Loop passes until a pass links nothing — protects us when > batch
    // bookings exist in window.
    let pass = 0
    let lastLinked = -1
    const clubTotals = { scanned: 0, linked: 0, deep_link: 0, direct_session_match: 0, time_window: 0 }
    while (lastLinked !== 0) {
      pass++
      const result = await runAttributionBackfill(prisma as any, {
        clubId: club.id,
        sinceMs,
        limit: args.batch,
      })
      clubTotals.scanned += result.scanned
      clubTotals.linked += result.linked
      clubTotals.deep_link += result.byMethod.deep_link
      clubTotals.direct_session_match += result.byMethod.direct_session_match
      clubTotals.time_window += result.byMethod.time_window
      lastLinked = result.linked
      // Safety brake — 10 passes means ~20k bookings; after that call it a day.
      if (pass >= 10) break
    }

    const secs = ((Date.now() - tClub) / 1000).toFixed(1)
    console.log(
      `  ${club.name.padEnd(32)}  scanned ${String(clubTotals.scanned).padStart(5)}  linked ${String(clubTotals.linked).padStart(4)}  (deep ${clubTotals.deep_link} / direct ${clubTotals.direct_session_match} / window ${clubTotals.time_window})  [${secs}s, ${pass} pass${pass === 1 ? '' : 'es'}]`,
    )

    grand.scanned += clubTotals.scanned
    grand.linked += clubTotals.linked
    grand.deep_link += clubTotals.deep_link
    grand.direct_session_match += clubTotals.direct_session_match
    grand.time_window += clubTotals.time_window
  }

  // Snapshot after — and the $ total of what we linked.
  const [revenueRow] = await prisma.$queryRawUnsafe<Array<{ total: number | null; count: number }>>(
    `SELECT COALESCE(SUM(linked_booking_value), 0)::float AS total, COUNT(*)::int AS count
     FROM ai_recommendation_logs
     WHERE linked_at >= $1`,
    new Date(Date.now() - sinceMs),
  )

  const totalSecs = ((Date.now() - start) / 1000).toFixed(1)
  console.log('')
  console.log('══════════════════════════════════════════════════════════════')
  console.log(`  Clubs processed:   ${clubs.length}`)
  console.log(`  Bookings scanned:  ${grand.scanned}`)
  console.log(`  Bookings linked:   ${grand.linked}`)
  console.log(`    • deep_link:            ${grand.deep_link}`)
  console.log(`    • direct_session_match: ${grand.direct_session_match}`)
  console.log(`    • time_window:          ${grand.time_window}`)
  console.log(`  $ revenue linked:  $${(revenueRow.total || 0).toFixed(2)} across ${revenueRow.count} logs`)
  console.log(`  Runtime:           ${totalSecs}s`)
  console.log('══════════════════════════════════════════════════════════════')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[backfill-ai-attribution] FAILED:', err)
    process.exit(1)
  })
