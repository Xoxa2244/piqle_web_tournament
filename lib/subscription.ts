import { prisma } from './prisma'

type PlanLimits = {
  maxMembers: number
  features: string[]
  // Monthly usage limits
  campaignsPerMonth: number       // manual campaign sends
  emailsPerMonth: number          // total emails
  smsPerMonth: number             // total SMS
  aiAdvisorChatsPerDay: number    // AI Advisor conversations
  abTesting: boolean              // champion/challenger A/B
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxMembers: 200,
    features: ['dashboard', 'analytics', 'revenue', 'slot-filler', 'reactivation', 'ai-advisor', 'csv-import'],
    campaignsPerMonth: 5,
    emailsPerMonth: 500,
    smsPerMonth: 0,
    aiAdvisorChatsPerDay: 10,
    abTesting: false,
  },
  trialing: {
    maxMembers: Infinity,
    features: ['dashboard', 'analytics', 'revenue', 'slot-filler', 'reactivation', 'ai-advisor', 'csv-import'],
    campaignsPerMonth: 15,
    emailsPerMonth: 2000,
    smsPerMonth: 100,
    aiAdvisorChatsPerDay: 50,
    abTesting: true,
  },
  starter: {
    maxMembers: 200,
    features: ['dashboard', 'analytics', 'revenue', 'slot-filler', 'reactivation', 'campaigns'],
    campaignsPerMonth: 15,
    emailsPerMonth: 2000,
    smsPerMonth: 100,
    aiAdvisorChatsPerDay: 20,
    abTesting: false,
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
      'campaigns',
    ],
    campaignsPerMonth: Infinity,
    emailsPerMonth: 10000,
    smsPerMonth: 500,
    aiAdvisorChatsPerDay: 50,
    abTesting: true,
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
      'campaigns',
      'custom-branding',
      'api-access',
    ],
    campaignsPerMonth: Infinity,
    emailsPerMonth: Infinity,
    smsPerMonth: 2000,
    aiAdvisorChatsPerDay: Infinity,
    abTesting: true,
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

// ── Usage Tracking ──

type UsageType = 'campaigns' | 'emails' | 'sms' | 'ai_advisor'

/**
 * Check if a club has remaining usage for a specific resource this month.
 * Returns { allowed, used, limit, remaining } or throws TRPCError if exceeded.
 */
export async function checkUsageLimit(
  clubId: string,
  usageType: UsageType,
  countToSend: number = 1,
): Promise<{ allowed: boolean; used: number; limit: number; remaining: number; plan: string }> {
  const sub = await prisma.subscription.findUnique({
    where: { clubId },
    select: { plan: true, status: true },
  })

  const plan = sub?.plan ?? 'free'
  const limits = getPlanLimits(plan)

  // Determine the limit for this usage type
  let limit: number
  switch (usageType) {
    case 'campaigns': limit = limits.campaignsPerMonth; break
    case 'emails': limit = limits.emailsPerMonth; break
    case 'sms': limit = limits.smsPerMonth; break
    case 'ai_advisor': limit = limits.aiAdvisorChatsPerDay; break
    default: limit = 0
  }

  if (limit === Infinity) {
    return { allowed: true, used: 0, limit, remaining: Infinity, plan }
  }

  // Count usage this period
  const periodStart = usageType === 'ai_advisor'
    ? new Date(new Date().setHours(0, 0, 0, 0)) // today
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1) // first of month

  let used = 0

  if (usageType === 'campaigns') {
    // Count distinct campaigns (grouped sends) this month
    used = await prisma.aIRecommendationLog.groupBy({
      by: ['type', 'createdAt'],
      where: {
        clubId,
        createdAt: { gte: periodStart },
        OR: [{ sequenceStep: 0 }, { sequenceStep: null }],
      },
    }).then(groups => {
      // Group by date (day granularity) + type = 1 campaign
      const seen = new Set<string>()
      for (const g of groups) {
        const day = new Date(g.createdAt).toISOString().slice(0, 10)
        seen.add(`${g.type}-${day}`)
      }
      return seen.size
    })
  } else if (usageType === 'emails') {
    used = await prisma.aIRecommendationLog.count({
      where: {
        clubId,
        channel: { in: ['email', 'both'] },
        createdAt: { gte: periodStart },
      },
    })
  } else if (usageType === 'sms') {
    used = await prisma.aIRecommendationLog.count({
      where: {
        clubId,
        channel: { in: ['sms', 'both'] },
        createdAt: { gte: periodStart },
      },
    })
  } else if (usageType === 'ai_advisor') {
    used = await prisma.aIConversation.count({
      where: {
        clubId,
        createdAt: { gte: periodStart },
      },
    }).catch(() => 0) // table may not exist
  }

  const remaining = Math.max(0, limit - used)
  const allowed = used + countToSend <= limit

  return { allowed, used, limit, remaining, plan }
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
