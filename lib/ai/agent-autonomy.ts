import { z } from 'zod'
import type {
  MembershipSignal,
  NormalizedMembershipStatus,
  NormalizedMembershipType,
} from '@/types/intelligence'

export const agentAutonomyModeSchema = z.enum(['off', 'approve', 'auto'])

export const agentAutonomyRuleSchema = z.object({
  mode: agentAutonomyModeSchema.default('approve'),
  minConfidenceAuto: z.number().int().min(0).max(100).optional(),
  maxRecipientsAuto: z.number().int().min(1).max(500).optional(),
  requireMembershipSignal: z.boolean().optional(),
})

export const agentAutonomyPolicySchema = z.object({
  welcome: agentAutonomyRuleSchema.default({
    mode: 'auto',
    minConfidenceAuto: 90,
    maxRecipientsAuto: 10,
    requireMembershipSignal: false,
  }),
  slotFiller: agentAutonomyRuleSchema.default({
    mode: 'approve',
    minConfidenceAuto: 85,
    maxRecipientsAuto: 5,
    requireMembershipSignal: false,
  }),
  checkIn: agentAutonomyRuleSchema.default({
    mode: 'auto',
    minConfidenceAuto: 70,
    maxRecipientsAuto: 1,
    requireMembershipSignal: false,
  }),
  retentionBoost: agentAutonomyRuleSchema.default({
    mode: 'auto',
    minConfidenceAuto: 78,
    maxRecipientsAuto: 1,
    requireMembershipSignal: true,
  }),
  reactivation: agentAutonomyRuleSchema.default({
    mode: 'approve',
    minConfidenceAuto: 85,
    maxRecipientsAuto: 3,
    requireMembershipSignal: true,
  }),
  trialFollowUp: agentAutonomyRuleSchema.default({
    mode: 'approve',
    minConfidenceAuto: 86,
    maxRecipientsAuto: 2,
    requireMembershipSignal: true,
  }),
  renewalReactivation: agentAutonomyRuleSchema.default({
    mode: 'approve',
    minConfidenceAuto: 90,
    maxRecipientsAuto: 2,
    requireMembershipSignal: true,
  }),
})

export type AgentAutonomyMode = z.infer<typeof agentAutonomyModeSchema>
export type AgentAutonomyRule = z.infer<typeof agentAutonomyRuleSchema>
export type AgentAutonomyPolicy = z.infer<typeof agentAutonomyPolicySchema>
export type AgentAutonomyAction =
  | 'welcome'
  | 'slotFiller'
  | 'checkIn'
  | 'retentionBoost'
  | 'reactivation'
  | 'trialFollowUp'
  | 'renewalReactivation'

export type AgentAutonomyOutcome = 'auto' | 'pending' | 'blocked'

export const DEFAULT_AGENT_AUTONOMY_POLICY: AgentAutonomyPolicy = {
  welcome: {
    mode: 'auto',
    minConfidenceAuto: 90,
    maxRecipientsAuto: 10,
    requireMembershipSignal: false,
  },
  slotFiller: {
    mode: 'approve',
    minConfidenceAuto: 85,
    maxRecipientsAuto: 5,
    requireMembershipSignal: false,
  },
  checkIn: {
    mode: 'auto',
    minConfidenceAuto: 70,
    maxRecipientsAuto: 1,
    requireMembershipSignal: false,
  },
  retentionBoost: {
    mode: 'auto',
    minConfidenceAuto: 78,
    maxRecipientsAuto: 1,
    requireMembershipSignal: true,
  },
  reactivation: {
    mode: 'approve',
    minConfidenceAuto: 85,
    maxRecipientsAuto: 3,
    requireMembershipSignal: true,
  },
  trialFollowUp: {
    mode: 'approve',
    minConfidenceAuto: 86,
    maxRecipientsAuto: 2,
    requireMembershipSignal: true,
  },
  renewalReactivation: {
    mode: 'approve',
    minConfidenceAuto: 90,
    maxRecipientsAuto: 2,
    requireMembershipSignal: true,
  },
}

