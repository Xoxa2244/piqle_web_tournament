import type { AdvisorProgrammingRequestSpec } from './advisor-programming'

export const PROGRAMMING_IQ_PRESET_IDS = [
  'FOLLOW_MEMBER_DEMAND',
  'FILL_IDLE_HOURS',
  'PROTECT_AUDIENCE',
  'BALANCE_THE_WEEK',
  'TEST_NEW_IDEAS',
] as const

export type ProgrammingStrategyPresetId =
  (typeof PROGRAMMING_IQ_PRESET_IDS)[number]

export type ProgrammingStrategyGoalId =
  | 'demandFit'
  | 'utilization'
  | 'audienceProtection'
  | 'portfolioBalance'
  | 'operationalFit'
  | 'adminIntent'

export type ProgrammingRequestPriority = 'normal' | 'priority'

export type ProgrammingRequestVerdict =
  | 'strong_fit'
  | 'viable_with_risks'
  | 'weak_idea'
  | 'not_recommended'

export type ProgrammingGoalWeights = Record<ProgrammingStrategyGoalId, number>

export type ProgrammingPresetDefinition = {
  id: ProgrammingStrategyPresetId
  label: string
  description: string
  goalDeltas: Partial<ProgrammingGoalWeights>
  keywords: string[]
}

export type ProgrammingAppliedPreset = {
  id: ProgrammingStrategyPresetId
  label: string
  description: string
  source: 'selected' | 'inferred'
}

export type ProgrammingStrategyProfile = {
  goalWeights: ProgrammingGoalWeights
  appliedPresets: ProgrammingAppliedPreset[]
  selectedPresetIds: ProgrammingStrategyPresetId[]
  inferredPresetIds: ProgrammingStrategyPresetId[]
  requestPriority: ProgrammingRequestPriority
}

export type ProgrammingRequestEvaluation = {
  verdict: ProgrammingRequestVerdict
  label: string
  summary: string
  reasons: string[]
  score: number
}

const BASE_GOAL_WEIGHTS: ProgrammingGoalWeights = {
  demandFit: 24,
  utilization: 18,
  audienceProtection: 18,
  portfolioBalance: 14,
  operationalFit: 18,
  adminIntent: 0,
}

const PRESET_DEFINITIONS: ProgrammingPresetDefinition[] = [
  {
    id: 'FOLLOW_MEMBER_DEMAND',
    label: 'Follow member demand',
    description: 'Prioritize sessions that best match proven player demand.',
    goalDeltas: { demandFit: 10, portfolioBalance: 4 },
    keywords: ['demand', 'popular', 'members want', 'best demand', 'highest demand'],
  },
  {
    id: 'FILL_IDLE_HOURS',
    label: 'Fill idle hours',
    description: 'Focus on empty court time and improve court utilization.',
    goalDeltas: { utilization: 12, operationalFit: 4 },
    keywords: ['idle', 'empty', 'utilization', 'morning', 'weekday morning', 'fill'],
  },
  {
    id: 'PROTECT_AUDIENCE',
    label: 'Protect audience',
    description: 'Avoid over-targeting the same players and reduce overlap.',
    goalDeltas: { audienceProtection: 14, portfolioBalance: 4 },
    keywords: ['overlap', 'saturation', 'protect', 'same players', 'avoid spam', 'audience'],
  },
  {
    id: 'BALANCE_THE_WEEK',
    label: 'Balance the week',
    description: 'Keep a healthier mix of skill levels, formats, and times.',
    goalDeltas: { portfolioBalance: 12, demandFit: 4 },
    keywords: ['balance', 'mix', 'variety', 'week', 'spread'],
  },
  {
    id: 'TEST_NEW_IDEAS',
    label: 'Test new ideas',
    description: 'Allow more experimental slots when you want to explore demand.',
    goalDeltas: { utilization: 8, adminIntent: 6, demandFit: -4 },
    keywords: ['test', 'experiment', 'try', 'new idea', 'new ideas'],
  },
]

