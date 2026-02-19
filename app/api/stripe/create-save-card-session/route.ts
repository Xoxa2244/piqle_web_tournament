import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

const resolveAppBaseUrl = (request: Request) => {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    const protocol = forwardedProto || (forwardedHost.startsWith('localhost') ? 'http' : 'https')
    return `${protocol}://${forwardedHost}`
  }

  try {
    return new URL(request.url).origin
  } catch {
    const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    if (env) return env.startsWith('http') ? env.replace(/\/$/, '') : `https://${env}`
    return 'http://localhost:3000'
  }
}

const isSavedCardSchemaError = (error: any) => {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    message.includes('stripe_customer_id') ||
    message.includes('stripe_default_payment_method_id') ||
    message.includes('stripe_default_card_brand') ||
    message.includes('stripe_default_card_last4')
  )
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: any = null
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const tournamentId = typeof body?.tournamentId === 'string' ? body.tournamentId.trim() : ''
    if (!tournamentId) {
      return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 })
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    })
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const stripe = getStripe()
    let customerId = user.stripeCustomerId ?? null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        metadata: {
          userId: user.id,
        },
      })
      customerId = customer.id
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            stripeCustomerId: customerId,
          },
        })
      } catch (error: any) {
        if (!isSavedCardSchemaError(error)) {
          throw error
        }
        return NextResponse.json(
          { error: 'Saved cards are not ready yet. Apply phase 2 SQL migration first.' },
          { status: 409 }
        )
      }
    }

    const appBaseUrl = resolveAppBaseUrl(request)
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'setup',
      payment_method_types: ['card'],
      customer: customerId,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        tournamentId,
        purpose: 'AUTOPAY_SETUP',
      },
      success_url: `${appBaseUrl}/tournaments/${tournamentId}/register?card=saved`,
      cancel_url: `${appBaseUrl}/tournaments/${tournamentId}/register?card=cancel`,
    })

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'Failed to create save-card session' }, { status: 500 })
    }

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error('Create save-card session error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create save-card session' },
      { status: 500 }
    )
  }
}
