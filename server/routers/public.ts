import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '../trpc'
import { getTeamDisplayName } from '../utils/teamDisplay'

const hasMissingTournamentOptionalColumns = (error: unknown) => {
  const message = String((error as any)?.message ?? '').toLowerCase()
  if (!message) return false
  return (
    message.includes('timezone') ||
    message.includes('registration_start_date') ||
    message.includes('registration_end_date')
  )
}

export const publicRouter = createTRPCRouter({
  listBoards: publicProcedure.query(async ({ ctx }) => {
    const baseSelect = {
      id: true,
      title: true,
      description: true,
      format: true,
      clubId: true,
      venueName: true,
      venueAddress: true,
      venueAddressEn: true,
      venueCityEn: true,
      venueStateEn: true,
      venueCountryEn: true,
      venuePlaceId: true,
      venueProvider: true,
      startDate: true,
      endDate: true,
      entryFee: true,
      publicSlug: true,
      image: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
        },
      },
      club: {
        select: {
          id: true,
          name: true,
        },
      },
      divisions: {
        select: {
          id: true,
          name: true,
          maxTeams: true,
          _count: {
            select: {
              teams: true,
            },
          },
        },
      },
      _count: {
        select: {
          players: true,
        },
      },
      tournamentRatings: {
        select: {
          rating: true,
        },
      },
    } as const

    let tournaments: any[]
    try {
      tournaments = await ctx.prisma.tournament.findMany({
        where: {
          isPublicBoardEnabled: true,
        },
        select: {
          ...baseSelect,
          timezone: true,
          registrationStartDate: true,
          registrationEndDate: true,
        },
      })
    } catch (error) {
      if (!hasMissingTournamentOptionalColumns(error)) {
        throw error
      }
      const fallback = await ctx.prisma.tournament.findMany({
        where: {
          isPublicBoardEnabled: true,
        },
        select: baseSelect,
      })
      tournaments = fallback.map((item) => ({
        ...item,
        timezone: null,
        registrationStartDate: null,
        registrationEndDate: null,
      }))
    }

    // Calculate karma for each tournament and sort by karma (descending)
    const tournamentsWithKarma = tournaments.map((tournament) => {
      const likes = tournament.tournamentRatings.filter((r: any) => r.rating === 'LIKE').length
      const dislikes = tournament.tournamentRatings.filter((r: any) => r.rating === 'DISLIKE').length
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

  getBoardById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const baseSelect = {
        id: true,
        title: true,
        description: true,
        format: true,
        clubId: true,
        venueName: true,
        venueAddress: true,
        venueAddressEn: true,
        venueCityEn: true,
        venueStateEn: true,
        venueCountryEn: true,
        venuePlaceId: true,
        venueProvider: true,
        startDate: true,
        endDate: true,
        entryFee: true,
        publicSlug: true,
        image: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
        club: {
          select: {
            id: true,
            name: true,
          },
        },
        divisions: {
          select: {
            id: true,
            name: true,
            maxTeams: true,
            teamKind: true,
            _count: {
              select: {
                teams: true,
              },
            },
          },
        },
        prizes: {
          orderBy: {
            place: 'asc',
          },
          select: {
            id: true,
            place: true,
            label: true,
            amount: true,
            kind: true,
          },
        },
        _count: {
          select: {
            players: true,
          },
        },
      } as const

      let tournament: any
      try {
        tournament = await ctx.prisma.tournament.findUnique({
          where: { id: input.id },
          select: {
            ...baseSelect,
            timezone: true,
            registrationStartDate: true,
            registrationEndDate: true,
          },
        })
      } catch (error) {
        if (!hasMissingTournamentOptionalColumns(error)) {
          throw error
        }
        const fallback = await ctx.prisma.tournament.findUnique({
          where: { id: input.id },
          select: baseSelect,
        })
        tournament = fallback
          ? {
              ...fallback,
              timezone: null,
              registrationStartDate: null,
              registrationEndDate: null,
            }
          : null
      }
      if (!tournament) return null
      return tournament
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

  getTournamentById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.id },
        include: {
          club: {
            select: {
              id: true,
              name: true,
            },
          },
          divisions: {
            include: {
              constraints: true,
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
              matches: {
                include: {
                  teamA: true,
                  teamB: true,
                  games: {
                    orderBy: { index: 'asc' },
                  },
                },
              },
            },
          },
          prizes: true,
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

  getPublicStandings: publicProcedure
    .input(
      z.object({
        divisionId: z.string(),
        /** League Round Robin / Ladder League: restrict standings to one match day (public mobile & web). */
        matchDayId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Check that division belongs to a public tournament
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: {
            select: {
              id: true,
              isPublicBoardEnabled: true,
              format: true,
            },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      if (!division.tournament.isPublicBoardEnabled) {
        throw new Error('Public board is disabled for this tournament')
      }

      const fmt = division.tournament.format
      const useMatchDayFilter =
        Boolean(input.matchDayId) &&
        (fmt === 'LEAGUE_ROUND_ROBIN' || fmt === 'LADDER_LEAGUE')

      // Reuse the logic from standings router
      const divisionWithData = await ctx.prisma.division.findUnique({
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
            where: {
              stage: 'ROUND_ROBIN',
              ...(useMatchDayFilter ? { matchDayId: input.matchDayId } : {}),
            },
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

      if (!divisionWithData) {
        throw new Error('Division not found')
      }

      if (divisionWithData.teams.length < 2) {
        throw new Error('Need at least 2 teams to calculate standings')
      }

      // Initialize team stats
      const teamStats: Map<string, { teamId: string; teamName: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number; pointDiff: number; headToHead: Map<string, { wins: number; losses: number; pointDiff: number }> }> = new Map()
      
      divisionWithData.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: getTeamDisplayName(team, divisionWithData.teamKind),
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0,
          headToHead: new Map(),
        })
      })

      // Process matches
      divisionWithData.matches.forEach(match => {
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

      return {
        standings: standings.map((team, index) => ({
          ...team,
          rank: index + 1,
          headToHead: Object.fromEntries(team.headToHead),
        })),
        totalMatches: divisionWithData.matches.length,
        completedMatches: divisionWithData.matches.filter(m => m.games.length > 0).length,
      }
    }),

  getPublicDivisionStage: publicProcedure
    .input(
      z.object({
        divisionId: z.string(),
        matchDayId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Check that division belongs to a public tournament
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: {
            select: {
              id: true,
              isPublicBoardEnabled: true,
              format: true,
            },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      if (!division.tournament.isPublicBoardEnabled) {
        throw new Error('Public board is disabled for this tournament')
      }

      const fmt = division.tournament.format
      const useMatchDayFilter =
        Boolean(input.matchDayId) &&
        (fmt === 'LEAGUE_ROUND_ROBIN' || fmt === 'LADDER_LEAGUE')

      // Get division with all necessary data
      const divisionWithData = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        select: {
          id: true,
          name: true,
          stage: true,
          teams: {
            select: {
              id: true,
              name: true,
              poolId: true,
              teamPlayers: {
                select: {
                  id: true,
                  player: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
          pools: {
            select: { id: true, name: true, order: true }
          },
          matches: {
            ...(useMatchDayFilter && input.matchDayId
              ? { where: { matchDayId: input.matchDayId } }
              : {}),
            select: {
              id: true,
              teamAId: true,
              teamBId: true,
              roundIndex: true,
              stage: true,
              note: true,
              poolId: true,
              locked: true,
              matchDayId: true,
              teamA: {
                include: {
                  pool: true,
                  teamPlayers: {
                    select: {
                      id: true,
                      player: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  },
                },
              },
              teamB: {
                include: {
                  pool: true,
                  teamPlayers: {
                    select: {
                      id: true,
                      player: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  },
                },
              },
              games: true,
            },
          },
        },
      })

      if (!divisionWithData) {
        throw new Error('Division not found')
      }

      return divisionWithData
    }),

  getBracketPublic: publicProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Re-export from standings router for consistency
      // Import the standings router function logic
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

      const completedRRMatches = rrMatches.filter(m => 
        m.games.length > 0 && m.games.some(g => (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) || (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0))
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
          const totalScoreA = match.games.reduce((sum, game) => sum + (game.scoreA ?? 0), 0)
          const totalScoreB = match.games.reduce((sum, game) => sum + (game.scoreB ?? 0), 0)
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

  getIndyMatchDays: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: { id: true, isPublicBoardEnabled: true, format: true },
      })

      if (!tournament || !tournament.isPublicBoardEnabled) {
        throw new Error('Tournament not found or public board disabled')
      }
      if (
        tournament.format !== 'INDY_LEAGUE' &&
        tournament.format !== 'LEAGUE_ROUND_ROBIN' &&
        tournament.format !== 'LADDER_LEAGUE'
      ) {
        return []
      }

      return ctx.prisma.matchDay.findMany({
        where: { tournamentId: input.tournamentId },
        select: {
          id: true,
          date: true,
          status: true,
        },
        orderBy: { date: 'asc' },
      })
    }),

  getIndyMatchupsByDay: publicProcedure
    .input(z.object({ matchDayId: z.string() }))
    .query(async ({ ctx, input }) => {
      const matchDay = await ctx.prisma.matchDay.findUnique({
        where: { id: input.matchDayId },
        select: {
          id: true,
          tournament: { select: { id: true, isPublicBoardEnabled: true, format: true } },
        },
      })

      if (!matchDay || !matchDay.tournament.isPublicBoardEnabled) {
        throw new Error('Match day not found or public board disabled')
      }
      if (matchDay.tournament.format !== 'INDY_LEAGUE') return []

      return ctx.prisma.indyMatchup.findMany({
        where: { matchDayId: input.matchDayId },
        include: {
          division: {
            select: { id: true, name: true },
          },
          homeTeam: {
            select: { id: true, name: true },
          },
          awayTeam: {
            select: { id: true, name: true },
          },
          court: {
            select: { id: true, name: true },
          },
          rosters: {
            include: {
              player: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          games: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              order: true,
              homeScore: true,
              awayScore: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  getPublicIndyStandings: publicProcedure
    .input(z.object({
      tournamentId: z.string(),
      divisionId: z.string().optional(),
      matchDayId: z.string().optional(),
      mode: z.enum(['DAY_ONLY', 'SEASON_TO_DATE']).default('SEASON_TO_DATE'),
    }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: { id: true, format: true, isPublicBoardEnabled: true },
      })
      if (!tournament || !tournament.isPublicBoardEnabled || tournament.format !== 'INDY_LEAGUE') {
        return { standings: [] }
      }

      let matchDays: { id: string; date: Date }[] = []
      if (input.mode === 'DAY_ONLY' && input.matchDayId) {
        const matchDay = await ctx.prisma.matchDay.findUnique({
          where: { id: input.matchDayId },
          select: { id: true, date: true },
        })
        if (matchDay) matchDays = [matchDay]
      } else {
        matchDays = await ctx.prisma.matchDay.findMany({
          where: { tournamentId: input.tournamentId },
          orderBy: { date: 'asc' },
          select: { id: true, date: true },
        })
      }

      const divisionFilter: { tournamentId: string; id?: string } = { tournamentId: input.tournamentId }
      if (input.divisionId) divisionFilter.id = input.divisionId
      const divisions = await ctx.prisma.division.findMany({
        where: divisionFilter,
        include: { teams: true },
      })

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

      const calculateStatsForDay = async (
        matchDayId: string,
        _matchDayDate: Date,
        divisionId: string,
        teamId: string
      ) => {
        const matchups = await ctx.prisma.indyMatchup.findMany({
          where: {
            matchDayId,
            divisionId,
            OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
          },
          include: { games: true },
        })
        let wins = 0
        let losses = 0
        let pointsFor = 0
        let pointsAgainst = 0
        for (const matchup of matchups) {
          const completedGames = matchup.games.filter(
            (g: any) => g.homeScore !== null && g.awayScore !== null
          )
          if (completedGames.length === 0) continue
          let gamesWonHome = 0
          let gamesWonAway = 0
          for (const game of completedGames) {
            if (game.homeScore === null || game.awayScore === null) continue
            if (game.homeScore > game.awayScore) gamesWonHome++
            else if (game.awayScore > game.homeScore) gamesWonAway++
          }
          for (const game of completedGames) {
            if (game.homeScore === null || game.awayScore === null) continue
            if (matchup.homeTeamId === teamId) {
              pointsFor += game.homeScore
              pointsAgainst += game.awayScore
            } else {
              pointsFor += game.awayScore
              pointsAgainst += game.homeScore
            }
          }
          const allGamesCompleted =
            matchup.games.length > 0 && matchup.games.length === completedGames.length
          if (allGamesCompleted) {
            let winnerTeamId: string | null = null
            if (gamesWonHome > gamesWonAway) winnerTeamId = matchup.homeTeamId
            else if (gamesWonAway > gamesWonHome) winnerTeamId = matchup.awayTeamId
            else if (gamesWonHome === 6 && gamesWonAway === 6)
              winnerTeamId = matchup.tieBreakWinnerTeamId
            if (winnerTeamId === teamId) wins++
            else if (winnerTeamId) losses++
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
          for (const matchDay of matchDays) {
            const dayStats = await calculateStatsForDay(
              matchDay.id,
              matchDay.date,
              division.id,
              team.id
            )
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

      standings.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins
        return b.pointDiff - a.pointDiff
      })

      return { standings }
    }),
})
