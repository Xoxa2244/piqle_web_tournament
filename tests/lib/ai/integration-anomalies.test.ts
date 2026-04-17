import { describe, expect, it } from 'vitest'

import { buildIntegrationAnomalyQueue } from '@/lib/ai/integration-anomalies'

describe('integration anomalies', () => {
  it('promotes systemic health issues into an anomaly queue', () => {
    const queue = buildIntegrationAnomalyQueue({
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

    expect(queue.status).toBe('at_risk')
    expect(queue.items[0]?.id).toBe('missing_bookings')
    expect(queue.suggested).toHaveLength(1)
  })

  it('adds incomplete-sync and sync-error anomalies from connector metadata', () => {
    const queue = buildIntegrationAnomalyQueue({
      issues: [],
      connector: {
        provider: 'courtreserve',
        status: 'syncing',
        lastSyncAt: new Date('2026-04-16T10:00:00.000Z'),
        lastSyncResult: {
          incomplete: true,
          nextRetryAt: '2026-04-16T20:00:00.000Z',
          status: 'Phase 2/3 done. Next retry in 2h.',
          totalErrors: 6,
        },
        autoSync: true,
        syncIntervalHours: 6,
      },
      now: new Date('2026-04-16T18:00:00.000Z'),
    })

    expect(queue.items.some((item) => item.id === 'sync_incomplete')).toBe(true)
    expect(queue.items.some((item) => item.id === 'sync_error_count')).toBe(true)
    expect(queue.atRiskCount).toBeGreaterThan(0)
  })
})
