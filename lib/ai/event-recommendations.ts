/**
 * Event Recommendations — pure scoring/generation function
 * Analyzes club member data + CSV session history to recommend events.
 * No database access, no side effects.
 *
 * Matrix approach: generates candidates for every format × skill cluster
 * instead of hardcoding 4 event types.
 */

import type {
  MemberData,
  UserPlayPreferenceData,
  BookingHistory,
  EventRecommendation,
  EventType,
  MatchedPlayer,
  PlaySessionSkillLevel,
} from '../../types/intelligence'
import { inferSkillLevel, getDayName, getTimeSlot, clamp } from './scoring'

// ── Input Types ──

export interface CsvSessionMeta {
  date: string
  startTime: string
  endTime: string
  court: string
  format: string
  skillLevel: string
  registered: number
  capacity: number
  occupancy: number
  playerNames: string[]
  pricePerPlayer?: number | null
}

interface MemberWithData {
  member: MemberData
  preference: UserPlayPreferenceData | null
  history: BookingHistory
}

export interface EventRecommendationInput {
  members: MemberWithData[]
  csvSessions: CsvSessionMeta[]
  courtCount: number
}

// ── Internal Types ──

interface PlayerCluster {
  skillLevel: PlaySessionSkillLevel
  duprMin: number
  duprMax: number
  members: MemberWithData[]
  activeCount: number   // bookingsLastMonth >= 3
  moderateCount: number // bookingsLastMonth >= 1
  newInactiveCount: number // bookingsLastMonth === 0
}

interface TimeSlotOccupancy {
  day: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
  avgOccupancy: number
  sessionCount: number
}

interface FormatStats {
  count: number
  avgOccupancy: number
  avgPrice: number | null
  popularSlots: Array<{ day: string; timeSlot: string }>
}

interface EventCandidate {
  type: EventType
  cluster: PlayerCluster | null
  selectedMembers: MemberWithData[]
  day: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
  courts: number
  reason: string
  skillRange: string
  leagueWeeks?: number
}

// ── Constants ──

const COST_PER_COURT_HOUR = 20
const DEFAULT_COURT_COUNT = 4

const EVENT_CONFIGS: Record<EventType, {
  emoji: string
  durationHours: number
  defaultPrice: number
  maxPlayers: number
  formatLabel: string
  minPlayers: number
  csvFormats: string[]
}> = {
  'Open Play': {
    emoji: '🎾',
    durationHours: 2,
    defaultPrice: 10,
    maxPlayers: 16,
    formatLabel: 'Open Play — drop-in, rotating partners',
    minPlayers: 4,
    csvFormats: ['OPEN_PLAY', 'SOCIAL'],
  },
  'Round Robin': {
    emoji: '🏆',
    durationHours: 3,
    defaultPrice: 25,
    maxPlayers: 16,
    formatLabel: 'Round Robin (pools of 4 → single elimination)',
    minPlayers: 8,
    csvFormats: [],
  },
  'Clinic': {
    emoji: '📚',
    durationHours: 1.5,
    defaultPrice: 25,
    maxPlayers: 8,
    formatLabel: 'Coached Clinic — technique & strategy',
    minPlayers: 3,
    csvFormats: ['CLINIC'],
  },
  'Drill': {
    emoji: '🎯',
    durationHours: 1.5,
    defaultPrice: 20,
    maxPlayers: 8,
    formatLabel: 'Drill Session — focused repetition',
    minPlayers: 3,
    csvFormats: ['DRILL'],
  },
  'League': {
    emoji: '⚡',
    durationHours: 2,
    defaultPrice: 35,
    maxPlayers: 12,
    formatLabel: 'Fixed Doubles Teams, Round Robin',
    minPlayers: 8,
    csvFormats: ['LEAGUE_PLAY'],
  },
  'Ladder': {
    emoji: '🪜',
    durationHours: 0,
    defaultPrice: 30,
    maxPlayers: 20,
    formatLabel: 'Ongoing Ranking Ladder — challenge matches',
    minPlayers: 6,
    csvFormats: [],
  },
}

