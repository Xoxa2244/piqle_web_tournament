import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

// Helper function to generate Round Robin for a specific set of teams
function generateRoundRobinForTeams(teams: any[], startRoundIndex: number, poolId?: string | null) {
  const n = teams.length
  const isOdd = n % 2 === 1
  
  // If odd number of teams, add a BYE team
  const teamsWithBye = isOdd ? [...teams, { id: 'BYE', name: 'BYE' }] : teams

  const rounds: Array<{ teamAId: string; teamBId: string; roundIndex: number; poolId?: string | null }> = []
  const numRounds = isOdd ? n : n - 1

  // Circle method for Round Robin
  for (let round = 0; round < numRounds; round++) {
    for (let i = 0; i < teamsWithBye.length / 2; i++) {
      const teamA = teamsWithBye[i]
      const teamB = teamsWithBye[teamsWithBye.length - 1 - i]
      
      // Skip BYE matches
      if (teamA.id !== 'BYE' && teamB.id !== 'BYE') {
        rounds.push({
          teamAId: teamA.id,
          teamBId: teamB.id,
          roundIndex: startRoundIndex + round,
          poolId,
        })
      }
    }
    
    // Rotate teams (except first team)
    if (teamsWithBye.length > 2) {
      const lastTeam = teamsWithBye.pop()
      teamsWithBye.splice(1, 0, lastTeam!)
    }
  }

  return rounds
}

