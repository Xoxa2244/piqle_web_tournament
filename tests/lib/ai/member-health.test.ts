/**
 * SET 1: Здоровье участников и прогнозирование оттока
 *
 * Анализирует активность каждого участника клуба и рассчитывает
 * "оценку здоровья" (0-100) для предсказания оттока.
 */

import { describe, it, expect } from 'vitest'
import { generateMemberHealth } from '@/lib/ai/member-health'
import type { MemberData, BookingHistory, UserPlayPreferenceData, DayOfWeek } from '@/types/intelligence'

// ── Helpers ──

function makeMember(overrides?: Partial<MemberData>): MemberData {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@test.com',
    image: null,
    gender: null,
    city: null,
    duprRatingDoubles: 3.5,
    duprRatingSingles: null,
    ...overrides,
  }
}

function makeHistory(overrides?: Partial<BookingHistory>): BookingHistory {
  return {
    totalBookings: 20,
    bookingsLastWeek: 1,
    bookingsLastMonth: 4,
    daysSinceLastConfirmedBooking: 3,
    cancelledCount: 0,
    noShowCount: 0,
    inviteAcceptanceRate: 1,
    ...overrides,
  }
}

function makePreference(days: DayOfWeek[] = ['Monday', 'Wednesday']): UserPlayPreferenceData {
  return {
    id: 'pref-1',
    userId: 'user-1',
    clubId: 'club-1',
    preferredDays: days,
    preferredTimeSlots: { morning: false, afternoon: false, evening: true },
    preferredFormats: ['OPEN_PLAY'],
    skillLevel: 'INTERMEDIATE',
    targetSessionsPerWeek: 3,
    isActive: true,
  }
}

function makeBookingDates(count: number, intervalDays = 7): { date: Date; status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' }[] {
  const dates = []
  for (let i = 0; i < count; i++) {
    dates.push({
      date: new Date(Date.now() - i * intervalDays * 86400000),
      status: 'CONFIRMED' as const,
    })
  }
  return dates
}

function makeInput(overrides?: any) {
  return {
    member: makeMember(),
    preference: makePreference(),
    history: makeHistory(),
    joinedAt: new Date('2025-01-01'),
    bookingDates: makeBookingDates(8),
    previousPeriodBookings: 4,
    ...overrides,
  }
}

// ── generateMemberHealth ──

describe('Здоровье участников > Расчет общего здоровья клуба', () => {
  it('участники с худшим здоровьем идут первыми в списке', () => {
    const result = generateMemberHealth([
      makeInput({ member: makeMember({ id: 'a' }), history: makeHistory({ daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 6 }), previousPeriodBookings: 4 }),
      makeInput({ member: makeMember({ id: 'b' }), history: makeHistory({ daysSinceLastConfirmedBooking: 30, bookingsLastMonth: 0 }), previousPeriodBookings: 4 }),
    ])

    expect(result.members[0].memberId).toBe('b') // worse health = first
    expect(result.members[0].healthScore).toBeLessThan(result.members[1].healthScore)
  })

  it('сумма категорий (healthy + watch + atRisk + critical) равна total', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 6 }), previousPeriodBookings: 4 }),
      makeInput({ member: makeMember({ id: 'b' }), history: makeHistory({ daysSinceLastConfirmedBooking: 30, bookingsLastMonth: 0 }), previousPeriodBookings: 4 }),
    ])

    expect(result.summary.total).toBe(2)
    expect(result.summary.healthy + result.summary.watch + result.summary.atRisk + result.summary.critical).toBe(2)
  })

  it('доход под угрозой = (atRisk + critical) × цена сессии', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 30, bookingsLastMonth: 0 }), previousPeriodBookings: 5 }),
    ], 99)

    // This member has very low health → at_risk or critical
    expect(result.summary.revenueAtRisk).toBeGreaterThan(0)
  })
})

// ── Health Score Components via generateMemberHealth ──

