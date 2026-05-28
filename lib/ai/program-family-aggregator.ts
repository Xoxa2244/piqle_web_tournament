/**
 * Program Family aggregator — Programming Health redesign Phase 1 (§1c).
 *
 * Pure aggregation over raw session rows → the family/program structure
 * the Programming Health page renders. Kept separate from the tRPC
 * endpoint so it's unit-testable without a DB: the endpoint just runs
 * the SQL and hands rows here.
 *
 * Two-period model for trends:
 *   - current  = [now − periodDays, now)
 *   - previous = [now − 2·periodDays, now − periodDays)
 * Caller loads BOTH periods (a 2·periodDays window) in one query; this
 * function splits them by date and computes a delta.
 *
 * History gating (§9): if a family had no sessions in the previous
 * period, its trend is null ("insufficient history") instead of a
 * misleading +∞%.
 *
 * Fill rate (§9): only computed for families where it's meaningful
 * (organized programs). Court bookings / private / equipment report
 * fillRate = null — they're booked to capacity by definition.
 */

import {
  classifyProgramFamily,
  PROGRAM_FAMILY_META,
  ALL_FAMILIES,
  type ProgramFamily,
  type FamilyMeta,
} from './program-family-classifier'
import { normalizeProgramTitle, programGroupKey } from './program-title-normalizer'

/** One session row as loaded from play_sessions + booking count. */
export interface AggregatorSessionRow {
  id: string
  title: string | null
  format: string | null
  category: string | null
  maxPlayers: number | null
  /** ISO string or Date. */
  date: string | Date
  /** Confirmed bookings for this session (pre-aggregated in SQL). */
  confirmedCount: number
}

export interface TrendInfo {
  /** % change current vs previous period, rounded. */
  deltaPct: number
  direction: 'up' | 'down' | 'flat'
}

export interface ProgramRow {
  /** Normalized display title (court #s / club name / session # stripped). */
  title: string
  sessions: number
  participants: number
  /** null when the family's fill rate isn't meaningful. */
  fillRate: number | null
  trend: TrendInfo | null
}

export interface FamilyHealth {
  family: ProgramFamily
  label: string
  emoji: string
  color: string
  bg: string
  border: string
  hidden: boolean
  fillRateMeaningful: boolean
  sessions: number
  participants: number
  fillRate: number | null
  trend: TrendInfo | null
  /** Drill-down: programs (normalized titles) inside this family, by
   *  participants desc. */
  programs: ProgramRow[]
}

export interface ProgrammingHealthResult {
  periodDays: number
  /** False when previous period has no data at all → suppress all trends. */
  hasComparison: boolean
  rollup: {
    sessions: number
    participants: number
    /** Across organized families only (fill-meaningful). null if none. */
    fillRate: number | null
  }
  /** Visible families in display order; empty families omitted. */
  families: FamilyHealth[]
}

interface Bucket {
  curSessions: number
  curParticipants: number
  curRegistered: number
  curCapacity: number
  prevSessions: number
  prevParticipants: number
}

function newBucket(): Bucket {
  return {
    curSessions: 0,
    curParticipants: 0,
    curRegistered: 0,
    curCapacity: 0,
    prevSessions: 0,
    prevParticipants: 0,
  }
}

function computeTrend(cur: number, prev: number, hasComparison: boolean): TrendInfo | null {
  // No previous-period data at all → can't compute a trend.
  if (!hasComparison || prev <= 0) return null
  const deltaPct = Math.round(((cur - prev) / prev) * 100)
  const direction = deltaPct > 2 ? 'up' : deltaPct < -2 ? 'down' : 'flat'
  return { deltaPct, direction }
}

function fillRate(registered: number, capacity: number): number | null {
  if (capacity <= 0) return null
  return Math.round((registered / capacity) * 100)
}

/**
 * Aggregate raw session rows into the Programming Health structure.
 *
 * @param rows     sessions across the 2·periodDays window
 * @param opts.now anchor "now" (defaults to current time)
 * @param opts.periodDays current-period length in days
 * @param opts.clubName for title normalization (strips "(Club Name)")
 */
