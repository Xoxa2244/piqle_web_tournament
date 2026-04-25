import { describe, expect, it } from 'vitest'
import { buildOpsSessionAftercareReview } from '@/lib/ai/ops-session-aftercare'

describe('ops session aftercare review', () => {
  const draft = {
    title: 'Thursday Evening Beginner Clinic',
    description: 'Original clinic brief',
    date: '2026-04-30T12:00:00.000Z',
    startTime: '18:00',
    endTime: '19:30',
    format: 'CLINIC',
    skillLevel: 'BEGINNER',
    maxPlayers: 8,
  }

  it('stays aligned when the live session still matches the publish plan', () => {
    const review = buildOpsSessionAftercareReview({
      draft,
      liveSession: {
        id: 'live-1',
        ...draft,
        status: 'SCHEDULED',
        confirmedCount: 0,
        waitlistCount: 0,
      },
    })

    expect(review.status).toBe('aligned')
    expect(review.driftedFields).toHaveLength(0)
    expect(review.canRollback).toBe(false)
  })

  it('allows safe rollback when only the live copy drifted and there is no demand yet', () => {
    const review = buildOpsSessionAftercareReview({
      draft,
      liveSession: {
        id: 'live-2',
        ...draft,
        title: 'Thursday Evening Beginner Clinic (Promo Copy)',
        description: 'Newer copy',
        status: 'SCHEDULED',
        confirmedCount: 0,
        waitlistCount: 0,
      },
    })

    expect(review.status).toBe('drifted')
    expect(review.rollbackStatus).toBe('ready')
    expect(review.canRollback).toBe(true)
    expect(review.driftedFields.map((item) => item.field)).toEqual(['title', 'description'])
  })

  it('blocks structural rollback once live bookings already exist', () => {
    const review = buildOpsSessionAftercareReview({
      draft,
      liveSession: {
        id: 'live-3',
        ...draft,
        startTime: '19:00',
        endTime: '20:30',
        status: 'SCHEDULED',
        confirmedCount: 5,
        waitlistCount: 1,
      },
    })

    expect(review.status).toBe('drifted')
    expect(review.rollbackStatus).toBe('blocked')
    expect(review.blockers[0]).toContain('confirmed booking')
    expect(review.canRollback).toBe(false)
  })

  it('reports missing live sessions as blocked aftercare', () => {
    const review = buildOpsSessionAftercareReview({
      draft,
      liveSession: null,
    })

    expect(review.status).toBe('missing')
    expect(review.rollbackStatus).toBe('blocked')
    expect(review.canEdit).toBe(false)
  })
})
