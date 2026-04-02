/**
 * CRON: Auto-sync all active CourtReserve connectors.
 * Runs every hour. After each club sync, triggers event detection
 * (cancellations, underfilled sessions, new members) immediately.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCourtReserveSync } from '@/lib/connectors/courtreserve-sync'
import { detectEventsForClub } from '@/lib/ai/event-detection'
import { cronLogger as log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min max for sync

export async function GET(request: Request) {
  return handleSync(request)
}

export async function POST(request: Request) {
  return handleSync(request)
}

async function handleSync(request: Request) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find all active auto-sync connectors
    const connectors = await prisma.clubConnector.findMany({
      where: {
        provider: 'courtreserve',
        autoSync: true,
        status: { in: ['connected', 'error'] }, // retry errors too
      },
    })

    if (connectors.length === 0) {
      return NextResponse.json({ ok: true, message: 'No connectors to sync', synced: 0 })
    }

    const results: { clubId: string; status: string; error?: string; events?: any }[] = []

    for (const connector of connectors) {
      try {
        await runCourtReserveSync(connector.id, { isInitial: false })

        // Immediately detect events after fresh data is synced
        let events = null
        try {
          const club = await prisma.club.findUnique({
            where: { id: connector.clubId },
            select: { name: true },
          })
          events = await detectEventsForClub(prisma, connector.clubId, club?.name || 'Unknown', 75)
          if (events.actionsTaken > 0) {
            log.info(`Post-sync events for ${club?.name}: ${events.actionsTaken} actions`)
          }
        } catch (evtErr: any) {
          log.error(`Event detection failed for ${connector.clubId}:`, evtErr.message?.slice(0, 80))
        }

        results.push({ clubId: connector.clubId, status: 'ok', events })
      } catch (err: any) {
        log.error(`Sync failed for club ${connector.clubId}:`, err.message)
        results.push({ clubId: connector.clubId, status: 'error', error: err.message })
      }
    }

    const totalActions = results.reduce((s, r) => s + (r.events?.actionsTaken || 0), 0)

    return NextResponse.json({
      ok: true,
      synced: results.filter(r => r.status === 'ok').length,
      failed: results.filter(r => r.status === 'error').length,
      totalAgentActions: totalActions,
      results,
    })
  } catch (error: any) {
    console.error('[CR Cron] Failed:', error)
    return NextResponse.json({ error: error.message || 'Cron failed' }, { status: 500 })
  }
}
