import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { getTeamSlotCount, normalizeTeamSlots } from '../utils/teamSlots'
import { calculateOrganizerNetCents, fromCents } from '@/lib/payment'
import { ENABLE_DEFERRED_PAYMENTS } from '@/lib/features'
import {
  INVITE_REGISTRATION_CLUBS,
  INVITE_REGISTRATION_LEVELS,
  parseInviteRegistrationName,
} from '@/lib/inviteRegistration'
import {
  hasInviteRegistrationDetails,
  isInviteRegistrationRequiredForTournament,
} from '@/lib/inviteRegistrationGate'
import {
  releaseExpiredUnpaidRegistrations as releaseExpiredUnpaidRegistrationsCore,
  isDuePaymentsSchemaError,
} from '../utils/paymentDue'

const getRegistrationWindow = (tournament: {
  registrationStartDate: Date | null
  registrationEndDate: Date | null
  startDate: Date
}) => {
  const start = tournament.registrationStartDate ?? tournament.startDate
  const end = tournament.registrationEndDate ?? tournament.startDate
  return { start, end }
}

const isRegistrationOpen = (tournament: {
  registrationStartDate: Date | null
  registrationEndDate: Date | null
  startDate: Date
}) => {
  const { start, end } = getRegistrationWindow(tournament)
  const now = new Date()
  return now >= start && now <= end
}

const parseName = (name?: string | null) => {
  if (!name) return { firstName: 'Player', lastName: '' }
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

const getEffectivePaymentTiming = (
  paymentTiming?: 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE' | null
): 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE' => {
  if (!ENABLE_DEFERRED_PAYMENTS) return 'PAY_IN_15_MIN'
  return paymentTiming === 'PAY_BY_DEADLINE' ? 'PAY_BY_DEADLINE' : 'PAY_IN_15_MIN'
}

const getPaymentDueAt = (
  tournament: {
    paymentTiming?: 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE' | null
    registrationEndDate?: Date | null
    startDate: Date
  },
  now = new Date()
) => {
  const effectivePaymentTiming = getEffectivePaymentTiming(tournament.paymentTiming)
  if (effectivePaymentTiming === 'PAY_BY_DEADLINE') {
    return tournament.registrationEndDate ?? tournament.startDate
  }
  return new Date(now.getTime() + FIFTEEN_MINUTES_MS)
}

const getEntryFeeCents = (tournament: {
  entryFeeCents?: number | null
  entryFee?: unknown
}) => {
  if (typeof tournament.entryFeeCents === 'number') return tournament.entryFeeCents
  const fee = Number(tournament.entryFee ?? 0)
  return Number.isFinite(fee) ? Math.round(fee * 100) : 0
}

const inviteRegistrationInputSchema = z.object({
  tournamentId: z.string(),
  fullName: z
    .string()
    .trim()
    .min(3, 'Enter last name and first name')
    .refine((value) => value.split(/\s+/).length >= 2, 'Enter last name and first name'),
  gender: z.enum(['M', 'F']),
  duprRating: z.number().min(0).max(8),
  desiredLevel: z.enum(INVITE_REGISTRATION_LEVELS),
  clubName: z.enum(INVITE_REGISTRATION_CLUBS),
})

const INVITE_REGISTRATION_REQUIRED_MESSAGE =
  'Complete the invite registration form before choosing a spot or paying.'

