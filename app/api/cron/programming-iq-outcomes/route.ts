/**
 * Daily Programming IQ outcome cron — Phase A.2.
 *
 * Runs once per day. For each club that has Programming-IQ-published
 * sessions in the last LOOKBACK_DAYS, computes actual attendance and
 * upserts one row per session into `programming_iq_outcome_log`. The
 * row optionally carries `decisionLogId` linking back to the original
 * scheduler decision so the diagnostics endpoint (Phase A.3) and the
 * v2 backtest harness (Phase D) can compare predicted-vs-actual.
 *
 * No behaviour-changing writes outside `programming_iq_outcome_log`.
 * Idempotent — see lib/ai/programming-iq-outcomes for the details.
 *
 * See docs/PROGRAMMING_IQ_SCORING_REFACTOR.md §Phase A.2.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { recordOutcomesForAllClubs } from '@/lib/ai/programming-iq-outcomes'

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
    const summary = await recordOutcomesForAllClubs(prisma)
    log.info(
      {
        cron: 'programming-iq-outcomes',
        ...summary,
      },
      'Daily programming-iq-outcomes complete',
    )
    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      ...summary,
    })
  } catch (error: any) {
    log.error('[Cron programming-iq-outcomes] Failed:', error)
    return NextResponse.json(
      {
        error: 'programming-iq-outcomes failed',
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
