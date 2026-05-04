/**
 * CR sync WORKER endpoint — processes ONE connector with the full 5-min
 * Vercel function budget. Triggered fan-out style by the orchestrator
 * (`/api/connectors/courtreserve/sync`) so that N clubs sync concurrently
 * in N separate function invocations rather than serially in one.
 *
 * Auth: Bearer CRON_SECRET (same as the orchestrator).
 *
 * Flow:
 *   1. Validate auth + body.connectorId
 *   2. Concurrent-sync guard: if connector.status='syncing' AND updatedAt
 *      is within the last 5 min, refuse — assume another worker is already
 *      processing this connector. Prevents double-sync race conditions.
 *   3. Mark status='syncing' (if not already), respond 202 Accepted.
 *   4. In `after()`: run the actual sync (up to ~4.5 min). The HTTP
 *      response is already sent so the caller doesn't block.
 *
 * Idempotent w.r.t. data: runCourtReserveSync uses external_id_mappings for
 * upsert so a duplicate run won't corrupt sessions/members/bookings — the
 * guard above just avoids wasting Vercel cycles.
 */
import { NextResponse } from 'next/server'
// `after` is named `unstable_after` in Next 15.0.x (stable in 15.1+).
// Aliased here so the rest of the file reads as the eventual stable name.
import { unstable_after as after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCourtReserveSync } from '@/lib/connectors/courtreserve-sync'
import { detectEventsForClub } from '@/lib/ai/event-detection'
import { cronLogger as log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { connectorId?: string }
  const connectorId = body.connectorId?.trim()
  if (!connectorId) {
    return NextResponse.json({ error: 'connectorId required' }, { status: 400 })
  }

  const connector = await prisma.clubConnector.findUnique({
    where: { id: connectorId },
    select: { id: true, status: true, updatedAt: true, lastSyncAt: true, lastSyncResult: true, clubId: true },
  })
  if (!connector) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
  }
  if (connector.status !== 'connected' && connector.status !== 'syncing' && connector.status !== 'error') {
    return NextResponse.json({ error: `Connector status ${connector.status} not eligible for sync` }, { status: 422 })
  }

  // Concurrent-sync guard. If another worker is already running for this
  // connector AND it updated the row in the last 5 min, assume it's still
  // alive and refuse. After 5 min we treat it as crashed and take over.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  if (connector.status === 'syncing' && connector.updatedAt > fiveMinAgo) {
    return NextResponse.json({
      ok: false,
      reason: 'already_syncing',
      connectorId,
      sinceMs: Date.now() - connector.updatedAt.getTime(),
    }, { status: 409 })
  }

  const prevResult = connector.lastSyncResult as any
  const isInitial = connector.status === 'syncing'
    ? (prevResult?.isInitial ?? !connector.lastSyncAt)
    : false

  // Rate-limit cooldown check
  const nextRetryAt = prevResult?.nextRetryAt ? new Date(prevResult.nextRetryAt) : null
  if (nextRetryAt && nextRetryAt > new Date()) {
    const waitSec = Math.round((nextRetryAt.getTime() - Date.now()) / 1000)
    return NextResponse.json({
      ok: false,
      reason: 'rate_limited',
      connectorId,
      retryInSec: waitSec,
    }, { status: 429 })
  }

  // Sync runs after we send the response. `after()` keeps the function
  // alive until the callback completes (subject to maxDuration).
  after(async () => {
    try {
      log.info(`[CR Worker] Syncing ${connector.clubId} (id=${connectorId}, ${isInitial ? 'initial' : 'incremental'})`)
      const result = await runCourtReserveSync(connectorId, {
        isInitial,
        maxTimeMs: 270_000, // 4.5 min — leave headroom under Vercel's 5-min cap
      })

      if (result.incomplete) {
        log.info(`[CR Worker] ${connector.clubId}: chunk done, will continue next run`)
        return
      }

      // Sync complete — run event detection
      try {
        const club = await prisma.club.findUnique({
          where: { id: connector.clubId },
          select: { name: true },
        })
        await detectEventsForClub(prisma, connector.clubId, club?.name || 'Unknown', 75)
      } catch (evtErr: any) {
        log.error(`[CR Worker] Event detection failed for ${connector.clubId}:`, evtErr.message?.slice(0, 80))
      }
    } catch (err: any) {
      log.error(`[CR Worker] Sync failed for ${connector.clubId}:`, err?.message || err)
    }
  })

  return NextResponse.json({
    ok: true,
    accepted: true,
    connectorId,
    clubId: connector.clubId,
    isInitial,
  }, { status: 202 })
}
