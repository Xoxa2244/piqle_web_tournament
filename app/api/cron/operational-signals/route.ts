/**
 * Hourly Operational Signals cron — Step 16 of
 * DASHBOARD_AND_ACTION_CENTER_SPEC.md §7.2.
 *
 * Runs the operational-signals engine for every club. Cadence is
 * hourly (not daily like business-insights) because signals reference
 * fast-moving state: membership status changes, recent bookings, risk
 * transitions. The 5-min `health-snapshot` cron precedes us in absolute
 * terms but on the snapshot day the engine still gets the latest
 * delta — `member_health_snapshots` runs at 03:00 UTC, our 0th hour
 * after sees it.
 *
 * Idempotency: the engine's upsert layer scopes the partial unique
 * index to (club_id, dedupe_key), so re-running this cron either
 * refreshes last_seen_at or resolves the row — never inserts a dup.
 *
 * Bearer auth via CRON_SECRET (same pattern as business-insights and
 * health-snapshot crons).
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { runOperationalSignals } from '@/lib/ai/operational-signals-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()

  try {
    // Same scope as business-insights: every club. The engine is
    // read-mostly within the per-club pass, so iterating across all
    // clubs is cheap and stays correct even when automation toggles
    // are off — the resulting rows just sit there until somebody opens
    // the Action Center.
    const clubs = await prisma.club.findMany({ select: { id: true, name: true } })

    let okCount = 0
    let errCount = 0
    let totalInserted = 0
    let totalRefreshed = 0
    let totalResolved = 0

    for (const club of clubs) {
      try {
        const report = await runOperationalSignals(prisma as any, club.id)
        totalInserted += report.inserted
        totalRefreshed += report.refreshed
        totalResolved += report.resolved
        okCount++
      } catch (err: any) {
        errCount++
        log.warn(
          {
            cron: 'operational-signals',
            clubId: club.id,
            clubName: club.name,
            err: String(err?.message ?? err).slice(0, 200),
          },
          'operational-signals: club failed',
        )
      }
    }

    log.info(
      {
        cron: 'operational-signals',
        clubs: clubs.length,
        ok: okCount,
        errors: errCount,
        inserted: totalInserted,
        refreshed: totalRefreshed,
        resolved: totalResolved,
        durationMs: Date.now() - startedAt.getTime(),
      },
      'Hourly operational-signals run complete',
    )

    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      clubsProcessed: okCount,
      clubsFailed: errCount,
      inserted: totalInserted,
      refreshed: totalRefreshed,
      resolved: totalResolved,
    })
  } catch (error: any) {
    log.error('[Cron operational-signals] Failed:', error)
    return NextResponse.json(
      {
        error: 'operational-signals failed',
        message: String(error?.message ?? error).slice(0, 200),
      },
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
