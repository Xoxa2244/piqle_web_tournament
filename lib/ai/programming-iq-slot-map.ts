/**
 * Programming IQ — Empty slot map + feasibility cache (Phase B.1 / B.2).
 *
 * Powers the v2 slot-driven pipeline. Used by buildWeeklyGrid_v2 to
 * iterate over (court × day × hour) tuples instead of over candidates.
 *
 * - buildEmptySlotMap:
 *     Returns the set of (court × day × hour) slots that are empty after
 *     subtracting live PlaySessions for the requested week. Hour buckets
 *     align to HH:00 (we evaluate filling on hourly granularity; 90-min
 *     sessions still fit by overlapping into the next hour).
 *
 * - buildFeasibilityCache:
 *     For each empty slot, records which slots are feasible at all
 *     (court active + within inferred operating hours). Phase B has no
 *     format/skill-level feasibility — that belongs to Phase C engagement
 *     work. The cache is a pre-computed bitmap so the per-slot loop in
 *     B.3 stays O(1) per slot.
 *
 * This module is intentionally pure and timezone-light: time arithmetic
 * uses the same HH:MM string convention as the rest of the scheduler
 * (PlaySession.startTime / endTime are local wall-clock strings). Date /
 * dayOfWeek conversion uses the supplied IANA `timezone` parameter so
 * UTC-midnight session dates round to the right local day.
 */

import type {
  DayOfWeek,
  PlaySessionFormat,
  PlaySessionSkillLevel,
} from '@/types/intelligence'
import {
  hhmmToMinutes,
  minutesToHhmm,
  inferCourtOperatingHours,
  dayOfWeekFromDate,
  intervalsOverlap,
  type SchedulerCourt,
  type SchedulerExistingSession,
  type SchedulerHistoricalSession,
} from './programming-iq-scheduler'

const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/** Hour buckets we evaluate. 06–22 covers 99% of observed club operations
 *  (earliest 6am drills, latest 10pm leagues). Outside this band the
 *  slot map records "not feasible — outside band". */
export const SLOT_HOUR_BUCKETS: number[] = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
]

/** A single (court × day × hour) slot. */
export interface SlotKey {
  courtId: string
  courtName: string
  isIndoor: boolean
  dayOfWeek: DayOfWeek
  /** Bucket start hour, e.g. 9 → "09:00" */
  hour: number
  /** "HH:00" — UI label and the time we feed to candidates' startTime. */
  startTime: string
  /** "HH:00" of the next hour. Sessions can be longer; this is just the
   *  bucket boundary, not the session length. */
  endTime: string
}

export interface SlotKeyWithStatus extends SlotKey {
  status: 'live' | 'empty' | 'outside_hours' | 'court_inactive'
  /** When status='live', identifier of the colliding session. */
  liveSessionId?: string | null
  /** When status='empty' but `feasibilityNote` is set, an explanation
   *  the UI can show ("court closes 30 min into this hour", etc.). */
  feasibilityNote?: string | null
}

export interface EmptySlotMap {
  /** All slots in the week, in iteration order. */
  slots: SlotKeyWithStatus[]
  /** Subset where status === 'empty'. Phase B.3 iterates only over these. */
  empty: SlotKey[]
  /** Aggregate counters for the diagnostics endpoint and the operator
   *  transparency row. */
  totals: {
    courts: number
    daysCovered: number
    hourBucketsPerDay: number
    totalSlots: number
    liveSlots: number
    emptySlots: number
    outsideHoursSlots: number
    courtInactiveSlots: number
  }
}

export interface BuildEmptySlotMapInput {
  weekStartDate: Date
  courts: SchedulerCourt[]
  /** Already filtered to the requested week. */
  existingWeekSessions: SchedulerExistingSession[]
  /** Used to infer operating hours per court. */
  historicalSessions: SchedulerHistoricalSession[]
  /** Club's IANA timezone, forwarded to dayOfWeekFromDate so session.date
   *  rounds to the right local day for the live-overlap check. Optional;
   *  the existing scheduler uses the same fallback when absent. */
  timezone?: string
}

