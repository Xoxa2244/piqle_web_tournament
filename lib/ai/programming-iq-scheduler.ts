/**
 * Programming IQ scheduler — the glue between the 7-signal demand scorer
 * (already in lib/ai/advisor-programming.ts) and the week-grid UI.
 *
 * Responsibilities:
 *
 *   buildWeeklyGrid()            — orchestrates the full pipeline:
 *                                  load 7 signals → score (via advisor-programming)
 *                                  → synthesize top-N slots → bin-pack onto courts
 *                                  → flag saturation → return grid cells.
 *
 *   assignCourtsToProposals()    — deterministic bin-packing: each proposal
 *                                  lands on a concrete court, skipping
 *                                  overlapping live PlaySessions, preferring
 *                                  indoor for evening slots, avoiding
 *                                  same-skill clustering on adjacent courts.
 *
 *   inferCourtOperatingHours()   — earliest start / latest end from 60 days
 *                                  of historical PlaySessions per court. No
 *                                  new DB column yet; fallback 06:00-23:00.
 *
 *   supplyDemandCheck()          — flags cells that would overextend the
 *                                  eligible member pool once you account for
 *                                  contact-policy invite caps. Pool-level
 *                                  safeguard on top of ProposalConflict.
 *
 * Kept platform-thin: no LLM calls here. The LLM work (re-weighting for the
 * "regenerate with: less open play" prompt) sits in the tRPC layer and
 * mutates the `request` hint passed into `buildAdvisorProgrammingPlan`.
 */

import { randomUUID } from 'crypto'
import {
  buildAdvisorProgrammingPlan,
  parseAdvisorProgrammingRequest,
  type AdvisorProgrammingProposalDraft,
  type ProgrammingAudienceProfile,
} from './advisor-programming'
import type {
  DayOfWeek,
  PlaySessionFormat,
  PlaySessionSkillLevel,
} from '@/types/intelligence'

// ── Types ────────────────────────────────────────────────────────────

export interface SchedulerCourt {
  id: string
  name: string
  isIndoor: boolean
  isActive: boolean
}

export interface SchedulerExistingSession {
  id: string
  courtId: string | null
  date: Date
  startTime: string
  endTime: string
  title: string | null
  format: PlaySessionFormat | null
  skillLevel: PlaySessionSkillLevel | null
  maxPlayers: number | null
  status: string
}

export interface SchedulerHistoricalSession {
  courtId: string | null
  startTime: string
  endTime: string
}

export interface SchedulerPreferenceRow {
  preferredDays: string[]
  preferredTimeMorning: boolean
  preferredTimeAfternoon: boolean
  preferredTimeEvening: boolean
  skillLevel: PlaySessionSkillLevel
  preferredFormats: string[]
  targetSessionsPerWeek: number
  notificationsOptOut: boolean
}

export interface SchedulerInterestRow {
  preferredDays: string[]
  preferredFormats: string[]
  preferredTimeSlots: unknown
  status: string
  sessionId?: string | null
}

export interface SchedulerContactPolicy {
  /** Max total invites a single member can receive per week (email+sms). */
  inviteCapPerMemberPerWeek: number
}

export type GridCellKind = 'live' | 'suggested' | 'empty' | 'conflict' | 'saturation'

export interface GridCell {
  /** Stable key for React: `${courtId}__${dayOfWeek}__${startTime}`. */
  key: string
  kind: GridCellKind
  courtId: string
  courtName: string
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  title?: string | null
  format?: PlaySessionFormat | null
  skillLevel?: PlaySessionSkillLevel | null
  maxPlayers?: number | null
  /** Live cells: booking count so far. Suggested: projected. */
  projectedOccupancy?: number | null
  estimatedInterestedMembers?: number | null
  confidence?: number | null
  rationale?: string[]
  /** Draft id when this cell originated from a freshly-persisted
   * OpsSessionDraft (set by the tRPC layer after upsert, not here). */
  draftId?: string | null
  /** Existing PlaySession id for `live` cells. */
  playSessionId?: string | null
  /** Risk annotations — human-readable, shown in the cell popover. */
  warnings?: string[]
}

