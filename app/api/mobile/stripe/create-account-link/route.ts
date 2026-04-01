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

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}))
  const origin = req.nextUrl.origin
  const defaultRefreshUrl = `${origin}/stripe/mobile-return?status=refresh`
  const defaultReturnUrl = `${origin}/stripe/mobile-return?status=return`
  // Mobile Stripe flow должен возвращать на этот же deployment host.
  const refreshUrl =
    typeof body?.refreshUrl === 'string' && body.refreshUrl.startsWith(origin)
      ? body.refreshUrl
      : defaultRefreshUrl
  const returnUrl =
    typeof body?.returnUrl === 'string' && body.returnUrl.startsWith(origin)
      ? body.returnUrl
      : defaultReturnUrl

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      organizerStripeAccountId: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'User not found.' }, { status: 404 })
  }

  const stripe = getStripe()
  let accountId = user.organizerStripeAccountId

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    })
    accountId = account.id
    await prisma.user.update({
      where: { id: user.id },
      data: { organizerStripeAccountId: accountId },
    })
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url })
}

