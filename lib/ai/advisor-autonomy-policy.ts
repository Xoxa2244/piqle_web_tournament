import { z } from 'zod'
import {
  agentAutonomyPolicySchema,
  resolveAgentAutonomyPolicy,
  type AgentAutonomyAction,
  type AgentAutonomyMode,
} from './agent-autonomy'

const ALL_AUTONOMY_ACTIONS: AgentAutonomyAction[] = [
  'welcome',
  'slotFiller',
  'checkIn',
  'retentionBoost',
  'reactivation',
  'trialFollowUp',
  'renewalReactivation',
]

const ACTION_LABELS: Record<AgentAutonomyAction, string> = {
  welcome: 'Welcome',
  slotFiller: 'Slot filler',
  checkIn: 'Check-in',
  retentionBoost: 'Retention boost',
  reactivation: 'Reactivation',
  trialFollowUp: 'Trial follow-up',
  renewalReactivation: 'Renewal outreach',
}

const ACTION_PATTERNS: Record<AgentAutonomyAction, RegExp[]> = {
  welcome: [
    /\bwelcome\b/,
    /\bnew member(?:s)?\b/,
    /\bonboarding\b/,
    /\bприветств\w+\b/,
    /\bнов(ых|ые|ый)\s+участник\w+\b/,
  ],
  slotFiller: [
    /\bslot filler\b/,
    /\bfill session\b/,
    /\bunderfilled\b/,
    /\bopen spots?\b/,
    /\bнедозаполн\w+\s+сесси\w+\b/,
    /\bзаполн(ение|ять)\s+сесси\w+\b/,
  ],
  checkIn: [
    /\bcheck[- ]?in\b/,
    /\bchecking in\b/,
    /\bчек-?ин\b/,
    /\bпроверочн\w+\s+сообщени\w+\b/,
  ],
  retentionBoost: [
    /\bretention boost\b/,
    /\bat-risk\b/,
    /\bwatch\b/,
    /\bretention\b/,
    /\bудержан\w+\b/,
    /\bриск\w+\b/,
  ],
  reactivation: [
    /\breactivat\w*\b/,
    /\bwin[- ]?back\b/,
    /\bbring back\b/,
    /\blapsed members?\b/,
    /\bнеактивн\w+\b/,
    /\bреактивац\w+\b/,
  ],
  trialFollowUp: [
    /\btrial follow[- ]?up\b/,
    /\bfirst[- ]?play\b/,
    /\bfirst booking\b/,
    /\btrial members?\b/,
    /\bтриал\w*\b/,
    /\bперв\w+\s+бронирован\w+\b/,
  ],
  renewalReactivation: [
    /\brenewal(?: outreach)?\b/,
    /\bexpir\w+\s+membership\b/,
    /\bexpired members?\b/,
    /\brenew\b/,
    /\bпродлен\w+\b/,
    /\bистек\w+\s+membership\b/,
    /\brenewal reactivation\b/,
  ],
}

const ALL_ACTION_PATTERNS = [
  /\b(all actions?|everything|whole autopilot|entire autopilot|full autopilot|all outreach)\b/,
  /\ball\s+autopilot\s+actions\b/,
  /\b(все действия|весь автопилот|всю автоматику|все авто-?действия)\b/,
]

export const advisorAutonomyPolicyDraftSchema = agentAutonomyPolicySchema.extend({
  changes: z.array(z.string().min(1).max(200)).max(12).default([]),
})

export type AdvisorAutonomyPolicyDraft = z.infer<typeof advisorAutonomyPolicyDraftSchema>

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

function formatModeLabel(mode: AgentAutonomyMode) {
  if (mode === 'auto') return 'Auto'
  if (mode === 'off') return 'Off'
  return 'Needs approval'
}

function formatRuleSummary(action: AgentAutonomyAction, policy: AdvisorAutonomyPolicyDraft) {
  const rule = policy[action]
  const details = [
    formatModeLabel(rule.mode),
    `confidence ${rule.minConfidenceAuto ?? 'n/a'}+`,
    `max ${rule.maxRecipientsAuto ?? 'n/a'} auto`,
    rule.requireMembershipSignal ? 'strong membership required' : 'membership signal optional',
  ]
  return `${ACTION_LABELS[action]}: ${details.join(' · ')}`
}

function buildPolicyChanges(previous: AdvisorAutonomyPolicyDraft, next: AdvisorAutonomyPolicyDraft) {
  return ALL_AUTONOMY_ACTIONS
    .filter((action) => JSON.stringify(previous[action]) !== JSON.stringify(next[action]))
    .map((action) => formatRuleSummary(action, next))
    .slice(0, 12)
}

