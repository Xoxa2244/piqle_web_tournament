import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkUsageLimit, getPlanLimits } from '@/lib/subscription'

// ── Mock Prisma ──

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    aIRecommendationLog: { groupBy: vi.fn(), count: vi.fn() },
    aIConversation: { count: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'

const mockPrisma = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no subscription (free plan)
  mockPrisma.subscription.findUnique.mockResolvedValue(null)
  mockPrisma.aIRecommendationLog.groupBy.mockResolvedValue([])
  mockPrisma.aIRecommendationLog.count.mockResolvedValue(0)
  mockPrisma.aIConversation.count.mockResolvedValue(0)
})

// ── getPlanLimits ──

describe('Лимиты плана > getPlanLimits', () => {
  it('free план: 5 кампаний/мес', () => {
    const limits = getPlanLimits('free')
    expect(limits.campaignsPerMonth).toBe(5)
  })

  it('starter план: 15 кампаний/мес, 2000 email, 100 SMS', () => {
    const limits = getPlanLimits('starter')
    expect(limits.campaignsPerMonth).toBe(15)
    expect(limits.emailsPerMonth).toBe(2000)
    expect(limits.smsPerMonth).toBe(100)
  })

  it('pro план: безлимитные кампании (Infinity)', () => {
    const limits = getPlanLimits('pro')
    expect(limits.campaignsPerMonth).toBe(Infinity)
  })

  it('enterprise план: безлимит на все', () => {
    const limits = getPlanLimits('enterprise')
    expect(limits.campaignsPerMonth).toBe(Infinity)
    expect(limits.emailsPerMonth).toBe(Infinity)
    expect(limits.aiAdvisorChatsPerDay).toBe(Infinity)
  })

  it('неизвестный план → фолбэк на free', () => {
    const limits = getPlanLimits('unknown_plan')
    expect(limits.campaignsPerMonth).toBe(5)
    expect(limits.emailsPerMonth).toBe(500)
  })
})

// ── checkUsageLimit ──

describe('Лимиты плана > checkUsageLimit', () => {
  it('использование в пределах лимита → allowed: true', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: 'starter', status: 'active' })
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(100)

    const result = await checkUsageLimit('club-1', 'emails', 1)
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(100)
    expect(result.limit).toBe(2000)
    expect(result.remaining).toBe(1900)
    expect(result.plan).toBe('starter')
  })

  it('использование превышает лимит → allowed: false', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: 'starter', status: 'active' })
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(2000)

    const result = await checkUsageLimit('club-1', 'emails', 1)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('нет подписки → фолбэк на free план', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null)
    mockPrisma.aIRecommendationLog.groupBy.mockResolvedValue([])

    const result = await checkUsageLimit('club-1', 'campaigns', 1)
    expect(result.plan).toBe('free')
    expect(result.limit).toBe(5)
  })

  it('pro план + campaigns → Infinity, сразу allowed', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: 'pro', status: 'active' })

    const result = await checkUsageLimit('club-1', 'campaigns', 1)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(Infinity)
    expect(result.remaining).toBe(Infinity)
    // groupBy не должен вызываться при Infinity
    expect(mockPrisma.aIRecommendationLog.groupBy).not.toHaveBeenCalled()
  })
})

// ── campaigns counting ──

describe('Лимиты плана > Подсчёт кампаний', () => {
  it('группирует по type + date', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: 'free', status: 'active' })
    mockPrisma.aIRecommendationLog.groupBy.mockResolvedValue([
      { type: 'CHECK_IN', createdAt: new Date('2026-03-15T10:00:00') },
      { type: 'CHECK_IN', createdAt: new Date('2026-03-15T14:00:00') }, // same day+type → 1 campaign
      { type: 'RETENTION_BOOST', createdAt: new Date('2026-03-16T10:00:00') },
    ])

    const result = await checkUsageLimit('club-1', 'campaigns', 1)
    // 2 distinct campaigns: CHECK_IN-2026-03-15, RETENTION_BOOST-2026-03-16
    expect(result.used).toBe(2)
    expect(result.allowed).toBe(true) // 2 < 5
  })
})

// ── emails counting ──

describe('Лимиты плана > Подсчёт email', () => {
  it('фильтрует по channel email или both', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: 'starter', status: 'active' })
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(150)

    const result = await checkUsageLimit('club-1', 'emails', 1)
    expect(result.used).toBe(150)

    // Проверяем что count вызван с правильным фильтром channel
    const countCall = mockPrisma.aIRecommendationLog.count.mock.calls[0][0]
    expect(countCall.where.channel).toEqual({ in: ['email', 'both'] })
  })
})

// ── SMS counting ──

describe('Лимиты плана > Подсчёт SMS', () => {
  it('фильтрует по channel sms или both', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: 'starter', status: 'active' })
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(50)

    const result = await checkUsageLimit('club-1', 'sms', 1)
    expect(result.used).toBe(50)

    const countCall = mockPrisma.aIRecommendationLog.count.mock.calls[0][0]
    expect(countCall.where.channel).toEqual({ in: ['sms', 'both'] })
  })
})

// ── ai_advisor: daily limit ──

describe('Лимиты плана > AI Advisor: дневной лимит', () => {
  it('ai_advisor сбрасывается ежедневно (не ежемесячно)', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: 'starter', status: 'active' })
    mockPrisma.aIConversation.count.mockResolvedValue(5)

    const result = await checkUsageLimit('club-1', 'ai_advisor', 1)

    // Проверяем что period start = сегодня (начало дня), а не первое число месяца
    const countCall = mockPrisma.aIConversation.count.mock.calls[0][0]
    const periodStart = countCall.where.createdAt.gte as Date
    const now = new Date()
    expect(periodStart.getDate()).toBe(now.getDate())
    expect(periodStart.getHours()).toBe(0)
    expect(periodStart.getMinutes()).toBe(0)

    expect(result.used).toBe(5)
    expect(result.limit).toBe(20) // starter plan
  })
})
