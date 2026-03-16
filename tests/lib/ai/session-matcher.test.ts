import { describe, it, expect } from 'vitest'
import {
  findBestSessionForMember,
  findTopSessionsForMember,
  formatSessionDate,
  formatSessionTime,
  type SessionWithBookings,
  type SessionMatchInput,
} from '@/lib/ai/session-matcher'

// ── Helpers ──

function makeSession(overrides?: Partial<SessionWithBookings>): SessionWithBookings {
  return {
    id: 'session-1',
    title: 'Evening Open Play',
    date: new Date('2026-03-16'), // Monday
    startTime: '18:00',
    endTime: '20:00',
    format: 'OPEN_PLAY',
    skillLevel: 'INTERMEDIATE',
    maxPlayers: 8,
    _count: { bookings: 4 },
    bookings: [
      { user: { duprRatingDoubles: 3.5 } },
      { user: { duprRatingDoubles: 4.0 } },
      { user: { duprRatingDoubles: 3.8 } },
      { user: { duprRatingDoubles: null } },
    ],
    ...overrides,
  }
}

function makeInput(overrides?: Partial<SessionMatchInput>): SessionMatchInput {
  return {
    memberSkillLevel: 'INTERMEDIATE',
    preference: {
      preferredDays: ['Monday'],
      preferredTimeSlots: { morning: false, afternoon: false, evening: true },
      preferredFormats: ['OPEN_PLAY'],
    },
    sessions: [makeSession()],
    clubSlug: 'test-club',
    appBaseUrl: 'https://app.piqle.io',
    ...overrides,
  }
}

// ── findBestSessionForMember ──

describe('Подбор сессий > Поиск лучшей сессии', () => {
  it('находит сессию с максимальным match score', () => {
    const result = findBestSessionForMember(makeInput())
    expect(result).not.toBeNull()
    expect(result!.session.id).toBe('session-1')
  })

  it('нет доступных сессий → null', () => {
    const result = findBestSessionForMember(makeInput({ sessions: [] }))
    expect(result).toBeNull()
  })

  it('все сессии заполнены → null', () => {
    const result = findBestSessionForMember(makeInput({
      sessions: [makeSession({ maxPlayers: 4, _count: { bookings: 4 } })],
    }))
    expect(result).toBeNull()
  })

  it('возвращает social proof: подтвержденные, свободные места, игроки того же уровня', () => {
    const result = findBestSessionForMember(makeInput())
    expect(result!.confirmedCount).toBe(4)
    expect(result!.spotsLeft).toBe(4)
    expect(result!.sameLevelCount).toBeGreaterThanOrEqual(0)
  })

  it('генерирует deep link URL для бронирования', () => {
    const result = findBestSessionForMember(makeInput())
    expect(result!.deepLinkUrl).toBe('https://app.piqle.io/clubs/test-club/play?session=session-1')
  })
})

// ── findTopSessionsForMember ──

describe('Подбор сессий > Топ-N рекомендаций', () => {
  it('сортировка по match score (лучшие первыми)', () => {
    const sessions = [
      makeSession({ id: 's1', date: new Date('2026-03-16'), startTime: '08:00', format: 'CLINIC', skillLevel: 'BEGINNER' }), // bad match
      makeSession({ id: 's2', date: new Date('2026-03-16'), startTime: '18:00', format: 'OPEN_PLAY', skillLevel: 'INTERMEDIATE' }), // perfect match
    ]
    const results = findTopSessionsForMember(makeInput({ sessions }), 3)
    expect(results[0].session.id).toBe('s2')
    expect(results[0].matchScore).toBeGreaterThan(results[1].matchScore)
  })

  it('limit=2 → ровно 2 результата', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({ id: `s${i}`, _count: { bookings: 2 } })
    )
    const results = findTopSessionsForMember(makeInput({ sessions }), 2)
    expect(results).toHaveLength(2)
  })

  it('заполненные сессии не попадают в результаты', () => {
    const sessions = [
      makeSession({ id: 'full', maxPlayers: 4, _count: { bookings: 4 } }),
      makeSession({ id: 'available', maxPlayers: 8, _count: { bookings: 3 } }),
    ]
    const results = findTopSessionsForMember(makeInput({ sessions }))
    expect(results.map(r => r.session.id)).not.toContain('full')
    expect(results.map(r => r.session.id)).toContain('available')
  })

  it('подсчет игроков того же уровня (2 INTERMEDIATE из 4)', () => {
    const session = makeSession({
      bookings: [
        { user: { duprRatingDoubles: 3.5 } }, // INTERMEDIATE
        { user: { duprRatingDoubles: 4.0 } }, // INTERMEDIATE
        { user: { duprRatingDoubles: 2.5 } }, // BEGINNER
        { user: { duprRatingDoubles: 5.0 } }, // ADVANCED
      ],
    })
    const results = findTopSessionsForMember(makeInput({
      memberSkillLevel: 'INTERMEDIATE',
      sessions: [session],
    }))
    expect(results[0].sameLevelCount).toBe(2)
  })
})

