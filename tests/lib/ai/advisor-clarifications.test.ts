import { describe, expect, it } from 'vitest'

import { maybeStartAdvisorClarification } from '@/lib/ai/advisor-clarifications'

describe('advisor clarifications', () => {
  it('does not ask for a channel when adaptive defaults already set one', () => {
    const clarification = maybeStartAdvisorClarification({
      message: 'Create a reactivation campaign for inactive members',
      plan: {
        action: 'draft_campaign',
        usePreviousCohort: false,
        audienceText: 'inactive members',
        campaignType: 'REACTIVATION',
        channel: 'sms',
        deliveryMode: 'save_draft',
      },
      state: null,
      language: 'en',
      timeZone: 'UTC',
    })

    expect(clarification).toBeNull()
  })
})
