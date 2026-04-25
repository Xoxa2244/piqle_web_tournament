import { describe, expect, it } from 'vitest'
import { buildOpsSessionLiveFeedback } from '@/lib/ai/ops-session-feedback'

describe('ops session live feedback', () => {
  it('marks strong live demand as ahead of plan', () => {
    const feedback = buildOpsSessionLiveFeedback({
      projectedOccupancy: 72,
      maxPlayers: 8,
      confirmedCount: 7,
      waitlistCount: 2,
      sessionDate: '2026-04-20T18:00:00.000Z',
    }, new Date('2026-04-14T18:00:00.000Z'))

    expect(feedback.status).toBe('ahead')
    expect(feedback.actualOccupancy).toBe(88)
    expect(feedback.summary).toContain('waitlist')
  })

  it('marks low-fill near-term sessions as at risk', () => {
    const feedback = buildOpsSessionLiveFeedback({
      projectedOccupancy: 74,
      maxPlayers: 8,
      confirmedCount: 3,
      waitlistCount: 0,
      sessionDate: '2026-04-16T18:00:00.000Z',
    }, new Date('2026-04-14T18:00:00.000Z'))

    expect(feedback.status).toBe('at_risk')
    expect(feedback.spotsRemaining).toBe(5)
    expect(feedback.recommendedAction).toContain('fill action')
  })
})
