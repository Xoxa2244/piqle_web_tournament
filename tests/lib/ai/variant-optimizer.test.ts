/**
 * Tests for variant-optimizer.ts
 *
 * Tests the feedback loop that selects message variants based on
 * historical open/click performance data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { selectBestVariant, getVariantAnalytics } from '@/lib/ai/variant-optimizer'
import type { OutreachMessageVariant } from '@/lib/ai/outreach-messages'

// ── Mock Data ──

const variants: OutreachMessageVariant[] = [
  { id: 'checkin_pattern', label: 'Pattern Break', recommended: true, emailSubject: 'S1', emailBody: 'B1', smsBody: 'SMS1' },
  { id: 'checkin_frequency', label: 'Frequency', recommended: false, emailSubject: 'S2', emailBody: 'B2', smsBody: 'SMS2' },
  { id: 'checkin_recency', label: 'Recency', recommended: false, emailSubject: 'S3', emailBody: 'B3', smsBody: 'SMS3' },
]

// ── Mock Prisma ──

function createMockPrisma() {
  return {
    aIRecommendationLog: {
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

beforeEach(() => {
  mockPrisma = createMockPrisma()
})

// ── selectBestVariant ──

describe('selectBestVariant', () => {
  it('returns default when no historical data', async () => {
    mockPrisma.aIRecommendationLog.groupBy.mockResolvedValue([])

    const result = await selectBestVariant(mockPrisma, 'club-1', 'CHECK_IN', variants)

    expect(result.recommendedVariantId).toBe('checkin_pattern') // default recommended
    expect(result.reason).toBe('default')
    expect(result.performances).toHaveLength(0)
  })

  it('returns cold_start when insufficient samples', async () => {
    // Some data exists but not enough per variant
    mockPrisma.aIRecommendationLog.groupBy
      .mockResolvedValueOnce([{ variantId: 'checkin_pattern', _count: { id: 5 } }]) // initial query
      .mockResolvedValueOnce([{ variantId: 'checkin_pattern', _count: { id: 5 } }]) // per-variant
      .mockResolvedValueOnce([]) // checkin_frequency
      .mockResolvedValueOnce([]) // checkin_recency

    const result = await selectBestVariant(mockPrisma, 'club-1', 'CHECK_IN', variants)

    expect(result.reason).toBe('cold_start')
    expect(result.recommendedVariantId).toBe('checkin_pattern') // falls back to default
  })

  it('selects best performer with enough data', async () => {
    // Initial groupBy returns data
    mockPrisma.aIRecommendationLog.groupBy
      .mockResolvedValueOnce([
        { variantId: 'checkin_pattern', _count: { id: 15 } },
        { variantId: 'checkin_frequency', _count: { id: 15 } },
      ])
      // Per-variant groupBy calls
      .mockResolvedValueOnce([{ variantId: 'checkin_pattern', _count: { id: 15 } }])
      .mockResolvedValueOnce([{ variantId: 'checkin_frequency', _count: { id: 15 } }])
      .mockResolvedValueOnce([]) // checkin_recency = 0

    // Count calls for checkin_pattern: opens=3, clicks=1, bounces=0
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(3)  // pattern opens
      .mockResolvedValueOnce(1)  // pattern clicks
      .mockResolvedValueOnce(0)  // pattern bounces
      // Count calls for checkin_frequency: opens=8, clicks=5, bounces=0
      .mockResolvedValueOnce(8)  // frequency opens
      .mockResolvedValueOnce(5)  // frequency clicks
      .mockResolvedValueOnce(0)  // frequency bounces

    // Mock Math.random to avoid exploration (return > 0.1)
    const originalRandom = Math.random
    Math.random = () => 0.5

    try {
      const result = await selectBestVariant(mockPrisma, 'club-1', 'CHECK_IN', variants)

      // checkin_frequency has better engagement (8/15 opens, 5/15 clicks)
      expect(result.recommendedVariantId).toBe('checkin_frequency')
      expect(result.reason).toBe('best_performer')
      expect(result.performances.length).toBeGreaterThan(0)
    } finally {
      Math.random = originalRandom
    }
  })

  it('sometimes explores non-optimal variants', async () => {
    // Initial groupBy returns data
    mockPrisma.aIRecommendationLog.groupBy
      .mockResolvedValueOnce([
        { variantId: 'checkin_pattern', _count: { id: 15 } },
        { variantId: 'checkin_frequency', _count: { id: 15 } },
      ])
      .mockResolvedValueOnce([{ variantId: 'checkin_pattern', _count: { id: 15 } }])
      .mockResolvedValueOnce([{ variantId: 'checkin_frequency', _count: { id: 15 } }])
      .mockResolvedValueOnce([])

    // checkin_pattern: high engagement; checkin_frequency: low engagement
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(10) // pattern opens
      .mockResolvedValueOnce(8)  // pattern clicks
      .mockResolvedValueOnce(0)  // pattern bounces
      .mockResolvedValueOnce(2)  // frequency opens
      .mockResolvedValueOnce(1)  // frequency clicks
      .mockResolvedValueOnce(0)  // frequency bounces

    // Force exploration (random < 0.1)
    const originalRandom = Math.random
    Math.random = () => 0.05

    try {
      const result = await selectBestVariant(mockPrisma, 'club-1', 'CHECK_IN', variants)

      expect(result.reason).toBe('exploration')
      // Should pick a non-best variant
      expect(result.recommendedVariantId).not.toBe('checkin_pattern')
    } finally {
      Math.random = originalRandom
    }
  })

  it('throws when no variants provided', async () => {
    await expect(selectBestVariant(mockPrisma, 'club-1', 'CHECK_IN', []))
      .rejects.toThrow('No variants provided')
  })
})

// ── getVariantAnalytics ──

describe('getVariantAnalytics', () => {
  it('returns empty analytics when no data', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([])

    const result = await getVariantAnalytics(mockPrisma, 'club-1')

    expect(result.totalMessages).toBe(0)
    expect(result.overallOpenRate).toBe(0)
    expect(result.overallClickRate).toBe(0)
    expect(result.variants).toHaveLength(0)
  })

  it('calculates correct rates from logs', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      { variantId: 'checkin_pattern', openedAt: new Date(), clickedAt: new Date(), bouncedAt: null, type: 'CHECK_IN' },
      { variantId: 'checkin_pattern', openedAt: new Date(), clickedAt: null, bouncedAt: null, type: 'CHECK_IN' },
      { variantId: 'checkin_pattern', openedAt: null, clickedAt: null, bouncedAt: null, type: 'CHECK_IN' },
      { variantId: 'checkin_frequency', openedAt: null, clickedAt: null, bouncedAt: new Date(), type: 'CHECK_IN' },
    ])

    const result = await getVariantAnalytics(mockPrisma, 'club-1', 'CHECK_IN')

    expect(result.totalMessages).toBe(4)
    expect(result.overallOpenRate).toBeCloseTo(0.5) // 2/4
    expect(result.overallClickRate).toBeCloseTo(0.25) // 1/4

    // Check per-variant data
    const pattern = result.variants.find(v => v.variantId === 'checkin_pattern')!
    expect(pattern.totalSent).toBe(3)
    expect(pattern.totalOpened).toBe(2)
    expect(pattern.totalClicked).toBe(1)
    expect(pattern.openRate).toBeCloseTo(0.667, 2) // 2/3
    expect(pattern.clickRate).toBeCloseTo(0.333, 2) // 1/3

    const frequency = result.variants.find(v => v.variantId === 'checkin_frequency')!
    expect(frequency.totalSent).toBe(1)
    expect(frequency.totalBounced).toBe(1)
    expect(frequency.bounceRate).toBe(1) // 1/1
  })

  it('sorts variants by engagement score descending', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      // checkin_frequency: high engagement
      { variantId: 'checkin_frequency', openedAt: new Date(), clickedAt: new Date(), bouncedAt: null, type: 'CHECK_IN' },
      { variantId: 'checkin_frequency', openedAt: new Date(), clickedAt: new Date(), bouncedAt: null, type: 'CHECK_IN' },
      // checkin_pattern: low engagement
      { variantId: 'checkin_pattern', openedAt: null, clickedAt: null, bouncedAt: null, type: 'CHECK_IN' },
      { variantId: 'checkin_pattern', openedAt: null, clickedAt: null, bouncedAt: null, type: 'CHECK_IN' },
    ])

    const result = await getVariantAnalytics(mockPrisma, 'club-1')

    expect(result.variants[0].variantId).toBe('checkin_frequency')
    expect(result.variants[0].engagementScore).toBeGreaterThan(result.variants[1].engagementScore)
  })
})
