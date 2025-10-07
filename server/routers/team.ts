import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '@/server/trpc'

export const teamRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      divisionId: z.string(),
      name: z.string().min(1),
      seed: z.number().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const team = await ctx.prisma.team.create({
        data: {
          divisionId: input.divisionId,
          name: input.name,
          seed: input.seed,
          note: input.note,
        },
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.divisionId, // We'll need to get this from division
          action: 'CREATE',
          entityType: 'Team',
          entityId: team.id,
          payload: input,
        },
      })

      return team
    }),

  update: tdProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      divisionId: z.string().optional(),
      seed: z.number().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input
      
      const team = await ctx.prisma.team.update({
        where: { id },
        data: updateData,
      })

      // Log the update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.divisionId, // We'll need to get this from division
          action: 'UPDATE',
          entityType: 'Team',
          entityId: team.id,
          payload: input,
        },
      })

      return team
    }),

  delete: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.id },
        include: { division: true },
      })

      if (!team) {
        throw new Error('Team not found')
      }

      // Delete team players first
      await ctx.prisma.teamPlayer.deleteMany({
        where: { teamId: input.id },
      })

      // Delete the team
      await ctx.prisma.team.delete({
        where: { id: input.id },
      })

      // Log the deletion
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'DELETE',
          entityType: 'Team',
          entityId: input.id,
          payload: { teamName: team.name },
        },
      })

      return { success: true }
    }),

  moveToPool: tdProcedure
    .input(z.object({
      teamId: z.string(),
      poolId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        include: { division: true },
      })

      if (!team) {
        throw new Error('Team not found')
      }

      // If poolId is provided, verify it belongs to the same division
      if (input.poolId) {
        const pool = await ctx.prisma.pool.findUnique({
          where: { id: input.poolId },
        })

        if (!pool || pool.divisionId !== team.divisionId) {
          throw new Error('Pool not found or does not belong to team division')
        }
      }

      const updatedTeam = await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: { poolId: input.poolId },
      })

      // Log the move
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'MOVE_TO_POOL',
          entityType: 'Team',
          entityId: input.teamId,
          payload: {
            teamName: team.name,
            divisionName: team.division.name,
            poolId: input.poolId,
          },
        },
      })

      return updatedTeam
    }),

  moveToDivision: tdProcedure
    .input(z.object({
      teamId: z.string(),
      divisionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get current team and target division
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        include: { division: true },
      })

      const targetDivision = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
      })

      if (!team || !targetDivision) {
        throw new Error('Team or division not found')
      }

      // Check if target division has capacity
      if (targetDivision.maxTeams) {
        const currentTeamCount = await ctx.prisma.team.count({
          where: { divisionId: input.divisionId },
        })

        if (currentTeamCount >= targetDivision.maxTeams) {
          // Find the last team in target division and move it to source division
          const lastTeam = await ctx.prisma.team.findFirst({
            where: { divisionId: input.divisionId },
            orderBy: { createdAt: 'desc' },
          })

          if (lastTeam) {
            // Get source division pools for auto-move
            const sourceDivisionWithPools = await ctx.prisma.division.findUnique({
              where: { id: team.divisionId },
              include: { pools: { orderBy: { order: 'asc' } } }
            })

            await ctx.prisma.team.update({
              where: { id: lastTeam.id },
              data: { 
                divisionId: team.divisionId,
                poolId: sourceDivisionWithPools?.pools.length > 0 ? sourceDivisionWithPools.pools[0].id : null
              },
            })

            // Log the auto-move
            await ctx.prisma.auditLog.create({
              data: {
                actorUserId: ctx.session.user.id,
                tournamentId: targetDivision.tournamentId,
                action: 'AUTO_MOVE',
                entityType: 'Team',
                entityId: lastTeam.id,
                payload: {
                  fromDivision: targetDivision.name,
                  toDivision: team.division.name,
                  reason: 'Division capacity exceeded',
                },
              },
            })
          }
        }
      }

      // Move the team to target division
      // If target division has pools, assign team to first pool, otherwise set poolId to null
      const targetDivisionWithPools = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: { pools: { orderBy: { order: 'asc' } } }
      })

      const updatedTeam = await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: { 
          divisionId: input.divisionId,
          poolId: targetDivisionWithPools?.pools.length > 0 ? targetDivisionWithPools.pools[0].id : null
        },
      })

      // Log the move
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: targetDivision.tournamentId,
          action: 'MOVE',
          entityType: 'Team',
          entityId: input.teamId,
          payload: {
            teamName: team.name,
            fromDivision: team.division.name,
            toDivision: targetDivision.name,
          },
        },
      })

      return updatedTeam
    }),
})