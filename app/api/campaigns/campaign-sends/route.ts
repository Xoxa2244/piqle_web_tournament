import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { processCampaignSendQueue } from '@/lib/ai/advisor-campaign-jobs'

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

async function runCampaignSends(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') || 50)
  const startedAt = new Date()

  try {
    const result = await processCampaignSendQueue(prisma, { limit })
    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ...result,
    })
  } catch (error: any) {
    log.error('[Campaign Sends] Cron failed:', error)
    return NextResponse.json(
      {
        error: 'Campaign sends failed',
        message: error.message?.slice(0, 200),
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return runCampaignSends(request)
}

export async function POST(request: Request) {
  return runCampaignSends(request)
}
