/**
 * Programming IQ — engagement_multiplier (Phase C of the slot-driven refactor).
 *
 * Pure function. Returns a number in [0.6, 1.4] that multiplies a
 * candidate's base score on a per-(slot × candidate) basis.
 *
 * Why this exists (audit finding F2, see docs/PROGRAMMING_IQ_SCORING_REFACTOR.md):
 *
 *   The v1 scoring formula optimised for *projected attendance* —
 *   "this slot fills up", full stop. Two business outcomes were
 *   invisible to it:
 *
 *     1. Whether the session moves the needle on the members the club
 *        is actually worried about (at-risk + churn-risk segments).
 *     2. Whether the session attracts members who aren't already
 *        coming every week (new-member uplift / acquisition).
 *
 *   The multiplier brings both back into the scoring decision without
 *   blowing up the formula. Candidates that target at-risk or new
 *   members get a small upward nudge; candidates that serve only the
 *   already-engaged regulars get a small downward nudge.
 *
 * Bounded by design:
 *
 *   - Floor 0.6 — a candidate can be at most ~40% deprioritised by
 *     engagement signals. Even a session that serves only regulars
 *     can still be picked if its base attendance signal is strong
 *     enough.
 *   - Ceiling 1.4 — at-risk-targeted candidates can be at most ~40%
 *     boosted. We never want engagement to fully override the
 *     attendance reality (a session that nobody attends doesn't help
 *     anyone, no matter how aligned the audience is).
 *
 * Determinism: pure function, no I/O, no random. Same input ⇒ same output.
 */

import type { AdvisorProgrammingProposalDraft } from './advisor-programming'
import type { SlotKey } from './programming-iq-slot-map'

export interface EngagementContext {
  /** Total members in the at_risk + critical health segments. */
  atRiskMemberCount: number
  /** Total active members. Used for ratios. */
  totalMemberCount: number
  /** Members who joined within the last 30 days. */
  newMemberCount: number

  /** Distribution: how many at-risk members are at each skill level.
   *  Keys are PlaySessionSkillLevel string values (BEGINNER, INTERMEDIATE, ...).
   *  Missing keys default to 0. */
  atRiskBySkill: Record<string, number>

  /** Distribution: how many new members are at each skill level. */
  newBySkill: Record<string, number>

  /** How many of the same (format, skillLevel) sessions have already
   *  been placed elsewhere this week (live + already-suggested in v2). */
  sameShapeCountThisWeek: number

  /** Has a session of similar shape historically converted (≥50% capacity)
   *  in the same (dayOfWeek, hour) bucket? Hints that the slot has
   *  a real demand pocket worth nudging into. */
  hasHistoricalConversion: boolean

  /** Is this slot in an "off-peak" window? Off-peak = startHour outside
   *  the top-2 historical demand windows for the club. */
  isOffPeak: boolean

  /** Running count of "expected invites" this candidate's segment has
   *  already accumulated this week. Increments per slot during the
   *  slot-driven loop. */
  segmentInviteCount: number

  /** Per-segment hard cap. When segmentInviteCount equals or exceeds
   *  the cap, multiplier subtracts the saturation penalty. Comes from
   *  contactPolicy.inviteCapPerMemberPerWeek × matching-segment-size. */
  segmentInviteCap: number

  /** Optional preset-level override on the magnitude of each signal.
   *  Default 1.0; FILL_IDLE_HOURS preset might raise to 1.3 to push
   *  engagement weight up; FOLLOW_MEMBER_DEMAND might lower to 0 to
   *  effectively disable the multiplier. */
  engagementWeight?: number
}

/** Floor / ceiling for the multiplier. Exported so tests and the
 *  diagnostics endpoint can reference the same constants. */
export const ENGAGEMENT_MIN = 0.6
export const ENGAGEMENT_MAX = 1.4
const BASE = 1.0
/** Step magnitude per signal. Six signals × 0.1 = ±0.6 max swing, which
 *  is then clamped to [0.6, 1.4]. */
const STEP = 0.1

