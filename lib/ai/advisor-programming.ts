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
  profilePriorBlend: number
}

export type ProgrammingAudienceProfile = {
  audienceSize: number
  activeAudienceSize: number
  membersWithSkill: number
  membersWithAge: number
  membersWithGender: number
  skillCounts: Partial<Record<PlaySessionSkillLevel, number>>
  ageBands: {
    junior: number
    youngAdult: number
    adult: number
    senior: number
  }
}

type ProgrammingSignalReliability = {
  history: number
  preferences: number
  interest: number
  membershipFit: number
  skillProfile: number
  ageProfile: number
  momentum: number
  courtOps: number
  weekday: number
}

type ProgrammingAdaptiveWeights = {
  expand: {
    historical: number
    slotDemand: number
    interest: number
    membershipFit: number
    skillProfile: number
    ageTimeFit: number
    momentum: number
    courtHeadroom: number
    weekdayStrength: number
  }
  gap: {
    historical: number
    slotDemand: number
    interest: number
    membershipFit: number
    skillProfile: number
    ageTimeFit: number
    momentum: number
    courtHeadroom: number
    weekdayStrength: number
  }
}

type ProgrammingWeightProfile = {
  maturity: number
  reliabilities: ProgrammingSignalReliability
  weights: ProgrammingAdaptiveWeights
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

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
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

function mergeDemandMap<T>(target: Map<T, number>, source: Map<T, number>, multiplier = 1) {
  if (multiplier <= 0) return
  for (const [key, amount] of Array.from(source.entries())) {
    addDemand(target, key, amount * multiplier)
  }
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
  if (upper.includes('CASUAL')) return 'BEGINNER'
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

function buildAudienceProfileDemandPrior(
  audienceProfile?: ProgrammingAudienceProfile | null,
) {
  const slotDemand = new Map<string, number>()
  const formatDemand = new Map<PlaySessionFormat, number>()
  const skillDemand = new Map<PlaySessionSkillLevel, number>()

  if (!audienceProfile || audienceProfile.audienceSize <= 0) {
    return { slotDemand, formatDemand, skillDemand }
  }

  const audienceSize = Math.max(
    audienceProfile.activeAudienceSize || audienceProfile.audienceSize,
    1,
  )
  const skillMap = getProfileSkillDemandMap(audienceProfile)
  const totalKnownSkill = Math.max(sumMapValues(skillMap), 0)
  const skillFallback = totalKnownSkill > 0 ? 0 : audienceSize

  const beginnerCount = (skillMap.get('BEGINNER') || 0) + skillFallback * 0.30
  const intermediateCount = (skillMap.get('INTERMEDIATE') || 0) + skillFallback * 0.45
  const advancedCount = (skillMap.get('ADVANCED') || 0) + skillFallback * 0.15
  const allLevelsCount = (skillMap.get('ALL_LEVELS') || 0) + skillFallback * 0.10

  addDemand(skillDemand, 'BEGINNER', beginnerCount)
  addDemand(skillDemand, 'INTERMEDIATE', intermediateCount)
  addDemand(skillDemand, 'ADVANCED', advancedCount)
  addDemand(skillDemand, 'ALL_LEVELS', Math.max(allLevelsCount, audienceSize * 0.35))

  addDemand(formatDemand, 'CLINIC', beginnerCount * 1.35 + intermediateCount * 0.45)
  addDemand(formatDemand, 'OPEN_PLAY', beginnerCount * 1.00 + intermediateCount * 1.30 + advancedCount * 0.80)
  addDemand(formatDemand, 'SOCIAL', beginnerCount * 0.75 + intermediateCount * 0.90 + allLevelsCount * 0.60)
  addDemand(formatDemand, 'DRILL', beginnerCount * 0.40 + intermediateCount * 1.00 + advancedCount * 1.35)
  addDemand(formatDemand, 'LEAGUE_PLAY', intermediateCount * 0.35 + advancedCount * 1.20)

  const membersWithAge = Math.max(audienceProfile.membersWithAge, 1)
  const juniorShare = audienceProfile.ageBands.junior / membersWithAge
  const youngAdultShare = audienceProfile.ageBands.youngAdult / membersWithAge
  const adultShare = audienceProfile.ageBands.adult / membersWithAge
  const seniorShare = audienceProfile.ageBands.senior / membersWithAge
  const slotVolume = clamp(audienceSize / 6, 1, 8)

  const weekdayMorning = slotVolume * (0.35 + seniorShare * 0.70 + adultShare * 0.25)
  const weekdayAfternoon = slotVolume * (0.25 + juniorShare * 0.75 + seniorShare * 0.15)
  const weekdayEvening = slotVolume * (0.85 + youngAdultShare * 0.45 + adultShare * 0.25)
  const fridayEvening = slotVolume * (0.70 + youngAdultShare * 0.30 + adultShare * 0.10)
  const saturdayMorning = slotVolume * (0.85 + adultShare * 0.25 + youngAdultShare * 0.15 + juniorShare * 0.10)
  const sundayMorning = slotVolume * (0.65 + adultShare * 0.20 + seniorShare * 0.20)
  const weekendAfternoon = slotVolume * (0.45 + juniorShare * 0.30 + youngAdultShare * 0.20)

  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] as DayOfWeek[]) {
    addDemand(slotDemand, `${day}|morning`, weekdayMorning)
    addDemand(slotDemand, `${day}|afternoon`, weekdayAfternoon)
    addDemand(slotDemand, `${day}|evening`, weekdayEvening)
  }

  addDemand(slotDemand, 'Friday|morning', weekdayMorning * 0.85)
  addDemand(slotDemand, 'Friday|afternoon', weekdayAfternoon * 0.90)
  addDemand(slotDemand, 'Friday|evening', fridayEvening)
  addDemand(slotDemand, 'Saturday|morning', saturdayMorning)
  addDemand(slotDemand, 'Saturday|afternoon', weekendAfternoon)
  addDemand(slotDemand, 'Saturday|evening', slotVolume * 0.40)
  addDemand(slotDemand, 'Sunday|morning', sundayMorning)
  addDemand(slotDemand, 'Sunday|afternoon', weekendAfternoon * 0.90)
  addDemand(slotDemand, 'Sunday|evening', slotVolume * 0.35)

  return { slotDemand, formatDemand, skillDemand }
}

