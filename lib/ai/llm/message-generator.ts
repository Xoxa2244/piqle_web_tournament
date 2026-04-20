/**
 * LLM-Powered Message Generator with Performance Feedback Loop
 *
 * Generates outreach/sequence message variants via LLM (gpt-4o-mini → haiku fallback).
 * The system is self-improving:
 *   1. LLM generates 3 variants per message type using prescribed strategies
 *   2. Variant optimizer A/B tests them via multi-armed bandit
 *   3. Top/bottom performing subject lines are fed back into the LLM prompt
 *   4. LLM learns what works and generates better copy over time
 *
 * Key design:
 *   - Generated ONCE per message type per club per day (not per member)
 *   - Uses template variables ({{name}}, {{club}}, etc.) interpolated per member
 *   - Strategy-based variant IDs for stable optimizer tracking
 *   - Hardcoded templates as fallback if LLM fails
 */

import { generateWithFallback } from './provider'
import { composeSystem, type VoiceSettings } from '@/lib/ai/voice-profile'

// ── Types ──

export interface LLMMessageVariant {
  /** Deterministic ID based on strategy: e.g. "llm_checkin_pattern" */
  id: string
  /** Strategy name used for this variant */
  strategy: string
  emailSubject: string
  emailBody: string
  smsBody: string
}

export interface PerformanceExample {
  subjectLine: string
  openRate: number    // 0-1
  clickRate: number   // 0-1
  engagementScore: number
}

export interface MessageGenerationContext {
  clubName: string
  tone: 'friendly' | 'professional' | 'casual'
  topPerformers: PerformanceExample[]
  bottomPerformers: PerformanceExample[]
}

export interface GenerateVariantsParams {
  /** Message type key: "CHECK_IN", "RETENTION_BOOST", or sequence message types */
  messageType: string
  /** Club context + performance history */
  context: MessageGenerationContext
  /** Which channel(s) to generate for */
  channel: 'email' | 'sms' | 'both'
  /** Club ID — enables per-club cost tracking in generateWithFallback. Optional for legacy callers and tests. */
  clubId?: string
  /**
   * Per-club voice/tone profile. When provided, the club's custom tone is
   * injected into the system prompt so generated variants match the club's
   * style (casual Texan vs formal corporate, emoji vs no-emoji, etc).
   * Omit for platform defaults.
   */
  voice?: VoiceSettings | null
}

// ── Strategy Definitions ──

interface StrategyConfig {
  strategies: Array<{ key: string; description: string }>
  prefix: string
  /** Brief description of the overall message purpose for the LLM */
  purpose: string
}