export interface BuildWeeklyGridInput {
  weekStartDate: Date
  courts: SchedulerCourt[]
  historicalSessions: SchedulerHistoricalSession[]
  existingWeekSessions: SchedulerExistingSession[]
  lastNDaysSessions: Array<{
    title: string
    date: Date | string
    startTime: string
    endTime: string
    format: PlaySessionFormat
    skillLevel: PlaySessionSkillLevel
    maxPlayers: number
    registeredCount: number | null
  }>
  preferences: SchedulerPreferenceRow[]
  interestRequests: SchedulerInterestRow[]
  audienceProfile?: ProgrammingAudienceProfile | null
  contactPolicy: SchedulerContactPolicy
  /** Target total number of suggested cells (bounded by available capacity). */
  targetSuggestionCount?: number
  /** LLM-derived rewrite hint from the admin ("fewer open play, more drills").
   *  Kept in the input for future rendering; the actual LLM call happens at
   *  the tRPC layer (see `interpretRegeneratePrompt`) and the result is
   *  passed via `regenerateHint` below. Both fields are optional. */
  regeneratePrompt?: string | null
  /** Result of running `interpretRegeneratePrompt` on `regeneratePrompt`.
   *  Applied to the proposal set after scoring and before bin-packing. */
  regenerateHint?: import('./programming-iq-regenerate').RegenerateHint | null
  /** Signatures from the currently visible suggestion set, so plain
   *  Regenerate can explore a nearby variant instead of replaying the
   *  exact same portfolio. */
  previousSuggestionSignatures?: string[]
  /** Club's IANA timezone (`America/New_York` etc). Used to derive
   *  day-of-week from `date` columns that are stored as UTC midnights
   *  but represent local-day sessions. Without this, the conflict
   *  check between AI proposals and live PlaySessions misfires near
   *  UTC midnight (the EST → UTC offset shifts day boundaries). */
  timezone?: string
}

export interface BuildWeeklyGridResult {
  generationId: string
  cells: GridCell[]
  stats: {
    liveKept: number
    suggested: number
    empty: number
    conflicts: number
    saturations: number
    avgProjectedOccupancy: number
  }
  insights: string[]
  /** Pass through to the UI transparency row. */
  signalSummary: {
    monthsOfBookingData: number
    preferencesCount: number
    unmetInterestRequests: number
    activeCourts: number
  }
}

// ── Constants ────────────────────────────────────────────────────────

const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]

const DAY_TO_INDEX: Record<DayOfWeek, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
}

const DEFAULT_EARLIEST_START = '06:00'
const DEFAULT_LATEST_END = '23:00'

// ── Time helpers ─────────────────────────────────────────────────────

/**
 * Parse "HH:MM" (optionally with suffix AM/PM — nodejs PlaySessions use 24h)
 * into minutes since 00:00. Returns NaN for bad input so callers can guard.
 */
export function hhmmToMinutes(value: string | null | undefined): number {
  if (!value) return NaN
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return NaN
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN
  return h * 60 + m
}

export function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Two time intervals (`[startA, endA)` and `[startB, endB)`) overlap iff
 * `startA < endB && startB < endA`. Touching edges (endA == startB) is OK.
 */
export function intervalsOverlap(
  startA: string, endA: string,
  startB: string, endB: string,
): boolean {
  const sA = hhmmToMinutes(startA), eA = hhmmToMinutes(endA)
  const sB = hhmmToMinutes(startB), eB = hhmmToMinutes(endB)
  if ([sA, eA, sB, eB].some((v) => !Number.isFinite(v))) return false
  return sA < eB && sB < eA
}

/** JS Date.getDay() is Sunday=0. Normalise to our enum. */
function jsDayToEnum(day: number): DayOfWeek {
  // Sunday=0 in JS → map directly; our enum ordinals in DAY_TO_INDEX are
  // Monday=0 but that's internal — the enum value strings are what matter.
  const map: Record<number, DayOfWeek> = {
    0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
    4: 'Thursday', 5: 'Friday', 6: 'Saturday',
  }
  return map[day] || 'Monday'
}

/**
 * Resolve the day-of-week for a session timestamp **in the club's
 * timezone**, not in the runtime's local timezone.
 *
 * Why this matters: CourtReserve stores sessions like "2026-04-20 09:00
 * EST" as `2026-04-21T00:00:00.000Z` in the DB (UTC midnight one day
 * later). On a UTC server (Vercel) `date.getDay()` returns Tuesday for
 * what is really a Monday session in the club's time zone, so the
 * conflict-check in `assignCourtsToProposals` builds its
 * `liveByCourtDay` map under the wrong key, AI never sees the live
 * session, and proposes a slot that visually overlaps it on the grid.
 *
 * Using `Intl.DateTimeFormat` with an explicit `timeZone` gives us the
 * day name the club's admin actually sees in their booking software.
 * Default is `America/New_York` because all current IQSport clubs are
 * EST-based; callers should pass an explicit zone for international
 * clubs once we have any.
 */
export function dayOfWeekFromDate(
  date: Date,
  timezone = 'America/New_York',
): DayOfWeek {
  try {
    const dayName = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: timezone,
    }).format(date)
    // `Intl` returns one of Sunday..Saturday in en-US — exactly our enum.
    if (
      dayName === 'Sunday' || dayName === 'Monday' || dayName === 'Tuesday'
      || dayName === 'Wednesday' || dayName === 'Thursday'
      || dayName === 'Friday' || dayName === 'Saturday'
    ) {
      return dayName
    }
  } catch {
    // Bad timezone string → fall back to runtime-local interpretation.
  }
  return jsDayToEnum(date.getDay())
}

// ── inferCourtOperatingHours ────────────────────────────────────────

