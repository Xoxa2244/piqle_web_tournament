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

export type ProgrammingBehaviorProfile = {
  selectionScoreFloor: number
  experimentalScoreFloor: number
  maxExperimentalSlots: number
  fillGapMinDemand: number
  existingSlotMinOccupancy: number
  noSupplyHistoricalScore: number
  offPeakExplorationBonus: number
  emptyWindowExplorationBonus: number
  saturationCapMultiplier: number
  sameFormatSkillPenalty: number
  sameFormatSkillExtraPenalty: number
  sameFormatPenalty: number
  sameWindowPenalty: number
  primeOpenPlayPenalty: number
  portfolioPenaltyMultiplier: number
  secondCourtDuplicationThreshold: number
}

export type ProgrammingPresetDefinition = {
  id: ProgrammingStrategyPresetId
  label: string
  description: string
  goalDeltas: Partial<ProgrammingGoalWeights>
  behaviorDeltas: Partial<ProgrammingBehaviorProfile>
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
  behaviorProfile: ProgrammingBehaviorProfile
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

const BASE_BEHAVIOR_PROFILE: ProgrammingBehaviorProfile = {
  selectionScoreFloor: 62,
  experimentalScoreFloor: 56,
  maxExperimentalSlots: 0,
  fillGapMinDemand: 3,
  existingSlotMinOccupancy: 68,
  noSupplyHistoricalScore: 50,
  offPeakExplorationBonus: 0,
  emptyWindowExplorationBonus: 0,
  saturationCapMultiplier: 1,
  sameFormatSkillPenalty: 10,
  sameFormatSkillExtraPenalty: 14,
  sameFormatPenalty: 6,
  sameWindowPenalty: 22,
  primeOpenPlayPenalty: 12,
  portfolioPenaltyMultiplier: 1,
  secondCourtDuplicationThreshold: 92,
}

const PRESET_DEFINITIONS: ProgrammingPresetDefinition[] = [
  {
    id: 'FOLLOW_MEMBER_DEMAND',
    label: 'Follow member demand',
    description: 'Prioritize sessions that best match proven player demand.',
    goalDeltas: { demandFit: 12, portfolioBalance: 4 },
    behaviorDeltas: {
      selectionScoreFloor: 3,
      fillGapMinDemand: 1,
      existingSlotMinOccupancy: 4,
      noSupplyHistoricalScore: -3,
      saturationCapMultiplier: -0.05,
      secondCourtDuplicationThreshold: -2,
    },
    keywords: ['demand', 'popular', 'members want', 'best demand', 'highest demand'],
  },
  {
    id: 'FILL_IDLE_HOURS',
    label: 'Fill idle hours',
    description: 'Focus on empty court time and improve court utilization.',
    goalDeltas: { utilization: 12, operationalFit: 4 },
    behaviorDeltas: {
      selectionScoreFloor: -2,
      experimentalScoreFloor: -2,
      maxExperimentalSlots: 3,
      fillGapMinDemand: -1,
      existingSlotMinOccupancy: -8,
      noSupplyHistoricalScore: 4,
      offPeakExplorationBonus: 6,
      emptyWindowExplorationBonus: 4,
      saturationCapMultiplier: 0.12,
    },
    keywords: ['idle', 'empty', 'utilization', 'morning', 'weekday morning', 'fill'],
  },
  {
    id: 'PROTECT_AUDIENCE',
    label: 'Protect audience',
    description: 'Avoid over-targeting the same players and reduce overlap.',
    goalDeltas: { audienceProtection: 14, portfolioBalance: 4 },
    behaviorDeltas: {
      selectionScoreFloor: 1,
      saturationCapMultiplier: -0.12,
      sameWindowPenalty: 8,
      sameFormatSkillPenalty: 4,
      sameFormatSkillExtraPenalty: 6,
      primeOpenPlayPenalty: 6,
      portfolioPenaltyMultiplier: 0.18,
      secondCourtDuplicationThreshold: 4,
    },
    keywords: ['overlap', 'saturation', 'protect', 'same players', 'avoid spam', 'audience'],
  },
  {
    id: 'BALANCE_THE_WEEK',
    label: 'Balance the week',
    description: 'Keep a healthier mix of skill levels, formats, and times.',
    goalDeltas: { portfolioBalance: 12, demandFit: 4 },
    behaviorDeltas: {
      // Original deltas pushed *duplicates* below floor (good) but
      // didn't surface non-Open-Play alternatives on Open-Play-dominant
      // clubs (bad — the preset became "fewer Open Play" instead of
      // "balanced mix"). Tune (2026-05-01): give DRILL/CLINIC/SOCIAL
      // candidates a synthetic baseline score and a small experimental
      // budget so balance can actually surface diverse formats even
      // when historical demand is moderate.
      selectionScoreFloor: 1,
      experimentalScoreFloor: -2,
      maxExperimentalSlots: 2,
      noSupplyHistoricalScore: 6,
      sameFormatSkillPenalty: 4,
      sameFormatSkillExtraPenalty: 6,
      sameFormatPenalty: 4,
      primeOpenPlayPenalty: 8,
      portfolioPenaltyMultiplier: 0.18,
    },
    keywords: ['balance', 'mix', 'variety', 'week', 'spread'],
  },
  {
    id: 'TEST_NEW_IDEAS',
    label: 'Test new ideas',
    description: 'Allow more experimental slots when you want to explore demand.',
    goalDeltas: { utilization: 8, portfolioBalance: 2, demandFit: -6 },
    behaviorDeltas: {
      selectionScoreFloor: -4,
      experimentalScoreFloor: -4,
      maxExperimentalSlots: 4,
      fillGapMinDemand: -1,
      existingSlotMinOccupancy: -10,
      noSupplyHistoricalScore: 6,
      offPeakExplorationBonus: 8,
      emptyWindowExplorationBonus: 6,
      saturationCapMultiplier: 0.2,
    },
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
  const behaviorProfile: ProgrammingBehaviorProfile = { ...BASE_BEHAVIOR_PROFILE }
  const appliedPresets: ProgrammingAppliedPreset[] = []

  for (const presetId of selectedPresetIds) {
    const preset = PRESET_BY_ID.get(presetId)
    if (!preset) continue
    applyGoalDeltas(weights, preset.goalDeltas)
    applyBehaviorDeltas(behaviorProfile, preset.behaviorDeltas)
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
    applyBehaviorDeltas(behaviorProfile, preset.behaviorDeltas)
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
    // adminIntent boost matches the design doc: +8 for a regular
    // request, +16 when admin explicitly toggled "Treat as priority".
    weights.adminIntent += opts.prioritizeRequest ? 16 : 8
    // Intentional deviation from the doc (which only describes
    // adminIntent boosts): when admin marks the request as priority,
    // we also nudge demandFit by +2. Rationale — a priority request is
    // by definition something the admin believes responds to demand
    // (otherwise they wouldn't escalate it). Without this nudge, an
    // explicit priority request can lose ranking to a generic
    // expand_peak proposal that scores high on operationalFit alone.
    // Keep the bump small (+2) so it doesn't override audience
    // protection. If product wants strict doc-fidelity, drop this line.
    weights.demandFit += opts.prioritizeRequest ? 2 : 0
  }

  return {
    goalWeights: normalizeGoalWeights(weights),
    behaviorProfile: normalizeBehaviorProfile(behaviorProfile),
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

function applyBehaviorDeltas(
  target: ProgrammingBehaviorProfile,
  deltas: Partial<ProgrammingBehaviorProfile>,
) {
  for (const [key, delta] of Object.entries(deltas) as Array<
    [keyof ProgrammingBehaviorProfile, number | undefined]
  >) {
    if (typeof delta !== 'number') continue
    ;(target as Record<keyof ProgrammingBehaviorProfile, number>)[key] += delta
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

function normalizeBehaviorProfile(profile: ProgrammingBehaviorProfile): ProgrammingBehaviorProfile {
  return {
    selectionScoreFloor: clamp(Math.round(profile.selectionScoreFloor), 52, 72),
    experimentalScoreFloor: clamp(Math.round(profile.experimentalScoreFloor), 48, 68),
    maxExperimentalSlots: clamp(Math.round(profile.maxExperimentalSlots), 0, 6),
    fillGapMinDemand: clamp(Math.round(profile.fillGapMinDemand), 1, 5),
    existingSlotMinOccupancy: clamp(Math.round(profile.existingSlotMinOccupancy), 50, 80),
    noSupplyHistoricalScore: clamp(Math.round(profile.noSupplyHistoricalScore), 45, 65),
    offPeakExplorationBonus: clamp(Math.round(profile.offPeakExplorationBonus), 0, 12),
    emptyWindowExplorationBonus: clamp(Math.round(profile.emptyWindowExplorationBonus), 0, 12),
    saturationCapMultiplier: clamp(roundBehavior(profile.saturationCapMultiplier), 0.8, 1.3),
    sameFormatSkillPenalty: clamp(Math.round(profile.sameFormatSkillPenalty), 6, 20),
    sameFormatSkillExtraPenalty: clamp(Math.round(profile.sameFormatSkillExtraPenalty), 8, 24),
    sameFormatPenalty: clamp(Math.round(profile.sameFormatPenalty), 3, 14),
    sameWindowPenalty: clamp(Math.round(profile.sameWindowPenalty), 12, 34),
    primeOpenPlayPenalty: clamp(Math.round(profile.primeOpenPlayPenalty), 6, 24),
    portfolioPenaltyMultiplier: clamp(roundBehavior(profile.portfolioPenaltyMultiplier), 0.85, 1.3),
    secondCourtDuplicationThreshold: clamp(Math.round(profile.secondCourtDuplicationThreshold), 84, 98),
  }
}

function roundWeight(value: number) {
  return Math.round(value * 10) / 10
}

function roundBehavior(value: number) {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
