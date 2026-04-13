import {
  evaluateAgentAutonomy,
  mapOutreachTypeToAutonomyAction,
  resolveAgentAutonomyPolicy,
  type AgentAutonomyAction,
  type AgentAutonomyMode,
} from '@/lib/ai/agent-autonomy'
import type {
  MembershipSignal,
  NormalizedMembershipStatus,
  NormalizedMembershipType,
} from '@/types/intelligence'

export interface AgentPolicySimulationItem {
  id: string
  type: string
  currentOutcome?: 'auto' | 'pending' | 'blocked' | 'other' | null
  confidence?: number | null
  recipientCount?: number | null
  membershipSignal?: MembershipSignal | null
  membershipStatus?: NormalizedMembershipStatus | null
  membershipType?: NormalizedMembershipType | null
  membershipConfidence?: number | null
}

export interface AgentPolicyScenario {
  action: AgentAutonomyAction
  currentMode: AgentAutonomyMode
  simulatedMode: 'auto'
  consideredCount: number
  autoGain: number
  stillPending: number
  stillBlocked: number
  topReasons: Array<{ label: string; count: number }>
  requiresLiveMode: boolean
}

function topEntries(map: Map<string, number>, limit = 3) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }))
}

function withActionMode(automationSettings: unknown, action: AgentAutonomyAction, mode: AgentAutonomyMode) {
  const existing = (automationSettings && typeof automationSettings === 'object' ? automationSettings as Record<string, any> : {}) || {}
  const intelligence = (existing.intelligence && typeof existing.intelligence === 'object' ? existing.intelligence : {}) || {}
  const autonomyPolicy = (intelligence.autonomyPolicy && typeof intelligence.autonomyPolicy === 'object' ? intelligence.autonomyPolicy : {}) || {}

  return {
    ...existing,
    intelligence: {
      ...intelligence,
      autonomyPolicy: {
        ...autonomyPolicy,
        [action]: {
          ...(autonomyPolicy[action] || {}),
          mode,
        },
      },
    },
  }
}

export function buildAgentPolicyScenarios(opts: {
  items: AgentPolicySimulationItem[]
  automationSettings?: unknown
  liveMode: boolean
}): AgentPolicyScenario[] {
  const deduped = new Map<string, AgentPolicySimulationItem>()
  for (const item of opts.items) {
    if (!deduped.has(item.id)) deduped.set(item.id, item)
  }

  const currentPolicy = resolveAgentAutonomyPolicy(opts.automationSettings)
  const scenarios: AgentPolicyScenario[] = []

  const actions: AgentAutonomyAction[] = ['welcome', 'slotFiller', 'checkIn', 'retentionBoost', 'reactivation']
  for (const action of actions) {
    const currentMode = currentPolicy[action].mode
    if (currentMode === 'auto') continue

    const actionItems = Array.from(deduped.values()).filter((item) => mapOutreachTypeToAutonomyAction(item.type) === action)
    if (actionItems.length === 0) continue

    const simulatedSettings = withActionMode(opts.automationSettings, action, 'auto')
    const reasonCounts = new Map<string, number>()
    let autoGain = 0
    let stillPending = 0
    let stillBlocked = 0

    for (const item of actionItems) {
      const simulated = evaluateAgentAutonomy({
        action,
        automationSettings: simulatedSettings,
        liveMode: true,
        confidence: item.confidence ?? null,
        recipientCount: item.recipientCount ?? null,
        membershipSignal: item.membershipSignal ?? 'missing',
        membershipStatus: item.membershipStatus ?? null,
        membershipType: item.membershipType ?? null,
        membershipConfidence: item.membershipConfidence ?? null,
      })

      if (simulated.outcome === 'auto') {
        if (item.currentOutcome !== 'auto') autoGain += 1
        continue
      }

      if (simulated.outcome === 'pending') stillPending += 1
      if (simulated.outcome === 'blocked') stillBlocked += 1
      for (const reason of simulated.reasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1)
      }
    }

    scenarios.push({
      action,
      currentMode,
      simulatedMode: 'auto',
      consideredCount: actionItems.length,
      autoGain,
      stillPending,
      stillBlocked,
      topReasons: topEntries(reasonCounts),
      requiresLiveMode: !opts.liveMode,
    })
  }

  return scenarios
    .filter((scenario) => scenario.autoGain > 0 || scenario.stillPending > 0 || scenario.stillBlocked > 0)
    .sort((a, b) => {
      if (b.autoGain !== a.autoGain) return b.autoGain - a.autoGain
      return b.consideredCount - a.consideredCount
    })
}
