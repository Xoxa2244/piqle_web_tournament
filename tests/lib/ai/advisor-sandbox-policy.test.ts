import { describe, expect, it } from 'vitest'
import {
  isAdvisorSandboxRoutingRequest,
  resolveAdvisorSandboxRoutingDraft,
  updateAdvisorSandboxRoutingFromMessage,
} from '@/lib/ai/advisor-sandbox-policy'

describe('advisor sandbox policy', () => {
  it('loads current sandbox routing overrides from automation settings', () => {
    const policy = resolveAdvisorSandboxRoutingDraft({
      intelligence: {
        sandboxRouting: {
          mode: 'test_recipients',
          emailRecipients: ['qa@iqsport.ai'],
          smsRecipients: ['+15555550123'],
        },
      },
    })

    expect(policy.mode).toBe('test_recipients')
    expect(policy.emailRecipients).toEqual(['qa@iqsport.ai'])
    expect(policy.smsRecipients).toEqual(['+15555550123'])
  })

  it('detects sandbox routing change requests', () => {
    expect(isAdvisorSandboxRoutingRequest('Route sandbox emails to qa@iqsport.ai and keep SMS on preview only')).toBe(true)
    expect(isAdvisorSandboxRoutingRequest('How does sandbox preview work today?')).toBe(false)
  })

  it('can switch sandbox into test-recipient mode with whitelisted targets', () => {
    const current = resolveAdvisorSandboxRoutingDraft()
    const updated = updateAdvisorSandboxRoutingFromMessage({
      message: 'Route sandbox to test recipients. Use qa@iqsport.ai and +1 (555) 555-0123.',
      currentPolicy: current,
    })

    expect(updated).not.toBeNull()
    expect(updated?.mode).toBe('test_recipients')
    expect(updated?.emailRecipients).toEqual(['qa@iqsport.ai'])
    expect(updated?.smsRecipients).toEqual(['+15555550123'])
    expect(updated?.changes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Sandbox mode'),
        expect.stringContaining('Email test recipients'),
        expect.stringContaining('SMS test recipients'),
      ]),
    )
  })

  it('can keep existing recipients and append new ones implicitly', () => {
    const current = resolveAdvisorSandboxRoutingDraft({
      intelligence: {
        sandboxRouting: {
          mode: 'test_recipients',
          emailRecipients: ['qa@iqsport.ai'],
          smsRecipients: [],
        },
      },
    })

    const updated = updateAdvisorSandboxRoutingFromMessage({
      message: 'Also add ops@iqsport.ai to the sandbox test recipients.',
      currentPolicy: current,
      allowImplicit: true,
    })

    expect(updated).not.toBeNull()
    expect(updated?.emailRecipients).toEqual(['qa@iqsport.ai', 'ops@iqsport.ai'])
  })

  it('can clear test recipients and return to preview only', () => {
    const current = resolveAdvisorSandboxRoutingDraft({
      intelligence: {
        sandboxRouting: {
          mode: 'test_recipients',
          emailRecipients: ['qa@iqsport.ai'],
          smsRecipients: ['+15555550123'],
        },
      },
    })

    const updated = updateAdvisorSandboxRoutingFromMessage({
      message: 'Keep sandbox preview only and clear all sandbox recipients.',
      currentPolicy: current,
    })

    expect(updated).not.toBeNull()
    expect(updated?.mode).toBe('preview_only')
    expect(updated?.emailRecipients).toEqual([])
    expect(updated?.smsRecipients).toEqual([])
  })
})
