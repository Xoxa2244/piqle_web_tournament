import { describe, expect, it } from 'vitest'
import {
  isAdvisorAutonomyPolicyRequest,
  resolveAdvisorAutonomyPolicy,
  updateAdvisorAutonomyPolicyFromMessage,
} from '@/lib/ai/advisor-autonomy-policy'

describe('advisor autonomy policy', () => {
  it('loads the current default autonomy matrix', () => {
    const policy = resolveAdvisorAutonomyPolicy()

    expect(policy.welcome.mode).toBe('auto')
    expect(policy.slotFiller.mode).toBe('approve')
    expect(policy.reactivation.mode).toBe('approve')
  })

  it('detects autonomy policy change requests', () => {
    expect(isAdvisorAutonomyPolicyRequest('Set welcome to auto and keep slot filler on approval')).toBe(true)
    expect(isAdvisorAutonomyPolicyRequest('What is our current autopilot policy?')).toBe(false)
  })

  it('updates multiple action modes from one request', () => {
    const policy = resolveAdvisorAutonomyPolicy()
    const updated = updateAdvisorAutonomyPolicyFromMessage({
      message: 'Set welcome to auto and turn reactivation off.',
      currentPolicy: policy,
    })

    expect(updated).not.toBeNull()
    expect(updated?.welcome.mode).toBe('auto')
    expect(updated?.reactivation.mode).toBe('off')
    expect(updated?.changes.some((change) => change.includes('Reactivation'))).toBe(true)
  })

  it('updates thresholds for a targeted action', () => {
    const policy = resolveAdvisorAutonomyPolicy()
    const updated = updateAdvisorAutonomyPolicyFromMessage({
      message: 'Keep slot filler on approval with 90% confidence, max 3 players, and require strong membership signal.',
      currentPolicy: policy,
    })

    expect(updated).not.toBeNull()
    expect(updated?.slotFiller.mode).toBe('approve')
    expect(updated?.slotFiller.minConfidenceAuto).toBe(90)
    expect(updated?.slotFiller.maxRecipientsAuto).toBe(3)
    expect(updated?.slotFiller.requireMembershipSignal).toBe(true)
  })

  it('can apply a global mode across all actions', () => {
    const policy = resolveAdvisorAutonomyPolicy()
    const updated = updateAdvisorAutonomyPolicyFromMessage({
      message: 'Set all autopilot actions to approve for now.',
      currentPolicy: policy,
    })

    expect(updated).not.toBeNull()
    expect(updated?.welcome.mode).toBe('approve')
    expect(updated?.slotFiller.mode).toBe('approve')
    expect(updated?.checkIn.mode).toBe('approve')
    expect(updated?.retentionBoost.mode).toBe('approve')
    expect(updated?.reactivation.mode).toBe('approve')
  })
})
