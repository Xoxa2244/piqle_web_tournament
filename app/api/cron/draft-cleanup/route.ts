/**
 * Daily draft cleanup cron — Step 11 of
 * DASHBOARD_AND_ACTION_CENTER_SPEC.md §7.2 + §8.1.
 *
 * Deletes expired rows from `cohort_draft`, `campaign_draft`, and
 * `programming_draft`. Drafts default to 7-day TTL via the DB-side
 * `expires_at DEFAULT (now() + interval '7 days')`. This cron removes
 * anything past that mark so the tables stay small and back/forward
 * navigation never lands on a stale draft.
 *
 * Same bearer auth pattern as every other cron in the repo.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { cleanupExpiredDrafts } from '@/lib/ai/draft-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    const counts = await cleanupExpiredDrafts(prisma as any)
    log.info(
      {
        cron: 'draft-cleanup',
        ...counts,
        durationMs: Date.now() - startedAt.getTime(),
      },
      'Daily draft cleanup complete',
    )
    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      ...counts,
    })
  } catch (error: any) {
    log.error('[Cron draft-cleanup] Failed:', error)
    return NextResponse.json(
      {
        error: 'draft-cleanup failed',
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