export type AgentAutonomyDecision = {
  action: AgentAutonomyAction
  configuredMode: AgentAutonomyMode
  outcome: AgentAutonomyOutcome
  reasons: string[]
  rule: AgentAutonomyRule
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function parseRule(value: unknown, fallback: AgentAutonomyRule): AgentAutonomyRule {
  const parsed = agentAutonomyRuleSchema.safeParse(value)
  return parsed.success ? { ...fallback, ...parsed.data } : fallback
}

export function readAgentAutonomyPolicyOverrides(automationSettings?: unknown): Partial<AgentAutonomyPolicy> {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const autonomyPolicy = toRecord(intelligence.autonomyPolicy)

  return {
    welcome: autonomyPolicy.welcome ? parseRule(autonomyPolicy.welcome, DEFAULT_AGENT_AUTONOMY_POLICY.welcome) : undefined,
    slotFiller: autonomyPolicy.slotFiller ? parseRule(autonomyPolicy.slotFiller, DEFAULT_AGENT_AUTONOMY_POLICY.slotFiller) : undefined,
    checkIn: autonomyPolicy.checkIn ? parseRule(autonomyPolicy.checkIn, DEFAULT_AGENT_AUTONOMY_POLICY.checkIn) : undefined,
    retentionBoost: autonomyPolicy.retentionBoost ? parseRule(autonomyPolicy.retentionBoost, DEFAULT_AGENT_AUTONOMY_POLICY.retentionBoost) : undefined,
    reactivation: autonomyPolicy.reactivation ? parseRule(autonomyPolicy.reactivation, DEFAULT_AGENT_AUTONOMY_POLICY.reactivation) : undefined,
    trialFollowUp: autonomyPolicy.trialFollowUp ? parseRule(autonomyPolicy.trialFollowUp, DEFAULT_AGENT_AUTONOMY_POLICY.trialFollowUp) : undefined,
    renewalReactivation: autonomyPolicy.renewalReactivation ? parseRule(autonomyPolicy.renewalReactivation, DEFAULT_AGENT_AUTONOMY_POLICY.renewalReactivation) : undefined,
  }
}

export function resolveAgentAutonomyPolicy(automationSettings?: unknown): AgentAutonomyPolicy {
  const overrides = readAgentAutonomyPolicyOverrides(automationSettings)
  return {
    welcome: overrides.welcome ?? DEFAULT_AGENT_AUTONOMY_POLICY.welcome,
    slotFiller: overrides.slotFiller ?? DEFAULT_AGENT_AUTONOMY_POLICY.slotFiller,
    checkIn: overrides.checkIn ?? DEFAULT_AGENT_AUTONOMY_POLICY.checkIn,
    retentionBoost: overrides.retentionBoost ?? DEFAULT_AGENT_AUTONOMY_POLICY.retentionBoost,
    reactivation: overrides.reactivation ?? DEFAULT_AGENT_AUTONOMY_POLICY.reactivation,
    trialFollowUp: overrides.trialFollowUp ?? DEFAULT_AGENT_AUTONOMY_POLICY.trialFollowUp,
    renewalReactivation: overrides.renewalReactivation ?? DEFAULT_AGENT_AUTONOMY_POLICY.renewalReactivation,
  }
}

export function mapOutreachTypeToAutonomyAction(type: string): AgentAutonomyAction | null {
  switch (type) {
    case 'CHECK_IN':
      return 'checkIn'
    case 'RETENTION_BOOST':
      return 'retentionBoost'
    case 'REACTIVATION':
      return 'reactivation'
    case 'SLOT_FILLER':
      return 'slotFiller'
    case 'NEW_MEMBER_WELCOME':
      return 'welcome'
    default:
      return null
  }
}

export function mapMembershipLifecycleToAutonomyAction(lifecycle?: string | null): AgentAutonomyAction | null {
  if (lifecycle === 'trial_follow_up') return 'trialFollowUp'
  if (lifecycle === 'renewal_reactivation') return 'renewalReactivation'
  return null
}

function getMembershipReviewReasons(opts: {
  action: AgentAutonomyAction
  membershipSignal: MembershipSignal
  membershipStatus?: NormalizedMembershipStatus | null
  membershipType?: NormalizedMembershipType | null
  membershipConfidence?: number | null
}): string[] {
  const reasons: string[] = []
  const status = opts.membershipStatus || 'unknown'
  const type = opts.membershipType || 'unknown'
  const signal = opts.membershipSignal
  const confidence = typeof opts.membershipConfidence === 'number' ? opts.membershipConfidence : null

  if ((signal === 'weak' || signal === 'missing') && confidence !== null && confidence < 70) {
    reasons.push(`Membership confidence ${confidence} is too low for reliable autopilot decisions.`)
  }

  switch (opts.action) {
    case 'welcome':
      if (['expired', 'cancelled', 'suspended'].includes(status)) {
        reasons.push(`Membership status is ${status}, so welcome automation should be reviewed.`)
      }
      break
    case 'slotFiller':
      if (['expired', 'cancelled', 'suspended'].includes(status)) {
        reasons.push(`Membership status is ${status}, so slot-filler outreach should stay manual.`)
      }
      break
    case 'checkIn':
    case 'retentionBoost':
      if (['trial', 'guest', 'none'].includes(status) || ['trial', 'guest', 'drop_in'].includes(type)) {
        reasons.push('Trial and guest-style memberships should stay on approval for retention nudges.')
      } else if (['expired', 'cancelled', 'suspended'].includes(status)) {
        reasons.push(`Membership status is ${status}; use a renewal/reactivation flow instead of auto retention outreach.`)
      }
      break
    case 'reactivation':
      if (status === 'active' && ['monthly', 'unlimited', 'package', 'discounted', 'insurance', 'staff'].includes(type)) {
        reasons.push('Active memberships should stay review-first for reactivation. Use check-in or retention flow instead.')
      } else if (status === 'trial' || type === 'trial') {
        reasons.push('Trial members should stay in onboarding or welcome flows before autonomous reactivation.')
      } else if (type === 'staff') {
        reasons.push('Staff and comped memberships should stay manual for reactivation outreach.')
      }
      break
    case 'trialFollowUp':
      if (['expired', 'cancelled', 'suspended'].includes(status)) {
        reasons.push(`Membership status is ${status}, so trial follow-up should stay manual.`)
      } else if (!['trial', 'guest'].includes(status) && !['trial', 'guest', 'drop_in'].includes(type)) {
        reasons.push('Trial follow-up should only auto-run for clear trial-style memberships.')
      }
      break
    case 'renewalReactivation':
      if (status === 'active') {
        reasons.push('Active memberships should stay review-first for renewal outreach.')
      } else if (status === 'trial' || type === 'trial' || status === 'guest' || type === 'guest' || type === 'drop_in') {
        reasons.push('Trial and guest memberships should use onboarding flows before autonomous renewal outreach.')
      } else if (type === 'staff') {
        reasons.push('Staff and comped memberships should stay manual for renewal outreach.')
      }
      break
  }

  return reasons
}

export function evaluateAgentAutonomy(opts: {
  action: AgentAutonomyAction
  automationSettings?: unknown
  liveMode: boolean
  confidence?: number | null
  recipientCount?: number | null
  membershipSignal?: MembershipSignal
  membershipStatus?: NormalizedMembershipStatus | null
  membershipType?: NormalizedMembershipType | null
  membershipConfidence?: number | null
}): AgentAutonomyDecision {
  const policy = resolveAgentAutonomyPolicy(opts.automationSettings)
  const rule = policy[opts.action]
  const reasons: string[] = []

  if (rule.mode === 'off') {
    return {
      action: opts.action,
      configuredMode: rule.mode,
      outcome: 'blocked',
      reasons: ['This action is disabled by club autonomy policy.'],
      rule,
    }
  }

  if (!opts.liveMode) {
    return {
      action: opts.action,
      configuredMode: rule.mode,
      outcome: 'pending',
      reasons: ['Agent is running in test mode, so actions stay pending.'],
      rule,
    }
  }

  if (rule.mode === 'approve') {
    return {
      action: opts.action,
      configuredMode: rule.mode,
      outcome: 'pending',
      reasons: ['Club autonomy policy requires manual approval for this action.'],
      rule,
    }
  }

  if (rule.requireMembershipSignal && opts.membershipSignal !== 'strong') {
    reasons.push('Membership signal is not reliable enough for automatic execution.')
  }

  reasons.push(
    ...getMembershipReviewReasons({
      action: opts.action,
      membershipSignal: opts.membershipSignal || 'missing',
      membershipStatus: opts.membershipStatus || null,
      membershipType: opts.membershipType || null,
      membershipConfidence: opts.membershipConfidence ?? null,
    }),
  )

  if (typeof rule.maxRecipientsAuto === 'number') {
    const recipientCount = opts.recipientCount ?? 1
    if (recipientCount > rule.maxRecipientsAuto) {
      reasons.push(`Recipient count ${recipientCount} exceeds auto-send limit ${rule.maxRecipientsAuto}.`)
    }
  }

  if (typeof rule.minConfidenceAuto === 'number') {
    if (typeof opts.confidence !== 'number') {
      reasons.push('Confidence is unavailable, so this action needs review.')
    } else if (opts.confidence < rule.minConfidenceAuto) {
      reasons.push(`Confidence ${opts.confidence} is below auto-send threshold ${rule.minConfidenceAuto}.`)
    }
  }

  return {
    action: opts.action,
    configuredMode: rule.mode,
    outcome: reasons.length > 0 ? 'pending' : 'auto',
    reasons,
    rule,
  }
}
