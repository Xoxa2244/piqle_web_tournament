/**
 * Declining-Activity Sequence — ENGAGE Segment #4 "Снижение активности".
 *
 * Tests:
 *   • Day 1 / Day 5 / Day 12 timing
 *   • Conditional Day 5/12 exit when member booked or responded to survey
 *   • Frequency cap respected (sequence-aware)
 *   • Day 1 createDecliningStep0 happy path + skip cases
 *   • Survey email body contains all 4 option links
 *   • Email validity gate (placeholder/demo skipped)
 *   • dryRun
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──

const mockSendOutreachEmail = vi.fn().mockResolvedValue({ success: true })
vi.mock('@/lib/email', () => ({
  sendOutreachEmail: (...args: any[]) => mockSendOutreachEmail(...args),
}))

const mockCheckAntiSpam = vi.fn().mockResolvedValue({ allowed: true })
vi.mock('@/lib/ai/anti-spam', () => ({
  checkAntiSpam: (...args: any[]) => mockCheckAntiSpam(...args),
}))

const mockGenerateRecs = vi.fn().mockReturnValue([{ score: 75 }])
vi.mock('@/lib/ai/slot-filler', () => ({
  generateSlotFillerRecommendations: (...args: any[]) => mockGenerateRecs(...args),
}))

import {
  DECLINING_STEPS,
  DECLINING_SURVEY_OPTIONS,
  createDecliningStep0,
  processDecliningFollowUps,
} from '@/lib/ai/declining-sequence'

// ── Mock Prisma ──

function createMockPrisma() {
  return {
    aIRecommendationLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'new-log-id' }),
      update: vi.fn().mockResolvedValue({}),
    },
    playSessionBooking: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    playSession: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'u-1', email: 'm@x.com', name: 'Max', duprRatingDoubles: 3.5 }),
    },
    userPlayPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    microSurveyResponse: {
      count: vi.fn().mockResolvedValue(0),
    },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

const CLUB_ID = 'club-1'
const CLUB_NAME = 'Test Club'

beforeEach(() => {
  mockPrisma = createMockPrisma()
  vi.clearAllMocks()
  mockCheckAntiSpam.mockResolvedValue({ allowed: true })
  mockGenerateRecs.mockReturnValue([{ score: 75 }])
})

function makeCandidate(overrides: Partial<any> = {}) {
  return {
    userId: 'u-1',
    clubId: CLUB_ID,
    email: 'member@example.com',
    name: 'Sample Player',
    recentBookings: 0,
    historicalAvgPerMonth: 4.5,
    daysSinceLastBooking: 18,
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
      email: overrides.email ?? 'member@example.com',
      name: overrides.name ?? 'Sample Player',
    },
  }
}

// ── Pure / shape tests ──

describe('DECLINING_STEPS shape (ENGAGE_MVP spec)', () => {
  it('has exactly 3 steps numbered 0, 1, 2', () => {
    expect(DECLINING_STEPS).toHaveLength(3)
    expect(DECLINING_STEPS.map((s) => s.step)).toEqual([0, 1, 2])
  })

  it('Day 1 fires immediately, Day 5 after 5d, Day 12 after 12d', () => {
    expect(DECLINING_STEPS[0].delayDays).toBe(0)
    expect(DECLINING_STEPS[1].delayDays).toBe(5)
    expect(DECLINING_STEPS[2].delayDays).toBe(12)
  })

  it('Day 5 and Day 12 are conditional (skipped if booked or responded)', () => {
    expect(DECLINING_STEPS[0].conditional).toBeFalsy()
    expect(DECLINING_STEPS[1].conditional).toBe(true)
    expect(DECLINING_STEPS[2].conditional).toBe(true)
  })
})

describe('DECLINING_SURVEY_OPTIONS', () => {
  it('matches the 4-button spec from ENGAGE_MVP', () => {
    expect([...DECLINING_SURVEY_OPTIONS]).toEqual(['injury', 'busy', 'schedule', 'pause'])
  })
})

describe('Day 1 email body renders 4 option links + bookingUrl + logId', () => {
  it('all 4 options point at /api/surveys/respond with logId', () => {
    const body = DECLINING_STEPS[0].body('Sol', 'IPC East', {
      bookingUrl: 'https://app.iqsport.ai/clubs/c/play',
      surveyBaseUrl: 'https://app.iqsport.ai/api/surveys/respond',
      logId: 'log-abc',
    })
    expect(body).toContain('option=injury')
    expect(body).toContain('option=busy')
    expect(body).toContain('option=schedule')
    expect(body).toContain('option=pause')
    expect(body).toContain('logId=log-abc')
    expect(body).toContain('https://app.iqsport.ai/clubs/c/play')
  })
})

// ── createDecliningStep0 ──

describe('createDecliningStep0', () => {
  it('happy path: writes log, sends email, returns logId', async () => {
    const candidate = makeCandidate()
    const result = await createDecliningStep0(mockPrisma, candidate, CLUB_NAME, false)

    expect(result.status).toBe('sent')
    expect(result.logId).toBe('new-log-id')
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'DECLINING_REACTIVATION',
          sequenceStep: 0,
          channel: 'email',
          reasoning: expect.objectContaining({
            recentBookings: 0,
            historicalAvgPerMonth: 4.5,
            daysSinceLastBooking: 18,
          }),
        }),
      }),
    )
    expect(mockSendOutreachEmail).toHaveBeenCalledTimes(1)
  })

  it('passes isSequenceFollowUp=false for the first contact (full cooldown enforced)', async () => {
    await createDecliningStep0(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(mockCheckAntiSpam).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DECLINING_REACTIVATION',
        isSequenceFollowUp: false,
      }),
    )
  })

  it('skip when frequency cap blocks (e.g. opt-out)', async () => {
    mockCheckAntiSpam.mockResolvedValue({ allowed: false, reason: 'opt-out' })
    const result = await createDecliningStep0(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('opt-out')
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('skip when no email', async () => {
    const result = await createDecliningStep0(mockPrisma, makeCandidate({ email: '' }), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('no_email')
  })

  it('dryRun: no DB writes, no email send', async () => {
    const result = await createDecliningStep0(mockPrisma, makeCandidate(), CLUB_NAME, true)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('dry_run')
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('marks log as failed if email send throws', async () => {
    mockSendOutreachEmail.mockRejectedValueOnce(new Error('SMTP down'))
    const result = await createDecliningStep0(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('send_failed')
    expect(mockPrisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })
})

// ── processDecliningFollowUps ──

describe('processDecliningFollowUps > timing', () => {
  it('sends Day 5 (step 1) on day 5', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5 }),
    ])

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(1)
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DECLINING_REACTIVATION', sequenceStep: 1 }),
      }),
    )
  })

  it('does not send Day 5 on day 4 (too early)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 4 }),
    ])

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('sends Day 12 (step 2) on day 12 from step 1 root', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 1, createdDaysAgo: 12, parentLogId: 'log-0' }),
    ])

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)
    expect(result.sent).toBe(1)
  })
})

describe('processDecliningFollowUps > conditional exit', () => {
  it('exits when member made a booking after step 0', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5 }),
    ])
    mockPrisma.playSessionBooking.count.mockResolvedValue(1)

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

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

  it('exits when member responded to survey', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5, id: 'log-0' }),
    ])
    mockPrisma.playSessionBooking.count.mockResolvedValue(0)
    mockPrisma.microSurveyResponse.count.mockResolvedValue(1)

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.exited).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockPrisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reasoning: expect.objectContaining({ exitReason: 'survey_responded' }),
        }),
      }),
    )
  })

  it('Day 12: looks at survey response on PARENT log id (root step 0), not step 1 itself', async () => {
    // Step 1 row, parent = step 0 = where the survey was attached
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 1, createdDaysAgo: 12, id: 'log-1', parentLogId: 'log-0' }),
    ])
    mockPrisma.playSessionBooking.count.mockResolvedValue(0)
    mockPrisma.microSurveyResponse.count.mockResolvedValue(1)

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.exited).toBe(1)
    expect(mockPrisma.microSurveyResponse.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { logId: 'log-0' } }),
    )
  })
})

describe('processDecliningFollowUps > frequency cap + safeguards', () => {
  it('respects checkAntiSpam (still uses isSequenceFollowUp=true for follow-ups)', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5 }),
    ])
    mockCheckAntiSpam.mockResolvedValue({ allowed: false, reason: 'too many emails this week' })

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockCheckAntiSpam).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DECLINING_REACTIVATION', isSequenceFollowUp: true }),
    )
  })

  it('does not double-send if next step already exists', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5 }),
    ])
    mockPrisma.aIRecommendationLog.count.mockResolvedValue(1) // step 1 exists

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('skips placeholder/demo emails', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5, email: 'placeholder-x@test.com' }),
    ])

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, false)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('dryRun counts but does not send or write', async () => {
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      makeSequenceLog({ step: 0, createdDaysAgo: 5 }),
    ])

    const result = await processDecliningFollowUps(mockPrisma, CLUB_ID, CLUB_NAME, true)

    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
  })
})
