import { NextRequest, NextResponse } from 'next/server'

import { getSessionFromMobileToken } from '@/lib/mobileAuth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'

const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token.trim()
}

export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Missing mobile auth token.' },
      { status: 401 }
    )
  }

  const session = await getSessionFromMobileToken(token)
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or expired mobile auth token.' },
      { status: 401 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      organizerStripeAccountId: true,
      stripeOnboardingComplete: true,
    },
  })

  if (!user?.organizerStripeAccountId) {
    return NextResponse.json({ hasAccount: false, payoutsActive: false })
  }

  const stripe = getStripe()
  const account = await stripe.accounts.retrieve(user.organizerStripeAccountId)
  const payoutsActive = Boolean(account.details_submitted && account.charges_enabled)

  if (payoutsActive !== user.stripeOnboardingComplete) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeOnboardingComplete: payoutsActive },
    })
  }

  return NextResponse.json({ hasAccount: true, payoutsActive })
}

