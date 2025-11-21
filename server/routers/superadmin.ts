import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, publicProcedure } from '../trpc'

// Super admin credentials
const SUPERADMIN_LOGIN = 'superadmin'
const SUPERADMIN_PASSWORD = 'hammer24'

export const superadminRouter = createTRPCRouter({
  // Authenticate super admin
  authenticate: publicProcedure
    .input(z.object({
      login: z.string(),
      password: z.string(),
    }))
    .mutation(async ({ input }) => {
      if (input.login === SUPERADMIN_LOGIN && input.password === SUPERADMIN_PASSWORD) {
        return { success: true }
      }
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      })
    }),

  // Get all tournaments (no access checks)
  getAllTournaments: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tournaments = await ctx.prisma.tournament.findMany({
        where: input?.userId ? { userId: input.userId } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          divisions: {
            select: {
              id: true,
              name: true,
              _count: {
                select: {
                  teams: true,
                  matches: true,
                },
              },
            },
          },
          _count: {
            select: {
              divisions: true,
            },
          },
        },
      })

      return tournaments
    }),

  // Get all users who own tournaments
  getAllTournamentOwners: publicProcedure
    .query(async ({ ctx }) => {
      // Get unique user IDs from tournaments
      const tournaments = await ctx.prisma.tournament.findMany({
        select: {
          userId: true,
        },
        distinct: ['userId'],
      })

      const userIds = tournaments.map(t => t.userId).filter(Boolean)

      if (userIds.length === 0) {
        return []
      }

      // Get user details
      const users = await ctx.prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: {
          name: 'asc',
        },
      })

      return users
    }),

  // Get tournament by ID (no access checks)
  getTournament: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
              matches: {
                include: {
                  teamA: true,
                  teamB: true,
                  games: {
                    orderBy: { index: 'asc' },
                  },
                },
              },
              pools: true,
              constraints: true,
            },
          },
          prizes: true,
        },
      })

      if (!tournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      return tournament
    }),

  // Update tournament (no access checks)
  updateTournament: publicProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      rulesUrl: z.string().url().optional(),
      venueName: z.string().optional(),
      venueAddress: z.string().optional(),
      startDate: z.string().transform((str) => new Date(str)).optional(),
      endDate: z.string().transform((str) => new Date(str)).optional(),
      entryFee: z.number().optional(),
      isPublicBoardEnabled: z.boolean().optional(),
      publicSlug: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const tournament = await ctx.prisma.tournament.update({
        where: { id },
        data,
      })

      return tournament
    }),

  // Delete tournament (no access checks)
  deleteTournament: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Delete all related data
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.id },
        include: {
          divisions: {
            include: {
              matches: {
                include: {
                  games: true,
                },
              },
            },
          },
        },
      })

      if (!tournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      // Delete all games
      for (const division of tournament.divisions) {
        for (const match of division.matches) {
          await ctx.prisma.game.deleteMany({
            where: { matchId: match.id },
          })
        }
      }

      // Delete all matches
      for (const division of tournament.divisions) {
        await ctx.prisma.match.deleteMany({
          where: { divisionId: division.id },
        })
      }

      // Delete standings
      await ctx.prisma.standing.deleteMany({
        where: {
          divisionId: {
            in: tournament.divisions.map(d => d.id),
          },
        },
      })

      // Delete tournament access
      await ctx.prisma.tournamentAccess.deleteMany({
        where: { tournamentId: input.id },
      })

      // Delete divisions (this will cascade delete teams, teamPlayers, etc.)
      await ctx.prisma.division.deleteMany({
        where: { tournamentId: input.id },
      })

      // Delete prizes
      await ctx.prisma.prize.deleteMany({
        where: { tournamentId: input.id },
      })

      // Finally delete tournament
      return ctx.prisma.tournament.delete({
        where: { id: input.id },
      })
    }),
})

