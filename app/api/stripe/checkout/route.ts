import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { getRequestBaseUrl } from '@/lib/requestBaseUrl'
import { priceIdToPlan } from '@/lib/subscription'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const priceId = typeof body?.priceId === 'string' ? body.priceId.trim() : ''
    const clubId = typeof body?.clubId === 'string' ? body.clubId.trim() : ''

    if (!priceId || !clubId) {
      return NextResponse.json(
        { error: 'priceId and clubId are required' },
        { status: 400 }
      )
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    })
    if (!club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 })
    }

    const stripe = getStripe()

    // Find or create Stripe customer via the Subscription record
    let subscription = await prisma.subscription.findUnique({
      where: { clubId },
    })

    let stripeCustomerId = subscription?.stripeCustomerId ?? null

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        metadata: {
          clubId,
          userId: session.user.id,
        },
      })
      stripeCustomerId = customer.id

      if (subscription) {
        await prisma.subscription.update({
          where: { clubId },
          data: { stripeCustomerId },
        })
      } else {
        subscription = await prisma.subscription.create({
          data: {
            clubId,
            stripeCustomerId,
            plan: 'free',
            status: 'trialing',
          },
        })
      }
    }

    const plan = priceIdToPlan(priceId)
    const baseUrl = getRequestBaseUrl(request, { scope: 'stripe-checkout' })

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { clubId, userId: session.user.id, plan },
      },
      metadata: { clubId, userId: session.user.id, plan },
      success_url: `${baseUrl}/clubs/${clubId}/intelligence?subscription=success`,
      cancel_url: `${baseUrl}/clubs/${clubId}/intelligence/settings`,
    })

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