export const matchRouter = createTRPCRouter({
  generateRR: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get division with teams
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: {
            include: {
              pool: true
            }
          },
          pools: {
            orderBy: { order: 'asc' }
          },
          tournament: {
            select: { id: true },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      if (division.teams.length < 2) {
        throw new Error('Need at least 2 teams to generate Round Robin')
      }

      // Check if RR already exists
      const existingMatches = await ctx.prisma.match.findMany({
        where: { divisionId: input.divisionId },
      })

      if (existingMatches.length > 0) {
        throw new Error('Round Robin already generated for this division')
      }

      // Generate Round Robin schedule - separate by pools if they exist
      const rounds: Array<{ teamA: any; teamB: any; roundIndex: number; poolId?: string | null }> = []
      let currentRoundIndex = 0

      if (division.pools.length > 0) {
        // Generate RR for each pool separately
        for (const pool of division.pools) {
          const poolTeams = division.teams.filter(team => team.poolId === pool.id)
          
          if (poolTeams.length < 2) {
            console.log(`Pool ${pool.name} has less than 2 teams, skipping RR generation`)
            continue
          }

          console.log(`Generating RR for pool ${pool.name} with ${poolTeams.length} teams`)
          
          // Generate RR for this pool
          const poolRounds = generateRoundRobinForTeams(poolTeams, currentRoundIndex, pool.id)
          
          // Add pool rounds to main rounds array
          rounds.push(...poolRounds.map(round => ({
            teamA: poolTeams.find(t => t.id === round.teamAId),
            teamB: poolTeams.find(t => t.id === round.teamBId),
            roundIndex: round.roundIndex,
            poolId: pool.id,
          })))

          // Update current round index for next pool
          const poolRoundsCount = Math.max(...poolRounds.map(r => r.roundIndex)) + 1
          currentRoundIndex = poolRoundsCount
        }

        // Also generate RR for teams in WaitList (poolId === null)
        const waitListTeams = division.teams.filter(team => team.poolId === null)
        if (waitListTeams.length >= 2) {
          console.log(`Generating RR for WaitList with ${waitListTeams.length} teams`)
          
          const waitListRounds = generateRoundRobinForTeams(waitListTeams, currentRoundIndex, null)
          
          rounds.push(...waitListRounds.map(round => ({
            teamA: waitListTeams.find(t => t.id === round.teamAId),
            teamB: waitListTeams.find(t => t.id === round.teamBId),
            roundIndex: round.roundIndex,
            poolId: null,
          })))
        }
      } else {
        // No pools - generate RR for all teams in division
        const teams = division.teams
        console.log(`Generating RR for division with ${teams.length} teams (no pools)`)
        
        const divisionRounds = generateRoundRobinForTeams(teams, 0, undefined)
        
        rounds.push(...divisionRounds.map(round => ({
          teamA: teams.find(t => t.id === round.teamAId),
          teamB: teams.find(t => t.id === round.teamBId),
          roundIndex: round.roundIndex,
          poolId: undefined,
        })))
      }

      // Create matches in database
      const matches = await Promise.all(
        rounds.map((round) =>
          ctx.prisma.match.create({
            data: {
              divisionId: input.divisionId,
              poolId: round.poolId, // Add poolId to match
              teamAId: round.teamA.id,
              teamBId: round.teamB.id,
              roundIndex: round.roundIndex,
              stage: 'ROUND_ROBIN',
              bestOfMode: 'FIXED_GAMES', // Default to fixed games mode
              gamesCount: 1, // Default to 1 game per match
              targetPoints: 11, // Default to 11 points
              winBy: 2, // Default to win by 2
              locked: false,
            },
          })
        )
      )

      // Log the RR generation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournament.id,
          action: 'GENERATE_RR',
          entityType: 'Division',
          entityId: input.divisionId,
          payload: {
            divisionId: input.divisionId,
            teamsCount: division.teams.length,
            matchesCount: matches.length,
          },
        },
      })

      return {
        matches,
        totalMatches: matches.length,
        rounds: Math.max(...rounds.map(r => r.roundIndex)) + 1,
      }
    }),

  regenerateRR: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get division with teams and pools
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: {
            include: {
              pool: true
            }
          },
          pools: {
            orderBy: { order: 'asc' }
          },
          tournament: {
            select: { id: true },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      if (division.teams.length < 2) {
        throw new Error('Need at least 2 teams to generate Round Robin')
      }

      // Delete all existing RR matches
      await ctx.prisma.match.deleteMany({
        where: { 
          divisionId: input.divisionId,
          stage: 'ROUND_ROBIN'
        },
      })

      // Generate new Round Robin (using same logic as in generateRR)
      const rounds: Array<{ teamA: any; teamB: any; roundIndex: number; poolId?: string | null }> = []
      let currentRoundIndex = 0

      if (division.pools.length > 0) {
        // Generate RR for each pool separately
        for (const pool of division.pools) {
          const poolTeams = division.teams.filter(team => team.poolId === pool.id)
          
          if (poolTeams.length < 2) {
            console.log(`Pool ${pool.name} has less than 2 teams, skipping RR generation`)
            continue
          }

          console.log(`Regenerating RR for pool ${pool.name} with ${poolTeams.length} teams`)
          
          // Generate RR for this pool
          const poolRounds = generateRoundRobinForTeams(poolTeams, currentRoundIndex, pool.id)
          
          // Add pool matches to main array
          rounds.push(...poolRounds.map(round => ({
            teamA: poolTeams.find(t => t.id === round.teamAId),
            teamB: poolTeams.find(t => t.id === round.teamBId),
            roundIndex: round.roundIndex,
            poolId: pool.id,
          })))

          // Update round index for next pool
          const poolRoundsCount = Math.max(...poolRounds.map(r => r.roundIndex)) + 1
          currentRoundIndex = poolRoundsCount
        }

        // Also generate RR for teams in WaitList (poolId === null)
        const waitListTeams = division.teams.filter(team => team.poolId === null)
        if (waitListTeams.length >= 2) {
          console.log(`Regenerating RR for WaitList with ${waitListTeams.length} teams`)
          
          const waitListRounds = generateRoundRobinForTeams(waitListTeams, currentRoundIndex, null)
          
          rounds.push(...waitListRounds.map(round => ({
            teamA: waitListTeams.find(t => t.id === round.teamAId),
            teamB: waitListTeams.find(t => t.id === round.teamBId),
            roundIndex: round.roundIndex,
            poolId: null,
          })))
        }
      } else {
        // No pools - generate RR for all division teams
        const teams = division.teams
        console.log(`Regenerating RR for division with ${teams.length} teams (no pools)`)
        
        const divisionRounds = generateRoundRobinForTeams(teams, 0, undefined)
        
        rounds.push(...divisionRounds.map(round => ({
          teamA: teams.find(t => t.id === round.teamAId),
          teamB: teams.find(t => t.id === round.teamBId),
          roundIndex: round.roundIndex,
          poolId: undefined,
        })))
      }

      // Create new matches in database
      const matches = await Promise.all(
        rounds.map((round) =>
          ctx.prisma.match.create({
            data: {
              divisionId: input.divisionId,
              poolId: round.poolId, // Add poolId to match
              teamAId: round.teamA.id,
              teamBId: round.teamB.id,
              roundIndex: round.roundIndex,
              stage: 'ROUND_ROBIN',
              bestOfMode: 'FIXED_GAMES', // Default fixed games
              gamesCount: 1, // Default 1 game per match
              targetPoints: 11, // Default to 11 points
              winBy: 2, // Default win by 2
              locked: false,
            },
          })
        )
      )

      // Log RR regeneration
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournament.id,
          action: 'REGENERATE_RR',
          entityType: 'Division',
          entityId: input.divisionId,
          payload: {
            divisionId: input.divisionId,
            teamsCount: division.teams.length,
            matchesCount: matches.length,
            poolsCount: division.pools.length,
          },
        },
      })

      return {
        matches,
        totalMatches: matches.length,
        rounds: Math.max(...rounds.map(r => r.roundIndex)) + 1,
      }
    }),

  fillRandomResults: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get all RR matches for division
      const matches = await ctx.prisma.match.findMany({
        where: { 
          divisionId: input.divisionId,
          stage: 'ROUND_ROBIN'
        },
        include: {
          games: true
        }
      })

      if (matches.length === 0) {
        throw new Error('No Round Robin matches found for this division')
      }

      // Function to generate random score
      const generateRandomScore = () => {
        let scoreA, scoreB
        do {
          scoreA = Math.floor(Math.random() * 30) + 1 // 1-30
          scoreB = Math.floor(Math.random() * 30) + 1 // 1-30
        } while (Math.abs(scoreA - scoreB) < 3) // Minimum 3 point difference
        
        return { scoreA, scoreB }
      }

      // Fill all matches without results with random results
      const results = []
      
      for (const match of matches) {
        // Check if results already exist
        const hasResults = match.games && match.games.length > 0 && match.games[0].scoreA > 0
        
        if (!hasResults) {
          const { scoreA, scoreB } = generateRandomScore()
          const winner = scoreA > scoreB ? 'A' : 'B'
          
          // Create or update game
          if (match.games && match.games.length > 0) {
            // Update existing game
            await ctx.prisma.game.update({
              where: { id: match.games[0].id },
              data: {
                scoreA,
                scoreB,
                winner: winner as 'A' | 'B'
              }
            })
          } else {
            // Create new game
            await ctx.prisma.game.create({
              data: {
                matchId: match.id,
                index: 0,
                scoreA,
                scoreB,
                winner: winner as 'A' | 'B'
              }
            })
          }
          
          // Update match winner
          await ctx.prisma.match.update({
            where: { id: match.id },
            data: {
              winnerTeamId: winner === 'A' ? match.teamAId : match.teamBId
            }
          })
          
          results.push({
            matchId: match.id,
            scoreA,
            scoreB,
            winner
          })
        }
      }

      // Log random results filling
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: (await ctx.prisma.division.findUnique({
            where: { id: input.divisionId },
            select: { tournamentId: true }
          }))?.tournamentId || '',
          action: 'FILL_RANDOM_RESULTS',
          entityType: 'Division',
          entityId: input.divisionId,
          payload: {
            divisionId: input.divisionId,
            matchesFilled: results.length,
            totalMatches: matches.length
          },
        },
      })

      return {
        matchesFilled: results.length,
        totalMatches: matches.length,
        results
      }
    }),

  listByDivision: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.match.findMany({
        where: { divisionId: input.divisionId },
        include: {
          teamA: true,
          teamB: true,
          games: {
            orderBy: { index: 'asc' },
          },
        },
        orderBy: { roundIndex: 'asc' },
      })
    }),

  listByRRGroup: protectedProcedure
    .input(z.object({ rrGroupId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.match.findMany({
        where: { rrGroupId: input.rrGroupId },
        include: {
          teamA: true,
          teamB: true,
          games: {
            orderBy: { index: 'asc' },
          },
        },
        orderBy: { roundIndex: 'asc' },
      })
    }),

  listByRound: protectedProcedure
    .input(z.object({ 
      divisionId: z.string().optional(),
      rrGroupId: z.string().optional(),
      roundIndex: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.match.findMany({
        where: {
          ...(input.divisionId && { divisionId: input.divisionId }),
          ...(input.rrGroupId && { rrGroupId: input.rrGroupId }),
          roundIndex: input.roundIndex,
        },
        include: {
          teamA: true,
          teamB: true,
          games: {
            orderBy: { index: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  updateGameScore: protectedProcedure
    .input(z.object({
      matchId: z.string(),
      gameIndex: z.number(),
      scoreA: z.number(),
      scoreB: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.prisma.match.findUnique({
        where: { id: input.matchId },
        include: {
          division: {
            select: { tournamentId: true },
          },
          rrGroup: {
            select: { tournamentId: true },
          },
        },
      })

      if (!match) {
        throw new Error('Match not found')
      }

      const tournamentId = match.division?.tournamentId || match.rrGroup?.tournamentId
      if (!tournamentId) {
        throw new Error('Tournament not found')
      }

      // Update or create the game
      const game = await ctx.prisma.game.upsert({
        where: {
          matchId_index: {
            matchId: input.matchId,
            index: input.gameIndex,
          },
        },
        create: {
          matchId: input.matchId,
          index: input.gameIndex,
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          winner: input.scoreA > input.scoreB ? 'A' : input.scoreB > input.scoreA ? 'B' : null,
        },
        update: {
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          winner: input.scoreA > input.scoreB ? 'A' : input.scoreB > input.scoreA ? 'B' : null,
        },
      })

      // Log the score update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'UPDATE_GAME_SCORE',
          entityType: 'Game',
          entityId: game.id,
          payload: input,
        },
      })

      return game
    }),

  lock: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.prisma.match.findUnique({
        where: { id: input.id },
        include: {
          division: {
            select: { tournamentId: true },
          },
          rrGroup: {
            select: { tournamentId: true },
          },
        },
      })

      if (!match) {
        throw new Error('Match not found')
      }

      const tournamentId = match.division?.tournamentId || match.rrGroup?.tournamentId
      if (!tournamentId) {
        throw new Error('Tournament not found')
      }

      const updatedMatch = await ctx.prisma.match.update({
        where: { id: input.id },
        data: { locked: true },
      })

      // Log the lock
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'LOCK_MATCH',
          entityType: 'Match',
          entityId: match.id,
        },
      })

      return updatedMatch
    }),

  unlock: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.prisma.match.findUnique({
        where: { id: input.id },
        include: {
          division: {
            select: { tournamentId: true },
          },
          rrGroup: {
            select: { tournamentId: true },
          },
        },
      })

      if (!match) {
        throw new Error('Match not found')
      }

      const tournamentId = match.division?.tournamentId || match.rrGroup?.tournamentId
      if (!tournamentId) {
        throw new Error('Tournament not found')
      }

      const updatedMatch = await ctx.prisma.match.update({
        where: { id: input.id },
        data: { locked: false },
      })

      // Log the unlock
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'UNLOCK_MATCH',
          entityType: 'Match',
          entityId: match.id,
        },
      })

      return updatedMatch
    }),
})
