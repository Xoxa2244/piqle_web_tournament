import { describe, expect, it } from 'vitest'

import { buildIntegrationHealthSnapshot } from '@/lib/ai/integration-health'

function makeCoverage(overrides?: Partial<Parameters<typeof buildIntegrationHealthSnapshot>[0]['coverage']>) {
  return {
    members: {
      total: 120,
      fields: {
        email: { filled: 108, percent: 90, label: 'Email' },
        phone: { filled: 96, percent: 80, label: 'Phone' },
        membershipType: { filled: 96, percent: 80, label: 'Membership' },
        skillLevel: { filled: 84, percent: 70, label: 'Skill Level' },
        city: { filled: 84, percent: 70, label: 'City' },
      },
      ...(overrides?.members || {}),
    },
    sessions: {
      total: 48,
      fields: {
        title: { filled: 48, percent: 100, label: 'Title' },
        format: { filled: 48, percent: 100, label: 'Format' },
        court: { filled: 44, percent: 92, label: 'Court' },
        price: { filled: 36, percent: 75, label: 'Price' },
      },
      ...(overrides?.sessions || {}),
    },
    bookings: {
      total: 240,
      fields: {
        confirmed: { filled: 210, percent: 88, label: 'Confirmed' },
        cancelledAt: { filled: 102, percent: 43, label: 'Cancel Date' },
        checkedInAt: { filled: 156, percent: 65, label: 'Check-in' },
      },
      ...(overrides?.bookings || {}),
    },
    courts: {
      total: 6,
      ...(overrides?.courts || {}),
    },
  }
}

describe('integration health', () => {
  it('marks a well-synced club as healthy', () => {
    const snapshot = buildIntegrationHealthSnapshot({
      coverage: makeCoverage(),
      connector: {
        provider: 'courtreserve',
        status: 'connected',
        lastSyncAt: new Date('2026-04-16T15:00:00.000Z'),
        autoSync: true,
        syncIntervalHours: 6,
      },
      now: new Date('2026-04-16T18:00:00.000Z'),
    })

    expect(snapshot.summary.status).toBe('healthy')
    expect(snapshot.summary.issueCount).toBe(0)
    expect(snapshot.cards.connector.status).toBe('healthy')
    expect(snapshot.suggestedActions).toHaveLength(0)
  })

  it('flags clubs with no connector and no imported data as at risk', () => {
    const snapshot = buildIntegrationHealthSnapshot({
      coverage: makeCoverage({
        members: { total: 0, fields: makeCoverage().members.fields },
        sessions: { total: 0, fields: makeCoverage().sessions.fields },
        bookings: { total: 0, fields: makeCoverage().bookings.fields },
        courts: { total: 0 },
      }),
      connector: null,
      now: new Date('2026-04-16T18:00:00.000Z'),
    })

    expect(snapshot.summary.status).toBe('at_risk')
    expect(snapshot.issues.some((issue) => issue.key === 'no_data_source')).toBe(true)
    expect(snapshot.issues.some((issue) => issue.key === 'missing_members')).toBe(true)
    expect(snapshot.issues.some((issue) => issue.key === 'missing_sessions')).toBe(true)
  })

  it('surfaces stale sync risk when connector freshness slips too far', () => {
    const snapshot = buildIntegrationHealthSnapshot({
      coverage: makeCoverage(),
      connector: {
        provider: 'courtreserve',
        status: 'connected',
        lastSyncAt: new Date('2026-04-10T18:00:00.000Z'),
        autoSync: true,
        syncIntervalHours: 6,
      },
      now: new Date('2026-04-16T18:00:00.000Z'),
    })

    expect(snapshot.summary.status).toBe('at_risk')
    expect(snapshot.cards.connector.status).toBe('at_risk')
    expect(snapshot.issues[0]?.key).toBe('stale_sync_risk')
    expect(snapshot.suggestedActions[0]?.actionLabel).toBe('Recover sync freshness')
  })

  it('builds field-level mapping fixes for weak coverage', () => {
    const snapshot = buildIntegrationHealthSnapshot({
      coverage: makeCoverage({
        members: {
          total: 100,
          fields: {
            email: { filled: 38, percent: 38, label: 'Email' },
            phone: { filled: 42, percent: 42, label: 'Phone' },
            membershipType: { filled: 52, percent: 52, label: 'Membership' },
            skillLevel: { filled: 70, percent: 70, label: 'Skill Level' },
            city: { filled: 65, percent: 65, label: 'City' },
          },
        },
        sessions: {
          total: 24,
          fields: {
            title: { filled: 24, percent: 100, label: 'Title' },
            format: { filled: 10, percent: 42, label: 'Format' },
            court: { filled: 11, percent: 46, label: 'Court' },
            price: { filled: 8, percent: 33, label: 'Price' },
          },
        },
        bookings: {
          total: 120,
          fields: {
            confirmed: { filled: 80, percent: 67, label: 'Confirmed' },
            cancelledAt: { filled: 20, percent: 17, label: 'Cancel Date' },
            checkedInAt: { filled: 44, percent: 37, label: 'Check-in' },
          },
        },
      }),
      connector: {
        provider: 'courtreserve',
        status: 'connected',
        lastSyncAt: new Date('2026-04-16T15:00:00.000Z'),
        autoSync: true,
        syncIntervalHours: 6,
      },
      now: new Date('2026-04-16T18:00:00.000Z'),
    })

    expect(snapshot.mappingReview.status).toBe('at_risk')
    expect(snapshot.mappingReview.fixCount).toBeGreaterThan(0)
    expect(snapshot.mappingReview.fields.some((fix) => fix.key === 'members_email')).toBe(true)
    expect(snapshot.mappingReview.fields.some((fix) => fix.key === 'sessions_court')).toBe(true)
    expect(snapshot.mappingReview.fields.some((fix) => fix.key === 'bookings_checkedInAt')).toBe(true)
  })
})
