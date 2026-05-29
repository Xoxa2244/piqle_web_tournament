import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { calculateOrganizerNetCents, fromCents } from '@/lib/payment'
import { ENABLE_DEFERRED_PAYMENTS } from '@/lib/features'
import { hasInviteRegistrationDetails } from '@/lib/inviteRegistrationGate'
import { getActiveStripeDestinationAccountId } from '@/lib/stripeConnect'

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

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

type PaymentTiming = 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE'

const getEffectivePaymentTiming = (paymentTiming?: PaymentTiming | null): PaymentTiming => {
  if (!ENABLE_DEFERRED_PAYMENTS) return 'PAY_IN_15_MIN'
  return paymentTiming === 'PAY_BY_DEADLINE' ? 'PAY_BY_DEADLINE' : 'PAY_IN_15_MIN'
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

const getEntryFeeCents = (tournament: {
  entryFeeCents?: number | null
  entryFee?: unknown
}) => {
  if (typeof tournament.entryFeeCents === 'number') return tournament.entryFeeCents
  const fee = Number(tournament.entryFee ?? 0)
  return Number.isFinite(fee) ? Math.round(fee * 100) : 0
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const resolvedParams = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const entryFeeCents = getEntryFeeCents(tournament)
    if (entryFeeCents <= 0) {
      return NextResponse.json({ error: 'Entry fee is not set' }, { status: 400 })
    }

    const player = await prisma.player.findUnique({
      where: {
        userId_tournamentId: {
          userId: session.user.id,
          tournamentId: tournament.id,
        },
      },
    })

    if (!player) {
      return NextResponse.json({ error: 'Register before paying' }, { status: 400 })
    }

    if (!hasInviteRegistrationDetails(player.registrationComment)) {
      return NextResponse.json(
        { error: 'Complete the invite registration form before paying' },
        { status: 400 }
      )
    }

    if (player.isPaid) {
      return NextResponse.json({ error: 'Entry fee already paid' }, { status: 409 })
    }

    const { platformFeeCents, stripeFeeCents } = calculateOrganizerNetCents(entryFeeCents)
    const paymentDueAt = getPaymentDueAt({
      paymentTiming: getEffectivePaymentTiming((tournament.paymentTiming ?? 'PAY_IN_15_MIN') as PaymentTiming),
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

    if (payment?.dueAt && payment.dueAt < new Date()) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'CANCELED' },
      })
      payment = null
    }

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

    const paymentData = {
      teamId: null,
      slotIndex: null,
      entryFeeAmount: fromCents(entryFeeCents),
      platformFeeAmount: fromCents(platformFeeCents),
      stripeFeeAmount: fromCents(stripeFeeCents),
      totalAmount: fromCents(entryFeeCents),
      currency: tournament.currency ?? 'usd',
      status: 'PENDING' as const,
      dueAt: payment?.dueAt ?? paymentDueAt,
    }

    if (!payment) {
      payment = await prisma.payment.create({
        data: {
          tournamentId: tournament.id,
          playerId: player.id,
          ...paymentData,
        },
      })
    } else {
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: paymentData,
      })
    }

    const stripe = getStripe()
    const appBaseUrl = resolveAppBaseUrl(request)
    const destinationAccountId = await getActiveStripeDestinationAccountId(
      stripe,
      tournament.user?.organizerStripeAccountId
    )
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer: stripeCustomerId ?? undefined,
      customer_email: stripeCustomerId ? undefined : session.user.email ?? undefined,
      client_reference_id: payment.id,
      metadata: {
        paymentId: payment.id,
        tournamentId: tournament.id,
        playerId: player.id,
        userId: session.user.id,
        registrationType: 'invite',
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
          userId: session.user.id,
          registrationType: 'invite',
        },
        ...(stripeCustomerId ? { setup_future_usage: 'off_session' as const } : {}),
      },
      line_items: [
        {
          price_data: {
            currency: (tournament.currency ?? 'usd').toLowerCase(),
            product_data: {
              name: `${tournament.title} Entry Fee`,
            },
            unit_amount: entryFeeCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${appBaseUrl}/tournaments/${tournament.id}/invite?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/tournaments/${tournament.id}/invite?payment=cancel`,
    })

    await prisma.payment.update({
      where: { id: payment.id },
      data: { stripeCheckoutSessionId: checkoutSession.id },
    })

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
    }

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error('Create invite checkout session error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
