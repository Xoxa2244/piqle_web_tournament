import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { priceIdToPlan } from '@/lib/subscription'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET

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
    console.error('Webhook signature verification failed:', error)
    return new NextResponse('Invalid signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      }
      case 'invoice.payment_failed': {
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      }
      case 'invoice.payment_succeeded': {
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      }
      default:
        break
    }
  } catch (error) {
    console.error(`Error handling event ${event.type}:`, error)
    // Return 200 anyway so Stripe doesn't retry indefinitely
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Only handle subscription checkouts
  if (session.mode !== 'subscription') return

  const clubId = session.metadata?.clubId
  const userId = session.metadata?.userId
  const plan = session.metadata?.plan ?? 'starter'

  if (!clubId) {
    console.error('checkout.session.completed: missing clubId in metadata')
    return
  }

  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null

  const stripeCustomerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id ?? null

  // Retrieve full subscription to get period dates
  let periodStart: Date | null = null
  let periodEnd: Date | null = null
  let trialEnd: Date | null = null
  let status = 'active'
  let stripePriceId: string | null = null
  let cancelAtPeriodEnd = false

  if (stripeSubscriptionId) {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
    const firstItem = sub.items.data[0]
    periodStart = firstItem ? new Date(firstItem.current_period_start * 1000) : null
    periodEnd = firstItem ? new Date(firstItem.current_period_end * 1000) : null
    trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null
    status = sub.status
    cancelAtPeriodEnd = sub.cancel_at_period_end
    stripePriceId = firstItem?.price?.id ?? null
  }

  await prisma.subscription.upsert({
    where: { clubId },
    create: {
      clubId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      plan: stripePriceId ? priceIdToPlan(stripePriceId) : plan,
      status,
      trialEndsAt: trialEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
    },
    update: {
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      plan: stripePriceId ? priceIdToPlan(stripePriceId) : plan,
      status,
      trialEndsAt: trialEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
    },
  })
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  let resolvedClubId = sub.metadata?.clubId
  if (!resolvedClubId) {
    const existing = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: sub.id },
    })
    if (!existing) {
      console.error('customer.subscription.updated: cannot find subscription for', sub.id)
      return
    }
    resolvedClubId = existing.clubId
  }

  // Detect trial → non-trial transition before updating
  const oldRecord = await prisma.subscription.findUnique({
    where: { clubId: resolvedClubId },
    select: { status: true },
  })
  const wasTrialing = oldRecord?.status === 'trialing'

  await updateSubscriptionRecord(resolvedClubId, sub)

  // Send trial ended email if transitioned from trialing
  if (wasTrialing && sub.status !== 'trialing') {
    try {
      const { sendTrialEndedEmail } = await import('@/lib/transactional-emails')
      await sendTrialEndedEmail({ clubId: resolvedClubId })
    } catch (err) {
      console.error('[Webhook] Trial ended email failed:', err)
    }
  }
}

async function updateSubscriptionRecord(clubId: string, sub: Stripe.Subscription) {
  const firstItem = sub.items.data[0]
  const stripePriceId = firstItem?.price?.id ?? null

  await prisma.subscription.update({
    where: { clubId },
    data: {
      stripeSubscriptionId: sub.id,
      stripePriceId,
      plan: stripePriceId ? priceIdToPlan(stripePriceId) : undefined,
      status: sub.status,
      currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
      currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  })
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
  })
  if (!existing) return

  await prisma.subscription.update({
    where: { stripeSubscriptionId: sub.id },
    data: {
      status: 'canceled',
      cancelAtPeriodEnd: false,
    },
  })

  // Send cancellation email
  try {
    const { sendSubscriptionCanceledEmail } = await import('@/lib/transactional-emails')
    await sendSubscriptionCanceledEmail({
      clubId: existing.clubId,
      accessUntil: existing.currentPeriodEnd,
    })
  } catch (err) {
    console.error('[Webhook] Subscription canceled email failed:', err)
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subRef = invoice.parent?.subscription_details?.subscription
  const stripeSubscriptionId =
    typeof subRef === 'string' ? subRef : subRef?.id ?? null

  if (!stripeSubscriptionId) return

  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
  })
  if (!existing) return

  await prisma.subscription.update({
    where: { stripeSubscriptionId },
    data: { status: 'past_due' },
  })

  // Send payment failed email
  try {
    const { sendPaymentFailedEmail } = await import('@/lib/transactional-emails')
    await sendPaymentFailedEmail({
      clubId: existing.clubId,
      amountDue: typeof invoice.amount_due === 'number' ? invoice.amount_due : 0,
      currency: invoice.currency || 'usd',
      nextAttempt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null,
    })
  } catch (err) {
    console.error('[Webhook] Payment failed email failed:', err)
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subRef = invoice.parent?.subscription_details?.subscription
  const stripeSubscriptionId =
    typeof subRef === 'string' ? subRef : subRef?.id ?? null

  if (!stripeSubscriptionId) return

  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
  })
  if (!existing) return

  try {
    const { sendPaymentSuccessEmail } = await import('@/lib/transactional-emails')
    await sendPaymentSuccessEmail({
      clubId: existing.clubId,
      plan: existing.plan,
      amountPaid: typeof invoice.amount_paid === 'number' ? invoice.amount_paid : 0,
      currency: invoice.currency || 'usd',
      periodEnd: existing.currentPeriodEnd || new Date(),
      receiptUrl: invoice.hosted_invoice_url || null,
    })
  } catch (err) {
    console.error('[Webhook] Payment success email failed:', err)
  }
}
