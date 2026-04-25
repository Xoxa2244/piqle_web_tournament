import {
  formatAgentOutreachRolloutActionKind,
  type AgentOutreachRolloutActionKind,
} from './agent-outreach-rollout'

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

const SENT_EQUIVALENT_STATUSES = new Set(['sent', 'delivered', 'opened', 'clicked', 'converted'])
const DELIVERED_EQUIVALENT_STATUSES = new Set(['delivered', 'opened', 'clicked', 'converted'])
const OPENED_EQUIVALENT_STATUSES = new Set(['opened', 'clicked', 'converted'])
const CLICKED_EQUIVALENT_STATUSES = new Set(['clicked', 'converted'])
const FAILED_EQUIVALENT_STATUSES = new Set(['failed', 'bounced', 'spam'])

export type AgentOutreachPilotHealth = 'idle' | 'healthy' | 'watch' | 'at_risk'

export type AgentOutreachPilotLog = {
  clubId?: string | null
  type?: string | null
  channel?: string | null
  status?: string | null
  reasoning?: unknown
  createdAt?: Date | string | null
  openedAt?: Date | string | null
  clickedAt?: Date | string | null
  respondedAt?: Date | string | null
  deliveredAt?: Date | string | null
  bouncedAt?: Date | string | null
  bounceType?: string | null
}

export type AgentOutreachPilotMetrics = {
  sent: number
  delivered: number
  opened: number
  clicked: number
  converted: number
  failed: number
  bounced: number
  unsubscribed: number
}

export type AgentOutreachPilotActionSummary = AgentOutreachPilotMetrics & {
  actionKind: AgentOutreachRolloutActionKind
  label: string
  health: AgentOutreachPilotHealth
  deliveryRate: number
  openRate: number
  clickRate: number
  conversionRate: number
  failureRate: number
}

export type AgentOutreachPilotSnapshot = {
  days: number
  health: AgentOutreachPilotHealth
  summary: string
  totals: AgentOutreachPilotMetrics
  actions: AgentOutreachPilotActionSummary[]
  topAction: AgentOutreachPilotActionSummary | null
  atRiskAction: AgentOutreachPilotActionSummary | null
  recommendation: {
    actionKind: AgentOutreachRolloutActionKind
    label: string
    health: 'watch' | 'at_risk'
    reason: string
  } | null
}

function createEmptyMetrics(): AgentOutreachPilotMetrics {
  return {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
    failed: 0,
    bounced: 0,
    unsubscribed: 0,
  }
}

function normalizeStatus(status?: string | null) {
  return (status || '').trim().toLowerCase()
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 100)
}

function mergeMetrics(target: AgentOutreachPilotMetrics, next: AgentOutreachPilotMetrics) {
  target.sent += next.sent
  target.delivered += next.delivered
  target.opened += next.opened
  target.clicked += next.clicked
  target.converted += next.converted
  target.failed += next.failed
  target.bounced += next.bounced
  target.unsubscribed += next.unsubscribed
}

function getMetricsForLog(log: AgentOutreachPilotLog): AgentOutreachPilotMetrics {
  const status = normalizeStatus(log.status)
  const bounced = !!log.bouncedAt || status === 'bounced' || status === 'spam'
  const unsubscribed = status === 'unsubscribed' || String(log.bounceType || '').toLowerCase() === 'unsub'

  return {
    sent: SENT_EQUIVALENT_STATUSES.has(status) ? 1 : 0,
    delivered: !!log.deliveredAt || DELIVERED_EQUIVALENT_STATUSES.has(status) ? 1 : 0,
    opened: !!log.openedAt || OPENED_EQUIVALENT_STATUSES.has(status) ? 1 : 0,
    clicked: !!log.clickedAt || CLICKED_EQUIVALENT_STATUSES.has(status) ? 1 : 0,
    converted: !!log.respondedAt || status === 'converted' ? 1 : 0,
    failed: FAILED_EQUIVALENT_STATUSES.has(status) ? 1 : 0,
    bounced: bounced ? 1 : 0,
    unsubscribed: unsubscribed ? 1 : 0,
  }
}

export function resolveAgentOutreachActionKindFromRecommendationLog(
  log: Pick<AgentOutreachPilotLog, 'type' | 'reasoning'>,
): AgentOutreachRolloutActionKind {
  const reasoning = toRecord(log.reasoning)
  const explicit = typeof reasoning.actionKind === 'string' ? reasoning.actionKind : null
  if (
    explicit === 'create_campaign'
    || explicit === 'fill_session'
    || explicit === 'reactivate_members'
    || explicit === 'trial_follow_up'
    || explicit === 'renewal_reactivation'
  ) {
    return explicit
  }

  if (reasoning.membershipLifecycle === 'trial_follow_up') return 'trial_follow_up'
  if (reasoning.membershipLifecycle === 'renewal_reactivation') return 'renewal_reactivation'
  if (log.type === 'SLOT_FILLER') return 'fill_session'
  if (log.type === 'REACTIVATION') return 'reactivate_members'

  return 'create_campaign'
}

