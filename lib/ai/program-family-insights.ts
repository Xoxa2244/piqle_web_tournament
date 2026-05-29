/**
 * Family-dynamics insights engine — Programming Health redesign Phase 1
 * (§1g / §8b). This is "Part 2 — что делать": below the numbers, each insight
 * names a problem in a program family and offers a treatment (a deep-link to
 * the Campaign wizard, mirroring Membership Health's pattern, doc §4).
 *
 * Runs over RAW session rows (not the trimmed family result) so it can see
 * the previous period and families that have gone dark — neither of which
 * survives into the public ProgrammingHealthResult.
 *
 * Detectors (doc §8b):
 *   - declining   — participants down ≥ threshold vs the previous period
 *   - low_fill    — organized family below a fill threshold (empty seats)
 *   - funnel_leak — beginner Open Play shrinking while overall holds/grows
 *   - dead_family — was active last period, zero sessions this period
 *   (league_gap stays in operational-signals-engine — it needs UPCOMING
 *    sessions, which this past-window engine can't see. Doc §8b: "уже есть".)
 *
 * History gating (§9): declining / funnel_leak stay silent when there's no
 * previous-period data at all.
 */

import {
  PROGRAM_FAMILY_META,
  ALL_FAMILIES,
  classifyProgramFamily,
  type ProgramFamily,
} from './program-family-classifier'
import type { AggregatorSessionRow } from './program-family-aggregator'

export type InsightKind = 'declining' | 'low_fill' | 'funnel_leak' | 'dead_family'
export type InsightSeverity = 'critical' | 'warning'
export type TreatmentGoal = 'reengage' | 'fill' | 'intro' | 'relaunch'

export interface ProgrammingInsight {
  /** Stable key (kind:family) — dedupe / React key. */
  id: string
  kind: InsightKind
  severity: InsightSeverity
  family: ProgramFamily
  familyLabel: string
  /** Card headline. */
  title: string
  /** One-line explanation tied to the numbers above. */
  detail: string
  /** Treatment goal. The UI maps this to a short tag (re-engage / fill /
   *  recruit / relaunch) and to the Campaign wizard's goal code. */
  treatmentGoal: TreatmentGoal
}

// Thresholds — deliberately conservative so cards mean something.
const DECLINE_WARN = 15 // % drop in participants vs previous period
const DECLINE_CRIT = 30
const LOW_FILL_WARN = 50 // % fill for organized programs
const LOW_FILL_CRIT = 30
/** Entry-level Open Play titles, for the funnel-leak detector. */
const BEGINNER_RE = /\b(beginner|intro|101|new\s*player|2\.0|2\.49)\b/i

interface FamAcc {
  curSessions: number
  curParticipants: number
  curRegistered: number
  curCapacity: number
  prevSessions: number
  prevParticipants: number
}

function newAcc(): FamAcc {
  return {
    curSessions: 0,
    curParticipants: 0,
    curRegistered: 0,
    curCapacity: 0,
    prevSessions: 0,
    prevParticipants: 0,
  }
}

