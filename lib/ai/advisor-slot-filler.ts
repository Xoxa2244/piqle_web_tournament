import { z } from 'zod'
import { advisorSessionDraftSchema, type AdvisorAction } from './advisor-actions'

export const advisorSlotSessionOptionSchema = advisorSessionDraftSchema

export type AdvisorSlotSessionOption = z.infer<typeof advisorSlotSessionOptionSchema>

type ResolveSlotSessionOptions = {
  message: string
  sessions: AdvisorSlotSessionOption[]
  currentSession?: AdvisorSlotSessionOption | null
  now?: Date
}

type ResolveSlotSessionResult = {
  session: AdvisorSlotSessionOption | null
  reason: 'current' | 'single' | 'best_match' | 'most_underfilled' | 'unresolved'
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function parseSessionDate(value: string) {
  if (!value) return null
  const date = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatSessionDate(value: string) {
  const date = parseSessionDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatSessionTime(startTime: string, endTime?: string | null) {
  const normalize = (value?: string | null) => {
    if (!value) return null
    const raw = value.slice(0, 5)
    const [hourRaw, minuteRaw = '00'] = raw.split(':')
    const hour = Number(hourRaw)
    const minute = Number(minuteRaw)
    if (Number.isNaN(hour) || Number.isNaN(minute)) return value
    const period = hour >= 12 ? 'PM' : 'AM'
    const twelveHour = hour % 12 || 12
    return `${twelveHour}:${String(minute).padStart(2, '0')} ${period}`
  }

  const start = normalize(startTime) || startTime
  const end = normalize(endTime) || null
  return end ? `${start} - ${end}` : start
}

export function formatAdvisorSlotSessionLabel(session: AdvisorSlotSessionOption) {
  const primary = session.title || session.format || 'Session'
  return `${formatSessionDate(session.date)} at ${formatSessionTime(session.startTime, session.endTime)} · ${primary} · ${session.spotsRemaining} spots left`
}

function wantsCurrentSession(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(this|that|the)\s+(session|slot|match)\b/,
    /\b(fill it|invite them to it|for this one|for that one)\b/,
    /\b(эту|эту сессию|этот слот|ее)\b/,
  ])
}

function wantsMostUnderfilled(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(most underfilled|most urgent|worst occupancy|largest gap|biggest gap)\b/,
    /\b(best session to fill|next underfilled session)\b/,
    /\b(самую пустую|самую недозаполненную|самую проблемную)\b/,
  ])
}

