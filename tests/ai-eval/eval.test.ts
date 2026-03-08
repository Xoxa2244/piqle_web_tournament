/**
 * AI Response Quality Evaluation Tests
 *
 * Run with: npx vitest run tests/ai-eval/eval.test.ts
 * Or interactively: npx vitest tests/ai-eval/eval.test.ts
 *
 * Requires OPENAI_API_KEY (or ANTHROPIC_API_KEY) in .env.local
 *
 * These tests:
 * 1. Send questions to the AI advisor (using real LLM calls)
 * 2. Run heuristic checks on responses
 * 3. Use LLM-as-judge to score quality
 * 4. Assert minimum quality thresholds
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { config } from 'dotenv'
import { EVAL_FIXTURES, type EvalFixture } from './fixtures'
import { judgeResponse, heuristicChecks, type JudgeScore } from './judge'
import { ADVISOR_SYSTEM_PROMPT } from '../../lib/ai/llm/prompts'

// Load env vars
config({ path: '.env.local' })

// Minimum passing scores
const MIN_OVERALL_SCORE = 3
const MIN_ACCURACY_SCORE = 3
const MIN_RELEVANCE_SCORE = 3

// Timeout for LLM calls (per test)
const LLM_TIMEOUT = 30_000

interface EvalResult {
  fixture: EvalFixture
  response: string
  heuristicIssues: string[]
  judgeScore: JudgeScore
  model: string
  latencyMs: number
}

// Store results for summary
const results: EvalResult[] = []

/** Generate an AI advisor response for a given fixture */
async function getAdvisorResponse(fixture: EvalFixture): Promise<{ text: string; model: string; latencyMs: number }> {
  const systemPrompt = `${ADVISOR_SYSTEM_PROMPT}

--- Club Data (retrieved from knowledge base) ---
${fixture.ragContext}
--- End of Club Data ---

Use the data above to answer the user's question. If the data doesn't contain relevant information, say so honestly.`

  const start = Date.now()

  // Try OpenAI first, then Anthropic
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const modelName = process.env.AI_PRIMARY_MODEL || 'gpt-4o-mini'
    const result = await generateText({
      model: openai(modelName),
      system: systemPrompt,
      prompt: fixture.question,
      maxOutputTokens: 1500,
    })
    return { text: result.text, model: modelName, latencyMs: Date.now() - start }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const modelName = process.env.AI_FALLBACK_MODEL || 'claude-3-5-haiku-20241022'
    const result = await generateText({
      model: anthropic(modelName),
      system: systemPrompt,
      prompt: fixture.question,
      maxOutputTokens: 1500,
    })
    return { text: result.text, model: modelName, latencyMs: Date.now() - start }
  }

  throw new Error('No API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local')
}

