import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const playerRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      dupr: z.string().optional(), // Changed to string for DUPR ID
      birthDate: z.date().optional(),
      externalId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tournamentId, ...playerData } = input
      
      const player = await ctx.prisma.player.create({
        data: playerData,
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'CREATE',
          entityType: 'Player',
          entityId: player.id,
          payload: input,
        },
      })

      return player
    }),

  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all players who are in teams from this tournament
      const playersInTournament = await ctx.prisma.teamPlayer.findMany({
        where: {
          team: {
            division: {
              tournamentId: input.tournamentId,
            },
          },
        },
        include: {
          player: true,
        },
      })

      const playerIds = playersInTournament.map(tp => tp.playerId)

      return ctx.prisma.player.findMany({
        where: {
          OR: [
            { id: { in: playerIds } },
            // Also include players not in any team (they might be unassigned)
            { teamPlayers: { none: {} } },
          ],
        },
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
      teamPlayerId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const teamPlayer = await ctx.prisma.teamPlayer.findUnique({
        where: { id: input.teamPlayerId },
        include: {
          team: {
            include: {
              division: {
                select: { tournamentId: true },
              },
            },
          },
        },
      })

      if (!teamPlayer) {
        throw new Error('TeamPlayer not found')
      }

      // Log the removal
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: teamPlayer.team.division.tournamentId,
          action: 'REMOVE_FROM_TEAM',
          entityType: 'TeamPlayer',
          entityId: teamPlayer.id,
          payload: { playerId: teamPlayer.playerId, teamId: teamPlayer.teamId },
        },
      })

      return ctx.prisma.teamPlayer.delete({
        where: { id: input.teamPlayerId },
      })
    }),
})
