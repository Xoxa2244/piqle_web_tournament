import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const playerRouter = createTRPCRouter({
  // Self-registration endpoint (for players)
  register: protectedProcedure
    .input(z.object({
      tournamentId: z.string(),
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().min(1, 'Last name is required'),
      email: z.string().email('Valid email is required'),
      gender: z.enum(['M', 'F']),
      duprRating: z.number().min(0).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tournamentId, ...playerData } = input

      // Check if tournament exists and is public
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: {
          id: true,
          title: true,
          isPublicBoardEnabled: true,
          isPaid: true,
          entryFee: true,
          startDate: true,
          endDate: true,
        },
      })

      if (!tournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      // Check if tournament is still accepting registrations (upcoming)
      const now = new Date()
      if (new Date(tournament.startDate) < now) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration closed. Tournament has already started.',
        })
      }

      // Check if player already registered
      const existingPlayer = await ctx.prisma.player.findFirst({
        where: {
          tournamentId,
          email: input.email,
        },
      })

      if (existingPlayer) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You are already registered for this tournament',
        })
      }

      // Determine if tournament requires payment
      const requiresPayment = tournament.entryFee && parseFloat(tournament.entryFee.toString()) > 0

      // Create player
      const player = await ctx.prisma.player.create({
        data: {
          ...playerData,
          tournamentId,
          isPaid: !requiresPayment, // Auto-mark as paid only if tournament is free
          isWaitlist: false,
        },
      })

      // Log the registration
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'CREATE',
          entityType: 'Player',
          entityId: player.id,
          payload: { ...input, selfRegistered: true },
        },
      })

      return { 
        player, 
        tournament: {
          requiresPayment,
          entryFee: tournament.entryFee,
        }
      }
    }),

  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      dupr: z.string().optional(), // Changed to string for DUPR ID
      duprRating: z.number().min(0).max(5).optional(),
      isPaid: z.boolean().default(false),
      isWaitlist: z.boolean().default(false),
      birthDate: z.date().optional(),
      externalId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tournamentId, ...playerData } = input
      
      const player = await ctx.prisma.player.create({
        data: {
          ...playerData,
          tournamentId,
        },
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
      return ctx.prisma.player.findMany({
        where: {
          tournamentId: input.tournamentId,
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
      dupr: z.string().optional(),
      duprRating: z.number().min(0).max(5).optional(),
      isPaid: z.boolean().optional(),
      isWaitlist: z.boolean().optional(),
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
