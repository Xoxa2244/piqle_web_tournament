import 'server-only'

import type {
  DayOfWeek,
  PlaySessionFormat,
  PlaySessionSkillLevel,
  TimeSlot,
} from '@/types/intelligence'

const DAYS: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

const TIME_SLOTS: TimeSlot[] = ['morning', 'afternoon', 'evening']

type ProgrammingSessionRow = {
  title: string
  date: Date | string
  startTime: string
  endTime: string
  format: PlaySessionFormat
  skillLevel: PlaySessionSkillLevel
  maxPlayers: number
  registeredCount: number | null
}

type ProgrammingPreferenceRow = {
  preferredDays: string[]
  preferredTimeMorning: boolean
  preferredTimeAfternoon: boolean
  preferredTimeEvening: boolean
  skillLevel: PlaySessionSkillLevel
  preferredFormats: string[]
  targetSessionsPerWeek: number
  notificationsOptOut: boolean
}

type ProgrammingInterestRequestRow = {
  preferredDays: string[]
  preferredFormats: string[]
  preferredTimeSlots: unknown
  status: string
  sessionId?: string | null
}

type ProgrammingDemandSignals = {
  slotDemand: Map<string, number>
  formatDemand: Map<PlaySessionFormat, number>
  skillDemand: Map<PlaySessionSkillLevel, number>
  interestSlotDemand: Map<string, number>
  interestFormatDemand: Map<PlaySessionFormat, number>
  interestRequestCount: number
}

export type AdvisorProgrammingProposalSource = 'expand_peak' | 'fill_gap'
export type AdvisorProgrammingConflictRiskLevel = 'low' | 'medium' | 'high'

export type AdvisorProgrammingProposalConflict = {
  overlapRisk: AdvisorProgrammingConflictRiskLevel
  cannibalizationRisk: AdvisorProgrammingConflictRiskLevel
  courtPressureRisk: AdvisorProgrammingConflictRiskLevel
  overallRisk: AdvisorProgrammingConflictRiskLevel
  riskSummary: string
  warnings: string[]
  saferAlternativeId?: string
  saferAlternativeReason?: string
}

export type AdvisorProgrammingProposalDraft = {
  id: string
  title: string
  dayOfWeek: DayOfWeek
  timeSlot: TimeSlot
  startTime: string
  endTime: string
  format: PlaySessionFormat
  skillLevel: PlaySessionSkillLevel
  maxPlayers: number
  projectedOccupancy: number
  estimatedInterestedMembers: number
  confidence: number
  source: AdvisorProgrammingProposalSource
  rationale: string[]
  conflict?: AdvisorProgrammingProposalConflict
}

export type AdvisorProgrammingRequestSpec = Partial<{
  dayOfWeek: DayOfWeek
  timeSlot: TimeSlot
  startTime: string
  endTime: string
  format: PlaySessionFormat
  skillLevel: PlaySessionSkillLevel
  maxPlayers: number
}>

type ComboStat = {
  dayOfWeek: DayOfWeek
  timeSlot: TimeSlot
  format: PlaySessionFormat
  skillLevel: PlaySessionSkillLevel
  sessionCount: number
  occupancySum: number
  maxPlayersTotal: number
  registeredTotal: number
  firstStartTime: string
  firstEndTime: string
  activeDates: Set<string>
  recentSessionCount: number
  latestDateMs: number
}

type SlotSupplyStat = {
  sessionCount: number
  occupancyValues: number[]
  activeDates: Set<string>
  recentSessionCount: number
  latestDateMs: number
}

const RECENT_WINDOW_DAYS = 21

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function addDemand<T>(map: Map<T, number>, key: T, amount: number) {
  map.set(key, (map.get(key) || 0) + amount)
}

function maxMapValue<T>(map: Map<T, number>) {
  return Math.max(1, ...Array.from(map.values()), 1)
}

function riskWeight(level: AdvisorProgrammingConflictRiskLevel) {
  if (level === 'high') return 3
  if (level === 'medium') return 2
  return 1
}

function maxRiskLevel(
  ...levels: AdvisorProgrammingConflictRiskLevel[]
): AdvisorProgrammingConflictRiskLevel {
  return levels.sort((left, right) => riskWeight(right) - riskWeight(left))[0] || 'low'
}

function toDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : date.toISOString().slice(0, 10)
}

function toDayOfWeek(value: Date | string): DayOfWeek {
  const date = value instanceof Date ? value : new Date(value)
  return DAYS[(date.getUTCDay() + 6) % 7]
}

function normalizeFormat(value?: string | null): PlaySessionFormat | undefined {
  const upper = value?.toUpperCase() || ''
  if (upper.includes('CLINIC')) return 'CLINIC'
  if (upper.includes('DRILL')) return 'DRILL'
  if (upper.includes('LEAGUE')) return 'LEAGUE_PLAY'
  if (upper.includes('SOCIAL')) return 'SOCIAL'
  if (upper.includes('OPEN')) return 'OPEN_PLAY'
  return undefined
}

function normalizeSkillLevel(value?: string | null): PlaySessionSkillLevel | undefined {
  const upper = value?.toUpperCase() || ''
  if (upper.includes('BEGINNER')) return 'BEGINNER'
  if (upper.includes('INTERMEDIATE')) return 'INTERMEDIATE'
  if (upper.includes('ADVANCED') || upper.includes('COMPETITIVE')) return 'ADVANCED'
  if (upper.includes('ALL')) return 'ALL_LEVELS'
  return undefined
}

