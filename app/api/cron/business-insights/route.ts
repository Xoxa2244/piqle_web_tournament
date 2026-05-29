/**
 * Daily Business Insights cron — Step 10 of
 * DASHBOARD_AND_ACTION_CENTER_SPEC.md §7.2.
 *
 * Runs the canon insight engine for every club once per day so the
 * Dashboard "Business Insights" card stays current without an operator
 * pressing Refresh.
 *
 * Cadence: 03:00 UTC (chosen to follow health-snapshot at 03:00 — the
 * member_health table is one of the inputs the canon engine reads).
 * Per-club work is sequential to keep DB pressure predictable; each
 * runBusinessInsights() call already does its own UPSERT reconciliation.
 *
 * Idempotency: re-running this cron is safe. The engine's upsert layer
 * scopes the partial unique index to (club_id, dedupe_key), so a
 * second run either refreshes last_seen_at on an existing row or
 * resolves it when the condition is no longer truthy — never inserts
 * a duplicate.
 *
 * Bearer auth via CRON_SECRET (same pattern every other cron in the
 * repo uses — see health-snapshot/route.ts).
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { runBusinessInsights } from '@/lib/ai/business-insights-engine'

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
    // Iterate all clubs. We rely on the active row in `clubs` rather
    // than gating on automation_settings — the canon engine is read-mostly
    // (no external side effects), so generating insights for clubs that
    // happen to have AI features off is cheap and surfaces them the moment
    // automation is re-enabled.
    const clubs = await prisma.club.findMany({ select: { id: true, name: true } })

    let okCount = 0
    let errCount = 0
    let totalInserted = 0
    let totalRefreshed = 0
    let totalResolved = 0

    for (const club of clubs) {
      try {
        const report = await runBusinessInsights(prisma as any, club.id)
        totalInserted += report.inserted
        totalRefreshed += report.refreshed
        totalResolved += report.resolved
        // Generator-level failures are now isolated inside runBusinessInsights
        // (one bad generator no longer aborts the whole club). Surface them so
        // a single broken generator can't silently freeze insights again.
        if (report.errors.length > 0) {
          log.warn(
            {
              cron: 'business-insights',
              clubId: club.id,
              clubName: club.name,
              failedGenerators: report.errors
                .map((e) => `${e.generator}: ${e.error}`)
                .slice(0, 10),
            },
            'business-insights: some generators failed (isolated, run continued)',
          )
        }
        okCount++
      } catch (err: any) {
        errCount++
        log.warn(
          {
            cron: 'business-insights',
            clubId: club.id,
            clubName: club.name,
            err: String(err?.message ?? err).slice(0, 200),
          },
          'business-insights: club failed',
        )
      }
    }

    log.info(
      {
        cron: 'business-insights',
        clubs: clubs.length,
        ok: okCount,
        errors: errCount,
        inserted: totalInserted,
        refreshed: totalRefreshed,
        resolved: totalResolved,
        durationMs: Date.now() - startedAt.getTime(),
      },
      'Daily business-insights run complete',
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
    log.error('[Cron business-insights] Failed:', error)
    return NextResponse.json(
      {
        error: 'business-insights failed',
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
