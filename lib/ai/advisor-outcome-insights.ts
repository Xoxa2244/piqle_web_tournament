import 'server-only'

import { getAdvisorLatestOutcome, type AdvisorOutcomeMemory } from './advisor-outcomes'

type CampaignOutcomeLog = {
  type: string
  channel?: string | null
  status?: string | null
  openedAt?: Date | string | null
  clickedAt?: Date | string | null
  respondedAt?: Date | string | null
  deliveredAt?: Date | string | null
}

type FlowInsight = {
  type: string
  channel: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  converted: number
  openRate: number
  clickRate: number
  conversionRate: number
}

export type AdvisorOutcomeInsights = {
  totals: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    converted: number
  }
  topFlows: FlowInsight[]
  recentOutcomes: AdvisorOutcomeMemory[]
}

export type AdvisorPerformanceSignal = {
  headline: string
  bullets: string[]
}

const SENT_EQUIVALENT_STATUSES = new Set(['sent', 'delivered', 'opened', 'clicked', 'converted'])
const DELIVERED_EQUIVALENT_STATUSES = new Set(['delivered', 'opened', 'clicked', 'converted'])
const OPENED_EQUIVALENT_STATUSES = new Set(['opened', 'clicked', 'converted'])
const CLICKED_EQUIVALENT_STATUSES = new Set(['clicked', 'converted'])

function normalizeStatus(status?: string | null) {
  return (status || '').trim().toLowerCase()
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 100)
}

function humanizeType(type: string) {
  return type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function humanizeChannel(channel?: string | null) {
  if (!channel) return 'mixed'
  if (channel === 'sms') return 'SMS'
  if (channel === 'email') return 'email'
  if (channel === 'both') return 'email + SMS'
  return channel
}

function normalizeChannel(channel?: string | null) {
  return (channel || '').trim().toLowerCase()
}

export function buildAdvisorOutcomeInsights(input: {
  campaignLogs: CampaignOutcomeLog[]
  advisorOutcomes: AdvisorOutcomeMemory[]
}): AdvisorOutcomeInsights {
  const totals = {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
  }

  const byFlow = new Map<string, FlowInsight>()

  for (const log of input.campaignLogs) {
    const status = normalizeStatus(log.status)
    const key = `${log.type}:${log.channel || 'mixed'}`
    const existing = byFlow.get(key) || {
      type: log.type,
      channel: log.channel || 'mixed',
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      converted: 0,
      openRate: 0,
      clickRate: 0,
      conversionRate: 0,
    }

    const sent = SENT_EQUIVALENT_STATUSES.has(status)
    const delivered = !!log.deliveredAt || DELIVERED_EQUIVALENT_STATUSES.has(status)
    const opened = !!log.openedAt || OPENED_EQUIVALENT_STATUSES.has(status)
    const clicked = !!log.clickedAt || CLICKED_EQUIVALENT_STATUSES.has(status)
    const converted = !!log.respondedAt || status === 'converted'

    if (sent) {
      existing.sent += 1
      totals.sent += 1
    }
    if (delivered) {
      existing.delivered += 1
      totals.delivered += 1
    }
    if (opened) {
      existing.opened += 1
      totals.opened += 1
    }
    if (clicked) {
      existing.clicked += 1
      totals.clicked += 1
    }
    if (converted) {
      existing.converted += 1
      totals.converted += 1
    }

    byFlow.set(key, existing)
  }

  const topFlows = Array.from(byFlow.values())
    .map((flow) => ({
      ...flow,
      openRate: formatPercent(flow.opened, Math.max(flow.delivered, flow.sent)),
      clickRate: formatPercent(flow.clicked, Math.max(flow.opened, flow.sent)),
      conversionRate: formatPercent(flow.converted, flow.sent),
    }))
    .filter((flow) => flow.sent > 0)
    .sort((a, b) => {
      if (b.conversionRate !== a.conversionRate) return b.conversionRate - a.conversionRate
      if (b.openRate !== a.openRate) return b.openRate - a.openRate
      return b.sent - a.sent
    })
    .slice(0, 3)

  const recentOutcomes = [...input.advisorOutcomes]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5)

  return {
    totals,
    topFlows,
    recentOutcomes,
  }
}

export function formatAdvisorOutcomeInsightsBlock(insights: AdvisorOutcomeInsights, days: number = 30) {
  if (insights.totals.sent === 0 && insights.recentOutcomes.length === 0) return ''

  const parts = ['\n--- Recent Agent Outcomes ---']

  if (insights.totals.sent > 0) {
    parts.push(
      `Last ${days}d outreach totals: ${insights.totals.sent} sent, ${insights.totals.delivered} delivered, ${insights.totals.opened} opened, ${insights.totals.clicked} clicked, ${insights.totals.converted} converted.`,
    )
  }

  if (insights.topFlows.length > 0) {
    parts.push('Strongest recent outreach signals:')
    for (const flow of insights.topFlows) {
      parts.push(
        `- ${humanizeType(flow.type)} via ${humanizeChannel(flow.channel)}: ${flow.sent} sent, ${flow.openRate}% open, ${flow.clickRate}% click, ${flow.conversionRate}% convert.`,
      )
    }
  }

  if (insights.recentOutcomes.length > 0) {
    parts.push('Recent completed advisor actions:')
    for (const outcome of insights.recentOutcomes.slice(0, 4)) {
      parts.push(`- ${outcome.summary}`)
    }
  }

  parts.push('Use these outcomes as directional evidence when recommending channels, timing, audiences, and follow-up actions. Do not overclaim causality.')
  parts.push('--- End of Recent Agent Outcomes ---')
  return parts.join('\n')
}

