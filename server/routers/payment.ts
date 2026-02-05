import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { getStripe } from '@/lib/stripe'
import { calculateOrganizerNetCents, fromCents } from '@/lib/payment'

const CURRENCY = 'usd'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const paymentRouter = createTRPCRouter({
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
