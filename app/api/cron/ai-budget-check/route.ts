/**
 * AI Budget Check Cron
 *
 * Runs every 6 hours. Two responsibilities:
 *   1. Detect clubs approaching or exceeding their monthly AI budget and
 *      emit Sentry warnings so we can reach out proactively.
 *   2. Detect clubs with anomalous spend spikes in the last 24h (>$10 single
 *      day) — catches runaway crons or abuse early.
 *
 * This is observability only — it does NOT automatically disable anything.
 * Kill-switch + autonomy policy are the operator's controls, budget alerts
 * are the trigger for them to act.
 *
 * Schedule: 0 star/6 star star star (every 6 hours) — add to vercel.json
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { cronHandler } from '@/lib/cron-wrapper'
import { resetMonthlySpendIfNeeded } from '@/lib/ai/llm/usage-tracker'
import { cronLogger as log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NEAR_LIMIT_THRESHOLD = 0.8 // warn at 80% of budget
const SPIKE_THRESHOLD_USD = 10 // single-day spend > $10 is noteworthy for now

export const POST = cronHandler('ai-budget-check', async () => {
  // 1. Reset any clubs whose month rolled over since last run
  //    (cheap loop — 3 clubs today, scales fine for a while)
  const allClubs = await prisma.club.findMany({
    select: { id: true },
  })
  let resetCount = 0
  for (const club of allClubs) {
    if (await resetMonthlySpendIfNeeded(club.id)) resetCount++
  }

  // 2. Find clubs over or near budget
  const budgetedClubs = await prisma.club.findMany({
    where: { aiMonthlyBudgetUsd: { not: null } },
    select: {
      id: true,
      name: true,
      aiMonthlyBudgetUsd: true,
      aiSpendCurrentMonth: true,
    },
  })

  const overBudget: Array<{ clubId: string; name: string; budget: number; spent: number }> = []
  const nearLimit: Array<{ clubId: string; name: string; budget: number; spent: number; pctUsed: number }> = []

  for (const club of budgetedClubs) {
    const budget = Number(club.aiMonthlyBudgetUsd!)
    const spent = Number(club.aiSpendCurrentMonth)
    if (spent >= budget) {
      overBudget.push({ clubId: club.id, name: club.name, budget, spent })
      Sentry.captureMessage(
        `Club ${club.name} over AI budget: $${spent.toFixed(4)} / $${budget.toFixed(2)}`,
        {
          level: 'warning',
          tags: { cron: 'ai-budget-check', alert: 'over_budget' },
          extra: { clubId: club.id, budget, spent },
        },
      )
    } else if (spent / budget >= NEAR_LIMIT_THRESHOLD) {
      const pctUsed = (spent / budget) * 100
      nearLimit.push({ clubId: club.id, name: club.name, budget, spent, pctUsed })
      Sentry.captureMessage(
        `Club ${club.name} near AI budget limit: ${pctUsed.toFixed(1)}%`,
        {
          level: 'info',
          tags: { cron: 'ai-budget-check', alert: 'near_limit' },
          extra: { clubId: club.id, budget, spent, pctUsed },
        },
      )
    }
  }

  // 3. Detect single-day spike anomalies (last 24h per club)
  type SpikeRow = { club_id: string; total_cost: number }
  const spikes = await prisma.$queryRaw<SpikeRow[]>`
    SELECT
      club_id,
      SUM(cost_usd) as total_cost
    FROM ai_usage_logs
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY club_id
    HAVING SUM(cost_usd) > ${SPIKE_THRESHOLD_USD}
    ORDER BY SUM(cost_usd) DESC
  `

  for (const spike of spikes) {
    Sentry.captureMessage(
      `AI spend spike: club ${spike.club_id} spent $${Number(spike.total_cost).toFixed(4)} in last 24h`,
      {
        level: 'warning',
        tags: { cron: 'ai-budget-check', alert: 'daily_spike' },
        extra: { clubId: spike.club_id, total24h: Number(spike.total_cost) },
      },
    )
  }

  log.info(
    {
      cron: 'ai-budget-check',
      budgetedClubs: budgetedClubs.length,
      overBudget: overBudget.length,
      nearLimit: nearLimit.length,
      spikes: spikes.length,
      monthResets: resetCount,
    },
    'Budget check complete',
  )

  return {
    budgetedClubs: budgetedClubs.length,
    overBudget: overBudget.length,
    nearLimit: nearLimit.length,
    spikes: spikes.length,
    monthResets: resetCount,
  }
})

// Vercel cron uses GET by default for scheduled triggers
export const GET = POST
