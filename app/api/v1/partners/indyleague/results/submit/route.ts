import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { getInternalId, getExternalId } from '@/server/utils/externalIdMapping'
import { sendPartnerWebhookForPartner } from '@/server/utils/partnerWebhooks'
import { z } from 'zod'

const gameScoreSchema = z.object({
  gameOrder: z.number().int().min(1).max(12),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
})

const submitResultsSchema = z.object({
  externalMatchupId: z.string(),
  games: z.array(gameScoreSchema).min(1).max(12),
  tieBreakWinnerSide: z.enum(['home', 'away']).optional(),
})

async function recalculateGamesWon(matchupId: string) {
  const games = await prisma.indyGame.findMany({
    where: { matchupId },
  })

  let gamesWonHome = 0
  let gamesWonAway = 0

  for (const game of games) {
    if (game.homeScore !== null && game.awayScore !== null) {
      if (game.homeScore > game.awayScore) {
        gamesWonHome++
      } else if (game.awayScore > game.homeScore) {
        gamesWonAway++
      }
    }
  }

  await prisma.indyMatchup.update({
    where: { id: matchupId },
    data: { gamesWonHome, gamesWonAway },
  })

  return { gamesWonHome, gamesWonAway }
}

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = submitResultsSchema.parse(body)

    const matchupId = await getInternalId(
      context.partnerId,
      'MATCHUP',
      validated.externalMatchupId
    )

    if (!matchupId) {
      return NextResponse.json(
        {
          errorCode: 'MATCHUP_NOT_FOUND',
          message: `Matchup with external ID ${validated.externalMatchupId} not found`,
          details: [],
        },
        { status: 404 }
      )
    }

    const matchup = await prisma.indyMatchup.findUnique({
      where: { id: matchupId },
      include: {
        matchDay: { select: { id: true, tournamentId: true } },
        games: { orderBy: { order: 'asc' as const } },
      },
    })

    if (!matchup) {
      return NextResponse.json(
        {
          errorCode: 'MATCHUP_NOT_FOUND',
          message: 'Matchup not found in database',
          details: [],
        },
        { status: 404 }
      )
    }

    if (matchup.status === 'COMPLETED') {
      return NextResponse.json(
        {
          errorCode: 'MATCHUP_COMPLETED',
          message: 'Cannot update results for a completed matchup',
          details: [],
        },
        { status: 422 }
      )
    }

    if (matchup.games.length === 0) {
      return NextResponse.json(
        {
          errorCode: 'GAMES_NOT_GENERATED',
          message: 'Games have not been generated for this matchup yet. Generate games first.',
          details: [],
        },
        { status: 422 }
      )
    }

    const gamesByOrder = new Map(matchup.games.map(g => [g.order, g]))
    const errors: Array<{ gameOrder: number; error: string }> = []
    const updated: Array<{ gameOrder: number; homeScore: number; awayScore: number }> = []

    for (const gameInput of validated.games) {
      const game = gamesByOrder.get(gameInput.gameOrder)

      if (!game) {
        errors.push({
          gameOrder: gameInput.gameOrder,
          error: `Game with order ${gameInput.gameOrder} not found`,
        })
        continue
      }

      if (gameInput.homeScore === gameInput.awayScore) {
        errors.push({
          gameOrder: gameInput.gameOrder,
          error: 'Tied scores are not allowed',
        })
        continue
      }

      await prisma.indyGame.update({
        where: { id: game.id },
        data: {
          homeScore: gameInput.homeScore,
          awayScore: gameInput.awayScore,
        },
      })

      updated.push({
        gameOrder: gameInput.gameOrder,
        homeScore: gameInput.homeScore,
        awayScore: gameInput.awayScore,
      })
    }

    const { gamesWonHome, gamesWonAway } = await recalculateGamesWon(matchupId)

    if (validated.tieBreakWinnerSide) {
      if (gamesWonHome === 6 && gamesWonAway === 6) {
        const winnerTeamId =
          validated.tieBreakWinnerSide === 'home'
            ? matchup.homeTeamId
            : matchup.awayTeamId

        await prisma.indyMatchup.update({
          where: { id: matchupId },
          data: { tieBreakWinnerTeamId: winnerTeamId },
        })
      } else {
        errors.push({
          gameOrder: 0,
          error: `tieBreakWinnerSide ignored: score is ${gamesWonHome}-${gamesWonAway}, not 6-6`,
        })
      }
    }

    if (matchup.status === 'PENDING' && updated.length > 0) {
      await prisma.indyMatchup.update({
        where: { id: matchupId },
        data: { status: 'IN_PROGRESS' },
      })
    }

    const externalTournamentId = await getExternalId(
      context.partnerId,
      'TOURNAMENT',
      matchup.matchDay.tournamentId
    )

    if (externalTournamentId) {
      await sendPartnerWebhookForPartner(
        prisma,
        context.partnerId,
        externalTournamentId,
        'results.updated',
        { matchDayId: matchup.matchDay.id, matchupId }
      )
    }

    return NextResponse.json({
      externalMatchupId: validated.externalMatchupId,
      gamesUpdated: updated.length,
      gamesWonHome,
      gamesWonAway,
      status: matchup.status === 'PENDING' && updated.length > 0 ? 'IN_PROGRESS' : matchup.status,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    })
  },
  {
    requiredScope: 'indyleague:write',
    requireIdempotency: true,
  }
)
