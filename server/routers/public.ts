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
                include: {
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
        include: {
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
})
