import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      organizerStripeAccountId: true,
      stripeOnboardingComplete: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const stripe = getStripe()

  if (user.organizerStripeAccountId) {
    const account = await stripe.accounts.retrieve(user.organizerStripeAccountId)
    const onboardingComplete = Boolean(account.details_submitted && account.charges_enabled)
    if (onboardingComplete !== user.stripeOnboardingComplete) {
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeOnboardingComplete: onboardingComplete },
      })
    }

    return NextResponse.json({
      accountId: user.organizerStripeAccountId,
      payoutsActive: onboardingComplete,
    })
  }

  const account = await stripe.accounts.create({
    type: 'express',
    email: user.email ?? undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { organizerStripeAccountId: account.id },
  })

  return NextResponse.json({
    accountId: account.id,
    payoutsActive: false,
  })
}
