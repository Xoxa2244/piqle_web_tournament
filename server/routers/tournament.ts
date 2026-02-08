import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { Prisma, type PrismaClient } from '@prisma/client'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import {
  assertTournamentAdmin,
  getUserTournamentIds,
  checkTournamentAccess,
  getUserDivisionIds,
} from '../utils/access'
import { getTeamDisplayName } from '../utils/teamDisplay'
import { computeStandingsFromDivisionMatches } from './standings'

type DivisionForWinners = {
  id: string
  name: string
  teamKind: string | null
  teams: Array<{ id: string; teamPlayers?: Array<{ player: unknown }>; [k: string]: unknown }>
  pools: Array<{ id: string }>
  matches: Array<{
    stage: string
    roundIndex: number
    teamAId: string
    teamBId: string
    winnerTeamId: string | null
    createdAt: Date
    tiebreaker?: { winnerTeamId: string | null } | null
    games?: Array<{ scoreA: number | null; scoreB: number | null }>
  }>
}

/** Shared logic: compute per-division winners (1st, 2nd, 3rd) for display. Used by tournament.get and getWinners. */
async function computeWinnersForTournament(
  prisma: PrismaClient,
  tournament: { format: string; divisions: DivisionForWinners[] }
): Promise<Array<{ divisionId: string; divisionName: string; first: { teamId: string; teamName: string } | null; second: { teamId: string; teamName: string } | null; third: { teamId: string; teamName: string } | null }>> {
  const format = tournament.format
  const isRoundRobinFormat = format === 'ROUND_ROBIN' || format === 'LEAGUE_ROUND_ROBIN' || format === 'INDY_LEAGUE'
  const result: Array<{ divisionId: string; divisionName: string; first: { teamId: string; teamName: string } | null; second: { teamId: string; teamName: string } | null; third: { teamId: string; teamName: string } | null }> = []

  for (const division of tournament.divisions) {
    const teamKind = division.teamKind as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4' | null
    const entry = { divisionId: division.id, divisionName: division.name, first: null as { teamId: string; teamName: string } | null, second: null as { teamId: string; teamName: string } | null, third: null as { teamId: string; teamName: string } | null }

    if (isRoundRobinFormat) {
      // RR-only formats: show winners only when ALL RR matches in the division have score entered and a winner
      const divisionWithRR = await prisma.division.findUnique({
        where: { id: division.id },
        include: {
          teams: { include: { teamPlayers: { include: { player: true } } } },
          matches: { where: { stage: 'ROUND_ROBIN' }, include: { games: true, tiebreaker: true } },
        },
      })
      if (divisionWithRR && divisionWithRR.teams.length >= 2) {
        const rrMatches = divisionWithRR.matches
        const completedCount = rrMatches.filter((m) => {
          const teamAPoints = m.games.reduce((s, g) => s + (g.scoreA ?? 0), 0)
          const teamBPoints = m.games.reduce((s, g) => s + (g.scoreB ?? 0), 0)
          const hasScores = m.games.length > 0
          const hasWinner = !!m.winnerTeamId || teamAPoints !== teamBPoints
          return hasScores && hasWinner
        }).length
        const allRRComplete = rrMatches.length > 0 && completedCount >= rrMatches.length

        if (allRRComplete) {
          const computed = computeStandingsFromDivisionMatches(
            { teams: divisionWithRR.teams, teamKind: divisionWithRR.teamKind, matches: divisionWithRR.matches },
            { isMLP: false }
          )
          const top3 = computed.slice(0, 3)
          if (top3[0]) entry.first = { teamId: top3[0].teamId, teamName: top3[0].teamName }
          if (top3[1]) entry.second = { teamId: top3[1].teamId, teamName: top3[1].teamName }
          if (top3[2]) entry.third = { teamId: top3[2].teamId, teamName: top3[2].teamName }
        }
      }
    } else {
      const elimMatches = division.matches.filter((m) => m.stage === 'ELIMINATION')
      const getMatchWinner = (match: DivisionForWinners['matches'][0]): string | null => {
        if (format === 'MLP' && match.tiebreaker?.winnerTeamId) return match.tiebreaker!.winnerTeamId
        if (match.winnerTeamId) return match.winnerTeamId
        const games = match.games ?? []
        let scoreA = 0, scoreB = 0
        for (const g of games) {
          scoreA += g.scoreA ?? 0
          scoreB += g.scoreB ?? 0
        }
        if (scoreA > scoreB) return match.teamAId
        if (scoreB > scoreA) return match.teamBId
        return null
      }
      let playoffHasWinner = false
      if (elimMatches.length > 0) {
        const maxRound = Math.max(...elimMatches.map((m) => m.roundIndex))
        const finalRoundMatches = elimMatches
          .filter((m) => m.roundIndex === maxRound)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        const getTeamName = (teamId: string) => {
          const t = division.teams.find((x: { id: string }) => x.id === teamId)
          return t ? getTeamDisplayName(t as Parameters<typeof getTeamDisplayName>[0], teamKind) : '—'
        }
        if (finalRoundMatches.length >= 1) {
          const finalMatch = finalRoundMatches[0]
          const winnerId = getMatchWinner(finalMatch)
          const loserId = winnerId === finalMatch.teamAId ? finalMatch.teamBId : winnerId === finalMatch.teamBId ? finalMatch.teamAId : null
          if (winnerId) {
            entry.first = { teamId: winnerId, teamName: getTeamName(winnerId) }
            playoffHasWinner = true
          }
          if (loserId) entry.second = { teamId: loserId, teamName: getTeamName(loserId) }
        }
        if (finalRoundMatches.length >= 2) {
          const thirdId = getMatchWinner(finalRoundMatches[1])
          if (thirdId) entry.third = { teamId: thirdId, teamName: getTeamName(thirdId) }
        }
      }
      if (!playoffHasWinner) {
        const divisionWithRR = await prisma.division.findUnique({
          where: { id: division.id },
          include: {
            teams: { include: { teamPlayers: { include: { player: true } } } },
            matches: { where: { stage: 'ROUND_ROBIN' }, include: { games: true, tiebreaker: true } },
          },
        })
        if (divisionWithRR && divisionWithRR.teams.length >= 2 && divisionWithRR.matches.length > 0) {
          const computed = computeStandingsFromDivisionMatches(
            { teams: divisionWithRR.teams, teamKind: divisionWithRR.teamKind, matches: divisionWithRR.matches },
            { isMLP: format === 'MLP' }
          )
          const top3 = computed.slice(0, 3)
          if (top3[0]) entry.first = { teamId: top3[0].teamId, teamName: top3[0].teamName }
          if (top3[1]) entry.second = { teamId: top3[1].teamId, teamName: top3[1].teamName }
          if (top3[2]) entry.third = { teamId: top3[2].teamId, teamName: top3[2].teamName }
        }
      }
    }
    result.push(entry)
  }
  return result
}

const tournamentCreateInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  rulesUrl: z.string().url().optional(),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  clubId: z.string().uuid().optional(),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  registrationStartDate: z.string().transform((str) => new Date(str)).optional(),
  registrationEndDate: z.string().transform((str) => new Date(str)).optional(),
  entryFeeCents: z.number().int().min(0).optional(),
  currency: z.literal('usd').default('usd'),
  isPublicBoardEnabled: z.boolean().default(false),
  allowDuprSubmission: z.boolean().default(false),
  publicSlug: z.string().optional(),
  image: z.string().url().optional(),
  format: z
    .enum([
      'SINGLE_ELIMINATION',
      'ROUND_ROBIN',
      'MLP',
      'INDY_LEAGUE',
      'LEAGUE_ROUND_ROBIN',
      'ONE_DAY_LADDER',
      'LADDER_LEAGUE',
    ])
    .default('SINGLE_ELIMINATION'),
  seasonLabel: z.string().optional(),
  timezone: z.string().optional(),
})

const playersPerTeamSchema = z.union([z.literal(1), z.literal(2), z.literal(4)])

const tournamentStructureInput = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('WITH_DIVISIONS'),
    divisions: z.array(z.object({
      name: z.string().min(1),
      poolCount: z.number().int().min(1),
      teamCount: z.number().int().min(2),
      playersPerTeam: playersPerTeamSchema,
      constraints: z.object({
        individualDupr: z.object({
          enabled: z.boolean(),
          min: z.number().optional(),
          max: z.number().optional(),
        }),
        teamDupr: z.object({
          enabled: z.boolean(),
          min: z.number().optional(),
          max: z.number().optional(),
        }),
        gender: z.object({
          enabled: z.boolean(),
          value: z.enum(['ANY', 'MEN', 'WOMEN', 'MIXED']).optional(),
        }),
        age: z.object({
          enabled: z.boolean(),
          min: z.number().int().optional(),
          max: z.number().int().optional(),
        }),
        enforcement: z.enum(['INFO', 'HARD']).default('INFO'),
      }),
    })).min(1),
  }),
  z.object({
    mode: z.literal('NO_DIVISIONS'),
    playersPerTeam: playersPerTeamSchema,
    teamCount: z.number().int().min(2).optional(),
    playerCount: z.number().int().min(1).optional(),
  }),
]).superRefine((value, ctx) => {
  if (value.mode === 'NO_DIVISIONS') {
    if (value.playersPerTeam === 1 && !value.playerCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playerCount'],
        message: 'Player count is required for 1v1 tournaments',
      })
    }
    if (value.playersPerTeam !== 1 && !value.teamCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamCount'],
        message: 'Team count is required for team tournaments',
      })
    }
  }
})

