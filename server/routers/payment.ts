import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { stripe, calculatePlatformFeeAmount, STRIPE_CURRENCY_DEFAULT } from '@/lib/stripe'

const baseAppUrl =
  process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const paymentRouter = createTRPCRouter({
  // Public checkout session for player self-registration (user-level Stripe)
  createRegistrationCheckout: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        playerId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!stripe) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Stripe is not configured on server',
        })
      }

      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        include: {
          user: {
            select: {
              id: true,
              stripeAccountId: true,
              stripeAccountStatus: true,
              paymentsEnabled: true,
            },
          },
        },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      if (!tournament.entryFee || parseFloat(tournament.entryFee.toString()) <= 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tournament does not require payment',
        })
      }

      // Check if TD has Stripe Connect set up (User-level)
      if (!tournament.user.stripeAccountId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Payment system is not configured for this tournament. Please contact the tournament director.',
        })
      }

      if (tournament.user.stripeAccountStatus !== 'ACTIVE' || !tournament.user.paymentsEnabled) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Payment system is not active for this tournament. Please contact the tournament director.',
        })
      }

      // Verify player exists and belongs to this tournament
      const player = await ctx.prisma.player.findUnique({
        where: { id: input.playerId },
      })

      if (!player || player.tournamentId !== input.tournamentId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      // Check if already paid
      if (player.isPaid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Payment already completed',
        })
      }

      const amountInCents = Math.round(Number(tournament.entryFee) * 100)
      const applicationFeeAmount = calculatePlatformFeeAmount(amountInCents)

      const successUrl = `${baseAppUrl}/scoreboard/${input.tournamentId}?payment=success`
      const cancelUrl = `${baseAppUrl}/register/${input.tournamentId}?payment=cancelled`

      // Create Checkout Session (using User's Stripe account)
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: STRIPE_CURRENCY_DEFAULT,
              product_data: {
                name: `${tournament.title} - Entry Fee`,
                description: `Registration fee for ${tournament.title}`,
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: applicationFeeAmount,
          transfer_data: {
            destination: tournament.user.stripeAccountId!,
          },
          metadata: {
            tournamentId: input.tournamentId,
            playerId: input.playerId,
          },
        },
        metadata: {
          tournamentId: input.tournamentId,
          playerId: input.playerId,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      })

      // Create payment record
      await ctx.prisma.payment.create({
        data: {
          tournamentId: input.tournamentId,
          playerId: input.playerId,
          amount: amountInCents,
          currency: STRIPE_CURRENCY_DEFAULT,
          applicationFeeAmount,
          platformRevenue: applicationFeeAmount,
          payoutAmount: amountInCents - applicationFeeAmount,
          stripeCheckoutSessionId: session.id,
          status: 'PENDING',
          createdByUserId: ctx.session.user.id,
        },
      })

      return {
        checkoutUrl: session.url,
      }
    }),

  // TODO: Add other payment methods when Payment model is available:
  // - getSettings
  // - initStripeAccount
  // - createCheckoutSession
  // - listPayments
})
