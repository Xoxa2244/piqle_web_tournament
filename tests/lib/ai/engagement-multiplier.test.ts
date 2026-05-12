/**
 * Unit tests for Phase C engagement_multiplier.
 *
 * Each test isolates one signal and checks it shifts the multiplier
 * by exactly the expected step, so a regression in a single rule
 * doesn't get hidden by the sum.
 *
 * Also covers:
 *   - Clamp to [0.6, 1.4]
 *   - engagementWeight=0 short-circuit (preset opt-out)
 *   - summariseMembers helper for the tRPC plumbing
 */

import { describe, it, expect } from 'vitest'
import {
  computeEngagementMultiplier,
  isNewMemberAttractive,
  summariseMembers,
  ENGAGEMENT_MIN,
  ENGAGEMENT_MAX,
  type EngagementContext,
} from '@/lib/ai/engagement-multiplier'
import type { AdvisorProgrammingProposalDraft } from '@/lib/ai/advisor-programming'
import type { SlotKey } from '@/lib/ai/programming-iq-slot-map'

const SLOT: SlotKey = {
  courtId: 'c1',
  courtName: 'Court 1',
  isIndoor: true,
  dayOfWeek: 'Tuesday',
  hour: 11,
  startTime: '11:00',
  endTime: '12:00',
}

function proposal(overrides: Partial<AdvisorProgrammingProposalDraft> = {}): AdvisorProgrammingProposalDraft {
  return {
    id: 'p-1',
    title: 'Open Play',
    dayOfWeek: 'Tuesday',
    timeSlot: 'morning',
    startTime: '11:00',
    endTime: '12:30',
    format: 'OPEN_PLAY' as any,
    skillLevel: 'INTERMEDIATE' as any,
    maxPlayers: 8,
    projectedOccupancy: 60,
    estimatedInterestedMembers: 8,
    confidence: 70,
    source: 'expand_peak' as any,
    rationale: [],
    ...overrides,
  }
}

function ctx(overrides: Partial<EngagementContext> = {}): EngagementContext {
  return {
    atRiskMemberCount: 0,
    totalMemberCount: 100,
    newMemberCount: 0,
    atRiskBySkill: {},
    newBySkill: {},
    sameShapeCountThisWeek: 0,
    hasHistoricalConversion: false,
    isOffPeak: false,
    segmentInviteCount: 0,
    segmentInviteCap: 0,
    ...overrides,
  }
}

describe('computeEngagementMultiplier — baseline', () => {
  it('returns 1.0 when no engagement signals are present', () => {
    // Default proposal (OPEN_PLAY + INTERMEDIATE) actually triggers
    // isNewMemberAttractive, so we use a neutral DRILL + ADVANCED
    // shape that fires no signals to test the true baseline.
    const m = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx(),
    )
    expect(m).toBe(1.0)
  })

  it('clamps to ENGAGEMENT_MIN when all negative signals fire', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx({
        newMemberCount: 50,
        newBySkill: { BEGINNER: 50 }, // none in ADVANCED → -0.1 (regulars only)
        sameShapeCountThisWeek: 3,    // -0.1
        segmentInviteCount: 1000,
        segmentInviteCap: 50,         // -0.1
      }),
    )
    expect(m).toBeLessThanOrEqual(1.0)
    expect(m).toBeGreaterThanOrEqual(ENGAGEMENT_MIN)
  })

  it('clamps to ENGAGEMENT_MAX when all positive signals fire and weight is amplified', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'OPEN_PLAY' as any, skillLevel: 'BEGINNER' as any }),
      SLOT,
      ctx({
        atRiskMemberCount: 40,
        atRiskBySkill: { BEGINNER: 30 },     // ratio 75% → +0.1
        // BEGINNER format → +0.1 from isNewMemberAttractive
        isOffPeak: true,                       // +0.1 (with conversion)
        hasHistoricalConversion: true,
        engagementWeight: 2.0,                 // amplify all signals
      }),
    )
    expect(m).toBeLessThanOrEqual(ENGAGEMENT_MAX)
    expect(m).toBeGreaterThan(1.0)
  })
})

