/**
 * Programming IQ — LLM re-weighting pass.
 *
 * When admin hits "Regenerate" with a freeform prompt ("less open play,
 * more drills on weekdays", "bump Saturday mornings"), we ask the LLM to
 * translate that intent into a structured set of boosts/penalties for
 * the heuristic planner output. No open-ended generation — the LLM only
 * returns JSON that conforms to `RegenerateHint` so we can apply it
 * deterministically on top of `buildAdvisorProgrammingPlan`'s proposals.
 *
 * Design goals:
 *   - **Fast path when prompt is empty**: no LLM call, no latency.
 *   - **Deterministic apply**: the LLM picks categories, we multiply the
 *     scores. Admin never sees hallucinated proposals.
 *   - **Graceful degrade**: on timeout, parse error, missing API key, we
 *     log a warning and return the proposals untouched. The UI still
 *     gets the default heuristic schedule; only the "regenerate" flavour
 *     was dropped.
 *   - **Cheap**: one call to the fast tier (gpt-4o-mini), max 400 tokens
 *     out. JSON mode via system-prompt discipline (no tool-use dance).
 */

import type { AdvisorProgrammingProposalDraft } from './advisor-programming'

// ── Hint schema ─────────────────────────────────────────────────────

/**
 * Structured re-weighting hints extracted from the admin's freeform
 * prompt. Each list is a set of category strings — we match them
 * case-insensitively against proposal fields. Anything not recognised is
 * ignored (no throw), so LLM drift doesn't break the pipeline.
 */
export interface RegenerateHint {
  boostFormats: string[]
  penalizeFormats: string[]
  boostSkills: string[]
  penalizeSkills: string[]
  boostDays: string[]
  penalizeDays: string[]
  boostTimeSlots: Array<'morning' | 'afternoon' | 'evening'>
  penalizeTimeSlots: Array<'morning' | 'afternoon' | 'evening'>
  /** One-sentence summary of what the LLM understood. Surfaced in insights. */
  reasoning: string
}

const EMPTY_HINT: RegenerateHint = {
  boostFormats: [],
  penalizeFormats: [],
  boostSkills: [],
  penalizeSkills: [],
  boostDays: [],
  penalizeDays: [],
  boostTimeSlots: [],
  penalizeTimeSlots: [],
  reasoning: '',
}

const FORMAT_TERMS: Record<string, string[]> = {
  OPEN_PLAY: ['open play', 'openplay'],
  CLINIC: ['clinic', 'clinics'],
  DRILL: ['drill', 'drills'],
  LEAGUE_PLAY: ['league play', 'league', 'league night'],
  SOCIAL: ['social', 'social play'],
  TOURNAMENT: ['tournament', 'tournaments'],
}

const SKILL_TERMS: Record<string, string[]> = {
  ALL_LEVELS: ['all levels', 'all-levels'],
  BEGINNER: ['beginner', 'beginners', 'new player', 'new players', 'intro'],
  CASUAL: ['casual'],
  INTERMEDIATE: ['intermediate', '3.0', '3.5'],
  COMPETITIVE: ['competitive'],
  ADVANCED: ['advanced', '4.0', '4.5', '5.0'],
}

const POSITIVE_HINT_MARKERS = ['more', 'increase', 'boost', 'prioritize', 'focus on', 'add', 'extra']
const NEGATIVE_HINT_MARKERS = ['less', 'fewer', 'reduce', 'avoid', 'decrease', 'cut', 'lower']

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasMarkerNearTerm(
  prompt: string,
  markers: string[],
  terms: string[],
) {
  const markerGroup = markers.map(escapeRegex).join('|')
  const termGroup = terms.map(escapeRegex).join('|')
  const pattern = new RegExp(
    `(?:\\b(?:${markerGroup})\\b.{0,40}\\b(?:${termGroup})\\b)|(?:\\b(?:${termGroup})\\b.{0,40}\\b(?:${markerGroup})\\b)`,
    'i',
  )
  return pattern.test(prompt)
}

function includesAnyTerm(prompt: string, terms: string[]) {
  return terms.some((term) => prompt.includes(term))
}

