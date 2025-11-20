import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '../trpc'

export const publicRouter = createTRPCRouter({
  listBoards: publicProcedure.query(async ({ ctx }) => {
    const tournaments = await ctx.prisma.tournament.findMany({
      where: {
        isPublicBoardEnabled: true,
      },
      select: {
        id: true,
        title: true,
        description: true,
        venueName: true,
        startDate: true,
        endDate: true,
        entryFee: true,
        publicSlug: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
        divisions: {
          select: {
            id: true,
            name: true,
          },
        },
        tournamentRatings: {
          select: {
            rating: true,
          },
        },
      },
    })

    // Calculate karma for each tournament and sort by karma (descending)
    const tournamentsWithKarma = tournaments.map((tournament) => {
      const likes = tournament.tournamentRatings.filter((r) => r.rating === 'LIKE').length
      const dislikes = tournament.tournamentRatings.filter((r) => r.rating === 'DISLIKE').length
      const karma = likes - dislikes

      return {
        ...tournament,
        karma,
        likes,
        dislikes,
      }
    })

    // Sort by karma (descending), then by startDate (descending)
    tournamentsWithKarma.sort((a, b) => {
      if (a.karma !== b.karma) {
        return b.karma - a.karma
      }
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    })

    // Remove tournamentRatings from response (we already calculated karma)
    return tournamentsWithKarma.map(({ tournamentRatings, ...tournament }) => tournament)
  }),

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

        // Always generate full bracket structure based on bracket size B
        const rounds: Map<number, any[]> = new Map()
        const numRounds = Math.ceil(Math.log2(B))
        
        // Build a map of existing matches by round (sorted by team seeds for consistent ordering)
        const existingMatchesByRound: Map<number, any[]> = new Map()
        playoffMatches.forEach(match => {
          const round = match.roundIndex || 0
          if (!existingMatchesByRound.has(round)) {
            existingMatchesByRound.set(round, [])
          }
          const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
          const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
          const isCompleted = match.games.length > 0 && (totalScoreA > 0 || totalScoreB > 0)
          const winner = isCompleted ? (totalScoreA > totalScoreB ? match.teamA : match.teamB) : null
          
          const teamASeed = playoffTeams.find(t => t.id === match.teamAId)?.seed || 999
          const teamBSeed = playoffTeams.find(t => t.id === match.teamBId)?.seed || 999
          
          const matchData = {
            matchId: match.id,
            roundIndex: round,
            teamA: {
              id: match.teamAId,
              name: match.teamA.name,
              seed: teamASeed,
            },
            teamB: {
              id: match.teamBId,
              name: match.teamB.name,
              seed: teamBSeed,
            },
            isCompleted,
            winner: winner ? { id: winner.id, name: winner.name } : null,
            minSeed: Math.min(teamASeed, teamBSeed),
          }
          existingMatchesByRound.get(round)!.push(matchData)
        })
        
        // Sort matches within each round by min seed for consistent ordering
        existingMatchesByRound.forEach((matches, round) => {
          matches.sort((a, b) => a.minSeed - b.minSeed)
        })
        
        // Generate full bracket structure for all rounds
        for (let roundIndex = 0; roundIndex < numRounds; roundIndex++) {
          const matchesInRound = Math.pow(2, numRounds - roundIndex - 1)
          const roundMatches: any[] = []
          
          if (roundIndex === 0) {
            // First round: use actual teams or existing matches
            const existingRound0 = existingMatchesByRound.get(0) || []
            
            for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex++) {
              const existingMatch = existingRound0[matchIndex]
              
              if (existingMatch) {
                const { minSeed, ...matchWithoutSeed } = existingMatch
                roundMatches.push(matchWithoutSeed)
              } else if (playoffTeams.length > 0) {
                // Preview: pair teams based on standard bracket seeding
                const teamAIndex = matchIndex * 2
                const teamBIndex = (matchIndex * 2 + 1) < playoffTeams.length 
                  ? (matchIndex * 2 + 1) 
                  : null
                
                if (teamBIndex !== null && teamBIndex < playoffTeams.length) {
                  roundMatches.push({
                    matchId: null,
                    roundIndex: 0,
                    teamA: playoffTeams[teamAIndex],
                    teamB: playoffTeams[teamBIndex],
                    isCompleted: false,
                    winner: null,
                  })
                } else {
                  roundMatches.push({
                    matchId: null,
                    roundIndex: 0,
                    teamA: { id: '', name: 'TBD', seed: undefined },
                    teamB: { id: '', name: 'TBD', seed: undefined },
                    isCompleted: false,
                    winner: null,
                  })
                }
              } else {
                roundMatches.push({
                  matchId: null,
                  roundIndex: 0,
                  teamA: { id: '', name: 'TBD', seed: undefined },
                  teamB: { id: '', name: 'TBD', seed: undefined },
                  isCompleted: false,
                  winner: null,
                })
              }
            }
          } else {
            // Subsequent rounds: use winners from previous round or empty slots
            const previousRoundMatches = rounds.get(roundIndex - 1) || []
            const existingRound = existingMatchesByRound.get(roundIndex) || []
            
            for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex++) {
              const existingMatch = existingRound[matchIndex]
              
              if (existingMatch) {
                const { minSeed, ...matchWithoutSeed } = existingMatch
                roundMatches.push(matchWithoutSeed)
              } else {
                // Determine teams from previous round winners
                const prevMatchIndex1 = matchIndex * 2
                const prevMatchIndex2 = matchIndex * 2 + 1
                
                const prevMatch1 = previousRoundMatches[prevMatchIndex1]
                const prevMatch2 = previousRoundMatches[prevMatchIndex2]
                
                let teamA: { id: string; name: string; seed: number | undefined } = { id: '', name: 'TBD', seed: undefined }
                let teamB: { id: string; name: string; seed: number | undefined } = { id: '', name: 'TBD', seed: undefined }
                
                if (prevMatch1?.winner) {
                  teamA = {
                    id: prevMatch1.winner.id,
                    name: prevMatch1.winner.name,
                    seed: playoffTeams.find(t => t.id === prevMatch1.winner.id)?.seed,
                  }
                } else if (prevMatch1?.teamA?.id && prevMatch1?.teamB?.id) {
                  teamA = { id: '', name: 'Winner of Match ' + (prevMatchIndex1 + 1), seed: undefined }
                }
                
                if (prevMatch2?.winner) {
                  teamB = {
                    id: prevMatch2.winner.id,
                    name: prevMatch2.winner.name,
                    seed: playoffTeams.find(t => t.id === prevMatch2.winner.id)?.seed,
                  }
                } else if (prevMatch2?.teamA?.id && prevMatch2?.teamB?.id) {
                  teamB = { id: '', name: 'Winner of Match ' + (prevMatchIndex2 + 1), seed: undefined }
                }
                
                roundMatches.push({
                  matchId: null,
                  roundIndex,
                  teamA,
                  teamB,
                  isCompleted: false,
                  winner: null,
                })
              }
            }
          }
          
          rounds.set(roundIndex, roundMatches)
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
