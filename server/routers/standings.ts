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
        match.games.length > 0 && match.games.some(game => game.scoreA > 0 || game.scoreB > 0)
      )

      return {
        hasPlayIn: true,
        isComplete: completedMatches.length === playInMatches.length,
        completedMatches: completedMatches.length,
        totalMatches: playInMatches.length,
        incompleteMatches: playInMatches.filter(match => 
          match.games.length === 0 || !match.games.some(game => game.scoreA > 0 || game.scoreB > 0)
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

      // Check if play-in is complete (if it exists)
      const playInMatches = await ctx.prisma.match.findMany({
        where: {
          divisionId: input.divisionId,
          stage: 'PLAY_IN',
        },
        include: {
          games: true,
        },
      })

      if (playInMatches.length > 0) {
        const completedPlayInMatches = playInMatches.filter(match => 
          match.games.length > 0 && match.games.some(game => game.scoreA > 0 || game.scoreB > 0)
        )

        if (completedPlayInMatches.length !== playInMatches.length) {
          throw new Error('Play-off cannot be generated. You must enter results for all play-in matches.')
        }
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

        // DO NOT generate playoff matches yet - they will be generated after play-in completion
        // This prevents premature playoff generation before play-in results are known
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
            },
            orderBy: { roundIndex: 'asc' },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      // Find the current round (highest round with matches)
      const currentRound = Math.max(...division.matches.map(m => m.roundIndex), -1)
      
      // Get matches from current round
      const currentRoundMatches = division.matches.filter(m => m.roundIndex === currentRound)
      
      // Check if all matches in current round are completed
      const allCompleted = currentRoundMatches.every(match => 
        match.games && match.games.length > 0 && match.games[0].scoreA > 0
      )
      
      if (!allCompleted) {
        throw new Error('Current round is not completed yet')
      }

      // Get winners from current round
      const winners = currentRoundMatches.map(match => {
        const game = match.games?.[0]
        if (!game) throw new Error('No game found for completed match')
        
        // Determine winner by score instead of relying on game.winner field
        if (game.scoreA > game.scoreB) {
          return match.teamA
        } else if (game.scoreB > game.scoreA) {
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
          if (game.scoreA > game.scoreB) {
            return match.teamB
          } else if (game.scoreB > game.scoreA) {
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
        nextRoundMatches.map(match =>
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
              // Add third place flag if it exists
              ...(match.isThirdPlace && { note: 'Third Place Match' }),
            },
          })
        )
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
          teamName: team.name,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0,
          headToHead: new Map()
        })
      })

      // Process Round Robin and Play-In matches
      division.matches.forEach(match => {
        if (match.games.length === 0) return

        const game = match.games[0]
        const teamAStats = teamStats.get(match.teamAId)!
        const teamBStats = teamStats.get(match.teamBId)!

        teamAStats.pointsFor += game.scoreA
        teamAStats.pointsAgainst += game.scoreB
        teamBStats.pointsFor += game.scoreB
        teamBStats.pointsAgainst += game.scoreA

        if (game.scoreA > game.scoreB) {
          teamAStats.wins++
          teamBStats.losses++
        } else if (game.scoreB > game.scoreA) {
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
          teams: true,
          matches: {
            where: { stage: 'PLAY_IN' },
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

      // Check if all play-in matches are completed
      const playInMatches = division.matches.filter(m => m.stage === 'PLAY_IN')
      const completedPlayInMatches = playInMatches.filter(match => 
        match.games && match.games.length > 0 && match.games.some(g => g.scoreA > 0 || g.scoreB > 0)
      )

      if (completedPlayInMatches.length !== playInMatches.length) {
        throw new Error('All play-in matches must be completed before generating playoffs')
      }

      // Calculate standings and determine playoff participants
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
        },
      })

      // Process RR matches for standings
      rrMatches.forEach(match => {
        const teamAStats = teamStats.get(match.teamAId)
        const teamBStats = teamStats.get(match.teamBId)
        
        if (!teamAStats || !teamBStats) return

        const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
        const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)

        teamAStats.pointsFor += totalScoreA
        teamAStats.pointsAgainst += totalScoreB
        teamBStats.pointsFor += totalScoreB
        teamBStats.pointsAgainst += totalScoreA

        if (totalScoreA > totalScoreB) {
          teamAStats.wins++
          teamBStats.losses++
        } else {
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
        const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
        const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
        
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

      // Generate playoff matches with correct participants
      // Convert teams to the format expected by generateSingleEliminationMatches
      const playoffTeams = [...autoQualified, ...playInWinners].map(team => ({
        teamId: team.id
      }))
      const playoffMatches = generateSingleEliminationMatches(playoffTeams, 0)

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
