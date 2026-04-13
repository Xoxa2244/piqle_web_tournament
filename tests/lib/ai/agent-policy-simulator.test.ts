import { describe, expect, it } from 'vitest'
import { buildAgentPolicyScenarios } from '@/lib/ai/agent-policy-simulator'

describe('agent policy simulator', () => {
  it('estimates auto gain when slot filler moves from approve to auto', () => {
    const scenarios = buildAgentPolicyScenarios({
      items: [
        {
          id: 'slot-1',
          type: 'SLOT_FILLER',
          currentOutcome: 'pending',
          confidence: 92,
          recipientCount: 3,
          membershipSignal: 'strong',
          membershipStatus: 'active',
          membershipType: 'monthly',
          membershipConfidence: 90,
        },
        {
          id: 'slot-2',
          type: 'SLOT_FILLER',
          currentOutcome: 'pending',
          confidence: 88,
          recipientCount: 4,
          membershipSignal: 'strong',
          membershipStatus: 'active',
          membershipType: 'monthly',
          membershipConfidence: 88,
        },
      ],
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            slotFiller: {
              mode: 'approve',
              minConfidenceAuto: 85,
              maxRecipientsAuto: 5,
              requireMembershipSignal: false,
            },
          },
        },
      },
      liveMode: true,
    })

    expect(scenarios[0]).toMatchObject({
      action: 'slotFiller',
      currentMode: 'approve',
      autoGain: 2,
      stillPending: 0,
      stillBlocked: 0,
      requiresLiveMode: false,
    })
  })

  it('keeps membership-blocked reactivation out of auto', () => {
    const scenarios = buildAgentPolicyScenarios({
      items: [
        {
          id: 'react-1',
          type: 'REACTIVATION',
          currentOutcome: 'pending',
          confidence: 90,
          recipientCount: 1,
          membershipSignal: 'strong',
          membershipStatus: 'active',
          membershipType: 'monthly',
          membershipConfidence: 92,
        },
      ],
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            reactivation: {
              mode: 'approve',
              minConfidenceAuto: 85,
              maxRecipientsAuto: 3,
              requireMembershipSignal: true,
            },
          },
        },
      },
      liveMode: true,
    })

    expect(scenarios[0]).toMatchObject({
      action: 'reactivation',
      autoGain: 0,
      stillPending: 1,
      stillBlocked: 0,
    })
    expect(scenarios[0]?.topReasons[0]?.label).toContain('Active memberships should stay review-first')
  })

  it('marks scenarios as requiring live mode when club is still in test mode', () => {
    const scenarios = buildAgentPolicyScenarios({
      items: [
        {
          id: 'welcome-1',
          type: 'NEW_MEMBER_WELCOME',
          currentOutcome: 'pending',
          confidence: 98,
          recipientCount: 1,
          membershipSignal: 'strong',
          membershipStatus: 'active',
          membershipType: 'monthly',
          membershipConfidence: 95,
        },
      ],
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            welcome: {
              mode: 'approve',
              minConfidenceAuto: 90,
              maxRecipientsAuto: 10,
              requireMembershipSignal: false,
            },
          },
        },
      },
      liveMode: false,
    })

    expect(scenarios[0]).toMatchObject({
      action: 'welcome',
      autoGain: 1,
      requiresLiveMode: true,
    })
  })

  it('simulates trial follow-up separately from generic retention actions', () => {
    const scenarios = buildAgentPolicyScenarios({
      items: [
        {
          id: 'trial-1',
          type: 'RETENTION_BOOST',
          membershipLifecycle: 'trial_follow_up',
          currentOutcome: 'pending',
          confidence: 91,
          recipientCount: 1,
          membershipSignal: 'strong',
          membershipStatus: 'trial',
          membershipType: 'trial',
          membershipConfidence: 90,
        },
      ],
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            trialFollowUp: {
              mode: 'approve',
              minConfidenceAuto: 86,
              maxRecipientsAuto: 2,
              requireMembershipSignal: true,
            },
          },
        },
      },
      liveMode: true,
    })

    expect(scenarios[0]).toMatchObject({
      action: 'trialFollowUp',
      currentMode: 'approve',
      autoGain: 1,
      stillPending: 0,
      stillBlocked: 0,
    })
  })
})
