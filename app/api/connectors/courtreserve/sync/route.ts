/**
 * CRON: Server-side sync worker for CourtReserve connectors.
 * Runs every 5 minutes. Picks up any connector with status='syncing'
 * and runs one chunk (45s). Progress is saved between chunks.
 * Also runs incremental sync for connected clubs every hour.
 *
 * This is the ONLY place sync actually runs — UI just sets status='syncing'.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCourtReserveSync } from '@/lib/connectors/courtreserve-sync'
import { detectEventsForClub } from '@/lib/ai/event-detection'
import { cronLogger as log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return handleSync(request)
}

export async function POST(request: Request) {
  return handleSync(request)
}

async function handleSync(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Find connectors that need work: syncing (in-progress) or connected (hourly incremental)
    const syncing = await prisma.clubConnector.findMany({
      where: { provider: 'courtreserve', status: 'syncing' },
    })

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const needsIncremental = await prisma.clubConnector.findMany({
      where: {
        provider: 'courtreserve',
        autoSync: true,
        status: { in: ['connected', 'error'] },
        OR: [
          { lastSyncAt: null },
          { lastSyncAt: { lt: hourAgo } },
        ],
      },
    })

    const allConnectors = [...syncing, ...needsIncremental]

    if (allConnectors.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nothing to sync', synced: 0 })
    }

    const results: { clubId: string; status: string; phase?: string; error?: string }[] = []

    for (const connector of allConnectors) {
      const isSyncing = connector.status === 'syncing'
      const prevResult = connector.lastSyncResult as any
      const isInitial = isSyncing ? (prevResult?.isInitial ?? !connector.lastSyncAt) : false

      try {
        log.info(`[CR Cron] Syncing ${connector.clubId} (${isSyncing ? 'resume' : 'incremental'})`)

        const result = await runCourtReserveSync(connector.id, {
          isInitial,
          maxTimeMs: 240_000, // 4 min per club (cron has 5 min total)
        })

        if (result.incomplete) {
          log.info(`[CR Cron] ${connector.clubId}: chunk done, will continue next run`)
          results.push({ clubId: connector.clubId, status: 'incomplete', phase: (connector.lastSyncResult as any)?.phase })
        } else {
          // Sync complete — run event detection
          try {
            const club = await prisma.club.findUnique({
              where: { id: connector.clubId },
              select: { name: true },
            })
            await detectEventsForClub(prisma, connector.clubId, club?.name || 'Unknown', 75)
          } catch (evtErr: any) {
            log.error(`Event detection failed for ${connector.clubId}:`, evtErr.message?.slice(0, 80))
          }
          results.push({ clubId: connector.clubId, status: 'complete' })
        }
      } catch (err: any) {
        log.error(`Sync failed for ${connector.clubId}:`, err.message)
        results.push({ clubId: connector.clubId, status: 'error', error: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
    })
  } catch (error: any) {
    console.error('[CR Cron] Failed:', error)
    return NextResponse.json({ error: error.message || 'Cron failed' }, { status: 500 })
  }
}