const upsertPendingInvitePayment = async (
  tx: any,
  tournament: {
    id: string
    entryFeeCents?: number | null
    entryFee?: unknown
    currency?: string | null
    paymentTiming?: 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE' | null
    registrationEndDate?: Date | null
    startDate: Date
  },
  playerId: string,
  now = new Date()
) => {
  const entryFeeCents = getEntryFeeCents(tournament)
  if (entryFeeCents <= 0) return null

  const { platformFeeCents, stripeFeeCents } = calculateOrganizerNetCents(entryFeeCents)
  const dueAt = getPaymentDueAt(
    {
      paymentTiming: getEffectivePaymentTiming(tournament.paymentTiming),
      registrationEndDate: tournament.registrationEndDate,
      startDate: tournament.startDate,
    },
    now
  )

  const pendingPayment = await tx.payment.findFirst({
    where: {
      tournamentId: tournament.id,
      playerId,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, teamId: true, slotIndex: true },
  })

  const paymentData = {
    teamId: pendingPayment?.teamId ?? null,
    slotIndex: typeof pendingPayment?.slotIndex === 'number' ? pendingPayment.slotIndex : null,
    entryFeeAmount: fromCents(entryFeeCents),
    platformFeeAmount: fromCents(platformFeeCents),
    stripeFeeAmount: fromCents(stripeFeeCents),
    totalAmount: fromCents(entryFeeCents),
    currency: tournament.currency ?? 'usd',
    dueAt,
    status: 'PENDING' as const,
  }

  if (pendingPayment) {
    return tx.payment.update({
      where: { id: pendingPayment.id },
      data: paymentData,
    })
  }

  return tx.payment.create({
    data: {
      tournamentId: tournament.id,
      playerId,
      ...paymentData,
    },
  })
}

const releaseExpiredUnpaidRegistrations = async (prisma: any, tournamentId: string) => {
  try {
    await releaseExpiredUnpaidRegistrationsCore(prisma, tournamentId)
  } catch (error: any) {
    if (isDuePaymentsSchemaError(error)) {
      return
    }
    throw error
  }
}

