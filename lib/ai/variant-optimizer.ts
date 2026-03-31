/**
 * Variant Optimizer — Feedback Loop for Message Variant Selection
 *
 * Analyzes historical performance of message variants (open rate, click rate)
 * to auto-select the best-performing variant for future outreach.
 *
 * How it works:
 * 1. Campaign engine generates N message variants for an outreach type
 * 2. Each variant has an `id` (e.g. "checkin_pattern", "retention_value")
 * 3. When sending, we store `variantId` in AIRecommendationLog
 * 4. Mandrill webhooks update `openedAt` and `clickedAt`
 * 5. This module queries historical data and calculates performance scores
 * 6. The best variant is recommended for the next send
 *
 * Multi-Armed Bandit approach:
 * - Exploit: prefer the best-performing variant
 * - Explore: occasionally try underperforming variants (10% exploration rate)
 * - Cold start: when <10 sends per variant, fall back to default recommendation
 *
 * Variant IDs:
 *   CHECK_IN:         checkin_pattern, checkin_frequency, checkin_recency
 *   RETENTION_BOOST:  retention_value, retention_spot, retention_pattern, retention_community
 */

import type { OutreachMessageVariant } from './outreach-messages'

// ── Optimizable Variant (unified interface for outreach + sequence) ──

export interface OptimizableVariant {
  id: string
  recommended?: boolean
}

/** All types that can be optimized (outreach types + sequence message types) */
export type OptimizableType =
  | 'CHECK_IN'
  | 'RETENTION_BOOST'
  | 'resend_new_subject'
  | 'social_proof'
  | 'value_reminder'
  | 'urgency_resend'
  | 'sms_nudge'
  | 'final_offer'
  | 'final_email'
  | 'community'
  | 'winback_offer'

// ── Types ──

export interface VariantPerformance {
  variantId: string
  totalSent: number
  totalOpened: number
  totalClicked: number
  totalBounced: number
  totalConverted: number  // Booked a session after receiving campaign
  openRate: number      // 0-1
  clickRate: number     // 0-1
  bounceRate: number    // 0-1
  conversionRate: number // 0-1 — the metric that actually matters
  /** Composite score: conversion * 0.5 + click * 0.3 + open * 0.2 */
  engagementScore: number
  /** Whether this variant is the current champion */
  isChampion?: boolean
}

export interface OptimizationResult {
  /** Which variant to use */
  recommendedVariantId: string
  /** Why this variant was selected */
  reason: 'best_performer' | 'challenger' | 'exploration' | 'cold_start' | 'default'
  /** Performance data for all variants */
  performances: VariantPerformance[]
  /** Current champion variant (best performer) */
  championId?: string
}

// ── Configuration ──

/** Minimum sends per variant before we start optimizing */
const MIN_SAMPLES = 10
/** Champion gets this % of traffic, challengers split the rest */
const CHAMPION_RATE = 0.80
/** How many days of history to consider */
const LOOKBACK_DAYS = 30

// ── Main Function ──

/**
 * Select the best message variant based on historical engagement data.
 *
 * @param prisma - Prisma client
 * @param clubId - Club to optimize for
 * @param type - Outreach type (CHECK_IN or RETENTION_BOOST)
 * @param variants - Available message variants from generateOutreachMessages()
 * @returns Optimization result with recommended variant
 */
