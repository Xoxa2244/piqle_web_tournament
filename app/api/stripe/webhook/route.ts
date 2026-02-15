import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(request: Request) {
  if (!webhookSecret) {
    return new NextResponse('STRIPE_WEBHOOK_SECRET is not set', { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return new NextResponse('Missing stripe-signature header', { status: 400 })
  }

  const payload = await request.text()
  let event: Stripe.Event

  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (error) {
    return new NextResponse('Invalid signature', { status: 400 })
  }

  const markPayment = async (
    paymentId: string,
    status: 'PAID' | 'CANCELED' | 'FAILED',
    paymentIntentId?: string | null
  ) => {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    })
    if (!payment) return

    if (status !== 'PAID') {
      if (payment.status === 'PAID') {
        return
      }
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status,
          stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId,
        },
      })
      return
    }

    if (payment.status === 'PAID') {
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId,
        },
      })

      await tx.player.update({
        where: { id: payment.playerId },
        data: { isPaid: true },
      })
    })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const paymentId = session.metadata?.paymentId
      if (paymentId) {
        await markPayment(paymentId, 'PAID', session.payment_intent as string | null)
      }
      break
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      const paymentId = session.metadata?.paymentId
      if (paymentId) {
        await markPayment(paymentId, 'CANCELED', session.payment_intent as string | null)
      }
      break
    }
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const paymentId = paymentIntent.metadata?.paymentId
      if (paymentId) {
        await markPayment(paymentId, 'FAILED', paymentIntent.id)
      }
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
