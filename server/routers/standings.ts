import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

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
          teams: true,
          matches: {
            where: { stage: 'ROUND_ROBIN' },
            include: {
              teamA: true,
              teamB: true,
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

      // Initialize team stats
      const teamStats: Map<string, TeamStats> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: team.name,
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
          teamAPoints += game.scoreA
          teamBPoints += game.scoreB
        })

        // Update overall stats
        teamAStats.pointsFor += teamAPoints
        teamAStats.pointsAgainst += teamBPoints
        teamBStats.pointsFor += teamBPoints
        teamBStats.pointsAgainst += teamAPoints

        // Determine winner
        if (teamAPoints > teamBPoints) {
          teamAStats.wins += 1
          teamBStats.losses += 1
        } else if (teamBPoints > teamAPoints) {
          teamBStats.wins += 1
          teamAStats.losses += 1
        }
        // If equal, both teams get 0.5 wins (handled in sorting)

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

  generatePlayoffs: tdProcedure
    .input(z.object({ 
      divisionId: z.string(),
      bracketSize: z.enum(['4', '8', '16']).transform(val => parseInt(val)),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get division with teams and matches
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: true,
          matches: {
            where: { stage: 'ROUND_ROBIN' },
            include: {
              teamA: true,
              teamB: true,
              games: true,
            },
          },
          tournament: { select: { id: true } },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      if (division.teams.length < 2) {
        throw new Error('Need at least 2 teams to generate playoffs')
      }

      // Calculate standings inline
      const teamStats: Map<string, TeamStats> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: team.name,
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
          teamAPoints += game.scoreA
          teamBPoints += game.scoreB
        })

        // Update overall stats
        teamAStats.pointsFor += teamAPoints
        teamAStats.pointsAgainst += teamBPoints
        teamBStats.pointsFor += teamBPoints
        teamBStats.pointsAgainst += teamAPoints

        // Determine winner
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

      // Check if playoffs already exist
      const existingPlayoffs = await ctx.prisma.match.findMany({
        where: { 
          divisionId: input.divisionId,
          stage: { in: ['PLAY_IN', 'ELIMINATION'] },
        },
      })

      if (existingPlayoffs.length > 0) {
        throw new Error('Playoffs already generated for this division')
      }

      const matches = []

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

        // Generate playoff matches (will be updated after play-in results)
        const playoffMatches = generateSingleEliminationMatches([...autoQualified, ...playInTeams], 0)
        matches.push(...playoffMatches)
      } else {
        throw new Error(`Invalid team count ${N} for bracket size ${B}`)
      }

      // Create matches in database
      const createdMatches = await Promise.all(
        matches.map(match =>
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
          },
        },
      })

      return {
        matches: createdMatches,
        bracketSize: B,
        teamsCount: N,
        playInNeeded: B < N && N < 2 * B,
      }
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
  const rounds = Math.log2(B)

  // First round matches
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