function buildDemandSignals(
  preferences: ProgrammingPreferenceRow[],
  interestRequests: ProgrammingInterestRequestRow[] = [],
  audienceProfile?: ProgrammingAudienceProfile | null,
  historySessionCount = 0,
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
    const explicitSlots = getInterestRequestSlots(request.preferredTimeSlots)
    const fallbackSlots = explicitSlots.length > 0 ? explicitSlots : TIME_SLOTS
    const dayTargets = preferredDays.length > 0 ? preferredDays : DAYS
    const spreadDivisor =
      (preferredDays.length > 0 ? 1 : dayTargets.length) *
      (explicitSlots.length > 0 ? 1 : fallbackSlots.length)
    const slotWeight = weight / Math.max(1, spreadDivisor)
    const normalizedFormats = (request.preferredFormats || [])
      .map((value) => normalizeFormat(value))
      .filter((value): value is PlaySessionFormat => !!value)

    interestRequestCount += 1

    for (const dayOfWeek of dayTargets) {
      for (const slot of fallbackSlots) {
        const key = `${dayOfWeek}|${slot}`
        addDemand(slotDemand, key, slotWeight)
        addDemand(interestSlotDemand, key, slotWeight)
      }
    }

    for (const format of normalizedFormats) {
      addDemand(formatDemand, format, weight)
      addDemand(interestFormatDemand, format, weight)
    }
  }

  const audienceSize = getAudienceSize(audienceProfile || undefined, preferences, interestRequests)
  const explicitCoverage = clamp(
    ((preferences.length + interestRequestCount) / audienceSize) / 0.35,
    0,
    1,
  )
  const historyCoverage = clamp(historySessionCount / 16, 0, 1)
  const profilePriorBlend = audienceProfile
    ? clamp((1 - explicitCoverage) * (1 - historyCoverage * 0.8), 0, 1)
    : 0

  if (profilePriorBlend > 0.05) {
    const prior = buildAudienceProfileDemandPrior(audienceProfile)
    mergeDemandMap(slotDemand, prior.slotDemand, profilePriorBlend)
    mergeDemandMap(formatDemand, prior.formatDemand, profilePriorBlend)
    mergeDemandMap(skillDemand, prior.skillDemand, profilePriorBlend)
  }

  return {
    slotDemand,
    formatDemand,
    skillDemand,
    interestSlotDemand,
    interestFormatDemand,
    interestRequestCount,
    profilePriorBlend,
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

function sumMapValues<T>(map: Map<T, number>) {
  return Array.from(map.values()).reduce((sum, value) => sum + value, 0)
}

function getAgeYears(value?: Date | string | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const birthdayPassed =
    now.getMonth() > date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate())
  if (!birthdayPassed) age -= 1
  return age >= 0 && age <= 110 ? age : null
}