const ALL_FORMATS: EventType[] = ['Open Play', 'Round Robin', 'Clinic', 'Drill', 'League', 'Ladder']

// ── Main Export ──

export function generateEventRecommendations(input: EventRecommendationInput): EventRecommendation[] {
  const { members, csvSessions, courtCount } = input
  if (members.length < 3) return [] // not enough data

  // Phase 1: Cluster players by skill
  const clusters = buildPlayerClusters(members)

  // Phase 2: Analyze occupancy patterns + CSV format usage
  const occupancySlots = analyzeOccupancy(csvSessions)
  const underutilizedSlots = occupancySlots
    .filter(s => s.avgOccupancy < 40)
    .sort((a, b) => a.avgOccupancy - b.avgOccupancy)
  const formatStats = analyzeCsvFormats(csvSessions)

  // Phase 3: Generate candidate events (format × skill matrix)
  const candidates = generateCandidates(clusters, underutilizedSlots, courtCount, members, formatStats)

  // Phase 4: Score and rank
  const scored = candidates.map(c =>
    scoreEvent(c, occupancySlots, members.length, formatStats)
  )

  // Sort: urgency desc → fillConfidence desc
  const urgencyOrder = { high: 3, medium: 2, low: 1 }
  scored.sort((a, b) => {
    const uDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency]
    if (uDiff !== 0) return uDiff
    return b.fillConfidence - a.fillConfidence
  })

  // Deduplicate: at most 1 per event type (pick highest scored)
  const seen = new Set<EventType>()
  const deduped: EventRecommendation[] = []
  for (const ev of scored) {
    if (!seen.has(ev.type)) {
      seen.add(ev.type)
      deduped.push(ev)
    }
  }

  return deduped.slice(0, 5)
}

// ── Phase 1: Clustering ──

function buildPlayerClusters(members: MemberWithData[]): PlayerCluster[] {
  const buckets: Record<PlaySessionSkillLevel, MemberWithData[]> = {
    BEGINNER: [],
    INTERMEDIATE: [],
    ADVANCED: [],
    ALL_LEVELS: [],
  }

  for (const m of members) {
    const dupr = m.member.duprRatingDoubles ?? m.member.duprRatingSingles
    // Null DUPR + zero bookings = treat as BEGINNER (not INTERMEDIATE)
    let skill: PlaySessionSkillLevel
    if (dupr === null && m.history.totalBookings === 0) {
      skill = 'BEGINNER'
    } else {
      skill = inferSkillLevel(dupr)
    }
    if (skill === 'ALL_LEVELS') {
      buckets.INTERMEDIATE.push(m)
    } else {
      buckets[skill].push(m)
    }
  }

  const clusters: PlayerCluster[] = []
  for (const [skillLevel, group] of Object.entries(buckets)) {
    if (skillLevel === 'ALL_LEVELS' || group.length === 0) continue

    const duprs = group
      .map(m => m.member.duprRatingDoubles ?? m.member.duprRatingSingles ?? 0)
      .filter(d => d > 0)
    const duprMin = duprs.length > 0 ? Math.min(...duprs) : 0
    const duprMax = duprs.length > 0 ? Math.max(...duprs) : 0

    let activeCount = 0
    let moderateCount = 0
    let newInactiveCount = 0
    for (const m of group) {
      if (m.history.bookingsLastMonth >= 3) activeCount++
      else if (m.history.bookingsLastMonth >= 1) moderateCount++
      else newInactiveCount++
    }

    clusters.push({
      skillLevel: skillLevel as PlaySessionSkillLevel,
      duprMin,
      duprMax,
      members: group,
      activeCount,
      moderateCount,
      newInactiveCount,
    })
  }

  return clusters
}

