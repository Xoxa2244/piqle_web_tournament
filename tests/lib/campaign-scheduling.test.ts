import { describe, expect, it } from 'vitest'

import {
  buildRecurringCron,
  describeRecurringCron,
  formatSequenceDelayCompact,
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
})
