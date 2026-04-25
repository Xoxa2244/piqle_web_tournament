import { describe, expect, it } from 'vitest'
import { buildSuperadminIntegrationOpsDashboard } from '@/lib/ai/integration-superadmin'

describe('buildSuperadminIntegrationOpsDashboard', () => {
  it('aggregates recurring incidents and synthetic connector freshness signals across clubs', () => {
    const now = new Date('2026-04-16T18:00:00.000Z')
    const dashboard = buildSuperadminIntegrationOpsDashboard({
      now,
      windowDays: 14,
      clubs: [
        {
          id: 'club-risk',
          name: 'Risk Club',
          connectors: [
            {
              id: 'connector-risk',
              provider: 'courtreserve',
              status: 'connected',
              lastSyncAt: '2026-04-11T10:00:00.000Z',
              lastSyncResult: {},
              lastError: null,
              autoSync: true,
              syncIntervalHours: 6,
            },
          ],
          admins: [
            {
              role: 'ADMIN',
              user: {
                id: 'admin-1',
                name: 'Alex',
                email: 'alex@example.com',
              },
            },
          ],
        },
        {
          id: 'club-healthy',
          name: 'Healthy Club',
          connectors: [
            {
              id: 'connector-healthy',
              provider: 'courtreserve',
              status: 'connected',
              lastSyncAt: '2026-04-16T16:00:00.000Z',
              lastSyncResult: {},
              lastError: null,
              autoSync: true,
              syncIntervalHours: 6,
            },
          ],
          admins: [],
        },
      ],
      activeIncidents: [
        {
          id: 'incident-1',
          clubId: 'club-risk',
          anomalyKey: 'missing_bookings',
          severity: 'at_risk',
          category: 'data',
          title: 'Bookings are missing',
          summary: 'Booking volume dropped below the trusted floor.',
          evidenceLabel: '12 bookings',
          firstSeenAt: '2026-04-14T18:00:00.000Z',
          lastSeenAt: '2026-04-16T17:00:00.000Z',
          activeDays: 3,
          resolvedAt: null,
        },
      ],
      recentIncidents: [
        {
          id: 'incident-1',
          clubId: 'club-risk',
          anomalyKey: 'missing_bookings',
          severity: 'at_risk',
          category: 'data',
          title: 'Bookings are missing',
          summary: 'Booking volume dropped below the trusted floor.',
          evidenceLabel: '12 bookings',
          firstSeenAt: '2026-04-14T18:00:00.000Z',
          lastSeenAt: '2026-04-16T17:00:00.000Z',
          activeDays: 3,
          resolvedAt: null,
        },
        {
          id: 'incident-0',
          clubId: 'club-risk',
          anomalyKey: 'missing_bookings',
          severity: 'watch',
          category: 'data',
          title: 'Bookings are missing',
          summary: 'Booking volume dipped last week.',
          evidenceLabel: '42 bookings',
          firstSeenAt: '2026-04-05T18:00:00.000Z',
          lastSeenAt: '2026-04-06T17:00:00.000Z',
          activeDays: 1,
          resolvedAt: '2026-04-06T17:00:00.000Z',
        },
      ],
      decisions: [
        {
          id: 'decision-1',
          clubId: 'club-risk',
          targetId: 'incident-1',
          createdAt: '2026-04-16T18:10:00.000Z',
          metadata: {
            decision: 'assign',
            ownerUserId: 'admin-1',
            ownerLabel: 'Alex',
          },
          user: {
            id: 'superadmin-1',
            name: 'Morgan',
            email: 'morgan@example.com',
          },
        },
      ],
    })

    expect(dashboard.summary.totalClubs).toBe(2)
    expect(dashboard.summary.affectedClubs).toBe(1)
    expect(dashboard.summary.atRiskClubs).toBe(1)
    expect(dashboard.summary.recurringClubs).toBe(1)
    expect(dashboard.summary.unresolvedIssues).toBe(2)
    expect(dashboard.topPatterns[0]).toMatchObject({
      key: 'missing_bookings',
      count: 1,
      chronicCount: 0,
    })

    expect(dashboard.clubs[0]).toMatchObject({
      id: 'club-risk',
      status: 'at_risk',
      recurringCount: 1,
      connector: {
        canSync: true,
        freshnessTone: 'at_risk',
      },
    })
    expect(dashboard.clubs[0].topIssue?.history?.status).toBe('recurring')
    expect(dashboard.clubs[0].topIssue?.opsState).toMatchObject({
      status: 'assigned',
      ownerLabel: 'Alex',
    })
    expect(dashboard.clubs[0].issues[1]).toMatchObject({
      key: 'stale_sync_risk',
      severity: 'at_risk',
      isSynthetic: true,
    })
    expect(dashboard.clubs[0].issues[0].isSynthetic).toBe(false)

    expect(dashboard.clubs[1]).toMatchObject({
      id: 'club-healthy',
      status: 'healthy',
      issueCount: 0,
      connector: {
        freshnessTone: 'healthy',
      },
    })
  })
})
