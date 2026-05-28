/**
 * AI usage → credits abstraction for the customer-facing billing view.
 *
 * Clubs pay for their own AI usage. Exposing raw provider cost is bad on two
 * fronts: a $0.002 advisor message reads as unserious, and it leaks our
 * margin. Instead we abstract usage into "credits" mapped to a plan
 * allowance — the standard SaaS pattern.
 *
 * THE TUNABLE KNOB is USD_PER_CREDIT. Everything else (per-message credit
 * cost, how full an allowance feels) recomputes from it. Pricing owns this
 * number — change it here and the whole view follows.
 */

// 1 credit ≈ one typical AI Advisor message (~$0.002 on gpt-4o-mini today,
// verified live on prod). Pricing lever: lower it and each action burns more
// credits (allowance feels tighter); raise it and allowances feel roomier.
export const USD_PER_CREDIT = 0.002

// Monthly credit allowance per plan. null = unlimited (Enterprise).
// PLACEHOLDER values — tune against real usage once ai_usage_logs accumulates
// a few weeks of data. Rough intent at USD_PER_CREDIT=0.002:
//   starter 5,000 ≈ $10 of cost/mo, pro 20,000 ≈ $40/mo.
export const PLAN_MONTHLY_CREDITS: Record<string, number | null> = {
  free: 500,
  starter: 5000,
  pro: 20000,
  enterprise: null, // unlimited
}

/** Convert a USD cost to whole credits (rounds up — any usage costs ≥1 credit). */
export function costToCredits(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0
  return Math.ceil(costUsd / USD_PER_CREDIT)
}

/** Monthly credit allowance for a plan. null = unlimited. Unknown plan → free tier. */
export function getPlanCreditAllowance(plan: string | null | undefined): number | null {
  const key = (plan || 'free').toLowerCase()
  return key in PLAN_MONTHLY_CREDITS ? PLAN_MONTHLY_CREDITS[key] : PLAN_MONTHLY_CREDITS.free
}

// Friendly labels for the raw `operation` strings written by trackUsage.
// Anything unmapped falls back to a title-cased version of the raw string.
export const OPERATION_LABELS: Record<string, string> = {
  advisor_chat: 'AI Advisor',
  advisor_plan: 'AI Advisor (action planning)',
  programming_iq_regenerate: 'Programming insights',
  member_profile: 'Member insights',
  campaign_gen: 'Campaign drafting',
  message_gen: 'Message drafting',
  summary: 'Conversation summaries',
  embedding: 'Search indexing',
  gender_inference: 'Member enrichment',
  weekly_summary: 'Weekly summaries',
}

export function operationLabel(operation: string): string {
  if (operation in OPERATION_LABELS) return OPERATION_LABELS[operation]
  return operation
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}
