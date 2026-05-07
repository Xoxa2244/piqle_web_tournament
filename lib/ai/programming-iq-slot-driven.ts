/**
 * Programming IQ — v2 slot-driven selection (Phase B.3 / B.4 / B.5).
 *
 * v2 inverts the iteration unit. Instead of "pick the best N candidates,
 * then bin-pack them onto courts", we iterate over the (court × day ×
 * hour) slots that are EMPTY for the requested week and ask, per slot,
 * "what's the best feasible candidate here?".
 *
 * Why this is better than v1 for the audit's F4 finding:
 *
 *   v1 generated candidates filtered by `fillGapMinDemand` and other
 *   hard pre-filters BEFORE knowing whether a slot was empty. On
 *   thin-history clubs, almost every fill-gap idea got cut by the
 *   pre-filter — so even a wide-open Saturday morning showed nothing.
 *
 *   v2 uses the same scoring (Phase B promise: "scoring unchanged"),
 *   but it always considers every empty slot. If no candidate clears
 *   the suggested floor we drop into risk; if no risk candidate
 *   clears we drop into explore; only after that do we mark the slot
 *   `empty-with-reason`. The grid stops being mysteriously blank.
 *
 * Phase B keeps the existing `getGreedySelectionScore` and the
 * thresholds from `behaviorProfile.selectionScoreFloor` /
 * `behaviorProfile.riskScoreFloor`. We derive `exploreScoreFloor` at
 * runtime as `max(15, riskScoreFloor - 25)` — a 25-point band below
 * risk where the slot is filled with an explicit "experimental, try
 * and measure" framing. Phase C may move this onto behaviorProfile.
 *
 * Determinism: the v1 pipeline is deterministic per (input, time);
 * v2 must be too. We sort empty slots in stable order via
 * buildEmptySlotMap and pick winners by `(score desc, candidate id
 * asc)` to break ties consistently.
 *
 * Same-shape duplication: v1 produces `__dup` variants so a high-demand
 * shape (Saturday 10am 4.0) can fill two courts. v2 doesn't need them
 * — the slot-driven loop will independently pick the same shape on
 * Court 1 and Court 2 if it's the best candidate for both slots.
 * `__dup` candidates are silently dropped from the v2 pool.
 */

import type { AdvisorProgrammingProposalDraft } from './advisor-programming'
import {
  buildEmptySlotMap,
  buildFeasibilityCache,
  type EmptySlotMap,
  type SlotKey,
} from './programming-iq-slot-map'
import {
  getGreedySelectionScore,
  getGoalScores,
  getPortfolioPenalty,
  PORTFOLIO_PENALTY_BLOCKED,
  hhmmToMinutes,
  type GridCell,
  type SchedulerCourt,
  type SchedulerExistingSession,
  type SchedulerHistoricalSession,
  type SelectionScoringContext,
} from './programming-iq-scheduler'
import { makeSlotSignature } from './programming-iq-decision-log'

export interface RunSlotDrivenSelectionInput {
  weekStartDate: Date
  courts: SchedulerCourt[]
  existingWeekSessions: SchedulerExistingSession[]
  historicalSessions: SchedulerHistoricalSession[]
  /** Already enriched with dayOfWeek for downstream use; passed through
   *  to feasibility cache for shape histograms. */
  historicalSessionsForShapes: Array<{
    courtId: string | null
    startTime: string
    endTime: string
    dayOfWeek?: any
    format?: string | null
    skillLevel?: string | null
  }>
  /** Full candidate pool from buildAdvisorProgrammingPlan + applyRegenerateHint
   *  (v1's `expanded` minus `__dup` variants). */
  candidates: AdvisorProgrammingProposalDraft[]
  scoringContext: SelectionScoringContext
  selectionScoreFloor: number
  riskScoreFloor: number
  /** When true, every slot scoring decision (selected / risk / explore /
   *  empty-with-reason / no candidate) is recorded in the decision log
   *  output so the diagnostics endpoint can see why each slot landed
   *  where it did. */
  emitDecisionLog?: boolean
  timezone?: string
}

export interface SlotDrivenDecisionLogEntry {
  slotSignature: string
  candidateId: string
  candidateFormat: string
  candidateSkill: string
  totalScore: number
  goalScores: Record<string, number>
  decision:
    | 'selected'
    | 'risk'
    | 'explore'
    | 'rejected_floor'
    | 'rejected_blocked'
    | 'rejected_filter'
    | 'no_court'
  reason?: string | null
}

export interface RunSlotDrivenSelectionResult {
  cells: GridCell[]
  /** Proposals that won a slot, ordered as they were placed. */
  selectedProposals: AdvisorProgrammingProposalDraft[]
  decisionLog: SlotDrivenDecisionLogEntry[]
  /** Empty slot map used for telemetry / "we considered N slots" UI hint. */
  slotMap: EmptySlotMap
  stats: {
    suggested: number
    risk: number
    explore: number
    emptyWithReason: number
  }
}

