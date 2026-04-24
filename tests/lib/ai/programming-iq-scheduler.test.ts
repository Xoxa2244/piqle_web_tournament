/**
 * Unit tests for the Programming IQ scheduler — pure-function layer that
 * sits between the 7-signal demand scorer (advisor-programming.ts) and
 * the UI grid.
 *
 * Cases we pin:
 *   • Time helpers (hhmm / intervals) for the conflict-detection code
 *     paths that `assignCourtsToProposals` leans on.
 *   • Operating-hours inference — key signal for "don't suggest 11pm
 *     on a court that's never run past 9pm".
 *   • Court assignment — avoids overlap with live sessions, doesn't
 *     cluster same-skill on adjacent courts, honours indoor preference
 *     for evening slots, and spreads cells across courts.
 *   • Supply/demand check — the pool-saturation warning shown in the
 *     UI before admin publishes.
 *   • Full buildWeeklyGrid smoke — cells come out with the expected
 *     kinds for a minimal but realistic input.
 */

import { describe, it, expect } from 'vitest'
import {
  hhmmToMinutes,
  minutesToHhmm,
  intervalsOverlap,
  dayOfWeekFromDate,
  inferCourtOperatingHours,
  assignCourtsToProposals,
  supplyDemandCheck,
  buildWeeklyGrid,
  type SchedulerCourt,
  type SchedulerExistingSession,
  type SchedulerHistoricalSession,
  type SchedulerPreferenceRow,
  type GridCell,
} from '@/lib/ai/programming-iq-scheduler'
import type { AdvisorProgrammingProposalDraft } from '@/lib/ai/advisor-programming'

describe('time helpers', () => {
  it('hhmmToMinutes parses 24h format', () => {
    expect(hhmmToMinutes('00:00')).toBe(0)
    expect(hhmmToMinutes('06:30')).toBe(390)
    expect(hhmmToMinutes('19:45')).toBe(19 * 60 + 45)
    expect(hhmmToMinutes('23:59')).toBe(23 * 60 + 59)
  })

  it('hhmmToMinutes returns NaN for garbage so callers can guard', () => {
    expect(Number.isNaN(hhmmToMinutes(''))).toBe(true)
    expect(Number.isNaN(hhmmToMinutes(null))).toBe(true)
    expect(Number.isNaN(hhmmToMinutes('no'))).toBe(true)
  })

  it('minutesToHhmm round-trips', () => {
    expect(minutesToHhmm(0)).toBe('00:00')
    expect(minutesToHhmm(7 * 60 + 15)).toBe('07:15')
    expect(minutesToHhmm(19 * 60 + 45)).toBe('19:45')
  })

  it('intervalsOverlap — clear overlap', () => {
    expect(intervalsOverlap('10:00', '11:00', '10:30', '11:30')).toBe(true)
  })

  it('intervalsOverlap — touching edges do NOT overlap', () => {
    expect(intervalsOverlap('10:00', '11:00', '11:00', '12:00')).toBe(false)
  })

  it('intervalsOverlap — far apart', () => {
    expect(intervalsOverlap('10:00', '11:00', '14:00', '15:00')).toBe(false)
  })

  it('dayOfWeekFromDate — handles week boundaries', () => {
    // 2026-04-27 is a Monday
    expect(dayOfWeekFromDate(new Date('2026-04-27T10:00:00Z'))).toBe('Monday')
    expect(dayOfWeekFromDate(new Date('2026-05-02T10:00:00Z'))).toBe('Saturday')
    expect(dayOfWeekFromDate(new Date('2026-05-03T10:00:00Z'))).toBe('Sunday')
  })
})

