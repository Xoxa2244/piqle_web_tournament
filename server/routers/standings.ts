import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure, publicProcedure } from '../trpc'
import { buildCompleteBracket, type BracketMatch } from '../utils/bracket'
import { buildMLPBracket, generateMLPPlayoffMatches, createMLPGames } from '../utils/mlp'
import { getTeamDisplayName } from '../utils/teamDisplay'

interface TeamStats {
  teamId: string
  teamName: string
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
  headToHead: Map<string, { wins: number; losses: number; pointDiff: number }>
}

export const standingsRouter = createTRPCRouter({
  calculateStandings: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get division with teams and matches
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: {
            include: {
              teamPlayers: {
                include: {
                  player: true,
                },
              },
            },
          },
          matches: {
            where: { stage: 'ROUND_ROBIN' },
            include: {
              teamA: {
                include: {
                  teamPlayers: {
                    include: {
                      player: true,
                    },
                  },
                },
              },
              teamB: {
                include: {
                  teamPlayers: {
                    include: {
                      player: true,
                    },
                  },
                },
              },
              games: true,
            },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      if (division.teams.length < 2) {
        throw new Error('Need at least 2 teams to calculate standings')
      }

      const storedStandings = await ctx.prisma.standing.findMany({
        where: { divisionId: input.divisionId },
      })

      const hasStoredStandings = storedStandings.length === division.teams.length && storedStandings.some(s =>
        s.wins !== 0 ||
        s.losses !== 0 ||
        s.pointsFor !== 0 ||
        s.pointsAgainst !== 0
      )

      if (hasStoredStandings) {
        const standingsFromDb = storedStandings.map(standing => {
          const team = division.teams.find(team => team.id === standing.teamId)
          return {
            teamId: standing.teamId,
            teamName: team ? getTeamDisplayName(team, division.teamKind) : 'Unknown Team',
            wins: standing.wins,
            losses: standing.losses,
            pointsFor: standing.pointsFor,
            pointsAgainst: standing.pointsAgainst,
            pointDiff: standing.pointDiff,
            headToHead: new Map<string, { wins: number; losses: number; pointDiff: number }>(),
          } as TeamStats
        })

        const sortedDbStandings = standingsFromDb.sort((a, b) => {
          if (a.wins !== b.wins) {
            return b.wins - a.wins
          }

          if (a.pointDiff !== b.pointDiff) {
            return b.pointDiff - a.pointDiff
          }

          return b.pointsFor - a.pointsFor
        })

        return {
          standings: sortedDbStandings.map((team, index) => ({
            ...team,
            rank: index + 1,
            headToHead: Object.fromEntries(team.headToHead),
          })),
          totalMatches: division.matches.length,
          completedMatches: division.matches.filter(m => m.games.length > 0).length,
        }
      }

      // Initialize team stats
      const teamStats: Map<string, TeamStats> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: getTeamDisplayName(team, division.teamKind),
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0,
          headToHead: new Map(),
        })
      })

      // Process matches
      division.matches.forEach(match => {
        const teamAStats = teamStats.get(match.teamAId)
        const teamBStats = teamStats.get(match.teamBId)

        if (!teamAStats && !teamBStats) {
          return
        }

        // Calculate total points for this match
        let teamAPoints = 0
        let teamBPoints = 0

        match.games.forEach(game => {
          teamAPoints += game.scoreA ?? 0
          teamBPoints += game.scoreB ?? 0
        })

        // Update overall stats if team belongs to this division
        if (teamAStats) {
          teamAStats.pointsFor += teamAPoints
          teamAStats.pointsAgainst += teamBPoints
        }

        if (teamBStats) {
          teamBStats.pointsFor += teamBPoints
          teamBStats.pointsAgainst += teamAPoints
        }

        // Determine winner/loser for teams that belong to this division
        if (teamAPoints > teamBPoints) {
          if (teamAStats) {
            teamAStats.wins += 1
          }
          if (teamBStats) {
            teamBStats.losses += 1
          }
        } else if (teamBPoints > teamAPoints) {
          if (teamBStats) {
            teamBStats.wins += 1
          }
          if (teamAStats) {
            teamAStats.losses += 1
          }
        }
        // If equal, both teams get 0.5 wins (handled in sorting)

        // Update head-to-head stats only if both teams belong to this division
        if (teamAStats && teamBStats) {
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
        }
      })

      // Calculate point differentials
      teamStats.forEach(stats => {
        stats.pointDiff = stats.pointsFor - stats.pointsAgainst
      })

      // Sort teams using tie-breaker rules
      const sortedTeams = Array.from(teamStats.values()).sort((a, b) => {
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

      return {
        standings: sortedTeams.map((team, index) => ({
          ...team,
          rank: index + 1,
          headToHead: Object.fromEntries(team.headToHead),
        })),
        totalMatches: division.matches.length,
        completedMatches: division.matches.filter(m => m.games.length > 0).length,
      }
    }),

  checkPlayInStatus: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all play-in matches for this division
      const playInMatches = await ctx.prisma.match.findMany({
        where: {
          divisionId: input.divisionId,
          stage: 'PLAY_IN',
        },
        include: {
          games: true,
          tiebreaker: true,
        },
      })

      if (playInMatches.length === 0) {
        return {
          hasPlayIn: false,
          isComplete: true,
          completedMatches: 0,
          totalMatches: 0,
        }
      }

      const completedMatches = playInMatches.filter(match => 
        match.games.length > 0 && match.games.some(game => (game.scoreA !== null && game.scoreA !== undefined && game.scoreA > 0) || (game.scoreB !== null && game.scoreB !== undefined && game.scoreB > 0))
      )

      return {
        hasPlayIn: true,
        isComplete: completedMatches.length === playInMatches.length,
        completedMatches: completedMatches.length,
        totalMatches: playInMatches.length,
        incompleteMatches: playInMatches.filter(match => 
          match.games.length === 0 || !match.games.some(game => (game.scoreA !== null && game.scoreA !== undefined && game.scoreA > 0) || (game.scoreB !== null && game.scoreB !== undefined && game.scoreB > 0))
        ),
      }
    }),

  generatePlayoffs: tdProcedure
    .input(z.object({ 
      divisionId: z.string(),
      bracketSize: z.enum(['4', '8', '16']).transform(val => parseInt(val)),
      regenerate: z.boolean().optional().default(false),
      regenerateType: z.enum(['playin', 'playoff']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get division with teams and matches
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: {
            include: {
              teamPlayers: {
                include: {
                  player: true,
                },
              },
            },
          },
          pools: {
            orderBy: { order: 'asc' },
          },
          matches: {
            where: { stage: 'ROUND_ROBIN' },
            include: {
              teamA: {
                include: {
                  teamPlayers: {
                    include: {
                      player: true,
                    },
                  },
                },
              },
              teamB: {
                include: {
                  teamPlayers: {
                    include: {
                      player: true,
                    },
                  },
                },
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

      if (division.teams.length < 2) {
        throw new Error('Need at least 2 teams to generate playoffs')
      }

      // Validate Round Robin matches - check for teams playing multiple times in same round
      // Only check Round Robin matches (not Play-In or Playoff)
      const rrMatches = division.matches.filter(m => m.stage === 'ROUND_ROBIN')
      
      if (rrMatches.length > 0) {
        const roundTeamCount = new Map<number, Map<string, number>>()
        const roundTeamNames = new Map<number, Map<string, string>>()
        
        rrMatches.forEach(match => {
          const roundIndex = match.roundIndex
          if (!roundTeamCount.has(roundIndex)) {
            roundTeamCount.set(roundIndex, new Map())
            roundTeamNames.set(roundIndex, new Map())
          }
          
          const teamCount = roundTeamCount.get(roundIndex)!
          const teamNames = roundTeamNames.get(roundIndex)!
          
          // Count teamA
          const countA = (teamCount.get(match.teamAId) || 0) + 1
          teamCount.set(match.teamAId, countA)
          teamNames.set(match.teamAId, getTeamDisplayName(match.teamA, division.teamKind))
          
          // Count teamB
          const countB = (teamCount.get(match.teamBId) || 0) + 1
          teamCount.set(match.teamBId, countB)
          teamNames.set(match.teamBId, getTeamDisplayName(match.teamB, division.teamKind))
        })

        // Check for violations
        const violations: string[] = []
        roundTeamCount.forEach((teamCount, roundIndex) => {
          teamCount.forEach((count, teamId) => {
            if (count > 1) {
              const teamName = roundTeamNames.get(roundIndex)?.get(teamId) || 'Unknown'
              violations.push(`Team "${teamName}" plays ${count} times in Round ${roundIndex}`)
            }
          })
        })

        if (violations.length > 0) {
          const errorMessage = `Cannot generate Play-In. Round Robin validation failed:\n${violations.join('\n')}\n\nA team cannot play more than once in the same round. Please fix this by using "Edit RR Pairs" or regenerating Round Robin.`
          throw new Error(errorMessage)
        }
      }

      // If regenerating, delete existing matches based on type
      if (input.regenerate) {
        if (input.regenerateType === 'playoff') {
          // Only delete Play-Off matches for Play-Off regeneration
          await ctx.prisma.match.deleteMany({
            where: {
              divisionId: input.divisionId,
              stage: 'ELIMINATION'
            }
          })
        } else {
          // Delete both Play-In and Play-Off matches for Play-In regeneration or primary generation
          await ctx.prisma.match.deleteMany({
            where: {
              divisionId: input.divisionId,
              stage: { in: ['PLAY_IN', 'ELIMINATION'] }
            }
          })
        }
      }

      // Calculate standings inline
      const teamStats: Map<string, TeamStats> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: getTeamDisplayName(team, division.teamKind),
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0,
          headToHead: new Map(),
        })
      })

      // Process matches
      division.matches.forEach(match => {
        const teamAStats = teamStats.get(match.teamAId)
        const teamBStats = teamStats.get(match.teamBId)
        
        if (!teamAStats || !teamBStats) return

        // Calculate total points for this match
        let teamAPoints = 0
        let teamBPoints = 0
        
        match.games.forEach(game => {
          teamAPoints += game.scoreA ?? 0
          teamBPoints += game.scoreB ?? 0
        })

        // Update overall stats
        teamAStats.pointsFor += teamAPoints
        teamAStats.pointsAgainst += teamBPoints
        teamBStats.pointsFor += teamBPoints
        teamBStats.pointsAgainst += teamAPoints

        // Determine winner - for MLP matches, use tiebreaker if exists, otherwise use match.winnerTeamId or games
        const isMLP = division.tournament?.format === 'MLP'
        let winnerTeamId: string | null = null
        
        if (isMLP && match.tiebreaker) {
          // MLP match with tiebreaker - use tiebreaker winner
          winnerTeamId = match.tiebreaker.winnerTeamId
        } else if (match.winnerTeamId) {
          // Use match winnerTeamId if set
          winnerTeamId = match.winnerTeamId
        } else {
          // Fallback to games score
          if (teamAPoints > teamBPoints) {
            winnerTeamId = match.teamAId
          } else if (teamBPoints > teamAPoints) {
            winnerTeamId = match.teamBId
          }
        }

        // Update wins/losses based on winner
        if (winnerTeamId === match.teamAId) {
          teamAStats.wins += 1
          teamBStats.losses += 1
        } else if (winnerTeamId === match.teamBId) {
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

      // Calculate point differentials
      teamStats.forEach(stats => {
        stats.pointDiff = stats.pointsFor - stats.pointsAgainst
      })

      // Sort teams using tie-breaker rules
      const standings = Array.from(teamStats.values()).sort((a, b) => {
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

      const N = standings.length
      const B = input.bracketSize

      if (N < B) {
        throw new Error(`Not enough teams for ${B}-team bracket. Have ${N}, need ${B}`)
      }

      // Check if playoffs already exist (only if not regenerating)
      if (!input.regenerate) {
        const existingPlayoffs = await ctx.prisma.match.findMany({
          where: { 
            divisionId: input.divisionId,
            stage: { in: ['PLAY_IN', 'ELIMINATION'] },
          },
        })

        if (existingPlayoffs.length > 0) {
          throw new Error('Playoffs already generated for this division')
        }
      }

      // Check if play-in is complete (if it exists)
      const playInMatches = await ctx.prisma.match.findMany({
        where: {
          divisionId: input.divisionId,
          stage: 'PLAY_IN',
        },
        include: {
          games: true,
          tiebreaker: true,
        },
      })

      if (playInMatches.length > 0) {
        const completedPlayInMatches = playInMatches.filter(match => 
          match.games.length > 0 && match.games.some(game => (game.scoreA !== null && game.scoreA !== undefined && game.scoreA > 0) || (game.scoreB !== null && game.scoreB !== undefined && game.scoreB > 0))
        )

        if (completedPlayInMatches.length !== playInMatches.length) {
          throw new Error('Play-off cannot be generated. You must enter results for all play-in matches.')
        }
      }

      const matches = []
      const isMLP = division.tournament?.format === 'MLP'

      // MLP format: special logic for Play-Off generation
      if (isMLP) {
        // MLP: No play-in, generate Play-Off based on pool structure
        const poolCount = division.pools.length

        if (poolCount === 1) {
          // Single pool: top 4 teams
          if (standings.length < 4) {
            throw new Error(`MLP single pool requires at least 4 teams, got ${standings.length}`)
          }

          const top4 = standings.slice(0, 4).map((team, index) => ({
            teamId: team.teamId,
            teamName: team.teamName,
            seed: index + 1,
          }))

          const poolStandings = [{
            poolId: division.pools[0].id,
            poolName: division.pools[0].name,
            top4,
          }]

          const mlpMatches = generateMLPPlayoffMatches(poolStandings, true)
          matches.push(...mlpMatches)
        } else if (poolCount === 2) {
          // Two pools: top 2 from each pool
          const poolStandings: Array<{
            poolId: string
            poolName: string
            top2: Array<{ teamId: string; teamName: string; seed: number }>
          }> = []

          for (const pool of division.pools) {
            const poolTeams = standings.filter(team => {
              const teamObj = division.teams.find(t => t.id === team.teamId)
              return teamObj?.poolId === pool.id
            })

            if (poolTeams.length < 2) {
              throw new Error(`Pool ${pool.name} must have at least 2 teams, got ${poolTeams.length}`)
            }

            const top2 = poolTeams.slice(0, 2).map((team, index) => ({
              teamId: team.teamId,
              teamName: team.teamName,
              seed: index + 1, // Seed within pool (1 or 2)
            }))

            poolStandings.push({
              poolId: pool.id,
              poolName: pool.name,
              top2,
            })
          }

          // Sort pools by order to ensure consistent pairing
          poolStandings.sort((a, b) => {
            const poolA = division.pools.find(p => p.id === a.poolId)
            const poolB = division.pools.find(p => p.id === b.poolId)
            return (poolA?.order || 0) - (poolB?.order || 0)
          })

          const mlpMatches = generateMLPPlayoffMatches(poolStandings, true)
          matches.push(...mlpMatches)
        } else {
          throw new Error(`MLP format requires 1 or 2 pools, got ${poolCount}`)
        }
      } else {
        // Single Elimination format: standard logic
        if (N === B) {
          // No play-in needed, direct playoffs
          const playoffMatches = generateSingleEliminationMatches(standings, 0)
          matches.push(...playoffMatches)
        } else if (B < N && N < 2 * B) {
          // Play-in needed
          const E = N - B
          const playInTeams = standings.slice(N - 2 * E) // Bottom 2E teams
          const autoQualified = standings.slice(0, N - 2 * E) // Top teams auto-qualify

          // Generate play-in matches
          const playInMatches = generatePlayInMatches(playInTeams, 0)
          matches.push(...playInMatches)

          // DO NOT generate playoff matches yet - they will be generated after play-in completion
          // This prevents premature playoff generation before play-in results are known
        } else {
          throw new Error(`Invalid team count ${N} for bracket size ${B}`)
        }
      }

      // Create matches in database
      const createdMatches = await Promise.all(
        matches.map(match => {
          // For MLP matches, create 4 games
          const gamesCount = isMLP ? 4 : 1
          
          return ctx.prisma.match.create({
            data: {
              divisionId: input.divisionId,
              teamAId: match.teamAId,
              teamBId: match.teamBId,
              roundIndex: match.roundIndex,
              stage: match.stage,
              bestOfMode: 'FIXED_GAMES',
              gamesCount,
              targetPoints: 11,
              winBy: 2,
              locked: false,
              note: (match as any).note || null,
            },
          })
        })
      )

      // For MLP matches, create 4 games for each match
      if (isMLP) {
        for (const createdMatch of createdMatches) {
          await createMLPGames(ctx.prisma, createdMatch.id, createdMatch.teamAId, createdMatch.teamBId)
        }
      }

      // Update division stage based on what was generated
      let nextStage = 'PO_R1_SCHEDULED'
      if (B < N && N < 2 * B) {
        // Play-in was generated
        nextStage = 'PLAY_IN_SCHEDULED'
      }

      await ctx.prisma.division.update({
        where: { id: input.divisionId },
        data: { stage: nextStage as any },
      })

      // Log the playoff generation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournament.id,
          action: 'GENERATE_PLAYOFFS',
          entityType: 'Division',
          entityId: input.divisionId,
          payload: {
            divisionId: input.divisionId,
            bracketSize: B,
            teamsCount: N,
            matchesCount: createdMatches.length,
            nextStage,
          },
        },
      })

      return {
        matches: createdMatches,
        bracketSize: B,
        teamsCount: N,
        playInNeeded: B < N && N < 2 * B,
        nextStage,
      }
    }),

  generateNextPlayoffRound: tdProcedure
    .input(z.object({ 
      divisionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get division with current playoff matches
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: true,
          matches: {
            where: { stage: 'ELIMINATION' },
            include: {
              teamA: true,
              teamB: true,
              games: true,
              tiebreaker: true,
            },
            orderBy: { roundIndex: 'asc' },
          },
          tournament: {
            select: { format: true },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const isMLP = division.tournament?.format === 'MLP'

      // Find the current round (highest round with matches)
      const currentRound = Math.max(...division.matches.map(m => m.roundIndex), -1)
      
      // Get matches from current round
      const currentRoundMatches = division.matches.filter(m => m.roundIndex === currentRound)
      
      // Check if all matches in current round are completed
      const allCompleted = currentRoundMatches.every(match => 
        match.games && match.games.length > 0 && match.games[0] && match.games[0].scoreA !== null && match.games[0].scoreA !== undefined && match.games[0].scoreA > 0
      )
      
      if (!allCompleted) {
        throw new Error('Current round is not completed yet')
      }

      // Get winners from current round
      const winners = currentRoundMatches.map(match => {
        // For MLP matches, check tiebreaker first
        if (isMLP && match.tiebreaker) {
          // Use tiebreaker winner
          if (match.tiebreaker.winnerTeamId === match.teamAId) {
            return match.teamA
          } else if (match.tiebreaker.winnerTeamId === match.teamBId) {
            return match.teamB
          }
        }
        
        // Use match.winnerTeamId if set
        if (match.winnerTeamId) {
          if (match.winnerTeamId === match.teamAId) {
            return match.teamA
          } else if (match.winnerTeamId === match.teamBId) {
            return match.teamB
          }
        }
        
        // Fallback to game score
        const game = match.games?.[0]
        if (!game) throw new Error('No game found for completed match')
        
        // Determine winner by score instead of relying on game.winner field
        if (game.scoreA !== null && game.scoreB !== null && game.scoreA > game.scoreB) {
          return match.teamA
        } else if (game.scoreA !== null && game.scoreB !== null && game.scoreB > game.scoreA) {
          return match.teamB
        } else {
          throw new Error('Match cannot have a tie score')
        }
      })

      // If only one winner left, tournament is complete
      if (winners.length === 1) {
        // Update division stage to DIVISION_COMPLETE
        await ctx.prisma.division.update({
          where: { id: input.divisionId },
          data: { stage: 'DIVISION_COMPLETE' as any },
        })
        
        return {
          matches: [],
          message: 'Tournament completed!',
          isComplete: true,
        }
      }

      // Generate next round matches
      const nextRoundMatches = []
      for (let i = 0; i < winners.length / 2; i++) {
        nextRoundMatches.push({
          teamAId: winners[i].id,
          teamBId: winners[winners.length - 1 - i].id,
          roundIndex: currentRound + 1,
          stage: 'ELIMINATION' as const,
        })
      }

      console.log('Generated next round matches:', nextRoundMatches.length, 'winners:', winners.length)

      // If this is the semi-final round (2 teams), create third place match
      if (winners.length === 2) {
        // Get losers from semi-finals
        const semiFinalLosers = currentRoundMatches.map(match => {
          const game = match.games?.[0]
          if (!game) throw new Error('No game found for completed match')
          
          // Determine loser by score
          if (game.scoreA !== null && game.scoreB !== null && game.scoreA > game.scoreB) {
            return match.teamB
          } else if (game.scoreA !== null && game.scoreB !== null && game.scoreB > game.scoreA) {
            return match.teamA
          } else {
            throw new Error('Match cannot have a tie score')
          }
        })

        // Create third place match
        if (semiFinalLosers.length === 2) {
          console.log('Creating third place match between:', semiFinalLosers[0].name, 'vs', semiFinalLosers[1].name)
          nextRoundMatches.push({
            teamAId: semiFinalLosers[0].id,
            teamBId: semiFinalLosers[1].id,
            roundIndex: currentRound + 1,
            stage: 'ELIMINATION' as const,
            isThirdPlace: true,
          })
        }
      }

      // Check if this is the final round (has both final and third place matches)
      const hasThirdPlaceMatch = nextRoundMatches.some(match => match.isThirdPlace)
      const isFinalRound = winners.length === 2 && hasThirdPlaceMatch
      
      // If this is the final round, tournament will be complete after these matches
      if (isFinalRound) {
        console.log('This is the final round - tournament will be complete after these matches')
      }

      // Create next round matches in database
      const createdMatches = await Promise.all(
        nextRoundMatches.map(async match => {
          const gamesCount = isMLP ? 4 : 1
          
          const createdMatch = await ctx.prisma.match.create({
            data: {
              divisionId: input.divisionId,
              teamAId: match.teamAId,
              teamBId: match.teamBId,
              roundIndex: match.roundIndex,
              stage: match.stage,
              bestOfMode: 'FIXED_GAMES',
              gamesCount,
              targetPoints: 11,
              winBy: 2,
              locked: false,
              // Add third place flag if it exists
              ...(match.isThirdPlace && { note: 'Third Place Match' }),
            },
          })
          
          // For MLP matches, create 4 games
          if (isMLP) {
            await createMLPGames(ctx.prisma, createdMatch.id, createdMatch.teamAId, createdMatch.teamBId)
          }
          
          return createdMatch
        })
      )

      // If this is the final round, mark division as ready for completion
      if (isFinalRound) {
        console.log('Final round created - division will be marked complete when matches are finished')
      }

      // Update division stage to next round
      const nextStage = `PO_R${currentRound + 2}_SCHEDULED` as any
      await ctx.prisma.division.update({
        where: { id: input.divisionId },
        data: { stage: nextStage },
      })

      return {
        matches: createdMatches,
        round: currentRound + 1,
        isComplete: false,
      }
    }),

  regeneratePlayoffs: tdProcedure
    .input(z.object({ 
      divisionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get division with teams and matches
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: true,
          matches: {
            where: { stage: { in: ['ROUND_ROBIN', 'PLAY_IN'] } },
            include: {
              teamA: true,
              teamB: true,
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

      if (division.teams.length < 2) {
        throw new Error('Need at least 2 teams to generate playoffs')
      }

      // Delete all existing Play-Off matches
      await ctx.prisma.match.deleteMany({
        where: {
          divisionId: input.divisionId,
          stage: 'ELIMINATION'
        }
      })

      // Calculate standings from Round Robin and Play-In matches
      const teamStats: Map<string, TeamStats> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: getTeamDisplayName(team, division.teamKind),
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0,
          headToHead: new Map()
        })
      })

      // Process Round Robin and Play-In matches
      const isMLP = division.tournament?.format === 'MLP'
      
      division.matches.forEach(match => {
        if (match.games.length === 0) return

        // For MLP matches, sum all games; for others, use first game
        let teamAPoints = 0
        let teamBPoints = 0
        
        if (isMLP) {
          match.games.forEach(game => {
            teamAPoints += game.scoreA ?? 0
            teamBPoints += game.scoreB ?? 0
          })
        } else {
          const game = match.games[0]
          teamAPoints = game.scoreA ?? 0
          teamBPoints = game.scoreB ?? 0
        }
        
        const teamAStats = teamStats.get(match.teamAId)!
        const teamBStats = teamStats.get(match.teamBId)!

        teamAStats.pointsFor += teamAPoints
        teamAStats.pointsAgainst += teamBPoints
        teamBStats.pointsFor += teamBPoints
        teamBStats.pointsAgainst += teamAPoints

        // Determine winner - for MLP matches, use tiebreaker if exists
        let winnerTeamId: string | null = null
        
        if (isMLP && match.tiebreaker) {
          // MLP match with tiebreaker - use tiebreaker winner
          winnerTeamId = match.tiebreaker.winnerTeamId
        } else if (match.winnerTeamId) {
          // Use match winnerTeamId if set
          winnerTeamId = match.winnerTeamId
        } else {
          // Fallback to games score
          if (teamAPoints > teamBPoints) {
            winnerTeamId = match.teamAId
          } else if (teamBPoints > teamAPoints) {
            winnerTeamId = match.teamBId
          }
        }

        // Update wins/losses based on winner
        if (winnerTeamId === match.teamAId) {
          teamAStats.wins++
          teamBStats.losses++
        } else if (winnerTeamId === match.teamBId) {
          teamBStats.wins++
          teamAStats.losses++
        }
      })

      // Calculate point differentials
      teamStats.forEach(stats => {
        stats.pointDiff = stats.pointsFor - stats.pointsAgainst
      })

      // Sort teams by standings
      const sortedTeams = Array.from(teamStats.values())
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins
          if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff
          return b.pointsFor - a.pointsFor
        })

      // Determine bracket size
      const teamCount = sortedTeams.length
      let targetBracketSize = 4
      if (teamCount <= 8) targetBracketSize = 4
      else if (teamCount <= 16) targetBracketSize = 8
      else if (teamCount <= 24) targetBracketSize = 16
      else if (teamCount <= 32) targetBracketSize = 32
      else targetBracketSize = 64

      // Generate Play-Off matches
      const playoffTeams = sortedTeams.slice(0, targetBracketSize)
      const rounds = Math.log2(targetBracketSize)
      
      for (let round = 0; round < rounds; round++) {
        const matchesInRound = Math.pow(2, rounds - round - 1)
        
        for (let match = 0; match < matchesInRound; match++) {
          const teamAIndex = match * 2
          const teamBIndex = match * 2 + 1
          
          if (teamAIndex < playoffTeams.length && teamBIndex < playoffTeams.length) {
            await ctx.prisma.match.create({
              data: {
                divisionId: input.divisionId,
                teamAId: playoffTeams[teamAIndex].teamId,
                teamBId: playoffTeams[teamBIndex].teamId,
                stage: 'ELIMINATION',
                roundIndex: round,
                bestOfMode: 'FIXED_GAMES',
                gamesCount: 1,
                targetPoints: 11,
                winBy: 2,
              }
            })
          }
        }
      }

      // Reset division stage to PO_R1_SCHEDULED
      await ctx.prisma.division.update({
        where: { id: input.divisionId },
        data: { stage: 'PO_R1_SCHEDULED' as any },
      })

      return { success: true }
    }),

  getBracket: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      console.log('[getBracket] Starting with divisionId:', input.divisionId)
      try {
        // Get division with teams, matches, and standings
        console.log('[getBracket] Fetching division from database...')
        const division = await ctx.prisma.division.findUnique({
          where: { id: input.divisionId },
          include: {
            teams: {
              include: {
                teamPlayers: {
                  include: {
                    player: true,
                  },
                },
              },
            },
            matches: {
              include: {
                teamA: {
                  include: {
                    teamPlayers: {
                      include: {
                        player: true,
                      },
                    },
                  },
                },
                teamB: {
                  include: {
                    teamPlayers: {
                      include: {
                        player: true,
                      },
                    },
                  },
                },
                games: {
                  orderBy: { index: 'asc' }
                },
                tiebreaker: true,
              },
            },
            standings: {
              include: {
                team: {
                  include: {
                    teamPlayers: {
                      include: {
                        player: true,
                      },
                    },
                  },
                },
              },
            },
            tournament: {
              select: { format: true },
            },
            pools: {
              orderBy: { order: 'asc' },
            },
          },
        })

        if (!division) {
          console.error('[getBracket] Division not found:', input.divisionId)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
        }

        const isMLP = division.tournament.format === 'MLP'

        console.log('[getBracket] Division found:', {
          id: division.id,
          name: division.name,
          teamsCount: division.teams.length,
          matchesCount: division.matches.length,
        })

      // Calculate standings if not available or recalculate from RR matches
      console.log('[getBracket] Filtering matches by stage...')
      const rrMatches = division.matches.filter(m => m.stage === 'ROUND_ROBIN')
      const playInMatches = division.matches.filter(m => m.stage === 'PLAY_IN')
      const playoffMatches = division.matches.filter(m => m.stage === 'ELIMINATION')
      
      console.log('[getBracket] Match counts:', {
        rr: rrMatches.length,
        playIn: playInMatches.length,
        playoff: playoffMatches.length,
      })

      // Calculate standings from RR matches using the same logic as calculateStandings
      // CRITICAL: Use head-to-head tie-breaker to match Dashboard standings
      console.log('[getBracket] Calculating standings from RR matches with head-to-head...')
      const teamStats: Map<string, { teamId: string; teamName: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number; pointDiff: number; headToHead: Map<string, { wins: number; losses: number; pointDiff: number }> }> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: getTeamDisplayName(team, division.teamKind),
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0,
          headToHead: new Map(),
        })
      })
      
      console.log('[getBracket] Team stats initialized:', teamStats.size)

      rrMatches.forEach(match => {
        const teamAStats = teamStats.get(match.teamAId)
        const teamBStats = teamStats.get(match.teamBId)
        
        if (!teamAStats || !teamBStats) {
          console.warn(`Team stats not found for match ${match.id}: teamA=${match.teamAId}, teamB=${match.teamBId}`)
          return
        }

        // Calculate total points for this match
        const totalScoreA = (match.games || []).reduce((sum, game) => sum + (game.scoreA || 0), 0)
        const totalScoreB = (match.games || []).reduce((sum, game) => sum + (game.scoreB || 0), 0)

        // Update overall stats
        teamAStats.pointsFor += totalScoreA
        teamAStats.pointsAgainst += totalScoreB
        teamBStats.pointsFor += totalScoreB
        teamBStats.pointsAgainst += totalScoreA

        // Determine winner/loser - for MLP matches, use tiebreaker if exists
        let winnerTeamId: string | null = null
        
        if (isMLP && match.tiebreaker) {
          // MLP match with tiebreaker - use tiebreaker winner
          winnerTeamId = match.tiebreaker.winnerTeamId
        } else if (match.winnerTeamId) {
          // Use match winnerTeamId if set
          winnerTeamId = match.winnerTeamId
        } else {
          // Fallback to games score
          if (totalScoreA > totalScoreB) {
            winnerTeamId = match.teamAId
          } else if (totalScoreB > totalScoreA) {
            winnerTeamId = match.teamBId
          }
        }

        // Update wins/losses based on winner
        if (winnerTeamId === match.teamAId) {
          teamAStats.wins += 1
          teamBStats.losses += 1
        } else if (winnerTeamId === match.teamBId) {
          teamBStats.wins += 1
          teamAStats.losses += 1
        }

        // Update head-to-head stats
        const teamAHeadToHead = teamAStats.headToHead.get(match.teamBId) || { wins: 0, losses: 0, pointDiff: 0 }
        const teamBHeadToHead = teamBStats.headToHead.get(match.teamAId) || { wins: 0, losses: 0, pointDiff: 0 }

        // Use winnerTeamId if determined, otherwise fallback to score
        const h2hWinnerId = winnerTeamId || (totalScoreA > totalScoreB ? match.teamAId : (totalScoreB > totalScoreA ? match.teamBId : null))
        
        if (h2hWinnerId === match.teamAId) {
          teamAHeadToHead.wins += 1
          teamBHeadToHead.losses += 1
        } else if (h2hWinnerId === match.teamBId) {
          teamBHeadToHead.wins += 1
          teamAHeadToHead.losses += 1
        }

        teamAHeadToHead.pointDiff += (totalScoreA - totalScoreB)
        teamBHeadToHead.pointDiff += (totalScoreB - totalScoreA)

        teamAStats.headToHead.set(match.teamBId, teamAHeadToHead)
        teamBStats.headToHead.set(match.teamAId, teamBHeadToHead)
      })

      // Calculate point differentials
      teamStats.forEach(stats => {
        stats.pointDiff = stats.pointsFor - stats.pointsAgainst
      })

      console.log('[getBracket] Processing RR matches...')
      // Sort teams using tie-breaker rules (same as calculateStandings)
      const standings = Array.from(teamStats.values())
        .sort((a, b) => {
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
        .map((stats, index) => ({
          teamId: stats.teamId,
          teamName: stats.teamName,
          seed: index + 1,
        }))

      console.log('[getBracket] Standings calculated:', standings.length)

      // Check if RR is complete
      const completedRRMatches = rrMatches.filter(m => {
        if (!m.games || m.games.length === 0) return false
        
        // For MLP matches, check if all 4 games are completed
        const matchGamesCount = m.gamesCount || m.games.length
        const isMLPMatch = isMLP && matchGamesCount === 4
        
        if (isMLPMatch) {
          // MLP: all 4 games must have non-null scores and not be tied
          if (m.games.length !== 4) return false
          return m.games.every(g => 
            g.scoreA !== null && 
            g.scoreA !== undefined && 
            g.scoreB !== null && 
            g.scoreB !== undefined &&
            g.scoreA !== g.scoreB &&
            g.scoreA >= 0 &&
            g.scoreB >= 0
          )
        } else {
          // Non-MLP: at least one game with non-zero score
          return m.games.some(g => 
            (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) || 
            (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0)
          )
        }
      })
      const isRRComplete = completedRRMatches.length === rrMatches.length && rrMatches.length > 0
      
      console.log('[getBracket] RR completion status:', {
        isRRComplete,
        completedMatches: completedRRMatches.length,
        totalRRMatches: rrMatches.length,
      })

      // Determine bracket size - use next power of 2
      const N = division.teams.length
      // Calculate bracket size as next power of 2, but cap at maxTeams if set
      const nextPowerOf2 = N <= 1 ? 1 : Math.pow(2, Math.ceil(Math.log2(N)))
      const B = division.maxTeams ? Math.min(division.maxTeams, nextPowerOf2) : nextPowerOf2
      const needsPlayIn = B < N && N < 2 * B
      
      console.log('[getBracket] Bracket parameters:', { N, B, needsPlayIn })

      // Build complete bracket using new structure (includes both play-in and playoff)
      // Always generate bracket, even if RR is not complete - show seed numbers only
      console.log('[getBracket] Building bracket structure...')
      let allBracketMatches: BracketMatch[] = []
      try {
        // Validate inputs before building bracket
        if (N === 0) {
          console.warn('[getBracket] No teams in division, cannot build bracket')
          allBracketMatches = []
        } else if (B <= 0 || B < N / 2) {
          console.warn(`[getBracket] Invalid bracket size ${B} for ${N} teams`)
          allBracketMatches = []
        } else {
          console.log('[getBracket] Preparing match data...')
          // Prepare play-in match data - always include if matches exist in DB
          // This ensures Round 0 is displayed even if needsPlayIn calculation says it's not needed
          const playInMatchData = playInMatches.length > 0
            ? playInMatches
                .filter(match => match.teamAId && match.teamBId) // Only include matches with both teams
                .map(match => {
                  // For MLP matches, check tiebreaker first
                  const isMLP = division.tournament?.format === 'MLP'
                  let winnerId: string | undefined = undefined
                  
                  if (isMLP && match.tiebreaker) {
                    // Use tiebreaker winner
                    winnerId = match.tiebreaker.winnerTeamId || undefined
                  } else if (match.winnerTeamId) {
                    // Use match.winnerTeamId if set
                    winnerId = match.winnerTeamId
                  } else {
                    // Fallback to games score
                    const totalScoreA = (match.games || []).reduce((sum, game) => sum + (game.scoreA || 0), 0)
                    const totalScoreB = (match.games || []).reduce((sum, game) => sum + (game.scoreB || 0), 0)
                    winnerId = totalScoreA > totalScoreB ? match.teamAId : (totalScoreB > totalScoreA ? match.teamBId : undefined)
                  }
                  
                  return {
                    id: match.id,
                    winnerTeamId: winnerId,
                    teamAId: match.teamAId!,
                    teamBId: match.teamBId!,
                    games: (match.games || []).map(g => ({ scoreA: g.scoreA || 0, scoreB: g.scoreB || 0 })),
                  }
                })
            : undefined
          
          console.log('[getBracket] Play-In match data prepared:', {
            playInMatchesCount: playInMatches.length,
            playInMatchDataCount: playInMatchData?.length || 0,
          })
          
          // Prepare playoff match data - always include if matches exist in DB
          // This ensures bracket is built from actual DB matches, not generated structure
          const playoffMatchData = playoffMatches.length > 0
            ? playoffMatches
                .filter(match => match.teamAId && match.teamBId) // Only include matches with both teams
                .map(match => {
                  // For MLP matches, check tiebreaker first
                  let winnerId: string | undefined = undefined
                  
                  if (isMLP && match.tiebreaker) {
                    // Use tiebreaker winner
                    winnerId = match.tiebreaker.winnerTeamId || undefined
                  } else if (match.winnerTeamId) {
                    // Use match.winnerTeamId if set
                    winnerId = match.winnerTeamId
                  } else {
                    // Fallback to games score (for non-MLP or matches without tiebreaker)
                    const totalScoreA = (match.games || []).reduce((sum, game) => sum + (game.scoreA || 0), 0)
                    const totalScoreB = (match.games || []).reduce((sum, game) => sum + (game.scoreB || 0), 0)
                    winnerId = totalScoreA > totalScoreB ? match.teamAId : (totalScoreB > totalScoreA ? match.teamBId : undefined)
                  }
                  
                  return {
                    id: match.id,
                    roundIndex: match.roundIndex || 0,
                    teamAId: match.teamAId!,
                    teamBId: match.teamBId!,
                    winnerId,
                    games: (match.games || []).map(g => ({ scoreA: g.scoreA || 0, scoreB: g.scoreB || 0 })),
                    note: match.note || undefined, // Include note to filter out third place matches
                  }
                })
            : undefined
          
          // Build bracket based on tournament format
          if (isMLP) {
            // MLP format: No play-in, only 4 teams (top-2 from each pool)
            console.log('[getBracket] Building MLP bracket...')
            
            // Calculate standings per pool
            const poolStandingsMap = new Map<string, Array<{ teamId: string; teamName: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number; pointDiff: number; headToHead: Map<string, { wins: number; losses: number; pointDiff: number }> }>>()
            
            // Initialize pool standings
            division.pools.forEach(pool => {
              poolStandingsMap.set(pool.id, [])
            })
            
            // Group teams by pool and calculate standings per pool
            Array.from(teamStats.values()).forEach(stats => {
              const team = division.teams.find(t => t.id === stats.teamId)
              if (team && team.poolId) {
                const poolStandings = poolStandingsMap.get(team.poolId)
                if (poolStandings) {
                  poolStandings.push(stats)
                }
              }
            })
            
            // Sort each pool's standings using tie-breaker rules
            const poolStandings: Array<{
              poolId: string
              poolName: string
              top2?: Array<{ teamId: string; teamName: string; seed: number }>
              top4?: Array<{ teamId: string; teamName: string; seed: number }>
            }> = []
            
            const poolCount = division.pools.length
            
            poolStandingsMap.forEach((poolTeams, poolId) => {
              const pool = division.pools.find(p => p.id === poolId)
              if (!pool) return
              
              // Sort using same tie-breaker rules
              const sorted = poolTeams.sort((a, b) => {
                if (a.wins !== b.wins) return b.wins - a.wins
                
                const headToHeadA = a.headToHead.get(b.teamId)
                const headToHeadB = b.headToHead.get(a.teamId)
                if (headToHeadA && headToHeadB && headToHeadA.pointDiff !== headToHeadB.pointDiff) {
                  return headToHeadB.pointDiff - headToHeadA.pointDiff
                }
                
                if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff
                return b.pointsFor - a.pointsFor
              })
              
              if (poolCount === 1) {
                // Single pool: get top 4
                const top4 = sorted.slice(0, 4).map((team, index) => ({
                  teamId: team.teamId,
                  teamName: team.teamName,
                  seed: index + 1, // Seed within pool (1, 2, 3, or 4)
                }))
                
                poolStandings.push({
                  poolId: pool.id,
                  poolName: pool.name,
                  top4,
                })
              } else {
                // Two pools: get top 2
                const top2 = sorted.slice(0, 2).map((team, index) => ({
                  teamId: team.teamId,
                  teamName: team.teamName,
                  seed: index + 1, // Seed within pool (1 or 2)
                }))
                
                poolStandings.push({
                  poolId: pool.id,
                  poolName: pool.name,
                  top2,
                })
              }
            })
            
            // Sort pools by order to ensure consistent pairing
            poolStandings.sort((a, b) => {
              const poolA = division.pools.find(p => p.id === a.poolId)
              const poolB = division.pools.find(p => p.id === b.poolId)
              return (poolA?.order || 0) - (poolB?.order || 0)
            })
            
            // Build MLP bracket
            allBracketMatches = buildMLPBracket(poolStandings, playoffMatchData)
            console.log('[getBracket] MLP bracket built successfully:', allBracketMatches.length, 'matches')
          } else {
            // Single Elimination format: use standard bracket with play-in
            console.log('[getBracket] Calling buildCompleteBracket...', { isRRComplete })
            allBracketMatches = buildCompleteBracket(
              N,
              B,
              standings.map(s => ({ teamId: s.teamId, teamName: s.teamName, seed: s.seed })),
              playInMatchData,
              playoffMatchData
            )
            console.log('[getBracket] Bracket built successfully:', allBracketMatches.length, 'matches')
          }
        }
      } catch (error) {
        console.error('[getBracket] Error building complete bracket:', error)
        console.error('[getBracket] Error details:', {
          totalTeams: N,
          bracketSize: B,
          standingsCount: standings.length,
          playInMatchesCount: playInMatches.length,
          playoffMatchesCount: playoffMatches.length,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        })
        // If bracket building fails, return empty array - frontend will handle gracefully
        allBracketMatches = []
      }

      // Separate play-in and playoff matches for backward compatibility
      console.log('[getBracket] Separating matches for backward compatibility...')
      const playInBracket = allBracketMatches.filter(m => m.round === 0)
      const playoffBracket = allBracketMatches.filter(m => m.round > 0)

      console.log('[getBracket] Preparing response...')
      const response = {
        divisionName: division.name,
        isRRComplete,
        needsPlayIn,
        standings,
        playInBracket,
        playoffBracket,
        bracketSize: B,
        // New structure: all matches in one array
        allMatches: allBracketMatches,
      }
      
      console.log('[getBracket] Response prepared successfully:', {
        divisionName: response.divisionName,
        isRRComplete: response.isRRComplete,
        standingsCount: response.standings.length,
        allMatchesCount: response.allMatches.length,
      })
      
      return response
      } catch (error) {
        console.error('[getBracket] Fatal error:', error)
        console.error('[getBracket] Error details:', {
          divisionId: input.divisionId,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        
        // Return TRPCError for proper error handling
        if (error instanceof TRPCError) {
          throw error
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get bracket',
          cause: error,
        })
      }
    }),

  getBracketPublic: publicProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Same logic as getBracket but public
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: true,
          matches: {
            include: {
              teamA: true,
              teamB: true,
              games: {
                orderBy: { index: 'asc' }
              },
            },
          },
          tournament: { select: { id: true, format: true } },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const isMLP = division.tournament?.format === 'MLP'

      const rrMatches = division.matches.filter(m => m.stage === 'ROUND_ROBIN')
      const playInMatches = division.matches.filter(m => m.stage === 'PLAY_IN')
      const playoffMatches = division.matches.filter(m => m.stage === 'ELIMINATION')

      const teamStats: Map<string, { teamId: string; teamName: string; wins: number; losses: number; pointDiff: number }> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: getTeamDisplayName(team, division.teamKind),
          wins: 0,
          losses: 0,
          pointDiff: 0,
        })
      })

      rrMatches.forEach(match => {
        const teamAStats = teamStats.get(match.teamAId)
        const teamBStats = teamStats.get(match.teamBId)
        
        if (!teamAStats || !teamBStats) return

        const totalScoreA = match.games.reduce((sum, game) => sum + (game.scoreA ?? 0), 0)
        const totalScoreB = match.games.reduce((sum, game) => sum + (game.scoreB ?? 0), 0)

        teamAStats.pointDiff += totalScoreA - totalScoreB
        teamBStats.pointDiff += totalScoreB - totalScoreA

        if (totalScoreA > totalScoreB) {
          teamAStats.wins += 1
          teamBStats.losses += 1
        } else if (totalScoreB > totalScoreA) {
          teamBStats.wins += 1
          teamAStats.losses += 1
        }
      })

      const standings = Array.from(teamStats.values())
        .sort((a, b) => {
          if (a.wins !== b.wins) return b.wins - a.wins
          return b.pointDiff - a.pointDiff
        })
        .map((stats, index) => ({
          ...stats,
          seed: index + 1,
        }))

      const completedRRMatches = rrMatches.filter(m => {
        if (!m.games || m.games.length === 0) return false
        
        // For MLP matches, check if all 4 games are completed
        const matchGamesCount = m.gamesCount || m.games.length
        const isMLPMatch = isMLP && matchGamesCount === 4
        
        if (isMLPMatch) {
          // MLP: all 4 games must have non-null scores and not be tied
          if (m.games.length !== 4) return false
          return m.games.every(g => 
            g.scoreA !== null && 
            g.scoreA !== undefined && 
            g.scoreB !== null && 
            g.scoreB !== undefined &&
            g.scoreA !== g.scoreB &&
            g.scoreA >= 0 &&
            g.scoreB >= 0
          )
        } else {
          // Non-MLP: at least one game with non-zero score
          return m.games.some(g => 
            (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) || 
            (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0)
          )
        }
      })
      const isRRComplete = completedRRMatches.length === rrMatches.length && rrMatches.length > 0

      const N = division.teams.length
      const B = division.maxTeams || Math.min(16, N)
      const needsPlayIn = B < N && N < 2 * B

      let playInBracket: any[] = []
      if (needsPlayIn && isRRComplete) {
        const E = N - B
        const playInTeams = standings.slice(N - 2 * E)
        
        if (playInMatches.length > 0) {
          playInBracket = playInMatches.map((match, index) => {
            const totalScoreA = match.games.reduce((sum, game) => sum + (game.scoreA ?? 0), 0)
            const totalScoreB = match.games.reduce((sum, game) => sum + (game.scoreB ?? 0), 0)
            const isCompleted = match.games.length > 0 && (totalScoreA > 0 || totalScoreB > 0)
            const winner = isCompleted ? (totalScoreA > totalScoreB ? match.teamA : match.teamB) : null

            return {
              matchId: match.id,
              roundIndex: match.roundIndex,
              teamA: {
                id: match.teamAId,
                name: match.teamA.name,
                seed: playInTeams[index * 2]?.seed,
              },
              teamB: {
                id: match.teamBId,
                name: match.teamB.name,
                seed: playInTeams[index * 2 + 1]?.seed,
              },
              isCompleted,
              winner: winner ? { id: winner.id, name: winner.name } : null,
            }
          })
        } else {
          for (let i = 0; i < E; i++) {
            playInBracket.push({
              matchId: null,
              roundIndex: 0,
              teamA: {
                id: playInTeams[i].teamId,
                name: playInTeams[i].teamName,
                seed: playInTeams[i].seed,
              },
              teamB: {
                id: playInTeams[playInTeams.length - 1 - i].teamId,
                name: playInTeams[playInTeams.length - 1 - i].teamName,
                seed: playInTeams[playInTeams.length - 1 - i].seed,
              },
              isCompleted: false,
              winner: null,
            })
          }
        }
      }

      const playoffBracket: any[] = []
      if (isRRComplete) {
        const autoQualified = needsPlayIn ? standings.slice(0, N - 2 * (N - B)) : standings
        const playInWinners: any[] = []

        if (playInMatches.length > 0) {
          const completedPlayIn = playInMatches.filter(m => {
            const totalScoreA = m.games.reduce((sum, game) => sum + (game.scoreA ?? 0), 0)
            const totalScoreB = m.games.reduce((sum, game) => sum + (game.scoreB ?? 0), 0)
            return m.games.length > 0 && (totalScoreA > 0 || totalScoreB > 0)
          })
          const allPlayInComplete = completedPlayIn.length === playInMatches.length

          if (allPlayInComplete) {
            playInMatches.forEach(match => {
              const totalScoreA = match.games.reduce((sum, game) => sum + (game.scoreA ?? 0), 0)
              const totalScoreB = match.games.reduce((sum, game) => sum + (game.scoreB ?? 0), 0)
              if (totalScoreA > totalScoreB) {
                playInWinners.push({ id: match.teamAId, name: match.teamA.name })
              } else {
                playInWinners.push({ id: match.teamBId, name: match.teamB.name })
              }
            })
          }
        }

        const playoffTeams = needsPlayIn 
          ? [...autoQualified.map(s => ({ id: s.teamId, name: s.teamName, seed: s.seed })), ...playInWinners.map((w, i) => ({ id: w.id, name: w.name, seed: N - 2 * (N - B) + i + 1 }))]
          : standings.map(s => ({ id: s.teamId, name: s.teamName, seed: s.seed }))

        const rounds: Map<number, any[]> = new Map()
        
        if (playoffMatches.length > 0) {
          playoffMatches.forEach(match => {
            const round = match.roundIndex || 0
            if (!rounds.has(round)) {
              rounds.set(round, [])
            }
            
            const totalScoreA = match.games.reduce((sum, game) => sum + (game.scoreA ?? 0), 0)
            const totalScoreB = match.games.reduce((sum, game) => sum + (game.scoreB ?? 0), 0)
            const isCompleted = match.games.length > 0 && (totalScoreA > 0 || totalScoreB > 0)
            const winner = isCompleted ? (totalScoreA > totalScoreB ? match.teamA : match.teamB) : null

            rounds.get(round)!.push({
              matchId: match.id,
              roundIndex: round,
              teamA: {
                id: match.teamAId,
                name: match.teamA.name,
                seed: playoffTeams.find(t => t.id === match.teamAId)?.seed,
              },
              teamB: {
                id: match.teamBId,
                name: match.teamB.name,
                seed: playoffTeams.find(t => t.id === match.teamBId)?.seed,
              },
              isCompleted,
              winner: winner ? { id: winner.id, name: winner.name } : null,
            })
          })
        } else {
          let currentRoundTeams = [...playoffTeams]
          let roundIndex = 0
          
          while (currentRoundTeams.length > 1) {
            const roundMatches: any[] = []
            for (let i = 0; i < currentRoundTeams.length / 2; i++) {
              roundMatches.push({
                matchId: null,
                roundIndex,
                teamA: currentRoundTeams[i],
                teamB: currentRoundTeams[currentRoundTeams.length - 1 - i],
                isCompleted: false,
                winner: null,
              })
            }
            rounds.set(roundIndex, roundMatches)
            roundIndex++
            currentRoundTeams = currentRoundTeams.slice(0, currentRoundTeams.length / 2)
          }
        }

        const sortedRounds = Array.from(rounds.entries()).sort((a, b) => a[0] - b[0])
        sortedRounds.forEach(([roundIndex, matches]) => {
          playoffBracket.push(...matches)
        })
      }

      return {
        divisionName: division.name,
        isRRComplete,
        needsPlayIn,
        standings,
        playInBracket,
        playoffBracket,
        bracketSize: B,
      }
    }),

  generatePlayoffAfterPlayIn: tdProcedure
    .input(z.object({ 
      divisionId: z.string(),
      bracketSize: z.enum(['4', '8', '16']).transform(val => parseInt(val)),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get division with teams and matches
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: {
            include: {
              teamPlayers: {
                include: {
                  player: true,
                },
              },
            },
          },
          matches: {
            where: { stage: 'PLAY_IN' },
            include: {
              teamA: {
                include: {
                  teamPlayers: {
                    include: {
                      player: true,
                    },
                  },
                },
              },
              teamB: {
                include: {
                  teamPlayers: {
                    include: {
                      player: true,
                    },
                  },
                },
              },
              games: true,
            },
          },
          tournament: { select: { id: true, format: true } },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      // Delete existing Play-Off matches before regenerating
      await ctx.prisma.match.deleteMany({
        where: {
          divisionId: input.divisionId,
          stage: 'ELIMINATION'
        }
      })

      // Check if all play-in matches are completed
      const playInMatches = division.matches.filter(m => m.stage === 'PLAY_IN')
      const completedPlayInMatches = playInMatches.filter(match => 
        match.games && match.games.length > 0 && match.games.some(g => (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) || (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0))
      )

      if (completedPlayInMatches.length !== playInMatches.length) {
        throw new Error('All play-in matches must be completed before generating playoffs')
      }

      // Calculate standings and determine playoff participants
      const teamStats: Map<string, TeamStats> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: getTeamDisplayName(team, division.teamKind),
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0,
          headToHead: new Map(),
        })
      })

      // Get all RR matches to calculate standings
      const rrMatches = await ctx.prisma.match.findMany({
        where: { 
          divisionId: input.divisionId,
          stage: 'ROUND_ROBIN'
        },
        include: {
          teamA: true,
          teamB: true,
          games: true,
          tiebreaker: true,
        },
      })

      // Process RR matches for standings
      const isMLP = division.tournament?.format === 'MLP'
      
      rrMatches.forEach(match => {
        const teamAStats = teamStats.get(match.teamAId)
        const teamBStats = teamStats.get(match.teamBId)
        
        if (!teamAStats || !teamBStats) return

        const totalScoreA = match.games.reduce((sum, game) => sum + (game.scoreA ?? 0), 0)
        const totalScoreB = match.games.reduce((sum, game) => sum + (game.scoreB ?? 0), 0)

        teamAStats.pointsFor += totalScoreA
        teamAStats.pointsAgainst += totalScoreB
        teamBStats.pointsFor += totalScoreB
        teamBStats.pointsAgainst += totalScoreA

        // Determine winner - for MLP matches, use tiebreaker if exists
        let winnerTeamId: string | null = null
        
        if (isMLP && match.tiebreaker) {
          // MLP match with tiebreaker - use tiebreaker winner
          winnerTeamId = match.tiebreaker.winnerTeamId
        } else if (match.winnerTeamId) {
          // Use match winnerTeamId if set
          winnerTeamId = match.winnerTeamId
        } else {
          // Fallback to games score
          if (totalScoreA > totalScoreB) {
            winnerTeamId = match.teamAId
          } else if (totalScoreB > totalScoreA) {
            winnerTeamId = match.teamBId
          }
        }

        // Update wins/losses based on winner
        if (winnerTeamId === match.teamAId) {
          teamAStats.wins++
          teamBStats.losses++
        } else if (winnerTeamId === match.teamBId) {
          teamBStats.wins++
          teamAStats.losses++
        }
      })

      // Calculate standings
      const standings = Array.from(teamStats.values())
        .sort((a, b) => {
          if (a.wins !== b.wins) return b.wins - a.wins
          return b.pointDiff - a.pointDiff
        })

      const N = division.teams.length
      const B = input.bracketSize
      const E = N - B

      // Get play-in winners
      const playInWinners = []
      for (const match of playInMatches) {
        const totalScoreA = match.games.reduce((sum, game) => sum + (game.scoreA ?? 0), 0)
        const totalScoreB = match.games.reduce((sum, game) => sum + (game.scoreB ?? 0), 0)
        
        if (totalScoreA > totalScoreB) {
          playInWinners.push(match.teamA)
        } else {
          playInWinners.push(match.teamB)
        }
      }

      // Sort play-in winners by their original seeding
      playInWinners.sort((a, b) => {
        const aIndex = standings.findIndex(s => s.teamId === a.id)
        const bIndex = standings.findIndex(s => s.teamId === b.id)
        return aIndex - bIndex
      })

      // Get auto-qualified teams (top teams that didn't need play-in)
      const autoQualifiedTeamIds = standings.slice(0, N - 2 * E).map(s => s.teamId)
      const autoQualified = division.teams.filter(team => autoQualifiedTeamIds.includes(team.id))

      console.log('=== Play-Off Generation After Play-In Debug ===')
      console.log('Full RR standings:')
      standings.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.teamName} (${s.wins}W, ${s.pointDiff > 0 ? '+' : ''}${s.pointDiff}PD)`)
      })
      console.log('Auto-qualified team IDs:', autoQualifiedTeamIds)
      console.log('Play-In winners:', playInWinners.map(w => w.name))

      // Get IDs of all playoff participants (auto-qualified + play-in winners)
      const playInWinnerIds = playInWinners.map(w => w.id)
      const allPlayoffParticipantIds = [...autoQualifiedTeamIds, ...playInWinnerIds]

      // Sort ALL playoff participants by their standings from Round Robin
      // №1 plays with last by points (excluding those who lost in play-in)
      // №2 plays with second-to-last, etc.
      const playoffTeamsSorted = standings
        .filter(s => allPlayoffParticipantIds.includes(s.teamId))
        .map(s => ({
          teamId: s.teamId,
          teamName: s.teamName,
          wins: s.wins,
          pointDiff: s.pointDiff
        }))

      console.log('Playoff participants (sorted by RR standings):')
      playoffTeamsSorted.forEach((team, idx) => {
        console.log(`  ${idx + 1}. ${team.teamName} (${team.wins}W, ${team.pointDiff > 0 ? '+' : ''}${team.pointDiff}PD)`)
      })

      const playoffMatches = generateSingleEliminationMatches(playoffTeamsSorted, 0)
      
      console.log('Generated playoff pairings:')
      playoffMatches.forEach((match, idx) => {
        const teamA = playoffTeamsSorted.find(t => t.teamId === match.teamAId)
        const teamB = playoffTeamsSorted.find(t => t.teamId === match.teamBId)
        console.log(`  Match ${idx + 1}: ${teamA?.teamName} vs ${teamB?.teamName}`)
      })
      console.log('===========================')

      // Create playoff matches in database
      const createdMatches = await Promise.all(
        playoffMatches.map(match =>
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

      // Update division stage to PO_R1_SCHEDULED
      await ctx.prisma.division.update({
        where: { id: input.divisionId },
        data: { stage: 'PO_R1_SCHEDULED' as any },
      })

      return {
        matches: createdMatches,
        bracketSize: B,
        teamsCount: N,
        autoQualified: autoQualified.length,
        playInWinners: playInWinners.length,
      }
    }),

  swapPlayoffTeams: tdProcedure
    .input(z.object({
      divisionId: z.string(),
      swaps: z.array(z.object({
        matchId: z.string(),
        newTeamAId: z.string(),
        newTeamBId: z.string()
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      // Get division to verify it exists and get tournament ID
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: { select: { id: true } }
        }
      })

      if (!division) {
        throw new Error('Division not found')
      }

      // Update each match with new team assignments
      for (const swap of input.swaps) {
        await ctx.prisma.match.update({
          where: { id: swap.matchId },
          data: {
            teamAId: swap.newTeamAId,
            teamBId: swap.newTeamBId
          }
        })
      }

      // Log the swap operation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournament.id,
          action: 'SWAP_PLAYOFF_TEAMS',
          entityType: 'Division',
          entityId: input.divisionId,
          payload: {
            divisionId: input.divisionId,
            swaps: input.swaps
          },
        },
      })

      return { success: true, swapsCount: input.swaps.length }
    }),
})

// Helper functions
function generatePlayInMatches(teams: any[], startRound: number) {
  const matches = []
  const E = teams.length / 2

  for (let i = 0; i < E; i++) {
    matches.push({
      teamAId: teams[i].teamId,
      teamBId: teams[teams.length - 1 - i].teamId,
      roundIndex: startRound,
      stage: 'PLAY_IN' as const,
    })
  }

  return matches
}

function generateSingleEliminationMatches(teams: any[], startRound: number) {
  const matches = []
  const B = teams.length

  // Only generate the first round - subsequent rounds will be generated as previous rounds complete
  for (let i = 0; i < B / 2; i++) {
    matches.push({
      teamAId: teams[i].teamId,
      teamBId: teams[B - 1 - i].teamId,
      roundIndex: startRound,
      stage: 'ELIMINATION' as const,
    })
  }

  return matches
}

function generateThirdPlaceMatch(semiFinalMatches: any[], startRound: number) {
  const matches = []
  
  // Find semi-final losers
  const semiFinalLosers = semiFinalMatches
    .map(match => {
      // This will be called after semi-finals are completed
      // For now, we'll create placeholder teams
      return {
        teamAId: match.teamAId, // Will be updated to actual loser
        teamBId: match.teamBId, // Will be updated to actual loser
        roundIndex: startRound,
        stage: 'ELIMINATION' as const,
        isThirdPlace: true,
      }
    })
    .filter((_, index) => index === 0) // Only create one third place match
  
  if (semiFinalLosers.length > 0) {
    matches.push(semiFinalLosers[0])
  }
  
  return matches
}