describe('Здоровье участников > Компоненты оценки', () => {
  describe('Частота визитов (Frequency Trend)', () => {
    it('стабильная частота визитов → 100 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ bookingsLastMonth: 4 }), previousPeriodBookings: 4 }),
      ])
      expect(result.members[0].components.frequencyTrend.score).toBe(100)
    })

    it('резкое снижение частоты (6→1) → балл ≤ 40', () => {
      // Short tenure + high total bookings → high personal baseline → sharp drop detected
      const result = generateMemberHealth([
        makeInput({
          history: makeHistory({ bookingsLastMonth: 1, totalBookings: 60 }),
          previousPeriodBookings: 6,
          joinedAt: new Date(Date.now() - 90 * 86400000), // 90 days ago → ~13 weeks → baseline ~4.6/wk
        }),
      ])
      expect(result.members[0].components.frequencyTrend.score).toBeLessThanOrEqual(40)
    })

    it('полное бездействие в обоих периодах → 20 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ bookingsLastMonth: 0 }), previousPeriodBookings: 0 }),
      ])
      expect(result.members[0].components.frequencyTrend.score).toBe(20)
    })

    it('новая активность после нуля (0→3) → 90 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ bookingsLastMonth: 3 }), previousPeriodBookings: 0 }),
      ])
      expect(result.members[0].components.frequencyTrend.score).toBe(90)
    })
  })

  describe('Давность последнего визита (Recency)', () => {
    it('играл 1-3 дня назад → 100 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 1 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(100)
    })

    it('7 дней без визита → 80 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 7 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(80)
    })

    it('14 дней без визита → 50 баллов (тревожный сигнал)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 14 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(50)
    })

    it('21 день без визита → 25 баллов (высокий риск)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 21 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(25)
    })

    it('30+ дней без визита → 0 баллов (критично)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: 30 }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(0)
    })

    it('никогда не играл (null) → 10 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ daysSinceLastConfirmedBooking: null as any }) }),
      ])
      expect(result.members[0].components.recency.score).toBe(10)
    })
  })

  describe('Регулярность визитов (Consistency)', () => {
    it('менее 3 бронирований → 50 баллов (мало данных)', () => {
      const result = generateMemberHealth([
        makeInput({ bookingDates: makeBookingDates(2) }),
      ])
      expect(result.members[0].components.consistency.score).toBe(50)
    })

    it('еженедельные визиты (каждые 7 дней) → балл ≥ 70', () => {
      // Regular 7-day intervals → low CV → high score
      const result = generateMemberHealth([
        makeInput({ bookingDates: makeBookingDates(6, 7) }),
      ])
      expect(result.members[0].components.consistency.score).toBeGreaterThanOrEqual(70)
    })
  })

  describe('Неявки (No-Show Trend)', () => {
    it('0 неявок → 100 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ totalBookings: 20, noShowCount: 0 }) }),
      ])
      expect(result.members[0].components.noShowTrend.score).toBe(100)
    })

    it('≤15% неявок (2 из 20) → 60 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ totalBookings: 20, noShowCount: 2 }) }),
      ])
      expect(result.members[0].components.noShowTrend.score).toBe(60)
    })

    it('>15% неявок (5 из 20) → 20 баллов', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ totalBookings: 20, noShowCount: 5 }) }),
      ])
      expect(result.members[0].components.noShowTrend.score).toBe(20)
    })

    it('нет бронирований вообще → 50 баллов (базовый)', () => {
      const result = generateMemberHealth([
        makeInput({ history: makeHistory({ totalBookings: 0, noShowCount: 0 }) }),
      ])
      expect(result.members[0].components.noShowTrend.score).toBe(50)
    })
  })
})

// ── Risk Level Classification ──

describe('Здоровье участников > Уровень риска', () => {
  it('активный участник (играл вчера, 6 визитов/мес) → "healthy"', () => {
    const result = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 6 }),
        previousPeriodBookings: 4,
        bookingDates: makeBookingDates(8, 4),
      }),
    ])
    expect(result.members[0].riskLevel).toBe('healthy')
  })

  it('неактивный участник (25 дней, 0 бронирований) → "at_risk" или "critical"', () => {
    const result = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 25, bookingsLastMonth: 0 }),
        previousPeriodBookings: 4,
        bookingDates: [],
      }),
    ])
    expect(['at_risk', 'critical']).toContain(result.members[0].riskLevel)
  })
})

// ── Lifecycle Stage ──