export function buildProgrammingAudienceProfileFromMembers(
  members: Array<{
    skillLevel?: string | null
    dateOfBirth?: Date | string | null
    gender?: string | null
  }>,
): ProgrammingAudienceProfile {
  const skillCounts: Partial<Record<PlaySessionSkillLevel, number>> = {}
  const ageBands = {
    junior: 0,
    youngAdult: 0,
    adult: 0,
    senior: 0,
  }

  let membersWithSkill = 0
  let membersWithAge = 0
  let membersWithGender = 0

  for (const member of members) {
    const normalizedSkill = normalizeSkillLevel(member.skillLevel)
    if (normalizedSkill) {
      skillCounts[normalizedSkill] = (skillCounts[normalizedSkill] || 0) + 1
      membersWithSkill += 1
    }

    const age = getAgeYears(member.dateOfBirth)
    if (age !== null) {
      membersWithAge += 1
      if (age < 18) ageBands.junior += 1
      else if (age < 35) ageBands.youngAdult += 1
      else if (age < 55) ageBands.adult += 1
      else ageBands.senior += 1
    }

    if (member.gender) membersWithGender += 1
  }

  return {
    audienceSize: members.length,
    activeAudienceSize: members.length,
    membersWithSkill,
    membersWithAge,
    membersWithGender,
    skillCounts,
    ageBands,
  }
}

function getAudienceSize(
  audienceProfile: ProgrammingAudienceProfile | undefined,
  preferences: ProgrammingPreferenceRow[],
  interestRequests: ProgrammingInterestRequestRow[],
) {
  return Math.max(
    audienceProfile?.activeAudienceSize || 0,
    audienceProfile?.audienceSize || 0,
    preferences.length,
    interestRequests.length,
    1,
  )
}

function getProfileSkillDemandMap(audienceProfile?: ProgrammingAudienceProfile | null) {
  const map = new Map<PlaySessionSkillLevel, number>()
  if (!audienceProfile) return map
  for (const [skill, count] of Object.entries(audienceProfile.skillCounts)) {
    if (!skill || !count) continue
    map.set(skill as PlaySessionSkillLevel, count)
  }
  return map
}

function getSkillProfileFitScore(input: {
  skillLevel: PlaySessionSkillLevel
  audienceProfile?: ProgrammingAudienceProfile | null
}) {
  const skillMap = getProfileSkillDemandMap(input.audienceProfile)
  if (skillMap.size === 0) return 50
  const peak = maxMapValue(skillMap)
  if (input.skillLevel === 'ALL_LEVELS') {
    return clamp(Math.round((sumMapValues(skillMap) / Math.max(skillMap.size, 1)) / peak * 100), 35, 100)
  }
  return clamp(Math.round(((skillMap.get(input.skillLevel) || 0) / peak) * 100), 30, 100)
}

function getAgeTimeFitScore(input: {
  timeSlot: TimeSlot
  dayOfWeek: DayOfWeek
  audienceProfile?: ProgrammingAudienceProfile | null
}) {
  const profile = input.audienceProfile
  if (!profile || profile.membersWithAge === 0) return 50

  const total = Math.max(profile.membersWithAge, 1)
  const juniorShare = profile.ageBands.junior / total
  const youngAdultShare = profile.ageBands.youngAdult / total
  const adultShare = profile.ageBands.adult / total
  const seniorShare = profile.ageBands.senior / total
  const weekend = input.dayOfWeek === 'Saturday' || input.dayOfWeek === 'Sunday'

  let score = 50
  if (input.timeSlot === 'morning') {
    score += adultShare * 24 + seniorShare * 28 + (weekend ? youngAdultShare * 10 : 0)
    score -= youngAdultShare * 8
  } else if (input.timeSlot === 'afternoon') {
    score += adultShare * 12 + seniorShare * 18 + (weekend ? juniorShare * 10 : 0)
    score -= youngAdultShare * 4
  } else {
    score += youngAdultShare * 26 + juniorShare * 10 + (weekend ? 4 : 0)
    score -= seniorShare * 8
  }

  return clamp(Math.round(score), 30, 85)
}

function normaliseWeightRecord<T extends string>(weights: Record<T, number>) {
  const values = Object.values(weights) as number[]
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return weights
  return Object.fromEntries(
    (Object.entries(weights) as Array<[T, number]>).map(([key, value]) => [key, value / total]),
  ) as Record<T, number>
}