export function buildAdvisorPerformanceSignal(input: {
  type: string
  requestedChannel?: string | null
  insights: AdvisorOutcomeInsights
  days?: number
}): AdvisorPerformanceSignal | null {
  const typeLabel = humanizeType(input.type).toLowerCase()
  const requestedChannel = normalizeChannel(input.requestedChannel)
  const flowForRequestedChannel = requestedChannel
    ? input.insights.topFlows.find((flow) => normalizeChannel(flow.channel) === requestedChannel)
    : null
  const topFlow = flowForRequestedChannel || input.insights.topFlows[0]
  const bullets: string[] = []
  let headline = ''

  if (topFlow && topFlow.sent > 0) {
    const flowChannel = humanizeChannel(topFlow.channel)
    headline = flowForRequestedChannel
      ? `${flowChannel} has the clearest recent signal for this ${typeLabel} action.`
      : `${flowChannel} is the strongest recent channel for ${typeLabel}.`
    bullets.push(
      `Recent ${typeLabel} via ${flowChannel}: ${topFlow.sent} sent, ${topFlow.openRate}% open, ${topFlow.clickRate}% click, ${topFlow.conversionRate}% convert.`,
    )

    if (requestedChannel && normalizeChannel(topFlow.channel) !== requestedChannel) {
      bullets.push(
        `This draft currently uses ${humanizeChannel(requestedChannel)}, so compare it against the stronger ${flowChannel} signal before sending.`,
      )
    }
  }

  if (input.insights.recentOutcomes.length > 0) {
    bullets.push(`Latest completed advisor action: ${input.insights.recentOutcomes[0].summary}`)
  }

  if (input.insights.totals.sent > 0) {
    bullets.push(
      `Last ${input.days || 30} days across this club: ${input.insights.totals.sent} related sends, ${input.insights.totals.delivered} delivered, ${input.insights.totals.converted} converted.`,
    )
  }

  if (!headline && bullets.length === 0) return null

  return {
    headline: headline || 'Recent club outcomes can help guide this action.',
    bullets: bullets.slice(0, 3),
  }
}

export async function buildAdvisorOutcomeInsightsBlock(opts: {
  prisma: any
  clubId: string
  days?: number
  maxAdvisorMessages?: number
}) {
  const since = new Date(Date.now() - (opts.days || 30) * 86400000)

  const [campaignLogs, advisorMessages] = await Promise.all([
    opts.prisma.aIRecommendationLog.findMany({
      where: {
        clubId: opts.clubId,
        createdAt: { gte: since },
      },
      select: {
        type: true,
        channel: true,
        status: true,
        openedAt: true,
        clickedAt: true,
        respondedAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    opts.prisma.aIMessage.findMany({
      where: {
        role: 'assistant',
        createdAt: { gte: since },
        conversation: {
          is: {
            clubId: opts.clubId,
          },
        },
      },
      select: {
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
      take: opts.maxAdvisorMessages || 40,
    }),
  ])

  const seen = new Set<string>()
  const advisorOutcomes = advisorMessages
    .map((message: { metadata?: unknown }) => getAdvisorLatestOutcome(message.metadata))
    .filter((outcome: AdvisorOutcomeMemory | null): outcome is AdvisorOutcomeMemory => !!outcome)
    .filter((outcome: AdvisorOutcomeMemory) => {
      const key = `${outcome.occurredAt}:${outcome.summary}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return formatAdvisorOutcomeInsightsBlock(
    buildAdvisorOutcomeInsights({
      campaignLogs,
      advisorOutcomes,
    }),
    opts.days || 30,
  )
}

export async function buildAdvisorPerformanceSignalForAction(opts: {
  prisma: any
  clubId: string
  type: string
  requestedChannel?: string | null
  advisorOutcomeKind?: AdvisorOutcomeMemory['kind']
  days?: number
  maxAdvisorMessages?: number
}) {
  const since = new Date(Date.now() - (opts.days || 30) * 86400000)

  const [campaignLogs, advisorMessages] = await Promise.all([
    opts.prisma.aIRecommendationLog.findMany({
      where: {
        clubId: opts.clubId,
        createdAt: { gte: since },
        type: opts.type,
      },
      select: {
        type: true,
        channel: true,
        status: true,
        openedAt: true,
        clickedAt: true,
        respondedAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    opts.prisma.aIMessage.findMany({
      where: {
        role: 'assistant',
        createdAt: { gte: since },
        conversation: {
          is: {
            clubId: opts.clubId,
          },
        },
      },
      select: {
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
      take: opts.maxAdvisorMessages || 30,
    }),
  ])

  const recentOutcomes = advisorMessages
    .map((message: { metadata?: unknown }) => getAdvisorLatestOutcome(message.metadata))
    .filter((outcome: AdvisorOutcomeMemory | null): outcome is AdvisorOutcomeMemory => !!outcome)
    .filter((outcome: AdvisorOutcomeMemory) => !opts.advisorOutcomeKind || outcome.kind === opts.advisorOutcomeKind)

  return buildAdvisorPerformanceSignal({
    type: opts.type,
    requestedChannel: opts.requestedChannel,
    days: opts.days,
    insights: buildAdvisorOutcomeInsights({
      campaignLogs,
      advisorOutcomes: recentOutcomes,
    }),
  })
}
