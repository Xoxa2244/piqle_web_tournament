import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { calculateOrganizerNetCents, fromCents } from '@/lib/payment'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const CURRENCY = 'usd'

const parseSpotId = (spotId: string) => {
  const [teamId, slotIndexRaw] = spotId.split(':')
  const slotIndex = Number(slotIndexRaw)
  if (!teamId || !Number.isInteger(slotIndex)) return null
  return { teamId, slotIndex }
}

const parseName = (name?: string | null) => {
  if (!name) return { firstName: 'Player', lastName: '' }
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tournamentId: string; spotId: string }> }
) {
  try {
  const resolvedParams = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const spot = parseSpotId(resolvedParams.spotId)
  if (!spot) {
    return NextResponse.json({ error: 'Invalid spot id' }, { status: 400 })
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: resolvedParams.tournamentId },
    include: {
      user: {
        select: {
          organizerStripeAccountId: true,
          stripeOnboardingComplete: true,
        },
      },
      divisions: {
        include: {
          teams: true,
        },
      },
    },
  })

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }

  const entryFeeCents = tournament.entryFeeCents ?? 0
  if (entryFeeCents <= 0) {
    return NextResponse.json({ error: 'Entry fee is not set' }, { status: 400 })
  }

  const payoutsActive =
    Boolean(tournament.user?.organizerStripeAccountId) &&
    Boolean(tournament.user?.stripeOnboardingComplete)

  const destinationAccountId = tournament.user?.organizerStripeAccountId

  const team = tournament.divisions
    .flatMap((division) => division.teams)
    .find((item) => item.id === spot.teamId)

  if (!team) {
    return NextResponse.json({ error: 'Spot not found' }, { status: 404 })
  }

  const existingSlot = await prisma.teamPlayer.findFirst({
    where: {
      teamId: spot.teamId,
      slotIndex: spot.slotIndex,
    },
  })

  if (existingSlot) {
    return NextResponse.json({ error: 'Spot already taken' }, { status: 409 })
  }

  const player = await prisma.player.findUnique({
    where: {
      userId_tournamentId: {
        userId: session.user.id,
        tournamentId: tournament.id,
      },
    },
  })

  const ensuredPlayer =
    player ??
    (await prisma.player.create({
      data: {
        tournamentId: tournament.id,
        userId: session.user.id,
        email: session.user.email ?? null,
        ...parseName(session.user.name ?? null),
      },
    }))

  const { platformFeeCents, stripeFeeCents, organizerAmountCents } =
    calculateOrganizerNetCents(entryFeeCents)

  const payment = await prisma.payment.create({
    data: {
      tournamentId: tournament.id,
      playerId: ensuredPlayer.id,
      teamId: spot.teamId,
      slotIndex: spot.slotIndex,
      entryFeeAmount: fromCents(entryFeeCents),
      platformFeeAmount: fromCents(platformFeeCents),
      stripeFeeAmount: fromCents(stripeFeeCents),
      totalAmount: fromCents(entryFeeCents),
      currency: CURRENCY,
      status: 'PENDING',
    },
  })

  const stripe = getStripe()
  const sessionParams = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: session.user.email ?? undefined,
    client_reference_id: payment.id,
    metadata: {
      paymentId: payment.id,
      tournamentId: tournament.id,
      playerId: ensuredPlayer.id,
      teamId: spot.teamId,
      slotIndex: String(spot.slotIndex),
    },
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
      ...(destinationAccountId
        ? {
            transfer_data: {
              destination: destinationAccountId,
              amount: organizerAmountCents,
            },
          }
        : {}),
      metadata: {
        paymentId: payment.id,
        tournamentId: tournament.id,
        playerId: ensuredPlayer.id,
        teamId: spot.teamId,
        slotIndex: String(spot.slotIndex),
      },
    },
    line_items: [
      {
        price_data: {
          currency: CURRENCY,
          product_data: {
            name: `${tournament.title} Entry Fee`,
          },
          unit_amount: entryFeeCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${APP_URL}/tournaments/${tournament.id}/register?payment=success`,
    cancel_url: `${APP_URL}/tournaments/${tournament.id}/register?payment=cancel`,
  })

  await prisma.payment.update({
    where: { id: payment.id },
    data: { stripeCheckoutSessionId: sessionParams.id },
  })

  if (!sessionParams.url) {
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }

  return NextResponse.json({ url: sessionParams.url })
  } catch (error: any) {
    console.error('Create checkout session error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
