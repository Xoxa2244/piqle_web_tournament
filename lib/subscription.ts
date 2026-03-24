import { prisma } from './prisma'

type PlanLimits = {
  maxMembers: number
  features: string[]
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxMembers: 200,
    features: ['dashboard'],
  },
  trialing: {
    maxMembers: 200,
    features: ['dashboard', 'analytics', 'revenue'],
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
