/**
 * Unit tests for Phase B.1 / B.2 of the Programming IQ refactor.
 *
 * Covers:
 *   - buildEmptySlotMap iteration order and status classification
 *   - operating-hours filtering (a court that opens 09:00 should not
 *     surface 06:00–08:00 as empty fillable slots)
 *   - live-session collision detection across 90-minute sessions that
 *     overlap two hour buckets
 *   - inactive courts are excluded entirely
 *   - buildFeasibilityCache returns historically-observed shapes per
 *     (dayOfWeek, hour) and treats unknown buckets as empty arrays
 *
 * No I/O. Fixtures inline. Mirrors the test style used in
 * programming-iq-scheduler.test.ts.
 */

import { describe, it, expect } from 'vitest'
import {
  buildEmptySlotMap,
  buildFeasibilityCache,
  SLOT_HOUR_BUCKETS,
} from '@/lib/ai/programming-iq-slot-map'
import type {
  SchedulerCourt,
  SchedulerExistingSession,
  SchedulerHistoricalSession,
} from '@/lib/ai/programming-iq-scheduler'

const TZ = 'America/New_York'
// Monday 2026-01-05 in UTC (which is also Monday EST — no DST jitter).
const WEEK_START = new Date('2026-01-05T00:00:00.000Z')

function court(id: string, name: string, isActive = true, isIndoor = true): SchedulerCourt {
  return { id, name, isActive, isIndoor }
}

function liveSession(
  args: { id: string; courtId: string; date: Date; startTime: string; endTime: string },
): SchedulerExistingSession {
  return {
    id: args.id,
    courtId: args.courtId,
    date: args.date,
    startTime: args.startTime,
    endTime: args.endTime,
    title: 'Live',
    format: 'OPEN_PLAY' as any,
    skillLevel: 'ALL_LEVELS' as any,
    maxPlayers: 8,
    registeredCount: 4,
    status: 'scheduled',
  }
}

function makeHistory(
  rows: Array<{
    courtId: string
    startTime: string
    endTime: string
    dayOfWeek?: any
    format?: string
    skillLevel?: string
  }>,
): SchedulerHistoricalSession[] {
  return rows.map((r) => ({
    courtId: r.courtId,
    startTime: r.startTime,
    endTime: r.endTime,
  }))
}

