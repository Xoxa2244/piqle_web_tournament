import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'

const isMissingDbRelation = (err: any, relationName: string) => {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes(relationName.toLowerCase()) && msg.includes('does not exist')
}

const decimalToNumber = (val: any): number | null => {
  if (val === null || val === undefined) return null
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  if (typeof val === 'string') {
    const n = Number(val)
    return Number.isFinite(n) ? n : null
  }
  if (typeof val?.toNumber === 'function') {
    const n = val.toNumber()
    return Number.isFinite(n) ? n : null
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

const assertClubAdmin = async (prisma: any, userId: string, clubId: string) => {
  const role = await prisma.clubAdmin.findUnique({
    where: { clubId_userId: { clubId, userId } },
    select: { id: true },
  })
  if (!role) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Club admin access required' })
  }
}

const tournamentFormatSchema = z.enum([
  'SINGLE_ELIMINATION',
  'ROUND_ROBIN',
  'MLP',
  'INDY_LEAGUE',
  'LEAGUE_ROUND_ROBIN',
  'ONE_DAY_LADDER',
  'LADDER_LEAGUE',
])

const playersPerTeamSchema = z.union([z.literal(1), z.literal(2), z.literal(4)])

const tournamentStructureSchema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('WITH_DIVISIONS'),
      divisions: z
        .array(
          z.object({
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
          })
        )
        .min(1),
    }),
    z.object({
      mode: z.literal('NO_DIVISIONS'),
      playersPerTeam: playersPerTeamSchema,
      teamCount: z.number().int().min(2).optional(),
      playerCount: z.number().int().min(1).optional(),
    }),
  ])
  .superRefine((value, ctx) => {
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

const templateConfigV1Schema = z.object({
  schemaVersion: z.literal(1),
  tournament: z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    rulesUrl: z.string().nullable().optional(),
    venueName: z.string().nullable().optional(),
    venueAddress: z.string().nullable().optional(),
    format: tournamentFormatSchema,
    allowDuprSubmission: z.boolean().optional(),
    currency: z.string().optional(),
    timezone: z.string().nullable().optional(),
    seasonLabel: z.string().nullable().optional(),
  }),
  structure: tournamentStructureSchema,
})

