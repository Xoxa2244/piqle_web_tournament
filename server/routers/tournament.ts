import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import {
  assertTournamentAdmin,
  getUserTournamentIds,
  checkTournamentAccess,
  getUserDivisionIds,
} from '../utils/access'
import { getTeamDisplayName } from '../utils/teamDisplay'

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
      registrationStartDate: z.string().transform((str) => new Date(str)).optional(),
      registrationEndDate: z.string().transform((str) => new Date(str)).optional(),
      entryFee: z.number().optional(),
      isPublicBoardEnabled: z.boolean().default(false),
      allowDuprSubmission: z.boolean().default(false),
      publicSlug: z.string().optional(),
      image: z.string().url().optional(),
      format: z.enum(['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'MLP', 'INDY_LEAGUE', 'LEAGUE_ROUND_ROBIN']).default('SINGLE_ELIMINATION'),
      seasonLabel: z.string().optional(),
      timezone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate dates
      // End date cannot be earlier than start date
      if (input.endDate < input.startDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'End date cannot be earlier than start date',
        })
      }

      // Validate registration dates if provided
      if (input.registrationStartDate || input.registrationEndDate) {
        if (input.registrationStartDate && input.registrationEndDate) {
          // Registration end date cannot be earlier than registration start date
          if (input.registrationEndDate < input.registrationStartDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Registration end date cannot be earlier than registration start date',
            })
          }
        }
        
        if (input.registrationStartDate) {
          // Registration start date cannot be later than tournament start date
          if (input.registrationStartDate > input.startDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Registration start date cannot be later than tournament start date',
            })
          }
        }
        
        if (input.registrationEndDate) {
          // Registration end date cannot be later than tournament start date
          if (input.registrationEndDate > input.startDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Registration end date cannot be later than tournament start date',
            })
          }
        }
      }

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
          title: input.title,
          description: input.description,
          rulesUrl: input.rulesUrl,
          venueName: input.venueName,
          venueAddress: input.venueAddress,
          startDate: input.startDate,
          endDate: input.endDate,
          registrationStartDate: input.registrationStartDate,
          registrationEndDate: input.registrationEndDate,
          entryFee: input.entryFee,
          isPublicBoardEnabled: input.isPublicBoardEnabled,
          allowDuprSubmission: input.allowDuprSubmission,
          image: input.image,
          format: input.format,
          seasonLabel: input.seasonLabel,
          timezone: input.timezone,
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
      try {
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
      } catch (error: any) {
        console.error('Error in tournament.get:', error)
        // If it's already a TRPCError, re-throw it
        if (error instanceof TRPCError) {
          throw error
        }
        // Otherwise, wrap it in a TRPCError
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch tournament',
          cause: error,
        })
      }
    }),

  /** Returns per-division winners (1st, 2nd, 3rd) for display on tournament info. */
  getWinners: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { access } = await checkTournamentAccess(ctx.prisma, ctx.session.user.id, input.tournamentId)
      if (!access) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this tournament',
        })
      }
      const divisionIds = await getUserDivisionIds(ctx.prisma, ctx.session.user.id, input.tournamentId)

      const tournament = await ctx.prisma.tournament.findFirst({
        where: { id: input.tournamentId },
        include: {
          divisions: {
            where: divisionIds.length > 0 ? { id: { in: divisionIds } } : { id: { in: [] } },
            include: {
              teams: {
                include: {
                  teamPlayers: { include: { player: true } },
                },
              },
              matches: {
                where: { stage: 'ELIMINATION' },
                include: {
                  teamA: {
                    include: {
                      teamPlayers: { include: { player: true } },
                    },
                  },
                  teamB: {
                    include: {
                      teamPlayers: { include: { player: true } },
                    },
                  },
                  games: { orderBy: { index: 'asc' } },
                  tiebreaker: true,
                },
              },
            },
          },
        },
      })

      if (!tournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      const format = tournament.format
      const isRoundRobinFormat = format === 'ROUND_ROBIN' || format === 'LEAGUE_ROUND_ROBIN' || format === 'INDY_LEAGUE'
      const result: Array<{
        divisionId: string
        divisionName: string
        first: { teamId: string; teamName: string } | null
        second: { teamId: string; teamName: string } | null
        third: { teamId: string; teamName: string } | null
      }> = []

      for (const division of tournament.divisions) {
        const teamKind = division.teamKind as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4' | null
        const entry: (typeof result)[0] = {
          divisionId: division.id,
          divisionName: division.name,
          first: null,
          second: null,
          third: null,
        }

        if (isRoundRobinFormat) {
          const standings = await ctx.prisma.standing.findMany({
            where: { divisionId: division.id },
            include: {
              team: {
                include: {
                  teamPlayers: { include: { player: true } },
                },
              },
            },
          })
          const sorted = standings.sort((a, b) => {
            if (a.wins !== b.wins) return b.wins - a.wins
            if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff
            return b.pointsFor - a.pointsFor
          })
          const top3 = sorted.slice(0, 3)
          if (top3[0]) {
            entry.first = {
              teamId: top3[0].teamId,
              teamName: getTeamDisplayName(top3[0].team, teamKind),
            }
          }
          if (top3[1]) {
            entry.second = {
              teamId: top3[1].teamId,
              teamName: getTeamDisplayName(top3[1].team, teamKind),
            }
          }
          if (top3[2]) {
            entry.third = {
              teamId: top3[2].teamId,
              teamName: getTeamDisplayName(top3[2].team, teamKind),
            }
          }
        } else {
          const elimMatches = division.matches.filter((m) => m.stage === 'ELIMINATION')
          if (elimMatches.length === 0) {
            result.push(entry)
            continue
          }
          const maxRound = Math.max(...elimMatches.map((m) => m.roundIndex))
          const finalRoundMatches = elimMatches
            .filter((m) => m.roundIndex === maxRound)
            .sort((a, b) => a.positionIndex - b.positionIndex)

          function getMatchWinner(match: (typeof finalRoundMatches)[0]) {
            const isMLP = format === 'MLP'
            if (isMLP && match.tiebreaker?.winnerTeamId) {
              return match.tiebreaker.winnerTeamId
            }
            if (match.winnerTeamId) return match.winnerTeamId
            const games = match.games ?? []
            let scoreA = 0
            let scoreB = 0
            for (const g of games) {
              scoreA += g.scoreA ?? 0
              scoreB += g.scoreB ?? 0
            }
            if (scoreA > scoreB) return match.teamAId
            if (scoreB > scoreA) return match.teamBId
            return null
          }

          const teams = division.teams
          const getTeamName = (teamId: string) => {
            const t = teams.find((x) => x.id === teamId)
            return t ? getTeamDisplayName(t, teamKind) : '—'
          }

          if (finalRoundMatches.length >= 1) {
            const finalMatch = finalRoundMatches[0]
            const winnerId = getMatchWinner(finalMatch)
            const loserId =
              winnerId === finalMatch.teamAId ? finalMatch.teamBId : winnerId === finalMatch.teamBId ? finalMatch.teamAId : null
            if (winnerId) entry.first = { teamId: winnerId, teamName: getTeamName(winnerId) }
            if (loserId) entry.second = { teamId: loserId, teamName: getTeamName(loserId) }
          }
          if (finalRoundMatches.length >= 2) {
            const thirdPlaceMatch = finalRoundMatches[1]
            const thirdId = getMatchWinner(thirdPlaceMatch)
            if (thirdId) entry.third = { teamId: thirdId, teamName: getTeamName(thirdId) }
          }
        }
        result.push(entry)
      }

      return result
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
      registrationStartDate: z.string().transform((str) => new Date(str)).optional().nullable(),
      registrationEndDate: z.string().transform((str) => new Date(str)).optional().nullable(),
      entryFee: z.number().optional(),
      isPublicBoardEnabled: z.boolean().optional(),
      allowDuprSubmission: z.boolean().optional(),
      publicSlug: z.string().optional(),
      image: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check admin access
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.id)

      // Get current tournament data for validation
      const currentTournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.id },
        select: {
          startDate: true,
          endDate: true,
          registrationStartDate: true,
          registrationEndDate: true,
        },
      })

      if (!currentTournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      // Use input values or fall back to current values
      const startDate = input.startDate || currentTournament.startDate
      const endDate = input.endDate || currentTournament.endDate
      const registrationStartDate = input.registrationStartDate !== undefined 
        ? input.registrationStartDate 
        : currentTournament.registrationStartDate
      const registrationEndDate = input.registrationEndDate !== undefined 
        ? input.registrationEndDate 
        : currentTournament.registrationEndDate

      // Validate dates
      // End date cannot be earlier than start date
      if (endDate < startDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'End date cannot be earlier than start date',
        })
      }

      // Validate registration dates if provided
      if (registrationStartDate !== null || registrationEndDate !== null) {
        if (registrationStartDate && registrationEndDate) {
          // Registration end date cannot be earlier than registration start date
          if (registrationEndDate < registrationStartDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Registration end date cannot be earlier than registration start date',
            })
          }
        }
        
        if (registrationStartDate) {
          // Registration start date cannot be later than tournament start date
          if (registrationStartDate > startDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Registration start date cannot be later than tournament start date',
            })
          }
        }
        
        if (registrationEndDate) {
          // Registration end date cannot be later than tournament start date
          if (registrationEndDate > startDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Registration end date cannot be later than tournament start date',
            })
          }
        }
      }

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