describe('buildEmptySlotMap', () => {
  it('emits 16 hour buckets per (court × day) when court has no history (default hours)', () => {
    const courts = [court('c1', 'Court 1')]
    const map = buildEmptySlotMap({
      weekStartDate: WEEK_START,
      courts,
      existingWeekSessions: [],
      historicalSessions: [],
      timezone: TZ,
    })

    expect(map.totals.courts).toBe(1)
    expect(map.totals.daysCovered).toBe(7)
    expect(map.totals.hourBucketsPerDay).toBe(SLOT_HOUR_BUCKETS.length)
    expect(map.totals.totalSlots).toBe(7 * SLOT_HOUR_BUCKETS.length)
    // Default hours are 06:00–23:00, which covers every slot in
    // SLOT_HOUR_BUCKETS (06..21). So outsideHoursSlots is 0 and every
    // bucket is empty.
    expect(map.totals.outsideHoursSlots).toBe(0)
    expect(map.totals.emptySlots).toBe(SLOT_HOUR_BUCKETS.length * 7)
  })

  it('respects inferred operating hours from historical sessions', () => {
    // Court only ever ran sessions 09:00–11:00. With the +-30min cushion
    // this means earliest=08:30, latest=11:30. So 06,07,11..21 are
    // outside_hours; 08,09,10 are within band.
    const courts = [court('c1', 'Court 1')]
    const history = makeHistory(
      // 4 sessions to clear the >=3 history minimum
      [
        { courtId: 'c1', startTime: '09:00', endTime: '11:00' },
        { courtId: 'c1', startTime: '09:00', endTime: '11:00' },
        { courtId: 'c1', startTime: '09:00', endTime: '11:00' },
        { courtId: 'c1', startTime: '09:00', endTime: '11:00' },
      ],
    )
    const map = buildEmptySlotMap({
      weekStartDate: WEEK_START,
      courts,
      existingWeekSessions: [],
      historicalSessions: history,
      timezone: TZ,
    })

    const mondayBuckets = map.slots.filter((s) => s.dayOfWeek === 'Monday')
    const empty = mondayBuckets.filter((s) => s.status === 'empty').map((s) => s.hour).sort()
    const outside = mondayBuckets.filter((s) => s.status === 'outside_hours').map((s) => s.hour).sort()
    // Hours 8, 9, 10, 11 should be within range (11:30 latest catches 11:00 bucket end).
    expect(empty).toContain(8)
    expect(empty).toContain(9)
    expect(empty).toContain(10)
    expect(outside).toContain(6)
    expect(outside).toContain(7)
    expect(outside).toContain(20)
    expect(outside).toContain(21)
  })

  it('marks live-session collisions as live and surfaces sessionId', () => {
    const courts = [court('c1', 'Court 1')]
    // Big history so default-hours don't collapse the band.
    const history = makeHistory([
      { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
      { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
      { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
      { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
    ])
    // Monday session covers 90 minutes 09:00–10:30 — should collide
    // with both the 09:00 and 10:00 buckets.
    const map = buildEmptySlotMap({
      weekStartDate: WEEK_START,
      courts,
      existingWeekSessions: [
        liveSession({
          id: 'live-mon',
          courtId: 'c1',
          // 14:00 EST = 19:00 UTC on 2026-01-05
          date: new Date('2026-01-05T14:00:00.000-05:00'),
          startTime: '09:00',
          endTime: '10:30',
        }),
      ],
      historicalSessions: history,
      timezone: TZ,
    })

    const monday = map.slots.filter(
      (s) => s.dayOfWeek === 'Monday' && (s.hour === 9 || s.hour === 10 || s.hour === 11),
    )
    const nine = monday.find((s) => s.hour === 9)!
    const ten = monday.find((s) => s.hour === 10)!
    const eleven = monday.find((s) => s.hour === 11)!
    expect(nine.status).toBe('live')
    expect(nine.liveSessionId).toBe('live-mon')
    expect(ten.status).toBe('live')
    expect(eleven.status).toBe('empty')
  })

  it('inactive courts are reported but never emitted as empty', () => {
    const courts = [court('c1', 'Court 1', false), court('c2', 'Court 2', true)]
    const map = buildEmptySlotMap({
      weekStartDate: WEEK_START,
      courts,
      existingWeekSessions: [],
      historicalSessions: makeHistory([
        { courtId: 'c2', startTime: '06:00', endTime: '22:00' },
        { courtId: 'c2', startTime: '06:00', endTime: '22:00' },
        { courtId: 'c2', startTime: '06:00', endTime: '22:00' },
      ]),
      timezone: TZ,
    })

    const inactive = map.slots.filter((s) => s.courtId === 'c1')
    expect(inactive.every((s) => s.status === 'court_inactive')).toBe(true)
    expect(map.empty.every((s) => s.courtId !== 'c1')).toBe(true)
    expect(map.totals.courtInactiveSlots).toBe(7 * SLOT_HOUR_BUCKETS.length)
  })

  it('emits slots in stable (courtName, dayOfWeek, hour) order', () => {
    const courts = [court('z2', 'Z Court'), court('a1', 'A Court'), court('m1', 'M Court')]
    const map = buildEmptySlotMap({
      weekStartDate: WEEK_START,
      courts,
      existingWeekSessions: [],
      historicalSessions: [],
      timezone: TZ,
    })

    // First slot must be A Court Monday 06:00.
    expect(map.slots[0].courtName).toBe('A Court')
    expect(map.slots[0].dayOfWeek).toBe('Monday')
    expect(map.slots[0].hour).toBe(6)

    // Last slot must be Z Court Sunday 21:00.
    const last = map.slots[map.slots.length - 1]
    expect(last.courtName).toBe('Z Court')
    expect(last.dayOfWeek).toBe('Sunday')
    expect(last.hour).toBe(21)
  })
})

describe('buildFeasibilityCache', () => {
  it('returns historically observed shapes for the requested (day, hour) bucket', () => {
    const courts = [court('c1', 'Court 1')]
    const slotMap = buildEmptySlotMap({
      weekStartDate: WEEK_START,
      courts,
      existingWeekSessions: [],
      historicalSessions: makeHistory([
        { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
        { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
        { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
      ]),
      timezone: TZ,
    })

    const cache = buildFeasibilityCache({
      emptySlotMap: slotMap,
      historicalSessions: [
        { courtId: 'c1', startTime: '09:00', endTime: '10:00', dayOfWeek: 'Monday', format: 'OPEN_PLAY', skillLevel: 'INTERMEDIATE' },
        { courtId: 'c1', startTime: '09:00', endTime: '10:00', dayOfWeek: 'Monday', format: 'OPEN_PLAY', skillLevel: 'INTERMEDIATE' },
        { courtId: 'c1', startTime: '09:00', endTime: '10:00', dayOfWeek: 'Monday', format: 'CLINIC', skillLevel: 'BEGINNER' },
        { courtId: 'c1', startTime: '18:00', endTime: '19:30', dayOfWeek: 'Wednesday', format: 'OPEN_PLAY', skillLevel: 'ADVANCED' },
      ],
    })

    const slot = slotMap.empty.find((s) => s.dayOfWeek === 'Monday' && s.hour === 9)!
    const shapes = cache.shapesForSlot(slot)
    expect(shapes.length).toBe(2)
    expect(shapes[0]).toMatchObject({ format: 'OPEN_PLAY', skill: 'INTERMEDIATE', count: 2 })
    expect(shapes[1]).toMatchObject({ format: 'CLINIC', skill: 'BEGINNER', count: 1 })

    const tuesdayMorning = slotMap.empty.find((s) => s.dayOfWeek === 'Tuesday' && s.hour === 9)!
    expect(cache.shapesForSlot(tuesdayMorning)).toEqual([])
  })

  it('isFeasible mirrors the empty set', () => {
    const courts = [court('c1', 'Court 1')]
    const slotMap = buildEmptySlotMap({
      weekStartDate: WEEK_START,
      courts,
      existingWeekSessions: [
        liveSession({
          id: 'l1',
          courtId: 'c1',
          date: new Date('2026-01-05T14:00:00.000-05:00'),
          startTime: '09:00',
          endTime: '10:00',
        }),
      ],
      historicalSessions: makeHistory([
        { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
        { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
        { courtId: 'c1', startTime: '06:00', endTime: '22:00' },
      ]),
      timezone: TZ,
    })
    const cache = buildFeasibilityCache({
      emptySlotMap: slotMap,
      historicalSessions: [],
    })

    // Empty 10:00 Monday is feasible.
    const tenMon = {
      courtId: 'c1', courtName: 'Court 1', isIndoor: true,
      dayOfWeek: 'Monday' as const, hour: 10, startTime: '10:00', endTime: '11:00',
    }
    expect(cache.isFeasible(tenMon)).toBe(true)

    // 09:00 Monday is occupied by the live session — not feasible.
    const nineMon = { ...tenMon, hour: 9, startTime: '09:00', endTime: '10:00' }
    expect(cache.isFeasible(nineMon)).toBe(false)

    // totalFeasibleSlots equals empty count.
    expect(cache.totalFeasibleSlots).toBe(slotMap.totals.emptySlots)
  })
})