// ── Phase 2: Occupancy + Format Analysis ──

function analyzeOccupancy(csvSessions: CsvSessionMeta[]): TimeSlotOccupancy[] {
  const slotMap = new Map<string, { totalOcc: number; count: number }>()

  for (const s of csvSessions) {
    if (!s.date || !s.startTime) continue
    const dateObj = new Date(s.date)
    if (isNaN(dateObj.getTime())) continue
    const day = getDayName(dateObj)
    const ts = getTimeSlot(s.startTime)
    const key = `${day}|${ts}`
    const existing = slotMap.get(key) || { totalOcc: 0, count: 0 }
    existing.totalOcc += s.capacity > 0 ? (s.registered / s.capacity) * 100 : 0
    existing.count++
    slotMap.set(key, existing)
  }

  const result: TimeSlotOccupancy[] = []
  Array.from(slotMap.entries()).forEach(([key, val]) => {
    const [day, timeSlot] = key.split('|')
    result.push({
      day,
      timeSlot: timeSlot as 'morning' | 'afternoon' | 'evening',
      avgOccupancy: Math.round(val.totalOcc / val.count),
      sessionCount: val.count,
    })
  })

  return result
}

function analyzeCsvFormats(csvSessions: CsvSessionMeta[]): Map<string, FormatStats> {
  const map = new Map<string, {
    count: number
    totalOcc: number
    prices: number[]
    slots: Map<string, number>
  }>()

  for (const s of csvSessions) {
    if (!s.format || !s.date || !s.startTime) continue
    const fmt = s.format.toUpperCase()
    const existing = map.get(fmt) || { count: 0, totalOcc: 0, prices: [] as number[], slots: new Map<string, number>() }
    existing.count++
    existing.totalOcc += s.capacity > 0 ? (s.registered / s.capacity) * 100 : 0
    if (s.pricePerPlayer != null && s.pricePerPlayer > 0) {
      existing.prices.push(s.pricePerPlayer)
    }

    const dateObj = new Date(s.date)
    if (!isNaN(dateObj.getTime())) {
      const day = getDayName(dateObj)
      const ts = getTimeSlot(s.startTime)
      const slotKey = `${day}|${ts}`
      existing.slots.set(slotKey, (existing.slots.get(slotKey) || 0) + 1)
    }
    map.set(fmt, existing)
  }

  const result = new Map<string, FormatStats>()
  Array.from(map.entries()).forEach(([fmt, data]) => {
    // Top 3 popular slots
    const sortedSlots = Array.from(data.slots.entries())
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .slice(0, 3)
      .map((entry: [string, number]) => {
        const [day, timeSlot] = entry[0].split('|')
        return { day, timeSlot }
      })

    result.set(fmt, {
      count: data.count,
      avgOccupancy: Math.round(data.totalOcc / data.count),
      avgPrice: data.prices.length > 0
        ? Math.round(data.prices.reduce((s: number, p: number) => s + p, 0) / data.prices.length)
        : null,
      popularSlots: sortedSlots,
    })
  })

  return result
}

// ── Phase 3: Matrix-based Candidate Generation ──

