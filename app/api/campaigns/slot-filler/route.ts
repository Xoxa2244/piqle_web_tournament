/**
 * CRON: Automated slot filler outreach.
 *
 * Modes:
 * - ?mode=tomorrow  — find tomorrow's sessions with empty slots, invite best candidates (daily 8 AM)
 * - ?mode=lastminute — find sessions starting in 2-6 hours, urgent invites (every 2 hours)
 *
 * Always dry run unless ?dryRun=false AND club has agentLive=true.
 * Auth: Bearer CRON_SECRET header
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runSlotFillerAutomation, type SlotFillerMode } from '@/lib/ai/slot-filler-automation'

export const maxDuration = 300
export const runtime = 'nodejs'

export async function POST(req: Request) { return handleRequest(req) }
export async function GET(req: Request) { return handleRequest(req) }

async function handleRequest(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const url = new URL(req.url)
  const mode = (url.searchParams.get('mode') || 'tomorrow') as SlotFillerMode
  const dryRun = url.searchParams.get('dryRun') !== 'false' // default: true

  if (!['tomorrow', 'lastminute'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode. Use ?mode=tomorrow or ?mode=lastminute' }, { status: 400 })
  }

  const startTime = Date.now()

  try {
    const result = await runSlotFillerAutomation(prisma as any, { mode, dryRun })

    return NextResponse.json({
      ok: true,
      mode,
      dryRun: result.dryRun,
      durationMs: Date.now() - startTime,
      totalClubs: result.clubs.length,
      totalSent: result.totalSent,
      totalSkipped: result.totalSkipped,
      clubs: result.clubs,
    })
  } catch (error: any) {
    console.error('[SlotFiller Cron] Failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
