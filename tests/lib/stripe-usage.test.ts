import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Prisma ──

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    aIRecommendationLog: { count: vi.fn() },
    aIConversation: { count: vi.fn() },
  },
}))

// ── Mock Stripe ──

const mockMeterEventsCreate = vi.fn().mockResolvedValue({})

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    billing: {
      meterEvents: {
        create: mockMeterEventsCreate,
      },
    },
  }),
}))

import { prisma } from '@/lib/prisma'
import { reportUsage, getUsageSummary } from '@/lib/stripe-usage'

const mockPrisma = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.subscription.findUnique.mockResolvedValue(null)
  mockPrisma.aIRecommendationLog.count.mockResolvedValue(0)
  mockPrisma.aIConversation.count.mockResolvedValue(0)
})

// ── reportUsage ──

describe('Stripe Usage > reportUsage', () => {
  it('в пределах плана → НЕ вызывает stripe (нет overage)', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'starter',
    })
    // starter includes 2000 emails, current usage is 100
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(100)

    await reportUsage('club-1', 'email', 1)

    expect(mockMeterEventsCreate).not.toHaveBeenCalled()
  })

  it('превышает лимит плана → вызывает stripe billing.meterEvents.create', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'starter',
    })
    // starter includes 2000 emails, current usage = 2000 (already at limit)
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(2000)

    await reportUsage('club-1', 'email', 5)

    expect(mockMeterEventsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'email_send',
        payload: expect.objectContaining({
          stripe_customer_id: 'cus_123',
        }),
      }),
    )
  })

  it('нет stripeCustomerId → тихо возвращается', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      plan: 'starter',
    })

    await reportUsage('club-1', 'email', 1)

    expect(mockMeterEventsCreate).not.toHaveBeenCalled()
  })

  it('нет подписки → тихо возвращается', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null)

    await reportUsage('club-1', 'email', 1)

    expect(mockMeterEventsCreate).not.toHaveBeenCalled()
  })

  it('ошибка stripe → не выбрасывает исключение (non-blocking)', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'starter',
    })
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(2000)
    mockMeterEventsCreate.mockRejectedValue(new Error('Stripe API error'))

    // Не должно выбросить ошибку
    await expect(reportUsage('club-1', 'email', 5)).resolves.toBeUndefined()
  })
})

// ── getUsageSummary ──

describe('Stripe Usage > getUsageSummary', () => {
  it('возвращает правильные used/included/overage для каждого ресурса', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: 'starter' })
    // email=150, sms=120, ai=10
    mockPrisma.aIRecommendationLog.count
      .mockResolvedValueOnce(150)   // email
      .mockResolvedValueOnce(120)   // sms
    mockPrisma.aIConversation.count.mockResolvedValue(10)

    const summary = await getUsageSummary('club-1')

    expect(summary.plan).toBe('starter')
    expect(summary.email).toEqual({ used: 150, included: 2000, overage: 0 })
    expect(summary.sms).toEqual({ used: 120, included: 100, overage: 20 })
    expect(summary.ai).toEqual({ used: 10, included: 200, overage: 0 })
  })

  it('нет подписки → фолбэк на free план', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null)
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(0)
    mockPrisma.aIConversation.count.mockResolvedValue(0)

    const summary = await getUsageSummary('club-1')
    expect(summary.plan).toBe('free')
    expect(summary.email.included).toBe(500)
    expect(summary.sms.included).toBe(0)
    expect(summary.ai.included).toBe(50)
  })
})
