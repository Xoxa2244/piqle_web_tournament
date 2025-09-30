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
            await ctx.prisma.team.update({
              where: { id: lastTeam.id },
              data: { divisionId: team.divisionId },
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
      const updatedTeam = await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: { divisionId: input.divisionId },
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