function generateCandidates(
  clusters: PlayerCluster[],
  underutilizedSlots: TimeSlotOccupancy[],
  courtCount: number,
  allMembers: MemberWithData[],
  formatStats: Map<string, FormatStats>,
): EventCandidate[] {
  const candidates: EventCandidate[] = []
  const courts = Math.max(courtCount, DEFAULT_COURT_COUNT)

  // Pick a good slot — prefer underutilized, or default to Saturday afternoon
  const pickSlot = (preferred?: string, preferTimeSlot?: 'morning' | 'afternoon' | 'evening') => {
    if (preferred) {
      const match = underutilizedSlots.find(s =>
        s.day === preferred && (!preferTimeSlot || s.timeSlot === preferTimeSlot)
      )
      if (match) return match
      const dayMatch = underutilizedSlots.find(s => s.day === preferred)
      if (dayMatch) return dayMatch
    }
    if (preferTimeSlot) {
      const tsMatch = underutilizedSlots.find(s => s.timeSlot === preferTimeSlot)
      if (tsMatch) return tsMatch
    }
    if (underutilizedSlots.length > 0) return underutilizedSlots[0]
    return { day: 'Saturday', timeSlot: 'afternoon' as const, avgOccupancy: 50, sessionCount: 0 }
  }

  // Get CSV-informed slot for a format
  const getCsvSlot = (type: EventType) => {
    const config = EVENT_CONFIGS[type]
    for (const csvFmt of config.csvFormats) {
      const stats = formatStats.get(csvFmt)
      if (stats && stats.popularSlots.length > 0) {
        const s = stats.popularSlots[0]
        return { day: s.day, timeSlot: s.timeSlot as 'morning' | 'afternoon' | 'evening' }
      }
    }
    return null
  }

  // Get CSV-informed price for a format
  const getCsvPrice = (type: EventType): number => {
    const config = EVENT_CONFIGS[type]
    for (const csvFmt of config.csvFormats) {
      const stats = formatStats.get(csvFmt)
      if (stats?.avgPrice != null) return stats.avgPrice
    }
    return config.defaultPrice
  }

  // Determine league weeks based on player count
  const getLeagueWeeks = (playerCount: number): number => {
    if (playerCount >= 17) return 8
    if (playerCount >= 11) return 6
    return 4
  }

  for (const format of ALL_FORMATS) {
    const config = EVENT_CONFIGS[format]

    for (const cluster of clusters) {
      if (cluster.members.length < config.minPlayers) continue

      const engaged = cluster.activeCount + cluster.moderateCount
      const skill = cluster.skillLevel

      // Format-specific eligibility checks
      if (format === 'Round Robin') {
        // Need tight DUPR spread and enough engaged players
        const spread = cluster.duprMax - cluster.duprMin
        if (engaged < 4 || spread > 1.5) continue
      }

      if (format === 'League') {
        // Need enough regular players
        const regulars = cluster.members.filter(m => m.history.bookingsLastMonth >= 1).length
        if (regulars < 8) continue
      }

      if (format === 'Ladder') {
        // Need enough players with DUPR data for matching
        if (cluster.members.length < 6) continue
      }

      // Select members for the event
      let selected: MemberWithData[]
      let leagueWeeks: number | undefined

      switch (format) {
        case 'Open Play': {
          // Mix of new/inactive + some regulars for mentoring
          const newPlayers = cluster.members
            .filter(m => m.history.bookingsLastMonth === 0)
            .slice(0, 10)
          const regulars = cluster.members
            .filter(m => m.history.bookingsLastMonth >= 1 && !newPlayers.includes(m))
            .sort((a, b) => b.history.totalBookings - a.history.totalBookings)
            .slice(0, 6)
          selected = [...newPlayers, ...regulars].slice(0, config.maxPlayers)
          break
        }
        case 'Round Robin': {
          selected = [...cluster.members]
            .sort((a, b) => b.history.bookingsLastMonth - a.history.bookingsLastMonth)
            .slice(0, config.maxPlayers)
          break
        }
        case 'Clinic':
        case 'Drill': {
          selected = [...cluster.members]
            .sort((a, b) =>
              (a.member.duprRatingDoubles ?? a.member.duprRatingSingles ?? 0) -
              (b.member.duprRatingDoubles ?? b.member.duprRatingSingles ?? 0)
            )
            .slice(0, config.maxPlayers)
          break
        }
        case 'League': {
          const regulars = [...cluster.members]
            .filter(m => m.history.bookingsLastMonth >= 1)
            .sort((a, b) => b.history.bookingsLastMonth - a.history.bookingsLastMonth)
          selected = regulars.slice(0, config.maxPlayers)
          leagueWeeks = getLeagueWeeks(regulars.length)
          break
        }
        case 'Ladder': {
          selected = [...cluster.members]
            .sort((a, b) =>
              (b.member.duprRatingDoubles ?? b.member.duprRatingSingles ?? 0) -
              (a.member.duprRatingDoubles ?? a.member.duprRatingSingles ?? 0)
            )
            .slice(0, config.maxPlayers)
          break
        }
      }

      if (selected.length < config.minPlayers) continue

      // Pick slot — prefer CSV-informed, then format-appropriate defaults
      const csvSlot = getCsvSlot(format)
      let slot: { day: string; timeSlot: 'morning' | 'afternoon' | 'evening' }

      switch (format) {
        case 'Open Play':
          slot = csvSlot || pickSlot('Sunday', 'afternoon')
          break
        case 'Round Robin':
          slot = csvSlot || pickSlot('Saturday', 'afternoon')
          break
        case 'Clinic':
        case 'Drill':
          slot = csvSlot || pickSlot(undefined, 'morning')
          // Prefer weekday
          if (!csvSlot && !['Saturday', 'Sunday'].includes(slot.day)) {
            // already good
          } else if (!csvSlot) {
            const weekdaySlot = underutilizedSlots.find(
              s => s.timeSlot === 'morning' && !['Saturday', 'Sunday'].includes(s.day)
            )
            if (weekdaySlot) slot = weekdaySlot
            else slot = { day: 'Tuesday', timeSlot: 'morning' }
          }
          break
        case 'League': {
          // Find most popular preferred day among regulars
          const dayVotes = new Map<string, number>()
          for (const m of selected) {
            const days = m.preference?.preferredDays || []
            for (const d of days) dayVotes.set(d, (dayVotes.get(d) || 0) + 1)
          }
          let bestDay = 'Wednesday'
          let bestVotes = 0
          Array.from(dayVotes.entries()).forEach(([d, v]) => {
            if (v > bestVotes) { bestDay = d; bestVotes = v }
          })
          slot = csvSlot || pickSlot(bestDay, 'evening')
          if (slot.timeSlot === 'morning') slot = { ...slot, timeSlot: 'evening' }
          break
        }
        case 'Ladder':
          slot = { day: 'Monday', timeSlot: 'evening' } // ladder is ongoing, day is just start
          break
        default:
          slot = pickSlot()
      }

      // Build reason
      const skillLabels: Record<string, string> = {
        BEGINNER: 'beginner', INTERMEDIATE: 'intermediate', ADVANCED: 'advanced',
      }
      const skillLabel = skillLabels[skill] || skill.toLowerCase()
      const duprRange = cluster.duprMin > 0
        ? ` (DUPR ${cluster.duprMin.toFixed(1)}–${cluster.duprMax.toFixed(1)})`
        : ''

      let reason: string
      switch (format) {
        case 'Open Play':
          reason = `${selected.length} ${skillLabel} players available${duprRange}. Low-barrier drop-in format maximizes attendance.`
          break
        case 'Round Robin':
          reason = `${engaged} ${skillLabel} players${duprRange} with tight skill spread. Competitive format drives high engagement.`
          break
        case 'Clinic':
          reason = `${selected.length} ${skillLabel} players need structured coaching${duprRange}. ${slot.day} ${slot.timeSlot} has low utilization.`
          break
        case 'Drill':
          reason = `${selected.length} ${skillLabel} players available for focused practice${duprRange}. Drill sessions build muscle memory.`
          break
        case 'League':
          reason = `${selected.length} ${skillLabel} regulars${duprRange} book ${slot.day} evenings. A ${leagueWeeks}-week league locks in commitment.`
          break
        case 'Ladder':
          reason = `${selected.length} ${skillLabel} players${duprRange} can be ranked for ongoing challenge matches.`
          break
      }

      // Courts
      let eventCourts: number
      switch (format) {
        case 'Open Play': eventCourts = Math.min(3, courts); break
        case 'Round Robin': eventCourts = Math.min(4, courts); break
        case 'Clinic':
        case 'Drill': eventCourts = Math.min(2, courts); break
        case 'League': eventCourts = Math.min(3, courts); break
        case 'Ladder': eventCourts = 0; break // ongoing, no dedicated courts
      }

      candidates.push({
        type: format,
        cluster,
        selectedMembers: selected,
        day: slot.day,
        timeSlot: slot.timeSlot,
        courts: eventCourts,
        reason,
        skillRange: cluster.duprMin > 0
          ? `${cluster.duprMin.toFixed(1)} – ${cluster.duprMax.toFixed(1)} DUPR`
          : `${skillLabel.charAt(0).toUpperCase() + skillLabel.slice(1)} level`,
        leagueWeeks,
      })
    }
  }

  return candidates
}

