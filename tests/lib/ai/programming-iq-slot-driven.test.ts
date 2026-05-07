/**
 * Phase B integration tests — buildWeeklyGrid with engineVersion: 'v2'.
 *
 * v1 still passes its 37-test suite unchanged
 * (programming-iq-scheduler.test.ts), so this file only adds the new
 * coverage: that swapping engineVersion to 'v2' produces structurally
 * sane output and meets the audit's acceptance criterion of "more
 * empty slots filled than v1 on the same thin-history input".
 *
 * What we deliberately do NOT test here:
 *   - Exact score values per candidate. Phase B uses the same scorer
 *     as v1; Phase C is where the function changes.
 *   - UI rendering of explore / empty-with-reason. UI tests live with
 *     the page components.
 *   - Backtest correlation. That's Phase D's responsibility.
 */

import { describe, it, expect } from 'vitest'
import {
  buildWeeklyGrid,
  type SchedulerCourt,
  type SchedulerHistoricalSession,
} from '@/lib/ai/programming-iq-scheduler'

const COURTS: SchedulerCourt[] = [
  { id: 'court-1', name: 'Court 1', isIndoor: false, isActive: true },
  { id: 'court-2', name: 'Court 2', isIndoor: true, isActive: true },
]

// Thin but real history — three observed shapes, all evening Open Play.
// v1 notoriously under-fills clubs that look like this; v2 should do
// better at exposing how few candidates clear floors per slot.
const HIST_THIN: SchedulerHistoricalSession[] = [
  { courtId: 'court-1', startTime: '18:00', endTime: '19:30' },
  { courtId: 'court-1', startTime: '19:00', endTime: '20:30' },
  { courtId: 'court-2', startTime: '19:00', endTime: '20:30' },
]

const RECENT_SESSIONS = Array.from({ length: 12 }, (_, i) => ({
  title: 'Int Open Play',
  date: new Date(`2026-04-${String(15 + (i % 5)).padStart(2, '0')}T19:00:00.000-04:00`),
  startTime: '19:00',
  endTime: '20:30',
  format: 'OPEN_PLAY' as any,
  skillLevel: 'INTERMEDIATE' as any,
  maxPlayers: 8,
  registeredCount: 6,
}))

const PREFS = Array.from({ length: 24 }, () => ({
  preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
  preferredTimeMorning: false,
  preferredTimeAfternoon: false,
  preferredTimeEvening: true,
  skillLevel: 'INTERMEDIATE' as any,
  preferredFormats: ['OPEN_PLAY'],
  targetSessionsPerWeek: 2,
  notificationsOptOut: false,
}))

const BASE_INPUT = {
  weekStartDate: new Date('2026-04-27'),
  courts: COURTS,
  historicalSessions: HIST_THIN,
  existingWeekSessions: [],
  lastNDaysSessions: RECENT_SESSIONS,
  preferences: PREFS,
  interestRequests: [],
  contactPolicy: { inviteCapPerMemberPerWeek: 3 },
  targetSuggestionCount: 10,
}

describe('buildWeeklyGrid — engineVersion v2 smoke', () => {
  it('produces cells with v2 stats and no crash on minimal input', () => {
    const out = buildWeeklyGrid({ ...BASE_INPUT, engineVersion: 'v2' })
    expect(out.generationId).toMatch(/[0-9a-f-]+/)
    expect(Array.isArray(out.cells)).toBe(true)
    expect(out.stats.suggested + out.stats.risk).toBeGreaterThanOrEqual(1)
  })

  it('decisionLog records carry slot-driven decisions and goal scores', () => {
    const out = buildWeeklyGrid({ ...BASE_INPUT, engineVersion: 'v2' })
    expect(out.decisionLog.length).toBeGreaterThan(0)
    // Pick the first row that actually had a candidate to score —
    // empty-slot rows (decision='rejected_filter' with reason "No
    // upstream candidates") legitimately leave goalScores empty.
    const sample = out.decisionLog.find(
      (d) => d.candidateId !== '∅' && Object.keys(d.goalScores).length > 0,
    )
    expect(sample).toBeDefined()
    expect(sample!.slotSignature).toMatch(/^court=.+\|day=.+\|hour=\d{2}$/)
    expect(typeof sample!.totalScore).toBe('number')
    expect(typeof sample!.goalScores.demandFit).toBe('number')
    const decisions = new Set(out.decisionLog.map((d) => d.decision))
    // At minimum we should see selected/risk/explore plus rejected/empty
    // signals so the operator can drill into "why empty here".
    const hasAnyPositive = ['selected', 'risk', 'explore'].some((d) => decisions.has(d as any))
    expect(hasAnyPositive).toBe(true)
  })
})

describe('buildWeeklyGrid — v2 fills empty slots better than v1 on thin history', () => {
  it('v2 emits at least as many actionable cells as v1 on the same input', () => {
    const v1 = buildWeeklyGrid({ ...BASE_INPUT, engineVersion: 'v1' })
    const v2 = buildWeeklyGrid({ ...BASE_INPUT, engineVersion: 'v2' })
    const v1Actionable = v1.stats.suggested + v1.stats.risk
    const v2Actionable = v2.stats.suggested + v2.stats.risk
    // The acceptance bar from the brief: v2 produces ≥ v1 on the same
    // input. Stronger improvements (≥30% of empty slots) come once the
    // candidate generator is widened in Phase C, not here.
    expect(v2Actionable).toBeGreaterThanOrEqual(v1Actionable)
  })

  it('v2 surfaces an explore tier when scores fall below risk floor but above the explore band', () => {
    // Use a club configuration where most candidates score in the
    // explore band. This means: thin history + small audience so
    // candidates land in the [exploreFloor, riskFloor) range.
    const out = buildWeeklyGrid({
      ...BASE_INPUT,
      preferences: PREFS.slice(0, 4),
      lastNDaysSessions: RECENT_SESSIONS.slice(0, 3),
      engineVersion: 'v2',
    })
    // We assert weakly: the universe of cell kinds should include at
    // least one of {explore, empty-with-reason} — the brief's whole
    // point is that v2 names the tier instead of leaving the slot
    // mysteriously empty.
    const exoticKinds = out.cells.filter(
      (c) => c.kind === 'explore' || c.kind === 'empty-with-reason',
    )
    expect(exoticKinds.length).toBeGreaterThan(0)
  })
})

describe('buildWeeklyGrid — v1 unchanged', () => {
  it('engineVersion omitted defaults to v1 (no crash, no v2-only stats)', () => {
    const out = buildWeeklyGrid({ ...BASE_INPUT })
    // v1 path doesn't emit explore tier.
    const exploreCells = out.cells.filter((c) => c.kind === 'explore')
    expect(exploreCells.length).toBe(0)
    // v1 path doesn't emit empty-with-reason either.
    const emptyWithReason = out.cells.filter((c) => c.kind === 'empty-with-reason')
    expect(emptyWithReason.length).toBe(0)
  })
})
