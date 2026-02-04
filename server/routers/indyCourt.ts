import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, tdProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'

export const indyCourtRouter = createTRPCRouter({
  list: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      return ctx.prisma.court.findMany({
        where: { tournamentId: input.tournamentId },
        orderBy: { createdAt: 'asc' },
      })
    }),

  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      const existingCount = await ctx.prisma.court.count({
        where: { tournamentId: input.tournamentId },
      })

      return ctx.prisma.court.create({
        data: {
          tournamentId: input.tournamentId,
          name: `Court #${existingCount + 1}`,
        },
      })
    }),

  update: tdProcedure
    .input(z.object({
      courtId: z.string(),
      name: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const court = await ctx.prisma.court.findUnique({
        where: { id: input.courtId },
        select: { tournamentId: true },
      })

      if (!court) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Court not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, court.tournamentId)

      return ctx.prisma.court.update({
        where: { id: input.courtId },
        data: { name: input.name },
      })
    }),
})