describe('computeEngagementMultiplier — individual signals', () => {
  it('+0.1 when ≥20% of at-risk members are in the candidate skill bucket', () => {
    // Use DRILL + ADVANCED so isNewMemberAttractive = false (isolates the at-risk signal).
    const m = computeEngagementMultiplier(
      proposal({ skillLevel: 'ADVANCED' as any, format: 'DRILL' as any }),
      SLOT,
      ctx({ atRiskMemberCount: 10, atRiskBySkill: { ADVANCED: 3 } }),
    )
    expect(m).toBeCloseTo(1.1, 5)
  })

  it('no at-risk bonus when ratio is below 20% threshold', () => {
    const m = computeEngagementMultiplier(
      proposal({ skillLevel: 'ADVANCED' as any, format: 'DRILL' as any }),
      SLOT,
      ctx({ atRiskMemberCount: 10, atRiskBySkill: { ADVANCED: 1 } }),
    )
    expect(m).toBeCloseTo(1.0, 5)
  })

  it('+0.1 for new-member-attractive format (BEGINNER anything)', () => {
    const m = computeEngagementMultiplier(
      proposal({ skillLevel: 'BEGINNER' as any, format: 'DRILL' as any }),
      SLOT,
      ctx(),
    )
    expect(m).toBeCloseTo(1.1, 5)
  })

  it('+0.1 for OPEN_PLAY at INTERMEDIATE / ALL_LEVELS', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'OPEN_PLAY' as any, skillLevel: 'ALL_LEVELS' as any }),
      SLOT,
      ctx(),
    )
    expect(m).toBeCloseTo(1.1, 5)
  })

  it('no new-member bonus for ADVANCED + DRILL (regular-engaging format)', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx(),
    )
    // No positive signals → 1.0
    expect(m).toBeCloseTo(1.0, 5)
  })

  it('+0.1 only when off-peak AND historical conversion are both true', () => {
    const both = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx({ isOffPeak: true, hasHistoricalConversion: true }),
    )
    expect(both).toBeCloseTo(1.1, 5)

    const onlyOne = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx({ isOffPeak: true, hasHistoricalConversion: false }),
    )
    expect(onlyOne).toBeCloseTo(1.0, 5)
  })

  it('-0.1 when serves only regulars (no new-member uplift)', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx({
        newMemberCount: 20,
        newBySkill: { BEGINNER: 20, ADVANCED: 0 }, // 0% in ADVANCED → penalty
      }),
    )
    expect(m).toBeCloseTo(0.9, 5)
  })

  it('no regulars penalty when club has no new members at all', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx({ newMemberCount: 0 }),
    )
    expect(m).toBeCloseTo(1.0, 5)
  })

  it('-0.1 when same shape already placed elsewhere this week', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx({ sameShapeCountThisWeek: 1 }),
    )
    expect(m).toBeCloseTo(0.9, 5)
  })

  it('-0.1 when segment invite count exceeds the cap', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx({ segmentInviteCount: 100, segmentInviteCap: 50 }),
    )
    expect(m).toBeCloseTo(0.9, 5)
  })

  it('no saturation penalty when cap is unconfigured (0)', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'DRILL' as any, skillLevel: 'ADVANCED' as any }),
      SLOT,
      ctx({ segmentInviteCount: 100, segmentInviteCap: 0 }),
    )
    expect(m).toBeCloseTo(1.0, 5)
  })
})