/**
 * Derive earliest start / latest end for a court from 60 days of
 * historical PlaySession rows. Conservative defaults are returned when
 * a court has no history (or too little to trust).
 *
 * The returned `earliestStart` / `latestEnd` are HH:MM strings in the
 * same 24-hour format PlaySession.startTime uses. Not time-zone aware —
 * that's already handled by the DB (PlaySession.date is a date + the
 * start/end are local wall-clock times per the club).
 */
export function inferCourtOperatingHours(
  courtId: string,
  historicalSessions: SchedulerHistoricalSession[],
): { earliestStart: string; latestEnd: string } {
  const mine = historicalSessions.filter((s) => s.courtId === courtId)
  if (mine.length < 3) {
    // Too little data — conservative default.
    return { earliestStart: DEFAULT_EARLIEST_START, latestEnd: DEFAULT_LATEST_END }
  }
  let minStart = Number.POSITIVE_INFINITY
  let maxEnd = Number.NEGATIVE_INFINITY
  for (const s of mine) {
    const sm = hhmmToMinutes(s.startTime)
    const em = hhmmToMinutes(s.endTime)
    if (Number.isFinite(sm) && sm < minStart) minStart = sm
    if (Number.isFinite(em) && em > maxEnd) maxEnd = em
  }
  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
    return { earliestStart: DEFAULT_EARLIEST_START, latestEnd: DEFAULT_LATEST_END }
  }
  // Small cushion: open 30 min before earliest observed, close 30 min
  // after latest. Snaps to 00 or 30 boundary for UI tidiness.
  const earliest = Math.max(0, Math.floor((minStart - 30) / 30) * 30)
  const latest = Math.min(24 * 60, Math.ceil((maxEnd + 30) / 30) * 30)
  return {
    earliestStart: minutesToHhmm(earliest),
    latestEnd: minutesToHhmm(latest),
  }
}

// ── assignCourtsToProposals ─────────────────────────────────────────

interface ProposalWithId extends AdvisorProgrammingProposalDraft {
  // we just need the subset
}

interface CourtAssignment {
  proposal: ProposalWithId
  courtId: string
  courtName: string
  isIndoor: boolean
  /** null when no court could hold this proposal without overlap. */
  failed?: 'no_court' | 'outside_hours'
}

/**
 * Bin-packs proposals onto concrete courts. Pure function — same inputs
 * always produce the same output for a given ordering.
 *
 * Algorithm:
 *
 *   1. For each proposal, rank candidate courts by preference:
 *      - avoid courts with a LIVE PlaySession overlapping the slot
 *      - avoid courts whose inferred operating hours can't hold the slot
 *      - prefer indoor for evening slots (start ≥ 17:00)
 *      - prefer courts that don't already host an adjacent-hour session
 *        in the same skill tier (reduces clustering)
 *      - prefer courts with fewer already-assigned cells this run (spread)
 *   2. Pick the first feasible court. If none, mark `failed`.
 *
 * Deterministic: we sort candidate courts in a stable order each time.
 */
