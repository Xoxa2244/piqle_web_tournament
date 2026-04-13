import {
  evaluateAgentAutonomy,
  type AgentAutonomyAction,
  type AgentAutonomyDecision,
  type AgentAutonomyOutcome,
} from './agent-autonomy'

export type AgentTriggerSource =
  | 'event_detection'
  | 'slot_filler_automation'
  | 'campaign_engine'
  | 'sequence_engine'

export type AgentTriggerMode = 'immediate' | 'deferred'

export type AgentTriggerRuntime = {
  source: AgentTriggerSource
  triggerMode: AgentTriggerMode
  liveMode: boolean
  action: AgentAutonomyAction
  confidence: number | null
  recipientCount: number | null
  membershipSignal: 'strong' | 'weak' | 'missing'
  decision: AgentAutonomyDecision
}

export function evaluateAgentTriggerRuntime(opts: {
  source: AgentTriggerSource
  triggerMode: AgentTriggerMode
  action: AgentAutonomyAction
  automationSettings?: unknown
  liveMode: boolean
  confidence?: number | null
  recipientCount?: number | null
  membershipSignal?: 'strong' | 'weak' | 'missing'
}): AgentTriggerRuntime {
  const confidence = typeof opts.confidence === 'number' ? opts.confidence : null
  const recipientCount = typeof opts.recipientCount === 'number' ? opts.recipientCount : null
  const membershipSignal = opts.membershipSignal || 'missing'

  return {
    source: opts.source,
    triggerMode: opts.triggerMode,
    liveMode: opts.liveMode,
    action: opts.action,
    confidence,
    recipientCount,
    membershipSignal,
    decision: evaluateAgentAutonomy({
      action: opts.action,
      automationSettings: opts.automationSettings,
      liveMode: opts.liveMode,
      confidence,
      recipientCount,
      membershipSignal,
    }),
  }
}

export function buildAgentTriggerReasoning(
  runtime: AgentTriggerRuntime,
  extraReasoning?: Record<string, unknown>,
  actual?: {
    outcome?: AgentAutonomyOutcome
    reasons?: string[]
  },
) {
  const outcome = actual?.outcome || runtime.decision.outcome
  const reasons = actual?.reasons || runtime.decision.reasons

  return {
    source: runtime.source,
    autoApproved: outcome === 'auto',
    autonomy: runtime.decision,
    triggerRuntime: {
      source: runtime.source,
      triggerMode: runtime.triggerMode,
      liveMode: runtime.liveMode,
      action: runtime.action,
      confidence: runtime.confidence,
      recipientCount: runtime.recipientCount,
      membershipSignal: runtime.membershipSignal,
      configuredMode: runtime.decision.configuredMode,
      policyOutcome: runtime.decision.outcome,
      policyReasons: runtime.decision.reasons,
      outcome,
      reasons,
    },
    ...(extraReasoning || {}),
  }
}
