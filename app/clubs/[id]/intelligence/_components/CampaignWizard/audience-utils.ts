import type { CampaignGoal } from './types'

type SuggestedAudienceLike = {
  generatorKey?: string | null
  suggestedTemplateKey?: string | null
}

const GOAL_LABELS: Partial<Record<CampaignGoal, string>> = {
  reactivate_dormant: 'reactivate dormant players',
  onboard_new: 'onboard new members',
  promote_event: 'promote an event or program',
  upsell_tier: 'upsell a membership tier',
  renewal_reminder: 'send renewal reminders',
  custom: 'run a custom campaign',
}

const GOAL_MATCHERS: Partial<Record<CampaignGoal, { generatorKeys: string[]; templateKeys: string[] }>> = {
  reactivate_dormant: {
    generatorKeys: ['lost_evening_players'],
    templateKeys: ['win_back_inactive'],
  },
  onboard_new: {
    generatorKeys: ['new_and_engaged'],
    templateKeys: ['onboarding_series'],
  },
  renewal_reminder: {
    generatorKeys: ['renewal_in_14d'],
    templateKeys: ['renewal_reminder'],
  },
}

export function getCampaignGoalLabel(goal: CampaignGoal | null | undefined): string | null {
  if (!goal) return null
  return GOAL_LABELS[goal] ?? goal.replace(/_/g, ' ')
}

export function matchesSuggestedCohortGoal(
  goal: CampaignGoal | null | undefined,
  cohort: SuggestedAudienceLike,
): boolean {
  if (!goal) return false

  const matcher = GOAL_MATCHERS[goal]
  if (!matcher) return false

  return matcher.generatorKeys.includes(cohort.generatorKey ?? '')
    || matcher.templateKeys.includes(cohort.suggestedTemplateKey ?? '')
}
