import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const matchRouter = createTRPCRouter({
  listByDivision: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.match.findMany({
        where: { divisionId: input.divisionId },
        include: {
          teamA: true,
          teamB: true,
          games: {
            orderBy: { index: 'asc' },
          },
        },
        orderBy: { roundIndex: 'asc' },
      })
    }),

  listByRRGroup: protectedProcedure
    .input(z.object({ rrGroupId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.match.findMany({
        where: { rrGroupId: input.rrGroupId },
        include: {
          teamA: true,
          teamB: true,
          games: {
            orderBy: { index: 'asc' },
          },
        },
        orderBy: { roundIndex: 'asc' },
      })
    }),

  listByRound: protectedProcedure
    .input(z.object({ 
      divisionId: z.string().optional(),
      rrGroupId: z.string().optional(),
      roundIndex: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.match.findMany({
        where: {
          ...(input.divisionId && { divisionId: input.divisionId }),
          ...(input.rrGroupId && { rrGroupId: input.rrGroupId }),
          roundIndex: input.roundIndex,
        },
        include: {
          teamA: true,
          teamB: true,
          games: {
            orderBy: { index: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  updateGameScore: protectedProcedure
    .input(z.object({
      matchId: z.string(),
      gameIndex: z.number(),
      scoreA: z.number(),
      scoreB: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.prisma.match.findUnique({
        where: { id: input.matchId },
        include: {
          division: {
            select: { tournamentId: true },
          },
          rrGroup: {
            select: { tournamentId: true },
          },
        },
      })

      if (!match) {
        throw new Error('Match not found')
      }

      const tournamentId = match.division?.tournamentId || match.rrGroup?.tournamentId
      if (!tournamentId) {
        throw new Error('Tournament not found')
      }

      // Update or create the game
      const game = await ctx.prisma.game.upsert({
        where: {
          matchId_index: {
            matchId: input.matchId,
            index: input.gameIndex,
          },
        },
        create: {
          matchId: input.matchId,
          index: input.gameIndex,
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          winner: input.scoreA > input.scoreB ? 'A' : input.scoreB > input.scoreA ? 'B' : null,
        },
        update: {
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          winner: input.scoreA > input.scoreB ? 'A' : input.scoreB > input.scoreA ? 'B' : null,
        },
      })

      // Log the score update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'UPDATE_GAME_SCORE',
          entityType: 'Game',
          entityId: game.id,
          payload: input,
        },
      })

      return game
    }),

  lock: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.prisma.match.findUnique({
        where: { id: input.id },
        include: {
          division: {
            select: { tournamentId: true },
          },
          rrGroup: {
            select: { tournamentId: true },
          },
        },
      })

      if (!match) {
        throw new Error('Match not found')
      }

      const tournamentId = match.division?.tournamentId || match.rrGroup?.tournamentId
      if (!tournamentId) {
        throw new Error('Tournament not found')
      }

      const updatedMatch = await ctx.prisma.match.update({
        where: { id: input.id },
        data: { locked: true },
      })

      // Log the lock
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'LOCK_MATCH',
          entityType: 'Match',
          entityId: match.id,
        },
      })

      return updatedMatch
    }),

  unlock: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.prisma.match.findUnique({
        where: { id: input.id },
        include: {
          division: {
            select: { tournamentId: true },
          },
          rrGroup: {
            select: { tournamentId: true },
          },
        },
      })

      if (!match) {
        throw new Error('Match not found')
      }

      const tournamentId = match.division?.tournamentId || match.rrGroup?.tournamentId
      if (!tournamentId) {
        throw new Error('Tournament not found')
      }

      const updatedMatch = await ctx.prisma.match.update({
        where: { id: input.id },
        data: { locked: false },
      })

      // Log the unlock
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'UNLOCK_MATCH',
          entityType: 'Match',
          entityId: match.id,
        },
      })

      return updatedMatch
    }),
})
