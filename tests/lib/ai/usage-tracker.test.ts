/**
 * AI Usage Tracker — cost calculation + budget enforcement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──

const {
  mockUsageCreate,
  mockClubUpdate,
  mockClubFindUnique,
} = vi.hoisted(() => ({
  mockUsageCreate: vi.fn().mockResolvedValue({ id: 'usage-1' }),
  mockClubUpdate: vi.fn().mockResolvedValue({}),
  mockClubFindUnique: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIUsageLog: { create: mockUsageCreate },
    club: {
      update: mockClubUpdate,
      findUnique: mockClubFindUnique,
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import {
  calculateCost,
  trackUsage,
  checkAIBudget,
  resetMonthlySpendIfNeeded,
} from '@/lib/ai/llm/usage-tracker'

beforeEach(() => {
  vi.clearAllMocks()
  mockUsageCreate.mockResolvedValue({ id: 'usage-1' })
  mockClubUpdate.mockResolvedValue({})
})

// ── calculateCost ──

describe('calculateCost', () => {
  it('GPT-4o-mini: 1000 prompt + 500 completion tokens', () => {
    // (1000 / 1M) * 0.15 + (500 / 1M) * 0.6 = 0.00015 + 0.0003 = 0.00045
    const cost = calculateCost('gpt-4o-mini', 1000, 500)
    expect(cost).toBeCloseTo(0.00045, 6)
  })

  it('GPT-4o: 2000 prompt + 1000 completion tokens', () => {
    // (2000/1M)*2.5 + (1000/1M)*10 = 0.005 + 0.01 = 0.015
    const cost = calculateCost('gpt-4o', 2000, 1000)
    expect(cost).toBeCloseTo(0.015, 6)
  })

  it('embedding model: only counts input, output always 0', () => {
    const cost = calculateCost('text-embedding-3-small', 10000, 0)
    expect(cost).toBeCloseTo(0.0002, 6)
  })

  it('unknown model returns 0 (tracked but not priced)', () => {
    expect(calculateCost('unknown-model-xyz', 1000, 500)).toBe(0)
  })

  it('zero tokens returns 0', () => {
    expect(calculateCost('gpt-4o', 0, 0)).toBe(0)
  })
})

// ── trackUsage ──

describe('trackUsage', () => {
  it('creates usage log AND increments club spend', async () => {
    await trackUsage({
      clubId: 'club-1',
      model: 'gpt-4o-mini',
      operation: 'advisor_chat',
      promptTokens: 1000,
      completionTokens: 500,
    })

    expect(mockUsageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clubId: 'club-1',
          model: 'gpt-4o-mini',
          operation: 'advisor_chat',
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
        }),
      }),
    )
    expect(mockClubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'club-1' },
        data: { aiSpendCurrentMonth: expect.objectContaining({ increment: expect.any(Number) }) },
      }),
    )
  })

  it('skips club update when cost is 0 (unknown model)', async () => {
    await trackUsage({
      clubId: 'club-1',
      model: 'unknown-model',
      operation: 'test',
      promptTokens: 100,
      completionTokens: 50,
    })

    expect(mockUsageCreate).toHaveBeenCalled()
    expect(mockClubUpdate).not.toHaveBeenCalled()
  })

  it('swallows errors — does not break business logic on tracking failure', async () => {
    mockUsageCreate.mockRejectedValueOnce(new Error('DB down'))

    // Should NOT throw
    await expect(
      trackUsage({
        clubId: 'club-1',
        model: 'gpt-4o-mini',
        operation: 'advisor_chat',
        promptTokens: 100,
        completionTokens: 50,
      }),
    ).resolves.toBeUndefined()
  })
})

// ── checkAIBudget ──

describe('checkAIBudget', () => {
  it('null budget → unlimited (Infinity remaining)', async () => {
    mockClubFindUnique.mockResolvedValue({
      aiMonthlyBudgetUsd: null,
      aiSpendCurrentMonth: 5.0,
    })

    const result = await checkAIBudget('club-1')
    expect(result.allowed).toBe(true)
    expect(result.remainingUsd).toBe(Infinity)
    expect(result.budgetUsd).toBeNull()
  })

  it('budget with remaining → allowed', async () => {
    mockClubFindUnique.mockResolvedValue({
      aiMonthlyBudgetUsd: 50.0,
      aiSpendCurrentMonth: 30.0,
    })

    const result = await checkAIBudget('club-1')
    expect(result.allowed).toBe(true)
    expect(result.remainingUsd).toBeCloseTo(20.0, 2)
  })

  it('spent >= budget → blocked', async () => {
    mockClubFindUnique.mockResolvedValue({
      aiMonthlyBudgetUsd: 50.0,
      aiSpendCurrentMonth: 50.01,
    })

    const result = await checkAIBudget('club-1')
    expect(result.allowed).toBe(false)
    expect(result.remainingUsd).toBeLessThan(0)
    expect(result.reason).toContain('budget')
  })

  it('exactly at budget → blocked (remaining = 0)', async () => {
    mockClubFindUnique.mockResolvedValue({
      aiMonthlyBudgetUsd: 50.0,
      aiSpendCurrentMonth: 50.0,
    })

    const result = await checkAIBudget('club-1')
    expect(result.allowed).toBe(false)
    expect(result.remainingUsd).toBe(0)
  })

  it('club not found → blocked', async () => {
    mockClubFindUnique.mockResolvedValue(null)

    const result = await checkAIBudget('club-does-not-exist')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('not found')
  })
})

// ── resetMonthlySpendIfNeeded ──

describe('resetMonthlySpendIfNeeded', () => {
  it('same month → no reset', async () => {
    const now = new Date()
    mockClubFindUnique.mockResolvedValue({
      aiSpendMonthStart: new Date(now.getUTCFullYear(), now.getUTCMonth(), 5),
    })

    const reset = await resetMonthlySpendIfNeeded('club-1')
    expect(reset).toBe(false)
    expect(mockClubUpdate).not.toHaveBeenCalled()
  })

  it('different month → resets to 0 and updates start date', async () => {
    const now = new Date()
    const lastMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)
    mockClubFindUnique.mockResolvedValue({ aiSpendMonthStart: lastMonth })

    const reset = await resetMonthlySpendIfNeeded('club-1')
    expect(reset).toBe(true)
    expect(mockClubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'club-1' },
        data: expect.objectContaining({ aiSpendCurrentMonth: 0 }),
      }),
    )
  })

  it('club not found → no reset, returns false', async () => {
    mockClubFindUnique.mockResolvedValue(null)
    const reset = await resetMonthlySpendIfNeeded('club-x')
    expect(reset).toBe(false)
  })
})
