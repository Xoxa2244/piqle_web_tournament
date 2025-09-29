import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const divisionRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      name: z.string().min(1),
      teamKind: z.enum(['SINGLES_1v1', 'DOUBLES_2v2', 'SQUAD_4v4']),
      pairingMode: z.enum(['FIXED', 'MIX_AND_MATCH']),
      poolsEnabled: z.boolean().default(false),
      maxTeams: z.number().optional(),
      // Constraints
      minDupr: z.number().optional(),
      maxDupr: z.number().optional(),
      minAge: z.number().optional(),
      maxAge: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { minDupr, maxDupr, minAge, maxAge, ...divisionData } = input
      
      const division = await ctx.prisma.division.create({
        data: {
          ...divisionData,
          constraints: {
            create: {
              minDupr: minDupr ? minDupr : null,
              maxDupr: maxDupr ? maxDupr : null,
              minAge: minAge ? minAge : null,
              maxAge: maxAge ? maxAge : null,
            }
          }
        },
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.tournamentId,
          action: 'CREATE',
          entityType: 'Division',
          entityId: division.id,
          payload: input,
        },
      })

      return division
    }),

  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.division.findMany({
        where: { tournamentId: input.tournamentId },
        include: {
          constraints: true,
          teams: true,
          pools: true,
          _count: {
            select: {
              teams: true,
              pools: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.division.findUnique({
        where: { id: input.id },
        include: {
          tournament: true,
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
        },
      })
    }),

  update: tdProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      teamKind: z.enum(['SINGLES_1v1', 'DOUBLES_2v2', 'SQUAD_4v4']).optional(),
      pairingMode: z.enum(['FIXED', 'MIX_AND_MATCH']).optional(),
      poolsEnabled: z.boolean().optional(),
      maxTeams: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const division = await ctx.prisma.division.update({
        where: { id },
        data,
      })

      // Log the update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'UPDATE',
          entityType: 'Division',
          entityId: division.id,
          payload: data,
        },
      })

      return division
    }),

  delete: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.id },
        select: { tournamentId: true },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      // Log the deletion
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'DELETE',
          entityType: 'Division',
          entityId: input.id,
        },
      })

      return ctx.prisma.division.delete({
        where: { id: input.id },
      })
    }),

  setConstraints: tdProcedure
    .input(z.object({
      divisionId: z.string(),
      minDupr: z.number().optional(),
      maxDupr: z.number().optional(),
      minAge: z.number().optional(),
      maxAge: z.number().optional(),
      genders: z.enum(['ANY', 'MEN', 'WOMEN', 'MIXED']).default('ANY'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { divisionId, ...constraintsData } = input

      const division = await ctx.prisma.division.findUnique({
        where: { id: divisionId },
        select: { tournamentId: true },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const constraints = await ctx.prisma.divisionConstraints.upsert({
        where: { divisionId },
        create: {
          divisionId,
          ...constraintsData,
        },
        update: constraintsData,
      })

      // Log the update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'UPDATE_CONSTRAINTS',
          entityType: 'DivisionConstraints',
          entityId: constraints.id,
          payload: constraintsData,
        },
      })

      return constraints
    }),
})