describe('inferCourtOperatingHours', () => {
  it('falls back to 06:00-23:00 with no history', () => {
    const out = inferCourtOperatingHours('court-1', [])
    expect(out.earliestStart).toBe('06:00')
    expect(out.latestEnd).toBe('23:00')
  })

  it('falls back to default when < 3 sessions (not enough data)', () => {
    const out = inferCourtOperatingHours('court-1', [
      { courtId: 'court-1', startTime: '10:00', endTime: '11:00' },
      { courtId: 'court-1', startTime: '12:00', endTime: '13:00' },
    ])
    expect(out.earliestStart).toBe('06:00')
  })

  it('infers hours from observed min-start / max-end with 30-min cushion', () => {
    const hist: SchedulerHistoricalSession[] = [
      { courtId: 'court-1', startTime: '08:30', endTime: '09:30' },
      { courtId: 'court-1', startTime: '10:00', endTime: '11:00' },
      { courtId: 'court-1', startTime: '19:00', endTime: '20:30' },
      // other court should be ignored
      { courtId: 'court-2', startTime: '04:00', endTime: '23:00' },
    ]
    const out = inferCourtOperatingHours('court-1', hist)
    // Min 08:30 → rounded down to 08:00 (minus 30min cushion, snap to 00/30)
    expect(hhmmToMinutes(out.earliestStart)).toBeLessThanOrEqual(hhmmToMinutes('08:30'))
    // Max 20:30 → rounded up to 21:00 or later
    expect(hhmmToMinutes(out.latestEnd)).toBeGreaterThanOrEqual(hhmmToMinutes('20:30'))
    // Unaffected by other court's history
    expect(hhmmToMinutes(out.earliestStart)).toBeGreaterThan(hhmmToMinutes('04:00'))
  })
})

// ── Fixtures for assignment + grid tests ──────────────────────────

const COURTS: SchedulerCourt[] = [
  { id: 'court-1', name: 'Court 1', isIndoor: false, isActive: true },
  { id: 'court-2', name: 'Court 2', isIndoor: true, isActive: true },
  { id: 'court-3', name: 'Court 3', isIndoor: false, isActive: true },
  { id: 'court-inactive', name: 'Court X', isIndoor: true, isActive: false },
]

// Plentiful historical data so operating hours are well-populated
const HIST_PLENTY: SchedulerHistoricalSession[] = [
  { courtId: 'court-1', startTime: '07:00', endTime: '09:00' },
  { courtId: 'court-1', startTime: '18:00', endTime: '20:00' },
  { courtId: 'court-1', startTime: '19:00', endTime: '21:00' },
  { courtId: 'court-2', startTime: '08:00', endTime: '10:00' },
  { courtId: 'court-2', startTime: '19:00', endTime: '21:30' },
  { courtId: 'court-2', startTime: '20:00', endTime: '22:00' },
  { courtId: 'court-3', startTime: '09:00', endTime: '11:00' },
  { courtId: 'court-3', startTime: '18:00', endTime: '20:00' },
  { courtId: 'court-3', startTime: '19:00', endTime: '21:00' },
]

function proposal(overrides: Partial<AdvisorProgrammingProposalDraft> = {}): AdvisorProgrammingProposalDraft {
  return {
    id: overrides.id || 'p-1',
    title: overrides.title || 'Test session',
    dayOfWeek: overrides.dayOfWeek || 'Tuesday',
    timeSlot: overrides.timeSlot || 'evening',
    startTime: overrides.startTime || '19:00',
    endTime: overrides.endTime || '20:30',
    format: overrides.format || 'OPEN_PLAY',
    skillLevel: overrides.skillLevel || 'INTERMEDIATE',
    maxPlayers: overrides.maxPlayers || 8,
    projectedOccupancy: overrides.projectedOccupancy || 75,
    estimatedInterestedMembers: overrides.estimatedInterestedMembers || 20,
    confidence: overrides.confidence || 70,
    source: overrides.source || 'expand_peak',
    rationale: overrides.rationale || ['test'],
    conflict: overrides.conflict,
  }
}

