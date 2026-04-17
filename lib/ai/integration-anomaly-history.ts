import 'server-only'

import type { PrismaClient } from '@prisma/client'
import { intelligenceLogger as log } from '@/lib/logger'
import type { IntegrationAnomalyItem, IntegrationAnomalyQueue } from './integration-anomalies'

interface IntegrationAnomalyIncidentRow {
  id: string
  anomalyKey: string
  severity: string
  category: string
  title: string
  summary: string
  evidenceLabel: string
  firstSeenAt: string | Date
  lastSeenAt: string | Date
  lastSeenDateKey: string
  activeDays: number
  resolvedAt: string | Date | null
}

export interface IntegrationAnomalyRecurrenceSummary {
  status: 'new' | 'recurring' | 'chronic'
  label: string
  summary: string
  daysActive: number
  incidentCount: number
  returnedCount: number
  firstSeenAt: string | Date | null
  lastSeenAt: string | Date | null
}

interface SyncIntegrationAnomalyHistoryInput {
  prisma: PrismaClient | any
  clubId: string
  queue: IntegrationAnomalyQueue
  now?: Date
  lookbackDays?: number
}

function isMissingIntegrationAnomalyTable(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error || '')

  return code === 'P2021'
    || message.includes('integration_anomaly_incidents')
    || message.includes('does not exist')
}

function toDateKey(input: Date) {
  return input.toISOString().slice(0, 10)
}

export function buildIntegrationAnomalyRecurrence(input: {
  activeDays: number
  incidentCount: number
  firstSeenAt: string | Date | null
  lastSeenAt: string | Date | null
}): IntegrationAnomalyRecurrenceSummary {
  const returnedCount = Math.max(0, input.incidentCount - 1)
  const status: IntegrationAnomalyRecurrenceSummary['status'] =
    input.activeDays >= 5 || input.incidentCount >= 3
      ? 'chronic'
      : input.activeDays >= 2 || input.incidentCount >= 2
        ? 'recurring'
        : 'new'

  const label =
    status === 'chronic'
      ? 'Chronic'
      : status === 'recurring'
        ? 'Recurring'
        : 'New'

  const summary =
    status === 'chronic'
      ? `Active ${input.activeDays}d in a row and seen ${input.incidentCount} times in the last 30 days.`
      : status === 'recurring'
        ? input.activeDays >= 2
          ? returnedCount > 0
            ? `Day ${input.activeDays} in a row after returning ${returnedCount} other time${returnedCount === 1 ? '' : 's'} in the last 30 days.`
            : `Day ${input.activeDays} in a row.`
          : `Returned ${returnedCount} time${returnedCount === 1 ? '' : 's'} in the last 30 days.`
        : 'First seen today.'

  return {
    status,
    label,
    summary,
    daysActive: input.activeDays,
    incidentCount: input.incidentCount,
    returnedCount,
    firstSeenAt: input.firstSeenAt,
    lastSeenAt: input.lastSeenAt,
  }
}

function enrichQueueWithHistory(input: {
  queue: IntegrationAnomalyQueue
  activeIncidents: IntegrationAnomalyIncidentRow[]
  recentIncidents: IntegrationAnomalyIncidentRow[]
}): IntegrationAnomalyQueue {
  const activeByKey = new Map(input.activeIncidents.map((incident) => [incident.anomalyKey, incident]))
  const recentByKey = input.recentIncidents.reduce<Record<string, IntegrationAnomalyIncidentRow[]>>((acc, incident) => {
    if (!acc[incident.anomalyKey]) acc[incident.anomalyKey] = []
    acc[incident.anomalyKey].push(incident)
    return acc
  }, {})

  const enrichItem = (item: IntegrationAnomalyItem): IntegrationAnomalyItem => {
    const active = activeByKey.get(item.id)
    const recent = recentByKey[item.id] || []
    if (!active) return item

    return {
      ...item,
      history: buildIntegrationAnomalyRecurrence({
        activeDays: active.activeDays,
        incidentCount: recent.length || 1,
        firstSeenAt: active.firstSeenAt,
        lastSeenAt: active.lastSeenAt,
      }),
    }
  }

  const items = input.queue.items.map(enrichItem)
  const suggestedIds = new Set(input.queue.suggested.map((item) => item.id))
  const recurringCount = items.filter((item) => item.history?.status === 'recurring').length
  const chronicCount = items.filter((item) => item.history?.status === 'chronic').length

  return {
    ...input.queue,
    recurringCount,
    chronicCount,
    items,
    suggested: items.filter((item) => suggestedIds.has(item.id)),
  }
}

