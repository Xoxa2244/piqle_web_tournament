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
import {
  computeEngagementMultiplier,
  type EngagementContext,
} from './engagement-multiplier'

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
  /** Phase C — Engagement multiplier inputs. When omitted, every
   *  candidate gets multiplier=1.0 (i.e. scoring v2 collapses to
   *  scoring v1's score per slot). The caller (tRPC layer) builds
   *  this from MemberHealthSnapshot + users.createdAt + contactPolicy
   *  when it wants engagement-aware scoring. */
  engagementBase?: EngagementContextBase
  /** Phase C — Saturation guard. The hard cap from
   *  contactPolicy.inviteCapPerMemberPerWeek × matching-segment-size.
   *  Implicitly disabled (no penalty applied) when not provided. */
  segmentInviteCapPerSkill?: Record<string, number>
}

/** Sub-shape of EngagementContext that the caller pre-computes once per
 *  generation. The per-(slot × candidate) signals (sameShape count,
 *  saturation count, off-peak / historical-conversion booleans) are
 *  derived inside runSlotDrivenSelection from the slot map and the
 *  running placement accumulator. */
export interface EngagementContextBase {
  atRiskMemberCount: number
  totalMemberCount: number
  newMemberCount: number
  atRiskBySkill: Record<string, number>
  newBySkill: Record<string, number>
  /** Per-preset weight on the engagement signal magnitude. 0 disables
   *  multiplier entirely (FOLLOW_MEMBER_DEMAND); 1.0 default; 1.3
   *  amplifies (FILL_IDLE_HOURS / TEST_NEW_IDEAS). */
  engagementWeight?: number
}

export interface SlotDrivenDecisionLogEntry {
  slotSignature: string
  candidateId: string
  candidateFormat: string
  candidateSkill: string
  /** Effective score after engagement_multiplier (Phase C). When
   *  engagementBase is not provided, equals the raw base score. */
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

  const feasibility = buildFeasibilityCache({
    emptySlotMap: slotMap,
    historicalSessions: input.historicalSessionsForShapes,
  })

  // ── Phase C: pre-compute peak hours for off-peak detection ──────────
  // "Off-peak" = a slot hour that is NOT in the top-2 demand windows
  // for the club. Demand window = total historical sessions starting
  // in that hour bucket across all days. We compute once outside the
  // slot loop because it's input-stable.
  const peakHours = computePeakHours(input.historicalSessionsForShapes)

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

