import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { calculateOrganizerNetCents, fromCents } from '@/lib/payment'
import { ENABLE_DEFERRED_PAYMENTS } from '@/lib/features'
import { getRequestBaseUrl } from '@/lib/requestBaseUrl'

const CURRENCY = 'usd'
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const isSavedCardSchemaError = (error: any) => {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    message.includes('stripe_customer_id') ||
    message.includes('stripe_default_payment_method_id') ||
    message.includes('stripe_default_card_brand') ||
    message.includes('stripe_default_card_last4')
  )
}

type PaymentTiming = 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE'

const getEffectivePaymentTiming = (paymentTiming?: PaymentTiming | null): PaymentTiming => {
  if (!ENABLE_DEFERRED_PAYMENTS) return 'PAY_IN_15_MIN'
  return paymentTiming === 'PAY_BY_DEADLINE' ? 'PAY_BY_DEADLINE' : 'PAY_IN_15_MIN'
}

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
  const effectivePaymentTiming = getEffectivePaymentTiming(tournament.paymentTiming)
  if (effectivePaymentTiming === 'PAY_BY_DEADLINE') {
    return tournament.registrationEndDate ?? tournament.startDate
  }
  return new Date(Date.now() + FIFTEEN_MINUTES_MS)
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
      paymentTiming: getEffectivePaymentTiming(
        (tournament.paymentTiming ?? 'PAY_IN_15_MIN') as PaymentTiming
      ),
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

    let stripeCustomerId: string | null = null
    try {
      const stripeUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          stripeCustomerId: true,
        },
      })

      const stripe = getStripe()
      stripeCustomerId = stripeUser?.stripeCustomerId ?? null
      if (!stripeCustomerId && stripeUser) {
        const customer = await stripe.customers.create({
          email: stripeUser.email ?? undefined,
          name: stripeUser.name ?? undefined,
          metadata: {
            userId: stripeUser.id,
          },
        })
        stripeCustomerId = customer.id

        await prisma.user.update({
          where: { id: stripeUser.id },
          data: {
            stripeCustomerId,
          },
        })
      }
    } catch (error: any) {
      if (!isSavedCardSchemaError(error)) {
        throw error
      }
      stripeCustomerId = null
    }

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
    const baseUrl = getRequestBaseUrl(request, {
      scope: 'tournament-spots-checkout',
    })
    const sessionParams = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer: stripeCustomerId ?? undefined,
      customer_email: stripeCustomerId ? undefined : session.user.email ?? undefined,
      client_reference_id: payment.id,
      metadata: {
        paymentId: payment.id,
        tournamentId: tournament.id,
        playerId: player.id,
        teamId: matchingTeamPlayer.teamId,
        slotIndex: String(matchingTeamPlayer.slotIndex),
        userId: session.user.id,
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
          userId: session.user.id,
        },
        ...(stripeCustomerId ? { setup_future_usage: 'off_session' as const } : {}),
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
      success_url: `${baseUrl}/tournaments/${tournament.id}/register?payment=success`,
      cancel_url: `${baseUrl}/tournaments/${tournament.id}/register?payment=cancel`,
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