function periodLabel(days: number): string {
  return days >= 365 ? '1y' : `${days}d`
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { critical: 0, warning: 1 }

/**
 * Detect programming insights from raw session rows over a two-period window
 * (current [now−P, now), previous [now−2P, now−P)).
 */
export function buildProgrammingInsights(
  rows: AggregatorSessionRow[],
  opts: { now?: Date; periodDays: number; clubName?: string | null },
): ProgrammingInsight[] {
  const now = opts.now ?? new Date()
  const periodMs = opts.periodDays * 86_400_000
  const currentStart = new Date(now.getTime() - periodMs)
  const previousStart = new Date(now.getTime() - 2 * periodMs)
  const label = periodLabel(opts.periodDays)

  const fam = new Map<ProgramFamily, FamAcc>()
  // Beginner Open Play sub-bucket for the funnel-leak detector.
  let begCur = 0
  let begPrev = 0

  for (const row of rows) {
    const d = row.date instanceof Date ? row.date : new Date(row.date)
    const isCurrent = d >= currentStart && d < now
    const isPrevious = d >= previousStart && d < currentStart
    if (!isCurrent && !isPrevious) continue

    const family = classifyProgramFamily({ title: row.title, format: row.format, category: row.category })
    const participants = row.confirmedCount ?? 0
    const capacity = row.maxPlayers ?? 0

    let acc = fam.get(family)
    if (!acc) {
      acc = newAcc()
      fam.set(family, acc)
    }
    if (isCurrent) {
      acc.curSessions++
      acc.curParticipants += participants
      acc.curRegistered += participants
      acc.curCapacity += capacity
    } else {
      acc.prevSessions++
      acc.prevParticipants += participants
    }

    if (family === 'OPEN_PLAY' && BEGINNER_RE.test(row.title ?? '')) {
      if (isCurrent) begCur += participants
      else begPrev += participants
    }
  }

  const hasComparison = Array.from(fam.values()).some((a) => a.prevSessions > 0)
  const insights: ProgrammingInsight[] = []

  for (const family of ALL_FAMILIES) {
    const meta = PROGRAM_FAMILY_META[family]
    if (meta.hidden) continue // Equipment is facility, not programming
    const acc = fam.get(family)
    if (!acc) continue

    // ── dead_family — was active, now silent ──
    if (acc.prevSessions > 0 && acc.curSessions === 0) {
      insights.push({
        id: `dead_family:${family}`,
        kind: 'dead_family',
        severity: 'warning',
        family,
        familyLabel: meta.label,
        title: `${meta.label} went quiet`,
        detail: `No ${meta.label} sessions in the last ${label} — there were ${acc.prevSessions} the period before. Relaunch it or take it off the schedule.`,
        treatmentGoal: 'relaunch',
      })
      continue // a dead family can't also be "declining" / "low fill"
    }

    if (acc.curSessions === 0) continue // nothing current to talk about

    // ── declining — participants down vs previous period ──
    if (hasComparison && acc.prevParticipants > 0) {
      const deltaPct = Math.round(((acc.curParticipants - acc.prevParticipants) / acc.prevParticipants) * 100)
      if (deltaPct <= -DECLINE_WARN) {
        insights.push({
          id: `declining:${family}`,
          kind: 'declining',
          severity: deltaPct <= -DECLINE_CRIT ? 'critical' : 'warning',
          family,
          familyLabel: meta.label,
          title: `${meta.label} is losing participants`,
          detail: `Down ${Math.abs(deltaPct)}% vs the previous ${label} (${acc.prevParticipants} → ${acc.curParticipants} participants). Win them back before the habit breaks.`,
          treatmentGoal: 'reengage',
        })
      }
    }

    // ── low_fill — organized family with empty seats ──
    if (meta.fillRateMeaningful && acc.curCapacity > 0) {
      const fill = Math.round((acc.curRegistered / acc.curCapacity) * 100)
      if (fill < LOW_FILL_WARN) {
        insights.push({
          id: `low_fill:${family}`,
          kind: 'low_fill',
          severity: fill < LOW_FILL_CRIT ? 'critical' : 'warning',
          family,
          familyLabel: meta.label,
          title: `${meta.label} has empty seats`,
          detail: `Only ${fill}% full across ${acc.curSessions} sessions this ${label}. Fill the open spots with a targeted push.`,
          treatmentGoal: 'fill',
        })
      }
    }
  }

  // ── funnel_leak — beginner Open Play shrinking while overall holds ──
  if (hasComparison && begPrev > 0) {
    const begDelta = Math.round(((begCur - begPrev) / begPrev) * 100)
    const op = fam.get('OPEN_PLAY')
    const opSteadyOrUp =
      !op || op.prevParticipants === 0
        ? true
        : (op.curParticipants - op.prevParticipants) / op.prevParticipants >= -0.05
    if (begDelta <= -DECLINE_WARN && opSteadyOrUp) {
      insights.push({
        id: 'funnel_leak:OPEN_PLAY',
        kind: 'funnel_leak',
        severity: 'warning',
        family: 'OPEN_PLAY',
        familyLabel: PROGRAM_FAMILY_META.OPEN_PLAY.label,
        title: 'Beginner pipeline is leaking',
        detail: `Beginner Open Play is down ${Math.abs(begDelta)}% (${begPrev} → ${begCur}) while overall Open Play holds steady — fewer newcomers are entering the funnel.`,
        treatmentGoal: 'intro',
      })
    }
  }

  insights.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (s !== 0) return s
    return PROGRAM_FAMILY_META[a.family].order - PROGRAM_FAMILY_META[b.family].order
  })

  return insights
}
