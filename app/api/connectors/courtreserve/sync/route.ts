/**
 * CRON: Auto-sync all active CourtReserve connectors.
 * Runs every 6 hours.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCourtReserveSync } from '@/lib/connectors/courtreserve-sync'

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

    const results: { clubId: string; status: string; error?: string }[] = []

    for (const connector of connectors) {
      try {
        await runCourtReserveSync(connector.id, { isInitial: false })
        results.push({ clubId: connector.clubId, status: 'ok' })
      } catch (err: any) {
        console.error(`[CR Cron] Sync failed for club ${connector.clubId}:`, err.message)
        results.push({ clubId: connector.clubId, status: 'error', error: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      synced: results.filter(r => r.status === 'ok').length,
      failed: results.filter(r => r.status === 'error').length,
      results,
    })
  } catch (error: any) {
    console.error('[CR Cron] Failed:', error)
    return NextResponse.json({ error: error.message || 'Cron failed' }, { status: 500 })
  }
}
