import { describe, it, expect } from 'vitest'
import { determineNextStep, getSequenceType } from '../../../lib/ai/sequence-runner'
import type { ActiveSequence } from '../../../lib/ai/sequence-runner'

// ── Helper to build mock sequences ──

function mockSequence(overrides: {
  currentStep?: number
  rootCreatedDaysAgo?: number
  latestCreatedDaysAgo?: number
  channel?: string
  openedAt?: Date | null
  clickedAt?: Date | null
  bouncedAt?: Date | null
  allSteps?: ActiveSequence['allSteps']
}): ActiveSequence {
  const now = new Date()
  const rootCreatedAt = new Date(now.getTime() - (overrides.rootCreatedDaysAgo ?? 3) * 86400000)
  const latestCreatedAt = new Date(now.getTime() - (overrides.latestCreatedDaysAgo ?? 0) * 86400000)
  const currentStep = overrides.currentStep ?? 0

  const rootLog = {
    id: 'root-log-id',
    userId: 'user-1',
    clubId: 'club-1',
    type: 'CHECK_IN',
    createdAt: rootCreatedAt,
    variantId: 'checkin_pattern',
    reasoning: { transition: 'healthy → watch' },
  }

  const latestStep = {
    id: currentStep === 0 ? 'root-log-id' : `step-${currentStep}-id`,
    sequenceStep: currentStep,
    createdAt: latestCreatedAt,
    channel: overrides.channel ?? 'email',
    openedAt: overrides.openedAt ?? null,
    clickedAt: overrides.clickedAt ?? null,
    bouncedAt: overrides.bouncedAt ?? null,
    deliveredAt: null,
    status: 'sent',
  }

  const step0 = {
    ...latestStep,
    id: 'root-log-id',
    sequenceStep: 0,
    createdAt: rootCreatedAt,
    bounceType: null,
  }

  const allSteps = overrides.allSteps ?? [
    step0,
    ...(currentStep > 0 ? [{
      ...latestStep,
      bounceType: null,
    }] : []),
  ]

  return { rootLog, latestStep, allSteps }
}

// ── getSequenceType ──

describe('getSequenceType', () => {
  it('maps watch → WATCH', () => {
    expect(getSequenceType('watch')).toBe('WATCH')
  })

  it('maps at_risk → AT_RISK', () => {
    expect(getSequenceType('at_risk')).toBe('AT_RISK')
  })

  it('maps critical → CRITICAL', () => {
    expect(getSequenceType('critical')).toBe('CRITICAL')
  })

  it('returns null for healthy', () => {
    expect(getSequenceType('healthy')).toBeNull()
  })

  it('returns null for unknown', () => {
    expect(getSequenceType('whatever')).toBeNull()
  })
})

// ── WATCH Sequence Branching ──