/**
 * Build the (court × day × hour) → status table for one week.
 *
 * Determinism: slots are emitted in (courtName, dayOfWeek, hour) order
 * so the v2 pipeline produces stable picks across runs. We sort
 * alphabetically by court name (not id) because UI groups courts by
 * name and admins reading the decision log expect the same order.
 */
export function buildEmptySlotMap(input: BuildEmptySlotMapInput): EmptySlotMap {
  const courts = [...input.courts].sort((a, b) => a.name.localeCompare(b.name))
  const slots: SlotKeyWithStatus[] = []

  // 1. Live overlap pre-index. Each session keyed by court+dayOfWeek; a
  //    session can collide with multiple hour buckets, so we keep a list
  //    per (court, day) and check overlap during the slot loop.
  const liveByCourtDay = new Map<string, SchedulerExistingSession[]>()
  for (const s of input.existingWeekSessions) {
    if (!s.courtId) continue
    const dow = dayOfWeekFromDate(s.date, input.timezone)
    if (!dow) continue
    const key = `${s.courtId}__${dow}`
    if (!liveByCourtDay.has(key)) liveByCourtDay.set(key, [])
    liveByCourtDay.get(key)!.push(s)
  }

  // 2. Operating-hours cache per court. Done once outside the slot loop.
  const opHoursByCourt = new Map<string, { earliestStart: string; latestEnd: string }>()
  for (const c of courts) {
    opHoursByCourt.set(c.id, inferCourtOperatingHours(c.id, input.historicalSessions))
  }

  // 3. The slot loop itself.
  for (const c of courts) {
    const hours = opHoursByCourt.get(c.id)!
    const minStart = hhmmToMinutes(hours.earliestStart)
    const minEnd = hhmmToMinutes(hours.latestEnd)
    for (const dow of DAYS_OF_WEEK) {
      const liveForDay = liveByCourtDay.get(`${c.id}__${dow}`) ?? []
      for (const hour of SLOT_HOUR_BUCKETS) {
        const startTime = minutesToHhmm(hour * 60)
        const endTime = minutesToHhmm((hour + 1) * 60)
        const slot: SlotKey = {
          courtId: c.id,
          courtName: c.name,
          isIndoor: c.isIndoor,
          dayOfWeek: dow,
          hour,
          startTime,
          endTime,
        }

        if (!c.isActive) {
          slots.push({ ...slot, status: 'court_inactive' })
          continue
        }

        // Outside inferred operating hours? Mark and move on.
        const slotStartMin = hour * 60
        const slotEndMin = (hour + 1) * 60
        if (slotEndMin <= minStart || slotStartMin >= minEnd) {
          slots.push({ ...slot, status: 'outside_hours' })
          continue
        }

        // Live session collision?
        const overlap = liveForDay.find((s) =>
          intervalsOverlap(startTime, endTime, s.startTime, s.endTime),
        )
        if (overlap) {
          slots.push({
            ...slot,
            status: 'live',
            liveSessionId: overlap.id,
          })
          continue
        }

        // Operating hours don't fully cover this hour but it overlaps
        // partially. Still mark empty so the v2 path can attempt to
        // fill, but include a note for the UI to surface.
        let feasibilityNote: string | null = null
        if (slotStartMin < minStart) {
          feasibilityNote = `Court typically opens at ${hours.earliestStart}; partial hour`
        } else if (slotEndMin > minEnd) {
          feasibilityNote = `Court typically closes at ${hours.latestEnd}; partial hour`
        }
        slots.push({ ...slot, status: 'empty', feasibilityNote })
      }
    }
  }

  const empty = slots.filter((s) => s.status === 'empty').map(({ status: _s, liveSessionId: _l, feasibilityNote: _f, ...rest }) => rest)
  const totals = slots.reduce(
    (acc, s) => {
      acc.totalSlots += 1
      if (s.status === 'live') acc.liveSlots += 1
      else if (s.status === 'empty') acc.emptySlots += 1
      else if (s.status === 'outside_hours') acc.outsideHoursSlots += 1
      else if (s.status === 'court_inactive') acc.courtInactiveSlots += 1
      return acc
    },
    {
      courts: courts.length,
      daysCovered: DAYS_OF_WEEK.length,
      hourBucketsPerDay: SLOT_HOUR_BUCKETS.length,
      totalSlots: 0,
      liveSlots: 0,
      emptySlots: 0,
      outsideHoursSlots: 0,
      courtInactiveSlots: 0,
    },
  )

  return { slots, empty, totals }
}

