import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import {
  assertTournamentAdmin,
  getUserTournamentIds,
  checkTournamentAccess,
  getUserDivisionIds,
} from '../utils/access'

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
      allowDuprSubmission: z.boolean().default(false),
      publicSlug: z.string().optional(),
      format: z.enum(['SINGLE_ELIMINATION', 'MLP']).default('SINGLE_ELIMINATION'),
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
          userId: ctx.session.user.id,
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
      // Get all tournament IDs user has access to
      const tournamentIds = await getUserTournamentIds(ctx.prisma, ctx.session.user.id)

      if (tournamentIds.length === 0) {
        return []
      }

      const tournaments = await ctx.prisma.tournament.findMany({
        where: {
          id: { in: tournamentIds },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          divisions: true,
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
            },
          },
          _count: {
            select: {
              divisions: true,
            },
          },
        },
      })

      // Add isOwner flag to each tournament
      return tournaments.map(tournament => ({
        ...tournament,
        isOwner: tournament.userId === ctx.session.user.id,
      }))
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check if user has access to this tournament
      const { isOwner, access } = await checkTournamentAccess(ctx.prisma, ctx.session.user.id, input.id)
      
      // If user is not owner and has no access, throw error
      if (!isOwner && !access) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this tournament',
        })
      }

      // Get accessible division IDs for this user
      const accessibleDivisionIds = await getUserDivisionIds(
        ctx.prisma,
        ctx.session.user.id,
        input.id
      )

      const tournament = await ctx.prisma.tournament.findFirst({
        where: { 
          id: input.id,
        },
        include: {
          divisions: {
            where: accessibleDivisionIds.length > 0 ? {
              id: {
                in: accessibleDivisionIds,
              },
            } : {
              id: {
                in: [], // Return empty if no access to any divisions
              },
            },
            include: {
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
              matches: {
                include: {
                  teamA: true,
                  teamB: true,
                  games: {
                    orderBy: { index: 'asc' },
                  },
                },
              },
            },
          },
          prizes: true,
        },
      })
      
      if (!tournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      // Add access information to the response
      return {
        ...tournament,
        userAccessInfo: {
          isOwner,
          accessLevel: isOwner ? 'ADMIN' : (access?.accessLevel || null),
        },
      }
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
      allowDuprSubmission: z.boolean().optional(),
      publicSlug: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check admin access
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.id)

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
      // Only tournament owner can delete
      const { isOwner } = await checkTournamentAccess(ctx.prisma, ctx.session.user.id, input.id)
      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only tournament owner can delete tournament',
        })
      }

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
      // Check admin access
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

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
