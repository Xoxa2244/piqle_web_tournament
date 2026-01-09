import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

export const indyStandingsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({
      tournamentId: z.string(),
      divisionId: z.string().optional(),
      matchDayId: z.string().optional(), // If provided, calculate for this day only
      mode: z.enum(['DAY_ONLY', 'SEASON_TO_DATE']).default('SEASON_TO_DATE'),
    }))
    .query(async ({ ctx, input }) => {
      // Get tournament
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: { format: true },
      })

      if (tournament?.format !== 'INDY_LEAGUE') {
        throw new Error('This endpoint is only for IndyLeague tournaments')
      }

      // Get match days based on mode
      let matchDays: any[] = []
      if (input.mode === 'DAY_ONLY' && input.matchDayId) {
        const matchDay = await ctx.prisma.matchDay.findUnique({
          where: { id: input.matchDayId },
        })
        if (matchDay) {
          matchDays = [matchDay]
        }
      } else {
        // SEASON_TO_DATE: get ALL days (don't filter by date - we want all days with scores)
        matchDays = await ctx.prisma.matchDay.findMany({
          where: {
            tournamentId: input.tournamentId,
          },
          orderBy: { date: 'asc' },
        })
        
        console.log(`[INDY_STANDINGS] SEASON_TO_DATE: Found ${matchDays.length} total match days for tournament ${input.tournamentId}`)
      }

      // Get all teams in division(s)
      const divisionFilter: any = { tournamentId: input.tournamentId }
      if (input.divisionId) {
        divisionFilter.id = input.divisionId
      }

      const divisions = await ctx.prisma.division.findMany({
        where: divisionFilter,
        include: {
          teams: true,
        },
      })

      // Calculate standings for each team
      const standings: Array<{
        teamId: string
        teamName: string
        divisionId: string
        divisionName: string
        wins: number
        losses: number
        pointsFor: number
        pointsAgainst: number
        pointDiff: number
      }> = []

      // Helper function to calculate stats for a single match day
      const calculateStatsForDay = async (matchDayId: string, matchDayDate: Date, divisionId: string, teamId: string) => {
        console.log(`[INDY_STANDINGS] Calculating stats for day ${matchDayId}, date: ${matchDayDate.toISOString()}, division: ${divisionId}, team: ${teamId}`)
        
        const matchups = await ctx.prisma.indyMatchup.findMany({
          where: {
            matchDayId: matchDayId,
            divisionId: divisionId,
            OR: [
              { homeTeamId: teamId },
              { awayTeamId: teamId },
            ],
          },
          include: {
            games: true,
          },
        })

        console.log(`[INDY_STANDINGS] Found ${matchups.length} matchups for day ${matchDayId}, team ${teamId}`)

        let wins = 0
        let losses = 0
        let pointsFor = 0
        let pointsAgainst = 0

        for (const matchup of matchups) {
          // Count completed games (games with both scores)
          const completedGames = matchup.games.filter(
            (g: any) => g.homeScore !== null && g.awayScore !== null
          )
          
          console.log(`[INDY_STANDINGS] Matchup ${matchup.id}: total games: ${matchup.games.length}, completed games: ${completedGames.length}`)
          
          // If no games have scores, skip this matchup
          if (completedGames.length === 0) continue

          // Calculate games won by each team from actual game scores
          let gamesWonHome = 0
          let gamesWonAway = 0
          
          for (const game of completedGames) {
            if (game.homeScore === null || game.awayScore === null) continue
            
            if (game.homeScore > game.awayScore) {
              gamesWonHome++
            } else if (game.awayScore > game.homeScore) {
              gamesWonAway++
            }
          }

          // Calculate points for this matchup (only from completed games)
          let teamPointsFor = 0
          let teamPointsAgainst = 0

          for (const game of completedGames) {
            if (game.homeScore === null || game.awayScore === null) continue
            
            if (matchup.homeTeamId === teamId) {
              teamPointsFor += game.homeScore
              teamPointsAgainst += game.awayScore
            } else if (matchup.awayTeamId === teamId) {
              teamPointsFor += game.awayScore
              teamPointsAgainst += game.homeScore
            }
          }

          pointsFor += teamPointsFor
          pointsAgainst += teamPointsAgainst

          console.log(`[INDY_STANDINGS] Matchup ${matchup.id}: gamesWonHome=${gamesWonHome}, gamesWonAway=${gamesWonAway}, teamPointsFor=${teamPointsFor}, teamPointsAgainst=${teamPointsAgainst}`)

          // Determine winner only if all games are completed (12 games total)
          const allGamesCompleted = matchup.games.length > 0 && 
            matchup.games.length === completedGames.length
          
          if (allGamesCompleted) {
            let winnerTeamId: string | null = null
            if (gamesWonHome > gamesWonAway) {
              winnerTeamId = matchup.homeTeamId
            } else if (gamesWonAway > gamesWonHome) {
              winnerTeamId = matchup.awayTeamId
            } else if (gamesWonHome === 6 && gamesWonAway === 6) {
              winnerTeamId = matchup.tieBreakWinnerTeamId
            }

            if (winnerTeamId === teamId) {
              wins++
              console.log(`[INDY_STANDINGS] Matchup ${matchup.id}: Team ${teamId} WON`)
            } else if (winnerTeamId) {
              losses++
              console.log(`[INDY_STANDINGS] Matchup ${matchup.id}: Team ${teamId} LOST`)
            }
          }
        }

        console.log(`[INDY_STANDINGS] Day ${matchDayId} stats: wins=${wins}, losses=${losses}, pointsFor=${pointsFor}, pointsAgainst=${pointsAgainst}`)
        return { wins, losses, pointsFor, pointsAgainst }
      }

      console.log(`[INDY_STANDINGS] Mode: ${input.mode}, Found ${matchDays.length} match days`)
      matchDays.forEach((md: any, idx: number) => {
        console.log(`[INDY_STANDINGS] MatchDay ${idx + 1}: id=${md.id}, date=${md.date}, status=${md.status}`)
      })

      for (const division of divisions) {
        console.log(`[INDY_STANDINGS] Processing division: ${division.id} (${division.name})`)
        for (const team of division.teams) {
          console.log(`[INDY_STANDINGS] Processing team: ${team.id} (${team.name})`)
          let totalWins = 0
          let totalLosses = 0
          let totalPointsFor = 0
          let totalPointsAgainst = 0

          // Calculate stats for each day and sum them up
          for (const matchDay of matchDays) {
            const dayStats = await calculateStatsForDay(matchDay.id, matchDay.date, division.id, team.id)
            totalWins += dayStats.wins
            totalLosses += dayStats.losses
            totalPointsFor += dayStats.pointsFor
            totalPointsAgainst += dayStats.pointsAgainst
            console.log(`[INDY_STANDINGS] Team ${team.id} after day ${matchDay.id}: totalWins=${totalWins}, totalLosses=${totalLosses}, totalPointsFor=${totalPointsFor}, totalPointsAgainst=${totalPointsAgainst}`)
          }
          
          console.log(`[INDY_STANDINGS] Team ${team.id} FINAL stats: wins=${totalWins}, losses=${totalLosses}, pointsFor=${totalPointsFor}, pointsAgainst=${totalPointsAgainst}`)

          standings.push({
            teamId: team.id,
            teamName: team.name,
            divisionId: division.id,
            divisionName: division.name,
            wins: totalWins,
            losses: totalLosses,
            pointsFor: totalPointsFor,
            pointsAgainst: totalPointsAgainst,
            pointDiff: totalPointsFor - totalPointsAgainst,
          })
        }
      }

      // Sort by wins (desc), then point diff (desc)
      standings.sort((a, b) => {
        if (b.wins !== a.wins) {
          return b.wins - a.wins
        }
        return b.pointDiff - a.pointDiff
      })

      // Debug: log final standings
      console.log(`[INDY_STANDINGS] FINAL standings for mode ${input.mode}:`, JSON.stringify(standings, null, 2))

      // Return standings with debug info
      return {
        standings,
        debug: {
          mode: input.mode,
          matchDaysCount: matchDays.length,
          matchDays: matchDays.map((md: any) => ({
            id: md.id,
            date: md.date,
            status: md.status,
          })),
          divisionsCount: divisions.length,
          teamsCount: divisions.reduce((sum: number, d: any) => sum + d.teams.length, 0),
        },
      } as any
    }),

  calculate: protectedProcedure
    .input(z.object({
      tournamentId: z.string(),
      divisionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // This is the same as get, but as a mutation for explicit recalculation
      // In the future, we might want to cache standings or trigger recalculation
      // For now, standings are calculated on-the-fly in get query
      return { success: true, message: 'Standings are calculated on-the-fly' }
    }),
})