// ── Scoring Logic ──

describe('Подбор сессий > Логика скоринга', () => {
  it('идеальное совпадение (день+время+формат+уровень) → балл выше частичного', () => {
    const perfect = findTopSessionsForMember(makeInput({
      sessions: [makeSession({
        id: 'perfect',
        date: new Date('2026-03-16'), // Monday
        startTime: '18:00', // evening
        format: 'OPEN_PLAY',
        skillLevel: 'INTERMEDIATE',
      })],
    }))

    const partial = findTopSessionsForMember(makeInput({
      sessions: [makeSession({
        id: 'partial',
        date: new Date('2026-03-17'), // Tuesday (not preferred)
        startTime: '08:00', // morning (not preferred)
        format: 'CLINIC', // not preferred
        skillLevel: 'BEGINNER', // adjacent
      })],
    }))

    expect(perfect[0].matchScore).toBeGreaterThan(partial[0].matchScore)
  })

  it('сессия ALL_LEVELS → высокий балл для всех уровней', () => {
    const allLevels = findTopSessionsForMember(makeInput({
      sessions: [makeSession({ id: 'all', skillLevel: 'ALL_LEVELS' })],
    }))

    const mismatch = findTopSessionsForMember(makeInput({
      sessions: [makeSession({ id: 'mismatch', skillLevel: 'BEGINNER' })],
      memberSkillLevel: 'ADVANCED',
    }))

    expect(allLevels[0].matchScore).toBeGreaterThan(mismatch[0].matchScore)
  })

  it('без предпочтений → нейтральный балл (не ломается)', () => {
    const result = findTopSessionsForMember(makeInput({
      preference: null,
      sessions: [makeSession()],
    }))
    expect(result).toHaveLength(1)
    expect(result[0].matchScore).toBeGreaterThan(0)
  })

  it('match score всегда в диапазоне 0-100', () => {
    const results = findTopSessionsForMember(makeInput({
      sessions: [makeSession()],
    }))
    for (const r of results) {
      expect(r.matchScore).toBeGreaterThanOrEqual(0)
      expect(r.matchScore).toBeLessThanOrEqual(100)
    }
  })
})

// ── Formatter Helpers ──

describe('Подбор сессий > Форматирование даты', () => {
  it('дата в формате "Monday, Mar 16"', () => {
    const result = formatSessionDate(new Date('2026-03-16T12:00:00'))
    expect(result).toBe('Monday, Mar 16')
  })
})

describe('Подбор сессий > Форматирование времени', () => {
  it('время в формате "6 PM–8 PM"', () => {
    expect(formatSessionTime('18:00', '20:00')).toBe('6 PM–8 PM')
    expect(formatSessionTime('08:00', '10:00')).toBe('8 AM–10 AM')
    expect(formatSessionTime('12:00', '14:00')).toBe('12 PM–2 PM')
  })

  it('время с минутами: "6:30 PM–8 PM"', () => {
    expect(formatSessionTime('18:30', '20:00')).toBe('6:30 PM–8 PM')
  })
})
