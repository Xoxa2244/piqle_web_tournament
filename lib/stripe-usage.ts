/**
 * Stripe Metered Billing — Usage Reporting
 *
 * Reports usage (email sends, SMS sends, AI credits) to Stripe
 * for metered billing. Stripe aggregates usage per billing period
 * and charges automatically.
 *
 * Setup: Create metered prices in Stripe, add price IDs to env vars.
 * When a subscription is created, metered prices are added as subscription items.
 * This module reports usage against those subscription items.
 *
 * Env vars:
 *   STRIPE_METERED_EMAIL_PRICE_ID  — per-email overage price
 *   STRIPE_METERED_SMS_PRICE_ID    — per-SMS price
 *   STRIPE_METERED_AI_PRICE_ID     — per-AI-credit price
 */

import { prisma } from './prisma'

type UsageResource = 'email' | 'sms' | 'ai'

const METERED_PRICE_IDS: Record<UsageResource, string | undefined> = {
  email: process.env.STRIPE_METERED_EMAIL_PRICE_ID,
  sms: process.env.STRIPE_METERED_SMS_PRICE_ID,
  ai: process.env.STRIPE_METERED_AI_PRICE_ID,
}

/**
 * Report usage to Stripe for metered billing.
 * Call this AFTER successfully sending an email/SMS or using AI.
 * Non-blocking — failures are logged but don't break the flow.
 */
export async function reportUsage(
  clubId: string,
  resource: UsageResource,
  quantity: number = 1,
): Promise<void> {
  try {
    const meteredPriceId = METERED_PRICE_IDS[resource]
    if (!meteredPriceId) return // Metered billing not configured for this resource

    // Get subscription for this club
    const sub = await prisma.subscription.findUnique({
      where: { clubId },
      select: { stripeSubscriptionId: true, plan: true },
    })

    if (!sub?.stripeSubscriptionId) return // No active subscription

    // Check if usage is within plan limits (don't charge for included usage)
    const included = getIncludedUsage(sub.plan, resource)
    const currentUsage = await getCurrentPeriodUsage(clubId, resource)

    // Only report overage to Stripe (usage beyond plan included amount)
    const overageQuantity = Math.max(0, (currentUsage + quantity) - included) - Math.max(0, currentUsage - included)
    if (overageQuantity <= 0) return // Still within plan limits

    const { getStripe } = await import('./stripe')
    const stripe = getStripe()

    // Find the subscription item for this metered price
    const subscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
      expand: ['items.data'],
    })

    const meteredItem = subscription.items.data.find(
      (item) => item.price.id === meteredPriceId
    )

    if (!meteredItem) {
      // Metered item not on subscription — add it
      const newItem = await stripe.subscriptionItems.create({
        subscription: sub.stripeSubscriptionId,
        price: meteredPriceId,
      })
      // Report usage on newly created item
      await (stripe.subscriptionItems as any).createUsageRecord(newItem.id, {
        quantity: overageQuantity,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'increment',
      })
      return
    }

    // Report usage
    await (stripe.subscriptionItems as any).createUsageRecord(meteredItem.id, {
      quantity: overageQuantity,
      timestamp: Math.floor(Date.now() / 1000),
      action: 'increment',
    })
  } catch (err) {
    // Non-critical — don't break sending flow
    console.warn(`[Stripe Usage] Failed to report ${resource} usage for club ${clubId}:`, (err as Error).message?.slice(0, 100))
  }
}

/** Get included usage per plan (anything above this = overage billed via Stripe) */
function getIncludedUsage(plan: string, resource: UsageResource): number {
  const included: Record<string, Record<UsageResource, number>> = {
    free:       { email: 500,    sms: 0,    ai: 50 },
    trialing:   { email: 2000,   sms: 100,  ai: 500 },
    starter:    { email: 2000,   sms: 100,  ai: 200 },
    pro:        { email: 10000,  sms: 500,  ai: 1000 },
    enterprise: { email: Infinity, sms: 2000, ai: Infinity },
  }
  return included[plan]?.[resource] ?? 0
}

/** Get current period usage from our DB (same logic as checkUsageLimit) */
async function getCurrentPeriodUsage(clubId: string, resource: UsageResource): Promise<number> {
  const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  if (resource === 'email') {
    return prisma.aIRecommendationLog.count({
      where: { clubId, channel: { in: ['email', 'both'] }, createdAt: { gte: periodStart } },
    })
  }
  if (resource === 'sms') {
    return prisma.aIRecommendationLog.count({
      where: { clubId, channel: { in: ['sms', 'both'] }, createdAt: { gte: periodStart } },
    })
  }
  if (resource === 'ai') {
    return prisma.aIConversation.count({
      where: { clubId, createdAt: { gte: periodStart } },
    }).catch(() => 0)
  }
  return 0
}

/**
 * Get usage summary for a club — for displaying in UI.
 */
export async function getUsageSummary(clubId: string): Promise<{
  plan: string
  email: { used: number; included: number; overage: number }
  sms: { used: number; included: number; overage: number }
  ai: { used: number; included: number; overage: number }
}> {
  const sub = await prisma.subscription.findUnique({
    where: { clubId },
    select: { plan: true },
  })
  const plan = sub?.plan ?? 'free'

  const [emailUsed, smsUsed, aiUsed] = await Promise.all([
    getCurrentPeriodUsage(clubId, 'email'),
    getCurrentPeriodUsage(clubId, 'sms'),
    getCurrentPeriodUsage(clubId, 'ai'),
  ])

  const emailIncluded = getIncludedUsage(plan, 'email')
  const smsIncluded = getIncludedUsage(plan, 'sms')
  const aiIncluded = getIncludedUsage(plan, 'ai')

  return {
    plan,
    email: { used: emailUsed, included: emailIncluded, overage: Math.max(0, emailUsed - emailIncluded) },
    sms: { used: smsUsed, included: smsIncluded, overage: Math.max(0, smsUsed - smsIncluded) },
    ai: { used: aiUsed, included: aiIncluded, overage: Math.max(0, aiUsed - aiIncluded) },
  }
}