export function buildHeuristicHintFromPrompt(prompt: string): RegenerateHint {
  const normalized = prompt.trim().toLowerCase()
  if (!normalized) return EMPTY_HINT
  const clauses = normalized
    .split(/[,.;&]/)
    .map((clause) => clause.trim())
    .filter(Boolean)

  const boostFormats = new Set<string>()
  const penalizeFormats = new Set<string>()
  const boostSkills = new Set<string>()
  const penalizeSkills = new Set<string>()
  const boostDays = new Set<string>()
  const penalizeDays = new Set<string>()
  const boostTimeSlots = new Set<'morning' | 'afternoon' | 'evening'>()
  const penalizeTimeSlots = new Set<'morning' | 'afternoon' | 'evening'>()

  const classifyClauses = (terms: string[]) => {
    let mentioned = false
    let positive = false
    let negative = false

    for (const clause of clauses) {
      if (!includesAnyTerm(clause, terms)) continue
      mentioned = true
      const hasPositiveMarker = POSITIVE_HINT_MARKERS.some((marker) => clause.includes(marker))
      const hasNegativeMarker = NEGATIVE_HINT_MARKERS.some((marker) => clause.includes(marker))
      if (hasPositiveMarker) positive = true
      if (hasNegativeMarker) negative = true
      if (!hasPositiveMarker && !hasNegativeMarker) positive = true
    }

    return { mentioned, positive, negative }
  }

  for (const [format, terms] of Object.entries(FORMAT_TERMS)) {
    const verdict = classifyClauses(terms)
    if (!verdict.mentioned) continue
    if (verdict.negative && !verdict.positive) {
      penalizeFormats.add(format)
      continue
    }
    if (verdict.positive) {
      boostFormats.add(format)
    }
  }

  for (const [skill, terms] of Object.entries(SKILL_TERMS)) {
    const verdict = classifyClauses(terms)
    if (!verdict.mentioned) continue
    if (verdict.negative && !verdict.positive) {
      penalizeSkills.add(skill)
      continue
    }
    if (verdict.positive) {
      boostSkills.add(skill)
    }
  }

  const days = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  ] as const
  for (const day of days) {
    const lower = day.toLowerCase()
    const verdict = classifyClauses([lower])
    if (!verdict.mentioned) continue
    if (verdict.negative && !verdict.positive) {
      penalizeDays.add(day)
    } else if (verdict.positive) {
      boostDays.add(day)
    }
  }

  if (normalized.includes('weekday')) {
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) {
      boostDays.add(day)
    }
  }
  if (normalized.includes('weekend')) {
    for (const day of ['Saturday', 'Sunday'] as const) {
      boostDays.add(day)
    }
  }

  const timeTerms: Array<{
    slot: 'morning' | 'afternoon' | 'evening'
    terms: string[]
  }> = [
    { slot: 'morning', terms: ['morning', 'mornings', 'early', 'before work'] },
    { slot: 'afternoon', terms: ['afternoon', 'afternoons', 'midday', 'lunch'] },
    { slot: 'evening', terms: ['evening', 'evenings', 'night', 'after work'] },
  ]

  for (const { slot, terms } of timeTerms) {
    const verdict = classifyClauses(terms)
    if (!verdict.mentioned) continue
    if (verdict.negative && !verdict.positive) {
      penalizeTimeSlots.add(slot)
    } else if (verdict.positive) {
      boostTimeSlots.add(slot)
    }
  }

  const hasDirectionalSignal =
    boostFormats.size > 0 ||
    penalizeFormats.size > 0 ||
    boostSkills.size > 0 ||
    penalizeSkills.size > 0 ||
    boostDays.size > 0 ||
    penalizeDays.size > 0 ||
    boostTimeSlots.size > 0 ||
    penalizeTimeSlots.size > 0

  return {
    boostFormats: Array.from(boostFormats),
    penalizeFormats: Array.from(penalizeFormats),
    boostSkills: Array.from(boostSkills),
    penalizeSkills: Array.from(penalizeSkills),
    boostDays: Array.from(boostDays),
    penalizeDays: Array.from(penalizeDays),
    boostTimeSlots: Array.from(boostTimeSlots),
    penalizeTimeSlots: Array.from(penalizeTimeSlots),
    reasoning: hasDirectionalSignal
      ? 'Prompt reweighted with heuristic fallback.'
      : '',
  }
}