export function assignCourtsToProposals(
  proposals: AdvisorProgrammingProposalDraft[],
  courts: SchedulerCourt[],
  existingWeekSessions: SchedulerExistingSession[],
  historicalSessions: SchedulerHistoricalSession[],
  weekStartDate: Date,
  // Club's IANA timezone — passed through so dayOfWeekFromDate uses the
  // right zone when keying the conflict map. See dayOfWeekFromDate
  // doc-comment for the full background.
  timezone = 'America/New_York',
): CourtAssignment[] {
  const activeCourts = courts.filter((c) => c.isActive)
  if (activeCourts.length === 0) {
    return proposals.map((proposal) => ({
      proposal,
      courtId: '',
      courtName: '',
      isIndoor: false,
      failed: 'no_court',
    }))
  }

  // Pre-compute operating hours per court.
  const hoursByCourt = new Map<string, { earliestStart: string; latestEnd: string }>()
  for (const court of activeCourts) {
    hoursByCourt.set(court.id, inferCourtOperatingHours(court.id, historicalSessions))
  }

  // Pre-compute live-session occupancy map: courtId → day-of-week →
  // list of {start, end, skillLevel} in that week. Day-of-week resolved
  // in the club's timezone — see dayOfWeekFromDate doc.
  const liveByCourtDay = new Map<string, SchedulerExistingSession[]>()
  for (const session of existingWeekSessions) {
    if (!session.courtId || session.status === 'CANCELLED') continue
    const dow = dayOfWeekFromDate(new Date(session.date), timezone)
    const key = `${session.courtId}__${dow}`
    if (!liveByCourtDay.has(key)) liveByCourtDay.set(key, [])
    liveByCourtDay.get(key)!.push(session)
  }

  const assignedByCourtDay = new Map<string, CourtAssignment[]>() // runtime counter
  const countByCourt = new Map<string, number>() // cell-spread counter

  const assignments: CourtAssignment[] = []
  for (const proposal of proposals) {
    const courtCandidates = rankCourtsForProposal({
      proposal,
      courts: activeCourts,
      hoursByCourt,
      liveByCourtDay,
      assignedByCourtDay,
      countByCourt,
    })

    let picked: SchedulerCourt | null = null
    let failReason: CourtAssignment['failed'] | undefined
    for (const candidate of courtCandidates) {
      const hours = hoursByCourt.get(candidate.id) || {
        earliestStart: DEFAULT_EARLIEST_START,
        latestEnd: DEFAULT_LATEST_END,
      }
      // Outside court hours → skip this court.
      if (
        hhmmToMinutes(proposal.startTime) < hhmmToMinutes(hours.earliestStart)
        || hhmmToMinutes(proposal.endTime) > hhmmToMinutes(hours.latestEnd)
      ) {
        failReason = failReason || 'outside_hours'
        continue
      }
      // Conflict check: overlap with live PlaySession on this (court, dow)?
      const liveKey = `${candidate.id}__${proposal.dayOfWeek}`
      const liveOn = liveByCourtDay.get(liveKey) || []
      const hasConflict = liveOn.some((s) =>
        intervalsOverlap(proposal.startTime, proposal.endTime, s.startTime, s.endTime),
      )
      if (hasConflict) continue
      // Conflict with a sibling assignment this run?
      const assignedOn = assignedByCourtDay.get(liveKey) || []
      const siblingClash = assignedOn.some((a) =>
        intervalsOverlap(
          proposal.startTime, proposal.endTime,
          a.proposal.startTime, a.proposal.endTime,
        ),
      )
      if (siblingClash) continue
      picked = candidate
      break
    }

    if (!picked) {
      assignments.push({
        proposal,
        courtId: '',
        courtName: '',
        isIndoor: false,
        failed: failReason || 'no_court',
      })
      continue
    }

    const a: CourtAssignment = {
      proposal,
      courtId: picked.id,
      courtName: picked.name,
      isIndoor: picked.isIndoor,
    }
    assignments.push(a)
    const liveKey = `${picked.id}__${proposal.dayOfWeek}`
    if (!assignedByCourtDay.has(liveKey)) assignedByCourtDay.set(liveKey, [])
    assignedByCourtDay.get(liveKey)!.push(a)
    countByCourt.set(picked.id, (countByCourt.get(picked.id) || 0) + 1)
  }

  return assignments
  // weekStartDate is accepted for future (time-zone handling); currently
  // unused because proposals live in "abstract day of week" space.
  void weekStartDate
}

function rankCourtsForProposal(args: {
  proposal: AdvisorProgrammingProposalDraft
  courts: SchedulerCourt[]
  hoursByCourt: Map<string, { earliestStart: string; latestEnd: string }>
  liveByCourtDay: Map<string, SchedulerExistingSession[]>
  assignedByCourtDay: Map<string, CourtAssignment[]>
  countByCourt: Map<string, number>
}): SchedulerCourt[] {
  const { proposal, courts, liveByCourtDay, assignedByCourtDay, countByCourt } = args
  const startMinutes = hhmmToMinutes(proposal.startTime)
  const prefersIndoor = startMinutes >= hhmmToMinutes('17:00')

  // Weighted score per court — higher wins. Uses additive factors instead of
  // lexicographic sort so indoor preference yields to spread after the
  // indoor court has accumulated a couple of assignments this run (the
  // previous pure lexicographic ordering made indoor an absolute
  // preference, starving outdoor courts when 5+ evening slots went in).
  //
  //   • indoor match for evening  : +3  (outdoor evening: -3)
  //   • same-skill nearby penalty : -8 per hit (adjacent-hour same-tier)
  //   • spread penalty            : -4 per existing assignment on that court
  //
  // Net effect with 1 indoor + 2 outdoor and 5 evening proposals:
  //   P1 → indoor (indoor +3, outdoor -3)
  //   P2 → indoor still (indoor +3-4=-1 beats outdoor -3)
  //   P3 → outdoor (indoor -5, outdoor -3)
  //   P4 → other outdoor (spread)
  //   P5 → indoor again (it's now the least loaded indoor option)
  const scored = courts.map((c) => {
    let score = 0
    if (prefersIndoor) score += c.isIndoor ? 3 : -3
    const key = `${c.id}__${proposal.dayOfWeek}`
    const sameSkill = countSameSkillNearby(
      liveByCourtDay.get(key) || [], assignedByCourtDay.get(key) || [],
      proposal,
    )
    score -= sameSkill * 8
    score -= (countByCourt.get(c.id) || 0) * 4
    return { court: c, score }
  })
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    return a.court.name.localeCompare(b.court.name)
  })
  return scored.map((s) => s.court)
}