const STRATEGY_MAP: Record<string, StrategyConfig> = {
  // ── Step 0: Initial outreach ──
  CHECK_IN: {
    prefix: 'llm_checkin',
    purpose: 'Light check-in for members whose activity has slightly declined (health 50-74). Friendly, not pushy.',
    strategies: [
      { key: 'pattern', description: 'Focus on their missed routine/schedule pattern' },
      { key: 'social', description: 'Leverage social proof — who else is playing, peers at their level' },
      { key: 'urgency', description: 'Create gentle urgency — limited spots, upcoming session timing' },
    ],
  },
  RETENTION_BOOST: {
    prefix: 'llm_retention',
    purpose: 'Stronger outreach for at-risk members (health 25-49). Show they are valued, create motivation to return.',
    strategies: [
      { key: 'value', description: 'Emphasize how much they matter to the community' },
      { key: 'community', description: 'Community connection — friends miss them, group is growing' },
      { key: 'urgency', description: 'Urgency — spots filling fast, time-sensitive opportunity' },
    ],
  },
  // ── Steps 1-3: Sequence follow-ups ──
  resend_new_subject: {
    prefix: 'llm_resend',
    purpose: 'Resend to non-openers with a completely different, more compelling subject line.',
    strategies: [
      { key: 'curiosity', description: 'Spark curiosity — question or unexpected angle' },
      { key: 'urgency', description: 'Urgency-driven — time or scarcity based' },
      { key: 'personal', description: 'Ultra-personal — reference their name, club, specific session' },
    ],
  },
  social_proof: {
    prefix: 'llm_social',
    purpose: 'Social proof for members who opened but didn\'t click. Show others are joining.',
    strategies: [
      { key: 'fomo', description: 'Fear of missing out — "everyone is joining, don\'t be left out"' },
      { key: 'community', description: 'Community belonging — "your group is growing"' },
      { key: 'achievement', description: 'Achievement angle — "level up with players at your skill"' },
    ],
  },
  value_reminder: {
    prefix: 'llm_value',
    purpose: 'Value reminder for at-risk members who opened. Focus on what the club offers.',
    strategies: [
      { key: 'progress', description: 'Skill progress — what they\'re missing in terms of improvement' },
      { key: 'belonging', description: 'Belonging — they\'re part of something, club improvements' },
      { key: 'fomo', description: 'What\'s new — new features, events, improvements they haven\'t seen' },
    ],
  },
  urgency_resend: {
    prefix: 'llm_urgency',
    purpose: 'Urgency-focused resend for at-risk non-openers. Stronger push.',
    strategies: [
      { key: 'scarcity', description: 'Scarcity — specific number of spots left' },
      { key: 'deadline', description: 'Time pressure — session is soon, last chance to sign up' },
      { key: 'personal', description: 'Personal appeal — "we saved a spot for you"' },
    ],
  },
  sms_nudge: {
    prefix: 'llm_sms',
    purpose: 'Short SMS nudge. Must be under 160 chars. Casual, direct.',
    strategies: [
      { key: 'casual', description: 'Casual friend-like tone — "hey, coming to play?"' },
      { key: 'direct', description: 'Direct CTA — session name + time, clear ask' },
      { key: 'social', description: 'Social — mention others who signed up' },
    ],
  },
  final_offer: {
    prefix: 'llm_final_offer',
    purpose: 'Last message in WATCH sequence. Gentle, no-pressure, leave door open.',
    strategies: [
      { key: 'gratitude', description: 'Thank them for being part of the community' },
      { key: 'nostalgia', description: 'Remind them of good times at the club' },
      { key: 'gentle', description: 'Ultra-gentle — "no worries if now\'s not the right time"' },
    ],
  },
  final_email: {
    prefix: 'llm_final_email',
    purpose: 'Last email in AT_RISK sequence. Offer to help them get back.',
    strategies: [
      { key: 'empathy', description: 'Empathetic — "we know life gets busy"' },
      { key: 'support', description: 'Supportive — "what can we do to help?"' },
      { key: 'open_door', description: 'Open door — "your spot is always here"' },
    ],
  },
  community: {
    prefix: 'llm_community',
    purpose: 'Community-focused email for CRITICAL members. Emotional, connection-driven.',
    strategies: [
      { key: 'belonging', description: 'You\'re part of us — "the group isn\'t the same without you"' },
      { key: 'stories', description: 'What\'s been happening — club updates, who\'s been playing' },
      { key: 'invitation', description: 'Personal invitation — "come reconnect with everyone"' },
    ],
  },
  winback_offer: {
    prefix: 'llm_winback',
    purpose: 'Last-chance win-back for CRITICAL members. Most emotional and personal.',
    strategies: [
      { key: 'personal', description: 'Deeply personal — "we genuinely miss you"' },
      { key: 'honest', description: 'Honest/transparent — "we noticed you\'ve been away"' },
      { key: 'invitation', description: 'Direct warm invitation — "is there anything holding you back?"' },
    ],
  },
}

// ── System Prompt ──

const MESSAGE_GENERATION_SYSTEM_PROMPT = `You are a messaging specialist for racquet sports clubs (pickleball, padel, tennis).
You generate personalized outreach messages to re-engage inactive members.

RULES:
- Use template variables that will be replaced with real values:
  {{name}} = member's first name
  {{club}} = club name
  {{session}} = suggested session title (e.g. "Thursday Open Play")
  {{days}} = days since last activity
  {{proof}} = social proof text (e.g. "3 players at your level signed up") or empty string
  {{spots}} = spots remaining text (e.g. "Only 4 spots left") or empty string
- emailSubject: max 60 characters, compelling, personal. Do NOT use generic openers.
- emailBody: max 600 characters, warm and conversational, end with clear CTA. Sign off as "{{club}} Team".
- smsBody: max 155 characters, concise with clear action. No formal greeting.
- Never use ALL CAPS for emphasis. Use natural language.
- Each variant MUST follow its assigned strategy angle.
- Return ONLY a valid JSON array, no markdown formatting.

OUTPUT FORMAT:
[
  {"strategy": "strategy_key", "emailSubject": "...", "emailBody": "...", "smsBody": "..."},
  ...
]`

