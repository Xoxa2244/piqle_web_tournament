import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { getRequestBaseUrl } from '@/lib/requestBaseUrl'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const clubId = typeof body?.clubId === 'string' ? body.clubId.trim() : ''

    if (!clubId) {
      return NextResponse.json({ error: 'clubId is required' }, { status: 400 })
    }

    const subscription = await prisma.subscription.findUnique({
      where: { clubId },
      select: { stripeCustomerId: true },
    })

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found for this club' },
        { status: 404 }
      )
    }

    const stripe = getStripe()
    const baseUrl = getRequestBaseUrl(request, { scope: 'stripe-portal' })

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${baseUrl}/clubs/${clubId}/intelligence/settings`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error: any) {
    console.error('Stripe portal error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