describe('Здоровье участников > Стадия жизненного цикла', () => {
  it('не играл 45+ дней → "churned" (ушел)', () => {
    const result = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 45 }),
        joinedAt: new Date('2025-01-01'),
      }),
    ])
    expect(result.members[0].lifecycleStage).toBe('churned')
  })

  it('зарегистрирован менее 14 дней назад → "onboarding" (новичок)', () => {
    const result = generateMemberHealth([
      makeInput({
        joinedAt: new Date(Date.now() - 5 * 86400000), // 5 days ago
        history: makeHistory({ daysSinceLastConfirmedBooking: 2 }),
      }),
    ])
    expect(result.members[0].lifecycleStage).toBe('onboarding')
  })

  it('зарегистрирован 14-60 дней назад → "ramping" (набирает обороты)', () => {
    const result = generateMemberHealth([
      makeInput({
        joinedAt: new Date(Date.now() - 30 * 86400000), // 30 days ago
        history: makeHistory({ daysSinceLastConfirmedBooking: 2 }),
      }),
    ])
    expect(result.members[0].lifecycleStage).toBe('ramping')
  })

  it('статус "churned" перекрывает "onboarding" (новичок пропал → ушел)', () => {
    const result = generateMemberHealth([
      makeInput({
        joinedAt: new Date(Date.now() - 10 * 86400000), // 10 days ago (should be onboarding)
        history: makeHistory({ daysSinceLastConfirmedBooking: 45 }), // but 45 days inactive → churned
      }),
    ])
    expect(result.members[0].lifecycleStage).toBe('churned')
  })
})

// ── Trend Detection ──

describe('Здоровье участников > Тренд активности', () => {
  it('визитов стало больше → "improving" (рост)', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ bookingsLastMonth: 6 }), previousPeriodBookings: 3 }),
    ])
    expect(result.members[0].trend).toBe('improving')
  })

  it('визитов стало меньше → "declining" (спад)', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ bookingsLastMonth: 2 }), previousPeriodBookings: 5 }),
    ])
    expect(result.members[0].trend).toBe('declining')
  })

  it('визитов столько же → "stable" (стабильно)', () => {
    const result = generateMemberHealth([
      makeInput({ history: makeHistory({ bookingsLastMonth: 4 }), previousPeriodBookings: 4 }),
    ])
    expect(result.members[0].trend).toBe('stable')
  })
})

describe('Здоровье участников > Membership intelligence', () => {
  it('нормализует membership поля в health result', () => {
    const result = generateMemberHealth([
      makeInput({
        membershipInfo: {
          membership: 'Open Play Pass - $49.99/Month',
          membershipStatus: 'Currently Active',
          lastVisit: null,
          firstVisit: null,
        },
      }),
    ])

    expect(result.members[0].normalizedMembershipType).toBe('monthly')
    expect(result.members[0].normalizedMembershipStatus).toBe('active')
    expect(result.members[0].membershipSignal).toBe('strong')
    expect(result.members[0].membershipConfidence).toBeGreaterThanOrEqual(80)
  })

  it('использует explicit no-membership как надежный membership signal', () => {
    const result = generateMemberHealth([
      makeInput({
        membershipInfo: {
          membership: null,
          membershipStatus: 'No Membership',
          lastVisit: null,
          firstVisit: null,
        },
      }),
    ])

    expect(result.members[0].normalizedMembershipStatus).toBe('none')
    expect(result.members[0].membershipSignal).toBe('strong')
    expect(result.members[0].suggestedAction).toContain('trial')
  })
})

// ── Score Boundaries ──

describe('Здоровье участников > Валидация границ', () => {
  it('health score всегда в диапазоне 0-100 при любых входных данных', () => {
    // Very bad health
    const bad = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 60, bookingsLastMonth: 0, totalBookings: 5, noShowCount: 3 }),
        previousPeriodBookings: 10,
        bookingDates: [],
      }),
    ])
    expect(bad.members[0].healthScore).toBeGreaterThanOrEqual(0)
    expect(bad.members[0].healthScore).toBeLessThanOrEqual(100)

    // Very good health
    const good = generateMemberHealth([
      makeInput({
        history: makeHistory({ daysSinceLastConfirmedBooking: 1, bookingsLastMonth: 8 }),
        previousPeriodBookings: 4,
        bookingDates: makeBookingDates(10, 3),
      }),
    ])
    expect(good.members[0].healthScore).toBeGreaterThanOrEqual(0)
    expect(good.members[0].healthScore).toBeLessThanOrEqual(100)
  })

  it('сумма весов компонентов = 100', () => {
    const result = generateMemberHealth([makeInput()])
    const c = result.members[0].components
    const totalWeight = c.frequencyTrend.weight + c.recency.weight + c.consistency.weight + c.patternBreak.weight + c.noShowTrend.weight + (c.cancelAcceleration?.weight ?? 0) + (c.sessionDiversity?.weight ?? 0) + (c.coPlayerLoss?.weight ?? 0)
    expect(totalWeight).toBe(100)
  })
})
