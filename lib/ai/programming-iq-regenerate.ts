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
    console.warn('[programming-iq] regenerate: no LLM credentials, skipping re-weight')
    return EMPTY_HINT
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
    return EMPTY_HINT
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
const BOOST_MULTIPLIER = 1.25
const PENALTY_MULTIPLIER = 0.7

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