describe('assignCourtsToProposals', () => {
  it('assigns to an active court when no conflicts exist', () => {
    const assignments = assignCourtsToProposals(
      [proposal()], COURTS, [], HIST_PLENTY, new Date('2026-04-27'),
    )
    expect(assignments).toHaveLength(1)
    expect(assignments[0].failed).toBeUndefined()
    expect(['court-1', 'court-2', 'court-3']).toContain(assignments[0].courtId)
  })

  it('never picks an inactive court', () => {
    const onlyInactive: SchedulerCourt[] = [{ id: 'x', name: 'X', isIndoor: true, isActive: false }]
    const assignments = assignCourtsToProposals(
      [proposal()], onlyInactive, [], [], new Date('2026-04-27'),
    )
    expect(assignments[0].failed).toBe('no_court')
  })

  it('skips a court with an overlapping live session on the same day', () => {
    // Live session on court-1 Tuesday 19:00-20:30 — proposal wants the same slot.
    const live: SchedulerExistingSession[] = [{
      id: 'live-1',
      courtId: 'court-1',
      date: new Date('2026-04-28T00:00:00Z'), // Tuesday
      startTime: '19:00',
      endTime: '20:30',
      title: 'Existing',
      format: 'OPEN_PLAY' as any,
      skillLevel: 'INTERMEDIATE' as any,
      maxPlayers: 8,
      status: 'SCHEDULED',
    }]
    const assignments = assignCourtsToProposals(
      [proposal({ dayOfWeek: 'Tuesday', startTime: '19:00', endTime: '20:30' })],
      COURTS, live, HIST_PLENTY, new Date('2026-04-27'),
    )
    expect(assignments[0].failed).toBeUndefined()
    expect(assignments[0].courtId).not.toBe('court-1')
  })

  it('prefers indoor courts for evening (≥17:00) slots', () => {
    const assignments = assignCourtsToProposals(
      [proposal({ startTime: '19:00', endTime: '20:30' })],
      COURTS, [], HIST_PLENTY, new Date('2026-04-27'),
    )
    // court-2 is the only indoor court → should be picked first.
    expect(assignments[0].courtId).toBe('court-2')
  })

  it('does not cluster same-skill proposals on adjacent courts at overlapping times', () => {
    // Two Intermediate evening proposals in the same day — bin-packer should
    // route them to different courts so slot-filler pools don't overlap.
    const proposals = [
      proposal({ id: 'p1', dayOfWeek: 'Tuesday', startTime: '19:00', endTime: '20:30' }),
      proposal({ id: 'p2', dayOfWeek: 'Tuesday', startTime: '19:30', endTime: '21:00' }),
    ]
    const assignments = assignCourtsToProposals(
      proposals, COURTS, [], HIST_PLENTY, new Date('2026-04-27'),
    )
    // Both should be placed — just on different courts.
    expect(assignments[0].failed).toBeUndefined()
    expect(assignments[1].failed).toBeUndefined()
    expect(assignments[0].courtId).not.toBe(assignments[1].courtId)
  })

  it('rejects a proposal outside inferred court hours', () => {
    // Make court-1 history tight 08:00-14:00 only — proposal at 22:00 is outside.
    const tight: SchedulerHistoricalSession[] = [
      { courtId: 'court-1', startTime: '08:00', endTime: '10:00' },
      { courtId: 'court-1', startTime: '12:00', endTime: '14:00' },
      { courtId: 'court-1', startTime: '13:00', endTime: '14:00' },
    ]
    const onlyCourt1: SchedulerCourt[] = [COURTS[0]]
    const assignments = assignCourtsToProposals(
      [proposal({ startTime: '22:00', endTime: '23:30' })],
      onlyCourt1, [], tight, new Date('2026-04-27'),
    )
    expect(assignments[0].failed).toBe('outside_hours')
  })

  it('spreads cells across courts when demand is similar', () => {
    // Five proposals at different times → should land on a mix of courts,
    // not all on court-1.
    const proposals = Array.from({ length: 5 }, (_, i) => proposal({
      id: `p-${i}`,
      startTime: minutesToHhmm(19 * 60 + i * 10), // 19:00, 19:10, 19:20, ...
      endTime: minutesToHhmm(19 * 60 + 90 + i * 10),
      dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday'][i] as any,
    }))
    const assignments = assignCourtsToProposals(
      proposals, COURTS, [], HIST_PLENTY, new Date('2026-04-27'),
    )
    const unique = new Set(assignments.map((a) => a.courtId))
    expect(unique.size).toBeGreaterThan(1)
  })
})