// ── Core Generator ──

/**
 * Generate LLM-powered message variants for a given message type.
 * Returns 3 variants with strategy-based IDs, or empty array on failure.
 */
export async function generateLLMMessageVariants(
  params: GenerateVariantsParams,
): Promise<LLMMessageVariant[]> {
  const { messageType, context } = params
  const config = STRATEGY_MAP[messageType]

  if (!config) {
    console.warn(`[MessageGenerator] No strategy config for type: ${messageType}`)
    return []
  }

  // Build user prompt
  const userPrompt = buildUserPrompt(messageType, config, context)

  try {
    const result = await generateWithFallback({
      // Voice is composed into the system prompt so the LLM's tone matches
      // the club's stored profile. Falls back to defaults when voice is
      // null/undefined (legacy callers + tests).
      system: composeSystem(MESSAGE_GENERATION_SYSTEM_PROMPT, params.voice),
      prompt: userPrompt,
      tier: 'fast',      // gpt-4o-mini → haiku — cheap and fast
      maxTokens: 1000,
      // Cost tracking on the biggest bulk-send operation — messages get
      // generated once per type per club per day, but variant-optimizer
      // iteration can accumulate noticeable spend over a month.
      ...(params.clubId ? { clubId: params.clubId, operation: `generateVariants:${messageType}` } : {}),
    })

    const variants = parseAndValidate(result.text, config)

    if (variants.length === 0) {
      console.warn(`[MessageGenerator] LLM returned no valid variants for ${messageType}`)
      return []
    }

    return variants
  } catch (err) {
    console.warn(`[MessageGenerator] LLM generation failed for ${messageType}:`, (err as Error).message?.slice(0, 100))
    return []
  }
}

// ── User Prompt Builder ──

function buildUserPrompt(
  messageType: string,
  config: StrategyConfig,
  context: MessageGenerationContext,
): string {
  const strategyList = config.strategies
    .map((s, i) => `${i + 1}. "${s.key}" — ${s.description}`)
    .join('\n')

  let performanceSection = ''
  if (context.topPerformers.length > 0 || context.bottomPerformers.length > 0) {
    performanceSection = '\n\nPERFORMANCE DATA (last 30 days):'
    if (context.topPerformers.length > 0) {
      performanceSection += '\nTop performers (replicate these patterns):'
      for (const p of context.topPerformers) {
        performanceSection += `\n- "${p.subjectLine}" → ${(p.openRate * 100).toFixed(0)}% open, ${(p.clickRate * 100).toFixed(0)}% click`
      }
    }
    if (context.bottomPerformers.length > 0) {
      performanceSection += '\nBottom performers (avoid these patterns):'
      for (const p of context.bottomPerformers) {
        performanceSection += `\n- "${p.subjectLine}" → ${(p.openRate * 100).toFixed(0)}% open, ${(p.clickRate * 100).toFixed(0)}% click`
      }
    }
  }

  return `Generate 3 message variants for a "${messageType}" campaign.
Club: "${context.clubName}". Tone: ${context.tone}.

PURPOSE: ${config.purpose}

STRATEGIES (one variant per strategy):
${strategyList}
${performanceSection}

Generate compelling messages following each strategy. Use the template variables.`
}

// ── JSON Parsing & Validation ──

function parseAndValidate(
  rawText: string,
  config: StrategyConfig,
): LLMMessageVariant[] {
  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonStr = rawText.trim()

  // Remove markdown code fence if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  // Find the JSON array in the text
  const arrayStart = jsonStr.indexOf('[')
  const arrayEnd = jsonStr.lastIndexOf(']')
  if (arrayStart === -1 || arrayEnd === -1) {
    console.warn('[MessageGenerator] No JSON array found in LLM response')
    return []
  }
  jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1)

  let parsed: any[]
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.warn('[MessageGenerator] Failed to parse JSON from LLM response')
    return []
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  const variants: LLMMessageVariant[] = []

  for (const item of parsed) {
    if (
      typeof item.strategy !== 'string' ||
      typeof item.emailSubject !== 'string' ||
      typeof item.emailBody !== 'string' ||
      typeof item.smsBody !== 'string'
    ) {
      continue // Skip malformed entries
    }

    // Validate length limits
    const subject = item.emailSubject.slice(0, 60)
    const body = item.emailBody.slice(0, 600)
    const sms = item.smsBody.slice(0, 160)

    // Find matching strategy config to get the deterministic ID
    const stratConfig = config.strategies.find(s => s.key === item.strategy)
    const id = stratConfig
      ? `${config.prefix}_${stratConfig.key}`
      : `${config.prefix}_${item.strategy}`

    variants.push({
      id,
      strategy: item.strategy,
      emailSubject: subject,
      emailBody: body,
      smsBody: sms,
    })
  }

  return variants
}

