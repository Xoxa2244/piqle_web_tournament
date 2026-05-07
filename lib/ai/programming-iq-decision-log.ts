/**
 * Programming IQ — Decision log helper (Phase A.1).
 *
 * Persists one row per (slot × candidate) considered by buildWeeklyGrid
 * to the `programming_iq_decision_log` table. Used by:
 *
 *   - Phase A: establishes ground truth before we change the algorithm.
 *     Daily outcomes cron joins back on (clubId, weekStartDate, slotSignature)
 *     to compute precision metrics.
 *   - Phase D backtest: replays historical decisions against scoring v2
 *     to compare predicted vs actual attendance.
 *   - Operator transparency: power-user view "why was this slot empty?"
 *     reads the rejected rows for a generation.
 *
 * Design notes:
 *
 *   - **Fire-and-forget.** persistDecisions catches and logs errors; never
 *     throws. We don't want a logging failure to break a regenerate.
 *   - **Synchronous fire from a tRPC procedure.** Caller `await`s, but
 *     the await timeout is bounded inside this module so a slow DB
 *     write can't stretch the regenerate latency unbounded.
 *   - **Slot signature is stable across runs.** Format
 *     `court=<id>|day=<DOW>|hour=<HH>`. Court id is `*` when the
 *     decision happened before placement (rejected by floor / blocked).
 *   - **NEGATIVE_INFINITY scores are clamped to -1000.** DOUBLE PRECISION
 *     in Postgres handles ±inf but our analytics queries expect finite
 *     values. -1000 is well below any real selection floor.
 */

import type { PrismaClient } from '@prisma/client'

const PERSIST_TIMEOUT_MS = 5000
const SCORE_CLAMP_FLOOR = -1000

export type ProgrammingIQDecisionKind =
  | 'selected'        // chose for the suggested tier
  | 'risk'            // chose for the risk/backup tier (Phase A.0 risk pass)
  | 'explore'         // v2 only — picked in explore band [exploreFloor, riskFloor)
  | 'rejected_floor'  // score below selectionScoreFloor and not picked up by risk pass
  | 'rejected_blocked' // portfolioPenalty == BLOCKED, hard-filtered
  | 'rejected_filter' // dropped at candidate generation (fillGapMinDemand etc.)
  | 'no_court'        // selected by score but bin-pack failed to place

export interface DecisionRecord {
  /** Stable signature `court=<id>|day=<DOW>|hour=<HH>`. Use `*` for unknown court. */
  slotSignature: string
  candidateId: string
  candidateFormat: string
  candidateSkill: string
  totalScore: number
  goalScores: Record<string, number>
  decision: ProgrammingIQDecisionKind
  reason?: string | null
}

export interface PersistDecisionsInput {
  clubId: string
  generationId: string
  /** ISO `YYYY-MM-DD`. Coerced to a Date for the DATE column. */
  weekStartDate: string
  selectedPresetIds: string[]
  isV2: boolean
  decisions: DecisionRecord[]
}

/**
 * Build a slot signature from (courtId, dayOfWeek, startTime).
 * - courtId may be null for rejected pre-placement candidates → '*'
 * - startTime is "HH:mm" → take first 2 chars as hour bucket
 */
export function makeSlotSignature(
  courtId: string | null | undefined,
  dayOfWeek: string,
  startTime: string,
): string {
  const court = courtId && courtId.length > 0 ? courtId : '*'
  const hour = startTime.slice(0, 2)
  return `court=${court}|day=${dayOfWeek}|hour=${hour}`
}

/**
 * Persist a batch of decisions. Always resolves; logs error on failure.
 * Caller can `await` without try/catch.
 */
export async function persistDecisions(
  prisma: PrismaClient,
  input: PersistDecisionsInput,
): Promise<{ written: number; error: Error | null }> {
  if (input.decisions.length === 0) return { written: 0, error: null }

  const data = input.decisions.map((d) => ({
    clubId: input.clubId,
    generationId: input.generationId,
    weekStartDate: new Date(input.weekStartDate),
    slotSignature: d.slotSignature,
    candidateId: d.candidateId,
    candidateFormat: d.candidateFormat,
    candidateSkill: d.candidateSkill,
    totalScore: Number.isFinite(d.totalScore) ? d.totalScore : SCORE_CLAMP_FLOOR,
    goalScores: d.goalScores as any,
    decision: d.decision,
    reason: d.reason ?? null,
    selectedPresetIds: input.selectedPresetIds,
    isV2: input.isV2,
  }))

  let resolved = false
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      if (!resolved) {
        resolved = true
        // eslint-disable-next-line no-console
        console.warn('[programming-iq-decision-log] persist timed out after %dms', PERSIST_TIMEOUT_MS)
        resolve({ written: 0, error: new Error('persistDecisions timeout') })
      }
    }, PERSIST_TIMEOUT_MS)

    prisma.programmingIQDecisionLog
      .createMany({ data, skipDuplicates: true })
      .then((res) => {
        if (resolved) return
        resolved = true
        clearTimeout(t)
        resolve({ written: res.count, error: null })
      })
      .catch((err) => {
        if (resolved) return
        resolved = true
        clearTimeout(t)
        // eslint-disable-next-line no-console
        console.warn('[programming-iq-decision-log] persist failed: %s', String(err?.message ?? err).slice(0, 200))
        resolve({ written: 0, error: err instanceof Error ? err : new Error(String(err)) })
      })
  })
}