// ── LLM call ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You translate a club admin's freeform scheduling preference into a structured re-weighting hint for an AI scheduler.

You MUST respond with valid JSON matching this exact shape:
{
  "boostFormats": string[],       // e.g. ["DRILL", "CLINIC"]
  "penalizeFormats": string[],    // e.g. ["OPEN_PLAY"]
  "boostSkills": string[],        // e.g. ["INTERMEDIATE"]
  "penalizeSkills": string[],     // e.g. ["ADVANCED"]
  "boostDays": string[],          // e.g. ["Monday", "Wednesday"]
  "penalizeDays": string[],
  "boostTimeSlots": string[],     // subset of ["morning", "afternoon", "evening"]
  "penalizeTimeSlots": string[],
  "reasoning": string             // ≤ 120 chars, plain English
}

Rules:
- Use UPPER_SNAKE_CASE for formats: OPEN_PLAY, CLINIC, DRILL, LEAGUE_PLAY, SOCIAL, TOURNAMENT.
- Use UPPER_SNAKE_CASE for skills: ALL_LEVELS, BEGINNER, CASUAL, INTERMEDIATE, COMPETITIVE, ADVANCED.
- Use full day names: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- Time slots are always lowercase: morning, afternoon, evening.
- Leave lists empty if the admin didn't mention that dimension.
- Don't invent preferences the admin didn't express. Ambiguous → empty.
- NEVER add commentary outside the JSON block.`

interface InterpretOpts {
  prompt: string
  clubId?: string
  /** Test/demo override: return this hint instead of calling the LLM. */
  mockHint?: RegenerateHint
}

/**
 * Ask the LLM to turn a prompt into a RegenerateHint. Returns the empty
 * hint on any failure (no-op), plus a log line so we can tell why.
 */
export async function interpretRegeneratePrompt(
  opts: InterpretOpts,
): Promise<RegenerateHint> {
  const prompt = opts.prompt?.trim()
  if (!prompt) return EMPTY_HINT
  if (opts.mockHint) return opts.mockHint

  // Skip when no API key is configured — tests/local dev without creds
  // should silently degrade, not throw.
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.warn('[programming-iq] regenerate: no LLM credentials, using heuristic fallback')
    return buildHeuristicHintFromPrompt(prompt)
  }

  try {
    const { generateWithFallback } = await import('./llm/provider')
    const result = await generateWithFallback({
      system: SYSTEM_PROMPT,
      prompt: `Admin request: "${prompt}"\n\nReturn ONLY the JSON object.`,
      tier: 'fast',
      maxTokens: 400,
      timeoutMs: 15_000,
      clubId: opts.clubId,
      operation: 'programming_iq_regenerate',
    })
    return parseHint(result.text)
  } catch (err: any) {
    console.warn(
      '[programming-iq] regenerate LLM failed:',
      (err?.message || 'unknown').slice(0, 160),
    )
    return buildHeuristicHintFromPrompt(prompt)
  }
}

/**
 * Extract a JSON object from the LLM response and coerce it into the
 * RegenerateHint shape. We're defensive: unknown fields are dropped,
 * wrong types become empty arrays, missing `reasoning` becomes ''.
 */
export function parseHint(raw: string): RegenerateHint {
  if (!raw) return EMPTY_HINT
  // Some models wrap their JSON in ```json fences — strip them.
  const stripped = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*$/gi, '')
    .trim()
  // Locate the first `{` ... last `}` so trailing prose doesn't break
  // JSON.parse.
  const firstBrace = stripped.indexOf('{')
  const lastBrace = stripped.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return EMPTY_HINT
  }
  let parsed: any
  try {
    parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1))
  } catch {
    return EMPTY_HINT
  }

  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string') as string[] : []
  const timeSlotArr = (v: unknown): Array<'morning' | 'afternoon' | 'evening'> =>
    arr(v)
      .map((s) => s.toLowerCase())
      .filter((s): s is 'morning' | 'afternoon' | 'evening' =>
        s === 'morning' || s === 'afternoon' || s === 'evening',
      )

  return {
    boostFormats: arr(parsed.boostFormats).map((s) => s.toUpperCase()),
    penalizeFormats: arr(parsed.penalizeFormats).map((s) => s.toUpperCase()),
    boostSkills: arr(parsed.boostSkills).map((s) => s.toUpperCase()),
    penalizeSkills: arr(parsed.penalizeSkills).map((s) => s.toUpperCase()),
    boostDays: arr(parsed.boostDays),
    penalizeDays: arr(parsed.penalizeDays),
    boostTimeSlots: timeSlotArr(parsed.boostTimeSlots),
    penalizeTimeSlots: timeSlotArr(parsed.penalizeTimeSlots),
    reasoning: typeof parsed.reasoning === 'string'
      ? parsed.reasoning.slice(0, 200)
      : '',
  }
}

