import 'server-only'

import { getAdvisorLatestOutcome, type AdvisorOutcomeMemory } from './advisor-outcomes'
import { buildAdvisorScheduledSendFromLocalTime, type AdvisorScheduledSend } from './advisor-scheduling'
import type { AdvisorAction } from './advisor-actions'

type CampaignOutcomeLog = {
  type: string
  channel?: string | null
  status?: string | null
  openedAt?: Date | string | null
  clickedAt?: Date | string | null
  respondedAt?: Date | string | null
  deliveredAt?: Date | string | null
  createdAt?: Date | string | null
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

export type AdvisorRecentSendSnapshot = {
  windowLabel: string
  timeZone: string
  totals: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    converted: number
  }
  flows: FlowInsight[]
}

export type AdvisorAdaptiveDefaults = {
  channel?: Extract<AdvisorAction, { kind: 'create_campaign' }>['campaign']['channel']
  channelDerivedFromOutcomes?: boolean
  scheduledSend?: AdvisorScheduledSend | null
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

function getLocalHour(date: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).format(date)
  const hour = Number(formatted)
  return Number.isFinite(hour) ? hour : null
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0')
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1')
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1')
  return { year, month, day }
}

function getUtcDateForTimeZoneLocal(input: {
  reference: Date
  timeZone: string
  dayOffset?: number
  hour?: number
  minute?: number
}) {
  const { reference, timeZone, dayOffset = 0, hour = 0, minute = 0 } = input
  const zoned = getZonedDateParts(reference, timeZone)
  const approxUtc = new Date(Date.UTC(zoned.year, zoned.month - 1, zoned.day + dayOffset, hour, minute, 0, 0))
  const localAsUtc = new Date(approxUtc.toLocaleString('en-US', { timeZone }))
  const offsetMs = localAsUtc.getTime() - approxUtc.getTime()
  return new Date(approxUtc.getTime() - offsetMs)
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
    parts.push('Recent advisor actions (operational history, may include drafts, previews, or scheduled work and are NOT automatically live sends):')
    for (const outcome of insights.recentOutcomes.slice(0, 4)) {
      parts.push(`- ${outcome.summary}`)
    }
  }

  parts.push('Use these outcomes as directional evidence when recommending channels, timing, audiences, and follow-up actions. Do not overclaim causality or describe drafts/previews/scheduled actions as sent.')
  parts.push('--- End of Recent Agent Outcomes ---')
  return parts.join('\n')
}

export function buildAdvisorRecentSendSnapshot(input: {
  campaignLogs: CampaignOutcomeLog[]
  timeZone: string
  windowLabel: string
}): AdvisorRecentSendSnapshot {
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

  const flows = Array.from(byFlow.values())
    .map((flow) => ({
      ...flow,
      openRate: formatPercent(flow.opened, Math.max(flow.delivered, flow.sent)),
      clickRate: formatPercent(flow.clicked, Math.max(flow.opened, flow.sent)),
      conversionRate: formatPercent(flow.converted, flow.sent),
    }))
    .filter((flow) => flow.sent > 0)
    .sort((a, b) => b.sent - a.sent)

  return {
    windowLabel: input.windowLabel,
    timeZone: input.timeZone,
    totals,
    flows,
  }
}