function computeProgrammingWeightProfile(opts: {
  sessions: ProgrammingSessionRow[]
  preferences: ProgrammingPreferenceRow[]
  interestRequests: ProgrammingInterestRequestRow[]
  comboStats: Map<string, ComboStat>
  slotSupply: Map<string, SlotSupplyStat>
  audienceProfile?: ProgrammingAudienceProfile | null
  courtCount?: number
}) {
  const audienceSize = getAudienceSize(opts.audienceProfile || undefined, opts.preferences, opts.interestRequests)
  const totalBookings = opts.sessions.reduce((sum, session) => sum + Math.max(0, session.registeredCount || 0), 0)
  const historyReliability = clamp(
    (opts.sessions.length / 24) * 0.55 +
    (totalBookings / 180) * 0.35 +
    (opts.comboStats.size / 10) * 0.10,
    0,
    1,
  )
  const preferenceReliability = clamp(
    (opts.preferences.length / audienceSize) / 0.30,
    0,
    1,
  )
  const openInterestCount = opts.interestRequests.filter((request) => {
    const status = (request.status || '').toLowerCase()
    return !request.sessionId && !['matched', 'fulfilled', 'completed', 'closed', 'cancelled'].includes(status)
  }).length
  const interestReliability = clamp(
    (openInterestCount / audienceSize) / 0.08,
    0,
    1,
  )
  const skillProfileReliability = clamp(
    (opts.audienceProfile?.membersWithSkill || 0) / audienceSize,
    0,
    1,
  )
  const ageProfileReliability = clamp(
    (opts.audienceProfile?.membersWithAge || 0) / audienceSize,
    0,
    1,
  )
  const maturity = historyReliability
  const slotSignalReliability = clamp(
    Math.max(preferenceReliability, interestReliability, opts.slotSupply.size > 0 ? 0.35 : 0),
    0,
    1,
  )
  const reliabilities: ProgrammingSignalReliability = {
    history: historyReliability,
    preferences: preferenceReliability,
    interest: interestReliability,
    membershipFit: clamp(preferenceReliability * 0.65 + skillProfileReliability * 0.35, 0, 1),
    skillProfile: skillProfileReliability,
    ageProfile: ageProfileReliability,
    momentum: clamp(Math.max(historyReliability, slotSignalReliability * 0.6), 0, 1),
    courtOps: opts.courtCount && opts.courtCount > 0 ? 1 : 0.6,
    weekday: slotSignalReliability,
  }

  const expandBase = {
    historical: lerp(0.18, 0.34, maturity),
    slotDemand: lerp(0.16, 0.14, maturity),
    interest: lerp(0.18, 0.14, maturity),
    membershipFit: lerp(0.12, 0.12, maturity),
    skillProfile: lerp(0.20, 0.08, maturity),
    ageTimeFit: lerp(0.05, 0.02, maturity),
    momentum: lerp(0.06, 0.08, maturity),
    courtHeadroom: lerp(0.03, 0.05, maturity),
    weekdayStrength: lerp(0.02, 0.03, maturity),
  }
  const gapBase = {
    historical: lerp(0.10, 0.18, maturity),
    slotDemand: lerp(0.22, 0.20, maturity),
    interest: lerp(0.20, 0.18, maturity),
    membershipFit: lerp(0.12, 0.12, maturity),
    skillProfile: lerp(0.21, 0.08, maturity),
    ageTimeFit: lerp(0.06, 0.02, maturity),
    momentum: lerp(0.04, 0.08, maturity),
    courtHeadroom: lerp(0.03, 0.08, maturity),
    weekdayStrength: lerp(0.02, 0.06, maturity),
  }

  return {
    maturity,
    reliabilities,
    weights: {
      expand: normaliseWeightRecord({
        historical: expandBase.historical * reliabilities.history,
        slotDemand: expandBase.slotDemand * Math.max(reliabilities.weekday, opts.slotSupply.size > 0 ? 0.35 : 0),
        interest: expandBase.interest * Math.max(reliabilities.interest, openInterestCount > 0 ? 0.35 : 0),
        membershipFit: expandBase.membershipFit * reliabilities.membershipFit,
        skillProfile: expandBase.skillProfile * reliabilities.skillProfile,
        ageTimeFit: expandBase.ageTimeFit * reliabilities.ageProfile,
        momentum: expandBase.momentum * reliabilities.momentum,
        courtHeadroom: expandBase.courtHeadroom * reliabilities.courtOps,
        weekdayStrength: expandBase.weekdayStrength * reliabilities.weekday,
      }),
      gap: normaliseWeightRecord({
        historical: gapBase.historical * Math.max(reliabilities.history, opts.slotSupply.size > 0 ? 0.25 : 0),
        slotDemand: gapBase.slotDemand * Math.max(reliabilities.weekday, 0.35),
        interest: gapBase.interest * Math.max(reliabilities.interest, openInterestCount > 0 ? 0.4 : 0),
        membershipFit: gapBase.membershipFit * reliabilities.membershipFit,
        skillProfile: gapBase.skillProfile * reliabilities.skillProfile,
        ageTimeFit: gapBase.ageTimeFit * reliabilities.ageProfile,
        momentum: gapBase.momentum * Math.max(reliabilities.momentum, 0.35),
        courtHeadroom: gapBase.courtHeadroom * reliabilities.courtOps,
        weekdayStrength: gapBase.weekdayStrength * Math.max(reliabilities.weekday, 0.35),
      }),
    },
  } satisfies ProgrammingWeightProfile
}

