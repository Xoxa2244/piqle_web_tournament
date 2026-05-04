/**
 * Sleeping-Reactivation Sequence — ENGAGE Segment #5 "Спящий".
 *
 * Tests:
 *   • Sequence shape (2 steps numbered 0, 1; Day 1 + Day 14)
 *   • Survey body renders 4 option links + bookingUrl + logId
 *   • createSleepingStep0 happy path + skip cases
 *   • Day 14 conditional exit when booked or survey-responded
 *   • Frequency cap respects sequence-aware semantics
 *   • Idempotency, dryRun, placeholder/demo email skip
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendOutreachEmail = vi.fn().mockResolvedValue({ success: true })
vi.mock('@/lib/email', () => ({
  sendOutreachEmail: (...args: any[]) => mockSendOutreachEmail(...args),
}))

const mockCheckAntiSpam = vi.fn().mockResolvedValue({ allowed: true })
vi.mock('@/lib/ai/anti-spam', () => ({
  checkAntiSpam: (...args: any[]) => mockCheckAntiSpam(...args),
}))

import {
  SLEEPING_STEPS,
  SLEEPING_SURVEY_OPTIONS,
  createSleepingStep0,
  processSleepingFollowUps,
} from '@/lib/ai/sleeping-sequence'

function createMockPrisma() {
  return {
    aIRecommendationLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'new-log-id' }),
      update: vi.fn().mockResolvedValue({}),
    },
    playSessionBooking: { count: vi.fn().mockResolvedValue(0) },
    microSurveyResponse: { count: vi.fn().mockResolvedValue(0) },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>
const CLUB_ID = 'club-1'
const CLUB_NAME = 'Test Club'

beforeEach(() => {
  mockPrisma = createMockPrisma()
  vi.clearAllMocks()
  mockCheckAntiSpam.mockResolvedValue({ allowed: true })
})

function makeCandidate(overrides: Partial<any> = {}) {
  return {
    userId: 'u-1',
    clubId: CLUB_ID,
    email: 'sleeper@example.com',
    name: 'Sample Sleeper',
    daysSinceLastBooking: 45,
    totalLifetimeBookings: 32,
    ...overrides,
  }
}

function makeSequenceLog(overrides: any) {
  const now = new Date()
  return {
    id: overrides.id ?? `log-${overrides.step ?? 0}`,
    clubId: CLUB_ID,
    userId: 'u-1',
    parentLogId: overrides.parentLogId ?? null,
    sequenceStep: overrides.step ?? 0,
    status: 'sent',
    createdAt: new Date(now.getTime() - (overrides.createdDaysAgo ?? 0) * 86400000),
    user: {
      id: 'u-1',
      email: overrides.email ?? 'sleeper@example.com',
      name: overrides.name ?? 'Sample Sleeper',
    },
  }
}

describe('SLEEPING_STEPS shape', () => {
  it('has exactly 2 steps numbered 0 and 1', () => {
    expect(SLEEPING_STEPS).toHaveLength(2)
    expect(SLEEPING_STEPS.map((s) => s.step)).toEqual([0, 1])
  })

  it('Day 1 fires immediately, Day 14 after 14d', () => {
    expect(SLEEPING_STEPS[0].delayDays).toBe(0)
    expect(SLEEPING_STEPS[1].delayDays).toBe(14)
  })

  it('Day 14 is conditional (skip if booked or responded)', () => {
    expect(SLEEPING_STEPS[0].conditional).toBeFalsy()
    expect(SLEEPING_STEPS[1].conditional).toBe(true)
  })
})

describe('SLEEPING_SURVEY_OPTIONS', () => {
  it('matches the 4-button spec (planschanged / time / schedule / other)', () => {
    expect([...SLEEPING_SURVEY_OPTIONS]).toEqual(['planschanged', 'time', 'schedule', 'other'])
  })
})

describe('createSleepingStep0', () => {
  it('happy path: writes log, sends email, returns logId', async () => {
    const result = await createSleepingStep0(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(result.status).toBe('sent')
    expect(result.logId).toBe('new-log-id')
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SLEEPING_REACTIVATION',
          sequenceStep: 0,
          channel: 'email',
          reasoning: expect.objectContaining({
            daysSinceLastBooking: 45,
            totalLifetimeBookings: 32,
          }),
        }),
      }),
    )
    expect(mockSendOutreachEmail).toHaveBeenCalledTimes(1)
  })

  it('passes isSequenceFollowUp=false on first contact (full cooldown)', async () => {
    await createSleepingStep0(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(mockCheckAntiSpam).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SLEEPING_REACTIVATION',
        isSequenceFollowUp: false,
      }),
    )
  })

  it('skip when frequency cap blocks', async () => {
    mockCheckAntiSpam.mockResolvedValue({ allowed: false, reason: 'opt-out' })
    const result = await createSleepingStep0(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('opt-out')
  })

  it('skip on missing email', async () => {
    const result = await createSleepingStep0(mockPrisma, makeCandidate({ email: '' }), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('no_email')
  })

  it('dryRun: no DB writes, no send', async () => {
    const result = await createSleepingStep0(mockPrisma, makeCandidate(), CLUB_NAME, true)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('dry_run')
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
  })

  it('marks log failed if email send throws', async () => {
    mockSendOutreachEmail.mockRejectedValueOnce(new Error('SMTP down'))
    const result = await createSleepingStep0(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('send_failed')
    expect(mockPrisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    )
  })
})

describe('processSleepingFollowUps > timing', () => {
  it('sends Day 14 (step 1) on day 14 from step 0 createdAt', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 14 }),
    ])
    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.sent).toBe(1)
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SLEEPING_REACTIVATION', sequenceStep: 1 }),
      }),
    )
  })

  it('does not send Day 14 on day 13', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 13 }),
    ])
    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.sent).toBe(0)
  })

  it('only walks step-0 logs (no step-1 follow-up exists)', async () => {
    // Step 1 logs should NOT trigger any further send — sleeping is only 2 steps.
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([])
    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.sent).toBe(0)
    // The findMany call should filter to step 0 only.
    expect(mockPrisma.aIRecommendationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sequenceStep: 0,
        }),
      }),
    )
  })
})

describe('processSleepingFollowUps > conditional exit', () => {
  it('exits when member booked after step 0', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 14 }),
    ])
    mockPrisma.playSessionBooking.count.mockResolvedValue(1)

    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.exited).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
    expect(mockPrisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reasoning: expect.objectContaining({ exitReason: 'booked' }),
        }),
      }),
    )
  })

  it('exits when survey response captured (against step 0 logId)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 14, id: 'log-0' }),
    ])
    mockPrisma.playSessionBooking.count.mockResolvedValue(0)
    mockPrisma.microSurveyResponse.count.mockResolvedValue(1)

    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.exited).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockPrisma.microSurveyResponse.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { logId: 'log-0' } }),
    )
  })
})

describe('processSleepingFollowUps > frequency cap + safeguards', () => {
  it('respects checkAntiSpam', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 14 }),
    ])
    mockCheckAntiSpam.mockResolvedValue({ allowed: false, reason: 'too many' })
    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockCheckAntiSpam).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SLEEPING_REACTIVATION', isSequenceFollowUp: true }),
    )
  })

  it('does not double-send if step 1 already exists', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 14 }),
    ])
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(1)
    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('skips placeholder/demo emails', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 14, email: 'placeholder-x@test.com' }),
    ])
    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('dryRun counts but does not send or write', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 14 }),
    ])
    const result = await processSleepingFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, true)
    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })
})