describe('AI Advisor Quality Evaluation', () => {
  beforeAll(() => {
    const hasKey = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY)
    if (!hasKey) {
      console.warn('\n⚠️  No API keys found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local\n')
    }
  })

  // Generate tests for each fixture
  for (const fixture of EVAL_FIXTURES) {
    it(`[${fixture.id}] ${fixture.name}`, async () => {
      // Skip if no API key
      if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        console.log(`  ⏭️  Skipping (no API key)`)
        return
      }

      // 1. Get AI response
      console.log(`  📤 Question: "${fixture.question}"`)
      const { text: response, model, latencyMs } = await getAdvisorResponse(fixture)
      console.log(`  📥 Response (${model}, ${latencyMs}ms): "${response.slice(0, 120)}..."`)

      // 2. Heuristic checks
      const hIssues = heuristicChecks({
        response,
        question: fixture.question,
        language: fixture.language,
        expectedContains: fixture.expectedContains,
        expectedNotContains: fixture.expectedNotContains,
      })

      if (hIssues.length > 0) {
        console.log(`  ⚠️  Heuristic issues: ${hIssues.join('; ')}`)
      }

      // 3. LLM-as-judge scoring
      const judgeScore = await judgeResponse({
        question: fixture.question,
        ragContext: fixture.ragContext,
        response,
        qualityCriteria: fixture.qualityCriteria,
      })

      console.log(`  🏆 Scores: R=${judgeScore.relevance} A=${judgeScore.accuracy} C=${judgeScore.completeness} Act=${judgeScore.actionability} T=${judgeScore.tone} Overall=${judgeScore.overall}`)
      if (judgeScore.issues.length > 0) {
        console.log(`  📝 Judge issues: ${judgeScore.issues.join('; ')}`)
      }

      // Store result
      results.push({ fixture, response, heuristicIssues: hIssues, judgeScore, model, latencyMs })

      // 4. Assertions
      expect(judgeScore.overall, `Overall quality too low. Reasoning: ${judgeScore.reasoning}`).toBeGreaterThanOrEqual(MIN_OVERALL_SCORE)
      expect(judgeScore.accuracy, `Accuracy too low. Issues: ${judgeScore.issues.join(', ')}`).toBeGreaterThanOrEqual(MIN_ACCURACY_SCORE)
      expect(judgeScore.relevance, `Relevance too low.`).toBeGreaterThanOrEqual(MIN_RELEVANCE_SCORE)

    }, LLM_TIMEOUT * 2) // Double timeout for response + judge
  }

  // Summary report after all tests
  it('prints evaluation summary', () => {
    if (results.length === 0) {
      console.log('\n📊 No results to summarize (tests skipped)\n')
      return
    }

    console.log('\n' + '='.repeat(70))
    console.log('📊 AI QUALITY EVALUATION SUMMARY')
    console.log('='.repeat(70))

    const avgScores = {
      relevance: avg(results.map(r => r.judgeScore.relevance)),
      accuracy: avg(results.map(r => r.judgeScore.accuracy)),
      completeness: avg(results.map(r => r.judgeScore.completeness)),
      actionability: avg(results.map(r => r.judgeScore.actionability)),
      tone: avg(results.map(r => r.judgeScore.tone)),
      overall: avg(results.map(r => r.judgeScore.overall)),
    }

    console.log(`\nModel: ${results[0]?.model || 'unknown'}`)
    console.log(`Tests run: ${results.length}/${EVAL_FIXTURES.length}`)
    console.log(`Avg latency: ${Math.round(avg(results.map(r => r.latencyMs)))}ms`)
    console.log('')
    console.log(`  Relevance:     ${bar(avgScores.relevance)} ${avgScores.relevance.toFixed(1)}/5`)
    console.log(`  Accuracy:      ${bar(avgScores.accuracy)} ${avgScores.accuracy.toFixed(1)}/5`)
    console.log(`  Completeness:  ${bar(avgScores.completeness)} ${avgScores.completeness.toFixed(1)}/5`)
    console.log(`  Actionability: ${bar(avgScores.actionability)} ${avgScores.actionability.toFixed(1)}/5`)
    console.log(`  Tone:          ${bar(avgScores.tone)} ${avgScores.tone.toFixed(1)}/5`)
    console.log(`  ─────────────────────────────────`)
    console.log(`  OVERALL:       ${bar(avgScores.overall)} ${avgScores.overall.toFixed(1)}/5`)

    // List failures
    const failures = results.filter(r => r.judgeScore.overall < MIN_OVERALL_SCORE)
    if (failures.length > 0) {
      console.log(`\n❌ ${failures.length} test(s) below threshold:`)
      for (const f of failures) {
        console.log(`  - [${f.fixture.id}] Score: ${f.judgeScore.overall}/5. ${f.judgeScore.reasoning}`)
      }
    }

    // List heuristic issues
    const withIssues = results.filter(r => r.heuristicIssues.length > 0)
    if (withIssues.length > 0) {
      console.log(`\n⚠️  ${withIssues.length} test(s) with heuristic issues:`)
      for (const r of withIssues) {
        console.log(`  - [${r.fixture.id}]: ${r.heuristicIssues.join('; ')}`)
      }
    }

    console.log('\n' + '='.repeat(70) + '\n')
  })
})

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function bar(score: number): string {
  const filled = Math.round(score)
  const empty = 5 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}
