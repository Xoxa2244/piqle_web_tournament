import { describe, expect, it } from 'vitest'

import { buildProgrammingInsights } from '@/lib/ai/program-family-insights'
import type { AggregatorSessionRow } from '@/lib/ai/program-family-aggregator'

const NOW = new Date('2026-05-28T12:00:00Z')
const PERIOD = 7
const CUR = '2026-05-25T12:00:00Z' // current period
const PREV = '2026-05-17T12:00:00Z' // previous period
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

function build(rows: AggregatorSessionRow[]) {
  return buildProgrammingInsights(rows, { now: NOW, periodDays: PERIOD, clubName: CLUB })
}

describe('buildProgrammingInsights', () => {
  describe('declining', () => {
    it('fires when participants drop vs previous period', () => {
      const ins = build([
        row({ title: 'Verified Open Play', date: PREV, confirmedCount: 100, maxPlayers: 200 }),
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 50, maxPlayers: 90 }),
      ])
      const d = ins.find((i) => i.kind === 'declining' && i.family === 'OPEN_PLAY')
      expect(d).toBeDefined()
      expect(d!.severity).toBe('critical') // −50%
      expect(d!.treatmentGoal).toBe('reengage')
    })

    it('does not fire for a small dip', () => {
      const ins = build([
        row({ title: 'Verified Open Play', date: PREV, confirmedCount: 100, maxPlayers: 200 }),
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 95, maxPlayers: 200 }),
      ])
      expect(ins.find((i) => i.kind === 'declining')).toBeUndefined()
    })
  })

  describe('low_fill', () => {
    it('fires for an under-filled organized family', () => {
      const ins = build([row({ title: 'Verified Open Play', date: CUR, confirmedCount: 2, maxPlayers: 10 })])
      const lf = ins.find((i) => i.kind === 'low_fill' && i.family === 'OPEN_PLAY')
      expect(lf).toBeDefined()
      expect(lf!.severity).toBe('critical') // 20% < 30
      expect(lf!.treatmentGoal).toBe('fill')
    })

    it('does NOT fire for self-serve families (court bookings)', () => {
      const ins = build([
        row({ title: 'Singles — Court #4 (IPC East)', format: 'OPEN_PLAY', date: CUR, confirmedCount: 1, maxPlayers: 4 }),
      ])
      expect(ins.find((i) => i.kind === 'low_fill')).toBeUndefined()
    })
  })

  describe('dead_family', () => {
    it('fires when a family was active last period and is silent now', () => {
      const ins = build([
        row({ title: 'Intermediate League', format: 'LEAGUE_PLAY', date: PREV, confirmedCount: 10 }),
        row({ title: 'Verified Open Play', date: CUR, confirmedCount: 6, maxPlayers: 8 }),
      ])
      const dead = ins.find((i) => i.kind === 'dead_family' && i.family === 'LEAGUE')
      expect(dead).toBeDefined()
      expect(dead!.treatmentGoal).toBe('relaunch')
      // a dead family is not also reported as declining
      expect(ins.find((i) => i.kind === 'declining' && i.family === 'LEAGUE')).toBeUndefined()
    })
  })

  describe('funnel_leak', () => {
    it('fires when beginner Open Play shrinks while overall holds', () => {
      const ins = build([
        row({ title: 'Open Play - Beginner (2.0 - 2.49)', date: PREV, confirmedCount: 20, maxPlayers: 100 }),
        row({ title: 'Open Play - Beginner (2.0 - 2.49)', date: CUR, confirmedCount: 5, maxPlayers: 100 }),
        row({ title: 'Verified Open Play - Advanced', date: PREV, confirmedCount: 80, maxPlayers: 100 }),
        row({ title: 'Verified Open Play - Advanced', date: CUR, confirmedCount: 95, maxPlayers: 100 }),
      ])
      const leak = ins.find((i) => i.kind === 'funnel_leak')
      expect(leak).toBeDefined()
      expect(leak!.treatmentGoal).toBe('intro')
    })
  })

  describe('history gating', () => {
    it('suppresses declining / funnel without previous data, keeps low_fill', () => {
      const ins = build([row({ title: 'Verified Open Play', date: CUR, confirmedCount: 50, maxPlayers: 200 })])
      expect(ins.find((i) => i.kind === 'declining')).toBeUndefined()
      expect(ins.find((i) => i.kind === 'funnel_leak')).toBeUndefined()
      expect(ins.find((i) => i.kind === 'low_fill')).toBeDefined() // 25% — no history needed
    })
  })

  it('emits nothing for a healthy family', () => {
    const ins = build([
      row({ title: 'Verified Open Play', date: PREV, confirmedCount: 70, maxPlayers: 100 }),
      row({ title: 'Verified Open Play', date: CUR, confirmedCount: 75, maxPlayers: 100 }),
    ])
    expect(ins).toHaveLength(0)
  })

  it('sorts critical before warning', () => {
    const ins = build([
      // critical low_fill (Open Play 10%)
      row({ title: 'Verified Open Play', date: CUR, confirmedCount: 1, maxPlayers: 10 }),
      // warning dead_family (clinics active prev, silent now)
      row({ title: 'Drills and Skills Class', date: PREV, confirmedCount: 5 }),
    ])
    expect(ins.length).toBeGreaterThanOrEqual(2)
    expect(ins[0].severity).toBe('critical')
  })
})
