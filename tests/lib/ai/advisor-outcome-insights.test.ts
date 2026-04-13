import { describe, expect, it } from 'vitest'

import {
  buildAdvisorOutcomeInsights,
  formatAdvisorOutcomeInsightsBlock,
} from '@/lib/ai/advisor-outcome-insights'

describe('advisor outcome insights', () => {
  it('aggregates outreach outcomes by flow and ranks top performers', () => {
    const insights = buildAdvisorOutcomeInsights({
      campaignLogs: [
        { type: 'REACTIVATION', channel: 'email', status: 'sent', openedAt: '2026-04-12T10:00:00.000Z' },
        { type: 'REACTIVATION', channel: 'email', status: 'clicked', openedAt: '2026-04-12T10:05:00.000Z', clickedAt: '2026-04-12T10:06:00.000Z' },
        { type: 'REACTIVATION', channel: 'email', status: 'converted', openedAt: '2026-04-12T10:07:00.000Z', clickedAt: '2026-04-12T10:08:00.000Z', respondedAt: '2026-04-12T10:09:00.000Z' },
        { type: 'SLOT_FILLER', channel: 'sms', status: 'sent', deliveredAt: '2026-04-12T11:00:00.000Z' },
        { type: 'SLOT_FILLER', channel: 'sms', status: 'sent', deliveredAt: '2026-04-12T11:05:00.000Z' },
      ],
      advisorOutcomes: [
        {
          kind: 'fill_session',
          title: 'Fill session',
          summary: 'Session fill finished for Beginner Open Play: 3 sent, 1 skipped.',
          occurredAt: '2026-04-13T16:00:00.000Z',
        },
      ],
    })

    expect(insights.totals.sent).toBe(5)
    expect(insights.totals.opened).toBe(3)
    expect(insights.totals.clicked).toBe(2)
    expect(insights.totals.converted).toBe(1)
    expect(insights.topFlows[0]).toMatchObject({
      type: 'REACTIVATION',
      channel: 'email',
      sent: 3,
      conversionRate: 33,
    })
    expect(insights.recentOutcomes).toHaveLength(1)
  })

  it('formats a compact outcome context block for the advisor prompt', () => {
    const block = formatAdvisorOutcomeInsightsBlock({
      totals: {
        sent: 8,
        delivered: 8,
        opened: 4,
        clicked: 2,
        converted: 1,
      },
      topFlows: [
        {
          type: 'REACTIVATION',
          channel: 'email',
          sent: 5,
          delivered: 5,
          opened: 3,
          clicked: 1,
          converted: 1,
          openRate: 60,
          clickRate: 33,
          conversionRate: 20,
        },
      ],
      recentOutcomes: [
        {
          kind: 'create_campaign',
          title: 'Draft reactivation campaign',
          summary: 'Campaign scheduled for Tue, Apr 14, 9:00 AM PDT with 9 eligible members.',
          occurredAt: '2026-04-13T16:00:00.000Z',
        },
      ],
    })

    expect(block).toContain('Recent Agent Outcomes')
    expect(block).toContain('Last 30d outreach totals: 8 sent')
    expect(block).toContain('Reactivation via email: 5 sent')
    expect(block).toContain('Campaign scheduled for Tue, Apr 14, 9:00 AM PDT')
  })
})
