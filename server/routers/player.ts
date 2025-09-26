import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const playerRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      dupr: z.number().optional(),
      birthDate: z.date().optional(),
      externalId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.prisma.player.create({
        data: input,
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: '', // Will be set when player is added to a team
          action: 'CREATE',
          entityType: 'Player',
          entityId: player.id,
          payload: input,
        },
      })

      return player
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.player.findMany({
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.player.findUnique({
        where: { id: input.id },
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: {
                    include: {
                      tournament: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    }),

  update: tdProcedure
    .input(z.object({
      id: z.string(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      dupr: z.number().optional(),
      birthDate: z.date().optional(),
      externalId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      const player = await ctx.prisma.player.findUnique({
        where: { id },
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: {
                    select: { tournamentId: true },
                  },
                },
              },
            },
          },
        },
      })

      if (!player) {
        throw new Error('Player not found')
      }

      const updatedPlayer = await ctx.prisma.player.update({
        where: { id },
        data,
      })

      // Log the update for each tournament the player is in
      for (const teamPlayer of player.teamPlayers) {
        await ctx.prisma.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: teamPlayer.team.division.tournamentId,
            action: 'UPDATE',
            entityType: 'Player',
            entityId: player.id,
            payload: data,
          },
        })
      }

      return updatedPlayer
    }),

  delete: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.prisma.player.findUnique({
        where: { id: input.id },
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: {
                    select: { tournamentId: true },
                  },
                },
              },
            },
          },
        },
      })

      if (!player) {
        throw new Error('Player not found')
      }

      // Log the deletion for each tournament the player is in
      for (const teamPlayer of player.teamPlayers) {
        await ctx.prisma.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: teamPlayer.team.division.tournamentId,
            action: 'DELETE',
            entityType: 'Player',
            entityId: input.id,
          },
        })
      }

      return ctx.prisma.player.delete({
        where: { id: input.id },
      })
    }),

  addToTeam: tdProcedure
    .input(z.object({
      playerId: z.string(),
      teamId: z.string(),
      role: z.enum(['CAPTAIN', 'PLAYER', 'SUB']).default('PLAYER'),
    }))
    .mutation(async ({ ctx, input }) => {
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        include: {
          division: {
            select: { tournamentId: true },
          },
        },
      })

      if (!team) {
        throw new Error('Team not found')
      }

      const teamPlayer = await ctx.prisma.teamPlayer.create({
        data: input,
        include: {
          player: true,
          team: true,
        },
      })

      // Log the addition
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'ADD_TO_TEAM',
          entityType: 'TeamPlayer',
          entityId: teamPlayer.id,
          payload: input,
        },
      })

      return teamPlayer
    }),

  removeFromTeam: tdProcedure
    .input(z.object({
      playerId: z.string(),
      teamId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        include: {
          division: {
            select: { tournamentId: true },
          },
        },
      })

      if (!team) {
        throw new Error('Team not found')
      }

      const teamPlayer = await ctx.prisma.teamPlayer.findUnique({
        where: {
          teamId_playerId: {
            teamId: input.teamId,
            playerId: input.playerId,
          },
        },
      })

      if (!teamPlayer) {
        throw new Error('Player not found in team')
      }

      // Log the removal
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'REMOVE_FROM_TEAM',
          entityType: 'TeamPlayer',
          entityId: teamPlayer.id,
          payload: input,
        },
      })

      return ctx.prisma.teamPlayer.delete({
        where: { id: teamPlayer.id },
      })
    }),
})
