import { describe, expect, it } from 'vitest'

import {
  buildLookalikeExportPreview,
  buildSelectedLookalikeAudience,
  buildLookalikeAudienceCsv,
  buildLookalikeAudienceExport,
  type LookalikeExportMemberRow,
} from '@/lib/ai/lookalike-export'

function makeMember(overrides: Partial<LookalikeExportMemberRow>): LookalikeExportMemberRow {
  return {
    userId: overrides.userId || crypto.randomUUID(),
    name: overrides.name ?? 'Member',
    email: overrides.email ?? 'member@example.com',
    phone: overrides.phone ?? null,
    city: overrides.city ?? 'Austin',
    zipCode: overrides.zipCode ?? '78701',
    gender: overrides.gender ?? 'F',
    age: overrides.age ?? 34,
    duprRating: overrides.duprRating ?? 3.5,
    joinedAt: overrides.joinedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    daysSinceJoined: overrides.daysSinceJoined ?? 70,
    lastPlayedAt: overrides.lastPlayedAt ?? new Date('2026-04-10T00:00:00.000Z'),
    daysSinceLastVisit: overrides.daysSinceLastVisit ?? 6,
    totalBookings: overrides.totalBookings ?? 12,
    bookingsLast30: overrides.bookingsLast30 ?? 5,
    totalRevenue: overrides.totalRevenue ?? 420,
    healthScore: overrides.healthScore ?? 82,
    riskLevel: overrides.riskLevel ?? 'healthy',
    lifecycleStage: overrides.lifecycleStage ?? 'active',
    membershipType: overrides.membershipType ?? 'Monthly Unlimited',
    membershipStatus: overrides.membershipStatus ?? 'Active',
    normalizedMembershipType: overrides.normalizedMembershipType ?? 'monthly',
    normalizedMembershipStatus: overrides.normalizedMembershipStatus ?? 'active',
  }
}

describe('lookalike export', () => {
  it('builds export-ready audiences from healthy paid members', () => {
    const snapshot = buildLookalikeAudienceExport({
      members: [
        makeMember({ userId: 'healthy-core-1', totalRevenue: 510, healthScore: 90, totalBookings: 18 }),
        makeMember({ userId: 'healthy-core-2', totalRevenue: 380, healthScore: 78, totalBookings: 9 }),
        makeMember({
          userId: 'new-converter',
          daysSinceJoined: 35,
          totalBookings: 4,
          bookingsLast30: 3,
          totalRevenue: 180,
          healthScore: 68,
          normalizedMembershipType: 'package',
        }),
        makeMember({
          userId: 'vip-advocate',
          normalizedMembershipType: 'unlimited',
          bookingsLast30: 6,
          totalBookings: 22,
          totalRevenue: 640,
          healthScore: 88,
        }),
        makeMember({
          userId: 'guest',
          normalizedMembershipType: 'guest',
          normalizedMembershipStatus: 'guest',
          membershipType: 'Guest Pass',
          membershipStatus: 'Guest',
          totalRevenue: 0,
          totalBookings: 1,
          bookingsLast30: 1,
          healthScore: 40,
        }),
      ],
    })

    expect(snapshot.summary.audienceCount).toBeGreaterThanOrEqual(3)
    expect(snapshot.audiences.some((audience) => audience.key === 'healthy_paid_core')).toBe(true)
    expect(snapshot.audiences.some((audience) => audience.key === 'new_successful_converters')).toBe(true)
    expect(snapshot.audiences.some((audience) => audience.key === 'vip_advocates')).toBe(true)

    const healthyPaidCore = snapshot.internalAudiences.find((audience) => audience.key === 'healthy_paid_core')
    expect(healthyPaidCore?.memberIds).toContain('healthy-core-1')
    expect(healthyPaidCore?.memberIds).not.toContain('guest')
    expect(healthyPaidCore?.contactableCount).toBeGreaterThan(0)
  })

  it('builds csv output for a selected audience', () => {
    const snapshot = buildLookalikeAudienceExport({
      members: [
        makeMember({ userId: 'csv-1', name: 'Alex Seed', totalRevenue: 500 }),
        makeMember({ userId: 'csv-2', name: 'Jamie Seed', totalRevenue: 360, healthScore: 76 }),
      ],
    })

    const audience = snapshot.internalAudiences.find((entry) => entry.key === 'healthy_paid_core')
    expect(audience).toBeTruthy()

    const csv = buildLookalikeAudienceCsv({ audience: audience! })

    expect(csv.fileName).toContain('.csv')
    expect(csv.memberCount).toBeGreaterThan(0)
    expect(csv.csv).toContain('seed_audience_key')
    expect(csv.csv).toContain('Alex Seed')
    expect(csv.csv).toContain('healthy_paid_core')
  })

  it('combines multiple audiences into one custom seed and supports channel presets', () => {
    const snapshot = buildLookalikeAudienceExport({
      members: [
        makeMember({ userId: 'core-1', name: 'Alex Seed', totalRevenue: 500, healthScore: 88 }),
        makeMember({
          userId: 'new-1',
          name: 'Jordan Convert',
          daysSinceJoined: 20,
          totalBookings: 4,
          bookingsLast30: 4,
          totalRevenue: 220,
          healthScore: 66,
          normalizedMembershipType: 'package',
        }),
      ],
    })

    const combined = buildSelectedLookalikeAudience({
      snapshot,
      audienceKeys: ['healthy_paid_core', 'new_successful_converters'],
    })

    expect(combined).toBeTruthy()
    expect(combined?.memberIds).toContain('core-1')
    expect(combined?.memberIds).toContain('new-1')

    const metaCsv = buildLookalikeAudienceCsv({
      audience: combined!,
      preset: 'meta_custom_audience',
    })

    expect(metaCsv.fileName).toContain('meta_custom_audience')
    expect(metaCsv.csv).toContain('email,phone,fn,ln,ct,zip,external_id')
    expect(metaCsv.csv).toContain('Alex')
  })

  it('builds preset coverage preview with channel onboarding guidance', () => {
    const snapshot = buildLookalikeAudienceExport({
      members: [
        makeMember({ userId: 'meta-1', email: 'meta-1@example.com', phone: null, totalRevenue: 510, healthScore: 88 }),
        makeMember({ userId: 'meta-2', email: '', phone: '', totalRevenue: 390, healthScore: 80 }),
      ],
    })

    const preview = buildLookalikeExportPreview({
      snapshot,
      audienceKeys: ['healthy_paid_core'],
      preset: 'meta_custom_audience',
    })

    expect(preview).toBeTruthy()
    expect(preview?.presetLabel).toBe('Meta Custom Audience')
    expect(preview?.coverage.contactableCount).toBe(1)
    expect(preview?.warnings.some((warning) => warning.includes('both email and phone'))).toBe(true)
    expect(preview?.nextSteps[0]).toContain('Customer List')
  })
})