describe('computeEngagementMultiplier — engagementWeight presets', () => {
  it('engagementWeight=0 collapses multiplier to baseline regardless of signals', () => {
    const m = computeEngagementMultiplier(
      proposal({ format: 'OPEN_PLAY' as any, skillLevel: 'BEGINNER' as any }),
      SLOT,
      ctx({
        atRiskMemberCount: 40,
        atRiskBySkill: { BEGINNER: 30 },
        isOffPeak: true,
        hasHistoricalConversion: true,
        engagementWeight: 0,
      }),
    )
    expect(m).toBe(1.0)
  })

  it('engagementWeight=1.3 amplifies a single +signal by 30%', () => {
    const base = computeEngagementMultiplier(
      proposal({ skillLevel: 'BEGINNER' as any }),
      SLOT,
      ctx(),
    )
    const amplified = computeEngagementMultiplier(
      proposal({ skillLevel: 'BEGINNER' as any }),
      SLOT,
      ctx({ engagementWeight: 1.3 }),
    )
    // base = 1.0 + 0.1 × 1.0 = 1.1
    // amplified = 1.0 + 0.1 × 1.3 = 1.13
    expect(amplified - base).toBeCloseTo(0.03, 5)
  })
})

describe('isNewMemberAttractive', () => {
  it('BEGINNER anything → true', () => {
    expect(isNewMemberAttractive(proposal({ skillLevel: 'BEGINNER' as any, format: 'DRILL' as any }))).toBe(true)
  })
  it('OPEN_PLAY at INTERMEDIATE → true', () => {
    expect(isNewMemberAttractive(proposal({ format: 'OPEN_PLAY' as any, skillLevel: 'INTERMEDIATE' as any }))).toBe(true)
  })
  it('CLINIC at ADVANCED → false', () => {
    expect(isNewMemberAttractive(proposal({ format: 'CLINIC' as any, skillLevel: 'ADVANCED' as any }))).toBe(false)
  })
  it('LEAGUE at INTERMEDIATE → false', () => {
    expect(isNewMemberAttractive(proposal({ format: 'LEAGUE' as any, skillLevel: 'INTERMEDIATE' as any }))).toBe(false)
  })
})

describe('summariseMembers', () => {
  it('aggregates totals, at-risk, new, and per-skill distribution', () => {
    const dist = summariseMembers([
      { skillLevel: 'BEGINNER', riskLevel: 'at_risk', joinedDaysAgo: 5 },
      { skillLevel: 'BEGINNER', riskLevel: 'healthy', joinedDaysAgo: 200 },
      { skillLevel: 'INTERMEDIATE', riskLevel: 'critical', joinedDaysAgo: 10 },
      { skillLevel: 'INTERMEDIATE', riskLevel: 'healthy', joinedDaysAgo: 365 },
      { skillLevel: 'ADVANCED', riskLevel: 'at_risk', joinedDaysAgo: 365 },
    ])

    expect(dist.totalMemberCount).toBe(5)
    expect(dist.atRiskMemberCount).toBe(3)
    expect(dist.newMemberCount).toBe(2)
    expect(dist.atRiskBySkill).toEqual({ BEGINNER: 1, INTERMEDIATE: 1, ADVANCED: 1 })
    expect(dist.newBySkill).toEqual({ BEGINNER: 1, INTERMEDIATE: 1 })
  })

  it('handles empty input', () => {
    const dist = summariseMembers([])
    expect(dist).toEqual({
      totalMemberCount: 0,
      atRiskMemberCount: 0,
      newMemberCount: 0,
      atRiskBySkill: {},
      newBySkill: {},
    })
  })

  it('treats null/undefined skill level as "no contribution" to per-skill maps', () => {
    const dist = summariseMembers([
      { skillLevel: null, riskLevel: 'at_risk', joinedDaysAgo: 5 },
      { skillLevel: undefined, riskLevel: 'critical', joinedDaysAgo: 10 },
    ])
    // Totals still increment, distribution stays empty.
    expect(dist.atRiskMemberCount).toBe(2)
    expect(dist.newMemberCount).toBe(2)
    expect(dist.atRiskBySkill).toEqual({})
    expect(dist.newBySkill).toEqual({})
  })
})
