/**
 * Voice / Tone Profile — per-club customization of AI outreach.
 *
 * A single source of truth for the writing style every LLM-generated
 * message for a club should follow. Stored on clubs.voice_settings as
 * JSONB so we can evolve the shape without a migration each time.
 *
 * Flow:
 *   1. Admin picks a tone preset (friendly/professional/energetic/warm)
 *      + length + emoji + formality + optional free-form notes.
 *   2. Every generator (slot-filler, reactivation, check-in, campaigns)
 *      calls buildVoiceInstructions() and appends the result to its
 *      system prompt.
 *   3. Admin previews, sees result, hits "Too formal" → we regenerate
 *      with an additional nudge instruction → when they like it, the
 *      resolved tone goes back into the stored voice profile.
 *
 * Why strings, not a giant prompt template: each caller has its own
 * task-specific system prompt (slot-filler cares about session details,
 * reactivation about cadence). Voice is a CROSS-CUTTING layer — small
 * appended block that nudges style without touching task semantics.
 */

import { z } from 'zod'

// ── Schema ─────────────────────────────────────────────────────────

export const TONE_PRESETS = ['friendly', 'professional', 'energetic', 'warm'] as const
export const LENGTH_OPTIONS = ['short', 'medium', 'long'] as const
export const FORMALITY_OPTIONS = ['casual', 'neutral', 'formal'] as const

export type TonePreset = (typeof TONE_PRESETS)[number]
export type LengthOption = (typeof LENGTH_OPTIONS)[number]
export type FormalityOption = (typeof FORMALITY_OPTIONS)[number]

/**
 * Persisted shape. Everything optional because NULL = use defaults,
 * and partial updates are allowed (admin may only care about tone).
 */
export const voiceSettingsSchema = z.object({
  tone: z.enum(TONE_PRESETS).optional(),
  length: z.enum(LENGTH_OPTIONS).optional(),
  useEmoji: z.boolean().optional(),
  formality: z.enum(FORMALITY_OPTIONS).optional(),
  customInstructions: z.string().max(1500).optional(),
  // Bookkeeping — set on update.
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
})

export type VoiceSettings = z.infer<typeof voiceSettingsSchema>

// ── Platform defaults — used when club has no voice_settings yet ──

export const DEFAULT_VOICE_SETTINGS: Required<
  Pick<VoiceSettings, 'tone' | 'length' | 'useEmoji' | 'formality'>
> & { customInstructions: string | null } = {
  tone: 'friendly',
  length: 'medium',
  useEmoji: false,
  formality: 'casual',
  customInstructions: null,
}

// ── Tone → style descriptors that go into the LLM prompt ──
// Kept human-readable; the LLM absorbs them as guidance, not rules.
const TONE_HINTS: Record<TonePreset, string> = {
  friendly: 'Warm and approachable. Sounds like a message from a helpful community manager, not a corporate marketer.',
  professional: 'Polished and clear. Respectful of the reader\'s time — brief greeting, quick value, clear action.',
  energetic: 'Enthusiastic and upbeat. Conveys excitement about playing without being over-the-top or pushy.',
  warm: 'Personal and genuine. Acknowledges the reader as an individual, not a data point. Slightly conversational.',
}

const LENGTH_HINTS: Record<LengthOption, string> = {
  short: 'Keep it to 2-3 sentences max. Every word earns its place. Ideal for SMS-like use cases even in email.',
  medium: 'Typical 3-5 sentences. One idea per paragraph. Opening, value, action.',
  long: 'Up to 2 short paragraphs. Room for social proof or a bit of context, but still respecting their time.',
}

const FORMALITY_HINTS: Record<FormalityOption, string> = {
  casual: 'Use first names ("Hi Alex,"). Contractions are fine ("you\'re", "we\'ll"). No "Dear" or "Regards".',
  neutral: 'First names with a friendly opener ("Hi Alex," or "Hey Alex,"). Neutral register, no slang.',
  formal: 'Respectful but not stuffy ("Hi Alex," or "Hello Alex,"). No contractions in the opening line. Sign-offs feel polite.',
}

// ── Core: build the voice-instructions block for a system prompt ──

/**
 * Turns stored voice settings into a clearly-delimited block of guidance
 * for the LLM. Designed to be APPENDED to an existing system prompt.
 *
 * Returns '' when the block would be meaningless (no settings + no custom
 * instructions) — we don't want to bloat every prompt with empty defaults.
 *
 * Shape intentionally uses hyphen bullets (not JSON / not XML) — LLMs
 * follow natural-language guidance better than they follow structured
 * config in a system prompt.
 */