function getTopFormats(formatDemand: Map<PlaySessionFormat, number>) {
  const fallback: PlaySessionFormat[] = ['OPEN_PLAY', 'CLINIC', 'DRILL', 'SOCIAL', 'LEAGUE_PLAY']
  const ranked = Array.from(formatDemand.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([format]) => format)
  return Array.from(new Set([...ranked, ...fallback])).slice(0, 3)
}

function getTopSkills(
  skillDemand: Map<PlaySessionSkillLevel, number>,
  audienceProfile?: ProgrammingAudienceProfile | null,
) {
  const scoreBySkill = new Map<PlaySessionSkillLevel, number>()
  for (const [skill, score] of Array.from(skillDemand.entries())) {
    addDemand(scoreBySkill, skill, score * 2)
  }
  const profileSkillDemand = getProfileSkillDemandMap(audienceProfile)
  for (const [skill, score] of Array.from(profileSkillDemand.entries())) {
    addDemand(scoreBySkill, skill, score)
  }

  const ranked = Array.from(scoreBySkill.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([skill]) => skill)
  const includeAllLevels =
    scoreBySkill.has('ALL_LEVELS') ||
    profileSkillDemand.size >= 3
  const fallback: PlaySessionSkillLevel[] = includeAllLevels
    ? ['INTERMEDIATE', 'BEGINNER', 'ADVANCED', 'ALL_LEVELS']
    : ['INTERMEDIATE', 'BEGINNER', 'ADVANCED']

  return Array.from(
    new Set([
      ...ranked.filter((skill) => includeAllLevels || skill !== 'ALL_LEVELS'),
      ...fallback,
    ]),
  ).slice(0, 3)
}

function getPrimarySlotCombo(opts: {
  comboStats: Map<string, ComboStat>
  dayOfWeek: DayOfWeek
  timeSlot: TimeSlot
}) {
  return Array.from(opts.comboStats.values())
    .filter((stat) => stat.dayOfWeek === opts.dayOfWeek && stat.timeSlot === opts.timeSlot)
    .sort((left, right) => {
      const rightAverageOccupancy = right.occupancySum / Math.max(right.sessionCount, 1)
      const leftAverageOccupancy = left.occupancySum / Math.max(left.sessionCount, 1)
      if (rightAverageOccupancy !== leftAverageOccupancy) {
        return rightAverageOccupancy - leftAverageOccupancy
      }
      return right.sessionCount - left.sessionCount
    })[0]
}

function getGapSlotSimilarityMultiplier(opts: {
  primaryCombo?: ComboStat
  format: PlaySessionFormat
  skillLevel: PlaySessionSkillLevel
}) {
  if (!opts.primaryCombo) return 1
  if (
    opts.primaryCombo.format === opts.format &&
    opts.primaryCombo.skillLevel === opts.skillLevel
  ) return 1
  if (
    opts.primaryCombo.format === opts.format ||
    opts.primaryCombo.skillLevel === opts.skillLevel
  ) return 0.72
  return 0.55
}