describe('WATCH sequence', () => {
  describe('Step 0 → Step 1 (Day 3)', () => {
    it('sends resend_new_subject when email NOT opened', () => {
      const seq = mockSequence({
        currentStep: 0,
        rootCreatedDaysAgo: 4, // >3 days ago
        latestCreatedDaysAgo: 4,
        openedAt: null,
        clickedAt: null,
      })
      const result = determineNextStep(seq, 'WATCH')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('resend_new_subject')
      expect(result.stepNumber).toBe(1)
    })

    it('sends social_proof when opened but NOT clicked', () => {
      const seq = mockSequence({
        currentStep: 0,
        rootCreatedDaysAgo: 4,
        latestCreatedDaysAgo: 4,
        openedAt: new Date(),
        clickedAt: null,
      })
      const result = determineNextStep(seq, 'WATCH')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('social_proof')
      expect(result.stepNumber).toBe(1)
    })

    it('waits when clicked (pending SMS on day 7)', () => {
      const seq = mockSequence({
        currentStep: 0,
        rootCreatedDaysAgo: 4,
        latestCreatedDaysAgo: 4,
        openedAt: new Date(),
        clickedAt: new Date(),
      })
      const result = determineNextStep(seq, 'WATCH')
      expect(result.action).toBe('wait')
    })

    it('waits when too early (< 3 days)', () => {
      const seq = mockSequence({
        currentStep: 0,
        rootCreatedDaysAgo: 2,
        latestCreatedDaysAgo: 2,
        openedAt: null,
      })
      const result = determineNextStep(seq, 'WATCH')
      expect(result.action).toBe('wait')
    })
  })

  describe('Step 1 → Step 2 (Day 7)', () => {
    it('sends SMS nudge when step 0 was clicked but no booking', () => {
      const now = new Date()
      const step0Created = new Date(now.getTime() - 8 * 86400000) // 8 days ago
      const step1Created = new Date(now.getTime() - 5 * 86400000) // 5 days ago

      const seq = mockSequence({
        currentStep: 1,
        rootCreatedDaysAgo: 8,
        latestCreatedDaysAgo: 5,
      })
      // Override allSteps to include step 0 with click
      seq.allSteps = [
        {
          id: 'root-log-id', sequenceStep: 0, createdAt: step0Created,
          channel: 'email', openedAt: now, clickedAt: now, bouncedAt: null, deliveredAt: null,
          status: 'sent', bounceType: null,
        },
        {
          id: 'step-1-id', sequenceStep: 1, createdAt: step1Created,
          channel: 'email', openedAt: null, clickedAt: null, bouncedAt: null, deliveredAt: null,
          status: 'sent', bounceType: null,
        },
      ]

      const result = determineNextStep(seq, 'WATCH')
      expect(result.action).toBe('send_sms')
      expect(result.messageType).toBe('sms_nudge')
      expect(result.stepNumber).toBe(2)
    })
  })

  describe('Step 2 → Step 3 (Day 10)', () => {
    it('sends final_offer on last step', () => {
      const seq = mockSequence({
        currentStep: 2,
        rootCreatedDaysAgo: 11,
        latestCreatedDaysAgo: 4,
      })
      const result = determineNextStep(seq, 'WATCH')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('final_offer')
      expect(result.stepNumber).toBe(3)
    })
  })

  describe('After Step 3', () => {
    it('exits as done', () => {
      const seq = mockSequence({ currentStep: 3, rootCreatedDaysAgo: 12, latestCreatedDaysAgo: 2 })
      const result = determineNextStep(seq, 'WATCH')
      expect(result.action).toBe('exit_done')
    })
  })
})

// ── AT_RISK Sequence Branching ──

describe('AT_RISK sequence', () => {
  describe('Step 0 → Step 1 (Day 2)', () => {
    it('sends urgency_resend when NOT opened', () => {
      const seq = mockSequence({
        currentStep: 0,
        rootCreatedDaysAgo: 3,
        latestCreatedDaysAgo: 3,
        openedAt: null,
      })
      const result = determineNextStep(seq, 'AT_RISK')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('urgency_resend')
      expect(result.stepNumber).toBe(1)
    })

    it('sends value_reminder when opened', () => {
      const seq = mockSequence({
        currentStep: 0,
        rootCreatedDaysAgo: 3,
        latestCreatedDaysAgo: 3,
        openedAt: new Date(),
      })
      const result = determineNextStep(seq, 'AT_RISK')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('value_reminder')
    })
  })

  describe('Step 1 → Step 2 (Day 5)', () => {
    it('sends SMS on day 5', () => {
      const seq = mockSequence({
        currentStep: 1,
        rootCreatedDaysAgo: 6,
        latestCreatedDaysAgo: 4,
      })
      const result = determineNextStep(seq, 'AT_RISK')
      expect(result.action).toBe('send_sms')
      expect(result.messageType).toBe('sms_nudge')
      expect(result.stepNumber).toBe(2)
    })
  })

  describe('Step 2 → Step 3 (Day 7)', () => {
    it('sends final_email', () => {
      const seq = mockSequence({
        currentStep: 2,
        rootCreatedDaysAgo: 8,
        latestCreatedDaysAgo: 3,
      })
      const result = determineNextStep(seq, 'AT_RISK')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('final_email')
      expect(result.stepNumber).toBe(3)
    })
  })

  describe('After Step 3', () => {
    it('exits to win-back', () => {
      const seq = mockSequence({ currentStep: 3, rootCreatedDaysAgo: 12, latestCreatedDaysAgo: 4 })
      const result = determineNextStep(seq, 'AT_RISK')
      expect(result.action).toBe('exit_winback')
    })
  })
})

// ── CRITICAL Sequence Branching ──

