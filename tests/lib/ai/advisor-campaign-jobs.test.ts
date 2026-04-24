import { beforeEach, describe, expect, it, vi } from 'vitest'

// SMS path runs `generateUnsubscribeUrl`, which reads CRON_SECRET at call
// time. Without this the SMS branch throws before sendSms is invoked and
// the test sees 0 calls instead of the expected 1 (see lib/unsubscribe.ts).
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret'

const { sendOutreachEmail, sendSms, reportUsage, appendSmsOptOut } = vi.hoisted(() => ({
  sendOutreachEmail: vi.fn(),
  sendSms: vi.fn(),
  reportUsage: vi.fn(),
  // advisor-campaign-jobs wraps every SMS body via appendSmsOptOut from
  // the same module — mock both or the SMS branch throws before sendSms
  // is reached.
  appendSmsOptOut: vi.fn((body: string, url: string) => `${body} Reply STOP to opt out: ${url}`),
}))

vi.mock('@/lib/email', () => ({
  sendOutreachEmail,
}))

vi.mock('@/lib/sms', () => ({
  sendSms,
  appendSmsOptOut,
}))

vi.mock('@/lib/stripe-usage', () => ({
  reportUsage,
}))

import { processScheduledAdvisorCampaigns, sendCampaignNow } from '@/lib/ai/advisor-campaign-jobs'

function createMockPrisma() {
  return {
    club: {
      findUnique: vi.fn().mockResolvedValue({ id: 'club-1', name: 'IQ Club', automationSettings: {} }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    playSessionBooking: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userPlayPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    aIRecommendationLog: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma = createMockPrisma()
  sendOutreachEmail.mockResolvedValue({ messageId: 'email-1' })
  sendSms.mockResolvedValue({ sid: 'sms-1' })
  reportUsage.mockResolvedValue(undefined)
})

describe('advisor campaign jobs', () => {
  it('respects per-recipient channel overrides when sending immediately', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'member-1', email: 'alex@example.com', name: 'Alex', phone: null, smsOptIn: false },
      { id: 'member-2', email: 'sam@example.com', name: 'Sam', phone: '+155555501', smsOptIn: true },
    ])

    const result = await sendCampaignNow(mockPrisma, {
      clubId: 'club-1',
      type: 'CHECK_IN',
      channel: 'both',
      memberIds: ['member-1', 'member-2'],
      recipients: [
        { memberId: 'member-1', channel: 'email' },
        { memberId: 'member-2', channel: 'sms' },
      ],
      subject: 'Check in',
      body: 'Hi {{name}}',
      smsBody: 'Hi {{name}}',
    })

    expect(sendOutreachEmail).toHaveBeenCalledTimes(1)
    expect(sendOutreachEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alex@example.com' }))
    expect(sendSms).toHaveBeenCalledTimes(1)
    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: '+155555501' }))
    expect(result.sent).toBe(2)
    expect(result.emailSent).toBe(1)
    expect(result.smsSent).toBe(1)
    expect(mockPrisma.aIRecommendationLog.create).toHaveBeenCalledTimes(2)
  })

  it('re-checks guardrails before scheduled campaign delivery', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'log-1' }])
    mockPrisma.aIRecommendationLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        clubId: 'club-1',
        userId: 'member-1',
        type: 'CHECK_IN',
        channel: 'email',
        sessionId: null,
        reasoning: {
          source: 'advisor_scheduled_campaign',
          subject: 'Check in',
          body: 'Hi {{name}}',
          timeZone: 'America/Los_Angeles',
        },
        user: {
          id: 'member-1',
          email: 'alex@example.com',
          name: 'Alex',
          phone: null,
          smsOptIn: false,
        },
        club: {
          id: 'club-1',
          name: 'IQ Club',
          automationSettings: {},
        },
      },
    ])
    mockPrisma.aIRecommendationLog.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'member-1', email: 'alex@example.com', name: 'Alex', phone: null, smsOptIn: false },
    ])
    mockPrisma.aIRecommendationLog.count.mockResolvedValueOnce(2)

    const result = await processScheduledAdvisorCampaigns(mockPrisma, { limit: 10 })

    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(sendOutreachEmail).not.toHaveBeenCalled()
    expect(mockPrisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-1' },
        data: expect.objectContaining({
          status: 'skipped',
        }),
      }),
    )
  })
})
