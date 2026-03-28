import { prisma } from './prisma'

type PlanLimits = {
  maxMembers: number
  features: string[]
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxMembers: 200,
    features: ['dashboard', 'analytics', 'revenue', 'slot-filler', 'reactivation', 'ai-advisor', 'csv-import'],
  },
  trialing: {
    maxMembers: Infinity,
    features: ['dashboard', 'analytics', 'revenue', 'slot-filler', 'reactivation', 'ai-advisor', 'csv-import'],
  },
  starter: {
    maxMembers: 200,
    features: ['dashboard', 'analytics', 'revenue'],
  },
  pro: {
    maxMembers: Infinity,
    features: [
      'dashboard',
      'analytics',
      'revenue',
      'slot-filler',
      'reactivation',
      'ai-advisor',
      'csv-import',
    ],
  },
  enterprise: {
    maxMembers: Infinity,
    features: [
      'dashboard',
      'analytics',
      'revenue',
      'slot-filler',
      'reactivation',
      'ai-advisor',
      'csv-import',
      'custom-branding',
      'api-access',
    ],
  },
}

/** Map a Stripe Price ID to a plan name */
export function priceIdToPlan(priceId: string): string {
  const starterMonthly = process.env.STRIPE_STARTER_MONTHLY_PRICE_ID
  const starterAnnual = process.env.STRIPE_STARTER_ANNUAL_PRICE_ID
  const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID
  const proAnnual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID

  if (priceId === starterMonthly || priceId === starterAnnual) return 'starter'
  if (priceId === proMonthly || priceId === proAnnual) return 'pro'

  return 'free'
}

export async function getSubscription(clubId: string) {
  return prisma.subscription.findUnique({
    where: { clubId },
  })
}

export async function hasActiveSubscription(clubId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { clubId },
    select: { status: true },
  })
  if (!sub) return false
  return sub.status === 'active' || sub.status === 'trialing'
}

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
}

/**
 * Check if a club has access to a specific feature based on their subscription.
 * Returns access info; throws TRPCError if access is denied.
 */
export async function checkFeatureAccess(
  clubId: string,
  feature: string
): Promise<{ allowed: true; plan: string; status: string }> {
  const sub = await prisma.subscription.findUnique({
    where: { clubId },
    select: { plan: true, status: true },
  })

  const currentPlan = sub?.plan ?? 'free'
  const currentStatus = sub?.status ?? 'free'

  // Check subscription is active
  const isActive = currentStatus === 'active' || currentStatus === 'trialing' || currentPlan === 'free'
  if (!isActive) {
    const { TRPCError } = await import('@trpc/server')
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: JSON.stringify({
        type: 'SUBSCRIPTION_REQUIRED',
        feature,
        requiredPlan: findMinPlanForFeature(feature),
        currentPlan,
        currentStatus,
        message: `Your subscription is ${currentStatus}. Please update your billing to continue using this feature.`,
      }),
    })
  }

  // Check feature is included in plan
  const limits = getPlanLimits(currentPlan)
  if (!limits.features.includes(feature)) {
    const requiredPlan = findMinPlanForFeature(feature)
    const { TRPCError } = await import('@trpc/server')
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: JSON.stringify({
        type: 'SUBSCRIPTION_REQUIRED',
        feature,
        requiredPlan,
        currentPlan,
        currentStatus,
        message: `${formatFeatureName(feature)} requires a ${requiredPlan} plan. Upgrade to unlock this feature.`,
      }),
    })
  }

  return { allowed: true, plan: currentPlan, status: currentStatus }
}

/** Find the minimum plan that includes a given feature */
function findMinPlanForFeature(feature: string): string {
  const planOrder = ['free', 'starter', 'pro', 'enterprise']
  for (const plan of planOrder) {
    if (PLAN_LIMITS[plan]?.features.includes(feature)) return plan
  }
  return 'enterprise'
}

/** Format feature slug to human-readable name */
function formatFeatureName(feature: string): string {
  return feature
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