// ── Phase 4: Scoring ──

function scoreEvent(
  candidate: EventCandidate,
  allOccupancy: TimeSlotOccupancy[],
  totalMembers: number,
  formatStats: Map<string, FormatStats>,
): EventRecommendation {
  const config = EVENT_CONFIGS[candidate.type]
  const maxPlayers = config.maxPlayers

  // Use CSV-informed price if available
  let price = config.defaultPrice
  for (const csvFmt of config.csvFormats) {
    const stats = formatStats.get(csvFmt)
    if (stats?.avgPrice != null) { price = stats.avgPrice; break }
  }

  const courts = candidate.courts
  const hours = config.durationHours
  const isLeague = candidate.type === 'League'
  const isLadder = candidate.type === 'Ladder'
  const weeks = isLeague ? (candidate.leagueWeeks || 6) : 1

  // Fill confidence components
  const clusterDensity = clamp(
    Math.round((candidate.selectedMembers.length / maxPlayers) * 100),
    0, 100
  )

  // Preference alignment: % of selected members whose preferences include the day
  let prefAligned = 0
  for (const m of candidate.selectedMembers) {
    if (m.preference?.preferredDays?.includes(candidate.day as any)) {
      prefAligned++
    }
  }
  const prefScore = candidate.selectedMembers.length > 0
    ? Math.round((prefAligned / candidate.selectedMembers.length) * 100)
    : 50

  // Activity recency: avg recency score
  let recencyTotal = 0
  for (const m of candidate.selectedMembers) {
    const days = m.history.daysSinceLastConfirmedBooking
    if (days === null || days > 365) recencyTotal += 20
    else if (days <= 7) recencyTotal += 100
    else if (days <= 30) recencyTotal += 70
    else if (days <= 90) recencyTotal += 40
    else recencyTotal += 20
  }
  const recencyScore = candidate.selectedMembers.length > 0
    ? Math.round(recencyTotal / candidate.selectedMembers.length)
    : 30

  // Format popularity: historical occupancy of the target slot
  const slotOcc = allOccupancy.find(
    s => s.day === candidate.day && s.timeSlot === candidate.timeSlot
  )
  const formatPop = slotOcc
    ? clamp(100 - slotOcc.avgOccupancy, 20, 100)
    : 70

  // Price sensitivity
  const avgPrice = 20
  const priceScore = clamp(Math.round(100 - ((price - avgPrice) / avgPrice) * 50), 30, 100)

  // CSV format bonus: boost score if club already runs this format
  let csvBonus = 0
  for (const csvFmt of config.csvFormats) {
    const stats = formatStats.get(csvFmt)
    if (stats && stats.count >= 3) { csvBonus = 10; break }
  }

  const fillConfidence = clamp(Math.round(
    clusterDensity * 0.25 +
    prefScore * 0.20 +
    recencyScore * 0.20 +
    formatPop * 0.15 +
    priceScore * 0.10 +
    csvBonus
  ), 15, 98)

  // Revenue
  const projectedRevenue = isLadder
    ? price * maxPlayers // one-time registration
    : price * maxPlayers * weeks
  const courtCost = isLadder ? 0 : courts * hours * COST_PER_COURT_HOUR * weeks
  const netRevenue = projectedRevenue - courtCost

  // Urgency
  const urgency: 'high' | 'medium' | 'low' =
    fillConfidence >= 80 || candidate.selectedMembers.length >= maxPlayers
      ? 'high'
      : fillConfidence >= 60
        ? 'medium'
        : 'low'

  // Matched players
  const matchedPlayers = buildMatchedPlayers(candidate.selectedMembers)

  // Insights
  const insights = buildInsights(candidate, matchedPlayers, maxPlayers, fillConfidence, slotOcc, netRevenue, weeks, price)

  // Suggested date
  const suggestedDate = formatNextDate(candidate.day)
  const suggestedTime = isLadder ? 'Ongoing' : formatTimeSlot(candidate.timeSlot, hours)

  // Stable ID
  const id = `evt-${candidate.type.toLowerCase().replace(/[^a-z]/g, '')}-${candidate.cluster?.skillLevel?.toLowerCase() || 'mixed'}`

  return {
    id,
    type: candidate.type,
    title: buildTitle(candidate),
    emoji: config.emoji,
    urgency,
    reason: candidate.reason,
    suggestedDate: isLeague
      ? `Starting ${suggestedDate} (${weeks} weeks)`
      : isLadder
        ? `Starting ${suggestedDate} (ongoing)`
        : suggestedDate,
    suggestedTime,
    courts,
    format: config.formatLabel,
    skillRange: candidate.skillRange,
    suggestedPrice: price,
    maxPlayers,
    matchedPlayers,
    projectedRevenue,
    courtCost,
    netRevenue,
    fillConfidence,
    insights,
    leagueWeeks: isLeague ? weeks : undefined,
    durationHours: hours,
  }
}

