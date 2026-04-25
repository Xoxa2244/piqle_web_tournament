/**
 * Agent Event Detection — manual/debug endpoint + safety net cron (every 6h)
 *
 * Primary detection happens automatically after each CourtReserve sync.
 * This route serves as:
 * 1. Manual trigger for debugging: curl /api/agent/events
 * 2. Safety net cron (every 6h) — catches anything sync might have missed
 *
 * Respects live mode and autonomy policy — low-trust actions can stay pending.
 */

import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { detectEventsAllClubs } from '@/lib/ai/event-detection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return { ok: true as const }
  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()
  try {
    // Safety net: look back 6h to catch anything missed
    const results = await detectEventsAllClubs(prisma, 360)
    const totalActions = results.reduce((s, r) => s + r.actionsTaken, 0)
    log.info(`Event detection (safety net): ${results.length} clubs, ${totalActions} actions`)

    return NextResponse.json({
      ok: true,
      mode: 'safety_net',
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      clubs: results,
      totalActions,
    })
  } catch (err) {
    log.error('Event detection failed:', (err as Error).message)
    return NextResponse.json({ ok: false, error: (err as Error).message?.slice(0, 200) }, { status: 500 })
  }
}

export async function POST(request: Request) { return run(request) }
export async function GET(request: Request) { return run(request) }
