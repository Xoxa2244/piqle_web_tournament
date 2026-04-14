import { describe, expect, it } from 'vitest'
import {
  buildAdminReminderSms,
  getAdminReminderDue,
  shouldSendAdminReminderChannel,
  withAdminReminderChannelResult,
} from '@/lib/ai/agent-admin-reminders'

describe('agent admin reminders', () => {
  it('treats reminders as due once remindAt is in the past', () => {
    const now = new Date('2026-04-14T01:00:00.000Z')
    const due = getAdminReminderDue(
      {
        remindAt: '2026-04-14T00:45:00.000Z',
        remindLabel: 'in 15 minutes',
      },
      now,
    )

    expect(due.due).toBe(true)
    expect(due.remindLabel).toBe('in 15 minutes')
  })

  it('sends only once per remindAt per channel', () => {
    const now = new Date('2026-04-14T01:00:00.000Z')
    const metadata = {
      remindAt: '2026-04-14T00:45:00.000Z',
      emailReminderSentAt: '2026-04-14T00:50:00.000Z',
      smsReminderSentAt: '2026-04-14T00:40:00.000Z',
    }

    expect(shouldSendAdminReminderChannel(metadata, 'email', now)).toBe(false)
    expect(shouldSendAdminReminderChannel(metadata, 'sms', now)).toBe(true)
  })

  it('records sent timestamp and clears error for a channel', () => {
    const next = withAdminReminderChannelResult(
      {
        remindAt: '2026-04-14T00:45:00.000Z',
        emailReminderError: 'smtp failed',
      },
      'email',
      { sentAt: '2026-04-14T01:00:00.000Z' },
    ) as Record<string, unknown>

    expect(next.emailReminderSentAt).toBe('2026-04-14T01:00:00.000Z')
    expect(next.emailReminderError).toBeUndefined()
    expect(typeof next.externalReminderUpdatedAt).toBe('string')
  })

  it('builds a compact admin reminder sms', () => {
    const sms = buildAdminReminderSms({
      title: 'Review today’s sandbox preview inbox',
      clubName: 'IPC East',
      targetUrl: 'https://dev.iqsport.ai/clubs/123/intelligence/agent',
    })

    expect(sms).toContain('IPC East')
    expect(sms).toContain('sandbox preview inbox')
    expect(sms.length).toBeLessThanOrEqual(320)
  })
})
