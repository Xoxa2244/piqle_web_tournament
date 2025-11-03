import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '../trpc'

export const publicRouter = createTRPCRouter({
  getBoard: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { publicSlug: input.slug },
        include: {
          divisions: {
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
              pools: true,
              constraints: true,
            },
          },
          prizes: true,
          rrGroups: {
            include: {
              standings: {
                include: {
                  team: true,
                },
                orderBy: [
                  { wins: 'desc' },
                  { pointDiff: 'desc' },
                  { pointsFor: 'desc' },
                ],
              },
              matches: {
                select: {
                  id: true,
                  teamAId: true,
                  teamBId: true,
                  roundIndex: true,
                  stage: true,
                  note: true,
                  poolId: true,
                  teamA: true,
                  teamB: true,
                  games: {
                    orderBy: { index: 'asc' },
                  },
                },
                orderBy: { roundIndex: 'asc' },
              },
            },
          },
        },
      })

      if (!tournament) {
        throw new Error('Tournament not found')
      }

      if (!tournament.isPublicBoardEnabled) {
        throw new Error('Public board is disabled for this tournament')
      }

      return tournament
    }),

  getStandings: publicProcedure
    .input(z.object({ 
      slug: z.string(),
      divisionId: z.string().optional(),
      rrGroupId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { publicSlug: input.slug },
        select: { id: true, isPublicBoardEnabled: true },
      })

      if (!tournament || !tournament.isPublicBoardEnabled) {
        throw new Error('Tournament not found or public board disabled')
      }

      const standings = await ctx.prisma.standing.findMany({
        where: {
          ...(input.divisionId && { divisionId: input.divisionId }),
          ...(input.rrGroupId && { rrGroupId: input.rrGroupId }),
        },
        include: {
          team: true,
        },
        orderBy: [
          { wins: 'desc' },
          { pointDiff: 'desc' },
          { pointsFor: 'desc' },
        ],
      })

      return standings
    }),

  getMatches: publicProcedure
    .input(z.object({ 
      slug: z.string(),
      divisionId: z.string().optional(),
      rrGroupId: z.string().optional(),
      stage: z.enum(['ROUND_ROBIN', 'ELIMINATION', 'PLAY_IN']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { publicSlug: input.slug },
        select: { id: true, isPublicBoardEnabled: true },
      })

      if (!tournament || !tournament.isPublicBoardEnabled) {
        throw new Error('Tournament not found or public board disabled')
      }

      const matches = await ctx.prisma.match.findMany({
        where: {
          ...(input.divisionId && { divisionId: input.divisionId }),
          ...(input.rrGroupId && { rrGroupId: input.rrGroupId }),
          ...(input.stage && { stage: input.stage }),
        },
        select: {
          id: true,
          teamAId: true,
          teamBId: true,
          roundIndex: true,
          stage: true,
          note: true,
          poolId: true,
          teamA: true,
          teamB: true,
          games: {
            orderBy: { index: 'asc' },
          },
        },
        orderBy: { roundIndex: 'asc' },
      })

      return matches
    }),

  getBracketPublic: publicProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Re-export from standings router for consistency
      // Import the standings router function logic
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
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const rrMatches = division.matches.filter(m => m.stage === 'ROUND_ROBIN')
      const playInMatches = division.matches.filter(m => m.stage === 'PLAY_IN')
      const playoffMatches = division.matches.filter(m => m.stage === 'ELIMINATION')

      const teamStats: Map<string, { teamId: string; teamName: string; wins: number; losses: number; pointDiff: number }> = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: team.name,
          wins: 0,
          losses: 0,
          pointDiff: 0,
        })
      })

      rrMatches.forEach(match => {
        const teamAStats = teamStats.get(match.teamAId)
        const teamBStats = teamStats.get(match.teamBId)
        
        if (!teamAStats || !teamBStats) return

        const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
        const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)

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

      const completedRRMatches = rrMatches.filter(m => 
        m.games.length > 0 && m.games.some(g => g.scoreA > 0 || g.scoreB > 0)
      )
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
            const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
            const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
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
            const totalScoreA = m.games.reduce((sum, game) => sum + game.scoreA, 0)
            const totalScoreB = m.games.reduce((sum, game) => sum + game.scoreB, 0)
            return m.games.length > 0 && (totalScoreA > 0 || totalScoreB > 0)
          })
          const allPlayInComplete = completedPlayIn.length === playInMatches.length

          if (allPlayInComplete) {
            playInMatches.forEach(match => {
              const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
              const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
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
            
            const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
            const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
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
})
