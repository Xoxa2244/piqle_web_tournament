import { describe, expect, it } from 'vitest'

import {
  buildProgramFamilySeries,
  granularityFor,
} from '@/lib/ai/program-family-series'
import type { AggregatorSessionRow } from '@/lib/ai/program-family-aggregator'

// Fixed anchor so bucket math is deterministic.
const NOW = new Date('2026-05-28T12:00:00Z')
const CLUB = 'IPC East'

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

function series(
  rows: AggregatorSessionRow[],
  periodDays: number,
  family: Parameters<typeof buildProgramFamilySeries>[1]['family'],
  programKey?: string | null,
) {
  return buildProgramFamilySeries(rows, { now: NOW, periodDays, family, programKey, clubName: CLUB })
}

describe('granularityFor', () => {
  it('≤14d → day', () => {
    expect(granularityFor(7)).toBe('day')
    expect(granularityFor(14)).toBe('day')
  })
  it('15–120d → week', () => {
    expect(granularityFor(15)).toBe('week')
    expect(granularityFor(30)).toBe('week')
    expect(granularityFor(90)).toBe('week')
    expect(granularityFor(120)).toBe('week')
  })
  it('>120d → month', () => {
    expect(granularityFor(121)).toBe('month')
    expect(granularityFor(365)).toBe('month')
  })
})

describe('buildProgramFamilySeries — bucketing', () => {
  it('7d → 7 daily buckets, session lands in the right day', () => {
    const res = series([row({ date: '2026-05-25T12:00:00Z', confirmedCount: 6 })], 7, 'OPEN_PLAY')
    expect(res.granularity).toBe('day')
    expect(res.buckets).toHaveLength(7)
    // periodStart = 05-21 12:00; 05-25 is bin index 4 ("May 25")
    const hit = res.buckets[4]
    expect(hit.label).toBe('May 25')
    expect(hit.participants).toBe(6)
    expect(hit.sessions).toBe(1)
    // all other buckets are zero (gaps render as zero, not missing)
    expect(res.buckets.filter((b) => b.sessions > 0)).toHaveLength(1)
  })

  it('30d → weekly buckets', () => {
    const res = series([row({ date: '2026-05-25T12:00:00Z', confirmedCount: 5 })], 30, 'OPEN_PLAY')
    expect(res.granularity).toBe('week')
    expect(res.buckets).toHaveLength(5) // ceil(30/7)
    const withData = res.buckets.filter((b) => b.sessions > 0)
    expect(withData).toHaveLength(1)
    expect(withData[0].participants).toBe(5)
  })

  it('365d → 13 calendar-month buckets with year-disambiguated labels', () => {
    const res = series([row({ date: '2026-05-25T12:00:00Z' })], 365, 'OPEN_PLAY')
    expect(res.granularity).toBe('month')
    expect(res.buckets).toHaveLength(13) // May'25 … May'26 inclusive
    expect(res.buckets[0].label).toBe("May '25")
    expect(res.buckets[res.buckets.length - 1].label).toBe("May '26")
  })
})

describe('buildProgramFamilySeries — filtering', () => {
  it('only counts the requested family', () => {
    const res = series(
      [
        row({ title: 'Verified Open Play', date: '2026-05-25T12:00:00Z', confirmedCount: 6 }),
        row({ title: 'Intermediate League', format: 'LEAGUE_PLAY', date: '2026-05-25T12:00:00Z', confirmedCount: 9 }),
      ],
      7,
      'OPEN_PLAY',
    )
    expect(res.totals.sessions).toBe(1)
    expect(res.totals.participants).toBe(6) // league excluded
  })

  it('programKey restricts to one program inside the family', () => {
    const res = series(
      [
        row({ title: 'Verified Open Play - Competitive', date: '2026-05-25T12:00:00Z', confirmedCount: 8 }),
        row({ title: 'Verified Open Play - Casual', date: '2026-05-25T12:00:00Z', confirmedCount: 3 }),
      ],
      7,
      'OPEN_PLAY',
      'verified open play - competitive',
    )
    expect(res.programKey).toBe('verified open play - competitive')
    expect(res.totals.participants).toBe(8) // only the competitive program
  })

  it('ignores sessions outside the period', () => {
    const res = series(
      [
        row({ date: '2026-01-01T12:00:00Z', confirmedCount: 99 }), // way before
        row({ date: '2026-05-25T12:00:00Z', confirmedCount: 6 }),
      ],
      7,
      'OPEN_PLAY',
    )
    expect(res.totals.participants).toBe(6)
  })
})

describe('buildProgramFamilySeries — fill rate', () => {
  it('computes fill for organized families', () => {
    const res = series([row({ maxPlayers: 8, confirmedCount: 4, date: '2026-05-25T12:00:00Z' })], 7, 'OPEN_PLAY')
    expect(res.fillRateMeaningful).toBe(true)
    expect(res.totals.fillRate).toBe(50) // 4/8
    expect(res.buckets[4].fillRate).toBe(50)
  })

  it('null fill for self-serve families (court bookings)', () => {
    const res = series(
      [row({ title: 'Singles — Court #4 (IPC East)', format: 'OPEN_PLAY', maxPlayers: 4, confirmedCount: 2, date: '2026-05-25T12:00:00Z' })],
      7,
      'COURT_BOOKING',
    )
    expect(res.fillRateMeaningful).toBe(false)
    expect(res.totals.fillRate).toBeNull()
    expect(res.buckets.every((b) => b.fillRate === null)).toBe(true)
  })
})

describe('buildProgramFamilySeries — totals match buckets', () => {
  it('sums across buckets', () => {
    const res = series(
      [
        row({ date: '2026-05-22T12:00:00Z', confirmedCount: 4 }),
        row({ date: '2026-05-25T12:00:00Z', confirmedCount: 6 }),
        row({ date: '2026-05-27T12:00:00Z', confirmedCount: 5 }),
      ],
      7,
      'OPEN_PLAY',
    )
    const bucketSum = res.buckets.reduce((s, b) => s + b.participants, 0)
    expect(bucketSum).toBe(15)
    expect(res.totals.participants).toBe(15)
    expect(res.totals.sessions).toBe(3)
  })
})
