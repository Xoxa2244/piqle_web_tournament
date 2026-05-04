/**
 * Birthday Gift Offer — ENGAGE Segment #8.
 *
 * Tests:
 *   • BIRTHDAY_GIFT_OPTIONS shape (3 hardcoded options)
 *   • sendBirthdayGiftOffer happy path + skip cases
 *   • Frequency cap (full cooldown — first contact, not sequence step)
 *   • Email body contains all 3 gift links + logId
 *   • dryRun, missing email, send-failed marks log failed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendOutreachEmail = vi.fn().mockResolvedValue({ success: true, messageId: 'msg-1' })
vi.mock('@/lib/email', () => ({
  sendOutreachEmail: (...args: any[]) => mockSendOutreachEmail(...args),
}))

const mockCheckAntiSpam = vi.fn().mockResolvedValue({ allowed: true })
vi.mock('@/lib/ai/anti-spam', () => ({
  checkAntiSpam: (...args: any[]) => mockCheckAntiSpam(...args),
}))

import {
  BIRTHDAY_GIFT_OPTIONS,
  sendBirthdayGiftOffer,
} from '@/lib/ai/birthday-gift'

function createMockPrisma() {
  return {
    aIRecommendationLog: {
      create: vi.fn().mockResolvedValue({ id: 'new-log-id' }),
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>
const CLUB_NAME = 'Test Club'

beforeEach(() => {
  mockPrisma = createMockPrisma()
  vi.clearAllMocks()
  mockCheckAntiSpam.mockResolvedValue({ allowed: true })
})

function makeCandidate(overrides: Partial<any> = {}) {
  return {
    userId: 'u-1',
    clubId: 'club-1',
    email: 'birthday@example.com',
    name: 'Test User',
    birthdayThisYear: '2026-05-10',
    ...overrides,
  }
}

describe('BIRTHDAY_GIFT_OPTIONS', () => {
  it('locked at 3 options: week / pass / merch', () => {
    expect([...BIRTHDAY_GIFT_OPTIONS]).toEqual(['gift_week', 'gift_pass', 'gift_merch'])
  })
})

describe('sendBirthdayGiftOffer', () => {
  it('happy path: writes log, sends email, returns logId', async () => {
    const result = await sendBirthdayGiftOffer(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(result.status).toBe('sent')
    expect(result.logId).toBe('new-log-id')
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'BIRTHDAY_GIFT_OFFER',
          sequenceStep: 0,
          channel: 'email',
          reasoning: expect.objectContaining({
            birthdayThisYear: '2026-05-10',
          }),
        }),
      }),
    )
    expect(mockSendOutreachEmail).toHaveBeenCalledTimes(1)
  })

  it('first-contact uses isSequenceFollowUp=false (full cooldown)', async () => {
    await sendBirthdayGiftOffer(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(mockCheckAntiSpam).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BIRTHDAY_GIFT_OFFER',
        isSequenceFollowUp: false,
      }),
    )
  })

  it('email body (plain text) lists 3 gift options + logId', async () => {
    await sendBirthdayGiftOffer(mockPrisma, makeCandidate(), CLUB_NAME, false)
    const sendCall = mockSendOutreachEmail.mock.calls[0][0]
    expect(sendCall.body).toContain('option=gift_week')
    expect(sendCall.body).toContain('option=gift_pass')
    expect(sendCall.body).toContain('option=gift_merch')
    expect(sendCall.body).toContain('logId=new-log-id')
  })

  it('HTML body override has the 3 gift buttons', async () => {
    await sendBirthdayGiftOffer(mockPrisma, makeCandidate(), CLUB_NAME, false)
    const sendCall = mockSendOutreachEmail.mock.calls[0][0]
    expect(sendCall.bodyHtmlOverride).toContain('option=gift_week')
    expect(sendCall.bodyHtmlOverride).toContain('option=gift_pass')
    expect(sendCall.bodyHtmlOverride).toContain('option=gift_merch')
    expect(sendCall.bodyHtmlOverride).toContain('Pick your gift')
    expect(sendCall.suppressDefaultCta).toBe(true)
  })

  it('subject mentions birthday + name', async () => {
    await sendBirthdayGiftOffer(mockPrisma, makeCandidate({ name: 'Anna Petrova' }), CLUB_NAME, false)
    const sendCall = mockSendOutreachEmail.mock.calls[0][0]
    expect(sendCall.subject).toContain('Anna')
    expect(sendCall.subject).toMatch(/birthday/i)
  })

  it('falls back to "friend" when no name', async () => {
    await sendBirthdayGiftOffer(mockPrisma, makeCandidate({ name: null }), CLUB_NAME, false)
    const sendCall = mockSendOutreachEmail.mock.calls[0][0]
    expect(sendCall.subject).toContain('friend')
  })

  it('skip when frequency cap blocks', async () => {
    mockCheckAntiSpam.mockResolvedValue({ allowed: false, reason: 'opt-out' })
    const result = await sendBirthdayGiftOffer(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('opt-out')
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('skip on missing email', async () => {
    const result = await sendBirthdayGiftOffer(mockPrisma, makeCandidate({ email: '' }), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('no_email')
  })

  it('dryRun: no DB writes, no send', async () => {
    const result = await sendBirthdayGiftOffer(mockPrisma, makeCandidate(), CLUB_NAME, true)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('dry_run')
    expect(mockPrisma.aIRecommendationLog.create).not.toHaveBeenCalled()
  })

  it('marks log failed when send throws', async () => {
    mockSendOutreachEmail.mockRejectedValueOnce(new Error('SMTP down'))
    const result = await sendBirthdayGiftOffer(mockPrisma, makeCandidate(), CLUB_NAME, false)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('send_failed')
    expect(mockPrisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    )
  })
})