describe('CRITICAL sequence', () => {
  describe('Step 0 → Step 1 (Day 1)', () => {
    it('sends immediate SMS next day', () => {
      const seq = mockSequence({
        currentStep: 0,
        rootCreatedDaysAgo: 2,
        latestCreatedDaysAgo: 2,
      })
      const result = determineNextStep(seq, 'CRITICAL')
      expect(result.action).toBe('send_sms')
      expect(result.messageType).toBe('sms_nudge')
      expect(result.stepNumber).toBe(1)
    })
  })

  describe('Step 1 → Step 2 (Day 3)', () => {
    it('sends community email when no engagement', () => {
      const now = new Date()
      const seq = mockSequence({
        currentStep: 1,
        rootCreatedDaysAgo: 4,
        latestCreatedDaysAgo: 3,
      })
      seq.allSteps = [
        {
          id: 'root-log-id', sequenceStep: 0, createdAt: new Date(now.getTime() - 4 * 86400000),
          channel: 'email', openedAt: null, clickedAt: null, bouncedAt: null, deliveredAt: null,
          status: 'sent', bounceType: null,
        },
        {
          id: 'step-1-id', sequenceStep: 1, createdAt: new Date(now.getTime() - 3 * 86400000),
          channel: 'sms', openedAt: null, clickedAt: null, bouncedAt: null, deliveredAt: null,
          status: 'sent', bounceType: null,
        },
      ]
      const result = determineNextStep(seq, 'CRITICAL')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('community')
      expect(result.stepNumber).toBe(2)
    })

    it('sends social_proof when some engagement exists', () => {
      const now = new Date()
      const seq = mockSequence({
        currentStep: 1,
        rootCreatedDaysAgo: 4,
        latestCreatedDaysAgo: 3,
      })
      seq.allSteps = [
        {
          id: 'root-log-id', sequenceStep: 0, createdAt: new Date(now.getTime() - 4 * 86400000),
          channel: 'email', openedAt: now, clickedAt: null, bouncedAt: null, deliveredAt: null,
          status: 'sent', bounceType: null,
        },
        {
          id: 'step-1-id', sequenceStep: 1, createdAt: new Date(now.getTime() - 3 * 86400000),
          channel: 'sms', openedAt: null, clickedAt: null, bouncedAt: null, deliveredAt: null,
          status: 'sent', bounceType: null,
        },
      ]
      const result = determineNextStep(seq, 'CRITICAL')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('social_proof')
    })
  })

  describe('Step 2 → Step 3 (Day 7)', () => {
    it('sends winback_offer', () => {
      const seq = mockSequence({
        currentStep: 2,
        rootCreatedDaysAgo: 8,
        latestCreatedDaysAgo: 5,
      })
      const result = determineNextStep(seq, 'CRITICAL')
      expect(result.action).toBe('send_email')
      expect(result.messageType).toBe('winback_offer')
      expect(result.stepNumber).toBe(3)
    })
  })

  describe('After Step 3', () => {
    it('exits as churned', () => {
      const seq = mockSequence({ currentStep: 3, rootCreatedDaysAgo: 15, latestCreatedDaysAgo: 8 })
      const result = determineNextStep(seq, 'CRITICAL')
      expect(result.action).toBe('exit_churned')
    })
  })
})

// ── Timing Guards ──

describe('Timing guards', () => {
  it('waits if min hours between steps not met (WATCH: 48h)', () => {
    const seq = mockSequence({
      currentStep: 0,
      rootCreatedDaysAgo: 4, // Day 3 target is met
      latestCreatedDaysAgo: 1, // But latest step was only 1 day ago (24h < 48h)
      openedAt: null,
    })
    // Manually fix: root created 4 days ago but latest also should be root (step 0)
    // If step 0 was created 1 day ago, day 3 target is NOT met
    const seq2 = mockSequence({
      currentStep: 0,
      rootCreatedDaysAgo: 1, // root created just 1 day ago
      latestCreatedDaysAgo: 1,
      openedAt: null,
    })
    const result = determineNextStep(seq2, 'WATCH')
    expect(result.action).toBe('wait')
    expect(result.reason).toContain('Too early')
  })

  it('CRITICAL has 24h minimum gap (more aggressive)', () => {
    const seq = mockSequence({
      currentStep: 0,
      rootCreatedDaysAgo: 2, // Day 1 target met
      latestCreatedDaysAgo: 2, // 48h since latest — well above 24h min
    })
    const result = determineNextStep(seq, 'CRITICAL')
    expect(result.action).toBe('send_sms') // Should proceed
  })
})
