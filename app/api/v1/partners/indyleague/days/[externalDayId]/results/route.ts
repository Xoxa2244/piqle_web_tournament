import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { getInternalId, getExternalId } from '@/server/utils/externalIdMapping'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ externalDayId: string }> }
) {
  const { externalDayId } = await params
  
  const handler = withPartnerAuth(
    async (req: NextRequest, context) => {
      const divisionExternalId = req.nextUrl.searchParams.get('divisionExternalId')

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

    // Get match day with tournament
    const matchDay = await prisma.matchDay.findUnique({
      where: { id: matchDayId },
      include: {
        tournament: true,
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

    // Get tournament external ID
    const externalTournamentId = await getExternalId(
      context.partnerId,
      'TOURNAMENT',
      matchDay.tournamentId
    )

    if (!externalTournamentId) {
      return NextResponse.json(
        {
          errorCode: 'TOURNAMENT_NOT_MAPPED',
          message: 'Tournament is not mapped for this partner',
          details: [],
        },
        { status: 422 }
      )
    }

    // Build query for matchups
    const matchupWhere: any = {
      matchDayId,
    }

    // Filter by division if provided
    if (divisionExternalId) {
      const divisionId = await getInternalId(
        context.partnerId,
        'DIVISION',
        divisionExternalId
      )

      if (!divisionId) {
        return NextResponse.json(
          {
            errorCode: 'DIVISION_NOT_FOUND',
            message: `Division with external ID ${divisionExternalId} not found`,
            details: [],
          },
          { status: 422 }
        )
      }

      matchupWhere.divisionId = divisionId
    }

    // Get all matchups with games and teams
    const matchups = await prisma.indyMatchup.findMany({
      where: matchupWhere,
      include: {
        division: true,
        homeTeam: true,
        awayTeam: true,
        games: {
          orderBy: { order: 'asc' },
        },
        tieBreakWinnerTeam: true,
      },
    })

    // Get all division external IDs
    const divisionIds = Array.from(new Set(matchups.map(m => m.divisionId)))
    const divisionExternalIdMap = new Map<string, string>()
    for (const divisionId of divisionIds) {
      const extId = await getExternalId(
        context.partnerId,
        'DIVISION',
        divisionId
      )
      if (extId) {
        divisionExternalIdMap.set(divisionId, extId)
      }
    }

    // Get all team external IDs
    const teamIds = new Set<string>()
    matchups.forEach(m => {
      teamIds.add(m.homeTeamId)
      teamIds.add(m.awayTeamId)
    })
    const teamExternalIdMap = new Map<string, string>()
    const teamIdsArray = Array.from(teamIds)
    for (const teamId of teamIdsArray) {
      const extId = await getExternalId(
        context.partnerId,
        'TEAM',
        teamId
      )
      if (extId) {
        teamExternalIdMap.set(teamId, extId)
      }
    }

    // Get all matchup external IDs
    const matchupIds = matchups.map(m => m.id)
    const matchupExternalIdMap = new Map<string, string>()
    for (const matchupId of matchupIds) {
      const extId = await getExternalId(
        context.partnerId,
        'MATCHUP',
        matchupId
      )
      if (extId) {
        matchupExternalIdMap.set(matchupId, extId)
      }
    }

    // Calculate team statistics
    const teamStatsMap = new Map<string, {
      teamId: string
      teamExternalId: string
      teamName: string
      divisionId: string
      divisionExternalId: string
      wins: number
      losses: number
      pf: number
      pa: number
      diff: number
      matchups: Array<{
        externalMatchupId: string
        homeTeamExternalId: string
        awayTeamExternalId: string
        homeGamesWon: number
        awayGamesWon: number
        tieBreakWinnerSide: 'home' | 'away' | null
        status: string
      }>
    }>()

    for (const matchup of matchups) {
      const divisionExternalId = divisionExternalIdMap.get(matchup.divisionId)
      if (!divisionExternalId) continue

      const homeTeamExternalId = teamExternalIdMap.get(matchup.homeTeamId)
      const awayTeamExternalId = teamExternalIdMap.get(matchup.awayTeamId)
      const matchupExternalId = matchupExternalIdMap.get(matchup.id)

      if (!homeTeamExternalId || !awayTeamExternalId || !matchupExternalId) continue

      // Calculate points for this matchup
      let homePointsFor = 0
      let homePointsAgainst = 0
      let awayPointsFor = 0
      let awayPointsAgainst = 0

      for (const game of matchup.games) {
        if (game.homeScore !== null && game.awayScore !== null) {
          homePointsFor += game.homeScore
          homePointsAgainst += game.awayScore
          awayPointsFor += game.awayScore
          awayPointsAgainst += game.homeScore
        }
      }

      // Determine winner
      let winnerTeamId: string | null = null
      if (matchup.gamesWonHome > matchup.gamesWonAway) {
        winnerTeamId = matchup.homeTeamId
      } else if (matchup.gamesWonAway > matchup.gamesWonHome) {
        winnerTeamId = matchup.awayTeamId
      } else if (matchup.gamesWonHome === 6 && matchup.gamesWonAway === 6) {
        // 6-6, use tie-break winner
        winnerTeamId = matchup.tieBreakWinnerTeamId
      }

      // Determine tie-break winner side
      let tieBreakWinnerSide: 'home' | 'away' | null = null
      if (matchup.tieBreakWinnerTeamId) {
        if (matchup.tieBreakWinnerTeamId === matchup.homeTeamId) {
          tieBreakWinnerSide = 'home'
        } else if (matchup.tieBreakWinnerTeamId === matchup.awayTeamId) {
          tieBreakWinnerSide = 'away'
        }
      }

      // Update home team stats
      if (!teamStatsMap.has(matchup.homeTeamId)) {
        teamStatsMap.set(matchup.homeTeamId, {
          teamId: matchup.homeTeamId,
          teamExternalId: homeTeamExternalId,
          teamName: matchup.homeTeam.name,
          divisionId: matchup.divisionId,
          divisionExternalId,
          wins: 0,
          losses: 0,
          pf: 0,
          pa: 0,
          diff: 0,
          matchups: [],
        })
      }

      const homeStats = teamStatsMap.get(matchup.homeTeamId)!
      homeStats.pf += homePointsFor
      homeStats.pa += homePointsAgainst
      if (winnerTeamId === matchup.homeTeamId) {
        homeStats.wins++
      } else if (winnerTeamId === matchup.awayTeamId) {
        homeStats.losses++
      }
      homeStats.matchups.push({
        externalMatchupId: matchupExternalId,
        homeTeamExternalId,
        awayTeamExternalId,
        homeGamesWon: matchup.gamesWonHome,
        awayGamesWon: matchup.gamesWonAway,
        tieBreakWinnerSide,
        status: matchup.status,
      })

      // Update away team stats
      if (!teamStatsMap.has(matchup.awayTeamId)) {
        teamStatsMap.set(matchup.awayTeamId, {
          teamId: matchup.awayTeamId,
          teamExternalId: awayTeamExternalId,
          teamName: matchup.awayTeam.name,
          divisionId: matchup.divisionId,
          divisionExternalId,
          wins: 0,
          losses: 0,
          pf: 0,
          pa: 0,
          diff: 0,
          matchups: [],
        })
      }

      const awayStats = teamStatsMap.get(matchup.awayTeamId)!
      awayStats.pf += awayPointsFor
      awayStats.pa += awayPointsAgainst
      if (winnerTeamId === matchup.awayTeamId) {
        awayStats.wins++
      } else if (winnerTeamId === matchup.homeTeamId) {
        awayStats.losses++
      }
      awayStats.matchups.push({
        externalMatchupId: matchupExternalId,
        homeTeamExternalId,
        awayTeamExternalId,
        homeGamesWon: matchup.gamesWonHome,
        awayGamesWon: matchup.gamesWonAway,
        tieBreakWinnerSide,
        status: matchup.status,
      })
    }

    // Calculate diff for all teams
    teamStatsMap.forEach(stats => {
      stats.diff = stats.pf - stats.pa
    })

    // Convert to array and group by division
    const teamsByDivision = new Map<string, typeof teamStatsMap>()
    teamStatsMap.forEach((stats, teamId) => {
      if (!teamsByDivision.has(stats.divisionExternalId)) {
        teamsByDivision.set(stats.divisionExternalId, new Map())
      }
      teamsByDivision.get(stats.divisionExternalId)!.set(teamId, stats)
    })

    // Build response
    const response: any = {
      externalTournamentId,
      externalDayId,
      generatedAt: new Date().toISOString(),
    }

    if (divisionExternalId) {
      // Single division response
      const divisionStats = teamsByDivision.get(divisionExternalId)
      if (divisionStats) {
        response.divisionExternalId = divisionExternalId
        response.teams = Array.from(divisionStats.values()).map(stats => ({
          teamExternalId: stats.teamExternalId,
          wins: stats.wins,
          losses: stats.losses,
          pf: stats.pf,
          pa: stats.pa,
          diff: stats.diff,
          matchups: stats.matchups,
        }))
      } else {
        response.divisionExternalId = divisionExternalId
        response.teams = []
      }
    } else {
      // All divisions response
      response.divisions = Array.from(teamsByDivision.entries()).map(([divExtId, teams]) => ({
        divisionExternalId: divExtId,
        teams: Array.from(teams.values()).map(stats => ({
          teamExternalId: stats.teamExternalId,
          wins: stats.wins,
          losses: stats.losses,
          pf: stats.pf,
          pa: stats.pa,
          diff: stats.diff,
          matchups: stats.matchups,
        })),
      }))
    }

      return NextResponse.json(response)
    },
    {
      requiredScope: 'indyleague:read',
    }
  )
  
  return handler(req)
}
