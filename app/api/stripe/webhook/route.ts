import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const isSavedCardSchemaError = (error: any) => {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    message.includes('stripe_customer_id') ||
    message.includes('stripe_default_payment_method_id') ||
    message.includes('stripe_default_card_brand') ||
    message.includes('stripe_default_card_last4')
  )
}

type CardDetails = {
  customerId: string
  paymentMethodId: string
  cardBrand?: string | null
  cardLast4?: string | null
}

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

  const saveDefaultCardForUser = async (userId: string, card: CardDetails) => {
    const stripe = getStripe()
    await stripe.customers.update(card.customerId, {
      invoice_settings: {
        default_payment_method: card.paymentMethodId,
      },
    })

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          stripeCustomerId: card.customerId,
          stripeDefaultPaymentMethodId: card.paymentMethodId,
          stripeDefaultCardBrand: card.cardBrand ?? null,
          stripeDefaultCardLast4: card.cardLast4 ?? null,
        },
      })
    } catch (error: any) {
      if (!isSavedCardSchemaError(error)) {
        throw error
      }
    }
  }

  const saveDefaultCardFromSetupSession = async (session: Stripe.Checkout.Session) => {
    const userId = session.metadata?.userId
    if (!userId) return

    const setupIntentId =
      typeof session.setup_intent === 'string'
        ? session.setup_intent
        : session.setup_intent?.id
    if (!setupIntentId) return

    const stripe = getStripe()
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ['payment_method'],
    })

    const customerId =
      typeof setupIntent.customer === 'string'
        ? setupIntent.customer
        : setupIntent.customer?.id ?? null
    const paymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id ?? null

    if (!customerId || !paymentMethodId) return

    const paymentMethod =
      typeof setupIntent.payment_method === 'string' ? null : setupIntent.payment_method
    await saveDefaultCardForUser(userId, {
      customerId,
      paymentMethodId,
      cardBrand: paymentMethod?.card?.brand ?? null,
      cardLast4: paymentMethod?.card?.last4 ?? null,
    })
  }

  const saveDefaultCardFromPaymentSession = async (session: Stripe.Checkout.Session) => {
    const userId = session.metadata?.userId
    if (!userId) return

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id
    if (!paymentIntentId) return

    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method'],
    })

    const customerId =
      typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : paymentIntent.customer?.id ??
          (typeof session.customer === 'string' ? session.customer : session.customer?.id) ??
          null
    const paymentMethodId =
      typeof paymentIntent.payment_method === 'string'
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id ?? null
    if (!customerId || !paymentMethodId) return

    const paymentMethod =
      typeof paymentIntent.payment_method === 'string' ? null : paymentIntent.payment_method
    await saveDefaultCardForUser(userId, {
      customerId,
      paymentMethodId,
      cardBrand: paymentMethod?.card?.brand ?? null,
      cardLast4: paymentMethod?.card?.last4 ?? null,
    })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'setup') {
        await saveDefaultCardFromSetupSession(session)
        break
      }

      const paymentId = session.metadata?.paymentId
      if (paymentId) {
        await markPayment(paymentId, 'PAID', session.payment_intent as string | null)
      }
      await saveDefaultCardFromPaymentSession(session)
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
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const paymentId = paymentIntent.metadata?.paymentId
      if (paymentId) {
        await markPayment(paymentId, 'PAID', paymentIntent.id)
      }
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
