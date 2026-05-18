import { describe, expect, it } from 'vitest'

import { appendSmsOptOut, buildReactivationSms, buildSlotFillerSms } from '@/lib/sms'

describe('sms opt-out copy', () => {
  it('uses STOP copy and ignores opt-out links', () => {
    const body = appendSmsOptOut('IQSport: Book your next session.', 'https://app.iqsport.ai/unsubscribe/example')

    expect(body).toBe('IQSport: Book your next session. Reply STOP to opt out')
    expect(body).not.toContain('https://')
    expect(body).not.toContain('Opt out:')
  })

  it('adds STOP copy to slot filler messages', () => {
    const body = buildSlotFillerSms({
      memberName: 'Alex Stone',
      clubName: 'IQ Club',
      sessionTitle: 'Open Play',
      sessionDate: 'May 20',
      sessionTime: '6:00 PM',
      spotsLeft: 2,
      bookingUrl: 'https://app.iqsport.ai/clubs/club-1',
    })

    expect(body).toContain('Reply STOP to opt out')
    expect(body).not.toContain('Opt out:')
  })

  it('adds STOP copy to reactivation messages', () => {
    const body = buildReactivationSms({
      memberName: 'Alex Stone',
      clubName: 'IQ Club',
      daysSinceLastActivity: 30,
      sessionCount: 3,
      bookingUrl: 'https://app.iqsport.ai/clubs/club-1',
    })

    expect(body).toContain('Reply STOP to opt out')
    expect(body).not.toContain('Opt out:')
  })
})
