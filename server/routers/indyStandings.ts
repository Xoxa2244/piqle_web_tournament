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
        // SEASON_TO_DATE: get all days up to today (including DRAFT days that might have completed matchups)
        const today = new Date()
        today.setHours(23, 59, 59, 999)

        matchDays = await ctx.prisma.matchDay.findMany({
          where: {
            tournamentId: input.tournamentId,
            date: { lte: today },
          },
          orderBy: { date: 'asc' },
        })
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
      const calculateStatsForDay = async (matchDayId: string, divisionId: string, teamId: string) => {
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

        let wins = 0
        let losses = 0
        let pointsFor = 0
        let pointsAgainst = 0

        for (const matchup of matchups) {
          // Count completed games (games with both scores)
          const completedGames = matchup.games.filter(
            (g: any) => g.homeScore !== null && g.awayScore !== null
          )
          
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
            } else if (winnerTeamId) {
              losses++
            }
          }
        }

        return { wins, losses, pointsFor, pointsAgainst }
      }

      for (const division of divisions) {
        for (const team of division.teams) {
          let totalWins = 0
          let totalLosses = 0
          let totalPointsFor = 0
          let totalPointsAgainst = 0

          // Calculate stats for each day and sum them up
          for (const matchDay of matchDays) {
            const dayStats = await calculateStatsForDay(matchDay.id, division.id, team.id)
            totalWins += dayStats.wins
            totalLosses += dayStats.losses
            totalPointsFor += dayStats.pointsFor
            totalPointsAgainst += dayStats.pointsAgainst
          }

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

      return standings
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

