/**
 * CRON ORCHESTRATOR: dispatches CourtReserve sync work in fan-out style.
 *
 * Old behavior (pre-2026-05-02): walked all eligible connectors in a single
 * function invocation, running each sync sequentially. With Vercel's 300-sec
 * function cap and 4-min per-connector budget, this could process at most
 * 1-2 clubs per cycle — IPC South + IPC North silently fell off and went
 * 12+ hours without sync.
 *
 * New behavior: this orchestrator only DISPATCHES; the actual sync runs in
 * `/api/connectors/courtreserve/sync-worker` — one Vercel function per
 * connector. Each worker gets its own 5-min budget, in parallel. Scales
 * cleanly to ~20 clubs without infra changes.
 *
 * Auth: Bearer CRON_SECRET.
 *
 * Trigger: vercel.json cron at `*\/15 * * * *` (every 15 min). Orchestrator
 * itself completes in <1 sec — heavy work happens in workers.
 */
import { NextResponse } from 'next/server'
// `after` is named `unstable_after` in Next 15.0.x (stable in 15.1+).
import { unstable_after as after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Orchestrator is fast — just enqueues workers via fetch. Cap low.
export const maxDuration = 60

export async function GET(request: Request) {
  return handleOrchestrate(request)
}

export async function POST(request: Request) {
  return handleOrchestrate(request)
}

/**
 * Resolve the base URL we use to call our own worker endpoint. Prefer
 * VERCEL_URL (set automatically per-deployment) so we hit the same build
 * we're running on; fall back to the host header for local/dev.
 */
function resolveSelfBaseUrl(request: Request): string {
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl}`
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('host')
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

async function handleOrchestrate(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find eligible connectors. Order by lastSyncAt ASC NULLS FIRST so the
    // most overdue connector is at the head — used to be unordered, which
    // caused the same connector to win every cron and others to starve.
    //
    // Cooldown window 10 min: skip connectors synced very recently. Cron
    // fires every 15 min via QStash, so 10 min lets the orchestrator pick
    // them up next cycle while still preventing back-to-back duplicate work
    // if QStash retries or someone hits the endpoint manually. The worker
    // also has its own concurrent-sync guard (status='syncing' < 5min →
    // 409) as a second line of defense.
    const cooldownAgo = new Date(Date.now() - 10 * 60 * 1000)
    const eligible = await prisma.clubConnector.findMany({
      where: {
        provider: 'courtreserve',
        autoSync: true,
        OR: [
          { status: 'syncing' }, // resume in-progress (initial sync chunks)
          {
            status: { in: ['connected', 'error'] },
            OR: [
              { lastSyncAt: null },
              { lastSyncAt: { lt: cooldownAgo } },
            ],
          },
        ],
      },
      orderBy: [
        { lastSyncAt: { sort: 'asc', nulls: 'first' } },
      ],
      select: { id: true, clubId: true, status: true, lastSyncAt: true },
    })

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nothing to sync', dispatched: 0 })
    }

    const baseUrl = resolveSelfBaseUrl(request)
    const workerUrl = `${baseUrl}/api/connectors/courtreserve/sync-worker`

    // Cap per-cycle dispatch to avoid Vercel concurrency surge if we ever
    // accumulate dozens of overdue connectors at once. With 15-min cron
    // cadence and ~4-min per-club sync, 10/cycle drains a 40-club backlog
    // in ~1 hour. Adjust if growth demands.
    const MAX_PER_CYCLE = 10
    const toDispatch = eligible.slice(0, MAX_PER_CYCLE)

    log.info(`[CR Orchestrator] Dispatching ${toDispatch.length}/${eligible.length} connectors to workers`)

    // Fan-out via after(): we want the HTTP response to return quickly so
    // the cron is happy, but we still need to actually fire the worker
    // requests. after() keeps the function alive until the callback
    // settles. Each fetch awaits only the worker's 202 ack (not the
    // 4-min sync) — workers themselves use after() to keep going past
    // their own response.
    const dispatchPromises: Promise<{ id: string; status: 'accepted' | 'rejected'; reason?: string }>[] = []
    after(async () => {
      const results = await Promise.allSettled(
        toDispatch.map(async (c): Promise<{ id: string; status: 'accepted' | 'rejected'; reason?: string }> => {
          try {
            const ctrl = new AbortController()
            const timer = setTimeout(() => ctrl.abort(), 10_000) // 10s ack timeout
            const resp = await fetch(workerUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cronSecret}`,
              },
              body: JSON.stringify({ connectorId: c.id }),
              signal: ctrl.signal,
            })
            clearTimeout(timer)
            if (resp.ok || resp.status === 202) {
              return { id: c.id, status: 'accepted' }
            }
            return { id: c.id, status: 'rejected', reason: `http_${resp.status}` }
          } catch (err: any) {
            return { id: c.id, status: 'rejected', reason: err?.name === 'AbortError' ? 'ack_timeout' : (err?.message?.slice(0, 80) || 'unknown') }
          }
        }),
      )

      const accepted = results.filter(r => r.status === 'fulfilled' && r.value.status === 'accepted').length
      const rejected = results.length - accepted
      log.info(`[CR Orchestrator] Dispatch results: ${accepted} accepted, ${rejected} rejected`)
      if (rejected > 0) {
        const failures = results
          .filter(r => r.status === 'fulfilled' && r.value.status === 'rejected')
          .map(r => (r as PromiseFulfilledResult<any>).value)
        log.warn(`[CR Orchestrator] Failed dispatches:`, JSON.stringify(failures))
      }
      // Suppress no-op promise lint — array referenced for shape parity.
      void dispatchPromises
    })

    return NextResponse.json({
      ok: true,
      eligible: eligible.length,
      dispatched: toDispatch.length,
      maxPerCycle: MAX_PER_CYCLE,
      connectorIds: toDispatch.map(c => c.id),
    })
  } catch (error: any) {
    console.error('[CR Orchestrator] Failed:', error)
    return NextResponse.json({ error: error.message || 'Orchestrator failed' }, { status: 500 })
  }
}
