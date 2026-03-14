import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  interpolateVariant,
  getPerformanceFeedback,
  generateLLMMessageVariants,
  hasLLMSupport,
  getSupportedMessageTypes,
} from '../../../lib/ai/llm/message-generator'

// ── Mock LLM provider ──

vi.mock('../../../lib/ai/llm/provider', () => ({
  generateWithFallback: vi.fn(),
}))

import { generateWithFallback } from '../../../lib/ai/llm/provider'
const mockGenerateWithFallback = generateWithFallback as ReturnType<typeof vi.fn>

// ── interpolateVariant ──

describe('interpolateVariant', () => {
  const baseVariant = {
    id: 'llm_checkin_pattern',
    strategy: 'pattern',
    emailSubject: '{{name}}, we missed you at {{club}}!',
    emailBody: 'Hi {{name}},\n\nWe missed you at {{club}}. "{{session}}" is coming up. {{proof}} {{spots}}',
    smsBody: 'Hey {{name}}! "{{session}}" at {{club}}. {{proof}}',
  }

  it('replaces all template variables', () => {
    const result = interpolateVariant(baseVariant, {
      name: 'Alex',
      club: 'Padel NYC',
      session: 'Thursday Open Play',
      days: '14',
      proof: '3 players at your level',
      spots: 'Only 4 spots left',
    })
    expect(result.emailSubject).toBe('Alex, we missed you at Padel NYC!')
    expect(result.emailBody).toContain('Hi Alex')
    expect(result.emailBody).toContain('Padel NYC')
    expect(result.emailBody).toContain('Thursday Open Play')
    expect(result.emailBody).toContain('3 players at your level')
    expect(result.emailBody).toContain('Only 4 spots left')
    expect(result.smsBody).toContain('Hey Alex')
  })

  it('cleans up unresolved placeholders', () => {
    const result = interpolateVariant(baseVariant, {
      name: 'Alex',
      club: 'Padel NYC',
      session: 'Open Play',
    })
    // proof, spots, days not provided → should be cleaned
    expect(result.emailBody).not.toContain('{{')
    expect(result.smsBody).not.toContain('{{')
  })

  it('handles empty values gracefully', () => {
    const result = interpolateVariant(baseVariant, {
      name: 'Alex',
      club: 'Padel NYC',
      session: '',
      proof: '',
      spots: '',
    })
    expect(result.emailSubject).toBe('Alex, we missed you at Padel NYC!')
    expect(result.emailBody).not.toContain('{{')
  })

  it('preserves variant id and strategy', () => {
    const result = interpolateVariant(baseVariant, { name: 'Test', club: 'Club', session: 'S' })
    expect(result.id).toBe('llm_checkin_pattern')
    expect(result.strategy).toBe('pattern')
  })

  it('handles multiple occurrences of same variable', () => {
    const variant = {
      id: 'test',
      strategy: 'test',
      emailSubject: '{{name}} at {{club}}',
      emailBody: '{{name}} loves {{club}}. Come to {{club}} again, {{name}}!',
      smsBody: '{{name}} — {{club}}',
    }
    const result = interpolateVariant(variant, { name: 'Alex', club: 'Padel' })
    expect(result.emailBody).toBe('Alex loves Padel. Come to Padel again, Alex!')
  })
})

// ── hasLLMSupport ──

describe('hasLLMSupport', () => {
  it('returns true for CHECK_IN', () => {
    expect(hasLLMSupport('CHECK_IN')).toBe(true)
  })

  it('returns true for RETENTION_BOOST', () => {
    expect(hasLLMSupport('RETENTION_BOOST')).toBe(true)
  })

  it('returns true for sequence message types', () => {
    expect(hasLLMSupport('social_proof')).toBe(true)
    expect(hasLLMSupport('sms_nudge')).toBe(true)
    expect(hasLLMSupport('winback_offer')).toBe(true)
  })

  it('returns false for unknown types', () => {
    expect(hasLLMSupport('UNKNOWN_TYPE')).toBe(false)
    expect(hasLLMSupport('')).toBe(false)
  })
})

// ── getSupportedMessageTypes ──

describe('getSupportedMessageTypes', () => {
  it('returns all 11 supported types', () => {
    const types = getSupportedMessageTypes()
    expect(types).toContain('CHECK_IN')
    expect(types).toContain('RETENTION_BOOST')
    expect(types).toContain('resend_new_subject')
    expect(types).toContain('social_proof')
    expect(types).toContain('value_reminder')
    expect(types).toContain('urgency_resend')
    expect(types).toContain('sms_nudge')
    expect(types).toContain('final_offer')
    expect(types).toContain('final_email')
    expect(types).toContain('community')
    expect(types).toContain('winback_offer')
    expect(types.length).toBe(11)
  })
})

// ── generateLLMMessageVariants ──