describe('supplyDemandCheck', () => {
  const policy = { inviteCapPerMemberPerWeek: 3 }

  const intPrefs: SchedulerPreferenceRow[] = Array.from({ length: 10 }, () => ({
    preferredDays: ['Monday'],
    preferredTimeMorning: false,
    preferredTimeAfternoon: false,
    preferredTimeEvening: true,
    skillLevel: 'INTERMEDIATE' as any,
    preferredFormats: ['OPEN_PLAY'],
    targetSessionsPerWeek: 2,
    notificationsOptOut: false,
  }))

  it('no warnings when capacity << pool × cap', () => {
    // 10 members × 3 invites/wk = 30 capacity budget.
    // Two sessions × 8 cap × 1.5 overbook = 24 invites → safe.
    const cells: GridCell[] = [
      cellSuggested('c-1', 'INTERMEDIATE', 8),
      cellSuggested('c-2', 'INTERMEDIATE', 8),
    ]
    const warnings = supplyDemandCheck(cells, intPrefs, policy)
    expect(warnings.size).toBe(0)
  })

  it('flags saturation when capacity > pool × cap', () => {
    // Same pool (10 × 3 = 30 budget). Four sessions × 8 × 1.5 = 48 → over.
    const cells: GridCell[] = [
      cellSuggested('c-1', 'INTERMEDIATE', 8),
      cellSuggested('c-2', 'INTERMEDIATE', 8),
      cellSuggested('c-3', 'INTERMEDIATE', 8),
      cellSuggested('c-4', 'INTERMEDIATE', 8),
    ]
    const warnings = supplyDemandCheck(cells, intPrefs, policy)
    expect(warnings.size).toBe(4)
    for (const msg of Array.from(warnings.values())) {
      expect(msg.toLowerCase()).toContain('saturated')
    }
  })

  it('skips opt-outs from the pool count', () => {
    const allOut = intPrefs.map((p) => ({ ...p, notificationsOptOut: true }))
    const cells: GridCell[] = [cellSuggested('c-1', 'INTERMEDIATE', 8)]
    const warnings = supplyDemandCheck(cells, allOut, policy)
    // No members in pool → no warnings emitted (we'd divide by zero otherwise).
    expect(warnings.size).toBe(0)
  })
})

describe('buildWeeklyGrid — smoke', () => {
  it('produces suggested + live cells without crashing on minimal input', () => {
    const out = buildWeeklyGrid({
      weekStartDate: new Date('2026-04-27'),
      courts: COURTS,
      historicalSessions: HIST_PLENTY,
      existingWeekSessions: [],
      lastNDaysSessions: Array.from({ length: 20 }, (_, i) => ({
        title: 'Int Open Play',
        date: new Date('2026-04-15'),
        startTime: '19:00',
        endTime: '20:30',
        format: 'OPEN_PLAY' as any,
        skillLevel: 'INTERMEDIATE' as any,
        maxPlayers: 8,
        registeredCount: 7,
      })),
      preferences: Array.from({ length: 30 }, () => ({
        preferredDays: ['Monday', 'Tuesday'],
        preferredTimeMorning: false,
        preferredTimeAfternoon: false,
        preferredTimeEvening: true,
        skillLevel: 'INTERMEDIATE' as any,
        preferredFormats: ['OPEN_PLAY'],
        targetSessionsPerWeek: 2,
        notificationsOptOut: false,
      })),
      interestRequests: [],
      contactPolicy: { inviteCapPerMemberPerWeek: 3 },
      targetSuggestionCount: 10,
    })

    expect(out.generationId).toMatch(/[0-9a-f-]+/)
    expect(Array.isArray(out.cells)).toBe(true)
    expect(out.stats.suggested).toBeGreaterThanOrEqual(1)
    expect(out.signalSummary.activeCourts).toBe(3) // 4 courts, 1 inactive
  })
})

// ── Helpers ────────────────────────────────────────────────────────

function cellSuggested(key: string, skill: string, cap: number): GridCell {
  return {
    key,
    kind: 'suggested',
    courtId: 'court-1',
    courtName: 'Court 1',
    dayOfWeek: 'Tuesday',
    startTime: '19:00',
    endTime: '20:30',
    format: 'OPEN_PLAY' as any,
    skillLevel: skill as any,
    maxPlayers: cap,
    projectedOccupancy: 80,
    confidence: 70,
    rationale: [],
  }
}
