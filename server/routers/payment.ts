import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'
import { stripe, calculatePlatformFeeAmount, STRIPE_CURRENCY_DEFAULT } from '@/lib/stripe'

const baseAppUrl =
  process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const paymentRouter = createTRPCRouter({
  getSettings: tdProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: {
          isPaid: true,
          entryFee: true,
          currency: true,
          paymentSetting: true,
        },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      return {
        isPaid: tournament.isPaid,
        entryFee: tournament.entryFee,
        currency: tournament.currency,
        paymentSetting: tournament.paymentSetting,
      }
    }),

  initStripeAccount: tdProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!stripe) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Stripe is not configured on server',
        })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        include: { paymentSetting: true },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      let paymentSetting = tournament.paymentSetting

      if (!paymentSetting) {
        paymentSetting = await ctx.prisma.tournamentPaymentSetting.create({
          data: {
            tournamentId: tournament.id,
            stripeAccountStatus: 'PENDING',
          },
        })
      }

      let stripeAccountId = paymentSetting.stripeAccountId

      if (!stripeAccountId) {
        const account = await stripe.accounts.create({
          type: 'express',
        })

        stripeAccountId = account.id

        paymentSetting = await ctx.prisma.tournamentPaymentSetting.update({
          where: { tournamentId: tournament.id },
          data: {
            stripeAccountId,
            stripeAccountStatus: account.charges_enabled ? 'ACTIVE' : 'REQUIRE_ONBOARDING',
          },
        })
      }

      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${baseAppUrl}/admin/${tournament.id}/payments/onboarding`,
        return_url: `${baseAppUrl}/admin/${tournament.id}/payments/onboarding-success`,
        type: 'account_onboarding',
      })

      return {
        accountLinkUrl: accountLink.url,
        paymentSetting,
      }
    }),

  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        divisionId: z.string().optional(),
        teamId: z.string().optional(),
        playerId: z.string().optional(),
        successPath: z.string().optional(),
        cancelPath: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check admin access to tournament
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      if (!stripe) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Stripe is not configured on server',
        })
      }

      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        include: {
          paymentSetting: true,
        },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      if (!tournament.isPaid || !tournament.entryFee) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tournament is not marked as paid',
        })
      }

      if (!tournament.paymentSetting?.stripeAccountId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Tournament Stripe account is not configured',
        })
      }

      const amountInCents = Math.round(Number(tournament.entryFee) * 100)
      const applicationFeeAmount = calculatePlatformFeeAmount(amountInCents)
      const successUrl = `${baseAppUrl}${input.successPath || '/payments/success'}`
      const cancelUrl = `${baseAppUrl}${input.cancelPath || '/payments/cancel'}`
      const currency = tournament.currency || STRIPE_CURRENCY_DEFAULT

      const metadata: Record<string, string> = {
        tournamentId: tournament.id,
      }

      if (input.teamId) {
        metadata.teamId = input.teamId
      }
      if (input.playerId) {
        metadata.playerId = input.playerId
      }
      if (input.divisionId) {
        metadata.divisionId = input.divisionId
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        currency,
        customer_email: ctx.session.user.email || undefined,
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: amountInCents,
              product_data: {
                name: `Участие в турнире "${tournament.title}"`,
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: applicationFeeAmount,
          transfer_data: {
            destination: tournament.paymentSetting.stripeAccountId,
          },
        },
        metadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      })

      await ctx.prisma.payment.create({
        data: {
          tournamentId: tournament.id,
          divisionId: input.divisionId,
          teamId: input.teamId,
          playerId: input.playerId,
          amount: amountInCents,
          currency,
          applicationFeeAmount,
          platformRevenue: applicationFeeAmount,
          payoutAmount: amountInCents - applicationFeeAmount,
          stripeCheckoutSessionId: session.id,
          status: 'PENDING',
          metadata,
          createdByUserId: ctx.session.user.id,
        },
      })

      return {
        checkoutUrl: session.url,
        sessionId: session.id,
      }
    }),

  listPayments: tdProcedure
    .input(
      z.object({
        tournamentId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      const payments = await ctx.prisma.payment.findMany({
        where: { tournamentId: input.tournamentId },
        orderBy: { createdAt: 'desc' },
      })

      return payments
    }),
})