function clonePolicy(policy: AdvisorAutonomyPolicyDraft): AdvisorAutonomyPolicyDraft {
  return {
    welcome: { ...policy.welcome },
    slotFiller: { ...policy.slotFiller },
    checkIn: { ...policy.checkIn },
    retentionBoost: { ...policy.retentionBoost },
    reactivation: { ...policy.reactivation },
    trialFollowUp: { ...policy.trialFollowUp },
    renewalReactivation: { ...policy.renewalReactivation },
    changes: [...policy.changes],
  }
}

function extractActionSnippet(message: string, action: AgentAutonomyAction) {
  const delimiters = [',', ';', ' and ', ' but ', ' then ', ' и ', ' но ', ' y ']

  for (const pattern of ACTION_PATTERNS[action]) {
    const match = pattern.exec(message)
    if (!match || typeof match.index !== 'number') continue
    let start = 0
    let end = message.length

    for (const delimiter of delimiters) {
      const previous = message.lastIndexOf(delimiter, match.index)
      if (previous >= 0) start = Math.max(start, previous + delimiter.length)
      const next = message.indexOf(delimiter, match.index + match[0].length)
      if (next >= 0) end = Math.min(end, next)
    }

    start = Math.max(0, start)
    if (end === message.length) {
      end = Math.min(message.length, match.index + match[0].length + 40)
    }
    return message.slice(start, end)
  }
  return message
}

function collectTargetActions(message: string) {
  if (containsAny(message, ALL_ACTION_PATTERNS)) return [...ALL_AUTONOMY_ACTIONS]

  const targets = ALL_AUTONOMY_ACTIONS.filter((action) => containsAny(message, ACTION_PATTERNS[action]))
  return targets
}

function parseMode(message: string): AgentAutonomyMode | null {
  const lower = message.toLowerCase()

  if (containsAny(lower, [
    /\b(off|turn off|disable|disabled|manual only|never auto|block(?:ed)?|stop auto)\b/,
    /\b(выключи|отключи|без авто|только вручную|никогда автоматически)\b/,
  ])) return 'off'

  if (containsAny(lower, [
    /\b(auto|automatic|automatically|run automatically|send automatically)\b/,
    /\b(авто|автоматическ\w+)\b/,
  ])) return 'auto'

  if (containsAny(lower, [
    /\b(approve|approval|manual review|manual approval|pending review|human review)\b/,
    /\b(аппрув|подтвержден\w+|ручн\w+\s+провер\w+|ручн\w+\s+аппрув)\b/,
  ])) return 'approve'

  return null
}

function parseConfidenceThreshold(message: string) {
  const lower = message.toLowerCase()
  const match =
    lower.match(/\b(?:min(?:imum)?|at least|confidence(?: threshold)?|threshold(?: of)?|above)\s*(\d{1,3})\s*%?\b/) ||
    lower.match(/\b(\d{1,3})\s*%\s*confidence\b/) ||
    lower.match(/\b(\d{1,3})\s*%\s*уверенност\w+\b/) ||
    lower.match(/\bуверенност\w+\s*(\d{1,3})\b/)
  if (!match) return null
  return clampInt(match[1], 0, 100, 80)
}

function parseMaxRecipients(message: string) {
  const lower = message.toLowerCase()
  const match =
    lower.match(/\b(?:max(?:imum)?|up to|limit(?:ed)? to|only)\s*(\d{1,3})\s*(?:recipients?|members?|players?|people)\b/) ||
    lower.match(/\b(\d{1,3})\s*(?:recipients?|members?|players?|people)\s*max\b/) ||
    lower.match(/\b(?:auto(?:-send)?|automatic(?:ally)?)\s*(?:up to|for)?\s*(\d{1,3})\b/) ||
    lower.match(/\bдо\s*(\d{1,3})\s*(?:игрок\w+|участник\w+|получател\w+)\b/) ||
    lower.match(/\bмакс(?:имум)?\s*(\d{1,3})\b/)
  if (!match) return null
  return clampInt(match[1], 1, 500, 5)
}

