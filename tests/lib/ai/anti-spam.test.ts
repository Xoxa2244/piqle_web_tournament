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

describe('Антиспам > Правило 1: Opt-out (отписка)', () => {
  it('пользователь отписался → блокировка', async () => {
    mockPrisma.userPlayPreference.findUnique.mockResolvedValue({ notificationsOptOut: true })
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('opted out')
  })

  it('не отписался → разрешено', async () => {
    mockPrisma.userPlayPreference.findUnique.mockResolvedValue({ notificationsOptOut: false })
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(true)
  })

  it('нет записи предпочтений → разрешено (отсутствие ≠ отказ)', async () => {
    mockPrisma.userPlayPreference.findUnique.mockRejectedValue(new Error('not found'))
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(true)
  })
})

// ── Rule 2: Dedup ──

describe('Антиспам > Правило 2: Дедупликация', () => {
  it('повторное приглашение на ту же сессию → блокировка', async () => {
    // findFirst is called for dedup check (first call on aIRecommendationLog.findFirst)
    mockPrisma.aIRecommendationLog.findFirst
      .mockResolvedValueOnce({ id: 'existing' }) // dedup match → blocked
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Already invited')
  })

  it('нет sessionId → дедупликация не применяется', async () => {
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    // Should skip dedup and check frequency instead
    expect(result.allowed).toBe(true)
  })

  it('CSV-импортированная сессия (csv-123) → дедупликация не применяется', async () => {
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: 'csv-123' })
    // findFirst should not be called for dedup
    expect(result.allowed).toBe(true)
  })
})

// ── Rule 3: 24-hour frequency cap ──

describe('Антиспам > Правило 3: Лимит 24 часа', () => {
  it('2+ сообщения за 24ч → блокировка', async () => {
    // First count call = 24h check
    mockPrisma.aIRecommendationLog.count.mockResolvedValueOnce(2)
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('24 hours')
  })

  it('< 2 сообщений за 24ч → разрешено', async () => {
    mockPrisma.aIRecommendationLog.count.mockResolvedValueOnce(1) // 24h
    mockPrisma.aIRecommendationLog.count.mockResolvedValueOnce(1) // 7d
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(true)
  })
})

// ── Rule 4: 7-day frequency cap ──

describe('Антиспам > Правило 4: Лимит 7 дней', () => {
  it('5+ сообщений за 7 дней → блокировка', async () => {
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(1) // 24h — ok
      .mockResolvedValueOnce(5) // 7d — limit reached (increased to 5 for sequences)
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('7 days')
  })

  it('< 5 сообщений за 7 дней → разрешено', async () => {
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(1) // 24h
      .mockResolvedValueOnce(4) // 7d — under limit
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(true)
  })
})

// ── Rule 5: Cross-type cooldown ──

describe('Антиспам > Правило 5: Cooldown между типами', () => {
  it('другой тип кампании за последние 4ч → блокировка', async () => {
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

  it('нет недавних сообщений другого типа → разрешено', async () => {
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(0) // 24h
      .mockResolvedValueOnce(0) // 7d
    mockPrisma.aIRecommendationLog.findFirst.mockResolvedValue(null)
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(true)
  })
})

// ── Full Pipeline ──

describe('Антиспам > Полный пайплайн', () => {
  it('все 5 проверок пройдены → allowed = true', async () => {
    // All default mocks return null/0 = all clear
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput, sessionId: null })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('short-circuit: opt-out сразу блокирует (frequency не проверяется)', async () => {
    // Opt-out blocks immediately — should not check frequency
    mockPrisma.userPlayPreference.findUnique.mockResolvedValue({ notificationsOptOut: true })
    const result = await checkAntiSpam({ prisma: mockPrisma, ...baseInput })
    expect(result.allowed).toBe(false)
    // Frequency count should not have been called
    expect(mockPrisma.aIRecommendationLog.count).not.toHaveBeenCalled()
  })
})
