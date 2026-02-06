import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { getStripe } from '@/lib/stripe'
import { calculateOrganizerNetCents, fromCents } from '@/lib/payment'
import { getTeamSlotCount } from '../utils/teamSlots'

const CURRENCY = 'usd'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const toCents = (value?: Prisma.Decimal | number | null) => {
  if (value === null || value === undefined) return 0
  return Math.round(Number(value) * 100)
}

const getStatusCount = (
  status: string,
  rows: Array<{ status: string; _count: { _all: number } }>
) => rows.find((row) => row.status === status)?._count._all ?? 0

export const paymentRouter = createTRPCRouter({
  organizerSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const [user, paidTotals, statusCounts, canceledTotals] = await Promise.all([
      ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          organizerStripeAccountId: true,
          stripeOnboardingComplete: true,
        },
      }),
      ctx.prisma.payment.aggregate({
        where: { tournament: { userId }, status: 'PAID' },
        _sum: {
          entryFeeAmount: true,
          platformFeeAmount: true,
          stripeFeeAmount: true,
          totalAmount: true,
        },
        _count: { _all: true },
      }),
      ctx.prisma.payment.groupBy({
        by: ['status'],
        where: { tournament: { userId } },
        _count: { _all: true },
      }),
      ctx.prisma.payment.aggregate({
        where: { tournament: { userId }, status: 'CANCELED' },
        _sum: {
          entryFeeAmount: true,
        },
      }),
    ])

    let balance: { availableCents: number; pendingCents: number; currency: string } | null = null
    const stripeAccountId = user?.organizerStripeAccountId
    if (stripeAccountId) {
      try {
        const stripe = getStripe()
        const stripeBalance = await stripe.balance.retrieve({
          stripeAccount: stripeAccountId,
        })
        const availableCents = stripeBalance.available
          .filter((item) => item.currency === CURRENCY)
          .reduce((sum, item) => sum + item.amount, 0)
        const pendingCents = stripeBalance.pending
          .filter((item) => item.currency === CURRENCY)
          .reduce((sum, item) => sum + item.amount, 0)

        balance = {
          availableCents,
          pendingCents,
          currency: CURRENCY,
        }
      } catch (error) {
        console.warn('Failed to load Stripe balance', error)
      }
    }

    const grossCents = toCents(paidTotals._sum.entryFeeAmount)
    const platformFeeCents = toCents(paidTotals._sum.platformFeeAmount)
    const stripeFeeCents = toCents(paidTotals._sum.stripeFeeAmount)
    const netCents = grossCents - platformFeeCents - stripeFeeCents
    const refundsCents = toCents(canceledTotals._sum.entryFeeAmount)

    return {
      payoutsActive: Boolean(user?.organizerStripeAccountId && user?.stripeOnboardingComplete),
      totals: {
        grossCents,
        platformFeeCents,
        stripeFeeCents,
        netCents,
        refundsCents,
      },
      statusCounts: {
        paid: getStatusCount('PAID', statusCounts),
        pending: getStatusCount('PENDING', statusCounts),
        canceled: getStatusCount('CANCELED', statusCounts),
        failed: getStatusCount('FAILED', statusCounts),
      },
      balance,
    }
  }),

  organizerTransactions: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string().optional(),
        status: z.enum(['PENDING', 'PAID', 'CANCELED', 'FAILED']).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const take = input.limit ?? 50
      const skip = input.offset ?? 0
      const dateFilter =
        input.from || input.to
          ? {
              createdAt: {
                ...(input.from ? { gte: new Date(input.from) } : {}),
                ...(input.to ? { lte: new Date(input.to) } : {}),
              },
            }
          : {}

      const where = {
        tournament: { userId },
        ...(input.tournamentId ? { tournamentId: input.tournamentId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...dateFilter,
      }

      const [totalCount, payments] = await Promise.all([
        ctx.prisma.payment.count({ where }),
        ctx.prisma.payment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take,
          skip,
          include: {
            tournament: { select: { id: true, title: true } },
            player: { select: { firstName: true, lastName: true, email: true } },
          },
        }),
      ])

      return {
        totalCount,
        items: payments.map((payment) => ({
          id: payment.id,
          tournamentId: payment.tournamentId,
          tournamentTitle: payment.tournament.title,
          playerName: `${payment.player.firstName} ${payment.player.lastName}`.trim(),
          playerEmail: payment.player.email,
          status: payment.status,
          entryFeeCents: toCents(payment.entryFeeAmount),
          platformFeeCents: toCents(payment.platformFeeAmount),
          stripeFeeCents: toCents(payment.stripeFeeAmount),
          totalCents: toCents(payment.totalAmount),
          currency: payment.currency,
          createdAt: payment.createdAt,
        })),
      }
    }),

  organizerTournamentStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const tournaments = await ctx.prisma.tournament.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        startDate: true,
        entryFeeCents: true,
        currency: true,
        divisions: {
          select: {
            id: true,
            name: true,
            teamKind: true,
            teams: {
              select: {
                id: true,
                _count: { select: { teamPlayers: true } },
              },
            },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    })

    const tournamentIds = tournaments.map((t) => t.id)
    const [paymentSums, waitlistCounts] = await Promise.all([
      ctx.prisma.payment.groupBy({
        by: ['tournamentId'],
        where: { tournamentId: { in: tournamentIds }, status: 'PAID' },
        _sum: {
          entryFeeAmount: true,
          platformFeeAmount: true,
          stripeFeeAmount: true,
          totalAmount: true,
        },
      }),
      ctx.prisma.waitlistEntry.groupBy({
        by: ['divisionId'],
        where: { tournamentId: { in: tournamentIds }, status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ])

    const paymentByTournament = new Map(
      paymentSums.map((row) => [
        row.tournamentId,
        {
          grossCents: toCents(row._sum.entryFeeAmount),
          platformFeeCents: toCents(row._sum.platformFeeAmount),
          stripeFeeCents: toCents(row._sum.stripeFeeAmount),
          netCents:
            toCents(row._sum.entryFeeAmount) -
            toCents(row._sum.platformFeeAmount) -
            toCents(row._sum.stripeFeeAmount),
        },
      ])
    )

    const waitlistByDivision = new Map(
      waitlistCounts.map((row) => [row.divisionId, row._count._all])
    )

    const tournamentsWithStats = tournaments.map((tournament) => {
      const divisions = tournament.divisions.map((division) => {
        const slotCount = getTeamSlotCount(
          (division.teamKind ?? 'DOUBLES_2v2') as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
        )
        const totalSlots = division.teams.length * slotCount
        const filledSlots = division.teams.reduce((sum, team) => {
          const teamPlayers = team._count.teamPlayers
          return sum + Math.min(teamPlayers, slotCount)
        }, 0)
        const waitlistCount = waitlistByDivision.get(division.id) ?? 0
        const fillPercent = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0

        return {
          id: division.id,
          name: division.name,
          totalSlots,
          filledSlots,
          fillPercent,
          waitlistCount,
        }
      })

      const totals = divisions.reduce(
        (acc, division) => {
          acc.totalSlots += division.totalSlots
          acc.filledSlots += division.filledSlots
          acc.waitlistCount += division.waitlistCount
          return acc
        },
        { totalSlots: 0, filledSlots: 0, waitlistCount: 0 }
      )

      const fillPercent =
        totals.totalSlots > 0 ? Math.round((totals.filledSlots / totals.totalSlots) * 100) : 0

      const paymentTotals = paymentByTournament.get(tournament.id) ?? {
        grossCents: 0,
        platformFeeCents: 0,
        stripeFeeCents: 0,
        netCents: 0,
      }

      return {
        id: tournament.id,
        title: tournament.title,
        startDate: tournament.startDate,
        entryFeeCents: tournament.entryFeeCents ?? 0,
        currency: tournament.currency ?? CURRENCY,
        totals: {
          ...totals,
          fillPercent,
        },
        divisions,
        payments: paymentTotals,
      }
    })

    return { tournaments: tournamentsWithStats }
  }),
  getMyPaymentStatus: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await ctx.prisma.player.findUnique({
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

      if (!player) {
        return { status: 'none' as const }
      }

      const payment = await ctx.prisma.payment.findFirst({
        where: {
          playerId: player.id,
          tournamentId: input.tournamentId,
        },
        orderBy: { createdAt: 'desc' },
      })

      if (!payment) {
        return { status: 'none' as const, isPaid: player.isPaid ?? false }
      }

      return {
        status: payment.status,
        isPaid: player.isPaid ?? false,
        entryFeeAmount: Number(payment.entryFeeAmount),
        serviceFeeAmount: Number(payment.platformFeeAmount),
        stripeFeeAmount: Number(payment.stripeFeeAmount),
        totalAmount: Number(payment.totalAmount),
        currency: payment.currency,
      }
    }),

  createCheckoutSession: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: {
          id: true,
          title: true,
          entryFeeCents: true,
        },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const entryFeeCents = tournament.entryFeeCents ?? 0
      if (entryFeeCents <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Entry fee is not set for this tournament' })
      }

      const player = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: {
            userId: ctx.session.user.id,
            tournamentId: tournament.id,
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
        },
      })

      if (!player) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You must join a team before paying' })
      }

      const hasTeam = player.teamPlayers.some(tp => tp.team.division.tournamentId === tournament.id)
      if (!hasTeam) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You must join a team before paying' })
      }

      if (player.isPaid) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Entry fee already paid' })
      }

      const { platformFeeCents, stripeFeeCents } = calculateOrganizerNetCents(entryFeeCents)
      const totalCents = entryFeeCents

      const entryFeeAmount = new Prisma.Decimal(fromCents(entryFeeCents))
      const platformFeeAmount = new Prisma.Decimal(fromCents(platformFeeCents))
      const stripeFeeAmount = new Prisma.Decimal(fromCents(stripeFeeCents))
      const totalAmount = new Prisma.Decimal(fromCents(totalCents))

      let payment = await ctx.prisma.payment.findFirst({
        where: {
          playerId: player.id,
          tournamentId: tournament.id,
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
      })

      if (!payment) {
        payment = await ctx.prisma.payment.create({
          data: {
            tournamentId: tournament.id,
            playerId: player.id,
            entryFeeAmount,
            platformFeeAmount,
            stripeFeeAmount,
            totalAmount,
            currency: CURRENCY,
            status: 'PENDING',
          },
        })
      } else {
        payment = await ctx.prisma.payment.update({
          where: { id: payment.id },
          data: {
            entryFeeAmount,
            platformFeeAmount,
            stripeFeeAmount,
            totalAmount,
            currency: CURRENCY,
          },
        })
      }

      const stripe = getStripe()
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: ctx.session.user.email ?? undefined,
        client_reference_id: payment.id,
        metadata: {
          paymentId: payment.id,
          tournamentId: tournament.id,
          playerId: player.id,
        },
        payment_intent_data: {
          metadata: {
            paymentId: payment.id,
            tournamentId: tournament.id,
            playerId: player.id,
          },
        },
        line_items: [
          {
            price_data: {
              currency: CURRENCY,
              product_data: {
                name: `${tournament.title} Entry Fee`,
              },
              unit_amount: entryFeeCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${APP_URL}/tournaments/${tournament.id}/register?payment=success`,
        cancel_url: `${APP_URL}/tournaments/${tournament.id}/register?payment=cancel`,
      })

      await ctx.prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripeCheckoutSessionId: session.id,
        },
      })

      if (!session.url) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create payment session' })
      }

      return { url: session.url }
    }),
})