function parseMembershipRequirement(message: string) {
  const lower = message.toLowerCase()

  if (containsAny(lower, [
    /\b(don'?t require|without requiring|ignore)\s+(?:a\s+)?membership(?: signal| data| status| type)?\b/,
    /\bбез\s+membership\b/,
    /\bне треб\w+ membership\b/,
  ])) return false

  if (containsAny(lower, [
    /\b(require|only with|only when there is)\s+(?:a\s+)?(?:strong\s+)?membership(?: signal| data| status| type)?\b/,
    /\bstrong membership\b/,
    /\bmembership signal required\b/,
    /\bтреб\w+ membership\b/,
    /\bтолько\s+с\s+membership\b/,
    /\bтолько\s+если\s+извест\w+\s+membership\b/,
  ])) return true

  return null
}

export function resolveAdvisorAutonomyPolicy(automationSettings?: unknown): AdvisorAutonomyPolicyDraft {
  return {
    ...resolveAgentAutonomyPolicy(automationSettings),
    changes: [],
  }
}

export function formatAdvisorAutonomyPolicyDigest(policy: AdvisorAutonomyPolicyDraft) {
  return [
    `Welcome ${policy.welcome.mode}`,
    `Slot filler ${policy.slotFiller.mode}`,
    `Check-in ${policy.checkIn.mode}`,
    `Retention ${policy.retentionBoost.mode}`,
    `Reactivation ${policy.reactivation.mode}`,
    `Trial follow-up ${policy.trialFollowUp.mode}`,
    `Renewal outreach ${policy.renewalReactivation.mode}`,
  ].join(' · ')
}

export function isAdvisorAutonomyPolicyRequest(message: string) {
  const lower = message.toLowerCase()
  const mentionsPolicy =
    containsAny(lower, [
      /\b(autonomy policy|autonomy matrix|autopilot|auto-?run rules?|approval matrix|approval policy)\b/,
      /\b(политик\w+ автопилота|матриц\w+ автопилота|автопилот|авто-?режим|правил\w+ аппрува)\b/,
    ]) ||
    collectTargetActions(lower).length > 0

  const wantsChange = containsAny(lower, [
    /\b(set|change|update|adjust|tighten|relax|turn|make|keep|allow|require|disable|enable|move)\b/,
    /\b(поставь|измени|обнови|настрой|сделай|оставь|разреши|требуй|выключи|включи)\b/,
  ])

  return mentionsPolicy && wantsChange
}

export function updateAdvisorAutonomyPolicyFromMessage(opts: {
  message: string
  currentPolicy: AdvisorAutonomyPolicyDraft
  allowImplicit?: boolean
}) {
  const { message, currentPolicy, allowImplicit = false } = opts
  if (!allowImplicit && !isAdvisorAutonomyPolicyRequest(message)) return null

  const lower = message.toLowerCase()
  const targets = collectTargetActions(lower)
  if (targets.length === 0) return null

  const next = clonePolicy(currentPolicy)
  const applyGlobalSettings = targets.length === 1 || containsAny(lower, ALL_ACTION_PATTERNS)
  const globalMode = applyGlobalSettings ? parseMode(lower) : null
  const globalConfidence = applyGlobalSettings ? parseConfidenceThreshold(lower) : null
  const globalMaxRecipients = applyGlobalSettings ? parseMaxRecipients(lower) : null
  const globalMembershipRequirement = applyGlobalSettings ? parseMembershipRequirement(lower) : null
  let changed = false

  for (const action of targets) {
    const snippet = extractActionSnippet(lower, action)
    const mode = parseMode(snippet) ?? globalMode
    const minConfidenceAuto = parseConfidenceThreshold(snippet) ?? globalConfidence
    const maxRecipientsAuto = parseMaxRecipients(snippet) ?? globalMaxRecipients
    const requireMembershipSignal = parseMembershipRequirement(snippet) ?? globalMembershipRequirement

    if (mode && next[action].mode !== mode) {
      next[action].mode = mode
      changed = true
    }

    if (typeof minConfidenceAuto === 'number' && next[action].minConfidenceAuto !== minConfidenceAuto) {
      next[action].minConfidenceAuto = minConfidenceAuto
      changed = true
    }

    if (typeof maxRecipientsAuto === 'number' && next[action].maxRecipientsAuto !== maxRecipientsAuto) {
      next[action].maxRecipientsAuto = maxRecipientsAuto
      changed = true
    }

    if (typeof requireMembershipSignal === 'boolean' && next[action].requireMembershipSignal !== requireMembershipSignal) {
      next[action].requireMembershipSignal = requireMembershipSignal
      changed = true
    }
  }

  if (!changed) return null

  next.changes = buildPolicyChanges(currentPolicy, next)
  if (next.changes.length === 0) return null
  return next
}