export function formatAdvisorRecentSendSnapshotBlock(snapshot: AdvisorRecentSendSnapshot) {
  const parts = ['\n--- Confirmed Overnight Outreach ---']
  parts.push(`Window: ${snapshot.windowLabel} (${snapshot.timeZone})`)

  if (snapshot.totals.sent === 0) {
    parts.push('No confirmed live outreach sends were logged in this window.')
  } else {
    parts.push(
      `Confirmed live sends in this window: ${snapshot.totals.sent} sent, ${snapshot.totals.delivered} delivered, ${snapshot.totals.opened} opened, ${snapshot.totals.clicked} clicked, ${snapshot.totals.converted} converted.`,
    )
    parts.push('Breakdown by flow:')
    for (const flow of snapshot.flows.slice(0, 6)) {
      parts.push(
        `- ${humanizeType(flow.type)} via ${humanizeChannel(flow.channel)}: ${flow.sent} sent, ${flow.openRate}% open, ${flow.clickRate}% click, ${flow.conversionRate}% convert.`,
      )
    }
  }

  parts.push('Only treat this block as confirmed send history. Drafts, previews, approvals, and scheduled actions are not live sends unless this block says they were sent.')
  parts.push('--- End Confirmed Overnight Outreach ---')
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

export async function buildAdvisorRecentSendSnapshotBlock(opts: {
  prisma: any
  clubId: string
  timeZone: string
  now?: Date
}) {
  const now = opts.now || new Date()
  const windowStart = getUtcDateForTimeZoneLocal({
    reference: now,
    timeZone: opts.timeZone,
    dayOffset: -1,
    hour: 22,
    minute: 0,
  })
  const windowEnd = getUtcDateForTimeZoneLocal({
    reference: now,
    timeZone: opts.timeZone,
    hour: 9,
    minute: 0,
  })

  const campaignLogs: CampaignOutcomeLog[] = await opts.prisma.aIRecommendationLog.findMany({
    where: {
      clubId: opts.clubId,
      createdAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    select: {
      type: true,
      channel: true,
      status: true,
      openedAt: true,
      clickedAt: true,
      respondedAt: true,
      deliveredAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const startLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: opts.timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(windowStart)
  const endLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: opts.timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(windowEnd)

  const snapshot = buildAdvisorRecentSendSnapshot({
    campaignLogs,
    timeZone: opts.timeZone,
    windowLabel: `${startLabel} to ${endLabel}`,
  })

  return formatAdvisorRecentSendSnapshotBlock(snapshot)
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

export async function resolveAdvisorAdaptiveDefaultsForAction(opts: {
  prisma: any
  clubId: string
  type: string
  timeZone?: string | null
  requestedChannel?: string | null
  days?: number
  now?: Date
}) {
  const since = new Date(Date.now() - (opts.days || 30) * 86400000)
  const campaignLogs: CampaignOutcomeLog[] = await opts.prisma.aIRecommendationLog.findMany({
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
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const insights = buildAdvisorOutcomeInsights({
    campaignLogs,
    advisorOutcomes: [],
  })
  const topChannel = insights.topFlows[0]?.channel
  const channelDerivedFromOutcomes = !normalizeChannel(opts.requestedChannel) && !!normalizeChannel(topChannel)
  const resolvedChannel = normalizeChannel(opts.requestedChannel) || normalizeChannel(topChannel) || 'email'
  const timeZone = String(opts.timeZone || '').trim()

  let scheduledSend: AdvisorScheduledSend | null = null
  if (timeZone) {
    const hourlyBuckets = new Map<number, { sent: number; opened: number; converted: number }>()

    for (const log of campaignLogs) {
      if (normalizeChannel(log.channel) !== resolvedChannel) continue
      if (!log.createdAt) continue
      const createdAt = new Date(log.createdAt)
      if (Number.isNaN(createdAt.getTime())) continue
      const hour = getLocalHour(createdAt, timeZone)
      if (hour === null) continue

      const bucket = hourlyBuckets.get(hour) || { sent: 0, opened: 0, converted: 0 }
      const status = normalizeStatus(log.status)
      if (SENT_EQUIVALENT_STATUSES.has(status)) bucket.sent += 1
      if (!!log.openedAt || OPENED_EQUIVALENT_STATUSES.has(status)) bucket.opened += 1
      if (!!log.respondedAt || status === 'converted') bucket.converted += 1
      hourlyBuckets.set(hour, bucket)
    }

    const bestHour = Array.from(hourlyBuckets.entries())
      .filter(([, bucket]) => bucket.sent >= 2)
      .map(([hour, bucket]) => ({
        hour,
        sent: bucket.sent,
        openRate: formatPercent(bucket.opened, bucket.sent),
        conversionRate: formatPercent(bucket.converted, bucket.sent),
      }))
      .sort((a, b) => {
        if (b.conversionRate !== a.conversionRate) return b.conversionRate - a.conversionRate
        if (b.openRate !== a.openRate) return b.openRate - a.openRate
        return b.sent - a.sent
      })[0]

    if (bestHour) {
      scheduledSend = buildAdvisorScheduledSendFromLocalTime({
        hour: bestHour.hour,
        minute: 0,
        timeZone,
        now: opts.now,
      })
    }
  }

  return {
    channel: resolvedChannel as AdvisorAdaptiveDefaults['channel'],
    channelDerivedFromOutcomes,
    scheduledSend,
  }
}
