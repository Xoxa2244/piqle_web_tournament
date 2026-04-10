/**
 * Onboarding Sequence — цепочка приветственных писем новым участникам
 *
 * Тестирует processOnboardingFollowUps: задержки между шагами,
 * дедупликацию, фильтрацию placeholder email, dryRun режим.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock email ──

const mockSendOutreachEmail = vi.fn().mockResolvedValue({ success: true })

vi.mock('@/lib/email', () => ({
  sendOutreachEmail: (...args: any[]) => mockSendOutreachEmail(...args),
}))

import { processOnboardingFollowUps } from '@/lib/ai/onboarding-sequence'

// ── Mock Prisma ──

function createMockPrisma() {
  return {
    aIRecommendationLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'new-log-id' }),
    },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

const CLUB_ID = 'club-123'
const CLUB_NAME = 'Test Club'

beforeEach(() => {
  mockPrisma = createMockPrisma()
  vi.clearAllMocks()
})

function makeSequenceLog(overrides: {
  step?: number
  createdDaysAgo?: number
  email?: string
  name?: string
}) {
  const now = new Date()
  return {
    id: `log-${overrides.step ?? 0}`,
    clubId: CLUB_ID,
    userId: 'user-1',
    sequenceStep: overrides.step ?? 0,
    status: 'sent',
    createdAt: new Date(now.getTime() - (overrides.createdDaysAgo ?? 0) * 86400000),
    user: {
      id: 'user-1',
      email: overrides.email ?? 'member@example.com',
      name: overrides.name ?? 'John Doe',
    },
  }
}

describe('Onboarding Sequence > processOnboardingFollowUps', () => {
  it('отправляет step 1 через 3 дня после step 0', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 4 }),
    ])
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(0) // step 1 not sent yet

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(1)
    expect(mockSendOutreachEmail).toHaveBeenCalledTimes(1)
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'NEW_MEMBER_WELCOME',
          sequenceStep: 1,
        }),
      }),
    )
  })

  it('НЕ отправляет step 1 если прошел только 1 день', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 1 }),
    ])

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('НЕ отправляет если шаг уже отправлен (дедупликация)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5 }),
    ])
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(1) // step 1 already sent

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('пропускает placeholder и demo email адреса', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 4, email: 'user-placeholder@test.com' }),
    ])
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(0)

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('dryRun режим: считает но не отправляет', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 4 }),
    ])
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(0)

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, true)

    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
  })
})
