import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ENABLE_DEFERRED_PAYMENTS } from '@/lib/features'
import {
  isDuePaymentsSchemaError,
  releaseExpiredUnpaidRegistrations,
} from '@/server/utils/paymentDue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getAuthorized = (request: Request) => {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return {
      ok: false,
      status: 500,
      error: 'CRON_SECRET is not set',
    }
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) {
    return { ok: true as const }
  }

  return {
    ok: false,
    status: 401,
    error: 'Unauthorized',
  }
}

const processDue = async (request: Request) => {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const now = new Date()
  if (!ENABLE_DEFERRED_PAYMENTS) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Deferred payments are disabled',
      processedAt: now.toISOString(),
      totals: {
        tournaments: 0,
        considered: 0,
        charged: 0,
        failed: 0,
        skippedNoUser: 0,
        skippedNoCard: 0,
        expiredCanceled: 0,
        expiredReleasedPlayers: 0,
      },
      byTournament: {},
    })
  }

  const url = new URL(request.url)
  const tournamentId = url.searchParams.get('tournamentId')?.trim()

  let targetTournamentIds: string[]
  if (tournamentId) {
    targetTournamentIds = [tournamentId]
  } else {
    const dueRows = await prisma.payment.findMany({
      where: {
        status: 'PENDING',
        dueAt: { not: null, lte: now },
        tournament: {
          paymentTiming: 'PAY_BY_DEADLINE',
        },
      },
      select: { tournamentId: true },
      distinct: ['tournamentId'],
      take: 200,
    })
    targetTournamentIds = dueRows.map((row) => row.tournamentId)
  }

  const byTournament: Record<string, any> = {}
  const totals = {
    tournaments: targetTournamentIds.length,
    considered: 0,
    charged: 0,
    failed: 0,
    skippedNoUser: 0,
    skippedNoCard: 0,
    expiredCanceled: 0,
    expiredReleasedPlayers: 0,
  }

  for (const id of targetTournamentIds) {
    const summary = await releaseExpiredUnpaidRegistrations(prisma, id, now)
    byTournament[id] = summary
    totals.considered += summary.considered
    totals.charged += summary.charged
    totals.failed += summary.failed
    totals.skippedNoUser += summary.skippedNoUser
    totals.skippedNoCard += summary.skippedNoCard
    totals.expiredCanceled += summary.expiredCanceled
    totals.expiredReleasedPlayers += summary.expiredReleasedPlayers
  }

  return NextResponse.json({
    ok: true,
    processedAt: now.toISOString(),
    totals,
    byTournament,
  })
}

export async function POST(request: Request) {
  try {
    return await processDue(request)
  } catch (error: any) {
    if (isDuePaymentsSchemaError(error)) {
      return NextResponse.json(
        { error: 'Phase 2 payment schema is not applied yet. Run SQL migration first.' },
        { status: 409 }
      )
    }
    console.error('Failed to process due payments', error)
    return NextResponse.json({ error: 'Failed to process due payments' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
