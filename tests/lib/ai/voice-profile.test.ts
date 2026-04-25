/**
 * Unit tests for the voice-profile helpers.
 *
 * Voice affects EVERY AI outreach the club sends. Bad default or silent
 * parse failure → entire tenant ships emails in the wrong tone. These
 * tests pin down the defensible contracts so refactors don't drift.
 */

import { describe, it, expect } from 'vitest'
import {
  buildVoiceInstructions,
  composeSystem,
  parseVoiceSettings,
  buildFeedbackInstruction,
  buildRegenerationPrompt,
  DEFAULT_VOICE_SETTINGS,
} from '@/lib/ai/voice-profile'

describe('buildVoiceInstructions', () => {
  it('emits tone + length + formality + emoji lines from defaults when nothing stored', () => {
    const out = buildVoiceInstructions(null)
    expect(out).toContain('Tone:')
    expect(out).toContain('Length:')
    expect(out).toContain('Formality:')
    expect(out).toContain('Emoji:')
    // Default is useEmoji=false → "Do not use emoji"
    expect(out).toMatch(/Do not use emoji/i)
  })

  it('appends custom instructions verbatim when provided', () => {
    const out = buildVoiceInstructions({
      customInstructions: 'Use Texan slang when it fits. Sign off as "Coach Mike".',
    })
    expect(out).toContain('Coach Mike')
    expect(out).toContain('Texan slang')
  })

  it('switches emoji line when useEmoji=true', () => {
    const out = buildVoiceInstructions({ useEmoji: true })
    expect(out).toMatch(/Use 1 relevant emoji/)
    expect(out).not.toMatch(/Do not use emoji/)
  })

  it('custom user overrides take precedence over defaults (tone)', () => {
    const friendly = buildVoiceInstructions({ tone: 'friendly' })
    const energetic = buildVoiceInstructions({ tone: 'energetic' })
    expect(friendly).not.toEqual(energetic)
  })
})

describe('composeSystem', () => {
  it('appends voice block to the base system prompt', () => {
    const base = 'You are a messaging specialist.'
    const result = composeSystem(base, { tone: 'energetic', useEmoji: true })
    expect(result).toContain(base)
    expect(result).toContain('VOICE & TONE')
    // Base must come BEFORE voice — voice is an add-on
    expect(result.indexOf(base)).toBeLessThan(result.indexOf('VOICE & TONE'))
  })

  it('works with null/undefined voice (uses defaults)', () => {
    const result = composeSystem('BASE', null)
    expect(result.startsWith('BASE')).toBe(true)
    expect(result).toContain('VOICE & TONE')
  })
})

describe('parseVoiceSettings', () => {
  it('returns empty object for null/undefined raw input', () => {
    expect(parseVoiceSettings(null)).toEqual({})
    expect(parseVoiceSettings(undefined)).toEqual({})
  })

  it('returns empty object for non-object input (defensive against corrupt JSON)', () => {
    expect(parseVoiceSettings('broken')).toEqual({})
    expect(parseVoiceSettings(42)).toEqual({})
  })

  it('drops unknown enum values (schema strict)', () => {
    const result = parseVoiceSettings({ tone: 'SNARKY', length: 'medium' })
    // entire object fails schema → empty. This is intentional —
    // a single bad field shouldn't propagate known-bad settings.
    expect(result).toEqual({})
  })

  it('passes through valid partial settings', () => {
    const result = parseVoiceSettings({ tone: 'warm', useEmoji: true })
    expect(result.tone).toBe('warm')
    expect(result.useEmoji).toBe(true)
  })
})

describe('buildFeedbackInstruction', () => {
  it('maps preset keys to natural-language nudges', () => {
    const formal = buildFeedbackInstruction('too_formal')
    expect(formal).toMatch(/casual|conversational/i)

    const pushy = buildFeedbackInstruction('too_pushy')
    expect(pushy).toMatch(/invite|soften/i)
  })

  it('passes custom feedback through with admin context framing', () => {
    const result = buildFeedbackInstruction({ custom: 'Drop the word "awesome" entirely' })
    expect(result).toContain('Drop the word "awesome" entirely')
    expect(result).toMatch(/admin/i)
  })

  it('returns empty string for empty custom (no-op, caller can short-circuit)', () => {
    expect(buildFeedbackInstruction({ custom: '   ' })).toBe('')
  })
})

describe('buildRegenerationPrompt', () => {
  it('includes the previous output so LLM knows what to change', () => {
    const prompt = buildRegenerationPrompt({
      originalUserPrompt: 'Generate a slot filler invite',
      previousOutput: 'Hey Alex, there are spots open tomorrow.',
      feedback: 'too_casual',
    })
    expect(prompt).toContain('Hey Alex, there are spots open tomorrow.')
    expect(prompt).toContain('Generate a slot filler invite')
    expect(prompt).toMatch(/revision|fresh version/i)
  })

  it('truncates very long previous output to keep prompt budget sane', () => {
    const huge = 'x'.repeat(5000)
    const prompt = buildRegenerationPrompt({
      originalUserPrompt: 'base',
      previousOutput: huge,
      feedback: 'too_long',
    })
    // We cap at 1500 so prompt should not contain the full 5000-char blob.
    expect(prompt.length).toBeLessThan(5000)
  })
})

describe('DEFAULT_VOICE_SETTINGS', () => {
  it('has sensible defaults (friendly, medium, no emoji, casual)', () => {
    expect(DEFAULT_VOICE_SETTINGS.tone).toBe('friendly')
    expect(DEFAULT_VOICE_SETTINGS.length).toBe('medium')
    expect(DEFAULT_VOICE_SETTINGS.useEmoji).toBe(false)
    expect(DEFAULT_VOICE_SETTINGS.formality).toBe('casual')
    expect(DEFAULT_VOICE_SETTINGS.customInstructions).toBeNull()
  })
})