/** Returns a multiplier in [ENGAGEMENT_MIN, ENGAGEMENT_MAX]. */
export function computeEngagementMultiplier(
  candidate: AdvisorProgrammingProposalDraft,
  slot: SlotKey,
  context: EngagementContext,
): number {
  const weight = typeof context.engagementWeight === 'number' && Number.isFinite(context.engagementWeight)
    ? Math.max(0, context.engagementWeight)
    : 1.0
  if (weight === 0) return BASE // preset opted out of engagement signals

  // Each signal contributes ±STEP, scaled by weight. We compute as a
  // signed sum so the order of evaluation is irrelevant — important
  // for unit-test determinism and for the Phase D backtest reproducing
  // historical scoring rounds.
  let delta = 0

  // ── (+) Targets a meaningful slice of the at-risk segment ───────────
  // Threshold: ≥20% of all at-risk members sit in this candidate's
  // skill bucket. Below 20% the signal is too weak to act on; above
  // 20% the session is plausibly retentional for that segment.
  const skillKey = String(candidate.skillLevel).toUpperCase()
  const atRiskInSkill = context.atRiskBySkill[skillKey] ?? 0
  if (context.atRiskMemberCount > 0) {
    const atRiskRatio = atRiskInSkill / context.atRiskMemberCount
    if (atRiskRatio >= 0.2) delta += STEP
  }

  // ── (+) New-member-attractive format ─────────────────────────────────
  // Beginner anything, plus Open Play / All-Levels at any skill.
  // Drills / leagues / advanced clinics are deliberately excluded —
  // they don't typically attract someone in their first 30 days.
  if (isNewMemberAttractive(candidate)) delta += STEP

  // ── (+) Off-peak slot where similar shape has historically converted ─
  // The combination matters: an off-peak slot alone isn't a signal
  // (could be empty for a reason); historical conversion alone is
  // already captured by the base demand score. The combination says
  // "this is a quiet hour where the right session DOES draw a crowd."
  if (context.isOffPeak && context.hasHistoricalConversion) delta += STEP

  // ── (−) Serves only existing regulars ───────────────────────────────
  // Heuristic: the candidate's skill bucket holds < 5% of new members
  // AND the club has new members to potentially attract. The first
  // condition rules out clubs that have no new-member problem.
  if (context.newMemberCount > 0) {
    const newInSkill = context.newBySkill[skillKey] ?? 0
    const newRatio = newInSkill / context.newMemberCount
    if (newRatio < 0.05) delta -= STEP
  }

  // ── (−) Same shape already placed elsewhere this week ───────────────
  // First same-shape repeat is allowed (variety doesn't cost us much);
  // second triggers the penalty. v2 already prevents the exact
  // (proposal × day × hour) duplicate in slot-driven.ts; this rule
  // covers different days/hours with the same (format, skill).
  if (context.sameShapeCountThisWeek >= 1) delta -= STEP

  // ── (−) Segment saturation cap exceeded ─────────────────────────────
  // Hard signal: contactPolicy says "don't invite the same segment
  // more than N times per week". When the segment is at or over its
  // cap, downweight further candidates for it. Cap=0 means "not
  // configured" — skip the rule rather than penalise everything.
  if (context.segmentInviteCap > 0 && context.segmentInviteCount >= context.segmentInviteCap) {
    delta -= STEP
  }

  const scaled = BASE + delta * weight
  return clamp(scaled, ENGAGEMENT_MIN, ENGAGEMENT_MAX)
}

/**
 * "Is this candidate the kind of session a brand-new member would book?"
 *
 * Heuristic, intentionally simple:
 *   - Beginner anything (skill tier 2.0–3.0 in pickleball terms)
 *   - Open Play at Intermediate or All-Levels (low-commitment drop-in)
 *   - Mixer / Social formats at any skill
 *
 * Excluded: Drills, Clinics for Advanced, Leagues, Tournaments — all
 * are higher-commitment formats that returning members book, not
 * day-one members.
 */
export function isNewMemberAttractive(candidate: AdvisorProgrammingProposalDraft): boolean {
  const skill = String(candidate.skillLevel).toUpperCase()
  const format = String(candidate.format).toUpperCase()

  if (skill === 'BEGINNER') return true
  if (format === 'OPEN_PLAY' && (skill === 'INTERMEDIATE' || skill === 'ALL_LEVELS')) return true
  if (format === 'MIXER' || format === 'SOCIAL') return true
  return false
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return BASE
  if (v < min) return min
  if (v > max) return max
  return v
}

// ── Helper: distribute counts by skill from a flat member list ──────
//
// Lets the caller pass `Array<{ skillLevel, riskLevel, joinedDaysAgo }>`
// instead of pre-bucketing themselves. Used by the tRPC layer when
// preparing engagement context for buildWeeklyGrid.

export interface MemberSummaryRow {
  /** Normalised skill key — call String(skill).toUpperCase() before
   *  passing if the source is enum-y. */
  skillLevel: string | null | undefined
  /** From member_health_snapshots.risk_level. Treated as at-risk when
   *  value is 'at_risk' or 'critical'. */
  riskLevel?: string | null
  /** Days between member.createdAt and the week the grid is for.
   *  ≤30 = "new member" for the purposes of engagement signals. */
  joinedDaysAgo?: number | null
}

export interface MemberDistribution {
  totalMemberCount: number
  atRiskMemberCount: number
  newMemberCount: number
  atRiskBySkill: Record<string, number>
  newBySkill: Record<string, number>
}

export function summariseMembers(rows: MemberSummaryRow[]): MemberDistribution {
  const out: MemberDistribution = {
    totalMemberCount: rows.length,
    atRiskMemberCount: 0,
    newMemberCount: 0,
    atRiskBySkill: {},
    newBySkill: {},
  }
  for (const r of rows) {
    const skillKey = String(r.skillLevel ?? '').toUpperCase()
    const isAtRisk = r.riskLevel === 'at_risk' || r.riskLevel === 'critical'
    const isNew = typeof r.joinedDaysAgo === 'number' && r.joinedDaysAgo <= 30
    if (isAtRisk) {
      out.atRiskMemberCount += 1
      if (skillKey) out.atRiskBySkill[skillKey] = (out.atRiskBySkill[skillKey] ?? 0) + 1
    }
    if (isNew) {
      out.newMemberCount += 1
      if (skillKey) out.newBySkill[skillKey] = (out.newBySkill[skillKey] ?? 0) + 1
    }
  }
  return out
}
