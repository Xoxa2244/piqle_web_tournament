/**
 * Newcomer / Onboarding Sequence — 3-step welcome chain.
 *
 * Tests:
 *   • Timing: step 1 fires on Day 5, step 2 on Day 12 (per ENGAGE_MVP spec).
 *   • Idempotency: skip if next step already exists.
 *   • Email validity: skip placeholder / demo addresses.
 *   • Frequency cap: respect checkAntiSpam verdict.
 *   • Day 12 conditional: congrats variant if ≥1 booking, survey variant if 0.
 *   • dryRun: count but don't send.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks: side-effect modules ──

const mockSendOutreachEmail = vi.fn().mockResolvedValue({ success: true })

vi.mock('@/lib/email', () => ({
  sendOutreachEmail: (...args: any[]) => mockSendOutreachEmail(...args),
}))

const mockCheckAntiSpam = vi.fn().mockResolvedValue({ allowed: true })

vi.mock('@/lib/ai/anti-spam', () => ({
  checkAntiSpam: (...args: any[]) => mockCheckAntiSpam(...args),
}))

import {
  processOnboardingFollowUps,
  selectDay12Template,
  ONBOARDING_STEPS,
  DAY_12_TEMPLATES,
} from '@/lib/ai/onboarding-sequence'

// ── Mock Prisma ──

function createMockPrisma() {
  return {
    aIRecommendationLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'new-log-id' }),
    },
    playSessionBooking: {
      count: vi.fn().mockResolvedValue(0),
    },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

const CLUB_ID = 'club-123'
const CLUB_NAME = 'Test Club'

beforeEach(() => {
  mockPrisma = createMockPrisma()
  vi.clearAllMocks()
  mockCheckAntiSpam.mockResolvedValue({ allowed: true })
})

function makeSequenceLog(overrides: {
  step?: number
  createdDaysAgo?: number
  email?: string
  name?: string
  id?: string
}) {
  const now = new Date()
  return {
    id: overrides.id ?? `log-${overrides.step ?? 0}`,
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

// ── Pure unit tests ──

describe('selectDay12Template', () => {
  it('returns survey when member has 0 bookings (stalled — needs reason)', () => {
    expect(selectDay12Template(0)).toBe('survey')
  })

  it('returns congrats when member has 1+ bookings (engaged — celebrate)', () => {
    expect(selectDay12Template(1)).toBe('congrats')
    expect(selectDay12Template(3)).toBe('congrats')
    expect(selectDay12Template(50)).toBe('congrats')
  })
})

describe('ONBOARDING_STEPS shape (ENGAGE_MVP spec)', () => {
  it('has exactly 3 steps numbered 0, 1, 2', () => {
    expect(ONBOARDING_STEPS).toHaveLength(3)
    expect(ONBOARDING_STEPS.map((s) => s.step)).toEqual([0, 1, 2])
  })

  it('step 0 fires immediately (Day 0 — sent by event-detection on member join)', () => {
    expect(ONBOARDING_STEPS[0].delayDays).toBe(0)
  })

  it('step 1 fires on Day 5 (social proof nudge)', () => {
    expect(ONBOARDING_STEPS[1].delayDays).toBe(5)
  })

  it('step 2 fires on Day 12 and is conditional (congrats vs survey)', () => {
    expect(ONBOARDING_STEPS[2].delayDays).toBe(12)
    expect(ONBOARDING_STEPS[2].conditional).toBe(true)
  })
})

describe('DAY_12_TEMPLATES survey body', () => {
  it('renders 5 micro-survey option links pointing at /api/surveys/respond', () => {
    const body = DAY_12_TEMPLATES.survey.body(
      'Sol',
      'IPC East',
      'https://app.iqsport.ai/clubs/c/play',
      'https://app.iqsport.ai/api/surveys/respond',
      'log-abc',
    )
    expect(body).toContain('option=schedule')
    expect(body).toContain('option=level')
    expect(body).toContain('option=partners')
    expect(body).toContain('option=price')
    expect(body).toContain('option=other')
    // logId is critical — survey response endpoint joins on it for attribution.
    expect(body).toContain('logId=log-abc')
  })
})

// ── Integration tests for processOnboardingFollowUps ──

describe('processOnboardingFollowUps > timing', () => {
  it('sends step 1 on Day 5 (was Day 3 pre-ENGAGE)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5 }),
    ])

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(1)
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'NEW_MEMBER_WELCOME', sequenceStep: 1 }),
      }),
    )
  })

  it('does NOT send step 1 on Day 4 (one day too early)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 4 }),
    ])

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('sends step 2 on Day 12 (was Day 7 pre-ENGAGE)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 1, createdDaysAgo: 12 }),
    ])

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(1)
  })
})

describe('processOnboardingFollowUps > Day 12 conditional', () => {
  it('sends congrats variant when member has ≥1 booking', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 1, createdDaysAgo: 12 }),
    ])
    mockPrisma.playSessionBooking.count.mockResolvedValue(2) // engaged

    await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    const call = mockSendOutreachEmail.mock.calls[0][0]
    // Subject contains the congrats wording (great start emoji), not the survey.
    expect(call.subject).toMatch(/great start/i)
    expect(call.body).not.toContain('option=schedule')
    // Reasoning records which branch was taken — for attribution + dashboard.
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reasoning: expect.objectContaining({
            day12Variant: 'congrats',
            bookingsAtBranch: 2,
          }),
        }),
      }),
    )
  })

  it('sends survey variant when member has 0 bookings', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 1, createdDaysAgo: 12, id: 'log-survey-test' }),
    ])
    mockPrisma.playSessionBooking.count.mockResolvedValue(0) // stalled

    await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    const call = mockSendOutreachEmail.mock.calls[0][0]
    expect(call.subject).toMatch(/help/i)
    // Body must include all 5 micro-survey options + the logId for joining responses.
    expect(call.body).toContain('option=schedule')
    expect(call.body).toContain('option=other')
    expect(call.body).toContain('logId=log-survey-test')
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reasoning: expect.objectContaining({
            day12Variant: 'survey',
            bookingsAtBranch: 0,
          }),
        }),
      }),
    )
  })
})

describe('processOnboardingFollowUps > frequency cap', () => {
  it('skips send when checkAntiSpam returns not allowed (e.g. opt-out, weekly cap)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 6 }),
    ])
    mockCheckAntiSpam.mockResolvedValue({ allowed: false, reason: 'User opted out of notifications' })

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
  })

  it('passes isSequenceFollowUp=true to checkAntiSpam (relaxes cross-type cooldown)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 6 }),
    ])

    await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(mockCheckAntiSpam).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        clubId: CLUB_ID,
        type: 'NEW_MEMBER_WELCOME',
        isSequenceFollowUp: true,
      }),
    )
  })
})

describe('processOnboardingFollowUps > existing safeguards still hold', () => {
  it('does not double-send if next step already exists', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 6 }),
    ])
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(1) // step 1 already there

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('skips placeholder + demo email addresses', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 6, email: 'user-placeholder@test.com' }),
    ])

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('dryRun: counts but does not send or write logs', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 6 }),
    ])

    const result = await processOnboardingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, true)

    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
  })
})