function timeSlotFromTime(startTime?: string | null): TimeSlot {
  const hour = Number(startTime?.split(':')[0] || 0)
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function defaultSlotWindow(slot: TimeSlot, format?: PlaySessionFormat) {
  if (slot === 'morning') return { startTime: '09:00', endTime: format === 'CLINIC' ? '10:30' : '10:30' }
  if (slot === 'afternoon') return { startTime: '13:00', endTime: format === 'CLINIC' ? '14:30' : '14:30' }
  return { startTime: format === 'LEAGUE_PLAY' ? '18:30' : '18:00', endTime: format === 'LEAGUE_PLAY' ? '20:30' : '19:30' }
}

function formatLabel(format: PlaySessionFormat) {
  return format
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function skillLabel(skillLevel: PlaySessionSkillLevel) {
  if (skillLevel === 'ALL_LEVELS') return 'All Levels'
  return skillLevel.charAt(0) + skillLevel.slice(1).toLowerCase()
}

function timeSlotLabel(slot: TimeSlot) {
  if (slot === 'morning') return 'Morning'
  if (slot === 'afternoon') return 'Afternoon'
  return 'Evening'
}

function buildProgrammingTitle(input: {
  dayOfWeek: DayOfWeek
  timeSlot: TimeSlot
  format: PlaySessionFormat
  skillLevel: PlaySessionSkillLevel
}) {
  const skill = input.skillLevel === 'ALL_LEVELS' ? '' : `${skillLabel(input.skillLevel)} `
  return `${input.dayOfWeek} ${timeSlotLabel(input.timeSlot)} ${skill}${formatLabel(input.format)}`.replace(/\s+/g, ' ').trim()
}

function buildProposalId(input: {
  dayOfWeek: DayOfWeek
  timeSlot: TimeSlot
  format: PlaySessionFormat
  skillLevel: PlaySessionSkillLevel
}) {
  return slugify(`${input.dayOfWeek}-${input.timeSlot}-${input.format}-${input.skillLevel}`)
}

function getRequestedMaxPlayers(format: PlaySessionFormat, explicit?: number) {
  if (explicit && explicit >= 2 && explicit <= 24) return explicit
  if (format === 'CLINIC' || format === 'DRILL') return 8
  if (format === 'LEAGUE_PLAY') return 12
  return 8
}

function parseRequestedStartTime(message: string) {
  const match = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  const meridiem = match[3].toLowerCase()

  if (meridiem === 'pm' && hour !== 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0

  const normalizedHour = clamp(hour, 0, 23)
  const normalizedMinute = clamp(minute, 0, 59)
  const startTime = `${String(normalizedHour).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`
  return {
    startTime,
    timeSlot: timeSlotFromTime(startTime),
  }
}

export function parseAdvisorProgrammingRequest(
  message: string,
  current?: AdvisorProgrammingRequestSpec | null,
): AdvisorProgrammingRequestSpec {
  const lower = message.toLowerCase()
  const next: AdvisorProgrammingRequestSpec = {
    ...(current || {}),
  }

  const day = DAYS.find((candidate) => lower.includes(candidate.toLowerCase()))
  if (day) next.dayOfWeek = day

  if (/\b(morning|before work|early)\b/.test(lower)) next.timeSlot = 'morning'
  else if (/\b(afternoon|midday|lunch)\b/.test(lower)) next.timeSlot = 'afternoon'
  else if (/\b(evening|after work|night)\b/.test(lower)) next.timeSlot = 'evening'

  const requestedTime = parseRequestedStartTime(message)
  if (requestedTime) {
    next.startTime = requestedTime.startTime
    next.timeSlot = requestedTime.timeSlot
  }

  const format = normalizeFormat(message)
  if (format) next.format = format

  const skill = normalizeSkillLevel(message)
  if (skill) next.skillLevel = skill

  const maxPlayersMatch =
    lower.match(/\bfor\s+(\d{1,2})\s+players?\b/) ||
    lower.match(/\b(\d{1,2})\s+player\s+(session|clinic|drill|league|open play)\b/)
  if (maxPlayersMatch) {
    const value = Number(maxPlayersMatch[1])
    if (Number.isInteger(value) && value >= 2 && value <= 24) next.maxPlayers = value
  }

  return next
}

function buildPreferenceDemand(preferences: ProgrammingPreferenceRow[]) {
  const slotDemand = new Map<string, number>()
  const formatDemand = new Map<PlaySessionFormat, number>()
  const skillDemand = new Map<PlaySessionSkillLevel, number>()

  for (const pref of preferences) {
    if (pref.notificationsOptOut) continue

    const weight = clamp(pref.targetSessionsPerWeek || 1, 1, 4)
    const preferredDays = pref.preferredDays
      .map((value) => DAYS.find((day) => day.toLowerCase() === String(value).toLowerCase()))
      .filter((value): value is DayOfWeek => !!value)

    const slots = [
      pref.preferredTimeMorning ? 'morning' : null,
      pref.preferredTimeAfternoon ? 'afternoon' : null,
      pref.preferredTimeEvening ? 'evening' : null,
    ].filter((value): value is TimeSlot => !!value)

    for (const dayOfWeek of preferredDays) {
      for (const slot of slots) {
        const key = `${dayOfWeek}|${slot}`
        addDemand(slotDemand, key, weight)
      }
    }

    const normalizedFormats = (pref.preferredFormats || [])
      .map((value) => normalizeFormat(value))
      .filter((value): value is PlaySessionFormat => !!value)

    for (const format of normalizedFormats) {
      addDemand(formatDemand, format, weight)
    }

    const skillLevel = pref.skillLevel || 'ALL_LEVELS'
    addDemand(skillDemand, skillLevel, weight)
  }

  return { slotDemand, formatDemand, skillDemand }
}

function getInterestRequestSlots(value: unknown): TimeSlot[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return TIME_SLOTS.filter((slot) => Boolean((value as Record<string, unknown>)[slot]))
}

function buildDemandSignals(
  preferences: ProgrammingPreferenceRow[],
  interestRequests: ProgrammingInterestRequestRow[] = [],
): ProgrammingDemandSignals {
  const { slotDemand, formatDemand, skillDemand } = buildPreferenceDemand(preferences)
  const interestSlotDemand = new Map<string, number>()
  const interestFormatDemand = new Map<PlaySessionFormat, number>()
  let interestRequestCount = 0

  for (const request of interestRequests) {
    const status = (request.status || '').toLowerCase()
    if (request.sessionId) continue
    if (['matched', 'fulfilled', 'completed', 'closed', 'cancelled'].includes(status)) continue

    const weight = status === 'notified' ? 1.5 : 2
    const preferredDays = (request.preferredDays || [])
      .map((value) => DAYS.find((day) => day.toLowerCase() === String(value).toLowerCase()))
      .filter((value): value is DayOfWeek => !!value)
    const slots = getInterestRequestSlots(request.preferredTimeSlots)
    const fallbackSlots = slots.length > 0 ? slots : TIME_SLOTS
    const normalizedFormats = (request.preferredFormats || [])
      .map((value) => normalizeFormat(value))
      .filter((value): value is PlaySessionFormat => !!value)

    if (preferredDays.length === 0) continue

    interestRequestCount += 1

    for (const dayOfWeek of preferredDays) {
      for (const slot of fallbackSlots) {
        const key = `${dayOfWeek}|${slot}`
        addDemand(slotDemand, key, weight)
        addDemand(interestSlotDemand, key, weight)
      }
    }

    for (const format of normalizedFormats) {
      addDemand(formatDemand, format, weight)
      addDemand(interestFormatDemand, format, weight)
    }
  }

  return {
    slotDemand,
    formatDemand,
    skillDemand,
    interestSlotDemand,
    interestFormatDemand,
    interestRequestCount,
  }
}

function buildSessionStats(sessions: ProgrammingSessionRow[]) {
  const comboStats = new Map<string, ComboStat>()
  const slotSupply = new Map<string, SlotSupplyStat>()
  const recentThreshold = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000

  for (const session of sessions) {
    const dayOfWeek = toDayOfWeek(session.date)
    const dateKey = toDateKey(session.date)
    const sessionDate = session.date instanceof Date ? session.date : new Date(session.date)
    const sessionDateMs = Number.isNaN(sessionDate.getTime()) ? Date.now() : sessionDate.getTime()
    const timeSlot = timeSlotFromTime(session.startTime)
    const occupancy = clamp(
      Math.round(((session.registeredCount || 0) / Math.max(session.maxPlayers || 1, 1)) * 100),
      0,
      100,
    )
    const isRecent = sessionDateMs >= recentThreshold
    const comboKey = `${dayOfWeek}|${timeSlot}|${session.format}|${session.skillLevel}`
    const existingCombo = comboStats.get(comboKey)

    if (existingCombo) {
      existingCombo.sessionCount += 1
      existingCombo.occupancySum += occupancy
      existingCombo.maxPlayersTotal += session.maxPlayers || 0
      existingCombo.registeredTotal += session.registeredCount || 0
      existingCombo.activeDates.add(dateKey)
      existingCombo.recentSessionCount += isRecent ? 1 : 0
      existingCombo.latestDateMs = Math.max(existingCombo.latestDateMs, sessionDateMs)
    } else {
      comboStats.set(comboKey, {
        dayOfWeek,
        timeSlot,
        format: session.format,
        skillLevel: session.skillLevel,
        sessionCount: 1,
        occupancySum: occupancy,
        maxPlayersTotal: session.maxPlayers || 0,
        registeredTotal: session.registeredCount || 0,
        firstStartTime: session.startTime,
        firstEndTime: session.endTime,
        activeDates: new Set([dateKey]),
        recentSessionCount: isRecent ? 1 : 0,
        latestDateMs: sessionDateMs,
      })
    }

    const slotKey = `${dayOfWeek}|${timeSlot}`
    const existingSlot = slotSupply.get(slotKey)
    if (existingSlot) {
      existingSlot.sessionCount += 1
      existingSlot.occupancyValues.push(occupancy)
      existingSlot.activeDates.add(dateKey)
      existingSlot.recentSessionCount += isRecent ? 1 : 0
      existingSlot.latestDateMs = Math.max(existingSlot.latestDateMs, sessionDateMs)
    } else {
      slotSupply.set(slotKey, {
        sessionCount: 1,
        occupancyValues: [occupancy],
        activeDates: new Set([dateKey]),
        recentSessionCount: isRecent ? 1 : 0,
        latestDateMs: sessionDateMs,
      })
    }
  }

  return { comboStats, slotSupply }
}

function getRelativeDemandScore(key: string, map: Map<string, number>) {
  const peak = maxMapValue(map)
  return clamp(Math.round(((map.get(key) || 0) / peak) * 100), 20, 100)
}

function getMembershipFitScore(input: {
  format: PlaySessionFormat
  skillLevel: PlaySessionSkillLevel
  formatDemand: Map<PlaySessionFormat, number>
  skillDemand: Map<PlaySessionSkillLevel, number>
}) {
  const peakFormat = maxMapValue(input.formatDemand)
  const peakSkill = maxMapValue(input.skillDemand)
  const formatScore = ((input.formatDemand.get(input.format) || 0) / peakFormat) * 100
  const skillScore =
    input.skillLevel === 'ALL_LEVELS'
      ? average(Array.from(input.skillDemand.values())) / peakSkill * 100
      : ((input.skillDemand.get(input.skillLevel) || 0) / peakSkill) * 100
  return clamp(Math.round(formatScore * 0.6 + skillScore * 0.4), 24, 100)
}

function getRecencyMomentum(latestDateMs: number, recentSessionCount: number) {
  const daysSinceLast = Math.max(0, Math.round((Date.now() - latestDateMs) / (24 * 60 * 60 * 1000)))
  const freshness = clamp(100 - daysSinceLast * 4, 25, 100)
  return clamp(Math.round(freshness * 0.65 + Math.min(recentSessionCount * 12, 35)), 25, 100)
}

function getCourtHeadroomScore(input: {
  slotKey: string
  slotSupply: Map<string, SlotSupplyStat>
  courtCount?: number
}) {
  const courts = Math.max(1, input.courtCount || 1)
  const slot = input.slotSupply.get(input.slotKey)
  if (!slot) return clamp(92 - Math.max(0, courts - 1) * 4, 60, 98)
  const sessionsPerActiveDate = getAverageSessionsPerActiveDate(slot)
  const loadRatio = sessionsPerActiveDate / courts
  return clamp(Math.round(100 - loadRatio * 42), 28, 98)
}

function getTopDemandKey<T extends string>(map: Map<T, number>, fallback: T) {
  let topKey = fallback
  let topScore = -1
  for (const [key, score] of Array.from(map.entries())) {
    if (score > topScore) {
      topKey = key
      topScore = score
    }
  }
  return topKey
}

function buildExpandPeakProposals(opts: {
  comboStats: Map<string, ComboStat>
  slotDemand: Map<string, number>
  interestSlotDemand: Map<string, number>
  formatDemand: Map<PlaySessionFormat, number>
  skillDemand: Map<PlaySessionSkillLevel, number>
  slotSupply: Map<string, SlotSupplyStat>
  courtCount?: number
}): AdvisorProgrammingProposalDraft[] {
  const proposals: AdvisorProgrammingProposalDraft[] = []

  for (const stat of Array.from(opts.comboStats.values())) {
    const avgOccupancy = Math.round(stat.occupancySum / Math.max(stat.sessionCount, 1))
    if (stat.sessionCount < 2 || avgOccupancy < 72) continue

    const slotKey = `${stat.dayOfWeek}|${stat.timeSlot}`
    const slotDemandScore = opts.slotDemand.get(slotKey) || 0
    const interestBacklog = opts.interestSlotDemand.get(slotKey) || 0
    const membershipFit = getMembershipFitScore({
      format: stat.format,
      skillLevel: stat.skillLevel,
      formatDemand: opts.formatDemand,
      skillDemand: opts.skillDemand,
    })
    const weekdayStrength = getRelativeDemandScore(slotKey, opts.slotDemand)
    const momentum = getRecencyMomentum(stat.latestDateMs, stat.recentSessionCount)
    const courtHeadroom = getCourtHeadroomScore({
      slotKey,
      slotSupply: opts.slotSupply,
      courtCount: opts.courtCount,
    })
    // Score weights — tuned 2026-04-25 from a real-data walkthrough on
    // IPC clubs:
    //   - preferences (slotDemandScore) had 3.2× and was dominating
    //     scoring; moved to 2.4 so historical fill + interest backlog
    //     also matter
    //   - interestBacklog raised to 3.5 (members explicitly opting in
    //     for "notify me" is the cleanest demand signal we have)
    //   - avgOccupancy raised to 0.8 (history is the most reliable
    //     predictor; was being out-shouted by preferences)
    //   - membershipFit raised to 0.4 so format/persona-mix matters more
    //     than 0.18 noise; persona-aware programming was a stated goal
    //     in the plan but was effectively muted
    //   - sessionCount bonus reduced from min(×2, 10) to min(×1, 6) —
    //     all IPC slots had 100+ historical sessions, so the +10 cap
    //     was constant noise that didn't differentiate slots
    //   - clamp lowered to [30, 95] from [45, 98] so low-signal slots
    //     can rank visibly below high-signal ones (everything used to
    //     pile up at 98)
    const score = clamp(
      Math.round(
        avgOccupancy * 0.8
        + slotDemandScore * 2.4
        + interestBacklog * 3.5
        + membershipFit * 0.4
        + weekdayStrength * 0.12
        + momentum * 0.1
        + courtHeadroom * 0.08
        + Math.min(stat.sessionCount * 1, 6),
      ),
      30,
      95,
      )
    const projectedOccupancy = clamp(Math.round(avgOccupancy + Math.min(slotDemandScore * 1.2 + interestBacklog * 1.5, 10)), 55, 95)
    const estimatedInterestedMembers = Math.max(4, Math.round(slotDemandScore * 1.4 + interestBacklog * 1.6))
    const defaultWindow = defaultSlotWindow(stat.timeSlot, stat.format)

    proposals.push({
      id: buildProposalId(stat),
      title: buildProgrammingTitle(stat),
      dayOfWeek: stat.dayOfWeek,
      timeSlot: stat.timeSlot,
      startTime: stat.firstStartTime || defaultWindow.startTime,
      endTime: stat.firstEndTime || defaultWindow.endTime,
      format: stat.format,
      skillLevel: stat.skillLevel,
      maxPlayers: getRequestedMaxPlayers(stat.format, Math.round(stat.maxPlayersTotal / Math.max(stat.sessionCount, 1))),
      projectedOccupancy,
      estimatedInterestedMembers,
      confidence: score,
      source: 'expand_peak',
      rationale: [
        `${stat.sessionCount} recent ${formatLabel(stat.format)} sessions in this window averaged ${avgOccupancy}% full.`,
        `${stat.dayOfWeek} ${timeSlotLabel(stat.timeSlot).toLowerCase()} already shows repeat demand from active members.`,
        interestBacklog > 0
          ? `${Math.round(interestBacklog)} notify-me demand signal${Math.round(interestBacklog) === 1 ? '' : 's'} are still waiting for a matching window here.`
          : `${courtHeadroom}% court headroom suggests this window can likely absorb another recurring option cleanly.`,
        `${membershipFit}% of current member demand signals line up with this ${formatLabel(stat.format).toLowerCase()} / ${skillLabel(stat.skillLevel).toLowerCase()} shape.`,
        `Recent momentum is ${momentum >= 72 ? 'strong' : momentum >= 58 ? 'steady' : 'mixed'} for this window.`,
        'Adding another recurring option here should capture demand without changing live schedule yet.',
      ].slice(0, 4),
    })
  }

  return proposals
}

function buildGapFillProposals(opts: {
  slotDemand: Map<string, number>
  interestSlotDemand: Map<string, number>
  slotSupply: Map<string, SlotSupplyStat>
  topFormat: PlaySessionFormat
  topSkill: PlaySessionSkillLevel
  formatDemand: Map<PlaySessionFormat, number>
  skillDemand: Map<PlaySessionSkillLevel, number>
  courtCount?: number
}): AdvisorProgrammingProposalDraft[] {
  const proposals: AdvisorProgrammingProposalDraft[] = []

  for (const dayOfWeek of DAYS) {
    for (const timeSlot of TIME_SLOTS) {
      const slotKey = `${dayOfWeek}|${timeSlot}`
      const demand = opts.slotDemand.get(slotKey) || 0
      const interestBacklog = opts.interestSlotDemand.get(slotKey) || 0
      const supply = opts.slotSupply.get(slotKey)
      const slotAvgOccupancy = supply ? average(supply.occupancyValues) : 0

      if (demand < 3) continue
      if (supply && supply.sessionCount > 0 && slotAvgOccupancy < 68) continue

      const membershipFit = getMembershipFitScore({
        format: opts.topFormat,
        skillLevel: opts.topSkill,
        formatDemand: opts.formatDemand,
        skillDemand: opts.skillDemand,
      })
      const weekdayStrength = getRelativeDemandScore(slotKey, opts.slotDemand)
      const momentum = supply
        ? getRecencyMomentum(supply.latestDateMs, supply.recentSessionCount)
        : clamp(58 + demand * 6, 52, 92)
      const courtHeadroom = getCourtHeadroomScore({
        slotKey,
        slotSupply: opts.slotSupply,
        courtCount: opts.courtCount,
      })
      const window = defaultSlotWindow(timeSlot, opts.topFormat)
      const projectedOccupancy = clamp(
        Math.round(58 + demand * 4 + interestBacklog * 1.8 + (supply ? Math.max(0, slotAvgOccupancy - 68) * 0.3 : 10)),
        52,
        92,
      )
      const confidence = clamp(
        Math.round(
          42
          + demand * 4.2
          + interestBacklog * 2.8
          + membershipFit * 0.18
          + weekdayStrength * 0.12
          + momentum * 0.12
          + courtHeadroom * 0.09
          + (supply ? Math.max(0, slotAvgOccupancy - 70) * 0.35 : 10),
        ),
        48,
        96,
      )

      proposals.push({
        id: buildProposalId({
          dayOfWeek,
          timeSlot,
          format: opts.topFormat,
          skillLevel: opts.topSkill,
        }),
        title: buildProgrammingTitle({
          dayOfWeek,
          timeSlot,
          format: opts.topFormat,
          skillLevel: opts.topSkill,
        }),
        dayOfWeek,
        timeSlot,
        startTime: window.startTime,
        endTime: window.endTime,
        format: opts.topFormat,
        skillLevel: opts.topSkill,
        maxPlayers: getRequestedMaxPlayers(opts.topFormat),
        projectedOccupancy,
        estimatedInterestedMembers: Math.max(4, Math.round(demand * 1.7 + interestBacklog * 1.5)),
        confidence,
        source: 'fill_gap',
        rationale: [
          supply?.sessionCount
            ? `${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()} sessions are already averaging ${Math.round(slotAvgOccupancy)}% full.`
            : `No recent sessions are scheduled on ${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()}.`,
          `${Math.round(demand)} member preference signals line up with this window.`,
          interestBacklog > 0
            ? `${Math.round(interestBacklog)} queued notify-me request${Math.round(interestBacklog) === 1 ? '' : 's'} are still waiting for this kind of slot.`
            : `${courtHeadroom}% court headroom suggests this slot is operationally manageable if the club wants to test it.`,
          `${membershipFit}% membership-fit score suggests this format and skill mix matches who currently wants to play.`,
          `Weekday signal is ${weekdayStrength >= 72 ? 'strong' : weekdayStrength >= 58 ? 'steady' : 'emerging'} for this slot.`,
          'This is a safe draft-only way to test new programming before publishing anything live.',
        ].slice(0, 4),
      })
    }
  }

  return proposals
}

function dedupeProposals(proposals: AdvisorProgrammingProposalDraft[]) {
  const seen = new Set<string>()
  return proposals.filter((proposal) => {
    const key = `${proposal.dayOfWeek}|${proposal.timeSlot}|${proposal.format}|${proposal.skillLevel}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getAverageSessionsPerActiveDate(stat?: { sessionCount: number; activeDates: Set<string> } | null) {
  if (!stat) return 0
  return stat.sessionCount / Math.max(stat.activeDates.size, 1)
}

function buildProposalConflict(opts: {
  proposal: AdvisorProgrammingProposalDraft
  comboStats: Map<string, ComboStat>
  slotSupply: Map<string, SlotSupplyStat>
  courtCount?: number
}): AdvisorProgrammingProposalConflict {
  const comboKey = `${opts.proposal.dayOfWeek}|${opts.proposal.timeSlot}|${opts.proposal.format}|${opts.proposal.skillLevel}`
  const slotKey = `${opts.proposal.dayOfWeek}|${opts.proposal.timeSlot}`
  const combo = opts.comboStats.get(comboKey)
  const slot = opts.slotSupply.get(slotKey)
  const exactAverageOccupancy = combo
    ? Math.round(combo.occupancySum / Math.max(combo.sessionCount, 1))
    : null
  const slotAverageOccupancy = slot
    ? Math.round(average(slot.occupancyValues))
    : null
  const exactSessionsPerActiveDate = getAverageSessionsPerActiveDate(combo)
  const slotSessionsPerActiveDate = getAverageSessionsPerActiveDate(slot)
  const courtCount = Math.max(1, opts.courtCount || 1)
  const courtLoadRatio = slotSessionsPerActiveDate / courtCount

  const overlapRisk: AdvisorProgrammingConflictRiskLevel =
    slotSessionsPerActiveDate >= 3
      ? 'high'
      : slotSessionsPerActiveDate >= 2 || (slotAverageOccupancy !== null && slotAverageOccupancy < 70)
        ? 'medium'
        : 'low'

  const cannibalizationRisk: AdvisorProgrammingConflictRiskLevel =
    exactAverageOccupancy !== null
      ? exactAverageOccupancy < 78
        ? 'high'
        : exactAverageOccupancy < 86
          ? 'medium'
          : 'low'
      : slotAverageOccupancy !== null && slotSessionsPerActiveDate >= 2 && slotAverageOccupancy < 74
        ? 'medium'
        : 'low'

  const courtPressureRisk: AdvisorProgrammingConflictRiskLevel =
    courtLoadRatio >= 1.2
      ? 'high'
      : courtLoadRatio >= 0.8
        ? 'medium'
        : 'low'

  const warnings: string[] = []

  if (cannibalizationRisk !== 'low') {
    warnings.push(
      exactAverageOccupancy !== null
        ? `Recent ${formatLabel(opts.proposal.format)} ${skillLabel(opts.proposal.skillLevel)} sessions in this exact window averaged ${exactAverageOccupancy}% full, so adding another option may split existing demand.`
        : `This window already has live programming supply averaging ${slotAverageOccupancy || 0}% full, so demand may split instead of expand.`,
    )
  }

  if (overlapRisk !== 'low') {
    warnings.push(
      `${opts.proposal.dayOfWeek} ${timeSlotLabel(opts.proposal.timeSlot).toLowerCase()} is already carrying about ${slotSessionsPerActiveDate.toFixed(1)} session lane${slotSessionsPerActiveDate >= 1.5 ? 's' : ''} per active date, so overlap risk is higher here.`,
    )
  }

  if (courtPressureRisk !== 'low') {
    warnings.push(
      `Court pressure is elevated in this window, with roughly ${slotSessionsPerActiveDate.toFixed(1)} session lane${slotSessionsPerActiveDate >= 1.5 ? 's' : ''} competing across ${courtCount} active court${courtCount === 1 ? '' : 's'}.`,
    )
  }

  const totalRiskScore =
    riskWeight(overlapRisk) +
    riskWeight(cannibalizationRisk) +
    riskWeight(courtPressureRisk)
  const overallRisk: AdvisorProgrammingConflictRiskLevel =
    totalRiskScore >= 8 || (maxRiskLevel(overlapRisk, cannibalizationRisk, courtPressureRisk) === 'high' && totalRiskScore >= 6)
      ? 'high'
      : totalRiskScore >= 5
        ? 'medium'
        : 'low'

  const riskSummary =
    overallRisk === 'high'
      ? `Higher-risk programming window: strong upside, but overlap or cannibalization could eat into an existing session.`
      : overallRisk === 'medium'
        ? `Good opportunity, but this slot should be compared against one safer alternative before moving into ops.`
        : `This window looks comparatively clean from a scheduling-conflict standpoint.`

  return {
    overlapRisk,
    cannibalizationRisk,
    courtPressureRisk,
    overallRisk,
    riskSummary,
    warnings: warnings.slice(0, 3),
  }
}

function withProgrammingConflicts(
  proposals: AdvisorProgrammingProposalDraft[],
  stats: {
    comboStats: Map<string, ComboStat>
    slotSupply: Map<string, SlotSupplyStat>
    courtCount?: number
  },
) {
  const annotated = proposals.map((proposal) => ({
    ...proposal,
    conflict: buildProposalConflict({
      proposal,
      comboStats: stats.comboStats,
      slotSupply: stats.slotSupply,
      courtCount: stats.courtCount,
    }),
  }))

  return annotated.map((proposal) => {
    if (!proposal.conflict || proposal.conflict.overallRisk === 'low') return proposal

    const saferAlternative = annotated
      .filter((candidate) => candidate.id !== proposal.id && candidate.conflict)
      .filter((candidate) => riskWeight(candidate.conflict!.overallRisk) < riskWeight(proposal.conflict!.overallRisk))
      .filter((candidate) => candidate.confidence >= proposal.confidence - 8)
      .sort((left, right) => {
        const riskDelta = riskWeight(left.conflict!.overallRisk) - riskWeight(right.conflict!.overallRisk)
        if (riskDelta !== 0) return riskDelta
        if (right.confidence !== left.confidence) return right.confidence - left.confidence
        return right.projectedOccupancy - left.projectedOccupancy
      })[0]

    if (!saferAlternative) return proposal

    return {
      ...proposal,
      conflict: {
        ...proposal.conflict,
        saferAlternativeId: saferAlternative.id,
        saferAlternativeReason:
          `${saferAlternative.title} keeps a ${saferAlternative.conflict?.overallRisk || 'lower'}-risk schedule shape while staying within ${Math.abs(saferAlternative.confidence - proposal.confidence)} confidence point${Math.abs(saferAlternative.confidence - proposal.confidence) === 1 ? '' : 's'} of this idea.`,
      },
    }
  })
}

function getProgrammingProposalOperationalScore(proposal: AdvisorProgrammingProposalDraft) {
  const conflictPenalty = proposal.conflict
    ? (
      riskWeight(proposal.conflict.overlapRisk) * 2 +
      riskWeight(proposal.conflict.cannibalizationRisk) * 3 +
      riskWeight(proposal.conflict.courtPressureRisk) * 2
    )
    : 0

  return (
    proposal.confidence * 1.2 +
    proposal.projectedOccupancy * 0.45 +
    proposal.estimatedInterestedMembers * 1.3 -
    conflictPenalty
  )
}

function rankProgrammingProposals(proposals: AdvisorProgrammingProposalDraft[]) {
  return proposals.sort((left, right) => {
    const rightOperationalScore = getProgrammingProposalOperationalScore(right)
    const leftOperationalScore = getProgrammingProposalOperationalScore(left)
    if (rightOperationalScore !== leftOperationalScore) {
      return rightOperationalScore - leftOperationalScore
    }
    if (right.confidence !== left.confidence) return right.confidence - left.confidence
    if (right.projectedOccupancy !== left.projectedOccupancy) return right.projectedOccupancy - left.projectedOccupancy
    return right.estimatedInterestedMembers - left.estimatedInterestedMembers
  })
}

function buildRequestedProposal(opts: {
  spec: AdvisorProgrammingRequestSpec
  recommended: AdvisorProgrammingProposalDraft | null
}): AdvisorProgrammingProposalDraft | null {
  const hasMeaningfulSpec = Boolean(
    opts.spec.dayOfWeek ||
    opts.spec.timeSlot ||
    opts.spec.startTime ||
    opts.spec.format ||
    opts.spec.skillLevel ||
    opts.spec.maxPlayers,
  )
  if (!hasMeaningfulSpec) return null

  const recommended = opts.recommended
  const format = opts.spec.format || recommended?.format || 'OPEN_PLAY'
  const skillLevel = opts.spec.skillLevel || recommended?.skillLevel || 'INTERMEDIATE'
  const timeSlot = opts.spec.timeSlot || recommended?.timeSlot || 'evening'
  const dayOfWeek = opts.spec.dayOfWeek || recommended?.dayOfWeek || 'Wednesday'
  const defaultWindow = defaultSlotWindow(timeSlot, format)
  const startTime = opts.spec.startTime || recommended?.startTime || defaultWindow.startTime
  const endTime = opts.spec.endTime || recommended?.endTime || defaultWindow.endTime

  return {
    id: buildProposalId({ dayOfWeek, timeSlot, format, skillLevel }),
    title: buildProgrammingTitle({ dayOfWeek, timeSlot, format, skillLevel }),
    dayOfWeek,
    timeSlot,
    startTime,
    endTime,
    format,
    skillLevel,
    maxPlayers: getRequestedMaxPlayers(format, opts.spec.maxPlayers || recommended?.maxPlayers),
    projectedOccupancy: recommended
      ? clamp(recommended.projectedOccupancy - 6, 42, 95)
      : 58,
    estimatedInterestedMembers: recommended
      ? Math.max(4, recommended.estimatedInterestedMembers - 1)
      : 6,
    confidence: recommended
      ? clamp(recommended.confidence - 7, 40, 95)
      : 56,
    source: recommended?.source || 'fill_gap',
    rationale: [
      'This follows the exact programming shape requested in the conversation.',
      'The agent can keep refining day, time, format, and skill before anything goes live.',
    ],
  }
}

function sameProposal(left?: AdvisorProgrammingProposalDraft | null, right?: AdvisorProgrammingProposalDraft | null) {
  if (!left || !right) return false
  return (
    left.dayOfWeek === right.dayOfWeek &&
    left.timeSlot === right.timeSlot &&
    left.format === right.format &&
    left.skillLevel === right.skillLevel &&
    left.startTime === right.startTime
  )
}

function buildInsights(opts: {
  proposals: AdvisorProgrammingProposalDraft[]
  topFormat: PlaySessionFormat
  topSkill: PlaySessionSkillLevel
  slotDemand: Map<string, number>
  interestSlotDemand: Map<string, number>
  formatDemand: Map<PlaySessionFormat, number>
  skillDemand: Map<PlaySessionSkillLevel, number>
  interestRequestCount: number
  courtCount?: number
}) {
  const insights: string[] = []
  const topProposal = opts.proposals[0]
  if (topProposal) {
    insights.push(`${topProposal.dayOfWeek} ${timeSlotLabel(topProposal.timeSlot).toLowerCase()} is the clearest programming opportunity right now.`)
  }

  insights.push(`Most consistent member demand is clustering around ${formatLabel(opts.topFormat)} sessions.`)
  const strongestInterestGap = Array.from(opts.interestSlotDemand.entries())
    .sort((left, right) => right[1] - left[1])[0]
  if (strongestInterestGap) {
    const [dayOfWeek, timeSlot] = strongestInterestGap[0].split('|') as [DayOfWeek, TimeSlot]
    insights.push(`${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()} also has ${Math.round(strongestInterestGap[1])} queued notify-me demand signals still waiting for supply.`)
  }
  if (opts.topSkill !== 'ALL_LEVELS') {
    insights.push(`${skillLabel(opts.topSkill)} programming is showing the strongest repeat demand signal.`)
  }

  const strongestGap = Array.from(opts.slotDemand.entries())
    .sort((left, right) => right[1] - left[1])[0]
  if (strongestGap) {
    const [dayOfWeek, timeSlot] = strongestGap[0].split('|') as [DayOfWeek, TimeSlot]
    insights.push(`${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()} has ${Math.round(strongestGap[1])} preference signals behind it.`)
  }

  const topFormatDemand = opts.formatDemand.get(opts.topFormat) || 0
  if (topFormatDemand > 0) {
    insights.push(`${formatLabel(opts.topFormat)} has the cleanest membership-fit signal in current preferences.`)
  }

  if (opts.courtCount && opts.courtCount <= 2) {
    insights.push(`The club is only running on ${opts.courtCount} active court${opts.courtCount === 1 ? '' : 's'}, so cleaner windows matter more than usual.`)
  } else if (opts.interestRequestCount > 0) {
    insights.push(`${opts.interestRequestCount} notify-me request${opts.interestRequestCount === 1 ? '' : 's'} are now feeding suppressed demand into programming decisions.`)
  }

  return insights.slice(0, 4)
}

export function buildAdvisorProgrammingPlan(opts: {
  sessions: ProgrammingSessionRow[]
  preferences: ProgrammingPreferenceRow[]
  interestRequests?: ProgrammingInterestRequestRow[]
  request?: AdvisorProgrammingRequestSpec | null
  limit?: number
  courtCount?: number
}) {
  const { comboStats, slotSupply } = buildSessionStats(opts.sessions)
  const {
    slotDemand,
    formatDemand,
    skillDemand,
    interestSlotDemand,
    interestRequestCount,
  } = buildDemandSignals(opts.preferences, opts.interestRequests || [])
  const topFormat = getTopDemandKey(formatDemand, 'OPEN_PLAY')
  const topSkill = getTopDemandKey(skillDemand, 'INTERMEDIATE')

  const baseProposals = dedupeProposals([
    ...buildExpandPeakProposals({
      comboStats,
      slotDemand,
      interestSlotDemand,
      formatDemand,
      skillDemand,
      slotSupply,
      courtCount: opts.courtCount,
    }),
    ...buildGapFillProposals({
      slotDemand,
      interestSlotDemand,
      slotSupply,
      topFormat,
      topSkill,
      formatDemand,
      skillDemand,
      courtCount: opts.courtCount,
    }),
  ])
  const annotatedBaseProposals = withProgrammingConflicts(baseProposals, {
    comboStats,
    slotSupply,
    courtCount: opts.courtCount,
  })
  const rankedBase = rankProgrammingProposals(annotatedBaseProposals)
  const recommended = rankedBase[0] || null
  const requested = buildRequestedProposal({
    spec: opts.request || {},
    recommended,
  })
  const annotatedRequested = requested
    ? withProgrammingConflicts([requested, ...rankedBase], {
        comboStats,
        slotSupply,
        courtCount: opts.courtCount,
      })
        .find((proposal) => sameProposal(proposal, requested)) || null
    : null

  const proposals = (annotatedRequested
    ? [annotatedRequested, ...rankedBase.filter((proposal) => !sameProposal(proposal, annotatedRequested))]
    : rankedBase)
    .slice(0, Math.max(1, opts.limit || 3))

  return {
    requested: annotatedRequested,
    recommended,
    proposals,
    insights: buildInsights({
      proposals: rankedBase.slice(0, 3),
      topFormat,
      topSkill,
      slotDemand,
      interestSlotDemand,
      formatDemand,
      skillDemand,
      interestRequestCount,
      courtCount: opts.courtCount,
    }),
  }
}

async function loadProgrammingData(prisma: any, clubId: string) {
  const since = new Date()
  since.setDate(since.getDate() - 60)

  const [sessions, preferences, interestRequests, courtCount] = await Promise.all([
    prisma.playSession.findMany({
      where: {
        clubId,
        date: { gte: since },
        status: { not: 'CANCELLED' },
      },
      select: {
        title: true,
        date: true,
        startTime: true,
        endTime: true,
        format: true,
        skillLevel: true,
        maxPlayers: true,
        registeredCount: true,
      },
      take: 500,
      orderBy: { date: 'desc' },
    }),
    prisma.userPlayPreference.findMany({
      where: { clubId },
      select: {
        preferredDays: true,
        preferredTimeMorning: true,
        preferredTimeAfternoon: true,
        preferredTimeEvening: true,
        skillLevel: true,
        preferredFormats: true,
        targetSessionsPerWeek: true,
        notificationsOptOut: true,
      },
      take: 500,
    }),
    prisma.sessionInterestRequest.findMany({
      where: { clubId },
      select: {
        preferredDays: true,
        preferredFormats: true,
        preferredTimeSlots: true,
        status: true,
        sessionId: true,
      },
      take: 500,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.clubCourt.count({
      where: { clubId, isActive: true },
    }).catch(() => 0),
  ])

  return {
    sessions: sessions as ProgrammingSessionRow[],
    preferences: preferences as ProgrammingPreferenceRow[],
    interestRequests: interestRequests as ProgrammingInterestRequestRow[],
    courtCount: typeof courtCount === 'number' ? courtCount : 0,
  }
}

export async function getAdvisorProgrammingDraft(opts: {
  prisma: any
  clubId: string
  message: string
  current?: AdvisorProgrammingRequestSpec | null
  limit?: number
}) {
  const data = await loadProgrammingData(opts.prisma, opts.clubId)
  const request = parseAdvisorProgrammingRequest(opts.message, opts.current)
  const plan = buildAdvisorProgrammingPlan({
    sessions: data.sessions,
    preferences: data.preferences,
    interestRequests: data.interestRequests,
    request,
    limit: opts.limit || 3,
    courtCount: data.courtCount,
  })

  return {
    ...plan,
    request,
    hasData: data.sessions.length > 0 || data.preferences.length > 0 || data.interestRequests.length > 0,
  }
}
