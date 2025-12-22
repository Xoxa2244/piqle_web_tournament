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
        // SEASON_TO_DATE: get all finalized and in-progress days up to today
        const today = new Date()
        today.setHours(23, 59, 59, 999)

        matchDays = await ctx.prisma.matchDay.findMany({
          where: {
            tournamentId: input.tournamentId,
            date: { lte: today },
            status: { in: ['IN_PROGRESS', 'FINALIZED'] },
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

      for (const division of divisions) {
        for (const team of division.teams) {
          let wins = 0
          let losses = 0
          let pointsFor = 0
          let pointsAgainst = 0

          // Get all matchups for this team in the selected match days
          for (const matchDay of matchDays) {
            const matchups = await ctx.prisma.indyMatchup.findMany({
              where: {
                matchDayId: matchDay.id,
                divisionId: division.id,
                OR: [
                  { homeTeamId: team.id },
                  { awayTeamId: team.id },
                ],
                status: 'COMPLETED',
              },
              include: {
                games: true,
              },
            })

            for (const matchup of matchups) {
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

              if (!winnerTeamId) continue

              // Calculate points for this matchup
              let teamPointsFor = 0
              let teamPointsAgainst = 0

              for (const game of matchup.games) {
                if (game.homeScore !== null && game.awayScore !== null) {
                  if (matchup.homeTeamId === team.id) {
                    teamPointsFor += game.homeScore
                    teamPointsAgainst += game.awayScore
                  } else if (matchup.awayTeamId === team.id) {
                    teamPointsFor += game.awayScore
                    teamPointsAgainst += game.homeScore
                  }
                }
              }

              pointsFor += teamPointsFor
              pointsAgainst += teamPointsAgainst

              // Update wins/losses
              if (winnerTeamId === team.id) {
                wins++
              } else {
                losses++
              }
            }
          }

          standings.push({
            teamId: team.id,
            teamName: team.name,
            divisionId: division.id,
            divisionName: division.name,
            wins,
            losses,
            pointsFor,
            pointsAgainst,
            pointDiff: pointsFor - pointsAgainst,
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

