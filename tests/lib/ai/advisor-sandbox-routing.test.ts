import { describe, expect, it } from 'vitest'
import {
  buildAdvisorSandboxRoutingSummary,
  resolveAdvisorSandboxRouting,
} from '@/lib/ai/advisor-sandbox-routing'

describe('advisor sandbox routing', () => {
  it('defaults to preview-only mode', () => {
    expect(resolveAdvisorSandboxRouting(null)).toEqual({
      mode: 'preview_only',
      emailRecipients: [],
      smsRecipients: [],
    })

    const summary = buildAdvisorSandboxRoutingSummary({
      settings: null,
      channel: 'email',
    })

    expect(summary.mode).toBe('preview_only')
    expect(summary.configuredMode).toBe('preview_only')
    expect(summary.label).toBe('Preview only')
  })

  it('arms test-recipient routing when approved recipients exist for the channel', () => {
    const summary = buildAdvisorSandboxRoutingSummary({
      settings: {
        sandboxRouting: {
          mode: 'test_recipients',
          emailRecipients: ['qa@iqsport.ai', 'qa@iqsport.ai'],
          smsRecipients: ['+15551230000'],
        },
      },
      channel: 'both',
    })

    expect(summary.mode).toBe('test_recipients')
    expect(summary.emailRecipients).toEqual(['qa@iqsport.ai'])
    expect(summary.smsRecipients).toEqual(['+15551230000'])
    expect(summary.label).toContain('Test recipients')
  })

  it('falls back to preview-only when test routing lacks recipients for the chosen channel', () => {
    const summary = buildAdvisorSandboxRoutingSummary({
      settings: {
        sandboxRouting: {
          mode: 'test_recipients',
          emailRecipients: ['qa@iqsport.ai'],
          smsRecipients: [],
        },
      },
      channel: 'sms',
    })

    expect(summary.mode).toBe('preview_only')
    expect(summary.configuredMode).toBe('test_recipients')
    expect(summary.emailRecipients).toEqual([])
    expect(summary.smsRecipients).toEqual([])
    expect(summary.label).toContain('test recipients needed')
  })
})