// ── Feasibility cache ───────────────────────────────────────────────

export interface FeasibilityCache {
  /** Total empty slots that ANY (format, skill) candidate could fill. */
  totalFeasibleSlots: number
  /** Map from `${courtId}__${dayOfWeek}__${hour}` → true when the slot
   *  is at least nominally fillable. Phase B treats every empty slot as
   *  feasible regardless of format/skill; Phase C will narrow this. */
  isFeasible: (slot: SlotKey) => boolean
  /** Returns the format×skill combinations historically observed in the
   *  same (dayOfWeek, hour) bucket. Used as a hint for candidate
   *  generators in Phase B; in Phase C it becomes the demand signal. */
  shapesForSlot: (slot: SlotKey) => Array<{ format: PlaySessionFormat | string; skill: PlaySessionSkillLevel | string; count: number }>
}

export interface BuildFeasibilityCacheInput {
  emptySlotMap: EmptySlotMap
  historicalSessions: Array<{
    courtId: string | null
    startTime: string
    endTime: string
    /** dayOfWeek when known. When the source row only has a Date, the
     *  caller can pre-compute via dayOfWeekFromDate. */
    dayOfWeek?: DayOfWeek
    format?: PlaySessionFormat | string | null
    skillLevel?: PlaySessionSkillLevel | string | null
  }>
}

/**
 * Phase B.2 — feasibility + shape index.
 *
 * For Phase B (scoring unchanged) this is mostly a fast existence
 * check ("is this empty slot fillable at all?") plus a per-slot
 * shape histogram so the v2 pipeline can prefer historically
 * popular formats when ranking ties.
 *
 * Stays a pure data builder — no DB, no I/O. Tested in isolation.
 */
export function buildFeasibilityCache(
  input: BuildFeasibilityCacheInput,
): FeasibilityCache {
  // Build per-slot shape histogram. Key = "<dayOfWeek>__<hour>" without
  // courtId because format/skill demand is club-wide, not court-wide.
  const shapesByDayHour = new Map<string, Map<string, { format: string; skill: string; count: number }>>()
  for (const s of input.historicalSessions) {
    if (!s.dayOfWeek) continue
    const startMin = hhmmToMinutes(s.startTime)
    if (!Number.isFinite(startMin)) continue
    const hour = Math.floor(startMin / 60)
    const dayHourKey = `${s.dayOfWeek}__${hour}`
    if (!shapesByDayHour.has(dayHourKey)) shapesByDayHour.set(dayHourKey, new Map())
    const fmt = String(s.format ?? 'OPEN_PLAY')
    const skl = String(s.skillLevel ?? 'ALL_LEVELS')
    const shapeKey = `${fmt}__${skl}`
    const tally = shapesByDayHour.get(dayHourKey)!
    const existing = tally.get(shapeKey)
    if (existing) existing.count += 1
    else tally.set(shapeKey, { format: fmt, skill: skl, count: 1 })
  }

  // Empty-slot membership set for O(1) feasibility lookup.
  const emptyKeys = new Set(
    input.emptySlotMap.empty.map((s) => `${s.courtId}__${s.dayOfWeek}__${s.hour}`),
  )

  return {
    totalFeasibleSlots: input.emptySlotMap.totals.emptySlots,
    isFeasible: (slot) =>
      emptyKeys.has(`${slot.courtId}__${slot.dayOfWeek}__${slot.hour}`),
    shapesForSlot: (slot) => {
      const tally = shapesByDayHour.get(`${slot.dayOfWeek}__${slot.hour}`)
      if (!tally) return []
      return Array.from(tally.values()).sort((a, b) => b.count - a.count)
    },
  }
}
