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

export type AdvisorProgrammingProposalSource = 'expand_peak' | 'fill_gap'

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
}

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
        slotDemand.set(key, (slotDemand.get(key) || 0) + weight)
      }
    }

    const normalizedFormats = (pref.preferredFormats || [])
      .map((value) => normalizeFormat(value))
      .filter((value): value is PlaySessionFormat => !!value)

    for (const format of normalizedFormats) {
      formatDemand.set(format, (formatDemand.get(format) || 0) + weight)
    }

    const skillLevel = pref.skillLevel || 'ALL_LEVELS'
    skillDemand.set(skillLevel, (skillDemand.get(skillLevel) || 0) + weight)
  }

  return { slotDemand, formatDemand, skillDemand }
}

function buildSessionStats(sessions: ProgrammingSessionRow[]) {
  const comboStats = new Map<string, ComboStat>()
  const slotSupply = new Map<string, { sessionCount: number; occupancyValues: number[] }>()

  for (const session of sessions) {
    const dayOfWeek = toDayOfWeek(session.date)
    const timeSlot = timeSlotFromTime(session.startTime)
    const occupancy = clamp(
      Math.round(((session.registeredCount || 0) / Math.max(session.maxPlayers || 1, 1)) * 100),
      0,
      100,
    )
    const comboKey = `${dayOfWeek}|${timeSlot}|${session.format}|${session.skillLevel}`
    const existingCombo = comboStats.get(comboKey)

    if (existingCombo) {
      existingCombo.sessionCount += 1
      existingCombo.occupancySum += occupancy
      existingCombo.maxPlayersTotal += session.maxPlayers || 0
      existingCombo.registeredTotal += session.registeredCount || 0
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
      })
    }

    const slotKey = `${dayOfWeek}|${timeSlot}`
    const existingSlot = slotSupply.get(slotKey)
    if (existingSlot) {
      existingSlot.sessionCount += 1
      existingSlot.occupancyValues.push(occupancy)
    } else {
      slotSupply.set(slotKey, {
        sessionCount: 1,
        occupancyValues: [occupancy],
      })
    }
  }

  return { comboStats, slotSupply }
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
}): AdvisorProgrammingProposalDraft[] {
  const proposals: AdvisorProgrammingProposalDraft[] = []

  for (const stat of Array.from(opts.comboStats.values())) {
    const avgOccupancy = Math.round(stat.occupancySum / Math.max(stat.sessionCount, 1))
    if (stat.sessionCount < 2 || avgOccupancy < 72) continue

    const slotDemandScore = opts.slotDemand.get(`${stat.dayOfWeek}|${stat.timeSlot}`) || 0
    const score = clamp(
      Math.round(avgOccupancy * 0.72 + slotDemandScore * 4.2 + Math.min(stat.sessionCount * 2, 10)),
      45,
      98,
    )
    const projectedOccupancy = clamp(Math.round(avgOccupancy + Math.min(slotDemandScore * 1.2, 8)), 55, 95)
    const estimatedInterestedMembers = Math.max(4, Math.round(slotDemandScore * 1.4))
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
        'Adding another recurring option here should capture demand without changing live schedule yet.',
      ].slice(0, 3),
    })
  }

  return proposals
}

