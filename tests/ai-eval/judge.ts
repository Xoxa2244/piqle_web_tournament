/**
 * LLM-as-Judge evaluator.
 * Uses a separate LLM call to score AI responses on quality criteria.
 */

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

export interface JudgeScore {
  relevance: number       // 1-5: Does the answer address the question?
  accuracy: number        // 1-5: Is the answer factually correct given the context?
  completeness: number    // 1-5: Does the answer cover all key aspects?
  actionability: number   // 1-5: Does the answer include practical suggestions?
  tone: number            // 1-5: Is the tone appropriate (professional, concise, friendly)?
  overall: number         // 1-5: Overall quality
  reasoning: string       // Why the scores were given
  issues: string[]        // Specific problems found
}

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator for an AI-powered pickleball club management advisor.
Your job is to score AI responses on quality criteria.

You will receive:
1. The user's question
2. The RAG context (data the AI had available)
3. The AI's response
4. Specific quality criteria for this question

Score each dimension from 1-5:
- 1 = Very poor (completely wrong, irrelevant, or harmful)
- 2 = Poor (major issues, mostly unhelpful)
- 3 = Acceptable (addresses the question but has notable gaps)
- 4 = Good (solid answer with minor improvements possible)
- 5 = Excellent (comprehensive, accurate, actionable, well-written)

Respond ONLY with valid JSON matching this schema:
{
  "relevance": <1-5>,
  "accuracy": <1-5>,
  "completeness": <1-5>,
  "actionability": <1-5>,
  "tone": <1-5>,
  "overall": <1-5>,
  "reasoning": "<1-3 sentences explaining the scores>",
  "issues": ["<issue 1>", "<issue 2>", ...]
}

Be strict but fair. A score of 3 means "acceptable" — reserve 4-5 for genuinely good answers.`

/**
 * Use an LLM to judge the quality of an AI response.
 * Uses a different model than the one being tested when possible.
 */
export async function judgeResponse(params: {
  question: string
  ragContext: string
  response: string
  qualityCriteria: string
}): Promise<JudgeScore> {
  const { question, ragContext, response, qualityCriteria } = params

  const prompt = `## User Question
${question}

## RAG Context (Data Available to the AI)
${ragContext}

## AI Response Being Evaluated
${response}

## Quality Criteria for This Question
${qualityCriteria}

Now score the AI response. Respond with JSON only.`

  // Try Anthropic as judge (different provider than primary model)
  // Falls back to OpenAI if Anthropic not available
  let result: { text: string }

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      result = await generateText({
        model: anthropic('claude-sonnet-4-20250514'),
        system: JUDGE_SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 500,
      })
    } else if (process.env.OPENAI_API_KEY) {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
      result = await generateText({
        model: openai('gpt-4o'),
        system: JUDGE_SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 500,
      })
    } else {
      throw new Error('No API key available for judge model')
    }
  } catch (error) {
    console.error('[Judge] LLM judge failed:', error)
    return {
      relevance: 0, accuracy: 0, completeness: 0,
      actionability: 0, tone: 0, overall: 0,
      reasoning: `Judge failed: ${error}`,
      issues: ['Judge model call failed'],
    }
  }

  // Parse the response
  try {
    const jsonMatch = result.text.match(/```(?:json)?\s*([\s\S]*?)```/) || result.text.match(/(\{[\s\S]*\})/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1].trim() : result.text)
    return parsed as JudgeScore
  } catch {
    console.error('[Judge] Failed to parse judge response:', result.text.slice(0, 300))
    return {
      relevance: 0, accuracy: 0, completeness: 0,
      actionability: 0, tone: 0, overall: 0,
      reasoning: 'Failed to parse judge response',
      issues: ['Judge response was not valid JSON'],
    }
  }
}

/**
 * Quick heuristic checks (no LLM needed).
 * Returns a list of issues found.
 */
export function heuristicChecks(params: {
  response: string
  question: string
  language: 'en' | 'ru'
  expectedContains: string[]
  expectedNotContains: string[]
}): string[] {
  const { response, question, language, expectedContains, expectedNotContains } = params
  const issues: string[] = []
  const lower = response.toLowerCase()

  // Check response is not empty
  if (response.trim().length < 20) {
    issues.push('Response is too short (< 20 chars)')
  }

  // Check response is not too long (should be concise)
  if (response.length > 3000) {
    issues.push('Response is too long (> 3000 chars). Should be concise.')
  }

  // Check expected keywords present
  for (const keyword of expectedContains) {
    if (!lower.includes(keyword.toLowerCase())) {
      issues.push(`Missing expected keyword: "${keyword}"`)
    }
  }

  // Check unwanted keywords absent
  for (const keyword of expectedNotContains) {
    if (lower.includes(keyword.toLowerCase())) {
      issues.push(`Contains unwanted keyword: "${keyword}"`)
    }
  }

  // Language check
  if (language === 'ru') {
    const cyrillicRatio = (response.match(/[а-яА-ЯёЁ]/g) || []).length / response.length
    if (cyrillicRatio < 0.3) {
      issues.push('Response should be in Russian but has low Cyrillic content')
    }
  }

  // Check for hallucination red flags
  const hallucPhrases = [
    'i think', 'i believe', 'probably around', 'approximately',
    'i would estimate', 'it seems like', 'roughly',
  ]
  // Only flag if the answer is supposed to use data
  if (expectedContains.length > 0) {
    for (const phrase of hallucPhrases) {
      if (lower.includes(phrase)) {
        issues.push(`Possible hallucination indicator: "${phrase}" — should cite data instead`)
      }
    }
  }

  return issues
}
