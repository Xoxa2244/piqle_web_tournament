import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const tournamentRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      rulesUrl: z.string().url().optional(),
      venueName: z.string().optional(),
      venueAddress: z.string().optional(),
      startDate: z.string().transform((str) => new Date(str)),
      endDate: z.string().transform((str) => new Date(str)),
      entryFee: z.number().optional(),
      isPublicBoardEnabled: z.boolean().default(false),
      publicSlug: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Generate unique publicSlug
      let publicSlug = input.publicSlug || input.title.toLowerCase().replace(/\s+/g, '-')
      
      // Check if slug already exists and make it unique
      let counter = 1
      let baseSlug = publicSlug
      while (await ctx.prisma.tournament.findUnique({ where: { publicSlug } })) {
        publicSlug = `${baseSlug}-${counter}`
        counter++
      }

      const tournament = await ctx.prisma.tournament.create({
        data: {
          ...input,
          publicSlug,
        },
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: tournament.id,
          action: 'CREATE',
          entityType: 'Tournament',
          entityId: tournament.id,
          payload: input,
        },
      })

      return tournament
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.tournament.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          divisions: true,
          _count: {
            select: {
              divisions: true,
            },
          },
        },
      })
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.tournament.findUnique({
        where: { id: input.id },
        include: {
          divisions: {
            include: {
              constraints: true,
              teams: true,
              pools: true,
              matches: {
                include: {
                  teamA: true,
                  teamB: true,
                },
              },
            },
          },
          prizes: true,
        },
      })
    }),

  update: tdProcedure
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

      // Log the update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: tournament.id,
          action: 'UPDATE',
          entityType: 'Tournament',
          entityId: tournament.id,
          payload: data,
        },
      })

      return tournament
    }),

  delete: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Log the deletion
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.id,
          action: 'DELETE',
          entityType: 'Tournament',
          entityId: input.id,
        },
      })

      return ctx.prisma.tournament.delete({
        where: { id: input.id },
      })
    }),

  startElimination: tdProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // This will be implemented in M5
      // For now, just log the action
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.tournamentId,
          action: 'START_ELIMINATION',
          entityType: 'Tournament',
          entityId: input.tournamentId,
        },
      })

      return { success: true }
    }),
})