export async function selectBestVariant(
  prisma: any,
  clubId: string,
  type: OptimizableType,
  variants: (OutreachMessageVariant | OptimizableVariant)[],
): Promise<OptimizationResult> {
  if (variants.length === 0) {
    throw new Error('[VariantOptimizer] No variants provided')
  }

  // Default: use the variant already marked as recommended
  const defaultVariant = variants.find(v => v.recommended) || variants[0]

  // Query historical performance for this club + type
  const lookbackDate = new Date(Date.now() - LOOKBACK_DAYS * 86400000)

  const logs = await prisma.aIRecommendationLog.groupBy({
    by: ['variantId'],
    where: {
      clubId,
      type,
      variantId: { not: null },
      status: { in: ['sent', 'delivered', 'bounced'] },
      createdAt: { gte: lookbackDate },
    },
    _count: { id: true },
  })

  // If no historical data, use default recommendation
  if (logs.length === 0) {
    return {
      recommendedVariantId: defaultVariant.id,
      reason: 'default',
      performances: [],
    }
  }

  // Get detailed counts for each variant
  const variantIds = variants.map(v => v.id)
  const performances: VariantPerformance[] = []

  for (const variantId of variantIds) {
    const [counts] = await prisma.aIRecommendationLog.groupBy({
      by: ['variantId'],
      where: {
        clubId,
        type,
        variantId,
        createdAt: { gte: lookbackDate },
      },
      _count: { id: true },
    })

    if (!counts) {
      performances.push({
        variantId,
        totalSent: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalConverted: 0,
        openRate: 0,
        clickRate: 0,
        bounceRate: 0,
        conversionRate: 0,
        engagementScore: 0,
      })
      continue
    }

    const totalSent = counts._count.id

    // Count opens, clicks, bounces, conversions
    const [openCount, clickCount, bounceCount, convertedCount] = await Promise.all([
      prisma.aIRecommendationLog.count({
        where: { clubId, type, variantId, openedAt: { not: null }, createdAt: { gte: lookbackDate } },
      }),
      prisma.aIRecommendationLog.count({
        where: { clubId, type, variantId, clickedAt: { not: null }, createdAt: { gte: lookbackDate } },
      }),
      prisma.aIRecommendationLog.count({
        where: { clubId, type, variantId, bouncedAt: { not: null }, createdAt: { gte: lookbackDate } },
      }),
      prisma.aIRecommendationLog.count({
        where: { clubId, type, variantId, status: 'converted', createdAt: { gte: lookbackDate } },
      }),
    ])

    const openRate = totalSent > 0 ? openCount / totalSent : 0
    const clickRate = totalSent > 0 ? clickCount / totalSent : 0
    const bounceRate = totalSent > 0 ? bounceCount / totalSent : 0
    const conversionRate = totalSent > 0 ? convertedCount / totalSent : 0

    // Composite score: conversion is king (50%), then clicks (30%), then opens (20%)
    const engagementScore = conversionRate * 0.5 + clickRate * 0.3 + openRate * 0.2

    performances.push({
      variantId,
      totalSent,
      totalOpened: openCount,
      totalClicked: clickCount,
      totalBounced: bounceCount,
      totalConverted: convertedCount,
      openRate,
      clickRate,
      bounceRate,
      conversionRate,
      engagementScore,
    })
  }

  // Check if we have enough data for optimization
  const totalSamples = performances.reduce((sum, p) => sum + p.totalSent, 0)
  const variantsWithEnoughData = performances.filter(p => p.totalSent >= MIN_SAMPLES)

  if (variantsWithEnoughData.length < 2) {
    // Cold start: not enough data yet, use default
    return {
      recommendedVariantId: defaultVariant.id,
      reason: 'cold_start',
      performances,
    }
  }

  // Sort by engagement score (best first)
  const sorted = [...performances].sort((a, b) => b.engagementScore - a.engagementScore)
  const champion = sorted[0]
  champion.isChampion = true

  // Champion/Challenger distribution:
  // 80% of the time → send champion (proven best)
  // 20% of the time → send a challenger (to keep testing)
  // If challenger eventually beats champion over MIN_SAMPLES, it gets promoted
  const roll = Math.random()

  if (roll >= CHAMPION_RATE) {
    // Challenger slot — pick a non-champion variant
    // Prefer variants with fewer sends (underexplored) or newer ones
    const challengers = sorted
      .filter(p => p.variantId !== champion.variantId)
      .sort((a, b) => a.totalSent - b.totalSent) // prefer least-tested

    if (challengers.length > 0) {
      // Pick randomly from bottom half (least tested)
      const pool = challengers.slice(0, Math.max(1, Math.ceil(challengers.length / 2)))
      const picked = pool[Math.floor(Math.random() * pool.length)]
      return {
        recommendedVariantId: picked.variantId,
        reason: 'challenger',
        performances,
        championId: champion.variantId,
      }
    }
  }

  return {
    recommendedVariantId: champion.variantId,
    reason: 'best_performer',
    performances,
    championId: champion.variantId,
  }
}

// ── Analytics Helper ──

/**
 * Get variant performance summary for a club's campaign analytics dashboard.
 * Used by the Intelligence UI to show which messages perform best.
 */
export async function getVariantAnalytics(
  prisma: any,
  clubId: string,
  type?: OptimizableType,
  days: number = 30,
): Promise<{
  variants: VariantPerformance[]
  overallOpenRate: number
  overallClickRate: number
  totalMessages: number
}> {
  const lookbackDate = new Date(Date.now() - days * 86400000)

  const where: any = {
    clubId,
    variantId: { not: null },
    status: { in: ['sent', 'delivered'] },
    createdAt: { gte: lookbackDate },
  }
  if (type) where.type = type

  const logs = await prisma.aIRecommendationLog.findMany({
    where,
    select: {
      variantId: true,
      openedAt: true,
      clickedAt: true,
      bouncedAt: true,
      status: true,
      type: true,
    },
  })

  // Group by variant
  const byVariant = new Map<string, { sent: number; opened: number; clicked: number; bounced: number; converted: number }>()

  for (const log of logs) {
    const vid = log.variantId || 'unknown'
    if (!byVariant.has(vid)) {
      byVariant.set(vid, { sent: 0, opened: 0, clicked: 0, bounced: 0, converted: 0 })
    }
    const v = byVariant.get(vid)!
    v.sent++
    if (log.openedAt) v.opened++
    if (log.clickedAt) v.clicked++
    if (log.bouncedAt) v.bounced++
    if ((log as any).status === 'converted') v.converted++
  }

  const variants: VariantPerformance[] = Array.from(byVariant.entries()).map(([variantId, data]) => {
    const openRate = data.sent > 0 ? data.opened / data.sent : 0
    const clickRate = data.sent > 0 ? data.clicked / data.sent : 0
    const conversionRate = data.sent > 0 ? data.converted / data.sent : 0
    return {
      variantId,
      totalSent: data.sent,
      totalOpened: data.opened,
      totalClicked: data.clicked,
      totalBounced: data.bounced,
      totalConverted: data.converted,
      openRate,
      clickRate,
      bounceRate: data.sent > 0 ? data.bounced / data.sent : 0,
      conversionRate,
      engagementScore: conversionRate * 0.5 + clickRate * 0.3 + openRate * 0.2,
    }
  })

  const totalMessages = logs.length
  const totalOpened = logs.filter((l: any) => l.openedAt).length
  const totalClicked = logs.filter((l: any) => l.clickedAt).length

  return {
    variants: variants.sort((a, b) => b.engagementScore - a.engagementScore),
    overallOpenRate: totalMessages > 0 ? totalOpened / totalMessages : 0,
    overallClickRate: totalMessages > 0 ? totalClicked / totalMessages : 0,
    totalMessages,
  }
}
