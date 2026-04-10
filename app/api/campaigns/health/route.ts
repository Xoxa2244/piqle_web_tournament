import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes — Pro plan required

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

async function runCampaign(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Dry run mode: ?dryRun=true — calculates everything but does NOT send emails
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === 'true'

  const startedAt = new Date()

  try {
    const { runHealthCampaignForAllClubs } = await import('@/lib/ai/campaign-engine')
    const { results, totalSent, totalSkipped } = await runHealthCampaignForAllClubs(prisma, { dryRun })

    return NextResponse.json({
      ok: true,
      dryRun,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      totalClubs: results.length,
      totalSent,
      totalSkipped,
      totalMembersProcessed: results.reduce((sum, r) => sum + r.membersProcessed, 0),
      totalSnapshotsSaved: results.reduce((sum, r) => sum + r.snapshotsSaved, 0),
      clubs: results.map(r => ({
        clubId: r.clubId,
        clubName: r.clubName,
        membersProcessed: r.membersProcessed,
        messagesSent: r.messagesSent,
        messagesSkipped: r.messagesSkipped,
        transitions: r.transitions.length,
        ...((r as any).error ? { error: (r as any).error } : {}),
      })),
    })
  } catch (error: any) {
    log.error('[Campaign] Cron failed:', error)
    return NextResponse.json(
      { error: 'Campaign failed', message: error.message?.slice(0, 200) },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return runCampaign(request)
}

export async function GET(request: Request) {
  return runCampaign(request)
}