// ── Helpers ──

function buildMatchedPlayers(members: MemberWithData[]): MatchedPlayer[] {
  let maxDupr = 0
  for (const m of members) {
    const d = m.member.duprRatingDoubles ?? m.member.duprRatingSingles ?? 0
    if (d > maxDupr) maxDupr = d
  }

  return members.map(m => {
    const dupr = m.member.duprRatingDoubles ?? m.member.duprRatingSingles ?? 0
    const days = m.history.daysSinceLastConfirmedBooking

    let emoji = '📈'
    if (m.history.totalBookings === 0) emoji = '🆕'
    else if (dupr === maxDupr && dupr > 0) emoji = '⭐'
    else if (days !== null && days <= 3) emoji = '🔥'
    else if (m.history.bookingsLastMonth >= 4) emoji = '🎯'
    else if (dupr < 3.0 && m.history.bookingsLastMonth >= 1) emoji = '🤝'

    let lastPlayed = 'never at events'
    if (days !== null && days < 999) {
      if (days === 0) lastPlayed = 'today'
      else if (days === 1) lastPlayed = '1 day ago'
      else lastPlayed = `${days} days ago`
    }

    return {
      id: m.member.id,
      name: m.member.name || 'Unknown Player',
      dupr: Math.round(dupr * 10) / 10,
      emoji,
      lastPlayed,
      tournaments: m.history.totalBookings,
    }
  })
}