function buildExpandPeakProposals(opts: {
  comboStats: Map<string, ComboStat>
  slotDemand: Map<string, number>
  interestSlotDemand: Map<string, number>
  formatDemand: Map<PlaySessionFormat, number>
  skillDemand: Map<PlaySessionSkillLevel, number>
  slotSupply: Map<string, SlotSupplyStat>
  audienceProfile?: ProgrammingAudienceProfile | null
  weightProfile: ProgrammingWeightProfile
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
    const skillProfileFit = getSkillProfileFitScore({
      skillLevel: stat.skillLevel,
      audienceProfile: opts.audienceProfile,
    })
    const ageTimeFit = getAgeTimeFitScore({
      dayOfWeek: stat.dayOfWeek,
      timeSlot: stat.timeSlot,
      audienceProfile: opts.audienceProfile,
    })
    const courtHeadroom = getCourtHeadroomScore({
      slotKey,
      slotSupply: opts.slotSupply,
      courtCount: opts.courtCount,
    })
    const historicalScore = clamp(Math.round(avgOccupancy * Math.min(1, stat.sessionCount / 6)), 35, 100)
    const scoreSignals = opts.weightProfile.weights.expand
    const score = clamp(
      Math.round(
        historicalScore * scoreSignals.historical +
        slotDemandScore * scoreSignals.slotDemand +
        Math.min(100, interestBacklog * 18) * scoreSignals.interest +
        membershipFit * scoreSignals.membershipFit +
        skillProfileFit * scoreSignals.skillProfile +
        ageTimeFit * scoreSignals.ageTimeFit +
        momentum * scoreSignals.momentum +
        courtHeadroom * scoreSignals.courtHeadroom +
        weekdayStrength * scoreSignals.weekdayStrength,
      ),
      32,
      95,
    )
    const projectedOccupancy = clamp(
      Math.round(
        avgOccupancy * 0.68 +
        slotDemandScore * 0.18 +
        Math.min(100, interestBacklog * 18) * 0.08 +
        skillProfileFit * 0.06
      ),
      55,
      95,
    )
    const estimatedInterestedMembers = Math.max(
      4,
      Math.round(
        (projectedOccupancy / 100) * Math.max(stat.maxPlayersTotal / Math.max(stat.sessionCount, 1), 8) +
        slotDemandScore * 0.08 +
        interestBacklog * 0.9,
      ),
    )
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
        `${membershipFit}% demand-fit and ${skillProfileFit}% skill-pool fit line up with this ${formatLabel(stat.format).toLowerCase()} / ${skillLabel(stat.skillLevel).toLowerCase()} shape.`,
        `Recent momentum is ${momentum >= 72 ? 'strong' : momentum >= 58 ? 'steady' : 'mixed'} for this window.`,
        'Adding another recurring option here should capture demand without changing live schedule yet.',
      ].slice(0, 4),
    })
  }

  return proposals
}