function resolveOrdinalSelection(message: string, sessions: AdvisorSlotSessionOption[]) {
  const lower = message.toLowerCase()
  if (containsAny(lower, [/\b(first|1st|number one|#1)\b/, /\b(перв\w+)\b/])) return sessions[0] || null
  if (containsAny(lower, [/\b(second|2nd|number two|#2)\b/, /\b(втор\w+)\b/])) return sessions[1] || null
  if (containsAny(lower, [/\b(third|3rd|number three|#3)\b/, /\b(трет\w+)\b/])) return sessions[2] || null
  return null
}

function extractTimeHints(message: string) {
  const lower = message.toLowerCase()
  const hints = new Set<string>()
  const explicit = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/g) || []
  explicit.forEach((match) => hints.add(match.replace(/\s+/g, '')))

  const twentyFourHour = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g) || []
  twentyFourHour.forEach((match) => hints.add(match))

  if (/\bmorning\b/.test(lower)) hints.add('morning')
  if (/\bafternoon\b/.test(lower)) hints.add('afternoon')
  if (/\bevening\b/.test(lower)) hints.add('evening')
  if (/\bnight\b/.test(lower)) hints.add('night')

  return Array.from(hints)
}

function sessionTimeMatches(session: AdvisorSlotSessionOption, hints: string[]) {
  if (hints.length === 0) return false
  const [hourRaw, minuteRaw = '00'] = session.startTime.slice(0, 5).split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const formatted = formatSessionTime(session.startTime, session.endTime).toLowerCase().replace(/\s+/g, '')
  return hints.some((hint) => {
    if (hint === 'morning') return hour >= 5 && hour < 12
    if (hint === 'afternoon') return hour >= 12 && hour < 17
    if (hint === 'evening') return hour >= 17 && hour < 22
    if (hint === 'night') return hour >= 20 || hour < 5
    if (hint.includes(':')) return session.startTime.startsWith(hint)
    if (hint.endsWith('am') || hint.endsWith('pm')) return formatted.includes(hint)
    const exactHour = Number(hint)
    return !Number.isNaN(exactHour) && exactHour === hour && minute === 0
  })
}

function getRelativeDayLabel(session: AdvisorSlotSessionOption, now?: Date) {
  const date = parseSessionDate(session.date)
  if (!date) return ''
  const baseNow = now || new Date()
  const today = new Date(baseNow.getFullYear(), baseNow.getMonth(), baseNow.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date).toLowerCase()
}

function scoreSessionMatch(message: string, session: AdvisorSlotSessionOption, now?: Date) {
  const lower = message.toLowerCase()
  let score = 0

  const relativeDay = getRelativeDayLabel(session, now)
  if (relativeDay && lower.includes(relativeDay)) score += 6

  const weekday = parseSessionDate(session.date)
    ? new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parseSessionDate(session.date)!).toLowerCase()
    : ''
  if (weekday && lower.includes(weekday)) score += 5

  if (session.title && lower.includes(session.title.toLowerCase())) score += 8
  if (session.court && lower.includes(session.court.toLowerCase())) score += 4
  if (session.format && lower.includes(session.format.toLowerCase().replace(/_/g, ' '))) score += 4

  const skill = session.skillLevel?.toLowerCase().replace(/_/g, ' ')
  if (skill && lower.includes(skill)) score += 4

  const timeHints = extractTimeHints(message)
  if (sessionTimeMatches(session, timeHints)) score += 7

  if (containsAny(lower, [/\b(open play|round robin|ladder|drill|doubles|singles)\b/])) {
    if (session.title && containsAny(lower, [new RegExp(session.title.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))])) {
      score += 3
    }
  }

  return score
}

export function resolveAdvisorSlotSession(opts: ResolveSlotSessionOptions): ResolveSlotSessionResult {
  const { message, sessions, currentSession, now } = opts
  if (sessions.length === 0) return { session: null, reason: 'unresolved' }

  const ordinal = resolveOrdinalSelection(message, sessions)
  if (ordinal) {
    return { session: ordinal, reason: 'best_match' }
  }

  if (currentSession && wantsCurrentSession(message)) {
    return { session: currentSession, reason: 'current' }
  }

  if (wantsMostUnderfilled(message)) {
    const sorted = [...sessions].sort((a, b) => {
      if (b.spotsRemaining !== a.spotsRemaining) return b.spotsRemaining - a.spotsRemaining
      return a.occupancy - b.occupancy
    })
    return { session: sorted[0] || null, reason: sorted[0] ? 'most_underfilled' : 'unresolved' }
  }

  if (sessions.length === 1) {
    return { session: sessions[0], reason: 'single' }
  }

  const scored = sessions
    .map((session) => ({ session, score: scoreSessionMatch(message, session, now) }))
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  const second = scored[1]
  if (top && top.score >= 6 && (!second || top.score >= second.score + 2)) {
    return { session: top.session, reason: 'best_match' }
  }

  return { session: null, reason: 'unresolved' }
}

export function buildAdvisorSlotSessionOptions(sessions: AdvisorSlotSessionOption[], limit: number = 3) {
  return sessions
    .slice(0, limit)
    .map((session) => formatAdvisorSlotSessionLabel(session))
}

export function buildAdvisorSlotSessionState(action: Extract<AdvisorAction, { kind: 'fill_session' }>) {
  return action.session
}