function buildInsights(
  candidate: EventCandidate,
  matched: MatchedPlayer[],
  maxPlayers: number,
  fillConfidence: number,
  slotOcc: TimeSlotOccupancy | undefined,
  netRevenue: number,
  weeks: number,
  price: number,
): string[] {
  const insights: string[] = []
  const openSpots = maxPlayers - matched.length

  insights.push(
    `${matched.length} of ${maxPlayers} spots auto-filled from member base` +
    (openSpots > 0 ? ` — ${openSpots} open slots needed` : '')
  )

  if (candidate.type !== 'Ladder') {
    if (slotOcc) {
      insights.push(
        `${candidate.day} ${candidate.timeSlot} has ${slotOcc.avgOccupancy}% court utilization currently` +
        (slotOcc.avgOccupancy < 30 ? ' — pure incremental revenue' : '')
      )
    } else {
      insights.push(
        `${candidate.day} ${candidate.timeSlot} has no scheduled sessions — pure incremental revenue`
      )
    }
  }

  switch (candidate.type) {
    case 'Open Play':
      insights.push('Low-barrier drop-in format is perfect for re-engaging inactive members')
      insights.push(`$${price} price point removes cost barrier for first-timers`)
      break
    case 'Round Robin':
      insights.push('Tournament players visit club 2x more the following week on average')
      insights.push('Similar events had 95% return rate for participants')
      break
    case 'Clinic':
      insights.push('Coached sessions create habit loops — 60% rebook within 2 weeks')
      insights.push('Clinic attendees upgrade membership tier 2x more often')
      break
    case 'Drill':
      insights.push('Drill sessions build muscle memory — 70% rebook within 2 weeks')
      insights.push('Focused practice improves player retention by 45%')
      break
    case 'League':
      insights.push(`${weeks}-week commitment = $${price}/week × ${weeks} = $${price * weeks}/player guaranteed revenue`)
      insights.push(`Total projected: $${netRevenue > 0 ? netRevenue : projectedFromLeague(price, maxPlayers, weeks)} over ${weeks} weeks from ${maxPlayers} players`)
      break
    case 'Ladder':
      insights.push('Ongoing ladder creates weekly engagement without fixed scheduling')
      insights.push(`$${price} registration fee × ${maxPlayers} players = $${price * maxPlayers} revenue`)
      insights.push('Ladder players show 3x higher monthly visit frequency')
      break
  }

  return insights.slice(0, 4)
}

