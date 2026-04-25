import { describe, expect, it } from 'vitest'
import {
  resolveAdvisorContactPolicy,
  updateAdvisorContactPolicyFromMessage,
} from '@/lib/ai/advisor-contact-policy'

describe('advisor contact policy', () => {
  it('resolves club overrides from automation settings', () => {
    const policy = resolveAdvisorContactPolicy({
      automationSettings: {
        intelligence: {
          timezone: 'America/Los_Angeles',
          contactPolicy: {
            quietHours: { startHour: 22, endHour: 7 },
            recentBookingLookbackDays: 5,
            max24h: 1,
            max7d: 4,
            cooldownHours: 6,
          },
        },
      },
    })

    expect(policy.timeZone).toBe('America/Los_Angeles')
    expect(policy.quietHours).toEqual({ startHour: 22, endHour: 7 })
    expect(policy.recentBookingLookbackDays).toBe(5)
    expect(policy.max24h).toBe(1)
    expect(policy.max7d).toBe(4)
    expect(policy.cooldownHours).toBe(6)
  })

  it('parses explicit policy changes from chat message', () => {
    const currentPolicy = resolveAdvisorContactPolicy({
      automationSettings: {
        intelligence: {
          timezone: 'America/Los_Angeles',
        },
      },
    })

    const updated = updateAdvisorContactPolicyFromMessage({
      message: 'Set quiet hours from 10pm to 8am, use a 6 hour cooldown, limit outreach to 1 message per day and 4 messages per week',
      currentPolicy,
    })

    expect(updated).toBeTruthy()
    expect(updated?.quietHours).toEqual({ startHour: 22, endHour: 8 })
    expect(updated?.cooldownHours).toBe(6)
    expect(updated?.max24h).toBe(1)
    expect(updated?.max7d).toBe(4)
    expect(updated?.changes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Quiet hours'),
        expect.stringContaining('Cross-campaign cooldown'),
        expect.stringContaining('Daily contact cap'),
        expect.stringContaining('Weekly contact cap'),
      ]),
    )
  })
})
