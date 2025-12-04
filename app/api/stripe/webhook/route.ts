import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { calculatePlatformFeeAmount } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret missing' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const payload = await request.text()

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret)
  } catch (err) {
    console.error('[Stripe webhook] Signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        
        // Update User-level Stripe account status
        await prisma.user.updateMany({
          where: { stripeAccountId: account.id },
          data: {
            stripeAccountStatus: account.charges_enabled ? 'ACTIVE' : 'REQUIRE_ONBOARDING',
            paymentsEnabled: account.charges_enabled,
          },
        })
        
        // Also update legacy TournamentPaymentSetting for backward compatibility
        await prisma.tournamentPaymentSetting.updateMany({
          where: { stripeAccountId: account.id },
          data: {
            stripeAccountStatus: account.charges_enabled ? 'ACTIVE' : 'REQUIRE_ONBOARDING',
            paymentsEnabled: account.charges_enabled,
          },
        })
        break
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const checkoutSessionId = session.id

        const payment = await prisma.payment.findUnique({
          where: { stripeCheckoutSessionId: checkoutSessionId },
        })

        if (!payment) {
          break
        }

        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id

        let paymentIntent: Stripe.PaymentIntent | null = null
        if (paymentIntentId) {
          paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
        }

        const amountReceived =
          paymentIntent?.amount_received ?? session.amount_total ?? payment.amount
        const applicationFee =
          paymentIntent?.application_fee_amount ??
          calculatePlatformFeeAmount(amountReceived ?? payment.amount)

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCEEDED',
            stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId,
            amount: amountReceived ?? payment.amount,
            applicationFeeAmount: applicationFee,
            platformRevenue: applicationFee,
            payoutAmount: (amountReceived ?? payment.amount) - applicationFee,
            updatedAt: new Date(),
          },
        })

        if (payment.playerId) {
          await prisma.player.update({
            where: { id: payment.playerId },
            data: { isPaid: true },
          })
        }

        break
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const payment = await prisma.payment.findUnique({
          where: { stripePaymentIntentId: paymentIntent.id },
        })
        if (payment) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED' },
          })
        }
        break
      }
      case 'charge.refunded':
      case 'charge.refund.updated': {
        const charge = event.data.object as Stripe.Charge
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id
        if (!paymentIntentId) {
          break
        }

        await prisma.payment.updateMany({
          where: { stripePaymentIntentId: paymentIntentId },
          data: { status: 'REFUNDED' },
        })
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('[Stripe webhook] Handler error', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

