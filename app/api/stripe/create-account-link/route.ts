import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const refreshUrl = body?.refreshUrl ?? `${APP_URL}/admin?stripe=refresh`
  const returnUrl = body?.returnUrl ?? `${APP_URL}/admin?stripe=return`

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      organizerStripeAccountId: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
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
