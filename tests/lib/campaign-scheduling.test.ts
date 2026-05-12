import { describe, expect, it } from 'vitest'

import {
  buildRecurringCron,
  describeRecurringCron,
  formatSequenceDelayCompact,
  getCampaignSequenceDueCandidates,
  parseRecurringCron,
  resolveSequenceDelay,
  shouldFireRecurringNow,
} from '@/lib/campaign-scheduling'

describe('campaign scheduling helpers', () => {
  it('builds minute-interval recurring cron expressions for QA loops', () => {
    expect(buildRecurringCron({
      format: 'recurring',
      recurringFrequency: 'interval_minutes',
      recurringIntervalMinutes: 10,
    })).toBe('*/10 * * * *')
  })

  it('parses and describes minute-interval recurring cron expressions', () => {
    expect(parseRecurringCron('*/10 * * * *')).toEqual({
      kind: 'interval_minutes',
      minuteInterval: 10,
    })
    expect(describeRecurringCron('*/10 * * * *', 'UTC')).toBe('Every 10 minutes')
  })

  it('fires recurring interval schedules only on matching minute boundaries', () => {
    const cron = parseRecurringCron('*/10 * * * *')
    expect(cron).not.toBeNull()

    expect(shouldFireRecurringNow(cron!, 'UTC', new Date('2026-05-12T10:20:00.000Z'), null)).toBe(true)
    expect(shouldFireRecurringNow(cron!, 'UTC', new Date('2026-05-12T10:23:00.000Z'), null)).toBe(false)
    expect(
      shouldFireRecurringNow(
        cron!,
        'UTC',
        new Date('2026-05-12T10:20:00.000Z'),
        new Date('2026-05-12T10:15:30.000Z'),
      ),
    ).toBe(false)
  })

  it('prefers per-step minute delays when present', () => {
    expect(resolveSequenceDelay({ delayDays: 3, delayMinutes: 10 })).toEqual({
      amount: 10,
      unit: 'minutes',
    })
    expect(formatSequenceDelayCompact({ delayDays: 3, delayMinutes: 10 })).toBe('+10m')
  })

  it('fans out the next step once a minute-based delay has elapsed', () => {
    const candidates = getCampaignSequenceDueCandidates(
      [
        { delayDays: 0 },
        { delayDays: 1, delayMinutes: 5 },
        { delayDays: 1, delayMinutes: 10 },
      ],
      [
        {
          id: 'log-0',
          userId: 'member-1',
          sequenceStep: 0,
          status: 'sent',
          createdAt: new Date('2026-05-12T12:34:07.396Z'),
          sentAt: new Date('2026-05-12T12:34:07.396Z'),
        },
      ],
      new Date('2026-05-12T12:40:30.000Z'),
    )

    expect(candidates).toEqual([
      {
        logId: 'log-0',
        userId: 'member-1',
        sequenceStep: 0,
        nextStep: 1,
        sentAt: new Date('2026-05-12T12:34:07.396Z'),
      },
    ])
  })

  it('falls back to createdAt when the root step has no sentAt yet', () => {
    const candidates = getCampaignSequenceDueCandidates(
      [
        { delayDays: 0 },
        { delayDays: 1, delayMinutes: 5 },
      ],
      [
        {
          id: 'log-0',
          userId: 'member-1',
          sequenceStep: 0,
          status: 'sent',
          createdAt: new Date('2026-05-12T12:34:07.396Z'),
          sentAt: null,
        },
      ],
      new Date('2026-05-12T12:40:30.000Z'),
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      logId: 'log-0',
      userId: 'member-1',
      sequenceStep: 0,
      nextStep: 1,
    })
  })

  it('does not fan out when the latest step is already pending or exited', () => {
    const now = new Date('2026-05-12T12:50:00.000Z')

    expect(
      getCampaignSequenceDueCandidates(
        [
          { delayDays: 0 },
          { delayDays: 1, delayMinutes: 5 },
        ],
        [
          {
            id: 'log-pending',
            userId: 'member-1',
            sequenceStep: 1,
            status: 'pending',
            createdAt: new Date('2026-05-12T12:40:00.000Z'),
            sentAt: null,
          },
          {
            id: 'log-root',
            userId: 'member-1',
            sequenceStep: 0,
            status: 'sent',
            createdAt: new Date('2026-05-12T12:34:07.396Z'),
            sentAt: new Date('2026-05-12T12:34:07.396Z'),
          },
        ],
        now,
      ),
    ).toEqual([])

    expect(
      getCampaignSequenceDueCandidates(
        [
          { delayDays: 0 },
          { delayDays: 1, delayMinutes: 5 },
        ],
        [
          {
            id: 'log-root',
            userId: 'member-1',
            sequenceStep: 0,
            status: 'sent',
            createdAt: new Date('2026-05-12T12:34:07.396Z'),
            sentAt: new Date('2026-05-12T12:34:07.396Z'),
            reasoning: { sequenceExit: 'booked_session' },
          },
        ],
        now,
      ),
    ).toEqual([])
  })
})