const PRESET_BY_ID = new Map(
  PRESET_DEFINITIONS.map((preset) => [preset.id, preset]),
)

export function getProgrammingStrategyPresets() {
  return PRESET_DEFINITIONS
}

export function isProgrammingStrategyPresetId(
  value: string,
): value is ProgrammingStrategyPresetId {
  return PRESET_BY_ID.has(value as ProgrammingStrategyPresetId)
}

export function inferProgrammingStrategyPresetsFromPrompt(
  prompt: string,
): ProgrammingStrategyPresetId[] {
  const normalized = prompt.trim().toLowerCase()
  if (!normalized) return []

  const matches = new Set<ProgrammingStrategyPresetId>()
  for (const preset of PRESET_DEFINITIONS) {
    if (preset.keywords.some((keyword) => normalized.includes(keyword))) {
      matches.add(preset.id)
    }
  }

  if ((normalized.includes('morning') || normalized.includes('afternoon')) && normalized.includes('more')) {
    matches.add('FILL_IDLE_HOURS')
  }
  if (normalized.includes('beginner') || normalized.includes('advanced') || normalized.includes('all levels')) {
    matches.add('BALANCE_THE_WEEK')
  }
  if (normalized.includes('open play') || normalized.includes('clinic') || normalized.includes('drill')) {
    matches.add('FOLLOW_MEMBER_DEMAND')
  }

  return Array.from(matches).slice(0, 3)
}

export function computeProgrammingStrategyProfile(opts: {
  selectedPresetIds?: ProgrammingStrategyPresetId[]
  inferredPresetIds?: ProgrammingStrategyPresetId[]
  hasRequest: boolean
  prioritizeRequest?: boolean
}): ProgrammingStrategyProfile {
  const selectedPresetIds = dedupePresetIds(opts.selectedPresetIds || [])
  const inferredPresetIds = dedupePresetIds(opts.inferredPresetIds || []).filter(
    (id) => !selectedPresetIds.includes(id),
  )

  const weights: ProgrammingGoalWeights = { ...BASE_GOAL_WEIGHTS }
  const appliedPresets: ProgrammingAppliedPreset[] = []

  for (const presetId of selectedPresetIds) {
    const preset = PRESET_BY_ID.get(presetId)
    if (!preset) continue
    applyGoalDeltas(weights, preset.goalDeltas)
    appliedPresets.push({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      source: 'selected',
    })
  }

  for (const presetId of inferredPresetIds) {
    const preset = PRESET_BY_ID.get(presetId)
    if (!preset) continue
    applyGoalDeltas(weights, preset.goalDeltas)
    appliedPresets.push({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      source: 'inferred',
    })
  }

  const requestPriority: ProgrammingRequestPriority =
    opts.hasRequest && opts.prioritizeRequest ? 'priority' : 'normal'

  if (opts.hasRequest) {
    weights.adminIntent += opts.prioritizeRequest ? 16 : 8
    weights.demandFit += opts.prioritizeRequest ? 2 : 0
  }

  return {
    goalWeights: normalizeGoalWeights(weights),
    appliedPresets,
    selectedPresetIds,
    inferredPresetIds,
    requestPriority,
  }
}

export function describeProgrammingRequestPriority(
  priority: ProgrammingRequestPriority,
) {
  return priority === 'priority'
    ? 'Treating your request as a stronger priority, within safety limits.'
    : 'Your request is included and scored normally against the week.'
}