// ── Apply hint to proposals ─────────────────────────────────────────

/**
 * Multiplicative boosts/penalties. Staying gentle — we don't want to
 * completely wipe the heuristic output, just nudge the ranking. Admin
 * can always Reject suggestions they don't like.
 */
const BOOST_MULTIPLIER = 1.12
const PENALTY_MULTIPLIER = 0.90
const MIN_TOTAL_MULTIPLIER = 0.86
const MAX_TOTAL_MULTIPLIER = 1.18

/**
 * Apply a RegenerateHint to a list of proposals by scaling each
 * proposal's `confidence` by (1 + Σ boosts − Σ penalties) applied per
 * matched dimension. Empty hint → no change, returned array is a new
 * reference. Re-sorts by effective score descending so downstream bin-
 * packing sees the preferred slots first.
 */
export function applyRegenerateHint(
  proposals: AdvisorProgrammingProposalDraft[],
  hint: RegenerateHint,
): AdvisorProgrammingProposalDraft[] {
  if (!hasAnyHint(hint)) return proposals

  const scored = proposals.map((p) => {
    let multiplier = 1
    if (hint.boostFormats.includes(p.format.toUpperCase())) multiplier *= BOOST_MULTIPLIER
    if (hint.penalizeFormats.includes(p.format.toUpperCase())) multiplier *= PENALTY_MULTIPLIER
    if (hint.boostSkills.includes(p.skillLevel.toUpperCase())) multiplier *= BOOST_MULTIPLIER
    if (hint.penalizeSkills.includes(p.skillLevel.toUpperCase())) multiplier *= PENALTY_MULTIPLIER
    if (hint.boostDays.includes(p.dayOfWeek)) multiplier *= BOOST_MULTIPLIER
    if (hint.penalizeDays.includes(p.dayOfWeek)) multiplier *= PENALTY_MULTIPLIER
    if (hint.boostTimeSlots.includes(p.timeSlot)) multiplier *= BOOST_MULTIPLIER
    if (hint.penalizeTimeSlots.includes(p.timeSlot)) multiplier *= PENALTY_MULTIPLIER
    multiplier = Math.max(MIN_TOTAL_MULTIPLIER, Math.min(MAX_TOTAL_MULTIPLIER, multiplier))

    return {
      ...p,
      confidence: Math.max(0, Math.min(100, Math.round(p.confidence * multiplier))),
    }
  })

  // Sort by effective confidence so bin-packing sees the preferred
  // slots first. Keep the original sort tiebreaker (higher projected
  // occupancy wins on equal confidence).
  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.projectedOccupancy - a.projectedOccupancy
  })
  return scored
}

function hasAnyHint(hint: RegenerateHint): boolean {
  return (
    hint.boostFormats.length > 0
    || hint.penalizeFormats.length > 0
    || hint.boostSkills.length > 0
    || hint.penalizeSkills.length > 0
    || hint.boostDays.length > 0
    || hint.penalizeDays.length > 0
    || hint.boostTimeSlots.length > 0
    || hint.penalizeTimeSlots.length > 0
  )
}