export async function syncIntegrationAnomalyHistory(
  input: SyncIntegrationAnomalyHistoryInput,
): Promise<IntegrationAnomalyQueue> {
  const now = input.now || new Date()
  const dateKey = toDateKey(now)
  const currentKeys = new Set(input.queue.items.map((item) => item.id))
  const lookbackStart = new Date(now.getTime() - (input.lookbackDays ?? 30) * 24 * 60 * 60 * 1000)

  try {
    const openIncidents = await input.prisma.integrationAnomalyIncident.findMany({
      where: {
        clubId: input.clubId,
        resolvedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        anomalyKey: true,
        severity: true,
        category: true,
        title: true,
        summary: true,
        evidenceLabel: true,
        firstSeenAt: true,
        lastSeenAt: true,
        lastSeenDateKey: true,
        activeDays: true,
        resolvedAt: true,
      },
    })

    const openByKey = new Map<string, IntegrationAnomalyIncidentRow[]>()
    for (const incident of openIncidents) {
      const bucket = openByKey.get(incident.anomalyKey) || []
      bucket.push(incident)
      openByKey.set(incident.anomalyKey, bucket)
    }

    for (const [anomalyKey, incidents] of Array.from(openByKey.entries())) {
      const [primary, ...duplicates] = incidents
      for (const duplicate of duplicates) {
        await input.prisma.integrationAnomalyIncident.update({
          where: { id: duplicate.id },
          data: {
            resolvedAt: now,
            lastSeenAt: now,
          },
        })
      }
      openByKey.set(anomalyKey, [primary])
    }

    for (const incident of openIncidents) {
      if (!currentKeys.has(incident.anomalyKey)) {
        await input.prisma.integrationAnomalyIncident.update({
          where: { id: incident.id },
          data: {
            resolvedAt: now,
            lastSeenAt: now,
          },
        })
      }
    }

    for (const item of input.queue.items) {
      const existing = openByKey.get(item.id)?.[0] || null
      const nextData = {
        severity: item.severity,
        category: item.category,
        title: item.title,
        summary: item.summary,
        evidenceLabel: item.evidenceLabel,
        lastSeenAt: now,
        lastSeenDateKey: dateKey,
        metadata: {
          nextBestMove: item.nextBestMove,
          actionLabel: item.actionLabel,
          playbookPrompt: item.playbookPrompt,
        },
      }

      if (existing) {
        await input.prisma.integrationAnomalyIncident.update({
          where: { id: existing.id },
          data: {
            ...nextData,
            activeDays: existing.lastSeenDateKey === dateKey ? existing.activeDays : existing.activeDays + 1,
            resolvedAt: null,
          },
        })
      } else {
        await input.prisma.integrationAnomalyIncident.create({
          data: {
            clubId: input.clubId,
            anomalyKey: item.id,
            severity: item.severity,
            category: item.category,
            title: item.title,
            summary: item.summary,
            evidenceLabel: item.evidenceLabel,
            firstSeenAt: now,
            lastSeenAt: now,
            lastSeenDateKey: dateKey,
            activeDays: 1,
            metadata: {
              nextBestMove: item.nextBestMove,
              actionLabel: item.actionLabel,
              playbookPrompt: item.playbookPrompt,
            },
          },
        })
      }
    }

    const [activeIncidents, recentIncidents] = await Promise.all([
      input.prisma.integrationAnomalyIncident.findMany({
        where: {
          clubId: input.clubId,
          resolvedAt: null,
          anomalyKey: { in: input.queue.items.map((item) => item.id) },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          anomalyKey: true,
          severity: true,
          category: true,
          title: true,
          summary: true,
          evidenceLabel: true,
          firstSeenAt: true,
          lastSeenAt: true,
          lastSeenDateKey: true,
          activeDays: true,
          resolvedAt: true,
        },
      }),
      input.prisma.integrationAnomalyIncident.findMany({
        where: {
          clubId: input.clubId,
          anomalyKey: { in: input.queue.items.map((item) => item.id) },
          lastSeenAt: { gte: lookbackStart },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          anomalyKey: true,
          severity: true,
          category: true,
          title: true,
          summary: true,
          evidenceLabel: true,
          firstSeenAt: true,
          lastSeenAt: true,
          lastSeenDateKey: true,
          activeDays: true,
          resolvedAt: true,
        },
      }),
    ])

    return enrichQueueWithHistory({
      queue: input.queue,
      activeIncidents,
      recentIncidents,
    })
  } catch (error) {
    if (isMissingIntegrationAnomalyTable(error)) {
      log.warn('[IntegrationAnomalyHistory] Skipping persistence because integration_anomaly_incidents is unavailable:', error)
      return input.queue
    }
    throw error
  }
}
