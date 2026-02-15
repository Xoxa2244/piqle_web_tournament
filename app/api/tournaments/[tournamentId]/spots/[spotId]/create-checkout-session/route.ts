import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { calculateOrganizerNetCents, fromCents } from '@/lib/payment'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const CURRENCY = 'usd'
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

type PaymentTiming = 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE'

const parseSpotId = (spotId: string) => {
  const [teamId, slotIndexRaw] = spotId.split(':')
  const slotIndex = Number(slotIndexRaw)
  if (!teamId || !Number.isInteger(slotIndex)) return null
  return { teamId, slotIndex }
}

const getPaymentDueAt = (tournament: {
  paymentTiming?: PaymentTiming | null
  registrationEndDate?: Date | null
  startDate: Date
}) => {
  if (tournament.paymentTiming === 'PAY_BY_DEADLINE') {
    return tournament.registrationEndDate ?? tournament.startDate
  }
  return new Date(Date.now() + FIFTEEN_MINUTES_MS)
}

export async function POST(
  _request: Request,
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
      },
    })

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const entryFeeCents = tournament.entryFeeCents ?? 0
    if (entryFeeCents <= 0) {
      return NextResponse.json({ error: 'Entry fee is not set' }, { status: 400 })
    }

    const destinationAccountId = tournament.user?.organizerStripeAccountId

    const player = await prisma.player.findUnique({
      where: {
        userId_tournamentId: {
          userId: session.user.id,
          tournamentId: tournament.id,
        },
      },
      include: {
        teamPlayers: {
          include: {
            team: {
              include: {
                division: true,
              },
            },
          },
        },
      },
    })

    if (!player) {
      return NextResponse.json({ error: 'Join a slot before paying' }, { status: 400 })
    }

    const matchingTeamPlayer = player.teamPlayers.find(
      (item) =>
        item.team.division.tournamentId === tournament.id &&
        item.teamId === spot.teamId &&
        item.slotIndex === spot.slotIndex
    )

    if (!matchingTeamPlayer) {
      return NextResponse.json({ error: 'Join this slot before paying' }, { status: 409 })
    }

    if (player.isPaid) {
      return NextResponse.json({ error: 'Entry fee already paid' }, { status: 409 })
    }

    const now = new Date()
    const paymentDueAt = getPaymentDueAt({
      paymentTiming: (tournament.paymentTiming ?? 'PAY_IN_15_MIN') as PaymentTiming,
      registrationEndDate: tournament.registrationEndDate,
      startDate: tournament.startDate,
    })

    let payment = await prisma.payment.findFirst({
      where: {
        tournamentId: tournament.id,
        playerId: player.id,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    })

    const effectiveDueAt = payment?.dueAt ?? paymentDueAt
    if (effectiveDueAt < now) {
      await prisma.$transaction(async (tx) => {
        if (payment?.id) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'CANCELED' },
          })
        }
        await tx.teamPlayer.delete({
          where: { id: matchingTeamPlayer.id },
        })
      })
      return NextResponse.json(
        { error: 'Payment window expired. Please join again.' },
        { status: 409 }
      )
    }

    const { platformFeeCents, stripeFeeCents } = calculateOrganizerNetCents(entryFeeCents)

    if (!payment) {
      payment = await prisma.payment.create({
        data: {
          tournamentId: tournament.id,
          playerId: player.id,
          teamId: matchingTeamPlayer.teamId,
          slotIndex: matchingTeamPlayer.slotIndex,
          entryFeeAmount: fromCents(entryFeeCents),
          platformFeeAmount: fromCents(platformFeeCents),
          stripeFeeAmount: fromCents(stripeFeeCents),
          totalAmount: fromCents(entryFeeCents),
          currency: CURRENCY,
          status: 'PENDING',
          dueAt: effectiveDueAt,
        },
      })
    } else {
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          teamId: matchingTeamPlayer.teamId,
          slotIndex: matchingTeamPlayer.slotIndex,
          entryFeeAmount: fromCents(entryFeeCents),
          platformFeeAmount: fromCents(platformFeeCents),
          stripeFeeAmount: fromCents(stripeFeeCents),
          totalAmount: fromCents(entryFeeCents),
          currency: CURRENCY,
          status: 'PENDING',
          dueAt: effectiveDueAt,
        },
      })
    }

    const stripe = getStripe()
    const sessionParams = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: session.user.email ?? undefined,
      client_reference_id: payment.id,
      metadata: {
        paymentId: payment.id,
        tournamentId: tournament.id,
        playerId: player.id,
        teamId: matchingTeamPlayer.teamId,
        slotIndex: String(matchingTeamPlayer.slotIndex),
      },
      payment_intent_data: {
        ...(destinationAccountId
          ? {
              application_fee_amount: platformFeeCents,
              transfer_data: {
                destination: destinationAccountId,
              },
            }
          : {}),
        metadata: {
          paymentId: payment.id,
          tournamentId: tournament.id,
          playerId: player.id,
          teamId: matchingTeamPlayer.teamId,
          slotIndex: String(matchingTeamPlayer.slotIndex),
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
