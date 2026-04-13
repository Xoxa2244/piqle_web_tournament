import { describe, expect, it } from 'vitest'
import {
  evaluateAgentAutonomy,
  resolveAgentAutonomyPolicy,
} from '@/lib/ai/agent-autonomy'

describe('agent autonomy policy', () => {
  it('returns default policy values', () => {
    const policy = resolveAgentAutonomyPolicy()

    expect(policy.welcome.mode).toBe('auto')
    expect(policy.slotFiller.mode).toBe('approve')
    expect(policy.reactivation.mode).toBe('approve')
    expect(policy.trialFollowUp.mode).toBe('approve')
    expect(policy.renewalReactivation.mode).toBe('approve')
  })

  it('merges club overrides from automation settings', () => {
    const policy = resolveAgentAutonomyPolicy({
      intelligence: {
        autonomyPolicy: {
          slotFiller: {
            mode: 'auto',
            minConfidenceAuto: 88,
            maxRecipientsAuto: 3,
          },
        },
      },
    })

    expect(policy.slotFiller.mode).toBe('auto')
    expect(policy.slotFiller.minConfidenceAuto).toBe(88)
    expect(policy.slotFiller.maxRecipientsAuto).toBe(3)
    expect(policy.welcome.mode).toBe('auto')
  })

  it('keeps actions pending in test mode even if policy is auto', () => {
    const decision = evaluateAgentAutonomy({
      action: 'welcome',
      automationSettings: undefined,
      liveMode: false,
      confidence: 95,
      recipientCount: 1,
      membershipSignal: 'weak',
    })

    expect(decision.outcome).toBe('pending')
    expect(decision.reasons[0]).toContain('test mode')
  })

  it('requires manual review when recipient count exceeds auto limit', () => {
    const decision = evaluateAgentAutonomy({
      action: 'slotFiller',
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            slotFiller: {
              mode: 'auto',
              minConfidenceAuto: 80,
              maxRecipientsAuto: 2,
            },
          },
        },
      },
      liveMode: true,
      confidence: 92,
      recipientCount: 4,
      membershipSignal: 'weak',
    })

    expect(decision.outcome).toBe('pending')
    expect(decision.reasons.join(' ')).toContain('exceeds auto-send limit')
  })

  it('blocks actions explicitly disabled by policy', () => {
    const decision = evaluateAgentAutonomy({
      action: 'reactivation',
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            reactivation: {
              mode: 'off',
            },
          },
        },
      },
      liveMode: true,
      confidence: 96,
      recipientCount: 1,
      membershipSignal: 'strong',
    })

    expect(decision.outcome).toBe('blocked')
  })

  it('requires strong membership signal when the rule says so', () => {
    const decision = evaluateAgentAutonomy({
      action: 'retentionBoost',
      automationSettings: undefined,
      liveMode: true,
      confidence: 91,
      recipientCount: 1,
      membershipSignal: 'missing',
    })

    expect(decision.outcome).toBe('pending')
    expect(decision.reasons.join(' ')).toContain('Membership signal')
  })

  it('keeps trial members on approval for automated retention nudges', () => {
    const decision = evaluateAgentAutonomy({
      action: 'retentionBoost',
      automationSettings: undefined,
      liveMode: true,
      confidence: 91,
      recipientCount: 1,
      membershipSignal: 'strong',
      membershipStatus: 'trial',
      membershipType: 'trial',
      membershipConfidence: 88,
    })

    expect(decision.outcome).toBe('pending')
    expect(decision.reasons.join(' ')).toContain('Trial and guest-style memberships')
  })

  it('keeps active memberships review-first for reactivation even when policy is auto', () => {
    const decision = evaluateAgentAutonomy({
      action: 'reactivation',
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            reactivation: {
              mode: 'auto',
              minConfidenceAuto: 80,
              maxRecipientsAuto: 3,
              requireMembershipSignal: true,
            },
          },
        },
      },
      liveMode: true,
      confidence: 96,
      recipientCount: 1,
      membershipSignal: 'strong',
      membershipStatus: 'active',
      membershipType: 'monthly',
      membershipConfidence: 90,
    })

    expect(decision.outcome).toBe('pending')
    expect(decision.reasons.join(' ')).toContain('Active memberships should stay review-first')
  })

  it('requires review when membership confidence is weak even if a membership exists', () => {
    const decision = evaluateAgentAutonomy({
      action: 'welcome',
      automationSettings: undefined,
      liveMode: true,
      confidence: 97,
      recipientCount: 1,
      membershipSignal: 'weak',
      membershipStatus: 'active',
      membershipType: 'monthly',
      membershipConfidence: 52,
    })

    expect(decision.outcome).toBe('pending')
    expect(decision.reasons.join(' ')).toContain('Membership confidence 52')
  })

  it('can auto-run trial follow-up when the club explicitly enables it and membership is clearly trial', () => {
    const decision = evaluateAgentAutonomy({
      action: 'trialFollowUp',
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            trialFollowUp: {
              mode: 'auto',
              minConfidenceAuto: 80,
              maxRecipientsAuto: 2,
              requireMembershipSignal: true,
            },
          },
        },
      },
      liveMode: true,
      confidence: 92,
      recipientCount: 1,
      membershipSignal: 'strong',
      membershipStatus: 'trial',
      membershipType: 'trial',
      membershipConfidence: 90,
    })

    expect(decision.outcome).toBe('auto')
  })

  it('keeps renewal outreach on review for active memberships even when lifecycle policy is auto', () => {
    const decision = evaluateAgentAutonomy({
      action: 'renewalReactivation',
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            renewalReactivation: {
              mode: 'auto',
              minConfidenceAuto: 88,
              maxRecipientsAuto: 2,
              requireMembershipSignal: true,
            },
          },
        },
      },
      liveMode: true,
      confidence: 96,
      recipientCount: 1,
      membershipSignal: 'strong',
      membershipStatus: 'active',
      membershipType: 'monthly',
      membershipConfidence: 93,
    })

    expect(decision.outcome).toBe('pending')
    expect(decision.reasons.join(' ')).toContain('Active memberships should stay review-first for renewal outreach')
  })
})
