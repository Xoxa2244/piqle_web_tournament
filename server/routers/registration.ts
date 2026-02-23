import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { getTeamSlotCount, normalizeTeamSlots } from '../utils/teamSlots'
import { calculateOrganizerNetCents, fromCents } from '@/lib/payment'
import { ENABLE_DEFERRED_PAYMENTS } from '@/lib/features'
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
        payoutsActive:
          Boolean(user?.organizerStripeAccountId) &&
          Boolean(user?.stripeOnboardingComplete),
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

        let player = await tx.player.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: team.division.tournamentId,
            },
          },
        })

        if (!player) {
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
        }

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

        if (isPaidTournament) {
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
            isPaid: isPaidTournament ? false : true,
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

        return { success: true, paymentDueAt, paymentTiming }
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

      if (!teamPlayer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Registration not found' })
      }

      await ctx.prisma.teamPlayer.delete({ where: { id: teamPlayer.id } })

      await ctx.prisma.payment.updateMany({
        where: {
          tournamentId: input.tournamentId,
          playerId: player.id,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELED',
        },
      })

      await ctx.prisma.auditLog.create({
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

        let player = await tx.player.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: division.tournamentId,
            },
          },
        })

        if (!player) {
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