/**
 * Run the slot-driven selection pass. Pure: same inputs ⇒ same outputs.
 */
export function runSlotDrivenSelection(
  input: RunSlotDrivenSelectionInput,
): RunSlotDrivenSelectionResult {
  const slotMap = buildEmptySlotMap({
    weekStartDate: input.weekStartDate,
    courts: input.courts,
    existingWeekSessions: input.existingWeekSessions,
    historicalSessions: input.historicalSessions,
    timezone: input.timezone,
  })

  const _feasibility = buildFeasibilityCache({
    emptySlotMap: slotMap,
    historicalSessions: input.historicalSessionsForShapes,
  })
  // Currently used only via slotMap.empty membership; reserved for
  // Phase C engagement_multiplier where shapesForSlot drives demand
  // signals per slot.
  void _feasibility

  // Pre-index candidates by (dayOfWeek, hourBucket). v1's `__dup`
  // variants are stripped here — v2 doesn't need them; iterating
  // independently per slot lets the same shape win on multiple courts
  // when warranted.
  const candidatePool = input.candidates.filter((c) => !c.id.endsWith('__dup'))
  const candidatesByKey = new Map<string, AdvisorProgrammingProposalDraft[]>()
  for (const c of candidatePool) {
    const startMin = hhmmToMinutes(c.startTime)
    if (!Number.isFinite(startMin)) continue
    const hour = Math.floor(startMin / 60)
    const key = `${c.dayOfWeek}__${hour}`
    if (!candidatesByKey.has(key)) candidatesByKey.set(key, [])
    candidatesByKey.get(key)!.push(c)
  }

  const exploreScoreFloor = Math.max(15, input.riskScoreFloor - 25)

  const cells: GridCell[] = []
  const selectedProposals: AdvisorProgrammingProposalDraft[] = []
  const decisionLog: SlotDrivenDecisionLogEntry[] = []
  const stats = { suggested: 0, risk: 0, explore: 0, emptyWithReason: 0 }
  // Track placed (proposalId × dayOfWeek × hour) to prevent the same
  // proposal landing twice in identical slots on different courts —
  // that would just spam the grid. Same shape on a different (day, hour)
  // is allowed; same shape on the same (day, hour) but different court
  // is allowed when demand justifies it (handled by per-slot scoring).
  const placedKeys = new Set<string>()

  for (const slot of slotMap.empty) {
    const key = `${slot.dayOfWeek}__${slot.hour}`
    const candidates = candidatesByKey.get(key) ?? []
    if (candidates.length === 0) {
      cells.push(buildEmptyWithReasonCell(slot, 'no candidates generated for this (day, hour)'))
      stats.emptyWithReason += 1
      if (input.emitDecisionLog) {
        decisionLog.push({
          slotSignature: makeSlotSignature(slot.courtId, slot.dayOfWeek, slot.startTime),
          candidateId: '∅',
          candidateFormat: '—',
          candidateSkill: '—',
          totalScore: Number.NEGATIVE_INFINITY,
          goalScores: {},
          decision: 'rejected_filter',
          reason: 'No upstream candidates generated for this (day, hour)',
        })
      }
      continue
    }

    // Score every candidate independently against an EMPTY selected set
    // (matches the risk-pass insight from commit 4d7f67d7). v2 does not
    // chain diversity penalties across slots; that becomes the new
    // member_saturation_penalty in Phase C.
    const scored = candidates.map((c) => {
      const goals = getGoalScores(c, [], input.scoringContext)
      const score = getGreedySelectionScore(c, [], input.scoringContext)
      const penalty = getPortfolioPenalty(c, [], input.scoringContext.pinnedProposalIds, input.scoringContext.behaviorProfile)
      return { candidate: c, score, goals, penalty }
    })
      .filter(({ candidate }) => {
        // Don't repeat the same proposal at the same (day, hour) across courts
        const placeKey = `${candidate.id}__${slot.dayOfWeek}__${slot.hour}`
        return !placedKeys.has(placeKey)
      })
      .sort((a, b) => {
        // (score desc, id asc) for tie-break stability.
        if (b.score !== a.score) return b.score - a.score
        return a.candidate.id.localeCompare(b.candidate.id)
      })

    if (scored.length === 0) {
      cells.push(buildEmptyWithReasonCell(slot, 'every candidate already placed in this hour'))
      stats.emptyWithReason += 1
      continue
    }

    const winner = scored.find(({ penalty }) => penalty !== PORTFOLIO_PENALTY_BLOCKED) ?? scored[0]
    const {
      candidate,
      score,
      goals,
      penalty,
    } = winner

    if (penalty === PORTFOLIO_PENALTY_BLOCKED) {
      cells.push(buildEmptyWithReasonCell(slot, 'best candidate blocked by portfolio policy'))
      stats.emptyWithReason += 1
      if (input.emitDecisionLog) {
        decisionLog.push({
          slotSignature: makeSlotSignature(slot.courtId, slot.dayOfWeek, slot.startTime),
          candidateId: candidate.id,
          candidateFormat: candidate.format,
          candidateSkill: candidate.skillLevel,
          totalScore: Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY,
          goalScores: extractGoalScores(goals),
          decision: 'rejected_blocked',
          reason: 'Portfolio policy blocked the best candidate (canShareWindow / canDuplicate)',
        })
      }
      continue
    }

    let kind: GridCell['kind']
    let tierReason: string
    if (score >= input.selectionScoreFloor) {
      kind = 'suggested'
      tierReason = `score ${Math.round(score)} ≥ suggested floor ${input.selectionScoreFloor}`
      stats.suggested += 1
    } else if (score >= input.riskScoreFloor) {
      kind = 'risk'
      tierReason = `score ${Math.round(score)} in risk band [${input.riskScoreFloor}, ${input.selectionScoreFloor})`
      stats.risk += 1
    } else if (score >= exploreScoreFloor) {
      kind = 'explore'
      tierReason = `score ${Math.round(score)} in explore band [${exploreScoreFloor}, ${input.riskScoreFloor})`
      stats.explore += 1
    } else {
      cells.push(buildEmptyWithReasonCell(slot, `best candidate scored ${Math.round(score)} < explore floor ${exploreScoreFloor}`))
      stats.emptyWithReason += 1
      if (input.emitDecisionLog) {
        decisionLog.push({
          slotSignature: makeSlotSignature(slot.courtId, slot.dayOfWeek, slot.startTime),
          candidateId: candidate.id,
          candidateFormat: candidate.format,
          candidateSkill: candidate.skillLevel,
          totalScore: Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY,
          goalScores: extractGoalScores(goals),
          decision: 'rejected_floor',
          reason: `Score ${Math.round(score)} below explore floor ${exploreScoreFloor}`,
        })
      }
      continue
    }

    placedKeys.add(`${candidate.id}__${slot.dayOfWeek}__${slot.hour}`)
    selectedProposals.push(candidate)

    cells.push({
      key: `${slot.courtId}__${slot.dayOfWeek}__${slot.startTime}`,
      kind,
      courtId: slot.courtId,
      courtName: slot.courtName,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: candidate.endTime,
      title: candidate.title,
      format: candidate.format,
      skillLevel: candidate.skillLevel,
      maxPlayers: candidate.maxPlayers,
      projectedOccupancy: candidate.projectedOccupancy,
      estimatedInterestedMembers: candidate.estimatedInterestedMembers,
      confidence: candidate.confidence,
      rationale:
        kind === 'explore'
          ? [
              ...candidate.rationale,
              'Below the risk floor — surfaced experimentally because the slot was empty. Treat as "try and measure", not a confident pick.',
            ]
          : kind === 'risk'
            ? [
                ...candidate.rationale,
                'Lower-confidence idea — historical signal is moderate. Review before publishing.',
              ]
            : candidate.rationale,
      warnings:
        kind === 'explore'
          ? ['Experimental tier — limited historical signal']
          : kind === 'risk'
            ? ['Weaker historical signal — verify demand before publishing']
            : (candidate.conflict && candidate.conflict.overallRisk !== 'low'
                ? [candidate.conflict.riskSummary, ...candidate.conflict.warnings]
                : []),
      requestedByAdmin: input.scoringContext.pinnedProposalIds.has(candidate.id),
    })

    if (input.emitDecisionLog) {
      decisionLog.push({
        slotSignature: makeSlotSignature(slot.courtId, slot.dayOfWeek, slot.startTime),
        candidateId: candidate.id,
        candidateFormat: candidate.format,
        candidateSkill: candidate.skillLevel,
        totalScore: Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY,
        goalScores: extractGoalScores(goals),
        decision: kind === 'suggested' ? 'selected' : kind === 'risk' ? 'risk' : 'explore',
        reason: tierReason,
      })
    }
  }

  return {
    cells,
    selectedProposals,
    decisionLog,
    slotMap,
    stats,
  }
}

function buildEmptyWithReasonCell(slot: SlotKey, reason: string): GridCell {
  return {
    key: `empty__${slot.courtId}__${slot.dayOfWeek}__${slot.startTime}`,
    kind: 'empty-with-reason',
    courtId: slot.courtId,
    courtName: slot.courtName,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    title: null,
    format: null,
    skillLevel: null,
    maxPlayers: null,
    projectedOccupancy: null,
    estimatedInterestedMembers: null,
    confidence: null,
    rationale: [reason],
    warnings: [reason],
  }
}

function extractGoalScores(goals: ReturnType<typeof getGoalScores>): Record<string, number> {
  return {
    demandFit: goals.demandFit,
    utilization: goals.utilization,
    audienceProtection: goals.audienceProtection,
    portfolioBalance: goals.portfolioBalance,
    operationalFit: goals.operationalFit,
    adminIntent: goals.adminIntent,
  }
}
