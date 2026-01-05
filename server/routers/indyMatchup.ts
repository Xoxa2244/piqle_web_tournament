import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'

// Fixed schema for 12 games
const GAMES_SCHEMA = [
  { order: 1, court: 1, homePair: 'AB', awayPair: 'AB' },
  { order: 2, court: 2, homePair: 'CD', awayPair: 'CD' },
  { order: 3, court: 1, homePair: 'AB', awayPair: 'CD' },
  { order: 4, court: 2, homePair: 'CD', awayPair: 'AB' },
  { order: 5, court: 1, homePair: 'AC', awayPair: 'AC' },
  { order: 6, court: 2, homePair: 'BD', awayPair: 'BD' },
  { order: 7, court: 1, homePair: 'AC', awayPair: 'BD' },
  { order: 8, court: 2, homePair: 'BD', awayPair: 'AC' },
  { order: 9, court: 1, homePair: 'AD', awayPair: 'AD' },
  { order: 10, court: 2, homePair: 'BC', awayPair: 'BC' },
  { order: 11, court: 1, homePair: 'AD', awayPair: 'BC' },
  { order: 12, court: 2, homePair: 'BC', awayPair: 'AD' },
] as const

export const indyMatchupRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      matchDayId: z.string(),
      divisionId: z.string(),
      homeTeamId: z.string(),
      awayTeamId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify match day exists and get tournament
      const matchDay = await ctx.prisma.matchDay.findUnique({
        where: { id: input.matchDayId },
        include: {
          tournament: {
            select: { id: true, userId: true, format: true },
          },
        },
      })

      if (!matchDay) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Match day not found',
        })
      }

      if (matchDay.tournament.format !== 'INDY_LEAGUE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This endpoint is only for IndyLeague tournaments',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchDay.tournament.id)

      // Verify teams are in the same division
      const homeTeam = await ctx.prisma.team.findUnique({
        where: { id: input.homeTeamId },
        select: { divisionId: true },
      })

      const awayTeam = await ctx.prisma.team.findUnique({
        where: { id: input.awayTeamId },
        select: { divisionId: true },
      })

      if (!homeTeam || !awayTeam) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or both teams not found',
        })
      }

      if (homeTeam.divisionId !== input.divisionId || awayTeam.divisionId !== input.divisionId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Teams must be in the specified division',
        })
      }

      if (input.homeTeamId === input.awayTeamId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Home and away teams cannot be the same',
        })
      }

      const matchup = await ctx.prisma.indyMatchup.create({
        data: {
          matchDayId: input.matchDayId,
          divisionId: input.divisionId,
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          status: 'PENDING',
        },
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: matchDay.tournament.id,
          action: 'CREATE_INDY_MATCHUP',
          entityType: 'IndyMatchup',
          entityId: matchup.id,
          payload: {
            matchDayId: input.matchDayId,
            divisionId: input.divisionId,
          },
        },
      })

      return matchup
    }),

  list: protectedProcedure
    .input(z.object({
      matchDayId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const matchups = await ctx.prisma.indyMatchup.findMany({
        where: { matchDayId: input.matchDayId },
        include: {
          division: true,
          homeTeam: {
            include: {
              teamPlayers: {
                include: {
                  player: true,
                },
              },
            },
          },
          awayTeam: {
            include: {
              teamPlayers: {
                include: {
                  player: true,
                },
              },
            },
          },
          rosters: {
            include: {
              player: true,
              team: true,
            },
          },
          games: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      // Sort by division name manually to avoid nested orderBy issues
      return matchups.sort((a, b) => {
        const divisionA = a.division?.name || ''
        const divisionB = b.division?.name || ''
        if (divisionA !== divisionB) {
          return divisionA.localeCompare(divisionB)
        }
        return a.createdAt.getTime() - b.createdAt.getTime()
      })
    }),

  get: protectedProcedure
    .input(z.object({
      matchupId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const matchup = await ctx.prisma.indyMatchup.findUnique({
        where: { id: input.matchupId },
        include: {
          division: true,
          homeTeam: {
            include: {
              teamPlayers: {
                include: {
                  player: true,
                },
              },
            },
          },
          awayTeam: {
            include: {
              teamPlayers: {
                include: {
                  player: true,
                },
              },
            },
          },
          rosters: {
            include: {
              player: true,
              team: true,
            },
          },
          games: {
            orderBy: { order: 'asc' },
          },
          matchDay: {
            include: {
              tournament: {
                select: { id: true, title: true, format: true },
              },
            },
          },
        },
      })

      if (!matchup) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Matchup not found',
        })
      }

      return matchup
    }),

  swapHomeAway: tdProcedure
    .input(z.object({
      matchupId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const matchup = await ctx.prisma.indyMatchup.findUnique({
        where: { id: input.matchupId },
        include: {
          matchDay: {
            include: {
              tournament: {
                select: { id: true, userId: true },
              },
            },
          },
          games: {
            orderBy: { order: 'asc' },
          },
        },
      })

      if (!matchup) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Matchup not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchup.matchDay.tournament.id)

      // Swap home and away teams
      const newHomeTeamId = matchup.awayTeamId
      const newAwayTeamId = matchup.homeTeamId

      // Update matchup
      const updated = await ctx.prisma.indyMatchup.update({
        where: { id: input.matchupId },
        data: {
          homeTeamId: newHomeTeamId,
          awayTeamId: newAwayTeamId,
          gamesWonHome: matchup.gamesWonAway,
          gamesWonAway: matchup.gamesWonHome,
        },
      })

      // Swap scores in all games (homeScore <-> awayScore)
      if (matchup.games.length > 0) {
        await Promise.all(
          matchup.games.map((game) =>
            ctx.prisma.indyGame.update({
              where: { id: game.id },
              data: {
                homeScore: game.awayScore,
                awayScore: game.homeScore,
              },
            })
          )
        )
      }

      // Log the swap
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: matchup.matchDay.tournament.id,
          action: 'SWAP_HOME_AWAY',
          entityType: 'IndyMatchup',
          entityId: input.matchupId,
          payload: {},
        },
      })

      return updated
    }),

  updateRoster: tdProcedure
    .input(z.object({
      matchupId: z.string(),
      rosters: z.array(z.object({
        playerId: z.string(),
        teamId: z.string(),
        isActive: z.boolean(),
        letter: z.enum(['A', 'B', 'C', 'D']).nullable(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const matchup = await ctx.prisma.indyMatchup.findUnique({
        where: { id: input.matchupId },
        include: {
          matchDay: {
            include: {
              tournament: {
                select: { id: true, userId: true },
              },
            },
          },
          rosters: true,
        },
      })

      if (!matchup) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Matchup not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchup.matchDay.tournament.id)

      // Validate: exactly 4 active players per team
      const homeTeamRosters = input.rosters.filter((r) => r.teamId === matchup.homeTeamId)
      const awayTeamRosters = input.rosters.filter((r) => r.teamId === matchup.awayTeamId)

      const homeActiveCount = homeTeamRosters.filter((r) => r.isActive).length
      const awayActiveCount = awayTeamRosters.filter((r) => r.isActive).length

      if (homeActiveCount !== 4) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Home team must have exactly 4 active players, got ${homeActiveCount}`,
        })
      }

      if (awayActiveCount !== 4) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Away team must have exactly 4 active players, got ${awayActiveCount}`,
        })
      }

      // Validate: all active players have unique letters
      const homeActiveLetters = homeTeamRosters
        .filter((r) => r.isActive && r.letter)
        .map((r) => r.letter)
      const awayActiveLetters = awayTeamRosters
        .filter((r) => r.isActive && r.letter)
        .map((r) => r.letter)

      if (new Set(homeActiveLetters).size !== homeActiveLetters.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Home team active players must have unique letters',
        })
      }

      if (new Set(awayActiveLetters).size !== awayActiveLetters.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Away team active players must have unique letters',
        })
      }

      // Validate: all active players have letters
      const homeActiveWithoutLetters = homeTeamRosters.filter(
        (r) => r.isActive && !r.letter
      )
      const awayActiveWithoutLetters = awayTeamRosters.filter(
        (r) => r.isActive && !r.letter
      )

      if (homeActiveWithoutLetters.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'All active home team players must have letters assigned',
        })
      }

      if (awayActiveWithoutLetters.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'All active away team players must have letters assigned',
        })
      }

      // Update or create rosters
      await Promise.all(
        input.rosters.map((roster) =>
          ctx.prisma.dayRoster.upsert({
            where: {
              matchupId_teamId_playerId: {
                matchupId: input.matchupId,
                teamId: roster.teamId,
                playerId: roster.playerId,
              },
            },
            create: {
              matchupId: input.matchupId,
              teamId: roster.teamId,
              playerId: roster.playerId,
              isActive: roster.isActive,
              letter: roster.isActive ? roster.letter : null,
            },
            update: {
              isActive: roster.isActive,
              letter: roster.isActive ? roster.letter : null,
            },
          })
        )
      )

      // Update matchup status to READY if both teams have 4 active players with letters
      const updatedRosters = await ctx.prisma.dayRoster.findMany({
        where: { matchupId: input.matchupId },
      })

      const homeActive = updatedRosters.filter(
        (r) => r.teamId === matchup.homeTeamId && r.isActive && r.letter
      )
      const awayActive = updatedRosters.filter(
        (r) => r.teamId === matchup.awayTeamId && r.isActive && r.letter
      )

      const newStatus =
        homeActive.length === 4 && awayActive.length === 4
          ? matchup.status === 'PENDING'
            ? 'READY'
            : matchup.status
          : 'PENDING'

      const updated = await ctx.prisma.indyMatchup.update({
        where: { id: input.matchupId },
        data: { status: newStatus },
        include: {
          rosters: {
            include: {
              player: true,
              team: true,
            },
          },
        },
      })

      return updated
    }),

  generateGames: tdProcedure
    .input(z.object({
      matchupId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const matchup = await ctx.prisma.indyMatchup.findUnique({
        where: { id: input.matchupId },
        include: {
          matchDay: {
            include: {
              tournament: {
                select: { id: true, userId: true },
              },
            },
          },
          rosters: {
            where: { isActive: true },
            include: {
              player: true,
              team: true,
            },
          },
          games: true,
        },
      })

      if (!matchup) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Matchup not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchup.matchDay.tournament.id)

      // Check if matchup is READY
      if (matchup.status !== 'READY') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Matchup must be READY to generate games',
        })
      }

      // Check if games already exist
      if (matchup.games.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Games already generated for this matchup',
        })
      }

      // Validate rosters
      const homeRosters = matchup.rosters.filter((r) => r.teamId === matchup.homeTeamId)
      const awayRosters = matchup.rosters.filter((r) => r.teamId === matchup.awayTeamId)

      if (homeRosters.length !== 4 || awayRosters.length !== 4) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Both teams must have exactly 4 active players with letters',
        })
      }

      // Create 12 games according to fixed schema
      await Promise.all(
        GAMES_SCHEMA.map((gameSchema) =>
          ctx.prisma.indyGame.create({
            data: {
              matchupId: input.matchupId,
              order: gameSchema.order,
              court: gameSchema.court,
              homePair: gameSchema.homePair,
              awayPair: gameSchema.awayPair,
            },
          })
        )
      )

      // Update matchup status to IN_PROGRESS
      const updated = await ctx.prisma.indyMatchup.update({
        where: { id: input.matchupId },
        data: { status: 'IN_PROGRESS' },
        include: {
          games: {
            orderBy: { order: 'asc' },
          },
        },
      })

      // Log the generation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: matchup.matchDay.tournament.id,
          action: 'GENERATE_INDY_GAMES',
          entityType: 'IndyMatchup',
          entityId: input.matchupId,
          payload: {},
        },
      })

      return updated
    }),

  updateGameScore: protectedProcedure
    .input(z.object({
      gameId: z.string(),
      homeScore: z.number().int().min(0).nullable(),
      awayScore: z.number().int().min(0).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const game = await ctx.prisma.indyGame.findUnique({
        where: { id: input.gameId },
        include: {
          matchup: {
            include: {
              matchDay: {
                include: {
                  tournament: {
                    select: { id: true, userId: true },
                  },
                },
              },
            },
          },
        },
      })

      if (!game) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Game not found',
        })
      }

      // Check access (tournament admin or assistant)
      const isAdmin = game.matchup.matchDay.tournament.userId === ctx.session.user.id
      // TODO: Check assistant access

      if (!isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this game',
        })
      }

      // Validate: no ties allowed
      if (
        input.homeScore !== null &&
        input.awayScore !== null &&
        input.homeScore === input.awayScore
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Ties are not allowed in games',
        })
      }

      const updated = await ctx.prisma.indyGame.update({
        where: { id: input.gameId },
        data: {
          homeScore: input.homeScore,
          awayScore: input.awayScore,
        },
      })

      // Recalculate games won for the matchup
      await recalculateMatchupGamesWon(ctx.prisma, game.matchupId)

      return updated
    }),

  updateTieBreak: tdProcedure
    .input(z.object({
      matchupId: z.string(),
      tieBreakWinnerTeamId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const matchup = await ctx.prisma.indyMatchup.findUnique({
        where: { id: input.matchupId },
        include: {
          matchDay: {
            include: {
              tournament: {
                select: { id: true, userId: true },
              },
            },
          },
          games: true,
        },
      })

      if (!matchup) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Matchup not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchup.matchDay.tournament.id)

      // Validate: must be 6-6
      if (matchup.gamesWonHome !== 6 || matchup.gamesWonAway !== 6) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tie-break can only be set when games are 6-6',
        })
      }

      // Validate: winner must be one of the teams
      if (
        input.tieBreakWinnerTeamId !== matchup.homeTeamId &&
        input.tieBreakWinnerTeamId !== matchup.awayTeamId
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tie-break winner must be one of the teams in the matchup',
        })
      }

      const updated = await ctx.prisma.indyMatchup.update({
        where: { id: input.matchupId },
        data: {
          tieBreakWinnerTeamId: input.tieBreakWinnerTeamId,
        },
      })

      // Check if matchup can be completed
      await checkAndUpdateMatchupStatus(ctx.prisma, input.matchupId)

      return updated
    }),

  finalize: tdProcedure
    .input(z.object({
      matchupId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const matchup = await ctx.prisma.indyMatchup.findUnique({
        where: { id: input.matchupId },
        include: {
          matchDay: {
            include: {
              tournament: {
                select: { id: true, userId: true },
              },
            },
          },
          games: true,
        },
      })

      if (!matchup) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Matchup not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchup.matchDay.tournament.id)

      // Validate: all 12 games must be completed
      const incompleteGames = matchup.games.filter(
        (g) => g.homeScore === null || g.awayScore === null
      )

      if (incompleteGames.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot finalize: ${incompleteGames.length} game(s) are incomplete`,
        })
      }

      // Validate: must have a winner (either by games won or tie-break)
      if (matchup.gamesWonHome === 6 && matchup.gamesWonAway === 6) {
        if (!matchup.tieBreakWinnerTeamId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot finalize: games are 6-6 but tie-break winner is not set',
          })
        }
      }

      const updated = await ctx.prisma.indyMatchup.update({
        where: { id: input.matchupId },
        data: { status: 'COMPLETED' },
      })

      // Log the finalization
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: matchup.matchDay.tournament.id,
          action: 'FINALIZE_INDY_MATCHUP',
          entityType: 'IndyMatchup',
          entityId: input.matchupId,
          payload: {},
        },
      })

      return updated
    }),

  getLatestForTeam: protectedProcedure
    .input(z.object({
      teamId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get the latest matchup for this team (home or away)
      const matchup = await ctx.prisma.indyMatchup.findFirst({
        where: {
          OR: [
            { homeTeamId: input.teamId },
            { awayTeamId: input.teamId },
          ],
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          matchDay: {
            include: {
              tournament: {
                select: { id: true },
              },
            },
          },
        },
      })

      return matchup
    }),

  getRosters: protectedProcedure
    .input(z.object({
      matchupId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const rosters = await ctx.prisma.dayRoster.findMany({
        where: {
          matchupId: input.matchupId,
        },
        include: {
          player: true,
          team: true,
        },
        orderBy: [
          { teamId: 'asc' },
          { isActive: 'desc' },
          { letter: 'asc' },
        ],
      })

      return rosters
    }),

  updatePlayerLetter: tdProcedure
    .input(z.object({
      matchupId: z.string(),
      playerId: z.string(),
      teamId: z.string(),
      letter: z.enum(['A', 'B', 'C', 'D']).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify matchup exists and get tournament
      const matchup = await ctx.prisma.indyMatchup.findUnique({
        where: { id: input.matchupId },
        include: {
          matchDay: {
            include: {
              tournament: {
                select: { id: true, userId: true },
              },
            },
          },
        },
      })

      if (!matchup) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Matchup not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchup.matchDay.tournament.id)

      // Verify team is part of this matchup
      if (matchup.homeTeamId !== input.teamId && matchup.awayTeamId !== input.teamId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Team is not part of this matchup',
        })
      }

      // Find or create roster entry
      const roster = await ctx.prisma.dayRoster.findUnique({
        where: {
          matchupId_teamId_playerId: {
            matchupId: input.matchupId,
            teamId: input.teamId,
            playerId: input.playerId,
          },
        },
      })

      if (!roster) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Player roster not found. Please add player to roster first.',
        })
      }

      // If assigning a letter, check if it's already taken by another active player on the same team
      if (input.letter) {
        const letterTaken = await ctx.prisma.dayRoster.findFirst({
          where: {
            matchupId: input.matchupId,
            teamId: input.teamId,
            playerId: { not: input.playerId },
            letter: input.letter,
            isActive: true,
          },
        })

        if (letterTaken) {
          // Remove letter from the other player
          await ctx.prisma.dayRoster.update({
            where: { id: letterTaken.id },
            data: { letter: null },
          })
        }
      }

      // Update this player's letter
      const updated = await ctx.prisma.dayRoster.update({
        where: {
          matchupId_teamId_playerId: {
            matchupId: input.matchupId,
            teamId: input.teamId,
            playerId: input.playerId,
          },
        },
        data: {
          letter: input.letter,
          // If assigning a letter, make player active
          isActive: input.letter ? true : roster.isActive,
        },
        include: {
          player: true,
          team: true,
        },
      })

      // Update matchup status if needed
      const allRosters = await ctx.prisma.dayRoster.findMany({
        where: { matchupId: input.matchupId },
      })

      const homeActive = allRosters.filter(
        (r) => r.teamId === matchup.homeTeamId && r.isActive && r.letter
      )
      const awayActive = allRosters.filter(
        (r) => r.teamId === matchup.awayTeamId && r.isActive && r.letter
      )

      const newStatus =
        homeActive.length === 4 && awayActive.length === 4
          ? matchup.status === 'PENDING' ? 'READY' : matchup.status
          : 'PENDING'

      if (newStatus !== matchup.status) {
        await ctx.prisma.indyMatchup.update({
          where: { id: input.matchupId },
          data: { status: newStatus },
        })
      }

      return updated
    }),

  delete: tdProcedure
    .input(z.object({
      matchupId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const matchup = await ctx.prisma.indyMatchup.findUnique({
        where: { id: input.matchupId },
        include: {
          matchDay: {
            include: {
              tournament: {
                select: { id: true, userId: true },
              },
            },
          },
        },
      })

      if (!matchup) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Matchup not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchup.matchDay.tournament.id)

      // Cannot delete matchup if match day is finalized
      if (matchup.matchDay.status === 'FINALIZED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete matchup from finalized match day',
        })
      }

      await ctx.prisma.indyMatchup.delete({
        where: { id: input.matchupId },
      })

      // Log the deletion
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: matchup.matchDay.tournament.id,
          action: 'DELETE_INDY_MATCHUP',
          entityType: 'IndyMatchup',
          entityId: input.matchupId,
          payload: {
            matchDayId: matchup.matchDayId,
            divisionId: matchup.divisionId,
          },
        },
      })

      return { success: true }
    }),
})

// Helper function to recalculate games won
async function recalculateMatchupGamesWon(prisma: any, matchupId: string) {
  const games = await prisma.indyGame.findMany({
    where: { matchupId },
  })

  let gamesWonHome = 0
  let gamesWonAway = 0

  for (const game of games) {
    if (game.homeScore !== null && game.awayScore !== null) {
      if (game.homeScore > game.awayScore) {
        gamesWonHome++
      } else if (game.awayScore > game.homeScore) {
        gamesWonAway++
      }
      // Ties are not allowed (validated on update)
    }
  }

  await prisma.indyMatchup.update({
    where: { id: matchupId },
    data: {
      gamesWonHome,
      gamesWonAway,
    },
  })

  // Check if matchup status should be updated
  await checkAndUpdateMatchupStatus(prisma, matchupId)
}

// Helper function to check and update matchup status
async function checkAndUpdateMatchupStatus(prisma: any, matchupId: string) {
  const matchup = await prisma.indyMatchup.findUnique({
    where: { id: matchupId },
    include: {
      games: true,
    },
  })

  if (!matchup) return

  // Check if all games are completed
  const allGamesCompleted = matchup.games.every(
    (g: any) => g.homeScore !== null && g.awayScore !== null
  )

  if (allGamesCompleted) {
    // Check if 6-6 and tie-break needed
    if (matchup.gamesWonHome === 6 && matchup.gamesWonAway === 6 && !matchup.tieBreakWinnerTeamId) {
      // Status stays IN_PROGRESS, waiting for tie-break
      return
    }

    // All games completed and winner determined
    await prisma.indyMatchup.update({
      where: { id: matchupId },
      data: { status: 'COMPLETED' },
    })
  }
}

