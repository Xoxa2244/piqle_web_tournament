import 'server-only'

import type {
  AdvisorAction,
  AdvisorActionCore,
  AdvisorActionRecommendation,
} from './advisor-actions'
import { stripAdvisorRecommendation } from './advisor-actions'

function getEligibleCount(action: AdvisorAction | AdvisorActionCore) {
  if (action.kind === 'create_campaign') return action.campaign.guardrails?.eligibleCount ?? action.audience.count ?? 0
  if (action.kind === 'fill_session') return action.outreach.guardrails?.eligibleCount ?? action.outreach.candidateCount
  if (action.kind === 'reactivate_members') return action.reactivation.guardrails?.eligibleCount ?? action.reactivation.candidateCount
  if (action.kind === 'trial_follow_up' || action.kind === 'renewal_reactivation') {
    return action.lifecycle.guardrails?.eligibleCount ?? action.lifecycle.candidateCount
  }
  return 0
}

export function buildAdvisorRecommendation(opts: {
  current: AdvisorAction | AdvisorActionCore
  recommended: AdvisorAction | AdvisorActionCore
  title: string
  summary?: string
  why: string[]
  highlights?: string[]
}): AdvisorActionRecommendation {
  const currentEligibleCount = getEligibleCount(opts.current)
  const recommendedEligibleCount = getEligibleCount(opts.recommended)
  const cleanedWhy = opts.why
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 4)

  const cleanedHighlights = (opts.highlights || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 4)

  if (recommendedEligibleCount > currentEligibleCount) {
    cleanedWhy.push(
      `This reaches ${recommendedEligibleCount - currentEligibleCount} more eligible member${recommendedEligibleCount - currentEligibleCount === 1 ? '' : 's'} right now.`,
    )
  }

  return {
    title: opts.title,
    summary: opts.summary || stripAdvisorRecommendation(opts.recommended).summary,
    why: cleanedWhy.slice(0, 4),
    highlights: cleanedHighlights,
    action: stripAdvisorRecommendation(opts.recommended),
  }
}

