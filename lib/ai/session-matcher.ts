/**
 * Session Matcher
 *
 * Finds the best upcoming session for a member based on their preferences
 * and computes social proof data (confirmed count, same-level count).
 *
 * Used by campaign engine (automated) and intelligence service (manual sends).
 */

import { getDayName, getTimeSlot, inferSkillLevel, isAdjacentSkillLevel, clamp } from './scoring'
import type { PlaySessionSkillLevel, DayOfWeek, TimeSlot } from '../../types/intelligence'

// ── Types ──

export interface SessionWithBookings {
  id: string
  title: string
  date: Date
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  maxPlayers: number
  _count: { bookings: number }
  bookings: Array<{ user: { duprRatingDoubles: any } }>
}

export interface MatchedSession {
  session: SessionWithBookings
  matchScore: number
  confirmedCount: number
  sameLevelCount: number
  spotsLeft: number
  deepLinkUrl: string
}

export interface SessionMatchInput {
  memberSkillLevel: PlaySessionSkillLevel
  preference: {
    preferredDays?: DayOfWeek[]
    preferredTimeSlots?: Record<TimeSlot, boolean>
    preferredFormats?: string[]
  } | null
  sessions: SessionWithBookings[]
  clubSlug: string
  appBaseUrl: string
}

// ── Scoring weights ──

const WEIGHTS = {
  dayMatch: 35,
  timeMatch: 20,
  skillMatch: 25,
  formatMatch: 10,
  availability: 10,
}

// ── Main functions ──

export function findBestSessionForMember(input: SessionMatchInput): MatchedSession | null {
  const results = findTopSessionsForMember(input, 1)
  return results[0] || null
}

export function findTopSessionsForMember(input: SessionMatchInput, limit = 3): MatchedSession[] {
  const { memberSkillLevel, preference, sessions, clubSlug, appBaseUrl } = input

  if (sessions.length === 0) return []

  const scored = sessions
    .filter(s => s._count.bookings < s.maxPlayers) // has spots
    .map(session => {
      const confirmedCount = session._count.bookings
      const spotsLeft = session.maxPlayers - confirmedCount

      // Count same-level players
      const sameLevelCount = session.bookings.filter(b => {
        const dupr = b.user.duprRatingDoubles ? Number(b.user.duprRatingDoubles) : null
        return inferSkillLevel(dupr) === memberSkillLevel
      }).length

      const matchScore = scoreSession(session, memberSkillLevel, preference, spotsLeft)

      const deepLinkUrl = `${appBaseUrl}/clubs/${clubSlug}/play?session=${session.id}`

      return { session, matchScore, confirmedCount, sameLevelCount, spotsLeft, deepLinkUrl }
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit)

  return scored
}

// ── Scoring (simplified slot-filler approach) ──

function scoreSession(
  session: SessionWithBookings,
  memberSkill: PlaySessionSkillLevel,
  pref: SessionMatchInput['preference'],
  spotsLeft: number,
): number {
  let total = 0

  // Day match (35%)
  const sessionDay = getDayName(new Date(session.date))
  if (pref?.preferredDays && pref.preferredDays.length > 0) {
    total += pref.preferredDays.includes(sessionDay) ? WEIGHTS.dayMatch : WEIGHTS.dayMatch * 0.3
  } else {
    total += WEIGHTS.dayMatch * 0.5 // no preference = neutral
  }

  // Time match (20%)
  const sessionTime = getTimeSlot(session.startTime)
  if (pref?.preferredTimeSlots) {
    total += pref.preferredTimeSlots[sessionTime] ? WEIGHTS.timeMatch : WEIGHTS.timeMatch * 0.3
  } else {
    total += WEIGHTS.timeMatch * 0.5
  }

  // Skill match (25%)
  const sessionSkill = session.skillLevel as PlaySessionSkillLevel
  if (sessionSkill === 'ALL_LEVELS') {
    total += WEIGHTS.skillMatch * 0.9
  } else if (sessionSkill === memberSkill) {
    total += WEIGHTS.skillMatch
  } else if (isAdjacentSkillLevel(memberSkill, sessionSkill)) {
    total += WEIGHTS.skillMatch * 0.6
  } else {
    total += WEIGHTS.skillMatch * 0.2
  }

  // Format match (10%)
  if (pref?.preferredFormats && pref.preferredFormats.length > 0) {
    total += pref.preferredFormats.includes(session.format) ? WEIGHTS.formatMatch : WEIGHTS.formatMatch * 0.3
  } else {
    total += WEIGHTS.formatMatch * 0.5
  }

  // Availability (10%) — more spots = higher score
  const availRatio = clamp(spotsLeft / Math.max(session.maxPlayers, 1), 0, 1)
  total += WEIGHTS.availability * (0.3 + 0.7 * availRatio)

  return Math.round(clamp(total, 0, 100))
}

// ── Helpers ──

export function formatSessionDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export function formatSessionTime(startTime: string, endTime: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return m === 0 ? `${h12} ${ampm}` : `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  }
  return `${fmt(startTime)}–${fmt(endTime)}`
}
