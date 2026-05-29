/**
 * Program-family time-series — Programming Health redesign Phase 1 (§1f-i).
 *
 * Powers the drill-down chart modal: given a family (and optionally one
 * normalized program inside it), bucket the period's sessions into a line
 * series (participants / fill / sessions per bucket).
 *
 * Pure + DB-free so it's unit-testable; the tRPC endpoint just loads the
 * window and hands rows here — same split as aggregateProgramFamilies().
 *
 * Bucket granularity (redesign doc §5):
 *   - ≤14d  → daily   (7d view = 7 points)
 *   - ≤120d → weekly  (30d / 90d views)
 *   - else  → monthly (1y view = 12 calendar months)
 *
 * Empty buckets are emitted as zeros (not omitted) so a decline reads as a
 * line sloping to zero rather than a gap.
 */

import {
  classifyProgramFamily,
  PROGRAM_FAMILY_META,
  type ProgramFamily,
} from './program-family-classifier'
import { programGroupKey } from './program-title-normalizer'
import type { AggregatorSessionRow } from './program-family-aggregator'

export type SeriesGranularity = 'day' | 'week' | 'month'

export interface SeriesBucket {
  /** ISO date (YYYY-MM-DD, UTC) of the bucket start. */
  start: string
  /** Short display label, e.g. "May 21" (day/week) or "May" (month). */
  label: string
  sessions: number
  participants: number
  /** null when fill isn't meaningful for this family, or capacity is 0. */
  fillRate: number | null
}

export interface ProgramSeriesResult {
  family: ProgramFamily
  /** null = whole-family series; otherwise a single program inside it. */
  programKey: string | null
  granularity: SeriesGranularity
  periodDays: number
  fillRateMeaningful: boolean
  buckets: SeriesBucket[]
  /** Period totals — match the family/program card that opened the modal. */
  totals: { sessions: number; participants: number; fillRate: number | null }
}

const DAY_MS = 86_400_000

export function granularityFor(periodDays: number): SeriesGranularity {
  if (periodDays <= 14) return 'day'
  if (periodDays <= 120) return 'week'
  return 'month'
}

function fillRate(registered: number, capacity: number): number | null {
  if (capacity <= 0) return null
  return Math.round((registered / capacity) * 100)
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function monthLabel(d: Date): string {
  // Include a 2-digit year so a 1y view (13 calendar months) doesn't show two
  // bare "May" ticks at both ends.
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${mon} '${String(d.getUTCFullYear()).slice(2)}`
}

interface Accum {
  start: Date
  label: string
  sessions: number
  participants: number
  registered: number
  capacity: number
}

/** Build the (empty) bucket skeleton spanning [periodStart, now). */
function makeBuckets(periodStart: Date, now: Date, granularity: SeriesGranularity): Accum[] {
  const out: Accum[] = []
  if (granularity === 'month') {
    // Calendar months from periodStart's month to now's month (UTC).
    let y = periodStart.getUTCFullYear()
    let m = periodStart.getUTCMonth()
    const endY = now.getUTCFullYear()
    const endM = now.getUTCMonth()
    while (y < endY || (y === endY && m <= endM)) {
      const start = new Date(Date.UTC(y, m, 1))
      out.push({ start, label: monthLabel(start), sessions: 0, participants: 0, registered: 0, capacity: 0 })
      m++
      if (m > 11) {
        m = 0
        y++
      }
    }
    return out
  }
  // Fixed-width bins (day = 1, week = 7) anchored at periodStart.
  const binDays = granularity === 'day' ? 1 : 7
  const binMs = binDays * DAY_MS
  const span = now.getTime() - periodStart.getTime()
  const numBins = Math.max(1, Math.ceil(span / binMs))
  for (let i = 0; i < numBins; i++) {
    const start = new Date(periodStart.getTime() + i * binMs)
    out.push({ start, label: dayLabel(start), sessions: 0, participants: 0, registered: 0, capacity: 0 })
  }
  return out
}

/** Which bucket index does date `d` fall into? */
function bucketIndex(
  d: Date,
  periodStart: Date,
  granularity: SeriesGranularity,
  numBins: number,
): number {
  if (granularity === 'month') {
    return (
      (d.getUTCFullYear() - periodStart.getUTCFullYear()) * 12 +
      (d.getUTCMonth() - periodStart.getUTCMonth())
    )
  }
  const binMs = (granularity === 'day' ? 1 : 7) * DAY_MS
  const idx = Math.floor((d.getTime() - periodStart.getTime()) / binMs)
  return idx >= numBins ? numBins - 1 : idx // clamp the trailing partial bin
}

/**
 * Bucket a family's (or program's) sessions into a time series.
 *
 * @param rows  sessions across (at least) the current period
 * @param opts.family     which family to chart
 * @param opts.programKey optional — restrict to one normalized program
 * @param opts.periodDays current-period length
 * @param opts.now        anchor (defaults to now)
 * @param opts.clubName   for program-key normalization
 */
export function buildProgramFamilySeries(
  rows: AggregatorSessionRow[],
  opts: {
    now?: Date
    periodDays: number
    family: ProgramFamily
    programKey?: string | null
    clubName?: string | null
  },
): ProgramSeriesResult {
  const now = opts.now ?? new Date()
  const periodStart = new Date(now.getTime() - opts.periodDays * DAY_MS)
  const granularity = granularityFor(opts.periodDays)
  const fillMeaningful = PROGRAM_FAMILY_META[opts.family].fillRateMeaningful
  const programKey = opts.programKey ?? null

  const buckets = makeBuckets(periodStart, now, granularity)

  let totReg = 0
  let totCap = 0
  let totSessions = 0
  let totParticipants = 0

  for (const row of rows) {
    const d = row.date instanceof Date ? row.date : new Date(row.date)
    if (d < periodStart || d >= now) continue
    if (classifyProgramFamily({ title: row.title, format: row.format, category: row.category }) !== opts.family) {
      continue
    }
    if (programKey) {
      const key = programGroupKey(row.title, opts.clubName) || '(untitled)'
      if (key !== programKey) continue
    }
    const idx = bucketIndex(d, periodStart, granularity, buckets.length)
    if (idx < 0 || idx >= buckets.length) continue
    const participants = row.confirmedCount ?? 0
    const capacity = row.maxPlayers ?? 0
    const b = buckets[idx]
    b.sessions++
    b.participants += participants
    b.registered += participants
    b.capacity += capacity
    totSessions++
    totParticipants += participants
    totReg += participants
    totCap += capacity
  }

  return {
    family: opts.family,
    programKey,
    granularity,
    periodDays: opts.periodDays,
    fillRateMeaningful: fillMeaningful,
    buckets: buckets.map((b) => ({
      start: isoDay(b.start),
      label: b.label,
      sessions: b.sessions,
      participants: b.participants,
      fillRate: fillMeaningful ? fillRate(b.registered, b.capacity) : null,
    })),
    totals: {
      sessions: totSessions,
      participants: totParticipants,
      fillRate: fillMeaningful ? fillRate(totReg, totCap) : null,
    },
  }
}