function countSameSkillNearby(
  liveOn: SchedulerExistingSession[],
  assignedOn: CourtAssignment[],
  proposal: AdvisorProgrammingProposalDraft,
): number {
  const proposalStart = hhmmToMinutes(proposal.startTime)
  let count = 0
  for (const live of liveOn) {
    if (live.skillLevel === proposal.skillLevel) {
      const delta = Math.abs(hhmmToMinutes(live.startTime) - proposalStart)
      if (delta <= 120) count += 1 // within 2h window
    }
  }
  for (const a of assignedOn) {
    if (a.proposal.skillLevel === proposal.skillLevel) {
      const delta = Math.abs(hhmmToMinutes(a.proposal.startTime) - proposalStart)
      if (delta <= 120) count += 1
    }
  }
  return count
}

// ── supplyDemandCheck ───────────────────────────────────────────────

/**
 * Pool-saturation check: given a set of proposed cells plus the club's
 * contact policy, does any skill-level pool end up seeing more invites
 * per member than the weekly cap allows?
 *
 * Returns a map from cell key → warning message for cells that the UI
 * should render with the `saturation` badge. Does NOT mutate the input.
 */
export function supplyDemandCheck(
  cells: GridCell[],
  preferences: SchedulerPreferenceRow[],
  policy: SchedulerContactPolicy,
): Map<string, string> {
  const warnings = new Map<string, string>()

  // Count eligible pool per skill tier (opt-outs excluded).
  const poolBySkill = new Map<string, number>()
  for (const p of preferences) {
    if (p.notificationsOptOut) continue
    const skill = normaliseSkillKey(p.skillLevel)
    poolBySkill.set(skill, (poolBySkill.get(skill) || 0) + 1)
  }

  // Capacity per skill tier across suggested + live cells this week.
  const capacityBySkill = new Map<string, number>()
  for (const cell of cells) {
    if (cell.kind !== 'live' && cell.kind !== 'suggested') continue
    const skill = normaliseSkillKey(cell.skillLevel)
    // Invite count = capacity × (1 + overbook buffer). 50% overbook is
    // the slot-filler default, so total potential invites per session is
    // cap × 1.5.
    const capacity = Math.max(1, cell.maxPlayers || 8)
    capacityBySkill.set(skill, (capacityBySkill.get(skill) || 0) + Math.ceil(capacity * 1.5))
  }

  // For each skill tier, compute average invites per eligible member.
  // If > policy cap → every suggested cell of that tier gets a warning.
  // Use Array.from rather than direct iteration because tsconfig target
  // pre-ES2015 would require downlevelIteration.
  for (const [skill, inviteCapacity] of Array.from(capacityBySkill.entries())) {
    const pool = poolBySkill.get(skill) || 0
    if (pool <= 0) continue
    const invitesPerMember = inviteCapacity / pool
    if (invitesPerMember > policy.inviteCapPerMemberPerWeek) {
      // Mark every suggested cell of this skill.
      for (const cell of cells) {
        if (cell.kind === 'suggested' && normaliseSkillKey(cell.skillLevel) === skill) {
          warnings.set(
            cell.key,
            `Saturated: this ${prettySkill(skill)} pool (${pool} members) would see ~${invitesPerMember.toFixed(1)} invites/week at current caps (${policy.inviteCapPerMemberPerWeek}). Consider removing lower-scoring sessions.`,
          )
        }
      }
    }
  }

  return warnings
}

function normaliseSkillKey(skill: PlaySessionSkillLevel | string | null | undefined): string {
  if (!skill) return 'unknown'
  return String(skill).toUpperCase()
}

function prettySkill(key: string): string {
  const map: Record<string, string> = {
    ALL_LEVELS: 'All Levels',
    BEGINNER: 'Beginner',
    CASUAL: 'Casual',
    INTERMEDIATE: 'Intermediate',
    COMPETITIVE: 'Competitive',
    ADVANCED: 'Advanced',
  }
  return map[key] || key.toLowerCase()
}

function isWeekend(dayOfWeek: DayOfWeek) {
  return dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday'
}

function isPrimeTimeProposal(proposal: AdvisorProgrammingProposalDraft) {
  return proposal.timeSlot === 'evening' || (isWeekend(proposal.dayOfWeek) && proposal.timeSlot === 'morning')
}

function getFormatSkillKey(proposal: AdvisorProgrammingProposalDraft) {
  return `${proposal.format}__${proposal.skillLevel}`
}

function getSlotSignature(proposal: AdvisorProgrammingProposalDraft) {
  return `${proposal.dayOfWeek}__${proposal.timeSlot}__${proposal.startTime}__${proposal.format}__${proposal.skillLevel}`
}

function getSuggestionVariantSignature(proposal: Pick<
  AdvisorProgrammingProposalDraft,
  'dayOfWeek' | 'startTime' | 'format' | 'skillLevel'
>) {
  return `${proposal.dayOfWeek}__${proposal.startTime}__${proposal.format}__${proposal.skillLevel}`
}

