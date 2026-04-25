import { describe, expect, it } from 'vitest'
import {
  formatAdvisorAdminReminderRoutingDigest,
  getAdvisorAdminReminderMissingFields,
  resolveAdvisorAdminReminderRouting,
  updateAdvisorAdminReminderRoutingFromMessage,
} from '@/lib/ai/advisor-admin-reminder-policy'

describe('advisor admin reminder policy', () => {
  it('resolves current reminder routing from user profile fields', () => {
    const policy = resolveAdvisorAdminReminderRouting({
      adminReminderChannel: 'both',
      adminReminderEmail: 'ops@iqsport.ai',
      adminReminderPhone: '+15555550123',
    })

    expect(policy.channel).toBe('both')
    expect(policy.email).toBe('ops@iqsport.ai')
    expect(policy.phone).toBe('+15555550123')
  })

  it('parses reminder email routing from message', () => {
    const policy = updateAdvisorAdminReminderRoutingFromMessage({
      message: 'Send admin reminders to email ops@iqsport.ai',
      currentPolicy: resolveAdvisorAdminReminderRouting(null),
    })

    expect(policy?.channel).toBe('email')
    expect(policy?.email).toBe('ops@iqsport.ai')
    expect(policy?.changes).toContain('Reminder delivery: Email reminders')
  })

  it('detects missing phone when sms delivery is chosen', () => {
    const policy = updateAdvisorAdminReminderRoutingFromMessage({
      message: 'Text me admin reminders',
      currentPolicy: resolveAdvisorAdminReminderRouting(null),
    })

    expect(policy?.channel).toBe('sms')
    expect(getAdvisorAdminReminderMissingFields(policy!)).toEqual(['phone'])
  })

  it('formats a readable routing digest', () => {
    const digest = formatAdvisorAdminReminderRoutingDigest({
      channel: 'both',
      email: 'ops@iqsport.ai',
      phone: '+15555550123',
      changes: [],
    })

    expect(digest).toContain('Email + SMS reminders')
    expect(digest).toContain('ops@iqsport.ai')
    expect(digest).toContain('+15555550123')
  })
})
