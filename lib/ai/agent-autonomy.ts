import { z } from 'zod'

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

export function evaluateAgentAutonomy(opts: {
  action: AgentAutonomyAction
  automationSettings?: unknown
  liveMode: boolean
  confidence?: number | null
  recipientCount?: number | null
  membershipSignal?: 'strong' | 'weak' | 'missing'
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
