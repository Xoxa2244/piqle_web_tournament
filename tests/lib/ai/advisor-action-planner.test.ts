import { describe, expect, it, vi } from 'vitest'

import { planAdvisorActionIntent } from '@/lib/ai/advisor-action-planner'

// The planner's LLM fallback must never run in these tests — every prompt
// below is expected to resolve on the deterministic heuristic/analytical
// path. A throwing mock turns an accidental LLM round-trip into a loud
// failure instead of a silent nondeterministic test.
vi.mock('@/lib/ai/llm/provider', () => ({
  generateWithFallback: vi.fn(() => {
    throw new Error('LLM fallback should not be reached in planner tests')
  }),
}))

// The exact prompt the Schedule→Advise "Discuss in Advisor" seam prefills.
// Operator feedback v2.0 (2026-06-12) §3.1: this used to classify as
// ops_show_pending ("Review" + "what") and answered "the agent is idle".
const DISCUSS_SEAM_PROMPT =
  'Review my schedule for the week of 2026-06-08. Underfilled but historically strong (worth promoting): ' +
  'Sat, Jun 13 13:00 Learner League presented by Volair (May) (0% now, slot avg 55%); ' +
  'Sun, Jun 14 11:00 Open Play Advanced (4.0+) Verified (8% now, slot avg 69%); ' +
  'Fri, Jun 12 17:00 Open Play Casual (2.5 - 2.99) Self Assessed (13% now, slot avg 58%) (+3 more in the Advise panel). ' +
  'Suggested new sessions: Sat 07:00 Open Play All levels (historically 98% / ~4 players). ' +
  'Help me decide what to change and draft any member messages needed.'

describe('advisor action planner — Advise seam vs pending queue', () => {
  it('routes the Discuss-in-Advisor schedule review to the chat LLM (action none)', async () => {
    const plan = await planAdvisorActionIntent(DISCUSS_SEAM_PROMPT)
    expect(plan.action).toBe('none')
  })

  it('routes a short "review my schedule" ask to the chat LLM', async () => {
    const plan = await planAdvisorActionIntent('Review my schedule for next week')
    expect(plan.action).toBe('none')
  })

  it('routes "help me decide" advisory asks to the chat LLM', async () => {
    const plan = await planAdvisorActionIntent(
      'Help me decide which sessions to promote and draft any member messages needed',
    )
    expect(plan.action).toBe('none')
  })

  it('still answers "What needs my approval right now?" with the pending queue', async () => {
    const plan = await planAdvisorActionIntent('What needs my approval right now?')
    expect(plan.action).toBe('ops_show_pending')
  })

  it('still answers "show me pending approvals" with the pending queue', async () => {
    const plan = await planAdvisorActionIntent('show me pending approvals')
    expect(plan.action).toBe('ops_show_pending')
  })

  it('still answers "any pending approvals?" with the pending queue', async () => {
    const plan = await planAdvisorActionIntent('any pending approvals?')
    expect(plan.action).toBe('ops_show_pending')
  })

  it('still answers "what\'s waiting for me?" with the pending queue', async () => {
    const plan = await planAdvisorActionIntent("what's waiting for me?")
    expect(plan.action).toBe('ops_show_pending')
  })

  it('keeps imperative slot-fill requests on the fill_session Decision Card', async () => {
    const plan = await planAdvisorActionIntent('Fill the Thursday 5pm beginner session')
    expect(plan.action).toBe('fill_session')
  })
})
