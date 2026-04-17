import { describe, expect, it } from 'vitest'

import { buildIntegrationAnomalyQueue } from '@/lib/ai/integration-anomalies'
import {
  buildIntegrationAnomalyRecurrence,
  syncIntegrationAnomalyHistory,
} from '@/lib/ai/integration-anomaly-history'

function createFakePrisma() {
  let counter = 1
  const store: any[] = []

  const incidentApi = {
    async findMany(args: any) {
      const where = args?.where || {}
      let rows = [...store]

      if (where.clubId) {
        rows = rows.filter((row) => row.clubId === where.clubId)
      }
      if (where.resolvedAt === null) {
        rows = rows.filter((row) => row.resolvedAt === null)
      }
      if (where.anomalyKey?.in) {
        const allowed = new Set(where.anomalyKey.in)
        rows = rows.filter((row) => allowed.has(row.anomalyKey))
      }
      if (where.lastSeenAt?.gte) {
        const floor = new Date(where.lastSeenAt.gte).getTime()
        rows = rows.filter((row) => new Date(row.lastSeenAt).getTime() >= floor)
      }

      rows.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      return rows.map((row) => ({ ...row }))
    },

    async create(args: any) {
      const now = new Date()
      const record = {
        id: `incident-${counter++}`,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
        ...args.data,
      }
      store.push(record)
      return { ...record }
    },

    async update(args: any) {
      const index = store.findIndex((row) => row.id === args.where.id)
      if (index === -1) throw new Error('incident not found')
      store[index] = {
        ...store[index],
        ...args.data,
        updatedAt: new Date(),
      }
      return { ...store[index] }
    },
  }

  return {
    integrationAnomalyIncident: incidentApi,
  } as any
}

describe('integration anomaly history', () => {
  it('classifies chronic recurrence from repeated active days', () => {
    const summary = buildIntegrationAnomalyRecurrence({
      activeDays: 5,
      incidentCount: 3,
      firstSeenAt: new Date('2026-04-10T18:00:00.000Z'),
      lastSeenAt: new Date('2026-04-14T18:00:00.000Z'),
    })

    expect(summary.status).toBe('chronic')
    expect(summary.label).toBe('Chronic')
  })

  it('persists recurring anomaly memory across days and returns recurrence badges', async () => {
    const prisma = createFakePrisma()

    const firstDayQueue = buildIntegrationAnomalyQueue({
      issues: [
        {
          key: 'missing_bookings',
          severity: 'at_risk',
          category: 'import',
          title: 'Bookings are missing behind live sessions',
          summary: 'Sessions exist, but bookings are missing.',
          metricLabel: '0 bookings',
          nextBestMove: 'Backfill bookings next.',
          actionLabel: 'Backfill bookings',
          playbookPrompt: 'Help me backfill bookings.',
        },
      ],
      connector: null,
      now: new Date('2026-04-16T18:00:00.000Z'),
    })

    const firstDay = await syncIntegrationAnomalyHistory({
      prisma,
      clubId: 'club-1',
      queue: firstDayQueue,
      now: new Date('2026-04-16T18:00:00.000Z'),
    })

    expect(firstDay.items[0]?.history?.status).toBe('new')

    const secondDay = await syncIntegrationAnomalyHistory({
      prisma,
      clubId: 'club-1',
      queue: firstDayQueue,
      now: new Date('2026-04-17T18:00:00.000Z'),
    })

    expect(secondDay.items[0]?.history?.status).toBe('recurring')
    expect(secondDay.items[0]?.history?.daysActive).toBe(2)
    expect(secondDay.recurringCount).toBe(1)
  })
})
