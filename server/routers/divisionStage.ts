import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const divisionStageRouter = createTRPCRouter({
  getDivisionStage: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        select: {
          id: true,
          name: true,
          stage: true,
          teams: {
            select: { id: true, name: true, poolId: true }
          },
          pools: {
            select: { id: true, name: true, order: true }
          },
          matches: {
            include: {
              teamA: {
                include: {
                  pool: true
                }
              },
              teamB: {
                include: {
                  pool: true
                }
              },
              games: true,
            },
            select: {
              id: true,
              teamAId: true,
              teamBId: true,
              roundIndex: true,
              stage: true,
              note: true,
              teamA: {
                include: {
                  pool: true
                }
              },
              teamB: {
                include: {
                  pool: true
                }
              },
              games: true,
            },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      return division
    }),

  transitionToNextStage: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: true,
          matches: {
            include: {
              teamA: {
                include: {
                  pool: true
                }
              },
              teamB: {
                include: {
                  pool: true
                }
              },
              games: true,
            },
          },
          tournament: { select: { id: true } },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const currentStage = division.stage
      let nextStage: string
      let matchesToCreate: any[] = []

      // State machine transitions
      switch (currentStage) {
        case 'RR_IN_PROGRESS':
          // Check if RR is complete
          const rrMatches = division.matches.filter(m => m.stage === 'ROUND_ROBIN')
          const completedRRMatches = rrMatches.filter(m => 
            m.games.length > 0 && m.games.some(g => g.scoreA > 0 || g.scoreB > 0)
          )

          if (completedRRMatches.length !== rrMatches.length) {
            throw new Error('Round Robin is not complete. Please enter all RR results.')
          }

          // Calculate standings
          const standings = await calculateStandings(division.teams, rrMatches)
          const N = standings.length
          const B = division.maxTeams || Math.min(16, N)

          if (B < N && N < 2 * B) {
            // Need play-in
            const E = N - B
            const playInTeams = standings.slice(N - 2 * E)
            const autoQualified = standings.slice(0, N - 2 * E)

            // Generate play-in matches
            matchesToCreate = generatePlayInMatches(playInTeams)
            nextStage = 'PLAY_IN_SCHEDULED'
          } else {
            // Direct playoffs
            matchesToCreate = generatePlayoffMatches(standings, 0)
            nextStage = 'PO_R1_SCHEDULED'
          }
          break

        case 'PLAY_IN_COMPLETE':
          // Generate playoff R1 with play-in winners
          const playInMatches = division.matches.filter(m => m.stage === 'PLAY_IN')
          const playInWinners = await getPlayInWinners(playInMatches, division.teams)
          
          // Get auto-qualified teams
          const rrMatchesForStandings = division.matches.filter(m => m.stage === 'ROUND_ROBIN')
          const standingsForPlayoffs = await calculateStandings(division.teams, rrMatchesForStandings)
          const N2 = standingsForPlayoffs.length
          const B2 = division.maxTeams || Math.min(16, N2)
          const E2 = N2 - B2
          const autoQualified2 = standingsForPlayoffs.slice(0, N2 - 2 * E2)

          // Combine auto-qualified and play-in winners
          const allQualified = [...autoQualified2, ...playInWinners]
          matchesToCreate = generatePlayoffMatches(allQualified, 0)
          nextStage = 'PO_R1_SCHEDULED'
          break

        case 'PO_R1_COMPLETE':
        case 'PO_R2_COMPLETE':
        case 'PO_R3_COMPLETE':
          // Generate next playoff round
          const currentRound = parseInt(currentStage.split('_')[1].replace('R', ''))
          const nextRound = currentRound + 1
          const playoffMatches = division.matches.filter(m => m.stage === 'ELIMINATION')
          const currentRoundMatches = playoffMatches.filter(m => m.roundIndex === currentRound - 1)
          const winners = await getPlayoffWinners(currentRoundMatches, division.teams)

          if (winners.length === 1) {
            nextStage = 'DIVISION_COMPLETE'
          } else if (winners.length === 2) {
            matchesToCreate = generatePlayoffMatches(winners, nextRound - 1)
            nextStage = 'FINAL_SCHEDULED'
          } else {
            matchesToCreate = generatePlayoffMatches(winners, nextRound - 1)
            nextStage = `PO_R${nextRound}_SCHEDULED`
          }
          break

        case 'FINAL_COMPLETE':
          nextStage = 'DIVISION_COMPLETE'
          break

        default:
          throw new Error(`Invalid transition from stage: ${currentStage}`)
      }

      // Create matches if needed
      if (matchesToCreate.length > 0) {
        await Promise.all(
          matchesToCreate.map(match =>
            ctx.prisma.match.create({
              data: {
                divisionId: input.divisionId,
                teamAId: match.teamAId,
                teamBId: match.teamBId,
                roundIndex: match.roundIndex,
                stage: match.stage,
                bestOfMode: 'FIXED_GAMES',
                gamesCount: 1,
                targetPoints: 11,
                winBy: 2,
                locked: false,
              },
            })
          )
        )
      }

      // Update division stage
      await ctx.prisma.division.update({
        where: { id: input.divisionId },
        data: { stage: nextStage as any },
      })

      // Log the transition
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournament.id,
          action: 'STAGE_TRANSITION',
          entityType: 'Division',
          entityId: input.divisionId,
          payload: {
            fromStage: currentStage,
            toStage: nextStage,
            matchesCreated: matchesToCreate.length,
          },
        },
      })

      return {
        newStage: nextStage,
        matchesCreated: matchesToCreate.length,
      }
    }),

  updateMatchResult: tdProcedure
    .input(z.object({
      matchId: z.string(),
      scoreA: z.number(),
      scoreB: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Update game score
      const match = await ctx.prisma.match.findUnique({
        where: { id: input.matchId },
        include: {
          division: true,
          games: true,
        },
      })

      if (!match) {
        throw new Error('Match not found')
      }

      // Create or update game
      if (match.games.length === 0) {
        await ctx.prisma.game.create({
          data: {
            matchId: input.matchId,
            index: 0,
            scoreA: input.scoreA,
            scoreB: input.scoreB,
            winner: input.scoreA > input.scoreB ? 'A' : input.scoreB > input.scoreA ? 'B' : null,
          },
        })
      } else {
        await ctx.prisma.game.update({
          where: { id: match.games[0].id },
          data: {
            scoreA: input.scoreA,
            scoreB: input.scoreB,
            winner: input.scoreA > input.scoreB ? 'A' : input.scoreB > input.scoreA ? 'B' : null,
          },
        })
      }

      // Check if this completes the current stage
      if (!match.divisionId) {
        return { success: true }
      }

      const division = await ctx.prisma.division.findUnique({
        where: { id: match.divisionId },
        include: {
          matches: {
            include: { games: true },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const currentStageMatches = division.matches.filter(m => {
        if (division.stage.startsWith('RR_')) return m.stage === 'ROUND_ROBIN'
        if (division.stage.startsWith('PLAY_IN_')) return m.stage === 'PLAY_IN'
        if (division.stage.startsWith('PO_') || division.stage.startsWith('FINAL_')) {
          return m.stage === 'ELIMINATION'
        }
        return false
      })

      const completedMatches = currentStageMatches.filter(m => 
        m.games.length > 0 && m.games.some(g => g.scoreA > 0 || g.scoreB > 0)
      )

      // If all matches in current stage are complete, trigger transition
      if (completedMatches.length === currentStageMatches.length) {
        // Update stage to indicate completion
        let completedStage = division.stage
        if (completedStage.endsWith('_SCHEDULED')) {
          completedStage = completedStage.replace('_SCHEDULED', '_COMPLETE') as any
        } else if (completedStage.endsWith('_IN_PROGRESS')) {
          completedStage = completedStage.replace('_IN_PROGRESS', '_COMPLETE') as any
        }

        await ctx.prisma.division.update({
          where: { id: match.divisionId },
          data: { stage: completedStage as any },
        })
      }

      return { success: true }
    }),
})

// Helper functions
async function calculateStandings(teams: any[], matches: any[]) {
  const teamStats: Map<string, any> = new Map()
  
  teams.forEach(team => {
    teamStats.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
    })
  })

  matches.forEach(match => {
    const teamAStats = teamStats.get(match.teamAId)
    const teamBStats = teamStats.get(match.teamBId)
    
    if (!teamAStats || !teamBStats) return

    let teamAPoints = 0
    let teamBPoints = 0
    
    match.games.forEach((game: any) => {
      teamAPoints += game.scoreA
      teamBPoints += game.scoreB
    })

    teamAStats.pointsFor += teamAPoints
    teamAStats.pointsAgainst += teamBPoints
    teamBStats.pointsFor += teamBPoints
    teamBStats.pointsAgainst += teamAPoints

    if (teamAPoints > teamBPoints) {
      teamAStats.wins += 1
      teamBStats.losses += 1
    } else if (teamBPoints > teamAPoints) {
      teamBStats.wins += 1
      teamAStats.losses += 1
    }
  })

  teamStats.forEach(stats => {
    stats.pointDiff = stats.pointsFor - stats.pointsAgainst
  })

  return Array.from(teamStats.values()).sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins
    return b.pointDiff - a.pointDiff
  })
}