function projectedFromLeague(price: number, maxPlayers: number, weeks: number): number {
  return price * maxPlayers * weeks
}

function buildTitle(candidate: EventCandidate): string {
  const skillLabels: Record<string, string> = {
    BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced',
  }
  const skill = skillLabels[candidate.cluster?.skillLevel || ''] || 'All-Level'

  switch (candidate.type) {
    case 'Open Play':
      return `${skill} Open Play`
    case 'Round Robin':
      return candidate.cluster?.skillLevel === 'ADVANCED'
        ? 'Advanced Round Robin Showdown'
        : `${skill} Round Robin Challenge`
    case 'Clinic':
      return `${candidate.day} ${skill} Clinic`
    case 'Drill':
      return `${candidate.day} ${skill} Drill Session`
    case 'League':
      return `${candidate.day} Night ${skill} League`
    case 'Ladder':
      return `${skill} Challenge Ladder`
  }
}

function formatNextDate(dayName: string): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const targetDay = days.indexOf(dayName)
  if (targetDay === -1) return dayName

  const now = new Date()
  const currentDay = now.getDay()
  let daysUntil = targetDay - currentDay
  if (daysUntil <= 0) daysUntil += 7

  const target = new Date(now)
  target.setDate(target.getDate() + daysUntil)

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${dayName}, ${months[target.getMonth()]} ${target.getDate()}`
}

function formatTimeSlot(slot: 'morning' | 'afternoon' | 'evening', hours: number): string {
  const starts: Record<string, number> = { morning: 9, afternoon: 14, evening: 18 }
  const startHour = starts[slot] || 18
  const endHour = startHour + hours

  const fmt = (h: number) => {
    const hr = Math.floor(h)
    const min = (h - hr) * 60
    const suffix = hr >= 12 ? 'PM' : 'AM'
    const display = hr > 12 ? hr - 12 : hr
    return min > 0 ? `${display}:${min.toString().padStart(2, '0')} ${suffix}` : `${display}:00 ${suffix}`
  }

  return `${fmt(startHour)} – ${fmt(endHour)}`
}