export function buildProgrammingRequestEvaluation(input: {
  placed: boolean
  confidence: number
  projectedOccupancy: number
  warningCount: number
  hasHighConflict: boolean
  hasMediumConflict: boolean
  reasons: string[]
}): ProgrammingRequestEvaluation {
  let score = 0
  score += clamp(input.confidence, 0, 100) * 0.45
  score += clamp(input.projectedOccupancy, 0, 100) * 0.35
  score += input.placed ? 14 : -18
  score -= input.warningCount * 6
  if (input.hasHighConflict) score -= 14
  else if (input.hasMediumConflict) score -= 7
  score = clamp(Math.round(score), 0, 100)

  if (input.placed && input.warningCount === 0 && !input.hasMediumConflict && score >= 72) {
    return {
      verdict: 'strong_fit',
      label: 'Strong fit',
      summary: 'Requested idea fits the week well and can be placed cleanly.',
      reasons: input.reasons,
      score,
    }
  }

  if (score >= 56 && !input.hasHighConflict) {
    return {
      verdict: 'viable_with_risks',
      label: 'Viable with risks',
      summary: input.placed
        ? 'Requested idea can work, but it carries noticeable tradeoffs.'
        : 'Requested idea is reasonable, but this week makes it harder to place cleanly.',
      reasons: input.reasons,
      score,
    }
  }

  if (score >= 40) {
    return {
      verdict: 'weak_idea',
      label: 'Weak idea',
      summary: 'Requested idea is possible, but demand or week fit looks weaker than the main options.',
      reasons: input.reasons,
      score,
    }
  }

  return {
    verdict: 'not_recommended',
    label: 'Not recommended',
    summary: 'Requested idea conflicts with this week’s efficiency or audience health.',
    reasons: input.reasons,
    score,
  }
}

export function scoreProgrammingRequestMatch(
  proposal: {
    dayOfWeek: string
    timeSlot: string
    startTime: string
    format: string
    skillLevel: string
  },
  request: AdvisorProgrammingRequestSpec | null | undefined,
): number {
  if (!request) return 0
  let score = 0
  const requestedDays = request.dayOfWeeks?.length
    ? request.dayOfWeeks
    : request.dayOfWeek
      ? [request.dayOfWeek]
      : []

  if (requestedDays.length > 0 && requestedDays.includes(proposal.dayOfWeek as any)) score += 32
  if (request.timeSlot && request.timeSlot === proposal.timeSlot) score += 22
  if (request.startTime && request.startTime === proposal.startTime) score += 12
  if (request.format && request.format === proposal.format) score += 20
  if (request.skillLevel && request.skillLevel === proposal.skillLevel) score += 14
  return clamp(score, 0, 100)
}

function dedupePresetIds(ids: ProgrammingStrategyPresetId[]) {
  return Array.from(new Set(ids)).filter(isProgrammingStrategyPresetId)
}

function applyGoalDeltas(
  target: ProgrammingGoalWeights,
  deltas: Partial<ProgrammingGoalWeights>,
) {
  for (const [key, delta] of Object.entries(deltas) as Array<
    [ProgrammingStrategyGoalId, number | undefined]
  >) {
    if (!delta) continue
    target[key] += delta
  }
}

function normalizeGoalWeights(weights: ProgrammingGoalWeights) {
  const safe: ProgrammingGoalWeights = {
    demandFit: Math.max(0, weights.demandFit),
    utilization: Math.max(0, weights.utilization),
    audienceProtection: Math.max(0, weights.audienceProtection),
    portfolioBalance: Math.max(0, weights.portfolioBalance),
    operationalFit: Math.max(0, weights.operationalFit),
    adminIntent: Math.max(0, weights.adminIntent),
  }
  const total = Object.values(safe).reduce((sum, value) => sum + value, 0)
  if (total <= 0) return { ...BASE_GOAL_WEIGHTS }

  return {
    demandFit: roundWeight((safe.demandFit / total) * 100),
    utilization: roundWeight((safe.utilization / total) * 100),
    audienceProtection: roundWeight((safe.audienceProtection / total) * 100),
    portfolioBalance: roundWeight((safe.portfolioBalance / total) * 100),
    operationalFit: roundWeight((safe.operationalFit / total) * 100),
    adminIntent: roundWeight((safe.adminIntent / total) * 100),
  }
}

function roundWeight(value: number) {
  return Math.round(value * 10) / 10
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
