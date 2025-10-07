import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const matchRouter = createTRPCRouter({
  generateRR: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get division with teams
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: true,
          tournament: {
            select: { id: true },
          },
        },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      if (division.teams.length < 2) {
        throw new Error('Need at least 2 teams to generate Round Robin')
      }

      // Check if RR already exists
      const existingMatches = await ctx.prisma.match.findMany({
        where: { divisionId: input.divisionId },
      })

      if (existingMatches.length > 0) {
        throw new Error('Round Robin already generated for this division')
      }

      // Generate Round Robin schedule using circle method
      const teams = division.teams
      const n = teams.length
      const isOdd = n % 2 === 1
      
      // If odd number of teams, add a BYE team
      if (isOdd) {
        teams.push({ id: 'BYE', name: 'BYE', divisionId: input.divisionId } as any)
      }

      const rounds: Array<{ teamA: any; teamB: any; roundIndex: number }> = []
      const numRounds = isOdd ? n : n - 1

      // Circle method for Round Robin
      for (let round = 0; round < numRounds; round++) {
        for (let i = 0; i < teams.length / 2; i++) {
          const teamA = teams[i]
          const teamB = teams[teams.length - 1 - i]
          
          // Skip if one of the teams is BYE
          if (teamA.id !== 'BYE' && teamB.id !== 'BYE') {
            rounds.push({
              teamA,
              teamB,
              roundIndex: round,
            })
          }
        }

        // Rotate teams (except the first one)
        if (teams.length > 2) {
          const lastTeam = teams.pop()
          teams.splice(1, 0, lastTeam!)
        }
      }

      // Create matches in database
      const matches = await Promise.all(
        rounds.map((round) =>
          ctx.prisma.match.create({
            data: {
              divisionId: input.divisionId,
              teamAId: round.teamA.id,
              teamBId: round.teamB.id,
              roundIndex: round.roundIndex,
              stage: 'ROUND_ROBIN',
              bestOfMode: 'FIXED_GAMES', // Default to fixed games mode
              gamesCount: 1, // Default to 1 game per match
              targetPoints: 11, // Default to 11 points
              winBy: 2, // Default to win by 2
              locked: false,
            },
          })
        )
      )

      // Log the RR generation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournament.id,
          action: 'GENERATE_RR',
          entityType: 'Division',
          entityId: input.divisionId,
          payload: {
            divisionId: input.divisionId,
            teamsCount: division.teams.length,
            matchesCount: matches.length,
          },
        },
      })

      return {
        matches,
        totalMatches: matches.length,
        rounds: numRounds,
      }
    }),
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
