import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'
import { sendPartnerWebhookForTournament } from '../utils/partnerWebhooks'

export const matchDayRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      date: z.string().transform((str) => new Date(str)), // ISO date string
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      // Check if tournament supports match days
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: { format: true },
      })

      if (
        tournament?.format !== 'INDY_LEAGUE' &&
        tournament?.format !== 'LEAGUE_ROUND_ROBIN' &&
        tournament?.format !== 'LADDER_LEAGUE'
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Match days can only be created for Indy League, League Round Robin, or Ladder League tournaments',
        })
      }

      // Check if date is in the future (or today)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const matchDate = new Date(input.date)
      matchDate.setHours(0, 0, 0, 0)

      if (matchDate < today) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Match day date must be today or in the future',
        })
      }

      // Check if match day with this date already exists for this tournament
      const existingMatchDay = await ctx.prisma.matchDay.findFirst({
        where: {
          tournamentId: input.tournamentId,
          date: matchDate,
        },
      })

      if (existingMatchDay) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A match day with this date already exists for this tournament',
        })
      }

      const matchDay = await ctx.prisma.matchDay.create({
        data: {
          tournamentId: input.tournamentId,
          date: matchDate,
          status: 'DRAFT',
        },
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.tournamentId,
          action: 'CREATE_MATCH_DAY',
          entityType: 'MatchDay',
          entityId: matchDay.id,
          payload: {
            date: matchDate.toISOString(),
            status: 'DRAFT',
          },
        },
      })

      await sendPartnerWebhookForTournament(
        ctx.prisma,
        input.tournamentId,
        'schedule.updated',
        { matchDayId: matchDay.id }
      )

      return matchDay
    }),

  list: protectedProcedure
    .input(z.object({
      tournamentId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Check access
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: { userId: true, format: true },
      })

      if (!tournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      if (
        tournament.format !== 'INDY_LEAGUE' &&
        tournament.format !== 'LEAGUE_ROUND_ROBIN' &&
        tournament.format !== 'LADDER_LEAGUE'
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This endpoint is only for Indy League, League Round Robin, or Ladder League tournaments',
        })
      }

      const matchDays = await ctx.prisma.matchDay.findMany({
        where: { tournamentId: input.tournamentId },
        orderBy: { date: 'asc' },
        include: {
          matchups: {
            include: {
              division: true,
              homeTeam: true,
              awayTeam: true,
            },
          },
        },
      })

      return matchDays
    }),

  get: protectedProcedure
    .input(z.object({
      matchDayId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const matchDay = await ctx.prisma.matchDay.findUnique({
          where: { id: input.matchDayId },
          include: {
            tournament: {
              select: { id: true, title: true, format: true },
            },
            matchups: {
              include: {
                division: true,
                homeTeam: {
                  include: {
                    teamPlayers: {
                      include: {
                        player: true,
                      },
                    },
                  },
                },
                awayTeam: {
                  include: {
                    teamPlayers: {
                      include: {
                        player: true,
                      },
                    },
                  },
                },
                rosters: {
                  include: {
                    player: true,
                    team: true,
                  },
                },
                games: {
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        })

        if (!matchDay) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Match day not found',
          })
        }

        return matchDay
      } catch (error: any) {
        console.error('Error in matchDay.get:', error)
        // Log more details about Prisma errors
        if (error?.code === 'P2025' || error?.code === 'P2002') {
          console.error('Prisma error details:', {
            code: error.code,
            meta: error.meta,
            message: error.message,
          })
        }
        // Return a more user-friendly error message
        throw new TRPCError({
          code: error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to fetch match day',
          cause: error,
        })
      }
    }),

  updateStatus: tdProcedure
    .input(z.object({
      matchDayId: z.string(),
      status: z.enum(['DRAFT', 'IN_PROGRESS', 'FINALIZED']),
    }))
    .mutation(async ({ ctx, input }) => {
      const matchDay = await ctx.prisma.matchDay.findUnique({
        where: { id: input.matchDayId },
        include: {
          tournament: {
            select: { id: true, userId: true },
          },
        },
      })

      if (!matchDay) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Match day not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchDay.tournament.id)

      // Validate status transition
      if (input.status === 'FINALIZED') {
        // Check if all matchups are completed
        const incompleteMatchups = await ctx.prisma.indyMatchup.findFirst({
          where: {
            matchDayId: input.matchDayId,
            status: { not: 'COMPLETED' },
          },
        })

        if (incompleteMatchups) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot finalize match day: not all matchups are completed',
          })
        }
      }

      const updated = await ctx.prisma.matchDay.update({
        where: { id: input.matchDayId },
        data: { status: input.status },
      })

      // Log the update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: matchDay.tournament.id,
          action: 'UPDATE_MATCH_DAY_STATUS',
          entityType: 'MatchDay',
          entityId: input.matchDayId,
          payload: {
            status: input.status,
          },
        },
      })

      await sendPartnerWebhookForTournament(
        ctx.prisma,
        matchDay.tournament.id,
        'schedule.updated',
        { matchDayId: input.matchDayId }
      )

      return updated
    }),

  delete: tdProcedure
    .input(z.object({
      matchDayId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const matchDay = await ctx.prisma.matchDay.findUnique({
        where: { id: input.matchDayId },
        include: {
          tournament: {
            select: { id: true, userId: true },
          },
        },
      })

      if (!matchDay) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Match day not found',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, matchDay.tournament.id)

      // Cannot delete finalized match day
      if (matchDay.status === 'FINALIZED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete finalized match day',
        })
      }

      await ctx.prisma.matchDay.delete({
        where: { id: input.matchDayId },
      })

      // Log the deletion
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: matchDay.tournament.id,
          action: 'DELETE_MATCH_DAY',
          entityType: 'MatchDay',
          entityId: input.matchDayId,
          payload: {},
        },
      })

      await sendPartnerWebhookForTournament(
        ctx.prisma,
        matchDay.tournament.id,
        'schedule.updated',
        { matchDayId: input.matchDayId }
      )

      return { success: true }
    }),
})
