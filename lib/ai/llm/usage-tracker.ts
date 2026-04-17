/**
 * AI Usage Tracking & Budget Enforcement
 *
 * Every LLM/embedding call should record: which club, model, operation,
 * tokens used, cost in USD. This gives us:
 *   - Per-club cost visibility (dashboards)
 *   - Abuse detection (spike alerts)
 *   - Budget enforcement (refuse expensive calls when exceeded)
 *
 * Pricing is kept as simple constants — no need to call a pricing API,
 * and the values change slowly enough to bump quarterly.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// Pricing per 1M tokens (USD). Source: OpenAI + Anthropic public pricing Q2 2026.
// Bump when providers update. Missing model → cost = 0 (still logged).
const PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  // Anthropic
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
}

export interface UsageRecord {
  clubId: string
  model: string
  /** Short identifier: 'advisor_chat' | 'member_profile' | 'campaign_gen' | 'embedding' | ... */
  operation: string
  promptTokens: number
  completionTokens: number
  metadata?: Record<string, unknown>
}

export function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[model]
  if (!pricing) return 0
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  )
}

/**
 * Record a single AI call. Non-blocking: failures are logged but swallowed
 * so a tracking hiccup never breaks the business logic that triggered it.
 *
 * Also increments club.aiSpendCurrentMonth atomically so budget checks stay accurate.
 */
export async function trackUsage(record: UsageRecord): Promise<void> {
  const totalTokens = record.promptTokens + record.completionTokens
  const costUsd = calculateCost(record.model, record.promptTokens, record.completionTokens)

  try {
    // Write log + bump club spend in parallel (best-effort — both non-critical).
    await Promise.all([
      prisma.aIUsageLog.create({
        data: {
          clubId: record.clubId,
          model: record.model,
          operation: record.operation,
          promptTokens: record.promptTokens,
          completionTokens: record.completionTokens,
          totalTokens,
          costUsd,
          // Cast to Prisma JSON type — we trust callers pass serializable values
          metadata: record.metadata ? (record.metadata as any) : undefined,
        },
      }),
      costUsd > 0
        ? prisma.club.update({
            where: { id: record.clubId },
            data: { aiSpendCurrentMonth: { increment: costUsd } },
          })
        : Promise.resolve(null),
    ])

    logger.info(
      {
        module: 'ai-cost',
        clubId: record.clubId,
        model: record.model,
        operation: record.operation,
        tokens: totalTokens,
        costUsd: Number(costUsd.toFixed(6)),
      },
      'AI usage tracked',
    )
  } catch (err) {
    logger.error(
      {
        module: 'ai-cost',
        err: (err as Error).message?.slice(0, 200),
        record: { clubId: record.clubId, model: record.model, operation: record.operation },
      },
      'Failed to track AI usage (swallowed — business logic continues)',
    )
  }
}

// ── Budget Enforcement ───────────────────────────────────────────────

export interface BudgetCheckResult {
  allowed: boolean
  remainingUsd: number
  budgetUsd: number | null
  spentUsd: number
  reason?: string
}

/**
 * Check if a club has budget remaining this month.
 * - If aiMonthlyBudgetUsd is NULL → unlimited (returns allowed: true, remainingUsd: Infinity)
 * - If aiSpendCurrentMonth >= aiMonthlyBudgetUsd → refuse
 *
 * Call BEFORE starting expensive operations (profile generation, long chats,
 * bulk embeddings). For individual LLM calls inside a hot path, skip this
 * check and rely on usage tracking + async alerts.
 */
export async function checkAIBudget(clubId: string): Promise<BudgetCheckResult> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      aiMonthlyBudgetUsd: true,
      aiSpendCurrentMonth: true,
    },
  })

  if (!club) {
    return { allowed: false, remainingUsd: 0, budgetUsd: null, spentUsd: 0, reason: 'Club not found' }
  }

  if (club.aiMonthlyBudgetUsd === null) {
    return { allowed: true, remainingUsd: Infinity, budgetUsd: null, spentUsd: Number(club.aiSpendCurrentMonth) }
  }

  const budget = Number(club.aiMonthlyBudgetUsd)
  const spent = Number(club.aiSpendCurrentMonth)
  const remaining = budget - spent

  return {
    allowed: remaining > 0,
    remainingUsd: remaining,
    budgetUsd: budget,
    spentUsd: spent,
    reason: remaining > 0 ? undefined : `Monthly AI budget of $${budget.toFixed(2)} exceeded (spent $${spent.toFixed(4)})`,
  }
}

/**
 * Reset all clubs' monthly spend at the start of a new month.
 * Intended to be called by a daily cron which detects month rollover.
 */
export async function resetMonthlySpendIfNeeded(clubId: string): Promise<boolean> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { aiSpendMonthStart: true },
  })
  if (!club) return false

  const now = new Date()
  const lastStart = club.aiSpendMonthStart
  const isNewMonth =
    now.getUTCFullYear() !== lastStart.getUTCFullYear() ||
    now.getUTCMonth() !== lastStart.getUTCMonth()

  if (!isNewMonth) return false

  await prisma.club.update({
    where: { id: clubId },
    data: {
      aiSpendCurrentMonth: 0,
      aiSpendMonthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    },
  })
  return true
}