  // ── Phase C: running accumulators that feed the engagement_multiplier
  //    on each slot iteration. They mutate as we place cells.
  //
  //    sameShapeAccumulator: how many (format, skillLevel) pairs have
  //      been placed already this week. Used to diminish the multiplier
  //      for a candidate that repeats a shape already scheduled.
  //
  //    segmentInviteAccumulator: how many "expected invites" each
  //      skill segment has already accumulated. Approximated by the
  //      sum of maxPlayers across placed sessions of that skill.
  //      Once the accumulator hits the per-segment cap, candidates
  //      for that skill get the saturation penalty.
  const sameShapeAccumulator = new Map<string, number>()
  const segmentInviteAccumulator = new Map<string, number>()

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
    //
    // Phase C — when engagementBase is provided, every base score is
    // multiplied by engagement_multiplier(candidate, slot, ctx) in
    // [0.6, 1.4]. When engagementBase is omitted, multiplier=1.0 and
    // the path collapses to Phase B behaviour byte-for-byte.
    const hasHistoricalConversion = feasibility.shapesForSlot(slot).length > 0
    const isOffPeak = !peakHours.has(slot.hour)
    const scored = candidates.map((c) => {
      const goals = getGoalScores(c, [], input.scoringContext)
      const baseScore = getGreedySelectionScore(c, [], input.scoringContext)
      const penalty = getPortfolioPenalty(c, [], input.scoringContext.pinnedProposalIds, input.scoringContext.behaviorProfile)

      const multiplier = input.engagementBase
        ? computeEngagementMultiplier(c, slot, buildPerSlotContext({
            base: input.engagementBase,
            candidate: c,
            isOffPeak,
            hasHistoricalConversion,
            sameShapeAccumulator,
            segmentInviteAccumulator,
            segmentInviteCapPerSkill: input.segmentInviteCapPerSkill,
          }))
        : 1.0
      const score = Number.isFinite(baseScore) ? baseScore * multiplier : baseScore

      return { candidate: c, score, baseScore, multiplier, goals, penalty }
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

    // Phase C — update accumulators so the next slot's multiplier sees
    // the freshly placed shape and segment. Done immediately after
    // placement so iteration order matters consistently.
    const shapeKey = `${candidate.format}__${candidate.skillLevel}`
    sameShapeAccumulator.set(shapeKey, (sameShapeAccumulator.get(shapeKey) ?? 0) + 1)
    const skillKey = String(candidate.skillLevel).toUpperCase()
    segmentInviteAccumulator.set(
      skillKey,
      (segmentInviteAccumulator.get(skillKey) ?? 0) + (candidate.maxPlayers || 0),
    )

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
      const reasonSuffix = input.engagementBase && winner.multiplier !== 1
        ? ` · engagement×${winner.multiplier.toFixed(2)} (base ${Math.round(winner.baseScore)} → ${Math.round(score)})`
        : ''
      decisionLog.push({
        slotSignature: makeSlotSignature(slot.courtId, slot.dayOfWeek, slot.startTime),
        candidateId: candidate.id,
        candidateFormat: candidate.format,
        candidateSkill: candidate.skillLevel,
        totalScore: Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY,
        goalScores: extractGoalScores(goals),
        decision: kind === 'suggested' ? 'selected' : kind === 'risk' ? 'risk' : 'explore',
        reason: tierReason + reasonSuffix,
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

// ── Phase C helpers ──────────────────────────────────────────────────

/**
 * Build a per-(slot × candidate) EngagementContext on top of the
 * grid-wide base. The runtime signals (sameShape count, segment
 * saturation count, off-peak flag, historical conversion flag) are
 * read out of the running accumulators and the precomputed slot
 * features. Kept inline rather than inside engagement-multiplier.ts
 * because it depends on the slot-driven loop's mutating state.
 */
function buildPerSlotContext(args: {
  base: EngagementContextBase
  candidate: AdvisorProgrammingProposalDraft
  isOffPeak: boolean
  hasHistoricalConversion: boolean
  sameShapeAccumulator: Map<string, number>
  segmentInviteAccumulator: Map<string, number>
  segmentInviteCapPerSkill?: Record<string, number>
}): EngagementContext {
  const shapeKey = `${args.candidate.format}__${args.candidate.skillLevel}`
  const skillKey = String(args.candidate.skillLevel).toUpperCase()
  return {
    atRiskMemberCount: args.base.atRiskMemberCount,
    totalMemberCount: args.base.totalMemberCount,
    newMemberCount: args.base.newMemberCount,
    atRiskBySkill: args.base.atRiskBySkill,
    newBySkill: args.base.newBySkill,
    sameShapeCountThisWeek: args.sameShapeAccumulator.get(shapeKey) ?? 0,
    hasHistoricalConversion: args.hasHistoricalConversion,
    isOffPeak: args.isOffPeak,
    segmentInviteCount: args.segmentInviteAccumulator.get(skillKey) ?? 0,
    segmentInviteCap: args.segmentInviteCapPerSkill?.[skillKey] ?? 0,
    engagementWeight: args.base.engagementWeight,
  }
}

/**
 * Top-2 demand hours of the club across all days. Anything not in
 * this set is "off-peak" for engagement_multiplier purposes. We pick
 * 2 (not 1, not 3) because 1 too narrowly defines peak (a club with
 * even demand has no peak) and 3 dilutes the off-peak bonus.
 *
 * Empty history → empty set → every hour is off-peak. That's
 * intentional: brand-new clubs benefit from the off-peak bonus
 * everywhere, which biases v2 toward filling more slots up front.
 */
function computePeakHours(
  sessions: Array<{ startTime: string }>,
): Set<number> {
  const counts = new Map<number, number>()
  for (const s of sessions) {
    const m = hhmmToMinutes(s.startTime)
    if (!Number.isFinite(m)) continue
    const hour = Math.floor(m / 60)
    counts.set(hour, (counts.get(hour) ?? 0) + 1)
  }
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return new Set(ranked.slice(0, 2).map(([hour]) => hour))
}
