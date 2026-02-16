import { getStripe } from '@/lib/stripe'

const toCents = (value: unknown) => Math.round(Number(value ?? 0) * 100)

const isSchemaErrorWithFragments = (error: any, fragments: string[]) => {
  const message = String(error?.message ?? '').toLowerCase()
  return fragments.some((fragment) => message.includes(fragment))
}

export const isDuePaymentsSchemaError = (error: any) =>
  isSchemaErrorWithFragments(error, [
    'due_at',
    'payment_timing',
    'paymenttiming',
    'stripe_customer_id',
    'stripe_default_payment_method_id',
    'stripe_default_card_brand',
    'stripe_default_card_last4',
  ])

export type DuePaymentSummary = {
  considered: number
  charged: number
  failed: number
  skippedNoUser: number
  skippedNoCard: number
  expiredCanceled: number
  expiredReleasedPlayers: number
}

const emptySummary = (): DuePaymentSummary => ({
  considered: 0,
  charged: 0,
  failed: 0,
  skippedNoUser: 0,
  skippedNoCard: 0,
  expiredCanceled: 0,
  expiredReleasedPlayers: 0,
})

export const processDueAutoPaymentsForTournament = async (
  prisma: any,
  tournamentId: string,
  now = new Date()
) => {
  const summary = emptySummary()
  let stripe: ReturnType<typeof getStripe> | null = null
  try {
    stripe = getStripe()
  } catch {
    return summary
  }

  const duePayments = await prisma.payment.findMany({
    where: {
      tournamentId,
      status: 'PENDING',
      dueAt: { not: null, lte: now },
      tournament: {
        paymentTiming: 'PAY_BY_DEADLINE',
        entryFeeCents: { gt: 0 },
      },
    },
    include: {
      tournament: {
        select: {
          id: true,
          title: true,
          currency: true,
          user: {
            select: {
              organizerStripeAccountId: true,
              stripeOnboardingComplete: true,
            },
          },
        },
      },
      player: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 200,
  })

  for (const payment of duePayments) {
    summary.considered += 1
    if (!payment.player.userId) {
      summary.skippedNoUser += 1
      continue
    }

    const user = await prisma.user.findUnique({
      where: { id: payment.player.userId },
      select: {
        stripeCustomerId: true,
        stripeDefaultPaymentMethodId: true,
      },
    })

    if (!user?.stripeCustomerId || !user.stripeDefaultPaymentMethodId) {
      summary.skippedNoCard += 1
      continue
    }

    const amountCents = toCents(payment.totalAmount)
    if (amountCents <= 0) {
      const paidResult = await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'PAID' },
      })
      if (paidResult.count > 0) {
        await prisma.player.update({
          where: { id: payment.playerId },
          data: { isPaid: true },
        })
        summary.charged += 1
      }
      continue
    }

    const organizerAccountId =
      payment.tournament.user?.organizerStripeAccountId &&
      payment.tournament.user?.stripeOnboardingComplete
        ? payment.tournament.user.organizerStripeAccountId
        : null
    const platformFeeCents = Math.max(
      0,
      Math.min(amountCents, toCents(payment.platformFeeAmount))
    )

    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: (payment.currency || payment.tournament.currency || 'usd').toLowerCase(),
          customer: user.stripeCustomerId,
          payment_method: user.stripeDefaultPaymentMethodId,
          off_session: true,
          confirm: true,
          description: `${payment.tournament.title} entry fee`,
          metadata: {
            paymentId: payment.id,
            tournamentId: payment.tournamentId,
            playerId: payment.playerId,
            autoCharge: 'deadline',
          },
          ...(organizerAccountId
            ? {
                application_fee_amount: platformFeeCents,
                transfer_data: {
                  destination: organizerAccountId,
                },
              }
            : {}),
        },
        {
          idempotencyKey: `piqle_deadline_charge_${payment.id}`,
        }
      )

      if (paymentIntent.status === 'succeeded') {
        await prisma.$transaction(async (tx: any) => {
          const updated = await tx.payment.updateMany({
            where: { id: payment.id, status: 'PENDING' },
            data: {
              status: 'PAID',
              stripePaymentIntentId: paymentIntent.id,
            },
          })
          if (updated.count === 0) return

          await tx.player.update({
            where: { id: payment.playerId },
            data: { isPaid: true },
          })

          await tx.payment.updateMany({
            where: {
              id: { not: payment.id },
              tournamentId: payment.tournamentId,
              playerId: payment.playerId,
              status: 'PENDING',
            },
            data: {
              status: 'CANCELED',
            },
          })
        })
        summary.charged += 1
      } else {
        const failed = await prisma.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: {
            status: 'FAILED',
            stripePaymentIntentId: paymentIntent.id,
          },
        })
        if (failed.count > 0) {
          summary.failed += 1
        }
      }
    } catch (error: any) {
      const paymentIntentId =
        typeof error?.payment_intent === 'string'
          ? error.payment_intent
          : typeof error?.raw?.payment_intent === 'string'
          ? error.raw.payment_intent
          : error?.raw?.payment_intent?.id ?? null

      const failedData: any = { status: 'FAILED' }
      if (paymentIntentId) {
        failedData.stripePaymentIntentId = paymentIntentId
      }
      const failed = await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: failedData,
      })
      if (failed.count > 0) {
        summary.failed += 1
      }
    }
  }

  return summary
}

export const releaseExpiredUnpaidRegistrations = async (
  prisma: any,
  tournamentId: string,
  now = new Date()
) => {
  const summary = emptySummary()
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      entryFeeCents: true,
    },
  })

  if (!tournament) return summary
  if ((tournament.entryFeeCents ?? 0) <= 0) return summary

  const chargedSummary = await processDueAutoPaymentsForTournament(prisma, tournamentId, now)
  Object.assign(summary, chargedSummary)

  const expiredPayments = await prisma.payment.findMany({
    where: {
      tournamentId,
      status: { in: ['PENDING', 'FAILED'] },
      dueAt: { not: null, lt: now },
    },
    select: {
      id: true,
      playerId: true,
      status: true,
    },
  })

  if (!expiredPayments.length) return summary

  const expiredPlayerIds = Array.from(new Set(expiredPayments.map((payment: any) => payment.playerId)))
  const paidPlayerRows = await prisma.payment.findMany({
    where: {
      tournamentId,
      playerId: { in: expiredPlayerIds },
      status: 'PAID',
    },
    select: { playerId: true },
    distinct: ['playerId'],
  })
  const paidPlayerIds = new Set(paidPlayerRows.map((row: any) => row.playerId))
  const removablePlayerIds = expiredPlayerIds.filter((playerId) => !paidPlayerIds.has(playerId))

  if (removablePlayerIds.length > 0) {
    const deleted = await prisma.teamPlayer.deleteMany({
      where: {
        playerId: { in: removablePlayerIds },
        team: {
          division: {
            tournamentId,
          },
        },
      },
    })
    summary.expiredReleasedPlayers = deleted.count

    await prisma.player.updateMany({
      where: { id: { in: removablePlayerIds } },
      data: { isPaid: false },
    })
  }

  const pendingIds = expiredPayments
    .filter((payment: any) => payment.status === 'PENDING')
    .map((payment: any) => payment.id)
  if (pendingIds.length > 0) {
    const canceled = await prisma.payment.updateMany({
      where: {
        id: { in: pendingIds },
        status: 'PENDING',
      },
      data: {
        status: 'CANCELED',
      },
    })
    summary.expiredCanceled = canceled.count
  }

  return summary
}
