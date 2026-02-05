import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    return NextResponse.json({
      hasAccount: false,
      payoutsActive: false,
    })
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

  return NextResponse.json({
    hasAccount: true,
    payoutsActive,
  })
}
