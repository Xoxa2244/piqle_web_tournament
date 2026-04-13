import { describe, expect, it } from 'vitest'

import {
  buildAgentTriggerReasoning,
  evaluateAgentTriggerRuntime,
} from '@/lib/ai/agent-trigger-runtime'

describe('agent trigger runtime', () => {
  it('builds a normalized runtime snapshot for auto-run triggers', () => {
    const runtime = evaluateAgentTriggerRuntime({
      source: 'slot_filler_automation',
      triggerMode: 'immediate',
      action: 'slotFiller',
      automationSettings: {
        intelligence: {
          autonomyPolicy: {
            slotFiller: {
              mode: 'auto',
              minConfidenceAuto: 80,
              maxRecipientsAuto: 5,
            },
          },
        },
      },
      liveMode: true,
      confidence: 91,
      recipientCount: 3,
      membershipSignal: 'weak',
    })

    expect(runtime.decision.outcome).toBe('auto')
    expect(runtime.source).toBe('slot_filler_automation')
    expect(runtime.triggerMode).toBe('immediate')

    const reasoning = buildAgentTriggerReasoning(runtime, { mode: 'tomorrow' })
    expect(reasoning.autoApproved).toBe(true)
    expect((reasoning as any).triggerRuntime.source).toBe('slot_filler_automation')
    expect((reasoning as any).triggerRuntime.outcome).toBe('auto')
    expect((reasoning as any).mode).toBe('tomorrow')
  })

  it('keeps blocked reasons intact in the runtime snapshot', () => {
    const runtime = evaluateAgentTriggerRuntime({
      source: 'campaign_engine',
      triggerMode: 'immediate',
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
      confidence: 98,
      recipientCount: 1,
      membershipSignal: 'strong',
    })

    const reasoning = buildAgentTriggerReasoning(runtime)
    expect(runtime.decision.outcome).toBe('blocked')
    expect((reasoning as any).triggerRuntime.configuredMode).toBe('off')
    expect((reasoning as any).triggerRuntime.reasons[0]).toContain('disabled')
  })
})