function generatePlayInMatches(teams: any[]) {
  const matches = []
  const E = teams.length / 2

  for (let i = 0; i < E; i++) {
    matches.push({
      teamAId: teams[i].teamId,
      teamBId: teams[teams.length - 1 - i].teamId,
      roundIndex: 0,
      stage: 'PLAY_IN',
    })
  }

  return matches
}

function generatePlayoffMatches(teams: any[], startRound: number) {
  const matches = []
  const B = teams.length

  for (let i = 0; i < B / 2; i++) {
    matches.push({
      teamAId: teams[i].teamId,
      teamBId: teams[B - 1 - i].teamId,
      roundIndex: startRound,
      stage: 'ELIMINATION',
    })
  }

  return matches
}

async function getPlayInWinners(playInMatches: any[], teams: any[]) {
  const winners = []
  
  for (const match of playInMatches) {
    if (match.games.length > 0) {
      const totalScoreA = match.games.reduce((sum: number, game: any) => sum + game.scoreA, 0)
      const totalScoreB = match.games.reduce((sum: number, game: any) => sum + game.scoreB, 0)
      
      if (totalScoreA > totalScoreB) {
        winners.push(teams.find(t => t.id === match.teamAId))
      } else if (totalScoreB > totalScoreA) {
        winners.push(teams.find(t => t.id === match.teamBId))
      }
    }
  }
  
  return winners.filter(Boolean)
}

async function getPlayoffWinners(roundMatches: any[], teams: any[]) {
  const winners = []
  
  for (const match of roundMatches) {
    if (match.games.length > 0) {
      const totalScoreA = match.games.reduce((sum: number, game: any) => sum + game.scoreA, 0)
      const totalScoreB = match.games.reduce((sum: number, game: any) => sum + game.scoreB, 0)
      
      if (totalScoreA > totalScoreB) {
        winners.push(teams.find(t => t.id === match.teamAId))
      } else if (totalScoreB > totalScoreA) {
        winners.push(teams.find(t => t.id === match.teamBId))
      }
    }
  }
  
  return winners.filter(Boolean)
}