export function evaluateAgentOutreachPilotHealth(metrics: AgentOutreachPilotMetrics): AgentOutreachPilotHealth {
  if (metrics.sent === 0) return 'idle'

  const deliveryRate = metrics.sent > 0 ? metrics.delivered / metrics.sent : 0
  const failureRate = metrics.sent > 0 ? metrics.failed / metrics.sent : 0

  if (
    metrics.unsubscribed >= 2
    || metrics.failed >= Math.max(2, Math.ceil(metrics.sent * 0.3))
    || metrics.bounced >= 2
    || (metrics.sent >= 8 && deliveryRate < 0.65)
  ) {
    return 'at_risk'
  }

  if (
    metrics.unsubscribed >= 1
    || metrics.failed >= 1
    || (metrics.sent >= 6 && metrics.converted === 0 && metrics.clicked === 0)
    || (metrics.sent >= 4 && deliveryRate < 0.8)
    || failureRate >= 0.15
  ) {
    return 'watch'
  }

  return 'healthy'
}

function buildActionSummary(
  actionKind: AgentOutreachRolloutActionKind,
  metrics: AgentOutreachPilotMetrics,
): AgentOutreachPilotActionSummary {
  return {
    ...metrics,
    actionKind,
    label: formatAgentOutreachRolloutActionKind(actionKind),
    health: evaluateAgentOutreachPilotHealth(metrics),
    deliveryRate: formatPercent(metrics.delivered, metrics.sent),
    openRate: formatPercent(metrics.opened, Math.max(metrics.delivered, metrics.sent)),
    clickRate: formatPercent(metrics.clicked, Math.max(metrics.opened, metrics.sent)),
    conversionRate: formatPercent(metrics.converted, metrics.sent),
    failureRate: formatPercent(metrics.failed, metrics.sent),
  }
}

export function buildAgentOutreachPilotSummary(
  metrics: AgentOutreachPilotMetrics,
  days: number,
): string {
  if (metrics.sent === 0) {
    return `No live outreach outcomes in the last ${days}d.`
  }

  const parts = [
    `${metrics.sent} live sends`,
    `${metrics.delivered} delivered`,
    `${metrics.opened} opened`,
    `${metrics.clicked} clicked`,
    `${metrics.converted} booked`,
  ]

  if (metrics.failed > 0) parts.push(`${metrics.failed} failed`)
  if (metrics.unsubscribed > 0) parts.push(`${metrics.unsubscribed} opt-outs`)

  return parts.join(' · ')
}

export function buildAgentOutreachPilotSnapshot(input: {
  logs: AgentOutreachPilotLog[]
  days?: number
}): AgentOutreachPilotSnapshot {
  const days = input.days ?? 7
  const totals = createEmptyMetrics()
  const actionMetrics = new Map<AgentOutreachRolloutActionKind, AgentOutreachPilotMetrics>()

  for (const log of input.logs) {
    const actionKind = resolveAgentOutreachActionKindFromRecommendationLog(log)
    const metrics = getMetricsForLog(log)
    mergeMetrics(totals, metrics)

    const existing = actionMetrics.get(actionKind) || createEmptyMetrics()
    mergeMetrics(existing, metrics)
    actionMetrics.set(actionKind, existing)
  }

  const actions = Array.from(actionMetrics.entries())
    .map(([actionKind, metrics]) => buildActionSummary(actionKind, metrics))
    .sort((a, b) => {
      if (b.sent !== a.sent) return b.sent - a.sent
      if (b.converted !== a.converted) return b.converted - a.converted
      return b.clicked - a.clicked
    })

  const topAction = actions[0] || null
  const atRiskAction = actions
    .filter((action) => action.health === 'at_risk' || action.health === 'watch')
    .sort((a, b) => {
      const severity = (health: AgentOutreachPilotHealth) =>
        health === 'at_risk' ? 2 : health === 'watch' ? 1 : 0
      if (severity(b.health) !== severity(a.health)) return severity(b.health) - severity(a.health)
      return b.failureRate - a.failureRate
    })[0] || null
  const recommendation = atRiskAction
    ? {
        actionKind: atRiskAction.actionKind,
        label: atRiskAction.label,
        health: atRiskAction.health as 'watch' | 'at_risk',
        reason:
          atRiskAction.health === 'at_risk'
            ? `Move ${atRiskAction.label.toLowerCase()} back to shadow. Recent pilot window shows ${atRiskAction.failed} failed sends and ${atRiskAction.unsubscribed} opt-outs.`
            : `Consider moving ${atRiskAction.label.toLowerCase()} back to shadow. Recent pilot window shows elevated failure or opt-out risk.`,
      }
    : null

  return {
    days,
    health: evaluateAgentOutreachPilotHealth(totals),
    summary: buildAgentOutreachPilotSummary(totals, days),
    totals,
    actions,
    topAction,
    atRiskAction,
    recommendation,
  }
}