const validateTournamentDates = (input: {
  startDate: Date
  endDate: Date
  registrationStartDate?: Date
  registrationEndDate?: Date
}) => {
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

const playersPerTeamToKind = (playersPerTeam: 1 | 2 | 4) => {
  if (playersPerTeam === 1) return 'SINGLES_1v1'
  if (playersPerTeam === 2) return 'DOUBLES_2v2'
  return 'SQUAD_4v4'
}

const getUniqueTournamentSlug = async (ctx: { prisma: any }, title: string) => {
  const base = title.toLowerCase().replace(/\s+/g, '-')
  let publicSlug = base || 'tournament'
  let counter = 1
  const baseSlug = publicSlug

  while (await ctx.prisma.tournament.findUnique({ where: { publicSlug } })) {
    publicSlug = `${baseSlug}-${counter}`
    counter++
  }

  return publicSlug
}

export const clubTemplateRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertClubAdmin(ctx.prisma, ctx.session.user.id, input.clubId)

      try {
        const templates = await ctx.prisma.clubTournamentTemplate.findMany({
          where: { clubId: input.clubId },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            description: true,
            config: true,
            schemaVersion: true,
            createdAt: true,
            updatedAt: true,
          },
        })

        return templates.map((t: any) => {
          const parsed = templateConfigV1Schema.safeParse(t.config)
          const format = parsed.success ? parsed.data.tournament.format : null
          const divisionsCount =
            parsed.success && parsed.data.structure.mode === 'WITH_DIVISIONS'
              ? parsed.data.structure.divisions.length
              : parsed.success
                ? 0
                : null

          return {
            id: t.id,
            name: t.name,
            description: t.description,
            schemaVersion: t.schemaVersion ?? 1,
            format,
            divisionsCount,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_tournament_templates')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_tournament_templates table is missing. Apply DB migration first.',
          })
        }
        throw err
      }
    }),

  delete: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let template: any
      try {
        template = await ctx.prisma.clubTournamentTemplate.findUnique({
          where: { id: input.templateId },
          select: { id: true, clubId: true },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_tournament_templates')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_tournament_templates table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      if (!template) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' })
      }

      await assertClubAdmin(ctx.prisma, ctx.session.user.id, template.clubId)

      await ctx.prisma.clubTournamentTemplate.delete({ where: { id: input.templateId } })
      return { success: true }
    }),

  createDraftFromTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        title: z.string().min(1).max(200).optional(),
        startDate: z.string().transform((str) => new Date(str)),
        endDate: z.string().transform((str) => new Date(str)),
        registrationStartDate: z.string().transform((str) => new Date(str)).optional(),
        registrationEndDate: z.string().transform((str) => new Date(str)).optional(),
        entryFeeCents: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let template: any
      try {
        template = await ctx.prisma.clubTournamentTemplate.findUnique({
          where: { id: input.templateId },
          select: {
            id: true,
            clubId: true,
            config: true,
            schemaVersion: true,
          },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_tournament_templates')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_tournament_templates table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      if (!template) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' })
      }

      await assertClubAdmin(ctx.prisma, ctx.session.user.id, template.clubId)

      const parsed = templateConfigV1Schema.safeParse(template.config)
      if (!parsed.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Template config is invalid (cannot create draft).',
        })
      }

      validateTournamentDates({
        startDate: input.startDate,
        endDate: input.endDate,
        registrationStartDate: input.registrationStartDate,
        registrationEndDate: input.registrationEndDate,
      })

      const config = parsed.data
      const title = input.title?.trim() || config.tournament.title

      const publicSlug = await getUniqueTournamentSlug(ctx, title)
      const entryFeeCents = input.entryFeeCents ?? 0
      const entryFeeDecimal = entryFeeCents > 0 ? new Prisma.Decimal(entryFeeCents / 100) : null

      const created = await ctx.prisma.$transaction(async (tx: any) => {
        const createdTournament = await tx.tournament.create({
          data: {
            title,
            description: config.tournament.description ?? null,
            rulesUrl: config.tournament.rulesUrl ?? null,
            venueName: config.tournament.venueName ?? null,
            venueAddress: config.tournament.venueAddress ?? null,
            clubId: template.clubId,
            startDate: input.startDate,
            endDate: input.endDate,
            registrationStartDate: input.registrationStartDate ?? null,
            registrationEndDate: input.registrationEndDate ?? null,
            entryFee: entryFeeDecimal,
            entryFeeCents,
            currency: (config.tournament.currency ?? 'usd') as string,
            isPublicBoardEnabled: false, // always draft
            allowDuprSubmission: Boolean(config.tournament.allowDuprSubmission),
            format: config.tournament.format,
            seasonLabel: config.tournament.seasonLabel ?? null,
            timezone: config.tournament.timezone ?? null,
            publicSlug,
            userId: ctx.session.user.id,
            hasDivisions: config.structure.mode === 'WITH_DIVISIONS',
          },
          select: { id: true },
        })

        if (config.structure.mode === 'WITH_DIVISIONS') {
          for (const divisionInput of config.structure.divisions) {
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
              include: { pools: { orderBy: { order: 'asc' } } },
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
          const playersPerTeam = config.structure.playersPerTeam
          const teamKind = playersPerTeamToKind(playersPerTeam)
          const maxTeams = playersPerTeam === 1 ? config.structure.playerCount : config.structure.teamCount

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
            select: { id: true },
          })

          if (playersPerTeam === 1 && config.structure.playerCount) {
            await tx.player.createMany({
              data: Array.from({ length: config.structure.playerCount }, (_, index) => ({
                firstName: 'Player',
                lastName: String(index + 1),
                tournamentId: createdTournament.id,
              })),
            })
          }

          if (playersPerTeam !== 1 && config.structure.teamCount) {
            for (let i = 0; i < config.structure.teamCount; i++) {
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
            payload: {
              source: 'CLUB_TEMPLATE',
              templateId: template.id,
              overrides: {
                title: input.title ?? null,
                startDate: input.startDate,
                endDate: input.endDate,
                registrationStartDate: input.registrationStartDate ?? null,
                registrationEndDate: input.registrationEndDate ?? null,
                entryFeeCents,
              },
            },
          },
        })

        return createdTournament
      })

      return { tournamentId: created.id }
    }),

  saveFromTournament: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        name: z.string().min(2).max(120),
        description: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Must be a tournament admin to save its structure.
      await assertTournamentAdmin(ctx.prisma, userId, input.tournamentId)

      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        include: {
          divisions: {
            orderBy: { createdAt: 'asc' },
            include: {
              constraints: true,
              teams: { select: { id: true } },
              pools: { select: { id: true } },
            },
          },
          players: { select: { id: true } },
        },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      if (!tournament.clubId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This tournament is not linked to a club (cannot save as club template).',
        })
      }

      await assertClubAdmin(ctx.prisma, userId, tournament.clubId)

      const buildDivisionConstraints = (c: any | null | undefined) => {
        const minDupr = decimalToNumber(c?.minDupr)
        const maxDupr = decimalToNumber(c?.maxDupr)
        const minTeamDupr = decimalToNumber(c?.minTeamDupr)
        const maxTeamDupr = decimalToNumber(c?.maxTeamDupr)
        const minAge = typeof c?.minAge === 'number' ? c.minAge : null
        const maxAge = typeof c?.maxAge === 'number' ? c.maxAge : null
        const genders = (c?.genders ?? 'ANY') as 'ANY' | 'MEN' | 'WOMEN' | 'MIXED'
        const enforcement = (c?.enforcement ?? 'INFO') as 'INFO' | 'HARD'

        return {
          individualDupr: {
            enabled: minDupr !== null || maxDupr !== null,
            min: minDupr ?? undefined,
            max: maxDupr ?? undefined,
          },
          teamDupr: {
            enabled: minTeamDupr !== null || maxTeamDupr !== null,
            min: minTeamDupr ?? undefined,
            max: maxTeamDupr ?? undefined,
          },
          gender: {
            enabled: genders !== 'ANY',
            value: genders !== 'ANY' ? genders : undefined,
          },
          age: {
            enabled: minAge !== null || maxAge !== null,
            min: minAge ?? undefined,
            max: maxAge ?? undefined,
          },
          enforcement,
        }
      }

      const divisions = tournament.divisions ?? []
      if (divisions.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tournament has no divisions. Set up structure first, then save as template.',
        })
      }

      const teamKindToPlayers = (teamKind: string | null): 1 | 2 | 4 => {
        if (teamKind === 'SINGLES_1v1') return 1
        if (teamKind === 'SQUAD_4v4') return 4
        return 2
      }

      const structure =
        tournament.hasDivisions === false
          ? (() => {
              const main = divisions[0]
              const playersPerTeam = teamKindToPlayers(main?.teamKind ?? null)
              if (playersPerTeam === 1) {
                const playerCount = Math.max(1, Number(main?.maxTeams ?? tournament.players.length ?? 1))
                return {
                  mode: 'NO_DIVISIONS' as const,
                  playersPerTeam,
                  playerCount,
                }
              }
              const teamCount = Math.max(2, Number(main?.maxTeams ?? main?.teams?.length ?? 2))
              return {
                mode: 'NO_DIVISIONS' as const,
                playersPerTeam,
                teamCount,
              }
            })()
          : {
              mode: 'WITH_DIVISIONS' as const,
              divisions: divisions.map((d: any) => {
                const playersPerTeam = teamKindToPlayers(d.teamKind ?? null)
                const poolCountRaw = Number(d.poolCount ?? d.pools?.length ?? 1)
                const poolCount = Math.max(1, poolCountRaw || 1)
                const teamCountRaw = Number(d.maxTeams ?? d.teams?.length ?? 2)
                const teamCount = Math.max(2, teamCountRaw || 2)

                return {
                  name: d.name || 'Division',
                  poolCount,
                  teamCount,
                  playersPerTeam,
                  constraints: buildDivisionConstraints(d.constraints),
                }
              }),
            }

      const config = {
        schemaVersion: 1 as const,
        tournament: {
          title: tournament.title,
          description: tournament.description ?? null,
          rulesUrl: tournament.rulesUrl ?? null,
          venueName: tournament.venueName ?? null,
          venueAddress: tournament.venueAddress ?? null,
          format: tournament.format,
          allowDuprSubmission: Boolean(tournament.allowDuprSubmission),
          currency: tournament.currency ?? 'usd',
          timezone: tournament.timezone ?? null,
          seasonLabel: tournament.seasonLabel ?? null,
        },
        structure,
      }

      const parsed = templateConfigV1Schema.safeParse(config)
      if (!parsed.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to build template config from tournament.',
        })
      }

      try {
        const template = await ctx.prisma.clubTournamentTemplate.upsert({
          where: { clubId_name: { clubId: tournament.clubId, name: input.name.trim() } },
          create: {
            clubId: tournament.clubId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            config: parsed.data as any,
            schemaVersion: 1,
            createdByUserId: userId,
            updatedByUserId: userId,
          },
          update: {
            description: input.description?.trim() || null,
            config: parsed.data as any,
            schemaVersion: 1,
            updatedByUserId: userId,
          },
          select: {
            id: true,
            name: true,
            updatedAt: true,
          },
        })

        return template
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_tournament_templates')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_tournament_templates table is missing. Apply DB migration first.',
          })
        }
        throw err
      }
    }),
})
