/**
 * Advisor prefetch warm cron.
 *
 * Recomputes the AI Advisor prefetch snapshot for advisor-active clubs and
 * writes it to the SHARED Redis cache, every ~5 minutes. Because the cache is
 * shared across all serverless instances, real users — even ones landing on a
 * cold lambda — read warm data instead of paying the ~10s cold compute. Keeps
 * Advisor answers at a consistent ~5-6s and removes the rare deploy-cold ~28s.
 *
 * "Advisor-active" = clubs with at least one AI conversation in the last 7
 * days, so we don't burn compute warming dormant clubs. Best-effort per club;
 * one club's failure never aborts the run.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { refreshAdvisorPrefetch } from '@/lib/ai/advisor-prefetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ACTIVE_WINDOW_DAYS = 7
const MAX_CLUBS = 40
const CONCURRENCY = 3

function getAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return { ok: true as const }
  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const startedAt = Date.now()
  const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000)

  let clubIds: string[] = []
  try {
    const rows = await prisma.aIConversation.findMany({
      where: { createdAt: { gte: since } },
      distinct: ['clubId'],
      select: { clubId: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_CLUBS,
    })
    clubIds = rows.map((r) => r.clubId)
  } catch (e) {
    log.error('[advisor-prefetch-warm] failed to list active clubs', { error: (e as Error).message })
    return NextResponse.json({ error: 'failed to list clubs' }, { status: 500 })
  }

  let warmed = 0
  let failed = 0
  // Bounded concurrency so we don't stampede the DB.
  for (let i = 0; i < clubIds.length; i += CONCURRENCY) {
    const batch = clubIds.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map((id) => refreshAdvisorPrefetch(id)))
    for (const r of results) {
      if (r.status === 'fulfilled') warmed++
      else failed++
    }
  }

  const summary = { clubs: clubIds.length, warmed, failed, ms: Date.now() - startedAt }
  log.info('[advisor-prefetch-warm] done', summary)
  return NextResponse.json({ ok: true, ...summary })
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