export function buildVoiceInstructions(settings?: VoiceSettings | null): string {
  const v: VoiceSettings = settings || {}
  const lines: string[] = []

  const tone = v.tone || DEFAULT_VOICE_SETTINGS.tone
  lines.push(`- Tone: ${TONE_HINTS[tone]}`)

  const length = v.length || DEFAULT_VOICE_SETTINGS.length
  lines.push(`- Length: ${LENGTH_HINTS[length]}`)

  const formality = v.formality || DEFAULT_VOICE_SETTINGS.formality
  lines.push(`- Formality: ${FORMALITY_HINTS[formality]}`)

  const useEmoji = v.useEmoji ?? DEFAULT_VOICE_SETTINGS.useEmoji
  lines.push(
    useEmoji
      ? '- Emoji: Use 1 relevant emoji per message when it adds warmth, never more.'
      : '- Emoji: Do not use emoji.',
  )

  const custom = v.customInstructions?.trim()
  if (custom) {
    lines.push(`- Club-specific voice: ${custom}`)
  }

  return `\n\nVOICE & TONE (follow this style):\n${lines.join('\n')}`
}

/**
 * Compose a system prompt with voice injected.
 * Thin wrapper so every caller has one line to remember:
 *   `system: composeSystem(baseSystemPrompt, club.voiceSettings)`
 */
export function composeSystem(basePrompt: string, voice?: VoiceSettings | null): string {
  return basePrompt + buildVoiceInstructions(voice)
}

// ── Feedback-to-instruction — for preview regenerate ──
// When admin clicks "Too formal" we need to turn that into a sentence
// the LLM will actually listen to. Keep it imperative and specific.
const FEEDBACK_NUDGES: Record<string, string> = {
  too_formal: 'The previous attempt was too formal. Make this next one feel more casual and conversational — like a friendly note from a community manager.',
  too_casual: 'The previous attempt was too casual. Make this next one a bit more polished — respectful without being stiff.',
  too_long: 'The previous attempt was too long. Cut it to 2-3 tight sentences while keeping the core value proposition.',
  too_short: 'The previous attempt was too short. Expand with one extra sentence of warmth or context — still under 2 short paragraphs.',
  too_generic: 'The previous attempt was too generic. Reference concrete details from the provided context (session name, days, partners) instead of stock phrases.',
  too_pushy: 'The previous attempt felt too pushy/salesy. Soften it — invite rather than urge. No fake urgency.',
}

export type VoiceFeedback = keyof typeof FEEDBACK_NUDGES | { custom: string }

/**
 * Build an add-on instruction from preview feedback. Either a preset
 * label ('too_formal' etc) or a `{ custom: '...' }` freeform note.
 */
export function buildFeedbackInstruction(feedback: VoiceFeedback): string {
  if (typeof feedback === 'string') {
    return FEEDBACK_NUDGES[feedback] || ''
  }
  const custom = feedback.custom?.trim()
  if (!custom) return ''
  return `Revision note from the club admin: ${custom}. Incorporate this into the next attempt.`
}

/**
 * Merge a feedback-derived revision nudge into a previously-generated
 * message context. Called by the regenerate endpoint so the LLM sees
 * both the prior output AND why it wasn't accepted.
 */
export function buildRegenerationPrompt(args: {
  originalUserPrompt: string
  previousOutput: string
  feedback: VoiceFeedback
}): string {
  const nudge = buildFeedbackInstruction(args.feedback)
  return [
    args.originalUserPrompt,
    '',
    'PREVIOUS ATTEMPT (which did not meet the club admin\'s bar):',
    args.previousOutput.slice(0, 1500), // cap to keep prompt budget sane
    '',
    'REVISION REQUIRED:',
    nudge,
    '',
    'Generate a fresh version that addresses the revision note while still fulfilling the original task.',
  ].join('\n')
}

// ── Helpers for tRPC / Prisma handoff ──

/**
 * Safely parse voice_settings from the DB (it's Prisma.JsonValue).
 * Returns an empty object on any shape mismatch — never throws, never
 * lets a bad cast blow up an outgoing email generation.
 */
export function parseVoiceSettings(raw: unknown): VoiceSettings {
  if (!raw || typeof raw !== 'object') return {}
  const parsed = voiceSettingsSchema.safeParse(raw)
  return parsed.success ? parsed.data : {}
}