export const registrationRouter = createTRPCRouter({
  getInviteRegistration: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await releaseExpiredUnpaidRegistrations(ctx.prisma, input.tournamentId)

      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: {
          id: true,
          title: true,
          startDate: true,
          registrationStartDate: true,
          registrationEndDate: true,
          entryFee: true,
          entryFeeCents: true,
          currency: true,
          paymentTiming: true,
          user: {
            select: {
              organizerStripeAccountId: true,
              stripeOnboardingComplete: true,
            },
          },
        },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const entryFeeCents = getEntryFeeCents(tournament)
      const player = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: {
            userId: ctx.session.user.id,
            tournamentId: input.tournamentId,
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          gender: true,
          duprRating: true,
          isPaid: true,
          registrationComment: true,
          createdAt: true,
        },
      })

      const latestPayment =
        player && entryFeeCents > 0
          ? await ctx.prisma.payment.findFirst({
              where: {
                playerId: player.id,
                tournamentId: input.tournamentId,
              },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                status: true,
                dueAt: true,
                createdAt: true,
              },
            })
          : null

      return {
        tournament: {
          id: tournament.id,
          title: tournament.title,
          startDate: tournament.startDate,
          registrationStartDate: tournament.registrationStartDate,
          registrationEndDate: tournament.registrationEndDate,
          entryFeeCents,
          currency: tournament.currency ?? 'usd',
          registrationOpen: isRegistrationOpen(tournament),
          // payoutsActive controls the "Pay" button in the invite UI.
          // Two payment models are supported:
          //   1. Organizer Stripe Connect → money goes to organizer's
          //      bank via transfer_data.destination + application_fee_amount
          //   2. Platform-collected → no Connect on organizer; payment
          //      lands on Piqle's platform Stripe account directly
          // Both flows are wired in the checkout-session route; this
          // gate just needs to confirm a fee is set. The destination
          // decision happens in the checkout route based on whether
          // organizer has Connect set up.
          payoutsActive: entryFeeCents > 0,
        },
        player: player
          ? {
              id: player.id,
              firstName: player.firstName,
              lastName: player.lastName,
              email: player.email,
              gender: player.gender,
              duprRating: player.duprRating == null ? null : Number(player.duprRating),
              isPaid: Boolean(player.isPaid) || entryFeeCents <= 0,
              registrationComment: player.registrationComment,
              createdAt: player.createdAt,
              paymentStatus: latestPayment?.status ?? (entryFeeCents > 0 ? 'PENDING' : 'PAID'),
              paymentDueAt: latestPayment?.dueAt ?? null,
            }
          : null,
      }
    }),

  submitInviteRegistration: protectedProcedure
    .input(inviteRegistrationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const normalizedFullName = input.fullName.trim().replace(/\s+/g, ' ')
      const roundedDuprRating = Math.round(input.duprRating * 100) / 100

      return ctx.prisma.$transaction(async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: input.tournamentId },
          select: {
            id: true,
            title: true,
            startDate: true,
            registrationStartDate: true,
            registrationEndDate: true,
            entryFee: true,
            entryFeeCents: true,
            currency: true,
            paymentTiming: true,
          },
        })

        if (!tournament) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
        }

        if (!isRegistrationOpen(tournament)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration closed' })
        }

        const existingPlayer = await tx.player.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: input.tournamentId,
            },
          },
          select: {
            id: true,
            isPaid: true,
          },
        })

        const entryFeeCents = getEntryFeeCents(tournament)
        const isPaidTournament = entryFeeCents > 0
        const { firstName, lastName } = parseInviteRegistrationName(normalizedFullName)
        const now = new Date()
        const registrationComment = {
          source: 'invite_registration' as const,
          fullName: normalizedFullName,
          desiredLevel: input.desiredLevel,
          clubName: input.clubName,
          duprRating: roundedDuprRating,
          gender: input.gender,
          submittedAt: now.toISOString(),
        }

        if (existingPlayer) {
          await tx.player.update({
            where: { id: existingPlayer.id },
            data: {
              firstName,
              lastName,
              email: ctx.session.user.email ?? undefined,
              gender: input.gender,
              duprRating: roundedDuprRating,
              isWaitlist: false,
              registrationComment,
            },
          })

          if (isPaidTournament && !existingPlayer.isPaid) {
            await upsertPendingInvitePayment(tx, tournament, existingPlayer.id, now)
          }

          await tx.auditLog.create({
            data: {
              actorUserId: ctx.session.user.id,
              tournamentId: input.tournamentId,
              action: 'PLAYER_INVITE_REGISTER',
              entityType: 'Player',
              entityId: existingPlayer.id,
              payload: {
                fullName: normalizedFullName,
                gender: input.gender,
                duprRating: roundedDuprRating,
                desiredLevel: input.desiredLevel,
                clubName: input.clubName,
                updatedExistingPlayer: true,
              },
            },
          })

          return {
            alreadyRegistered: true,
            playerId: existingPlayer.id,
            paymentRequired: isPaidTournament && !existingPlayer.isPaid,
            isPaid: Boolean(existingPlayer.isPaid) || !isPaidTournament,
          }
        }

        const player = await tx.player.create({
          data: {
            tournamentId: input.tournamentId,
            userId: ctx.session.user.id,
            firstName,
            lastName,
            email: ctx.session.user.email ?? undefined,
            gender: input.gender,
            duprRating: roundedDuprRating,
            isWaitlist: false,
            isPaid: isPaidTournament ? false : true,
            registrationComment,
          },
        })

        if (isPaidTournament) {
          await upsertPendingInvitePayment(tx, tournament, player.id, now)
        }

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: input.tournamentId,
            action: 'PLAYER_INVITE_REGISTER',
            entityType: 'Player',
            entityId: player.id,
            payload: {
              fullName: normalizedFullName,
              gender: input.gender,
              duprRating: roundedDuprRating,
              desiredLevel: input.desiredLevel,
              clubName: input.clubName,
            },
          },
        })

        return {
          alreadyRegistered: false,
          playerId: player.id,
          paymentRequired: isPaidTournament,
          isPaid: !isPaidTournament,
        }
      })
    }),

  getSeatMap: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await releaseExpiredUnpaidRegistrations(ctx.prisma, input.tournamentId)

      let tournament: any
      try {
        tournament = await ctx.prisma.tournament.findUnique({
          where: { id: input.tournamentId },
          include: {
            user: {
              select: {
                organizerStripeAccountId: true,
                stripeOnboardingComplete: true,
              },
            },
            divisions: {
              include: {
                pools: true,
                teams: {
                  include: {
                    teamPlayers: {
                      include: {
                        player: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      } catch (error: any) {
        const message = String(error?.message ?? '')
        if (
          message.includes('organizer_stripe_account_id') ||
          message.includes('stripe_onboarding_complete')
        ) {
          tournament = await ctx.prisma.tournament.findUnique({
            where: { id: input.tournamentId },
            include: {
              divisions: {
                include: {
                  pools: true,
                  teams: {
                    include: {
                      teamPlayers: {
                        include: {
                          player: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          })
        } else {
          throw error
        }
      }

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const user = tournament.user ?? null

      return {
        id: tournament.id,
        title: tournament.title,
        format: tournament.format,
        timezone: tournament.timezone,
        startDate: tournament.startDate,
        registrationStartDate: tournament.registrationStartDate,
        registrationEndDate: tournament.registrationEndDate,
        entryFeeCents: tournament.entryFeeCents ?? 0,
        currency: tournament.currency ?? 'usd',
        paymentTiming: getEffectivePaymentTiming(
          (tournament.paymentTiming ?? 'PAY_IN_15_MIN') as 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE'
        ),
        // Same semantics as in getInviteRegistration above — payment can
        // flow either via Connect destination (if organizer has it) or
        // directly to platform Stripe (if not). The checkout route
        // decides at runtime.
        payoutsActive: (tournament.entryFeeCents ?? 0) > 0,
        divisions: tournament.divisions,
      }
    }),

  getMyStatus: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await releaseExpiredUnpaidRegistrations(ctx.prisma, input.tournamentId)

      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: {
          id: true,
          entryFeeCents: true,
          paymentTiming: true,
          registrationEndDate: true,
          startDate: true,
        },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      let savedCardInfo: {
        hasSavedCard: boolean
        savedCardBrand: string | null
        savedCardLast4: string | null
      } = {
        hasSavedCard: false,
        savedCardBrand: null,
        savedCardLast4: null,
      }

      try {
        const userCard = await ctx.prisma.user.findUnique({
          where: { id: ctx.session.user.id },
          select: {
            stripeCustomerId: true,
            stripeDefaultPaymentMethodId: true,
            stripeDefaultCardBrand: true,
            stripeDefaultCardLast4: true,
          },
        })
        if (userCard?.stripeCustomerId && userCard.stripeDefaultPaymentMethodId) {
          savedCardInfo = {
            hasSavedCard: true,
            savedCardBrand: userCard.stripeDefaultCardBrand ?? null,
            savedCardLast4: userCard.stripeDefaultCardLast4 ?? null,
          }
        }
      } catch (error: any) {
        if (!isDuePaymentsSchemaError(error)) {
          throw error
        }
      }

      const player = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: {
            userId: ctx.session.user.id,
            tournamentId: input.tournamentId,
          },
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
          waitlistEntries: true,
        },
      })

      if (!player) {
        return { status: 'none' as const }
      }

      const isPaidTournament = (tournament.entryFeeCents ?? 0) > 0

      const latestPayment = isPaidTournament
        ? await ctx.prisma.payment.findFirst({
            where: {
              playerId: player.id,
              tournamentId: input.tournamentId,
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              dueAt: true,
              createdAt: true,
            },
          })
        : null

      const activeTeamPlayer = player.teamPlayers.find(tp => tp.team.division.tournamentId === input.tournamentId)
      if (activeTeamPlayer) {
        const paymentStatus = latestPayment?.status ?? (isPaidTournament ? 'PENDING' : 'PAID')
        const paymentDueAt =
          paymentStatus === 'PENDING'
            ? latestPayment?.dueAt ??
              getPaymentDueAt(
                {
                  paymentTiming: getEffectivePaymentTiming(
                    (tournament.paymentTiming ?? 'PAY_IN_15_MIN') as
                      | 'PAY_IN_15_MIN'
                      | 'PAY_BY_DEADLINE'
                  ),
                  registrationEndDate: tournament.registrationEndDate,
                  startDate: tournament.startDate,
                },
                latestPayment?.createdAt ?? new Date()
              )
            : null

        return {
          status: 'active' as const,
          playerId: player.id,
          teamId: activeTeamPlayer.teamId,
          divisionId: activeTeamPlayer.team.divisionId,
          slotIndex: activeTeamPlayer.slotIndex,
          teamName: activeTeamPlayer.team.name,
          divisionName: activeTeamPlayer.team.division.name,
          isPaid: Boolean(player.isPaid) || !isPaidTournament,
          paymentStatus,
          paymentDueAt,
          paymentTiming: getEffectivePaymentTiming(
            (tournament.paymentTiming ?? 'PAY_IN_15_MIN') as 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE'
          ),
          ...savedCardInfo,
        }
      }

      const waitlistEntry = player.waitlistEntries.find(entry => entry.tournamentId === input.tournamentId && entry.status === 'ACTIVE')
      if (waitlistEntry) {
        return {
          status: 'waitlisted' as const,
          playerId: player.id,
          divisionId: waitlistEntry.divisionId,
          waitlistEntryId: waitlistEntry.id,
        }
      }

      return { status: 'none' as const }
    }),

  getMyStatuses: protectedProcedure
    .input(z.object({ tournamentIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const players = await ctx.prisma.player.findMany({
        where: {
          userId: ctx.session.user.id,
          tournamentId: { in: input.tournamentIds },
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
          waitlistEntries: true,
        },
      })

      const statusByTournament: Record<string, any> = {}
      input.tournamentIds.forEach(id => {
        statusByTournament[id] = { status: 'none' as const }
      })

      for (const player of players) {
        if (!player.tournamentId) continue
        const activeTeamPlayer = player.teamPlayers.find(tp => tp.team.division.tournamentId === player.tournamentId)
        if (activeTeamPlayer) {
          statusByTournament[player.tournamentId] = {
            status: 'active' as const,
            playerId: player.id,
            teamId: activeTeamPlayer.teamId,
            divisionId: activeTeamPlayer.team.divisionId,
            slotIndex: activeTeamPlayer.slotIndex,
            teamName: activeTeamPlayer.team.name,
            divisionName: activeTeamPlayer.team.division.name,
            isPaid: Boolean(player.isPaid),
          }
          continue
        }

        const waitlistEntry = player.waitlistEntries.find(entry => entry.tournamentId === player.tournamentId && entry.status === 'ACTIVE')
        if (waitlistEntry) {
          statusByTournament[player.tournamentId] = {
            status: 'waitlisted' as const,
            playerId: player.id,
            divisionId: waitlistEntry.divisionId,
            waitlistEntryId: waitlistEntry.id,
          }
          continue
        }

        if (hasInviteRegistrationDetails(player.registrationComment)) {
          statusByTournament[player.tournamentId] = {
            status: 'registered' as const,
            playerId: player.id,
            isPaid: Boolean(player.isPaid),
            registrationType: 'invite' as const,
          }
        }
      }

      return statusByTournament
    }),

  getWaitlist: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.waitlistEntry.findMany({
        where: {
          divisionId: input.divisionId,
          status: 'ACTIVE',
        },
        include: {
          player: true,
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  claimSlot: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      slotIndex: z.number().min(0).max(31),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const team = await tx.team.findUnique({
          where: { id: input.teamId },
          include: {
            division: {
              include: {
                tournament: true,
              },
            },
            teamPlayers: true,
          },
        })

        if (!team) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' })
        }

        if (!isRegistrationOpen(team.division.tournament)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration closed' })
        }
        await releaseExpiredUnpaidRegistrations(tx, team.division.tournamentId)

        const slotCount = getTeamSlotCount(
          team.division.teamKind,
          team.division.tournament.format
        )
        if (input.slotIndex >= slotCount) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid slot index' })
        }

        await normalizeTeamSlots(tx, team.id, slotCount)

        const existingSlot = await tx.teamPlayer.findFirst({
          where: { teamId: team.id, slotIndex: input.slotIndex },
        })
        if (existingSlot) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Slot already taken' })
        }

        const inviteRegistrationRequired = isInviteRegistrationRequiredForTournament(
          team.division.tournamentId,
          ctx.inviteRegistrationTournamentIds
        )

        let player = await tx.player.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: team.division.tournamentId,
            },
          },
        })

        if (!player) {
          if (inviteRegistrationRequired) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: INVITE_REGISTRATION_REQUIRED_MESSAGE,
            })
          }

          const { firstName, lastName } = parseName(ctx.session.user.name)
          player = await tx.player.create({
            data: {
              tournamentId: team.division.tournamentId,
              userId: ctx.session.user.id,
              firstName,
              lastName,
              email: ctx.session.user.email ?? undefined,
              isWaitlist: false,
            },
          })
        } else if (
          inviteRegistrationRequired &&
          !hasInviteRegistrationDetails(player.registrationComment)
        ) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: INVITE_REGISTRATION_REQUIRED_MESSAGE,
          })
        }

        const playerWasPaid = Boolean(player.isPaid)

        const existingTeamPlayer = await tx.teamPlayer.findFirst({
          where: {
            playerId: player.id,
            team: {
              division: {
                tournamentId: team.division.tournamentId,
              },
            },
          },
        })
        if (existingTeamPlayer) {
          throw new TRPCError({ code: 'CONFLICT', message: 'You already joined this tournament' })
        }

        await tx.waitlistEntry.deleteMany({
          where: {
            playerId: player.id,
            tournamentId: team.division.tournamentId,
          },
        })

        const teamPlayer = await tx.teamPlayer.create({
          data: {
            teamId: team.id,
            playerId: player.id,
            slotIndex: input.slotIndex,
          },
        })

        const entryFeeCents = team.division.tournament.entryFeeCents ?? 0
        const isPaidTournament = entryFeeCents > 0
        let paymentDueAt: Date | null = null
        let paymentTiming: 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE' | null = null

        if (isPaidTournament && !playerWasPaid) {
          const now = new Date()
          paymentTiming = getEffectivePaymentTiming(
            (team.division.tournament.paymentTiming ?? 'PAY_IN_15_MIN') as
              | 'PAY_IN_15_MIN'
              | 'PAY_BY_DEADLINE'
          ) as
            | 'PAY_IN_15_MIN'
            | 'PAY_BY_DEADLINE'
          paymentDueAt = getPaymentDueAt(
            {
              paymentTiming,
              registrationEndDate: team.division.tournament.registrationEndDate,
              startDate: team.division.tournament.startDate,
            },
            now
          )
          const { platformFeeCents, stripeFeeCents } = calculateOrganizerNetCents(entryFeeCents)

          const existingPending = await tx.payment.findFirst({
            where: {
              tournamentId: team.division.tournamentId,
              playerId: player.id,
              status: 'PENDING',
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          })

          if (existingPending) {
            await tx.payment.update({
              where: { id: existingPending.id },
              data: {
                teamId: team.id,
                slotIndex: input.slotIndex,
                entryFeeAmount: fromCents(entryFeeCents),
                platformFeeAmount: fromCents(platformFeeCents),
                stripeFeeAmount: fromCents(stripeFeeCents),
                totalAmount: fromCents(entryFeeCents),
                currency: team.division.tournament.currency ?? 'usd',
                dueAt: paymentDueAt,
                status: 'PENDING',
              },
            })
          } else {
            await tx.payment.create({
              data: {
                tournamentId: team.division.tournamentId,
                playerId: player.id,
                teamId: team.id,
                slotIndex: input.slotIndex,
                entryFeeAmount: fromCents(entryFeeCents),
                platformFeeAmount: fromCents(platformFeeCents),
                stripeFeeAmount: fromCents(stripeFeeCents),
                totalAmount: fromCents(entryFeeCents),
                currency: team.division.tournament.currency ?? 'usd',
                status: 'PENDING',
                dueAt: paymentDueAt,
              },
            })
          }
        }

        await tx.player.update({
          where: { id: player.id },
          data: {
            isWaitlist: false,
            isPaid: isPaidTournament ? playerWasPaid : true,
          },
        })

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: team.division.tournamentId,
            action: 'PLAYER_CLAIM_SLOT',
            entityType: 'TeamPlayer',
            entityId: teamPlayer.id,
            payload: {
              teamId: team.id,
              divisionId: team.divisionId,
              slotIndex: input.slotIndex,
            },
          },
        })

        return {
          success: true,
          paymentDueAt,
          paymentTiming,
          isPaid: !isPaidTournament || playerWasPaid,
        }
      })
    }),

  cancelRegistration: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: {
            userId: ctx.session.user.id,
            tournamentId: input.tournamentId,
          },
        },
      })

      if (!player) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      const hasInviteDetails = hasInviteRegistrationDetails(player.registrationComment)

      const teamPlayer = await ctx.prisma.teamPlayer.findFirst({
        where: {
          playerId: player.id,
          team: {
            division: {
              tournamentId: input.tournamentId,
            },
          },
        },
        include: {
          team: {
            include: {
              division: true,
            },
          },
        },
      })

      if (!teamPlayer && !hasInviteDetails) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Registration not found' })
      }

      await ctx.prisma.$transaction(async (tx) => {
        if (hasInviteDetails) {
          await tx.auditLog.create({
            data: {
              actorUserId: ctx.session.user.id,
              tournamentId: input.tournamentId,
              action: 'PLAYER_CANCEL_REGISTRATION',
              entityType: 'Player',
              entityId: player.id,
              payload: {
                teamId: teamPlayer?.teamId ?? null,
                divisionId: teamPlayer?.team.divisionId ?? null,
                registrationType: 'invite',
              },
            },
          })

          await tx.player.delete({ where: { id: player.id } })
          return
        }

        if (!teamPlayer) return

        await tx.teamPlayer.delete({ where: { id: teamPlayer.id } })

        await tx.payment.updateMany({
          where: {
            tournamentId: input.tournamentId,
            playerId: player.id,
            status: 'PENDING',
          },
          data: {
            status: 'CANCELED',
          },
        })

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: input.tournamentId,
            action: 'PLAYER_CANCEL_REGISTRATION',
            entityType: 'TeamPlayer',
            entityId: teamPlayer.id,
            payload: {
              teamId: teamPlayer.teamId,
              divisionId: teamPlayer.team.divisionId,
            },
          },
        })
      })

      return { success: true }
    }),

  joinWaitlist: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const division = await tx.division.findUnique({
          where: { id: input.divisionId },
          include: { tournament: true },
        })

        if (!division) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
        }

        if (!isRegistrationOpen(division.tournament)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration closed' })
        }

        const inviteRegistrationRequired = isInviteRegistrationRequiredForTournament(
          division.tournamentId,
          ctx.inviteRegistrationTournamentIds
        )

        let player = await tx.player.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: division.tournamentId,
            },
          },
        })

        if (!player) {
          if (inviteRegistrationRequired) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: INVITE_REGISTRATION_REQUIRED_MESSAGE,
            })
          }

          const { firstName, lastName } = parseName(ctx.session.user.name)
          player = await tx.player.create({
            data: {
              tournamentId: division.tournamentId,
              userId: ctx.session.user.id,
              firstName,
              lastName,
              email: ctx.session.user.email ?? undefined,
              isWaitlist: true,
            },
          })
        } else if (
          inviteRegistrationRequired &&
          !hasInviteRegistrationDetails(player.registrationComment)
        ) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: INVITE_REGISTRATION_REQUIRED_MESSAGE,
          })
        }

        const existingTeamPlayer = await tx.teamPlayer.findFirst({
          where: {
            playerId: player.id,
            team: {
              division: {
                tournamentId: division.tournamentId,
              },
            },
          },
        })
        if (existingTeamPlayer) {
          throw new TRPCError({ code: 'CONFLICT', message: 'You already joined this tournament' })
        }

        const existingEntry = await tx.waitlistEntry.findFirst({
          where: {
            playerId: player.id,
            tournamentId: division.tournamentId,
            status: 'ACTIVE',
          },
        })
        if (existingEntry) {
          return { success: true }
        }

        await tx.waitlistEntry.create({
          data: {
            tournamentId: division.tournamentId,
            divisionId: division.id,
            playerId: player.id,
            status: 'ACTIVE',
          },
        })

        await tx.player.update({
          where: { id: player.id },
          data: { isWaitlist: true },
        })

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: division.tournamentId,
            action: 'PLAYER_JOIN_WAITLIST',
            entityType: 'WaitlistEntry',
            entityId: player.id,
            payload: {
              divisionId: division.id,
            },
          },
        })

        return { success: true }
      })
    }),

  leaveWaitlist: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        select: { tournamentId: true },
      })

      if (!division) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
      }

      const player = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: {
            userId: ctx.session.user.id,
            tournamentId: division.tournamentId,
          },
        },
      })

      if (!player) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      await ctx.prisma.waitlistEntry.deleteMany({
        where: {
          playerId: player.id,
          tournamentId: division.tournamentId,
        },
      })

      await ctx.prisma.player.update({
        where: { id: player.id },
        data: { isWaitlist: false },
      })

      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'PLAYER_LEAVE_WAITLIST',
          entityType: 'WaitlistEntry',
          entityId: player.id,
          payload: {
            divisionId: input.divisionId,
          },
        },
      })

      return { success: true }
    }),
})
