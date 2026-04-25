import { describe, expect, it } from 'vitest'
import { parseAdvisorScheduledSend } from '@/lib/ai/advisor-scheduling'

describe('advisor scheduling parser', () => {
  const now = new Date('2026-04-12T16:00:00.000Z') // 12:00 PM America/New_York
  const timeZone = 'America/New_York'

  it('parses tomorrow at 6pm in club timezone', () => {
    const result = parseAdvisorScheduledSend({
      message: 'Send it tomorrow at 6pm',
      timeZone,
      now,
    })

    expect(result?.timeZone).toBe(timeZone)
    expect(result?.localDateTime).toBe('2026-04-13T18:00')
    expect(result?.scheduledFor).toBe('2026-04-13T22:00:00.000Z')
  })

  it('parses a named weekday with a time', () => {
    const result = parseAdvisorScheduledSend({
      message: 'Schedule this for Friday at 9am',
      timeZone,
      now,
    })

    expect(result?.localDateTime).toBe('2026-04-17T09:00')
    expect(result?.scheduledFor).toBe('2026-04-17T13:00:00.000Z')
  })

  it('parses tomorrow morning using a default morning slot', () => {
    const result = parseAdvisorScheduledSend({
      message: 'Send later tomorrow morning',
      timeZone,
      now,
    })

    expect(result?.localDateTime).toBe('2026-04-13T09:00')
  })

  it('uses the next day when only a past time is given', () => {
    const result = parseAdvisorScheduledSend({
      message: 'Send it at 9am',
      timeZone,
      now,
    })

    expect(result?.localDateTime).toBe('2026-04-13T09:00')
  })

  it('returns null when the user wants to send later but gives no time', () => {
    const result = parseAdvisorScheduledSend({
      message: 'Send it later',
      timeZone,
      now,
    })

    expect(result).toBeNull()
  })
})
