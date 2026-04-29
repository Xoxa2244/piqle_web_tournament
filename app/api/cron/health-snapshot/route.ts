/**
 * Daily MemberHealthSnapshot cron — P5-T1.
 *
 * Runs once per day at 03:00 UTC (well before /api/campaigns/health at 14:00).
 * For each club, ensures every active follower has a snapshot dated TODAY in
 * MemberHealthSnapshot. Idempotent: skips a (clubId, userId, today) row when
 * one already exists, so re-running the cron is safe.
 *
 * Why a separate cron from /api/campaigns/health?
 *   - That cron's primary job is sending campaigns; snapshot writes are a
 *     side effect and they are NOT idempotent.
 *   - This cron is the canonical source-of-truth for "we have a snapshot per
 *     active member per day", which P2-T1 KPI deltas, P3-T1 cohort generators,
 *     and P5-T3 attribution all depend on.
 *
 * See docs/ENGAGE_REDESIGN_SPEC.md §7 P5-T1.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { snapshotAllClubs } from '@/lib/ai/snapshot-writer'

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
    // Use the dedicated snapshot-writer (NOT campaign-engine) so clubs with
    // automation disabled still get snapshots. Idempotency: each call skips
    // members that already have a today-snapshot.
    const results = await snapshotAllClubs(prisma)

    const totalCreated = results.reduce((s, r) => s + r.snapshotsCreated, 0)
    const totalSkipped = results.reduce((s, r) => s + r.snapshotsSkipped, 0)
    const totalErrors  = results.reduce((s, r) => s + r.errors, 0)

    log.info(
      {
        cron: 'health-snapshot',
        clubs: results.length,
        snapshotsCreated: totalCreated,
        snapshotsSkipped: totalSkipped,
        errors: totalErrors,
        durationMs: Date.now() - startedAt.getTime(),
      },
      'Daily health-snapshot complete',
    )

    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      clubs: results.length,
      snapshotsCreated: totalCreated,
      snapshotsSkipped: totalSkipped,
      errors: totalErrors,
    })
  } catch (error: any) {
    log.error('[Cron health-snapshot] Failed:', error)
    return NextResponse.json(
      { error: 'health-snapshot failed', message: String(error?.message ?? error).slice(0, 200) },
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
