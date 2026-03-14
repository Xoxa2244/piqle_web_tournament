import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAntiSpam } from '@/lib/ai/anti-spam'

// ── Mock Prisma ──

function createMockPrisma() {
  return {
    userPlayPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    aIRecommendationLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

beforeEach(() => {
  mockPrisma = createMockPrisma()
})

const baseInput = {
  userId: 'user-1',
  clubId: 'club-1',
  type: 'CHECK_IN' as const,
  sessionId: 'session-1',
}

// ── Rule 1: Opt-out ──

describe('opt-out check', () => {
  it('blocks when user opted out', async () => {
    mockPrisma.userPlayPreference.findUnique.mockResolvedValue({ notificationsOptOut: true })
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('opted out')
  })

  it('allows when user not opted out', async () => {
    mockPrisma.userPlayPreference.findUnique.mockResolvedValue({ notificationsOptOut: false })
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(true)
  })

  it('allows when no preference record exists', async () => {
    mockPrisma.userPlayPreference.findUnique.mockRejectedValue(new Error('not found'))
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(true)
  })
})

// ── Rule 2: Dedup ──

describe('dedup check', () => {
  it('blocks when already invited to same session', async () => {
    // findFirst is called for dedup check (first call on aIRecommendationLog.findFirst)
    mockPrisma.aIRecommendationLog.findFirst
      .mockResolvedValueOnce({ id: 'existing' }) // dedup match → blocked
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Already invited')
  })

  it('skips dedup when no sessionId', async () => {
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    // Should skip dedup and check frequency instead
    expect(result.allowed).toBe(true)
  })

  it('skips dedup for csv-prefixed sessionIds', async () => {
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: 'csv-123' })
    // findFirst should not be called for dedup
    expect(result.allowed).toBe(true)
  })
})

// ── Rule 3: 24-hour frequency cap ──

describe('24-hour frequency cap', () => {
  it('blocks when sent 2+ messages in 24h', async () => {
    // First count call = 24h check
    mockPrisma.aIRecommendationLog.count.mockResolvedValueOnce(2)
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('24 hours')
  })

  it('allows when sent < 2 messages in 24h', async () => {
    mockPrisma.aIRecommendationLog.count.mockResolvedValueOnce(1) // 24h
    mockPrisma.aIRecommendationLog.count.mockResolvedValueOnce(1) // 7d
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(true)
  })
})

// ── Rule 4: 7-day frequency cap ──

describe('7-day frequency cap', () => {
  it('blocks when sent 5+ messages in 7 days', async () => {
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(1) // 24h — ok
      .mockResolvedValueOnce(5) // 7d — limit reached (increased to 5 for sequences)
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('7 days')
  })

  it('allows when sent < 5 messages in 7 days', async () => {
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(1) // 24h
      .mockResolvedValueOnce(4) // 7d — under limit
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(true)
  })
})

// ── Rule 5: Cross-type cooldown ──

describe('cross-type cooldown', () => {
  it('blocks when different type sent within 4 hours', async () => {
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(0) // 24h
      .mockResolvedValueOnce(0) // 7d
    // sessionId=null → dedup is skipped, so first findFirst call is cross-type cooldown
    mockPrisma.aIRecommendationLog.findFirst
      .mockResolvedValueOnce({ type: 'RETENTION_BOOST', createdAt: new Date() }) // recent different type
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('cooldown')
  })

  it('allows when no recent cross-type messages', async () => {
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(0) // 24h
      .mockResolvedValueOnce(0) // 7d
    mockPrisma.aIRecommendationLog.findFirst.mockResolvedValue(null)
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(true)
  })
})

// ── Full Pipeline ──

describe('full anti-spam pipeline', () => {
  it('allows message when all checks pass', async () => {
    // All default mocks return null/0 = all clear
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('stops at first failing rule (short-circuit)', async () => {
    // Opt-out blocks immediately — should not check frequency
    mockPrisma.userPlayPreference.findUnique.mockResolvedValue({ notificationsOptOut: true })
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(false)
    // Frequency count should not have been called
    expect(mockPrisma.aIRecommendationLog.count).not.toHaveBeenCalled()
  })
})
