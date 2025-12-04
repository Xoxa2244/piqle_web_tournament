import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import {
  assertDivisionAdmin,
  assertDivisionScoreAccess,
  checkDivisionAccess,
} from '../utils/access'

export const divisionStageRouter = createTRPCRouter({
  getDivisionStage: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check if user has access to this division
      const { hasAccess } = await checkDivisionAccess(ctx.prisma, ctx.session.user.id, input.divisionId)
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'No access to this division',
        })
      }

      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: {
            include: {
              teamPlayers: {
                include: {
                  player: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
          pools: true,
          matches: {
            include: {
              teamA: {
                include: {
                  pool: true,
                  teamPlayers: {
                    include: {
                      player: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true
                        }
                      }
                    }
                  }
                }
              },
              teamB: {
                include: {
                  pool: true,
                  teamPlayers: {
                    include: {
                      player: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true
                        }
                      }
                    }
                  }
                }
              },
              games: {
                orderBy: { index: 'asc' },
              },
              tiebreaker: true,
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
      // Check admin access (only admins can transition stages)
      await assertDivisionAdmin(ctx.prisma, ctx.session.user.id, input.divisionId)

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
              tiebreaker: true,
            },
          },
          tournament: { select: { id: true, format: true } },
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
          const isMLP = division.tournament?.format === 'MLP'
          
          const completedRRMatches = rrMatches.filter(m => {
            if (!m.games || m.games.length === 0) return false
            
            // For MLP matches, check if all 4 games are completed
            const matchGamesCount = m.gamesCount || m.games.length
            const isMLPMatch = isMLP && matchGamesCount === 4
            
            if (isMLPMatch) {
              // MLP: match is completed if:
              // 1. There is a winnerTeamId (either directly or through tiebreaker), OR
              // 2. All 4 games are completed and score is NOT 2-2 (i.e., 3-1 or 4-0)
              
              // Check if winner is determined (either directly or through tiebreaker)
              const hasWinner = m.winnerTeamId !== null && m.winnerTeamId !== undefined
              const hasTiebreakerWinner = m.tiebreaker && m.tiebreaker.winnerTeamId !== null && m.tiebreaker.winnerTeamId !== undefined
              
              if (hasWinner || hasTiebreakerWinner) {
                // Match has a winner - it's completed
                return true
              }
              
              // If no winner yet, check if all 4 games are completed and count wins
              if (m.games.length !== 4) return false
              const allGamesCompleted = m.games.every(g => 
                g.scoreA !== null && 
                g.scoreA !== undefined && 
                g.scoreB !== null && 
                g.scoreB !== undefined &&
                g.scoreA >= 0 &&
                g.scoreB >= 0 &&
                g.scoreA !== g.scoreB  // Games should not be tied
              )
              
              if (!allGamesCompleted) {
                // Not all games completed yet
                return false
              }
              
              // Count games won by each team
              let teamAWins = 0
              let teamBWins = 0
              for (const game of m.games) {
                if (game.winner === 'A') {
                  teamAWins++
                } else if (game.winner === 'B') {
                  teamBWins++
                } else {
                  if (game.scoreA !== null && game.scoreB !== null) {
                    if (game.scoreA > game.scoreB) {
                      teamAWins++
                    } else if (game.scoreB > game.scoreA) {
                      teamBWins++
                    }
                  }
                }
              }
              
              // If score is 3-1 or 4-0, match is completed (winner can be determined from games)
              if (teamAWins >= 3 || teamBWins >= 3) {
                return true
              }
              
              // If score is 2-2, match is NOT completed until tiebreaker is played
              if (teamAWins === 2 && teamBWins === 2) {
                return false
              }
              
              // Invalid state (should not happen)
              return false
            } else {
              // Non-MLP: at least one game with non-zero score
              return m.games.some(g => 
                (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) || 
                (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0)
              )
            }
          })

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

  updateMatchResult: protectedProcedure
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
          division: {
            include: {
              tournament: {
                select: { format: true },
              },
            },
          },
          games: true,
          teamA: {
            select: { id: true },
          },
          teamB: {
            select: { id: true },
          },
        },
      })

      if (!match) {
        throw new Error('Match not found')
      }

      if (match.locked) {
        throw new Error('This match is locked and cannot be edited. Regenerate Round Robin to reset results.')
      }

      // Check score entry access to division
      if (match.divisionId) {
        await assertDivisionScoreAccess(ctx.prisma, ctx.session.user.id, match.divisionId)
      }

      // Check if this is an MLP tournament
      const isMLP = match.division?.tournament?.format === 'MLP'

      // Calculate winner from scores
      const gameWinner: 'A' | 'B' | null = input.scoreA > input.scoreB ? 'A' : input.scoreB > input.scoreA ? 'B' : null

      // Create or update game
      if (match.games.length === 0) {
        await ctx.prisma.game.create({
          data: {
            matchId: input.matchId,
            index: 0,
            scoreA: input.scoreA,
            scoreB: input.scoreB,
            winner: gameWinner,
          },
        })
      } else {
        await ctx.prisma.game.update({
          where: { id: match.games[0].id },
          data: {
            scoreA: input.scoreA,
            scoreB: input.scoreB,
            winner: gameWinner,
          },
        })
      }

      // For MLP tournaments, winner is determined by updateGameScore after all 4 games are completed
      // For non-MLP tournaments, update winner immediately based on single game
      if (!isMLP) {
        // Update match winner based on game result (only for non-MLP)
        await ctx.prisma.match.update({
          where: { id: input.matchId },
          data: {
            winnerTeamId: gameWinner === 'A' ? match.teamA.id : 
                          gameWinner === 'B' ? match.teamB.id : null,
          },
        })
      }
      // For MLP: winnerTeamId will be set by updateGameScore after all 4 games are completed

      // Check if this completes the current stage
      if (!match.divisionId) {
        return { success: true }
      }

      const division = await ctx.prisma.division.findUnique({
        where: { id: match.divisionId },
        include: {
          matches: {
            include: { 
              games: true,
              tiebreaker: true,
            },
          },
          tournament: { select: { format: true } },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const currentStageMatches = division.matches.filter(m => {
        if (!division.stage) return false
        if (division.stage.startsWith('RR_')) return m.stage === 'ROUND_ROBIN'
        if (division.stage.startsWith('PLAY_IN_')) return m.stage === 'PLAY_IN'
        if (division.stage.startsWith('PO_') || division.stage.startsWith('FINAL_')) {
          return m.stage === 'ELIMINATION'
        }
        return false
      })

      // Use the same completion logic as in transitionToNextStage
      const isMLP = division.tournament?.format === 'MLP'
      
      const completedMatches = currentStageMatches.filter(m => {
        if (!m.games || m.games.length === 0) return false
        
        // For MLP matches, check if all 4 games are completed
        const matchGamesCount = m.gamesCount || m.games.length
        const isMLPMatch = isMLP && matchGamesCount === 4
        
        if (isMLPMatch) {
          // MLP: match is completed if:
          // 1. There is a winnerTeamId (either directly or through tiebreaker), OR
          // 2. All 4 games are completed and score is NOT 2-2 (i.e., 3-1 or 4-0)
          
          // Check if winner is determined (either directly or through tiebreaker)
          const hasWinner = m.winnerTeamId !== null && m.winnerTeamId !== undefined
          const hasTiebreakerWinner = m.tiebreaker && m.tiebreaker.winnerTeamId !== null && m.tiebreaker.winnerTeamId !== undefined
          
          if (hasWinner || hasTiebreakerWinner) {
            // Match has a winner - it's completed
            return true
          }
          
          // If no winner yet, check if all 4 games are completed and count wins
          if (m.games.length !== 4) return false
          const allGamesCompleted = m.games.every(g => 
            g.scoreA !== null && 
            g.scoreA !== undefined && 
            g.scoreB !== null && 
            g.scoreB !== undefined &&
            g.scoreA >= 0 &&
            g.scoreB >= 0 &&
            g.scoreA !== g.scoreB  // Games should not be tied
          )
          
          if (!allGamesCompleted) {
            // Not all games completed yet
            return false
          }
          
          // Count games won by each team
          let teamAWins = 0
          let teamBWins = 0
          for (const game of m.games) {
            if (game.winner === 'A') {
              teamAWins++
            } else if (game.winner === 'B') {
              teamBWins++
            } else {
              if (game.scoreA !== null && game.scoreB !== null) {
                if (game.scoreA > game.scoreB) {
                  teamAWins++
                } else if (game.scoreB > game.scoreA) {
                  teamBWins++
                }
              }
            }
          }
          
          // If score is 3-1 or 4-0, match is completed (winner can be determined from games)
          if (teamAWins >= 3 || teamBWins >= 3) {
            return true
          }
          
          // If score is 2-2, match is NOT completed until tiebreaker is played
          if (teamAWins === 2 && teamBWins === 2) {
            return false
          }
          
          // Invalid state (should not happen)
          return false
        } else {
          // Non-MLP: at least one game with non-zero score
          return m.games.some(g => 
            (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) || 
            (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0)
          )
        }
      })

      // If all matches in current stage are complete, trigger transition
      if (completedMatches.length === currentStageMatches.length) {
        // Update stage to indicate completion
        let completedStage = division.stage
        if (completedStage) {
          if (completedStage.endsWith('_SCHEDULED')) {
            completedStage = completedStage.replace('_SCHEDULED', '_COMPLETE') as any
          } else if (completedStage.endsWith('_IN_PROGRESS')) {
            completedStage = completedStage.replace('_IN_PROGRESS', '_COMPLETE') as any
          }
        }

        if (completedStage) {
          await ctx.prisma.division.update({
            where: { id: match.divisionId },
            data: { stage: completedStage as any },
          })
        }
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
      headToHead: new Map<string, { wins: number; losses: number; pointDiff: number }>(),
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

    // Update head-to-head stats
    const teamAHeadToHead = teamAStats.headToHead.get(match.teamBId) || { wins: 0, losses: 0, pointDiff: 0 }
    const teamBHeadToHead = teamBStats.headToHead.get(match.teamAId) || { wins: 0, losses: 0, pointDiff: 0 }

    if (teamAPoints > teamBPoints) {
      teamAHeadToHead.wins += 1
      teamBHeadToHead.losses += 1
    } else if (teamBPoints > teamAPoints) {
      teamBHeadToHead.wins += 1
      teamAHeadToHead.losses += 1
    }

    teamAHeadToHead.pointDiff += (teamAPoints - teamBPoints)
    teamBHeadToHead.pointDiff += (teamBPoints - teamAPoints)

    teamAStats.headToHead.set(match.teamBId, teamAHeadToHead)
    teamBStats.headToHead.set(match.teamAId, teamBHeadToHead)
  })

  teamStats.forEach(stats => {
    stats.pointDiff = stats.pointsFor - stats.pointsAgainst
  })

  // Sort teams using tie-breaker rules (same as calculateStandings in standings.ts)
  return Array.from(teamStats.values()).sort((a, b) => {
    // Tie-breaker 1: Match Wins
    if (a.wins !== b.wins) {
      return b.wins - a.wins
    }

    // Tie-breaker 2: Head-to-Head Point Differential
    const headToHeadA = a.headToHead.get(b.teamId)
    const headToHeadB = b.headToHead.get(a.teamId)
    
    if (headToHeadA && headToHeadB) {
      if (headToHeadA.pointDiff !== headToHeadB.pointDiff) {
        return headToHeadB.pointDiff - headToHeadA.pointDiff
      }
    }

    // Tie-breaker 3: Overall Point Differential
    if (a.pointDiff !== b.pointDiff) {
      return b.pointDiff - a.pointDiff
    }

    // Tie-breaker 4: Points For (as final tie-breaker)
    return b.pointsFor - a.pointsFor
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
      const totalScoreA = match.games.reduce((sum: number, game: any) => sum + (game.scoreA ?? 0), 0)
      const totalScoreB = match.games.reduce((sum: number, game: any) => sum + (game.scoreB ?? 0), 0)
      
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
      const totalScoreA = match.games.reduce((sum: number, game: any) => sum + (game.scoreA ?? 0), 0)
      const totalScoreB = match.games.reduce((sum: number, game: any) => sum + (game.scoreB ?? 0), 0)
      
      if (totalScoreA > totalScoreB) {
        winners.push(teams.find(t => t.id === match.teamAId))
      } else if (totalScoreB > totalScoreA) {
        winners.push(teams.find(t => t.id === match.teamBId))
      }
    }
  }
  
  return winners.filter(Boolean)
}