function buildGapFillProposals(opts: {
  comboStats: Map<string, ComboStat>
  slotDemand: Map<string, number>
  interestSlotDemand: Map<string, number>
  slotSupply: Map<string, SlotSupplyStat>
  formatDemand: Map<PlaySessionFormat, number>
  skillDemand: Map<PlaySessionSkillLevel, number>
  audienceProfile?: ProgrammingAudienceProfile | null
  weightProfile: ProgrammingWeightProfile
  courtCount?: number
}): AdvisorProgrammingProposalDraft[] {
  const proposals: AdvisorProgrammingProposalDraft[] = []
  const candidateFormats = getTopFormats(opts.formatDemand)
  const candidateSkills = getTopSkills(opts.skillDemand, opts.audienceProfile)
  const hasFormatSignals = sumMapValues(opts.formatDemand) > 0
  const hasSkillSignals = sumMapValues(opts.skillDemand) > 0
  const peakFormatSignal = maxMapValue(opts.formatDemand)
  const peakSkillSignal = maxMapValue(opts.skillDemand)

  for (const dayOfWeek of DAYS) {
    for (const timeSlot of TIME_SLOTS) {
      const slotKey = `${dayOfWeek}|${timeSlot}`
      const demand = opts.slotDemand.get(slotKey) || 0
      const interestBacklog = opts.interestSlotDemand.get(slotKey) || 0
      const supply = opts.slotSupply.get(slotKey)
      const slotAvgOccupancy = supply ? average(supply.occupancyValues) : 0
      const primaryCombo = getPrimarySlotCombo({
        comboStats: opts.comboStats,
        dayOfWeek,
        timeSlot,
      })

      if (demand < 3) continue
      if (supply && supply.sessionCount > 0 && slotAvgOccupancy < 68) continue

      const weekdayStrength = getRelativeDemandScore(slotKey, opts.slotDemand)
      const momentum = supply
        ? getRecencyMomentum(supply.latestDateMs, supply.recentSessionCount)
        : clamp(52 + demand * 8, 48, 88)
      const courtHeadroom = getCourtHeadroomScore({
        slotKey,
        slotSupply: opts.slotSupply,
        courtCount: opts.courtCount,
      })
      const ageTimeFit = getAgeTimeFitScore({
        dayOfWeek,
        timeSlot,
        audienceProfile: opts.audienceProfile,
      })

      for (const format of candidateFormats) {
        const formatSignal = opts.formatDemand.get(format) || 0
        for (const skillLevel of candidateSkills) {
          const skillSignal = opts.skillDemand.get(skillLevel) || 0
          if (supply && supply.sessionCount > 0 && !opts.audienceProfile) {
            if (
              hasFormatSignals &&
              formatSignal < peakFormatSignal * 0.45 &&
              interestBacklog === 0
            ) continue
            if (
              hasSkillSignals &&
              skillLevel !== 'ALL_LEVELS' &&
              skillSignal < peakSkillSignal * 0.45
            ) continue
          }

          const membershipFit = getMembershipFitScore({
            format,
            skillLevel,
            formatDemand: opts.formatDemand,
            skillDemand: opts.skillDemand,
          })
          const skillProfileFit = getSkillProfileFitScore({
            skillLevel,
            audienceProfile: opts.audienceProfile,
          })
          const window = defaultSlotWindow(timeSlot, format)
          const slotSimilarityMultiplier = getGapSlotSimilarityMultiplier({
            primaryCombo,
            format,
            skillLevel,
          })
          const historicalScore = supply
            ? clamp(
              Math.round(slotAvgOccupancy * slotSimilarityMultiplier),
              slotSimilarityMultiplier >= 1 ? 45 : 34,
              slotSimilarityMultiplier >= 1 ? 92 : slotSimilarityMultiplier >= 0.72 ? 78 : 68,
            )
            : 50
          const scoreSignals = opts.weightProfile.weights.gap
          const projectedOccupancy = clamp(
            Math.round(
              historicalScore * 0.38 +
              Math.min(100, demand * 16) * 0.26 +
              Math.min(100, interestBacklog * 18) * 0.18 +
              membershipFit * 0.10 +
              skillProfileFit * 0.08
            ),
            52,
            92,
          )
          const confidence = clamp(
            Math.round(
              historicalScore * scoreSignals.historical +
              Math.min(100, demand * 16) * scoreSignals.slotDemand +
              Math.min(100, interestBacklog * 18) * scoreSignals.interest +
              membershipFit * scoreSignals.membershipFit +
              skillProfileFit * scoreSignals.skillProfile +
              ageTimeFit * scoreSignals.ageTimeFit +
              momentum * scoreSignals.momentum +
              courtHeadroom * scoreSignals.courtHeadroom +
              weekdayStrength * scoreSignals.weekdayStrength
            ),
            44,
            94,
          )

          proposals.push({
            id: buildProposalId({
              dayOfWeek,
              timeSlot,
              format,
              skillLevel,
            }),
            title: buildProgrammingTitle({
              dayOfWeek,
              timeSlot,
              format,
              skillLevel,
            }),
            dayOfWeek,
            timeSlot,
            startTime: window.startTime,
            endTime: window.endTime,
            format,
            skillLevel,
            maxPlayers: getRequestedMaxPlayers(format),
            projectedOccupancy,
            estimatedInterestedMembers: Math.max(
              4,
              Math.round((projectedOccupancy / 100) * getRequestedMaxPlayers(format) + demand * 0.45 + interestBacklog * 0.9),
            ),
            confidence,
            source: 'fill_gap',
            rationale: [
              supply?.sessionCount
                ? `${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()} sessions are already averaging ${Math.round(slotAvgOccupancy)}% full.`
                : `No recent sessions are scheduled on ${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()}.`,
              `${Math.round(demand)} member-demand signals line up with this window.`,
              interestBacklog > 0
                ? `${Math.round(interestBacklog)} queued notify-me request${Math.round(interestBacklog) === 1 ? '' : 's'} are still waiting for this kind of slot.`
                : `${courtHeadroom}% court headroom suggests this slot is operationally manageable if the club wants to test it.`,
              `${membershipFit}% demand-fit and ${skillProfileFit}% skill-pool fit support this ${formatLabel(format).toLowerCase()} / ${skillLabel(skillLevel).toLowerCase()} mix.`,
              `Weekday signal is ${weekdayStrength >= 72 ? 'strong' : weekdayStrength >= 58 ? 'steady' : 'emerging'} for this slot.`,
              'This is a safe draft-only way to test new programming before publishing anything live.',
            ].slice(0, 4),
          })
        }
      }
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
      (proposal.conflict.overlapRisk === 'high' ? 20 : proposal.conflict.overlapRisk === 'medium' ? 8 : 0) +
      (proposal.conflict.cannibalizationRisk === 'high' ? 28 : proposal.conflict.cannibalizationRisk === 'medium' ? 12 : 0) +
      (proposal.conflict.courtPressureRisk === 'high' ? 16 : proposal.conflict.courtPressureRisk === 'medium' ? 7 : 0)
    )
    : 0
  const interestPressure = clamp(
    Math.round((proposal.estimatedInterestedMembers / Math.max(proposal.maxPlayers || 1, 1)) * 100),
    0,
    100,
  )

  return (
    proposal.confidence * 1.0 +
    proposal.projectedOccupancy * 0.55 +
    interestPressure * 0.4 -
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
  profilePriorBlend: number
  courtCount?: number
}) {
  const insights: string[] = []
  const topProposal = opts.proposals[0]
  if (topProposal) {
    insights.push(`${topProposal.dayOfWeek} ${timeSlotLabel(topProposal.timeSlot).toLowerCase()} is the clearest programming opportunity right now.`)
  }

  if (opts.profilePriorBlend >= 0.5) {
    insights.push('With limited schedule history and explicit preferences, member profile data is carrying more of this draft than usual.')
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
    insights.push(`${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()} has ${Math.round(strongestGap[1])} member-demand signals behind it.`)
  }

  const topFormatDemand = opts.formatDemand.get(opts.topFormat) || 0
  if (topFormatDemand > 0) {
    insights.push(`${formatLabel(opts.topFormat)} has the cleanest membership-fit signal in the current demand mix.`)
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
  audienceProfile?: ProgrammingAudienceProfile | null
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
    profilePriorBlend,
  } = buildDemandSignals(
    opts.preferences,
    opts.interestRequests || [],
    opts.audienceProfile,
    opts.sessions.length,
  )
  const weightProfile = computeProgrammingWeightProfile({
    sessions: opts.sessions,
    preferences: opts.preferences,
    interestRequests: opts.interestRequests || [],
    comboStats,
    slotSupply,
    audienceProfile: opts.audienceProfile,
    courtCount: opts.courtCount,
  })
  const topFormat = getTopFormats(formatDemand)[0] || 'OPEN_PLAY'
  const topSkill = getTopSkills(skillDemand, opts.audienceProfile)[0] || 'INTERMEDIATE'

  const baseProposals = dedupeProposals([
    ...buildExpandPeakProposals({
      comboStats,
      slotDemand,
      interestSlotDemand,
      formatDemand,
      skillDemand,
      slotSupply,
      audienceProfile: opts.audienceProfile,
      weightProfile,
      courtCount: opts.courtCount,
    }),
    ...buildGapFillProposals({
      comboStats,
      slotDemand,
      interestSlotDemand,
      slotSupply,
      formatDemand,
      skillDemand,
      audienceProfile: opts.audienceProfile,
      weightProfile,
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
      profilePriorBlend,
      courtCount: opts.courtCount,
    }),
  }
}

async function loadProgrammingData(prisma: any, clubId: string) {
  const since = new Date()
  since.setDate(since.getDate() - 60)

  const [sessions, preferences, interestRequests, courtCount, followers] = await Promise.all([
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
    prisma.clubFollower.findMany({
      where: { clubId },
      select: {
        user: {
          select: {
            skillLevel: true,
            dateOfBirth: true,
            gender: true,
          },
        },
      },
      take: 5000,
    }).catch(() => []),
  ])

  return {
    sessions: sessions as ProgrammingSessionRow[],
    preferences: preferences as ProgrammingPreferenceRow[],
    interestRequests: interestRequests as ProgrammingInterestRequestRow[],
    courtCount: typeof courtCount === 'number' ? courtCount : 0,
    audienceProfile: buildProgrammingAudienceProfileFromMembers(
      (followers as Array<{ user?: { skillLevel?: string | null; dateOfBirth?: Date | null; gender?: string | null } | null }>)
        .flatMap((follower) => follower.user ? [follower.user] : []),
    ),
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
    audienceProfile: data.audienceProfile,
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
