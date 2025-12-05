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
        break
      }
      // TODO: Uncomment when Payment model is added to schema
      // case 'checkout.session.completed': {
      //   const session = event.data.object as Stripe.Checkout.Session
      //   const checkoutSessionId = session.id
      //   const payment = await prisma.payment.findUnique({
      //     where: { stripeCheckoutSessionId: checkoutSessionId },
      //   })
      //   if (!payment) break
      //   // ... payment processing
      //   break
      // }
      default:
        break
    }
  } catch (err) {
    console.error('[Stripe webhook] Handler error', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

