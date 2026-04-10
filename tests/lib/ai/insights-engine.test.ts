import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateClubInsights } from '@/lib/ai/insights-engine'

// ── Mock Prisma ──

function createMockPrisma() {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

beforeEach(() => {
  mockPrisma = createMockPrisma()
})

const CLUB_ID = 'club-1'

// ── underutilizedCourts ──

describe('InsightsEngine > Недоиспользованные корты', () => {
  it('возвращает insight когда корт < 25% заполнения', async () => {
    // First query = underutilizedCourts
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { courtId: 'c1', courtName: 'Court A', bookedSlots: BigInt(2), totalSlots: BigInt(20), occupancyPct: 10 },
      { courtId: 'c2', courtName: 'Court B', bookedSlots: BigInt(15), totalSlots: BigInt(20), occupancyPct: 75 },
    ])

    const insights = await generateClubInsights(mockPrisma, CLUB_ID)

    const courtInsight = insights.find(i => i.type === 'court_optimization')
    expect(courtInsight).toBeDefined()
    expect(courtInsight!.title).toContain('under 25% occupancy')
    expect(courtInsight!.metrics.underutilizedCourts).toBe(1)
    expect(courtInsight!.metrics.lowestOccupancy).toBe(10)
  })

  it('возвращает null когда все корты > 25%', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { courtId: 'c1', courtName: 'Court A', bookedSlots: BigInt(8), totalSlots: BigInt(20), occupancyPct: 40 },
      { courtId: 'c2', courtName: 'Court B', bookedSlots: BigInt(15), totalSlots: BigInt(20), occupancyPct: 75 },
    ])

    const insights = await generateClubInsights(mockPrisma, CLUB_ID)

    const courtInsight = insights.find(i => i.type === 'court_optimization')
    expect(courtInsight).toBeUndefined()
  })

  it('корты отсортированы по имени (не по заполнению)', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { courtId: 'c1', courtName: 'Alpha Court', bookedSlots: BigInt(1), totalSlots: BigInt(20), occupancyPct: 5 },
      { courtId: 'c2', courtName: 'Beta Court', bookedSlots: BigInt(3), totalSlots: BigInt(20), occupancyPct: 15 },
      { courtId: 'c3', courtName: 'Gamma Court', bookedSlots: BigInt(18), totalSlots: BigInt(20), occupancyPct: 90 },
    ])

    const insights = await generateClubInsights(mockPrisma, CLUB_ID)

    const courtInsight = insights.find(i => i.type === 'court_optimization')
    expect(courtInsight).toBeDefined()
    // The worst court should be 'Alpha Court' (first alphabetically among underused)
    expect(courtInsight!.description).toContain('Alpha Court')
  })
})

// ── peakHourOverflow ──

describe('InsightsEngine > Пиковые часы', () => {
  it('возвращает insight когда час > 80% заполнения', async () => {
    // underutilizedCourts = empty (first call)
    // peakHourOverflow = second call
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // underutilizedCourts → no data
      .mockResolvedValueOnce([   // peakHourOverflow
        { hour: 18, sessionCount: BigInt(10), totalBooked: BigInt(85), totalCapacity: BigInt(100), occupancyPct: 85 },
        { hour: 10, sessionCount: BigInt(8), totalBooked: BigInt(40), totalCapacity: BigInt(100), occupancyPct: 40 },
      ])

    const insights = await generateClubInsights(mockPrisma, CLUB_ID)

    const peakInsight = insights.find(i => i.type === 'schedule' && i.title.includes('capacity'))
    expect(peakInsight).toBeDefined()
    expect(peakInsight!.priority).toBe('high')
    expect(peakInsight!.metrics.peakOccupancy).toBe(85)
  })
})

// ── date filtering ──

describe('InsightsEngine > Фильтрация по дате', () => {
  it('все запросы используют ps.date <= NOW() (без будущих сессий)', async () => {
    await generateClubInsights(mockPrisma, CLUB_ID)

    // All $queryRawUnsafe calls should contain "ps.date <= NOW()" or equivalent
    const allCalls = mockPrisma.$queryRawUnsafe.mock.calls
    expect(allCalls.length).toBeGreaterThan(0)

    // Check that queries with date filtering include the upper bound
    for (const [sql] of allCalls) {
      // Queries that use ps.date should have <= NOW() check
      if (sql.includes('ps.date >=')) {
        expect(sql).toContain('ps.date <= NOW()')
      }
    }
  })
})

// ── max insights cap ──

describe('InsightsEngine > Ограничение на количество', () => {
  it('возвращает максимум 10 insights (реальный лимит кода)', async () => {
    // Return data for ALL insight generators to produce results
    // There are 10 generators: underutilizedCourts, peakHourOverflow, vipMembersAtRisk,
    // guestPassUpsell, suspendedWinback, formatMismatch, dayOfWeekGap, newMemberOnboarding,
    // skillProgression, emptyEveningSlots

    // 1. underutilizedCourts
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { courtId: 'c1', courtName: 'A', bookedSlots: BigInt(1), totalSlots: BigInt(20), occupancyPct: 5 },
      { courtId: 'c2', courtName: 'B', bookedSlots: BigInt(18), totalSlots: BigInt(20), occupancyPct: 90 },
    ])
    // 2. peakHourOverflow
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { hour: 18, sessionCount: BigInt(10), totalBooked: BigInt(90), totalCapacity: BigInt(100), occupancyPct: 90 },
    ])
    // 3. vipMembersAtRisk
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { userId: 'u1', membership: 'VIP', dues: '100', lastPlayed: null, daysSincePlayed: 30 },
    ])
    // 4. guestPassUpsell
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { userId: 'u2', membership: 'Guest', bookingCount: BigInt(7) },
    ])
    // 5. suspendedWinback
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { userId: 'u3', membership: 'Standard', lastPlayed: null, recentlyActive: false },
    ])
    // 6. formatMismatch
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { skillLevel: 'BEGINNER', format: 'DOUBLES', sessionCount: BigInt(5), avgOccupancy: 20 },
      { skillLevel: 'ADVANCED', format: 'SINGLES', sessionCount: BigInt(5), avgOccupancy: 80 },
    ])
    // 7. dayOfWeekGap
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { dayName: 'Monday   ', dayNum: 1, sessionCount: BigInt(5), totalBooked: BigInt(10), totalCapacity: BigInt(50), occupancyPct: 20 },
      { dayName: 'Saturday ', dayNum: 6, sessionCount: BigInt(5), totalBooked: BigInt(45), totalCapacity: BigInt(50), occupancyPct: 90 },
    ])
    // 8. newMemberOnboarding
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { userId: 'u4', joinDate: new Date(), bookingCount: BigInt(0) },
    ])
    // 9. skillProgression
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { userId: 'u5', firstLevel: 'BEGINNER', lastLevel: 'INTERMEDIATE' },
    ])
    // 10. emptyEveningSlots
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { totalEvening: BigInt(5), avgOccupancy: 20, emptySlots: BigInt(40) },
    ])

    const insights = await generateClubInsights(mockPrisma, CLUB_ID)

    expect(insights.length).toBeLessThanOrEqual(10)
    expect(insights.length).toBeGreaterThan(0)
  })
})
