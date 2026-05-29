import { describe, expect, it } from 'vitest'

import {
  aggregateProgramFamilies,
  type AggregatorSessionRow,
} from '@/lib/ai/program-family-aggregator'

// Fixed anchor so date math is deterministic.
const NOW = new Date('2026-05-28T12:00:00Z')
const PERIOD = 7
// current  = [05-21, 05-28)
// previous = [05-14, 05-21)
const CUR = '2026-05-25T12:00:00Z' // in current period
const PREV = '2026-05-17T12:00:00Z' // in previous period
const CLUB = 'IPC East'

let idCounter = 0
function row(o: Partial<AggregatorSessionRow>): AggregatorSessionRow {
  return {
    id: `s${idCounter++}`,
    title: 'Verified Open Play - Competitive (3.5 - 3.99)',
    format: 'OPEN_PLAY',
    category: null,
    maxPlayers: 8,
    date: CUR,
    confirmedCount: 6,
    ...o,
  }
}

function agg(rows: AggregatorSessionRow[]) {
  return aggregateProgramFamilies(rows, { now: NOW, periodDays: PERIOD, clubName: CLUB })
}

describe('aggregateProgramFamilies', () => {
  it('groups sessions into families', () => {
    const res = agg([
      row({ title: 'Verified Open Play - Competitive', date: CUR }),
      row({ title: 'Private Lesson for 1 — Court #9 (IPC East)', date: CUR }),
      row({ title: 'Intermediate League (Session 3)', format: 'LEAGUE_PLAY', date: CUR }),
    ])
    const fams = res.families.map((f) => f.family).sort()
    expect(fams).toEqual(['LEAGUE', 'OPEN_PLAY', 'PRIVATE_LESSON'])
  })

  it('omits hidden Equipment family', () => {
    const res = agg([
      row({ title: 'Verified Open Play', date: CUR }),
      row({ title: 'Single Person - Ball Machine — Court #9 (IPC East)', date: CUR }),
    ])
    expect(res.families.map((f) => f.family)).not.toContain('EQUIPMENT')
    expect(res.families).toHaveLength(1) // only Open Play
  })

  it('omits empty families (no Events for IPC East)', () => {
    const res = agg([row({ title: 'Verified Open Play', date: CUR })])
    expect(res.families.map((f) => f.family)).not.toContain('EVENTS')
  })

  it('counts sessions + participants per family', () => {
    const res = agg([
      row({ title: 'Verified Open Play', date: CUR, confirmedCount: 6 }),
      row({ title: 'Verified Open Play', date: CUR, confirmedCount: 4 }),
    ])
    const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
    expect(op.sessions).toBe(2)
    expect(op.participants).toBe(10)
  })

  describe('fill rate', () => {
    it('computed for organized families (Open Play)', () => {
      const res = agg([row({ title: 'Verified Open Play', maxPlayers: 8, confirmedCount: 4, date: CUR })])
      const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
      expect(op.fillRate).toBe(50) // 4/8
    })

    it('null for self-serve families (Private Lessons)', () => {
      const res = agg([row({ title: 'Private Lesson for 1', maxPlayers: 1, confirmedCount: 1, date: CUR })])
      const pl = res.families.find((f) => f.family === 'PRIVATE_LESSON')!
      expect(pl.fillRate).toBeNull()
    })
  })

  describe('trend (current vs previous period)', () => {
    it('up when current participants exceed previous', () => {
      const res = agg([
        // previous: 1 session, 4 ppl
        row({ title: 'Verified Open Play', date: PREV, confirmedCount: 4 }),
        // current: 2 sessions, 16 ppl
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 8 }),
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 8 }),
      ])
      const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
      expect(op.trend).not.toBeNull()
      expect(op.trend!.direction).toBe('up')
      expect(op.trend!.deltaPct).toBe(300) // (16-4)/4
    })

    it('down when current participants below previous', () => {
      const res = agg([
        row({ title: 'Verified Open Play', date: PREV, confirmedCount: 10 }),
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 5 }),
      ])
      const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
      expect(op.trend!.direction).toBe('down')
      expect(op.trend!.deltaPct).toBe(-50)
    })

    it('null trend when family had no previous-period data (history gating)', () => {
      const res = agg([
        // current only, but ANOTHER family has prev data so hasComparison=true
        row({ title: 'Private Lesson for 1', date: PREV, confirmedCount: 1 }),
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 6 }),
      ])
      const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
      expect(op.trend).toBeNull() // open play had no prev sessions
    })

    it('hasComparison=false when no previous data at all', () => {
      const res = agg([row({ title: 'Verified Open Play', date: CUR })])
      expect(res.hasComparison).toBe(false)
      expect(res.families[0].trend).toBeNull()
    })
  })

  describe('programs drill-down', () => {
    it('collapses court-number variants into one program', () => {
      const res = agg([
        row({ title: 'Singles — Court #2 (IPC East)', format: 'OPEN_PLAY', date: CUR }),
        row({ title: 'Singles — Court #3 (IPC East)', format: 'OPEN_PLAY', date: CUR }),
        row({ title: 'Singles — Court #9 (IPC East)', format: 'OPEN_PLAY', date: CUR }),
      ])
      const cb = res.families.find((f) => f.family === 'COURT_BOOKING')!
      expect(cb.sessions).toBe(3)
      // all three collapse to one "Singles" program
      expect(cb.programs).toHaveLength(1)
      expect(cb.programs[0].title).toBe('Singles')
      expect(cb.programs[0].sessions).toBe(3)
    })

    it('sorts programs by participants desc', () => {
      const res = agg([
        row({ title: 'Verified Open Play - Casual', date: CUR, confirmedCount: 2 }),
        row({ title: 'Verified Open Play - Competitive', date: CUR, confirmedCount: 9 }),
      ])
      const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
      expect(op.programs[0].participants).toBeGreaterThanOrEqual(op.programs[1].participants)
      expect(op.programs[0].title).toContain('Competitive')
    })
  })

  describe('rollup', () => {
    it('totals sessions + participants across visible families', () => {
      const res = agg([
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 6 }),
        row({ title: 'Private Lesson for 1', date: CUR, confirmedCount: 1 }),
        row({ title: 'Single Person - Ball Machine', date: CUR, confirmedCount: 1 }), // hidden
      ])
      // Ball Machine excluded from rollup (hidden)
      expect(res.rollup.sessions).toBe(2)
      expect(res.rollup.participants).toBe(7)
    })

    it('rollup fill rate uses organized families only', () => {
      const res = agg([
        // organized: 4/8 fill
        row({ title: 'Verified Open Play', maxPlayers: 8, confirmedCount: 4, date: CUR }),
        // private lesson capacity NOT counted toward rollup fill
        row({ title: 'Private Lesson for 1', maxPlayers: 1, confirmedCount: 1, date: CUR }),
      ])
      expect(res.rollup.fillRate).toBe(50) // only the open play 4/8
    })
  })

  it('ignores sessions outside both periods', () => {
    const res = agg([
      row({ title: 'Verified Open Play', date: '2026-01-01T12:00:00Z' }), // way old
      row({ title: 'Verified Open Play', date: CUR }),
    ])
    const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
    expect(op.sessions).toBe(1) // only the current one
  })

  describe('distinct people vs signups', () => {
    it('counts a repeat attendee once per family', () => {
      const res = agg([
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 2, userIds: ['u1', 'u2'] }),
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 2, userIds: ['u1', 'u3'] }), // u1 repeats
      ])
      const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
      expect(op.participants).toBe(4) // signups = total bookings
      expect(op.people).toBe(3) // distinct u1, u2, u3
    })

    it('rollup people is a union across families, not a sum', () => {
      const res = agg([
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 1, userIds: ['u1'] }),
        row({ title: 'Private Lesson for 1', date: CUR, confirmedCount: 1, userIds: ['u1'] }), // same person
      ])
      expect(res.rollup.participants).toBe(2) // signups
      expect(res.rollup.people).toBe(1) // one distinct human across both families
    })

    it('per-program people is distinct within the program', () => {
      const res = agg([
        row({ title: 'Verified Open Play - Casual', date: CUR, confirmedCount: 2, userIds: ['a', 'b'] }),
        row({ title: 'Verified Open Play - Casual', date: CUR, confirmedCount: 1, userIds: ['a'] }),
      ])
      const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
      const casual = op.programs.find((p) => p.title.includes('Casual'))!
      expect(casual.participants).toBe(3) // signups
      expect(casual.people).toBe(2) // a, b
    })

    it('people is 0 when userIds are absent (back-compat)', () => {
      const res = agg([row({ title: 'Verified Open Play', date: CUR, confirmedCount: 5 })])
      const op = res.families.find((f) => f.family === 'OPEN_PLAY')!
      expect(op.participants).toBe(5)
      expect(op.people).toBe(0)
    })
  })
})
