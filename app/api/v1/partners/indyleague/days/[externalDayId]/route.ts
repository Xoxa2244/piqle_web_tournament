import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { getInternalId } from '@/server/utils/externalIdMapping'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ externalDayId: string }> }
) {
  const { externalDayId } = await params
  
  return withPartnerAuth(
    async (req: NextRequest, context) => {

    if (!externalDayId) {
      return NextResponse.json(
        {
          errorCode: 'INVALID_REQUEST',
          message: 'externalDayId is required',
          details: [],
        },
        { status: 400 }
      )
    }

    // Get match day internal ID
    const matchDayId = await getInternalId(
      context.partnerId,
      'MATCH_DAY',
      externalDayId
    )

    if (!matchDayId) {
      return NextResponse.json(
        {
          errorCode: 'MATCH_DAY_NOT_FOUND',
          message: `Match day with external ID ${externalDayId} not found`,
          details: [],
        },
        { status: 404 }
      )
    }

    // Get match day with matchups
    const matchDay = await prisma.matchDay.findUnique({
      where: { id: matchDayId },
      include: {
        matchups: {
          include: {
            games: true,
          },
        },
      },
    })

    if (!matchDay) {
      return NextResponse.json(
        {
          errorCode: 'MATCH_DAY_NOT_FOUND',
          message: 'Match day not found',
          details: [],
        },
        { status: 404 }
      )
    }

    // Calculate completion statistics
    const totalMatchups = matchDay.matchups.length
    let completedMatchups = 0
    let matchupsRequiringTieBreak = 0
    let matchupsWithMissingScores = 0

    for (const matchup of matchDay.matchups) {
      // Check if matchup is completed
      if (matchup.status === 'COMPLETED') {
        completedMatchups++
      }

      // Check if tie-break is required (6-6 games but no tie-break winner)
      if (
        matchup.gamesWonHome === 6 &&
        matchup.gamesWonAway === 6 &&
        !matchup.tieBreakWinnerTeamId
      ) {
        matchupsRequiringTieBreak++
      }

      // Check for missing scores
      const totalGames = matchup.games.length
      const gamesWithScores = matchup.games.filter(
        g => g.homeScore !== null && g.awayScore !== null
      ).length

      if (gamesWithScores < totalGames && totalGames > 0) {
        matchupsWithMissingScores++
      }
    }

    // Map status
    let status: 'draft' | 'in_progress' | 'finalized'
    if (matchDay.status === 'DRAFT') {
      status = 'draft'
    } else if (matchDay.status === 'IN_PROGRESS') {
      status = 'in_progress'
    } else {
      status = 'finalized'
    }

    return NextResponse.json({
      status,
      completion: {
        totalMatchups,
        completedMatchups,
        matchupsRequiringTieBreak,
        matchupsWithMissingScores,
      },
      lastUpdatedAt: matchDay.updatedAt.toISOString(),
    })
  },
  {
    requiredScope: 'indyleague:read',
  }
)

