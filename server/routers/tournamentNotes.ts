import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, tdProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'

export const tournamentNotesRouter = createTRPCRouter({
  list: tdProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)
      return ctx.prisma.tournamentDirectorNote.findMany({
        where: {
          tournamentId: input.tournamentId,
          userId: ctx.session.user.id,
        },
        orderBy: { createdAt: 'desc' },
      })
    }),

  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      text: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)
      return ctx.prisma.tournamentDirectorNote.create({
        data: {
          tournamentId: input.tournamentId,
          userId: ctx.session.user.id,
          text: input.text.trim(),
        },
      })
    }),

  update: tdProcedure
    .input(z.object({
      id: z.string(),
      text: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.tournamentDirectorNote.findUnique({
        where: { id: input.id },
      })
      if (!note || note.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' })
      }
      return ctx.prisma.tournamentDirectorNote.update({
        where: { id: input.id },
        data: { text: input.text.trim() },
      })
    }),

  delete: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.tournamentDirectorNote.findUnique({
        where: { id: input.id },
      })
      if (!note || note.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' })
      }
      return ctx.prisma.tournamentDirectorNote.delete({
        where: { id: input.id },
      })
    }),
})