function buildGapFillProposals(opts: {
  slotDemand: Map<string, number>
  slotSupply: Map<string, { sessionCount: number; occupancyValues: number[] }>
  topFormat: PlaySessionFormat
  topSkill: PlaySessionSkillLevel
}): AdvisorProgrammingProposalDraft[] {
  const proposals: AdvisorProgrammingProposalDraft[] = []

  for (const dayOfWeek of DAYS) {
    for (const timeSlot of TIME_SLOTS) {
      const slotKey = `${dayOfWeek}|${timeSlot}`
      const demand = opts.slotDemand.get(slotKey) || 0
      const supply = opts.slotSupply.get(slotKey)
      const slotAvgOccupancy = supply ? average(supply.occupancyValues) : 0

      if (demand < 3) continue
      if (supply && supply.sessionCount > 0 && slotAvgOccupancy < 68) continue

      const window = defaultSlotWindow(timeSlot, opts.topFormat)
      const projectedOccupancy = clamp(
        Math.round(58 + demand * 4 + (supply ? Math.max(0, slotAvgOccupancy - 68) * 0.3 : 10)),
        52,
        92,
      )
      const confidence = clamp(
        Math.round(54 + demand * 5 + (supply ? Math.max(0, slotAvgOccupancy - 70) * 0.5 : 12)),
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
        estimatedInterestedMembers: Math.max(4, Math.round(demand * 1.7)),
        confidence,
        source: 'fill_gap',
        rationale: [
          supply?.sessionCount
            ? `${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()} sessions are already averaging ${Math.round(slotAvgOccupancy)}% full.`
            : `No recent sessions are scheduled on ${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()}.`,
          `${Math.round(demand)} member preference signals line up with this window.`,
          'This is a safe draft-only way to test new programming before publishing anything live.',
        ].slice(0, 3),
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

function rankProgrammingProposals(proposals: AdvisorProgrammingProposalDraft[]) {
  return proposals.sort((left, right) => {
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
}) {
  const insights: string[] = []
  const topProposal = opts.proposals[0]
  if (topProposal) {
    insights.push(`${topProposal.dayOfWeek} ${timeSlotLabel(topProposal.timeSlot).toLowerCase()} is the clearest programming opportunity right now.`)
  }

  insights.push(`Most consistent member demand is clustering around ${formatLabel(opts.topFormat)} sessions.`)
  if (opts.topSkill !== 'ALL_LEVELS') {
    insights.push(`${skillLabel(opts.topSkill)} programming is showing the strongest repeat demand signal.`)
  }

  const strongestGap = Array.from(opts.slotDemand.entries())
    .sort((left, right) => right[1] - left[1])[0]
  if (strongestGap) {
    const [dayOfWeek, timeSlot] = strongestGap[0].split('|') as [DayOfWeek, TimeSlot]
    insights.push(`${dayOfWeek} ${timeSlotLabel(timeSlot).toLowerCase()} has ${Math.round(strongestGap[1])} preference signals behind it.`)
  }

  return insights.slice(0, 4)
}

export function buildAdvisorProgrammingPlan(opts: {
  sessions: ProgrammingSessionRow[]
  preferences: ProgrammingPreferenceRow[]
  request?: AdvisorProgrammingRequestSpec | null
  limit?: number
}) {
  const { comboStats, slotSupply } = buildSessionStats(opts.sessions)
  const { slotDemand, formatDemand, skillDemand } = buildPreferenceDemand(opts.preferences)
  const topFormat = getTopDemandKey(formatDemand, 'OPEN_PLAY')
  const topSkill = getTopDemandKey(skillDemand, 'INTERMEDIATE')

  const ranked = rankProgrammingProposals(dedupeProposals([
    ...buildExpandPeakProposals({ comboStats, slotDemand }),
    ...buildGapFillProposals({ slotDemand, slotSupply, topFormat, topSkill }),
  ]))

  const recommended = ranked[0] || null
  const requested = buildRequestedProposal({
    spec: opts.request || {},
    recommended,
  })

  const proposals = (requested ? [requested, ...ranked.filter((proposal) => !sameProposal(proposal, requested))] : ranked)
    .slice(0, Math.max(1, opts.limit || 3))

  return {
    requested,
    recommended,
    proposals,
    insights: buildInsights({
      proposals: ranked.slice(0, 3),
      topFormat,
      topSkill,
      slotDemand,
    }),
  }
}

async function loadProgrammingData(prisma: any, clubId: string) {
  const since = new Date()
  since.setDate(since.getDate() - 60)

  const [sessions, preferences] = await Promise.all([
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
  ])

  return {
    sessions: sessions as ProgrammingSessionRow[],
    preferences: preferences as ProgrammingPreferenceRow[],
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
    request,
    limit: opts.limit || 3,
  })

  return {
    ...plan,
    request,
    hasData: data.sessions.length > 0 || data.preferences.length > 0,
  }
}