const playersPerTeamToKind = (playersPerTeam: 1 | 2 | 4) => {
  if (playersPerTeam === 1) return 'SINGLES_1v1'
  if (playersPerTeam === 2) return 'DOUBLES_2v2'
  return 'SQUAD_4v4'
}

const validateTournamentDates = (input: z.infer<typeof tournamentCreateInput>) => {
  if (input.endDate < input.startDate) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'End date cannot be earlier than start date',
    })
  }

  if (input.registrationStartDate || input.registrationEndDate) {
    if (input.registrationStartDate && input.registrationEndDate) {
      if (input.registrationEndDate < input.registrationStartDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration end date cannot be earlier than registration start date',
        })
      }
    }
    
    if (input.registrationStartDate) {
      if (input.registrationStartDate > input.startDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration start date cannot be later than tournament start date',
        })
      }
    }
    
    if (input.registrationEndDate) {
      if (input.registrationEndDate > input.startDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration end date cannot be later than tournament start date',
        })
      }
    }
  }
}

const getUniqueTournamentSlug = async (
  ctx: { prisma: any },
  input: z.infer<typeof tournamentCreateInput>
) => {
  let publicSlug = input.publicSlug || input.title.toLowerCase().replace(/\s+/g, '-')
  let counter = 1
  const baseSlug = publicSlug

  while (await ctx.prisma.tournament.findUnique({ where: { publicSlug } })) {
    publicSlug = `${baseSlug}-${counter}`
    counter++
  }

  return publicSlug
}