// ── Template Interpolation ──

/**
 * Replace template variables in a variant with actual member values.
 * Called per-member after LLM generates templates per-club.
 */
export function interpolateVariant(
  variant: LLMMessageVariant,
  values: Record<string, string>,
): LLMMessageVariant {
  let subject = variant.emailSubject
  let body = variant.emailBody
  let sms = variant.smsBody

  for (const [key, val] of Object.entries(values)) {
    const placeholder = `{{${key}}}`
    subject = subject.split(placeholder).join(val)
    body = body.split(placeholder).join(val)
    sms = sms.split(placeholder).join(val)
  }

  // Clean up any remaining unresolved placeholders
  const cleanPlaceholders = (text: string) => text.replace(/\{\{[^}]+\}\}/g, '')

  return {
    ...variant,
    emailSubject: cleanPlaceholders(subject).trim(),
    emailBody: cleanPlaceholders(body).trim(),
    smsBody: cleanPlaceholders(sms).trim(),
  }
}

// ── Performance Feedback ──

/**
 * Get top and bottom performing messages from the last 30 days
 * to feed into the LLM prompt for the feedback loop.
 */
export async function getPerformanceFeedback(
  prisma: any,
  clubId: string,
  type: string,
  limit: number = 3,
): Promise<{ top: PerformanceExample[]; bottom: PerformanceExample[] }> {
  const lookbackDate = new Date(Date.now() - 30 * 86400000)

  // Get all logs with their subjects from reasoning field
  const logs = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      type,
      status: { in: ['sent', 'delivered'] },
      variantId: { not: null },
      createdAt: { gte: lookbackDate },
    },
    select: {
      variantId: true,
      openedAt: true,
      clickedAt: true,
      reasoning: true,
    },
  })

  if (logs.length < 5) {
    // Not enough data for meaningful feedback
    return { top: [], bottom: [] }
  }

  // Group by variantId and calculate metrics
  const byVariant = new Map<string, {
    subject: string
    sent: number
    opened: number
    clicked: number
  }>()

  for (const log of logs) {
    const vid = log.variantId
    if (!byVariant.has(vid)) {
      // Try to get subject from reasoning
      const reasoning = log.reasoning as any
      const subject = reasoning?.originalSubject || vid
      byVariant.set(vid, { subject, sent: 0, opened: 0, clicked: 0 })
    }
    const v = byVariant.get(vid)!
    v.sent++
    if (log.openedAt) v.opened++
    if (log.clickedAt) v.clicked++
  }

  // Calculate engagement scores and sort
  const performers: PerformanceExample[] = Array.from(byVariant.entries())
    .filter(([, v]) => v.sent >= 3) // Need at least 3 sends for signal
    .map(([, v]) => {
      const openRate = v.sent > 0 ? v.opened / v.sent : 0
      const clickRate = v.sent > 0 ? v.clicked / v.sent : 0
      return {
        subjectLine: v.subject,
        openRate,
        clickRate,
        engagementScore: openRate * 0.4 + clickRate * 0.6,
      }
    })
    .sort((a, b) => b.engagementScore - a.engagementScore)

  return {
    top: performers.slice(0, limit),
    bottom: performers.slice(-limit).reverse(), // worst first
  }
}

// ── Exports for campaign-engine integration ──

/**
 * Check if a message type has LLM strategy support.
 */
export function hasLLMSupport(messageType: string): boolean {
  return messageType in STRATEGY_MAP
}

/**
 * Get all supported message types.
 */
export function getSupportedMessageTypes(): string[] {
  return Object.keys(STRATEGY_MAP)
}