export function aggregateProgramFamilies(
  rows: AggregatorSessionRow[],
  opts: { now?: Date; periodDays: number; clubName?: string | null },
): ProgrammingHealthResult {
  const now = opts.now ?? new Date()
  const periodMs = opts.periodDays * 86_400_000
  const currentStart = new Date(now.getTime() - periodMs)
  const previousStart = new Date(now.getTime() - 2 * periodMs)

  // Per-family aggregate + per-program (normalized title) aggregate.
  const familyBuckets = new Map<ProgramFamily, Bucket>()
  // family → (programKey → { displayTitle, bucket })
  const programBuckets = new Map<ProgramFamily, Map<string, { title: string; bucket: Bucket }>>()

  let prevPeriodSessionsTotal = 0

  for (const row of rows) {
    const d = row.date instanceof Date ? row.date : new Date(row.date)
    const isCurrent = d >= currentStart && d < now
    const isPrevious = d >= previousStart && d < currentStart
    if (!isCurrent && !isPrevious) continue
    if (isPrevious) prevPeriodSessionsTotal++

    const family = classifyProgramFamily({
      title: row.title,
      format: row.format,
      category: row.category,
    })
    const participants = row.confirmedCount ?? 0
    const capacity = row.maxPlayers ?? 0

    // Family-level
    let fb = familyBuckets.get(family)
    if (!fb) {
      fb = newBucket()
      familyBuckets.set(family, fb)
    }
    if (isCurrent) {
      fb.curSessions++
      fb.curParticipants += participants
      fb.curRegistered += participants
      fb.curCapacity += capacity
    } else {
      fb.prevSessions++
      fb.prevParticipants += participants
    }

    // Program-level (only current period drives the drill-down list; prev
    // feeds the per-program trend).
    const normTitle = normalizeProgramTitle(row.title, opts.clubName) || '(untitled)'
    const key = programGroupKey(row.title, opts.clubName) || '(untitled)'
    let pmap = programBuckets.get(family)
    if (!pmap) {
      pmap = new Map()
      programBuckets.set(family, pmap)
    }
    let pb = pmap.get(key)
    if (!pb) {
      pb = { title: normTitle, bucket: newBucket() }
      pmap.set(key, pb)
    }
    if (isCurrent) {
      pb.bucket.curSessions++
      pb.bucket.curParticipants += participants
      pb.bucket.curRegistered += participants
      pb.bucket.curCapacity += capacity
    } else {
      pb.bucket.prevSessions++
      pb.bucket.prevParticipants += participants
    }
  }

  const hasComparison = prevPeriodSessionsTotal > 0

  // Build visible families (skip hidden Equipment + skip empty families).
  const families: FamilyHealth[] = []
  let rollupSessions = 0
  let rollupParticipants = 0
  let rollupRegistered = 0
  let rollupCapacity = 0

  for (const family of ALL_FAMILIES) {
    const meta: FamilyMeta = PROGRAM_FAMILY_META[family]
    if (meta.hidden) continue
    const fb = familyBuckets.get(family)
    if (!fb || fb.curSessions === 0) continue // omit empty families

    // Rollup (organized families only for fill rate)
    rollupSessions += fb.curSessions
    rollupParticipants += fb.curParticipants
    if (meta.fillRateMeaningful) {
      rollupRegistered += fb.curRegistered
      rollupCapacity += fb.curCapacity
    }

    // Programs inside family — current period, sorted by participants desc
    const pmap = programBuckets.get(family) ?? new Map<string, { title: string; bucket: Bucket }>()
    const programs: ProgramRow[] = []
    for (const { title, bucket } of Array.from(pmap.values())) {
      if (bucket.curSessions === 0) continue
      programs.push({
        title,
        sessions: bucket.curSessions,
        participants: bucket.curParticipants,
        fillRate: meta.fillRateMeaningful ? fillRate(bucket.curRegistered, bucket.curCapacity) : null,
        trend: computeTrend(bucket.curParticipants, bucket.prevParticipants, hasComparison),
      })
    }
    programs.sort((a, b) => b.participants - a.participants)

    families.push({
      family,
      label: meta.label,
      emoji: meta.emoji,
      color: meta.color,
      bg: meta.bg,
      border: meta.border,
      hidden: meta.hidden,
      fillRateMeaningful: meta.fillRateMeaningful,
      sessions: fb.curSessions,
      participants: fb.curParticipants,
      fillRate: meta.fillRateMeaningful ? fillRate(fb.curRegistered, fb.curCapacity) : null,
      trend: computeTrend(fb.curParticipants, fb.prevParticipants, hasComparison),
      programs,
    })
  }

  return {
    periodDays: opts.periodDays,
    hasComparison,
    rollup: {
      sessions: rollupSessions,
      participants: rollupParticipants,
      fillRate: fillRate(rollupRegistered, rollupCapacity),
    },
    families,
  }
}
