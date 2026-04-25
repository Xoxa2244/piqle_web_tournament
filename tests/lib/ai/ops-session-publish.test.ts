import { describe, expect, it } from 'vitest'
import { buildOpsSessionPublishReview } from '@/lib/ai/ops-session-publish'

describe('ops session publish review', () => {
  it('blocks exact duplicates in the same live window', () => {
    const review = buildOpsSessionPublishReview({
      draft: {
        title: 'Thursday Evening Beginner Clinic',
        date: '2026-04-23T12:00:00.000Z',
        startTime: '18:00',
        endTime: '19:30',
        format: 'CLINIC',
        skillLevel: 'BEGINNER',
      },
      existingSessions: [
        {
          id: 'live-1',
          title: 'Thursday Evening Beginner Clinic',
          date: '2026-04-23T12:00:00.000Z',
          startTime: '18:00',
          endTime: '19:30',
          format: 'CLINIC',
          skillLevel: 'BEGINNER',
          status: 'SCHEDULED',
        },
      ],
      courtCount: 3,
    })

    expect(review.status).toBe('blocked')
    expect(review.blockers[0]).toContain('same title')
    expect(review.exactMatchSessionId).toBe('live-1')
  })

  it('warns when the window overlaps other live sessions but is not a duplicate', () => {
    const review = buildOpsSessionPublishReview({
      draft: {
        title: 'Friday Prime-Time Open Play',
        date: '2026-04-24T12:00:00.000Z',
        startTime: '18:00',
        endTime: '19:30',
        format: 'OPEN_PLAY',
        skillLevel: 'INTERMEDIATE',
      },
      existingSessions: [
        {
          id: 'live-2',
          title: 'Friday Ladder Night',
          date: '2026-04-24T12:00:00.000Z',
          startTime: '17:30',
          endTime: '19:00',
          format: 'OPEN_PLAY',
          skillLevel: 'INTERMEDIATE',
          status: 'SCHEDULED',
        },
      ],
      courtCount: 2,
    })

    expect(review.status).toBe('warn')
    expect(review.warnings.join(' ')).toContain('overlap')
    expect(review.relatedSessions[0]?.id).toBe('live-2')
  })

  it('clears a clean slot for publish when no live conflicts exist', () => {
    const review = buildOpsSessionPublishReview({
      draft: {
        title: 'Sunday Morning Drill',
        date: '2026-04-26T12:00:00.000Z',
        startTime: '09:00',
        endTime: '10:30',
        format: 'DRILL',
        skillLevel: 'ADVANCED',
      },
      existingSessions: [],
      courtCount: 4,
    })

    expect(review.status).toBe('ready')
    expect(review.blockers).toHaveLength(0)
    expect(review.warnings).toHaveLength(0)
  })
})