export const tournamentRouter = createTRPCRouter({
  create: tdProcedure
    .input(tournamentCreateInput)
    .mutation(async ({ ctx, input }) => {
      validateTournamentDates(input)

      const publicSlug = await getUniqueTournamentSlug(ctx, input)
      const entryFeeCents = input.entryFeeCents ?? 0
      const entryFeeDecimal =
        entryFeeCents > 0
          ? new Prisma.Decimal(entryFeeCents / 100)
          : null

      const tournament = await ctx.prisma.tournament.create({
        data: {
          title: input.title,
          description: input.description,
          rulesUrl: input.rulesUrl,
          venueName: input.venueName,
          venueAddress: input.venueAddress,
          clubId: input.clubId ?? null,
          startDate: input.startDate,
          endDate: input.endDate,
          registrationStartDate: input.registrationStartDate,
          registrationEndDate: input.registrationEndDate,
          entryFee: entryFeeDecimal,
          entryFeeCents,
          currency: input.currency,
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
  createWithStructure: tdProcedure
    .input(tournamentCreateInput.extend({
      structure: tournamentStructureInput,
    }))
    .mutation(async ({ ctx, input }) => {
      validateTournamentDates(input)

      const publicSlug = await getUniqueTournamentSlug(ctx, input)
      const hasDivisions = input.structure.mode === 'WITH_DIVISIONS'
      const entryFeeCents = input.entryFeeCents ?? 0
      const entryFeeDecimal =
        entryFeeCents > 0
          ? new Prisma.Decimal(entryFeeCents / 100)
          : null

      const tournament = await ctx.prisma.$transaction(async (tx) => {
        const createdTournament = await tx.tournament.create({
          data: {
            title: input.title,
            description: input.description,
            rulesUrl: input.rulesUrl,
            venueName: input.venueName,
            venueAddress: input.venueAddress,
            clubId: input.clubId ?? null,
            startDate: input.startDate,
            endDate: input.endDate,
            registrationStartDate: input.registrationStartDate,
            registrationEndDate: input.registrationEndDate,
            entryFee: entryFeeDecimal,
            entryFeeCents,
            currency: input.currency,
            isPublicBoardEnabled: input.isPublicBoardEnabled,
            allowDuprSubmission: input.allowDuprSubmission,
            image: input.image,
            format: input.format,
            seasonLabel: input.seasonLabel,
            timezone: input.timezone,
            userId: ctx.session.user.id,
            publicSlug,
            hasDivisions,
          },
        })

        if (input.structure.mode === 'WITH_DIVISIONS') {
          for (const divisionInput of input.structure.divisions) {
            const teamKind = playersPerTeamToKind(divisionInput.playersPerTeam)
            const division = await tx.division.create({
              data: {
                tournamentId: createdTournament.id,
                name: divisionInput.name.trim(),
                teamKind,
                pairingMode: 'FIXED',
                poolCount: divisionInput.poolCount,
                maxTeams: divisionInput.teamCount,
                constraints: {
                  create: {
                    minDupr: divisionInput.constraints.individualDupr.enabled ? divisionInput.constraints.individualDupr.min ?? null : null,
                    maxDupr: divisionInput.constraints.individualDupr.enabled ? divisionInput.constraints.individualDupr.max ?? null : null,
                    minTeamDupr: divisionInput.constraints.teamDupr.enabled ? divisionInput.constraints.teamDupr.min ?? null : null,
                    maxTeamDupr: divisionInput.constraints.teamDupr.enabled ? divisionInput.constraints.teamDupr.max ?? null : null,
                    minAge: divisionInput.constraints.age.enabled ? divisionInput.constraints.age.min ?? null : null,
                    maxAge: divisionInput.constraints.age.enabled ? divisionInput.constraints.age.max ?? null : null,
                    genders: divisionInput.constraints.gender.enabled ? (divisionInput.constraints.gender.value || 'ANY') : 'ANY',
                    enforcement: divisionInput.constraints.enforcement,
                  },
                },
                pools: {
                  create: Array.from({ length: divisionInput.poolCount }, (_, index) => ({
                    name: divisionInput.poolCount === 1 ? 'Pool 1' : `Pool ${index + 1}`,
                    order: index + 1,
                  })),
                },
              },
              include: {
                pools: { orderBy: { order: 'asc' } },
              },
            })

            const pools = division.pools
            for (let i = 0; i < divisionInput.teamCount; i++) {
              const pool = pools[i % pools.length]
              await tx.team.create({
                data: {
                  divisionId: division.id,
                  name: `Team ${i + 1}`,
                  poolId: pool?.id,
                },
              })
            }
          }
        } else {
          const playersPerTeam = input.structure.playersPerTeam
          const teamKind = playersPerTeamToKind(playersPerTeam)
          const maxTeams = playersPerTeam === 1 ? input.structure.playerCount : input.structure.teamCount

          const division = await tx.division.create({
            data: {
              tournamentId: createdTournament.id,
              name: 'Main',
              teamKind,
              pairingMode: 'FIXED',
              poolCount: 0,
              maxTeams: maxTeams ?? undefined,
              constraints: {
                create: {
                  genders: 'ANY',
                  enforcement: 'INFO',
                },
              },
            },
          })

          if (playersPerTeam === 1 && input.structure.playerCount) {
            await tx.player.createMany({
              data: Array.from({ length: input.structure.playerCount }, (_, index) => ({
                firstName: 'Player',
                lastName: String(index + 1),
                tournamentId: createdTournament.id,
              })),
            })
          }

          if (playersPerTeam !== 1 && input.structure.teamCount) {
            for (let i = 0; i < input.structure.teamCount; i++) {
              await tx.team.create({
                data: {
                  divisionId: division.id,
                  name: `Team ${i + 1}`,
                },
              })
            }
          }
        }

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: createdTournament.id,
            action: 'CREATE',
            entityType: 'Tournament',
            entityId: createdTournament.id,
            payload: input,
          },
        })

        return createdTournament
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

        // Compute winners for the Winners block on /admin/[id] (same data as getWinners)
        const winnersByDivision = tournament.divisions.length > 0
          ? await computeWinnersForTournament(ctx.prisma, {
              format: tournament.format,
              divisions: tournament.divisions as DivisionForWinners[],
            })
          : []

        // Add access information and winners to the response
        return {
          ...tournament,
          userAccessInfo: {
            isOwner,
            accessLevel: isOwner ? 'ADMIN' : (access?.accessLevel || null),
          },
          winnersByDivision,
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
              pools: { select: { id: true } },
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

      return computeWinnersForTournament(ctx.prisma, {
        format: tournament.format,
        divisions: tournament.divisions as DivisionForWinners[],
      })
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
      entryFeeCents: z.number().int().min(0).optional(),
      currency: z.literal('usd').optional(),
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

      const { id, entryFeeCents, ...rest } = input
      const entryFeeDecimal =
        typeof entryFeeCents === 'number'
          ? entryFeeCents > 0
            ? new Prisma.Decimal(entryFeeCents / 100)
            : null
          : undefined

      const data = {
        ...rest,
        entryFee: entryFeeDecimal,
        entryFeeCents,
      }

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
