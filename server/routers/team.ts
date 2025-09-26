import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const teamRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      divisionId: z.string(),
      poolId: z.string().optional(),
      name: z.string().min(1),
      seed: z.number().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        select: { tournamentId: true },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const team = await ctx.prisma.team.create({
        data: input,
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'CREATE',
          entityType: 'Team',
          entityId: team.id,
          payload: input,
        },
      })

      return team
    }),

  list: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.team.findMany({
        where: { divisionId: input.divisionId },
        include: {
          teamPlayers: {
            include: {
              player: true,
            },
          },
          pool: true,
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  update: tdProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      poolId: z.string().optional(),
      seed: z.number().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      const team = await ctx.prisma.team.findUnique({
        where: { id },
        include: {
          division: {
            select: { tournamentId: true },
          },
        },
      })

      if (!team) {
        throw new Error('Team not found')
      }

      const updatedTeam = await ctx.prisma.team.update({
        where: { id },
        data,
      })

      // Log the update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'UPDATE',
          entityType: 'Team',
          entityId: team.id,
          payload: data,
        },
      })

      return updatedTeam
    }),

  delete: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.id },
        include: {
          division: {
            select: { tournamentId: true },
          },
        },
      })

      if (!team) {
        throw new Error('Team not found')
      }

      // Log the deletion
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'DELETE',
          entityType: 'Team',
          entityId: input.id,
        },
      })

      return ctx.prisma.team.delete({
        where: { id: input.id },
      })
    }),

  move: tdProcedure
    .input(z.object({
      id: z.string(),
      divisionId: z.string().optional(),
      poolId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      const team = await ctx.prisma.team.findUnique({
        where: { id },
        include: {
          division: {
            select: { tournamentId: true },
          },
        },
      })

      if (!team) {
        throw new Error('Team not found')
      }

      const updatedTeam = await ctx.prisma.team.update({
        where: { id },
        data,
      })

      // Log the move
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'MOVE',
          entityType: 'Team',
          entityId: team.id,
          payload: data,
        },
      })

      return updatedTeam
    }),
})
