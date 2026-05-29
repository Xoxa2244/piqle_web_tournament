import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendOutreachEmail, sendSms } = vi.hoisted(() => ({
  sendOutreachEmail: vi.fn(),
  sendSms: vi.fn(),
}))

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return {
    ...actual,
    sendOutreachEmail,
  }
})

vi.mock('@/lib/sms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sms')>()
  return {
    ...actual,
    sendSms,
  }
})

import { runCampaignSendTick } from '@/lib/campaign-send-runner'

function createMockPrisma() {
  return {
    campaign: {
      findMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    club: {
      findUnique: vi.fn(),
    },
    clubCohort: {
      findUnique: vi.fn(),
    },
    playSessionBooking: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    aIRecommendationLog: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
  }
}

function makeSequenceCampaign(overrides?: Partial<any>) {
  return {
    id: 'campaign-1',
    clubId: 'club-1',
    name: 'Win back',
    subject: 'Step 1',
    body: 'Hello',
    cohortSnapshot: {
      userIds: ['member-1'],
      sendFormat: 'sequence',
      steps: [
        { stepIndex: 0, delayDays: 0, subject: 'Step 1', body: 'Hello' },
        { stepIndex: 1, delayDays: 1, delayMinutes: 17, subject: 'Step 2', body: 'Follow up' },
      ],
    },
    ctaLabel: null,
    ctaUrl: null,
    format: 'sequence',
    steps: [
      { stepIndex: 0, delayDays: 0, subject: 'Step 1', body: 'Hello' },
      { stepIndex: 1, delayDays: 1, delayMinutes: 17, subject: 'Step 2', body: 'Follow up' },
    ],
    exitOnBooking: true,
    cohortId: null,
    cronExpression: null,
    recurringTimezone: null,
    lastRecurringRun: null,
    channels: ['email'],
    status: 'running',
    scheduledAt: null,
    launchedAt: null,
    club: {
      id: 'club-1',
      automationSettings: { intelligence: { agentLive: true } },
    },
    ...overrides,
  }
}

function makeOneTimeCampaign(overrides?: Partial<any>) {
  return {
    id: 'campaign-1',
    clubId: 'club-1',
    name: 'Retention boost',
    subject: 'Come back',
    body: 'Hey {{first_name}}, we saved a spot for you.',
    cohortSnapshot: {
      userIds: ['member-1'],
      sendFormat: 'one_time',
    },
    ctaLabel: null,
    ctaUrl: null,
    format: 'one_time',
    steps: null,
    exitOnBooking: true,
    cohortId: null,
    cronExpression: null,
    recurringTimezone: null,
    lastRecurringRun: null,
    channels: ['email'],
    status: 'running',
    scheduledAt: null,
    launchedAt: null,
    club: {
      id: 'club-1',
      automationSettings: { intelligence: { agentLive: true } },
    },
    ...overrides,
  }
}

describe('campaign send runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    sendOutreachEmail.mockResolvedValue({ messageId: 'msg-1' })
    sendSms.mockResolvedValue({ status: 'queued', sid: 'sms-1' })
  })

  it('queues follow-up using the arbitrary minute delay from the wizard', async () => {
    const prisma = createMockPrisma()
    const dueAt = new Date('2026-05-13T10:00:00.000Z')
    const scheduledCampaign = makeSequenceCampaign({
      status: 'scheduled',
      scheduledAt: dueAt,
    })
    const runningCampaign = makeSequenceCampaign({
      status: 'running',
      scheduledAt: dueAt,
      launchedAt: dueAt,
    })

    prisma.campaign.findMany.mockResolvedValue([scheduledCampaign])
    prisma.campaign.update
      .mockResolvedValueOnce(runningCampaign)
      .mockResolvedValueOnce({})
    prisma.aIRecommendationLog.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'log-1', userId: 'member-1', retry_count: 0, sequence_step: 0, parent_log_id: null, scheduled_for: dueAt },
    ])
    prisma.user.findMany.mockResolvedValue([
      { id: 'member-1', email: 'member@clubmail.com', name: 'Member One' },
    ])
    prisma.club.findUnique.mockResolvedValue({ name: 'IQ Club' })
    prisma.playSessionBooking.findMany.mockResolvedValue([])

    const result = await runCampaignSendTick(prisma, { now: dueAt })

    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'campaign-1' },
        data: expect.objectContaining({ status: 'running' }),
      }),
    )
    expect(prisma.aIRecommendationLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            campaignId: 'campaign-1',
            userId: 'member-1',
            sequenceStep: 0,
            scheduledFor: dueAt,
            status: 'pending',
          }),
        ],
      }),
    )
    expect(prisma.aIRecommendationLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            campaignId: 'campaign-1',
            userId: 'member-1',
            sequenceStep: 1,
            parentLogId: 'log-1',
            scheduledFor: new Date('2026-05-13T10:17:00.000Z'),
            status: 'pending',
            reasoning: expect.objectContaining({
              delayAmount: 17,
              delayUnit: 'minutes',
              scheduledFor: '2026-05-13T10:17:00.000Z',
            }),
          }),
        ],
      }),
    )
    expect(sendOutreachEmail).toHaveBeenCalledTimes(1)
    expect(result.sequenceSeeded).toBe(1)
    expect(result.sequenceQueued).toBe(1)
    expect(result.totalSent).toBe(1)
  })

  it('debugs a non-runnable campaign without sending from it', async () => {
    const prisma = createMockPrisma()
    const now = new Date('2026-05-13T10:00:00.000Z')

    prisma.campaign.findMany.mockResolvedValue([
      makeSequenceCampaign({ status: 'completed' }),
    ])
    prisma.aIRecommendationLog.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
    prisma.aIRecommendationLog.findFirst.mockResolvedValue(null)

    const result = await runCampaignSendTick(prisma, {
      campaignId: 'campaign-1',
      debug: true,
      now,
    })

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
    expect(sendOutreachEmail).not.toHaveBeenCalled()
    expect(result.campaigns).toEqual([
      expect.objectContaining({
        id: 'campaign-1',
        status: 'completed',
        skippedReason: 'status_completed',
        pendingDue: 0,
        pendingFuture: 0,
        nextScheduledFor: null,
      }),
    ])
  })

  it('does not create a duplicate follow-up log when the next step already exists', async () => {
    const prisma = createMockPrisma()
    const now = new Date('2026-05-13T10:10:00.000Z')

    prisma.campaign.findMany.mockResolvedValue([makeSequenceCampaign()])
    prisma.aIRecommendationLog.findMany
      .mockResolvedValueOnce([{ userId: 'member-1', sequenceStep: 0 }])
      .mockResolvedValueOnce([
        {
          id: 'log-step-0',
          userId: 'member-1',
          status: 'sent',
          sequenceStep: 0,
          createdAt: new Date('2026-05-13T10:00:00.000Z'),
          sentAt: new Date('2026-05-13T10:00:00.000Z'),
          reasoning: {},
        },
      ])
      .mockResolvedValueOnce([{ userId: 'member-1', sequenceStep: 1 }])
    prisma.playSessionBooking.findMany.mockResolvedValue([])
    prisma.$queryRawUnsafe.mockResolvedValue([])

    const result = await runCampaignSendTick(prisma, { now })

    expect(prisma.aIRecommendationLog.createMany).not.toHaveBeenCalled()
    expect(result.sequenceQueued).toBe(0)
    expect(sendOutreachEmail).not.toHaveBeenCalled()
  })

  it('marks a sequence campaign completed when no pending send logs remain', async () => {
    const prisma = createMockPrisma()
    const now = new Date('2026-05-13T10:20:00.000Z')

    prisma.campaign.findMany.mockResolvedValue([makeSequenceCampaign()])
    prisma.aIRecommendationLog.findMany
      .mockResolvedValueOnce([{ userId: 'member-1', sequenceStep: 0, channel: 'email' }])
      .mockResolvedValueOnce([
        {
          id: 'log-step-0',
          userId: 'member-1',
          status: 'sent',
          sequenceStep: 0,
          createdAt: new Date('2026-05-13T10:00:00.000Z'),
          sentAt: new Date('2026-05-13T10:00:00.000Z'),
          reasoning: {},
        },
        {
          id: 'log-step-1',
          userId: 'member-1',
          status: 'sent',
          sequenceStep: 1,
          createdAt: new Date('2026-05-13T10:17:00.000Z'),
          sentAt: new Date('2026-05-13T10:17:00.000Z'),
          reasoning: {},
        },
      ])
      .mockResolvedValueOnce([{ userId: 'member-1', sequenceStep: 1, channel: 'email' }])
    prisma.playSessionBooking.findMany.mockResolvedValue([])
    prisma.$queryRawUnsafe.mockResolvedValue([])
    prisma.campaign.findUnique.mockResolvedValue({ status: 'running' })
    prisma.aIRecommendationLog.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)

    const result = await runCampaignSendTick(prisma, { now })

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { status: 'completed', completedAt: expect.any(Date) },
    })
    expect(result.completed).toBe(1)
    expect(sendOutreachEmail).not.toHaveBeenCalled()
  })

  it('queues follow-up using day-based delays from the wizard', async () => {
    const prisma = createMockPrisma()
    const now = new Date('2026-05-13T10:00:00.000Z')
    const steps = [
      { stepIndex: 0, delayDays: 0, subject: 'Step 1', body: 'Hello' },
      { stepIndex: 1, delayDays: 2, subject: 'Step 2', body: 'Two days later' },
    ]

    prisma.campaign.findMany.mockResolvedValue([
      makeSequenceCampaign({
        steps,
        cohortSnapshot: {
          userIds: ['member-1'],
          sendFormat: 'sequence',
          steps,
        },
      }),
    ])
    prisma.aIRecommendationLog.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'log-1', userId: 'member-1', retry_count: 0, sequence_step: 0, parent_log_id: null, scheduled_for: now },
    ])
    prisma.user.findMany.mockResolvedValue([
      { id: 'member-1', email: 'member@clubmail.com', name: 'Member One' },
    ])
    prisma.club.findUnique.mockResolvedValue({ name: 'IQ Club' })

    const result = await runCampaignSendTick(prisma, { now })

    expect(prisma.aIRecommendationLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            campaignId: 'campaign-1',
            userId: 'member-1',
            sequenceStep: 1,
            parentLogId: 'log-1',
            scheduledFor: new Date('2026-05-15T10:00:00.000Z'),
            reasoning: expect.objectContaining({
              delayAmount: 2,
              delayUnit: 'days',
              scheduledFor: '2026-05-15T10:00:00.000Z',
            }),
          }),
        ],
      }),
    )
    expect(result.sequenceQueued).toBe(1)
    expect(result.totalSent).toBe(1)
  })

  it('creates and sends separate logs for email and sms when both channels are enabled', async () => {
    const prisma = createMockPrisma()
    const now = new Date('2026-05-13T10:00:00.000Z')

    prisma.campaign.findMany.mockResolvedValue([
      makeOneTimeCampaign({
        channels: ['email', 'sms'],
      }),
    ])
    prisma.aIRecommendationLog.findMany.mockResolvedValueOnce([])
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'log-email',
        userId: 'member-1',
        channel: 'email',
        retry_count: 0,
        sequence_step: null,
        parent_log_id: null,
        scheduled_for: now,
      },
      {
        id: 'log-sms',
        userId: 'member-1',
        channel: 'sms',
        retry_count: 0,
        sequence_step: null,
        parent_log_id: null,
        scheduled_for: now,
      },
    ])
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'member-1',
        email: 'member@clubmail.com',
        name: 'Member One',
        phone: '+14155552671',
        smsOptIn: true,
      },
    ])
    prisma.club.findUnique.mockResolvedValue({ name: 'IQ Club' })
    prisma.aIRecommendationLog.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)

    const result = await runCampaignSendTick(prisma, { now })

    expect(prisma.aIRecommendationLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            campaignId: 'campaign-1',
            userId: 'member-1',
            channel: 'email',
          }),
          expect.objectContaining({
            campaignId: 'campaign-1',
            userId: 'member-1',
            channel: 'sms',
          }),
        ]),
      }),
    )
    expect(sendOutreachEmail).toHaveBeenCalledTimes(1)
    expect(sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+14155552671',
        logId: 'log-sms',
      }),
    )
    expect(prisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-email' },
        data: expect.objectContaining({ status: 'sent', externalMessageId: 'msg-1' }),
      }),
    )
    expect(prisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-sms' },
        data: expect.objectContaining({ status: 'sent', externalMessageId: 'sms-1' }),
      }),
    )
    expect(result.totalSent).toBe(2)
    expect(result.totalFailed).toBe(0)
  })

  it('fails the sms leg when the member has not opted in while still sending email', async () => {
    const prisma = createMockPrisma()
    const now = new Date('2026-05-13T10:00:00.000Z')

    prisma.campaign.findMany.mockResolvedValue([
      makeOneTimeCampaign({
        channels: ['email', 'sms'],
      }),
    ])
    prisma.aIRecommendationLog.findMany.mockResolvedValueOnce([])
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'log-email',
        userId: 'member-1',
        channel: 'email',
        retry_count: 0,
        sequence_step: null,
        parent_log_id: null,
        scheduled_for: now,
      },
      {
        id: 'log-sms',
        userId: 'member-1',
        channel: 'sms',
        retry_count: 0,
        sequence_step: null,
        parent_log_id: null,
        scheduled_for: now,
      },
    ])
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'member-1',
        email: 'member@clubmail.com',
        name: 'Member One',
        phone: '+14155552671',
        smsOptIn: false,
      },
    ])
    prisma.club.findUnique.mockResolvedValue({ name: 'IQ Club' })
    prisma.aIRecommendationLog.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)

    const result = await runCampaignSendTick(prisma, { now })

    expect(sendOutreachEmail).toHaveBeenCalledTimes(1)
    expect(sendSms).not.toHaveBeenCalled()
    expect(prisma.aIRecommendationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-sms' },
        data: expect.objectContaining({ status: 'failed', bounceType: 'sms_opt_in_required' }),
      }),
    )
    expect(result.totalSent).toBe(1)
    expect(result.totalFailed).toBe(1)
  })

  it('fans out the next sequence step across both channels after the first successful send', async () => {
    const prisma = createMockPrisma()
    const now = new Date('2026-05-13T10:00:00.000Z')

    prisma.campaign.findMany.mockResolvedValue([
      makeSequenceCampaign({
        channels: ['email', 'sms'],
      }),
    ])
    prisma.aIRecommendationLog.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'log-step-0-email',
        userId: 'member-1',
        channel: 'email',
        retry_count: 0,
        sequence_step: 0,
        parent_log_id: null,
        scheduled_for: now,
      },
    ])
    prisma.user.findMany.mockResolvedValue([
      { id: 'member-1', email: 'member@clubmail.com', name: 'Member One', phone: '+14155552671', smsOptIn: true },
    ])
    prisma.club.findUnique.mockResolvedValue({ name: 'IQ Club' })

    const result = await runCampaignSendTick(prisma, { now })

    expect(prisma.aIRecommendationLog.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            campaignId: 'campaign-1',
            userId: 'member-1',
            sequenceStep: 1,
            channel: 'email',
            parentLogId: 'log-step-0-email',
          }),
          expect.objectContaining({
            campaignId: 'campaign-1',
            userId: 'member-1',
            sequenceStep: 1,
            channel: 'sms',
            parentLogId: 'log-step-0-email',
          }),
        ]),
      }),
    )
    expect(result.sequenceQueued).toBe(2)
    expect(result.totalSent).toBe(1)
  })
})
