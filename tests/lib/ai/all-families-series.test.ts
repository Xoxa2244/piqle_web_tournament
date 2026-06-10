import { describe, expect, it } from 'vitest'

import { buildAllFamiliesSeries } from '@/lib/ai/program-family-series'
import type { AggregatorSessionRow } from '@/lib/ai/program-family-aggregator'

// Fixed anchor so bucket math is deterministic.
const NOW = new Date('2026-05-28T12:00:00Z')

let idCounter = 0
function row(o: Partial<AggregatorSessionRow>): AggregatorSessionRow {
  return {
    id: `s${idCounter++}`,
    title: 'Verified Open Play - Competitive (3.5 - 3.99)',
    format: 'OPEN_PLAY',
    category: null,
    maxPlayers: 8,
    date: '2026-05-25T12:00:00Z',
    confirmedCount: 6,
    ...o,
  }
}

describe('buildAllFamiliesSeries', () => {
  it('buckets multiple families onto one shared axis in one pass', () => {
    const rows = [
      row({ date: '2026-05-25T12:00:00Z', confirmedCount: 6 }), // OPEN_PLAY
      row({ date: '2026-05-26T12:00:00Z', confirmedCount: 4 }), // OPEN_PLAY
      row({ title: 'Beginner Clinic', format: 'CLINIC', date: '2026-05-25T12:00:00Z', confirmedCount: 5 }),
    ]
    const out = buildAllFamiliesSeries(rows, { now: NOW, periodDays: 7 })

    expect(out.granularity).toBe('day')
    expect(out.buckets).toHaveLength(7)

    // Sorted by total participants desc: OPEN_PLAY (10) before CLINIC (5).
    expect(out.families.map((f) => f.family)).toEqual(['OPEN_PLAY', 'CLINIC'])
    expect(out.families[0]).toMatchObject({ sessions: 2, participants: 10 })
    expect(out.families[1]).toMatchObject({ sessions: 1, participants: 5 })

    // Per-bucket totals reconcile with family totals.
    const sum = (fam: string, metric: 'sessions' | 'participants') =>
      out.buckets.reduce((acc, b) => acc + (b.perFamily[fam]?.[metric] ?? 0), 0)
    expect(sum('OPEN_PLAY', 'participants')).toBe(10)
    expect(sum('CLINIC', 'participants')).toBe(5)
    expect(sum('OPEN_PLAY', 'sessions')).toBe(2)
  })

  it('emits zeros (not gaps) for active families in empty buckets', () => {
    const rows = [row({ date: '2026-05-25T12:00:00Z' })]
    const out = buildAllFamiliesSeries(rows, { now: NOW, periodDays: 7 })
    for (const b of out.buckets) {
      expect(b.perFamily.OPEN_PLAY).toBeDefined()
      expect(typeof b.perFamily.OPEN_PLAY.participants).toBe('number')
    }
  })

  it('excludes sessions outside the period and returns no families when empty', () => {
    const rows = [row({ date: '2026-04-01T12:00:00Z' })] // outside 7d window
    const out = buildAllFamiliesSeries(rows, { now: NOW, periodDays: 7 })
    expect(out.families).toHaveLength(0)
    expect(out.buckets.every((b) => Object.keys(b.perFamily).length === 0)).toBe(true)
  })
})
