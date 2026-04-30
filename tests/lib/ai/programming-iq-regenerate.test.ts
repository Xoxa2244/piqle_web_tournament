/**
 * Unit tests for the Programming IQ LLM re-weighting pass.
 *
 * We don't mock the LLM call in these tests — `interpretRegeneratePrompt`
 * has its own no-credentials short-circuit that returns an empty hint,
 * so the integration path is exercised directly in end-to-end checks.
 * Here we pin:
 *   • parseHint tolerates fences / trailing prose / bad JSON
 *   • applyRegenerateHint boosts + penalises deterministically
 *   • hasAnyHint gating: empty hint is a no-op on proposals
 *   • upper-casing is applied to formats/skills so `"drill"` in the
 *     prompt matches `"DRILL"` on the proposal
 */

import { describe, it, expect } from 'vitest'
import {
  parseHint,
  applyRegenerateHint,
  buildHeuristicHintFromPrompt,
  type RegenerateHint,
} from '@/lib/ai/programming-iq-regenerate'
import type { AdvisorProgrammingProposalDraft } from '@/lib/ai/advisor-programming'

// ── Fixtures ─────────────────────────────────────────────────────────

function proposal(
  overrides: Partial<AdvisorProgrammingProposalDraft> = {},
): AdvisorProgrammingProposalDraft {
  return {
    id: overrides.id || 'p-1',
    title: overrides.title || 'Test',
    dayOfWeek: overrides.dayOfWeek || 'Tuesday',
    timeSlot: overrides.timeSlot || 'evening',
    startTime: overrides.startTime || '19:00',
    endTime: overrides.endTime || '20:30',
    format: overrides.format || 'OPEN_PLAY',
    skillLevel: overrides.skillLevel || 'INTERMEDIATE',
    maxPlayers: overrides.maxPlayers || 8,
    projectedOccupancy: overrides.projectedOccupancy || 75,
    estimatedInterestedMembers: overrides.estimatedInterestedMembers || 20,
    confidence: overrides.confidence || 70,
    source: overrides.source || 'expand_peak',
    rationale: overrides.rationale || ['test'],
    conflict: overrides.conflict,
  }
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

// ── parseHint ────────────────────────────────────────────────────────

describe('parseHint', () => {
  it('returns empty on empty input', () => {
    const hint = parseHint('')
    expect(hint.boostFormats).toEqual([])
    expect(hint.reasoning).toBe('')
  })

  it('returns empty on non-JSON garbage', () => {
    const hint = parseHint('I am an LLM, not a JSON emitter')
    expect(hint.boostFormats).toEqual([])
  })

  it('parses a clean JSON response', () => {
    const hint = parseHint(JSON.stringify({
      boostFormats: ['DRILL'],
      penalizeFormats: ['OPEN_PLAY'],
      boostSkills: [],
      penalizeSkills: [],
      boostDays: ['Monday'],
      penalizeDays: [],
      boostTimeSlots: ['morning'],
      penalizeTimeSlots: [],
      reasoning: 'More weekday drills.',
    }))
    expect(hint.boostFormats).toEqual(['DRILL'])
    expect(hint.penalizeFormats).toEqual(['OPEN_PLAY'])
    expect(hint.boostDays).toEqual(['Monday'])
    expect(hint.boostTimeSlots).toEqual(['morning'])
    expect(hint.reasoning).toBe('More weekday drills.')
  })

  it('strips ```json fences around the JSON block', () => {
    const raw = '```json\n{"boostFormats":["DRILL"],"reasoning":"ok"}\n```'
    const hint = parseHint(raw)
    expect(hint.boostFormats).toEqual(['DRILL'])
  })

  it('survives trailing prose after the JSON block', () => {
    const raw = '{"boostFormats":["DRILL"]}\n\nThat should do it!'
    const hint = parseHint(raw)
    expect(hint.boostFormats).toEqual(['DRILL'])
  })

  it('upper-cases formats + skills so prompt casing doesn\'t matter', () => {
    const hint = parseHint(JSON.stringify({
      boostFormats: ['drill', 'Clinic'],
      penalizeSkills: ['advanced'],
    }))
    expect(hint.boostFormats).toEqual(['DRILL', 'CLINIC'])
    expect(hint.penalizeSkills).toEqual(['ADVANCED'])
  })

  it('filters time slots to the three canonical values', () => {
    const hint = parseHint(JSON.stringify({
      boostTimeSlots: ['morning', 'twilight', 'EVENING'], // twilight is junk
    }))
    expect(hint.boostTimeSlots).toEqual(['morning', 'evening'])
  })

  it('clamps reasoning length to 200 chars', () => {
    const longReason = 'x'.repeat(500)
    const hint = parseHint(JSON.stringify({ reasoning: longReason }))
    expect(hint.reasoning.length).toBe(200)
  })

  it('drops non-array fields gracefully', () => {
    const hint = parseHint(JSON.stringify({
      boostFormats: 'not an array',
      penalizeFormats: 42,
    }))
    expect(hint.boostFormats).toEqual([])
    expect(hint.penalizeFormats).toEqual([])
  })
})

describe('buildHeuristicHintFromPrompt', () => {
  it('extracts directional format and timing hints without an LLM', () => {
    const hint = buildHeuristicHintFromPrompt('Less open play, more drills on weekdays in the evening')
    expect(hint.penalizeFormats).toContain('OPEN_PLAY')
    expect(hint.boostFormats).toContain('DRILL')
    expect(hint.boostDays).toEqual(expect.arrayContaining(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']))
    expect(hint.boostTimeSlots).toContain('evening')
  })

  it('returns empty when the prompt has no recognizable scheduling intent', () => {
    const hint = buildHeuristicHintFromPrompt('hello there')
    expect(hint.boostFormats).toEqual([])
    expect(hint.reasoning).toBe('')
  })
})

// ── applyRegenerateHint ──────────────────────────────────────────────

describe('applyRegenerateHint', () => {
  it('is a no-op with an empty hint', () => {
    const p = [proposal({ confidence: 70 })]
    const out = applyRegenerateHint(p, EMPTY_HINT)
    expect(out[0].confidence).toBe(70)
  })

  it('boosts matching format gently', () => {
    const p = [proposal({ format: 'DRILL', confidence: 60 })]
    const out = applyRegenerateHint(p, { ...EMPTY_HINT, boostFormats: ['DRILL'] })
    // 60 × 1.12 = 67.2 → 67
    expect(out[0].confidence).toBe(67)
  })

  it('penalizes matching format gently', () => {
    const p = [proposal({ format: 'OPEN_PLAY', confidence: 80 })]
    const out = applyRegenerateHint(p, { ...EMPTY_HINT, penalizeFormats: ['OPEN_PLAY'] })
    // 80 × 0.90 = 72
    expect(out[0].confidence).toBe(72)
  })

  it('caps stacked boosts so AI stays a modifier, not a rewrite', () => {
    const p = [proposal({ format: 'DRILL', dayOfWeek: 'Monday', confidence: 60 })]
    const out = applyRegenerateHint(p, {
      ...EMPTY_HINT,
      boostFormats: ['DRILL'],
      boostDays: ['Monday'],
    })
    // 60 × 1.12 × 1.12 = 75.26 but total multiplier is capped at 1.18 → 71
    expect(out[0].confidence).toBe(71)
  })

  it('sorts results by effective confidence descending', () => {
    const proposals = [
      proposal({ id: 'a', format: 'OPEN_PLAY', confidence: 90 }),
      proposal({ id: 'b', format: 'DRILL', confidence: 60 }),
    ]
    const out = applyRegenerateHint(proposals, {
      ...EMPTY_HINT,
      boostFormats: ['DRILL'],
      penalizeFormats: ['OPEN_PLAY'],
    })
    // a: 90 × 0.90 = 81; b: 60 × 1.12 = 67 → a stays first
    expect(out[0].id).toBe('a')
    expect(out[1].id).toBe('b')
  })

  it('can still reorder when several capped nudges accumulate against a weaker baseline', () => {
    const proposals = [
      proposal({ id: 'a', format: 'OPEN_PLAY', dayOfWeek: 'Friday', timeSlot: 'morning', confidence: 68 }),
      proposal({ id: 'b', format: 'DRILL', dayOfWeek: 'Monday', timeSlot: 'evening', confidence: 64 }),
    ]
    const out = applyRegenerateHint(proposals, {
      ...EMPTY_HINT,
      boostFormats: ['DRILL'],
      boostDays: ['Monday'],
      boostTimeSlots: ['evening'],
      penalizeFormats: ['OPEN_PLAY'],
    })
    // a: 68 × 0.90 = 61; b: capped at 64 × 1.18 = 76 → b first
    expect(out[0].id).toBe('b')
    expect(out[1].id).toBe('a')
  })

  it('caps confidence at 100', () => {
    const p = [proposal({ format: 'DRILL', confidence: 90 })]
    const out = applyRegenerateHint(p, { ...EMPTY_HINT, boostFormats: ['DRILL'] })
    // 90 × 1.12 = 100.8 → 100
    expect(out[0].confidence).toBe(100)
  })

  it('does not match when hint uses wrong case (caller should upper-case)', () => {
    // applyRegenerateHint trusts parseHint output — it upper-cases for
    // formats/skills. If a caller hands a lowercase hint, no match.
    const p = [proposal({ format: 'DRILL', confidence: 60 })]
    const out = applyRegenerateHint(p, { ...EMPTY_HINT, boostFormats: ['drill'] })
    expect(out[0].confidence).toBe(60)
  })
})
