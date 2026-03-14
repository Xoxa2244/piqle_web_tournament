import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

async function runWeeklySummary(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()

  try {
    const { generateWeeklySummariesForAllClubs } = await import('@/lib/ai/weekly-summary')
    const stats = await generateWeeklySummariesForAllClubs(prisma)

    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ...stats,
    })
  } catch (error: any) {
    console.error('[WeeklySummary] Cron failed:', error)
    return NextResponse.json(
      { error: 'Weekly summary generation failed', message: error.message?.slice(0, 200) },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return runWeeklySummary(request)
}

export async function GET(request: Request) {
  return runWeeklySummary(request)
}