function getConflictPenalty(proposal: AdvisorProgrammingProposalDraft) {
  const conflict = proposal.conflict
  if (!conflict) return 0

  let penalty = 0
  penalty += conflict.overlapRisk === 'high' ? 20 : conflict.overlapRisk === 'medium' ? 8 : 0
  penalty += conflict.cannibalizationRisk === 'high' ? 28 : conflict.cannibalizationRisk === 'medium' ? 12 : 0
  penalty += conflict.courtPressureRisk === 'high' ? 16 : conflict.courtPressureRisk === 'medium' ? 7 : 0
  return penalty
}

function canDuplicateProposal(
  proposal: AdvisorProgrammingProposalDraft,
  selected: AdvisorProgrammingProposalDraft[],
) {
  const sameSlotSelected = selected.find((candidate) => getSlotSignature(candidate) === getSlotSignature(proposal))
  if (!sameSlotSelected) return true
  return (
    proposal.projectedOccupancy >= 90 &&
    proposal.conflict?.cannibalizationRisk === 'low' &&
    proposal.conflict?.courtPressureRisk !== 'high'
  )
}

function getPortfolioPenalty(
  proposal: AdvisorProgrammingProposalDraft,
  selected: AdvisorProgrammingProposalDraft[],
) {
  let penalty = 0

  const sameFormatSkillCount = selected.filter(
    (candidate) => getFormatSkillKey(candidate) === getFormatSkillKey(proposal),
  ).length
  if (sameFormatSkillCount > 0) {
    penalty += sameFormatSkillCount === 1 ? 10 : 10 + (sameFormatSkillCount - 1) * 14
  }

  const sameFormatCount = selected.filter((candidate) => candidate.format === proposal.format).length
  if (sameFormatCount >= 2) {
    penalty += (sameFormatCount - 1) * 6
  }

  const sameSlotCount = selected.filter(
    (candidate) => getSlotSignature(candidate) === getSlotSignature(proposal),
  ).length
  if (sameSlotCount > 0) {
    if (!canDuplicateProposal(proposal, selected)) return 999
    penalty += 14 * sameSlotCount
  }

  if (proposal.format === 'OPEN_PLAY' && isPrimeTimeProposal(proposal)) {
    const primeOpenPlayCount = selected.filter(
      (candidate) => candidate.format === 'OPEN_PLAY' && isPrimeTimeProposal(candidate),
    ).length
    if (primeOpenPlayCount >= 1) {
      penalty += 12 * primeOpenPlayCount
    }
  }

  return penalty
}

function getGreedySelectionScore(
  proposal: AdvisorProgrammingProposalDraft,
  selected: AdvisorProgrammingProposalDraft[],
) {
  const interestPressure = Math.min(
    100,
    Math.round((proposal.estimatedInterestedMembers / Math.max(proposal.maxPlayers || 1, 1)) * 100),
  )
  return (
    proposal.confidence * 1.0 +
    proposal.projectedOccupancy * 0.55 +
    interestPressure * 0.4 -
    getConflictPenalty(proposal) -
    getPortfolioPenalty(proposal, selected)
  )
}

function selectBalancedProposals(
  proposals: AdvisorProgrammingProposalDraft[],
  targetCount: number,
  pinnedProposalIds: string[] = [],
) {
  const remaining = [...proposals]
  const selected: AdvisorProgrammingProposalDraft[] = []
  const MIN_SELECTION_SCORE = 62

  if (pinnedProposalIds.length > 0) {
    const pinnedSet = new Set(pinnedProposalIds)
    const pinned = remaining.filter((proposal) => pinnedSet.has(proposal.id))

    for (const proposal of pinned) {
      if (selected.length >= targetCount) break
      selected.push(proposal)
    }

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (pinnedSet.has(remaining[index].id)) {
        remaining.splice(index, 1)
      }
    }
  }

  while (selected.length < targetCount && remaining.length > 0) {
    let bestIndex = -1
    let bestScore = Number.NEGATIVE_INFINITY

    for (let index = 0; index < remaining.length; index += 1) {
      const score = getGreedySelectionScore(remaining[index], selected)
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    }

    if (bestIndex < 0 || bestScore < MIN_SELECTION_SCORE) break

    selected.push(remaining[bestIndex])
    remaining.splice(bestIndex, 1)
  }

  if (selected.length === 0 && proposals.length > 0) {
    const fallback = [...proposals]
      .sort((left, right) => getGreedySelectionScore(right, []) - getGreedySelectionScore(left, []))[0]
    if (fallback && getGreedySelectionScore(fallback, []) >= 55) {
      selected.push(fallback)
    }
  }

  return selected
}

function diversifyAgainstPreviousSuggestions(
  proposals: AdvisorProgrammingProposalDraft[],
  previousSuggestionSignatures: string[],
) {
  if (previousSuggestionSignatures.length === 0) return proposals

  const seen = new Set(previousSuggestionSignatures)
  const diversified = proposals.map((proposal) => {
    if (!seen.has(getSuggestionVariantSignature(proposal))) return proposal
    return {
      ...proposal,
      confidence: Math.max(0, proposal.confidence - 12),
      rationale: [
        'Regenerate is exploring a nearby alternative instead of repeating the exact same slot mix.',
        ...proposal.rationale,
      ].slice(0, 4),
    }
  })

  return diversified.sort(
    (left, right) => getGreedySelectionScore(right, []) - getGreedySelectionScore(left, []),
  )
}

