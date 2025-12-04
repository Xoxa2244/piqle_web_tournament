import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { stripe } from '@/lib/stripe'

const baseAppUrl =
  process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const userRouter = createTRPCRouter({
  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.prisma.user.findUnique({
        where: {
          id: ctx.session.user.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          gender: true,
          city: true,
          duprLink: true,
          role: true,
        },
      })

      if (!user) {
        throw new Error('User not found')
      }

      return user
    }),

  getProfileById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: {
          id: input.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          gender: true,
          city: true,
          duprLink: true,
          role: true,
        },
      })

      if (!user) {
        throw new Error('User not found')
      }

      return user
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      city: z.string().optional(),
      duprLink: z.string().url().optional().or(z.literal('')),
      image: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updatedUser = await ctx.prisma.user.update({
        where: {
          id: ctx.session.user.id,
        },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.gender !== undefined && { gender: input.gender }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.duprLink !== undefined && { 
            duprLink: input.duprLink === '' ? null : input.duprLink 
          }),
          ...(input.image !== undefined && { image: input.image }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          gender: true,
          city: true,
          duprLink: true,
          role: true,
        },
      })

      return updatedUser
    }),

  becomeTournamentDirector: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Check if user is already a TD or ASSISTANT
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      })

      if (user?.role === 'TD' || user?.role === 'ASSISTANT') {
        throw new Error('You are already a Tournament Director or Assistant')
      }

      // Upgrade user to TD
      const updatedUser = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { role: 'TD' },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          gender: true,
          city: true,
          duprLink: true,
          role: true,
        },
      })

      return updatedUser
    }),

  // Get user's Stripe payment settings
  getStripeSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          stripeAccountId: true,
          stripeAccountStatus: true,
          paymentsEnabled: true,
          role: true,
        },
      })

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      }

      return {
        stripeAccountId: user.stripeAccountId,
        stripeAccountStatus: user.stripeAccountStatus,
        paymentsEnabled: user.paymentsEnabled,
        isTD: user.role === 'TD',
      }
    }),

  // Initialize Stripe Connect account for user
  initStripeConnect: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!stripe) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Stripe is not configured on server',
        })
      }

      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          stripeAccountId: true,
          email: true,
          role: true,
        },
      })

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      }

      // Only TD can connect Stripe
      if (user.role !== 'TD') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only Tournament Directors can connect Stripe',
        })
      }

      let stripeAccountId = user.stripeAccountId

      // Create Stripe Connect account if doesn't exist
      if (!stripeAccountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        })

        stripeAccountId = account.id

        await ctx.prisma.user.update({
          where: { id: user.id },
          data: {
            stripeAccountId,
            stripeAccountStatus: account.charges_enabled ? 'ACTIVE' : 'REQUIRE_ONBOARDING',
            paymentsEnabled: account.charges_enabled,
          },
        })
      }

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${baseAppUrl}/profile?stripe=refresh`,
        return_url: `${baseAppUrl}/profile?stripe=success`,
        type: 'account_onboarding',
      })

      return {
        accountLinkUrl: accountLink.url,
      }
    }),

  // Sync Stripe account status from Stripe
  syncStripeStatus: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!stripe) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Stripe is not configured on server',
        })
      }

      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          stripeAccountId: true,
        },
      })

      if (!user || !user.stripeAccountId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stripe account not found',
        })
      }

      // Fetch account status from Stripe
      const account = await stripe.accounts.retrieve(user.stripeAccountId)

      // Update user status in database
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: {
          stripeAccountStatus: account.charges_enabled ? 'ACTIVE' : 'REQUIRE_ONBOARDING',
          paymentsEnabled: account.charges_enabled,
        },
      })

      return {
        stripeAccountStatus: account.charges_enabled ? 'ACTIVE' : 'REQUIRE_ONBOARDING',
        paymentsEnabled: account.charges_enabled,
      }
    }),
})