describe('generateLLMMessageVariants', () => {
  const baseContext = {
    clubName: 'Padel Club NYC',
    tone: 'friendly' as const,
    topPerformers: [],
    bottomPerformers: [],
  }

  beforeEach(() => {
    mockGenerateWithFallback.mockReset()
  })

  it('returns 3 variants with correct IDs for CHECK_IN', async () => {
    mockGenerateWithFallback.mockResolvedValueOnce({
      text: JSON.stringify([
        { strategy: 'pattern', emailSubject: 'Miss your routine?', emailBody: 'Hi {{name}}...', smsBody: 'Hey {{name}}!' },
        { strategy: 'social', emailSubject: 'Players are joining', emailBody: 'Hi {{name}}...', smsBody: '{{name}}!' },
        { strategy: 'urgency', emailSubject: 'Spots filling up', emailBody: 'Hi {{name}}...', smsBody: 'Hurry {{name}}!' },
      ]),
      model: 'gpt-4o-mini',
      usage: { inputTokens: 500, outputTokens: 300 },
    })

    const variants = await generateLLMMessageVariants({
      messageType: 'CHECK_IN',
      context: baseContext,
      channel: 'both',
    })

    expect(variants.length).toBe(3)
    expect(variants[0].id).toBe('llm_checkin_pattern')
    expect(variants[1].id).toBe('llm_checkin_social')
    expect(variants[2].id).toBe('llm_checkin_urgency')
    expect(variants[0].emailSubject).toBe('Miss your routine?')
  })

  it('returns 3 variants for RETENTION_BOOST', async () => {
    mockGenerateWithFallback.mockResolvedValueOnce({
      text: JSON.stringify([
        { strategy: 'value', emailSubject: 'We need you', emailBody: 'Body', smsBody: 'SMS' },
        { strategy: 'community', emailSubject: 'We miss you', emailBody: 'Body', smsBody: 'SMS' },
        { strategy: 'urgency', emailSubject: 'Last spots', emailBody: 'Body', smsBody: 'SMS' },
      ]),
      model: 'gpt-4o-mini',
      usage: { inputTokens: 500, outputTokens: 300 },
    })

    const variants = await generateLLMMessageVariants({
      messageType: 'RETENTION_BOOST',
      context: baseContext,
      channel: 'both',
    })

    expect(variants.length).toBe(3)
    expect(variants[0].id).toBe('llm_retention_value')
    expect(variants[1].id).toBe('llm_retention_community')
    expect(variants[2].id).toBe('llm_retention_urgency')
  })

  it('handles markdown code fence in LLM response', async () => {
    mockGenerateWithFallback.mockResolvedValueOnce({
      text: '```json\n[{"strategy":"pattern","emailSubject":"Test","emailBody":"Body","smsBody":"SMS"}]\n```',
      model: 'gpt-4o-mini',
      usage: { inputTokens: 500, outputTokens: 100 },
    })

    const variants = await generateLLMMessageVariants({
      messageType: 'CHECK_IN',
      context: baseContext,
      channel: 'both',
    })

    expect(variants.length).toBe(1)
    expect(variants[0].emailSubject).toBe('Test')
  })

  it('returns empty array on invalid JSON', async () => {
    mockGenerateWithFallback.mockResolvedValueOnce({
      text: 'This is not JSON at all',
      model: 'gpt-4o-mini',
      usage: { inputTokens: 500, outputTokens: 50 },
    })

    const variants = await generateLLMMessageVariants({
      messageType: 'CHECK_IN',
      context: baseContext,
      channel: 'both',
    })

    expect(variants.length).toBe(0)
  })

  it('returns empty array when LLM throws', async () => {
    mockGenerateWithFallback.mockRejectedValueOnce(new Error('API key invalid'))

    const variants = await generateLLMMessageVariants({
      messageType: 'CHECK_IN',
      context: baseContext,
      channel: 'both',
    })

    expect(variants.length).toBe(0)
  })

  it('returns empty array for unsupported message type', async () => {
    const variants = await generateLLMMessageVariants({
      messageType: 'UNKNOWN_TYPE',
      context: baseContext,
      channel: 'both',
    })

    expect(variants.length).toBe(0)
    // Should not call LLM
    expect(mockGenerateWithFallback).not.toHaveBeenCalled()
  })

  it('truncates subject/body/sms to limits', async () => {
    const longSubject = 'A'.repeat(100)
    const longBody = 'B'.repeat(800)
    const longSms = 'C'.repeat(200)

    mockGenerateWithFallback.mockResolvedValueOnce({
      text: JSON.stringify([
        { strategy: 'pattern', emailSubject: longSubject, emailBody: longBody, smsBody: longSms },
      ]),
      model: 'gpt-4o-mini',
      usage: { inputTokens: 500, outputTokens: 300 },
    })

    const variants = await generateLLMMessageVariants({
      messageType: 'CHECK_IN',
      context: baseContext,
      channel: 'both',
    })

    expect(variants.length).toBe(1)
    expect(variants[0].emailSubject.length).toBeLessThanOrEqual(60)
    expect(variants[0].emailBody.length).toBeLessThanOrEqual(600)
    expect(variants[0].smsBody.length).toBeLessThanOrEqual(160)
  })

  it('skips malformed entries in response', async () => {
    mockGenerateWithFallback.mockResolvedValueOnce({
      text: JSON.stringify([
        { strategy: 'pattern', emailSubject: 'Good', emailBody: 'Body', smsBody: 'SMS' },
        { strategy: 'social' }, // missing fields
        { strategy: 'urgency', emailSubject: 'Also good', emailBody: 'Body2', smsBody: 'SMS2' },
      ]),
      model: 'gpt-4o-mini',
      usage: { inputTokens: 500, outputTokens: 200 },
    })

    const variants = await generateLLMMessageVariants({
      messageType: 'CHECK_IN',
      context: baseContext,
      channel: 'both',
    })

    expect(variants.length).toBe(2) // Skipped malformed entry
  })

  it('includes performance data in prompt', async () => {
    mockGenerateWithFallback.mockResolvedValueOnce({
      text: '[]',
      model: 'gpt-4o-mini',
      usage: { inputTokens: 500, outputTokens: 10 },
    })

    await generateLLMMessageVariants({
      messageType: 'CHECK_IN',
      context: {
        ...baseContext,
        topPerformers: [{ subjectLine: 'Great subject', openRate: 0.45, clickRate: 0.12, engagementScore: 0.25 }],
        bottomPerformers: [{ subjectLine: 'Bad subject', openRate: 0.1, clickRate: 0.01, engagementScore: 0.05 }],
      },
      channel: 'both',
    })

    // Verify prompt includes performance data
    const call = mockGenerateWithFallback.mock.calls[0][0]
    expect(call.prompt).toContain('Great subject')
    expect(call.prompt).toContain('Bad subject')
    expect(call.prompt).toContain('45%')
    expect(call.prompt).toContain('10%')
    expect(call.tier).toBe('fast')
  })
})