// ── buildWeeklyGrid ─────────────────────────────────────────────────

/**
 * Full pipeline: load signals → rank slots → assign courts → saturation
 * check → emit cells.
 *
 * `targetSuggestionCount` caps how many *new* suggestions land in the
 * grid. The advisor-programming planner internally generates proposals
 * in the tens; we pick the top N here and skip anything below a minimum
 * demand threshold — better to leave a cell empty than to force a low-
 * demand session onto the schedule.
 */
export function buildWeeklyGrid(input: BuildWeeklyGridInput): BuildWeeklyGridResult {
  const generationId = randomUUID()
  const activeCourts = input.courts.filter((c) => c.isActive)
  const targetCount = input.targetSuggestionCount ?? Math.max(10, activeCourts.length * 6)
  const regenerateRequest = input.regeneratePrompt?.trim()
    ? parseAdvisorProgrammingRequest(input.regeneratePrompt)
    : null

  // 1. Get a wide proposal set from the existing planner. We pass
  //    `limit` high enough to cover the grid; the planner dedupes.
  const plan = buildAdvisorProgrammingPlan({
    sessions: input.lastNDaysSessions,
    preferences: input.preferences,
    interestRequests: input.interestRequests,
    audienceProfile: input.audienceProfile,
    request: regenerateRequest,
    limit: Math.max(200, targetCount * 4),
    courtCount: activeCourts.length,
  })

  // 1a. Optional LLM re-weighting pass. The heuristic planner above has
  //     no knowledge of admin intent ("less open play, more weekday
  //     drills") — we apply that by scaling each proposal's confidence
  //     up/down based on the hint, then re-sorting. Hint may be null or
  //     effectively empty, in which case this is a no-op.
  let rankedProposals = plan.proposals
  if (input.regenerateHint) {
    // Late import so the scheduler can still be consumed in tests
    // without pulling the LLM module into their dependency graph.
    const { applyRegenerateHint } = require('./programming-iq-regenerate')
    rankedProposals = applyRegenerateHint(plan.proposals, input.regenerateHint)
  }
  if (!input.regeneratePrompt?.trim() && (input.previousSuggestionSignatures?.length || 0) > 0) {
    rankedProposals = diversifyAgainstPreviousSuggestions(
      rankedProposals,
      input.previousSuggestionSignatures || [],
    )
  }

  // 2. Synthesise same-slot variants across multiple courts where demand
  //    exceeds one court's capacity (e.g. Saturday 10am 4.0 league could
  //    justifiably run on two courts). We treat projectedOccupancy as a
  //    proxy for "how much headroom is there to duplicate this slot".
  const expanded: AdvisorProgrammingProposalDraft[] = []
  const seenExpandedIds = new Set<string>()
  if (regenerateRequest && plan.requested) {
    expanded.push(plan.requested)
    seenExpandedIds.add(plan.requested.id)
  }
  for (const proposal of rankedProposals) {
    if (seenExpandedIds.has(proposal.id)) continue
    expanded.push(proposal)
    seenExpandedIds.add(proposal.id)
    // Duplicate only when the underlying demand is extremely strong and
    // conflict risk is still comparatively low. This keeps us from
    // blindly splitting prime-time demand across two courts.
    if (
      proposal.projectedOccupancy >= 92 &&
      proposal.conflict?.cannibalizationRisk === 'low' &&
      proposal.conflict?.courtPressureRisk !== 'high' &&
      expanded.length < targetCount * 2
    ) {
      expanded.push({
        ...proposal,
        id: `${proposal.id}__dup`,
        confidence: Math.max(38, proposal.confidence - 14),
      })
      seenExpandedIds.add(`${proposal.id}__dup`)
    }
    if (expanded.length >= targetCount * 2) break
  }

  // 3. Greedy portfolio selection. We deliberately stop early when the
  // next candidate no longer clears the minimum business-quality bar.
  const eligible = selectBalancedProposals(
    expanded,
    targetCount,
    regenerateRequest && plan.requested ? [plan.requested.id] : [],
  )

  // 4. Bin-pack onto courts.
  const assignments = assignCourtsToProposals(
    eligible,
    input.courts,
    input.existingWeekSessions,
    input.historicalSessions,
    input.weekStartDate,
    input.timezone,
  )

  // 5. Emit suggested cells for successful assignments.
  const cells: GridCell[] = []
  let suggestedCount = 0
  let conflictCount = 0
  for (const a of assignments) {
    if (a.failed) {
      // Proposal couldn't be placed — keep it as an off-grid idea so the
      // admin still sees the demand signal and the reason it stayed out
      // of the publish-ready grid.
      const placementWarning =
        a.failed === 'outside_hours'
          ? 'This idea could not be placed because no active court appears to be operating during that window.'
          : 'This idea could not be placed because every active court already has a conflicting live or suggested session in that window.'
      cells.push({
        key: `conflict__${a.proposal.id}`,
        kind: 'conflict',
        courtId: '',
        courtName: 'Unassigned',
        dayOfWeek: a.proposal.dayOfWeek,
        startTime: a.proposal.startTime,
        endTime: a.proposal.endTime,
        title: a.proposal.title,
        format: a.proposal.format,
        skillLevel: a.proposal.skillLevel,
        maxPlayers: a.proposal.maxPlayers,
        projectedOccupancy: a.proposal.projectedOccupancy,
        estimatedInterestedMembers: a.proposal.estimatedInterestedMembers,
        confidence: a.proposal.confidence,
        rationale: a.proposal.rationale,
        warnings: [placementWarning, ...(a.proposal.conflict?.warnings || [])],
      })
      conflictCount += 1
      continue
    }
    cells.push({
      key: `${a.courtId}__${a.proposal.dayOfWeek}__${a.proposal.startTime}`,
      kind: 'suggested',
      courtId: a.courtId,
      courtName: a.courtName,
      dayOfWeek: a.proposal.dayOfWeek,
      startTime: a.proposal.startTime,
      endTime: a.proposal.endTime,
      title: a.proposal.title,
      format: a.proposal.format,
      skillLevel: a.proposal.skillLevel,
      maxPlayers: a.proposal.maxPlayers,
      projectedOccupancy: a.proposal.projectedOccupancy,
      estimatedInterestedMembers: a.proposal.estimatedInterestedMembers,
      confidence: a.proposal.confidence,
      rationale: a.proposal.rationale,
      warnings: a.proposal.conflict && a.proposal.conflict.overallRisk !== 'low'
        ? [a.proposal.conflict.riskSummary, ...a.proposal.conflict.warnings]
        : [],
    })
    suggestedCount += 1
  }

  // 6. Emit live cells (read-only in UI) from existing week sessions.
  let liveKept = 0
  for (const session of input.existingWeekSessions) {
    if (!session.courtId || session.status === 'CANCELLED') continue
    const court = activeCourts.find((c) => c.id === session.courtId)
    if (!court) continue
    const dow = dayOfWeekFromDate(new Date(session.date), input.timezone)
    cells.push({
      key: `live__${session.id}`,
      kind: 'live',
      courtId: session.courtId,
      courtName: court.name,
      dayOfWeek: dow,
      startTime: session.startTime,
      endTime: session.endTime,
      title: session.title,
      format: session.format,
      skillLevel: session.skillLevel,
      maxPlayers: session.maxPlayers,
      playSessionId: session.id,
    })
    liveKept += 1
  }

  // 7. Pool-saturation warnings across the combined cell set.
  const saturationWarnings = supplyDemandCheck(cells, input.preferences, input.contactPolicy)
  let saturationCount = 0
  for (const cell of cells) {
    const warning = saturationWarnings.get(cell.key)
    if (warning) {
      cell.kind = 'saturation'
      cell.warnings = [warning, ...(cell.warnings || [])]
      saturationCount += 1
    }
  }

  // 8. Roll-up stats + insights.
  const occupancyValues = cells
    .filter((c) => c.kind === 'suggested' || c.kind === 'live')
    .map((c) => c.projectedOccupancy || 0)
    .filter((v) => Number.isFinite(v) && v > 0)
  const avgProjected = occupancyValues.length === 0
    ? 0
    : Math.round(occupancyValues.reduce((a, b) => a + b, 0) / occupancyValues.length)
  const unmetInterestRequests = input.interestRequests.filter((request) => {
    const status = String(request.status || '').toLowerCase()
    return !request.sessionId && !['matched', 'fulfilled', 'completed', 'closed', 'cancelled'].includes(status)
  }).length
  const insights = [...plan.insights]
  if (!input.regeneratePrompt?.trim() && (input.previousSuggestionSignatures?.length || 0) > 0) {
    insights.unshift('Regenerate explored a nearby schedule variant instead of replaying the exact same portfolio.')
  }
  if (conflictCount > 0) {
    insights.unshift(`${conflictCount} requested or high-signal idea${conflictCount === 1 ? '' : 's'} could not be placed on an active court this week and were moved to Other ideas.`)
  }

  return {
    generationId,
    cells,
    stats: {
      liveKept,
      suggested: suggestedCount,
      empty: 0,
      conflicts: conflictCount,
      saturations: saturationCount,
      avgProjectedOccupancy: avgProjected,
    },
    insights,
    signalSummary: {
      monthsOfBookingData: 2,
      preferencesCount: input.preferences.length,
      unmetInterestRequests,
      activeCourts: activeCourts.length,
    },
  }
}
