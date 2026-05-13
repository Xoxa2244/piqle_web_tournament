import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendOutreachEmail } = vi.hoisted(() => ({
  sendOutreachEmail: vi.fn(),
}))

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return {
    ...actual,
    sendOutreachEmail,
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

describe('campaign send runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendOutreachEmail.mockResolvedValue({ messageId: 'msg-1' })
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
})