// ── getPerformanceFeedback ──

describe('getPerformanceFeedback', () => {
  it('returns empty when not enough data', async () => {
    const mockPrisma = {
      aIRecommendationLog: {
        findMany: vi.fn().mockResolvedValueOnce([
          { variantId: 'v1', openedAt: null, clickedAt: null, reasoning: {} },
          { variantId: 'v2', openedAt: new Date(), clickedAt: null, reasoning: {} },
        ]),
      },
    }

    const result = await getPerformanceFeedback(mockPrisma, 'club-1', 'CHECK_IN')
    expect(result.top).toHaveLength(0)
    expect(result.bottom).toHaveLength(0)
  })

  it('returns top and bottom performers when enough data', async () => {
    const logs = [
      // v1: 5 sends, 4 opens, 2 clicks → great performer
      ...Array.from({ length: 5 }, (_, i) => ({
        variantId: 'v1',
        openedAt: i < 4 ? new Date() : null,
        clickedAt: i < 2 ? new Date() : null,
        reasoning: { originalSubject: 'Great subject' },
      })),
      // v2: 5 sends, 1 open, 0 clicks → poor performer
      ...Array.from({ length: 5 }, (_, i) => ({
        variantId: 'v2',
        openedAt: i < 1 ? new Date() : null,
        clickedAt: null,
        reasoning: { originalSubject: 'Bad subject' },
      })),
    ]

    const mockPrisma = {
      aIRecommendationLog: {
        findMany: vi.fn().mockResolvedValueOnce(logs),
      },
    }

    const result = await getPerformanceFeedback(mockPrisma, 'club-1', 'CHECK_IN')

    expect(result.top.length).toBeGreaterThan(0)
    expect(result.bottom.length).toBeGreaterThan(0)
    // Top performer should have higher engagement score
    expect(result.top[0].engagementScore).toBeGreaterThan(result.bottom[0].engagementScore)
    expect(result.top[0].subjectLine).toBe('Great subject')
  })

  it('uses variantId as subject fallback when no originalSubject', async () => {
    const logs = Array.from({ length: 5 }, () => ({
      variantId: 'checkin_pattern',
      openedAt: new Date(),
      clickedAt: null,
      reasoning: {}, // No originalSubject
    }))

    const mockPrisma = {
      aIRecommendationLog: {
        findMany: vi.fn().mockResolvedValueOnce(logs),
      },
    }

    const result = await getPerformanceFeedback(mockPrisma, 'club-1', 'CHECK_IN')
    // With only 1 variant that has 5 sends but needs >= 3
    expect(result.top.length).toBe(1)
    expect(result.top[0].subjectLine).toBe('checkin_pattern')
  })
})
