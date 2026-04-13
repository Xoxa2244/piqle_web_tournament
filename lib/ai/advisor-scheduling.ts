import { z } from 'zod'
import {
  guessTimeZoneFromLocation,
  toDateTimeInputInTimeZone,
  toUtcIsoFromLocalInput,
} from '@/lib/timezone'

const DEFAULT_ADVISOR_TIME_ZONE = 'America/New_York'

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

type LocalDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export const advisorScheduledSendSchema = z.object({
  scheduledFor: z.string().datetime(),
  timeZone: z.string().min(1),
  localDateTime: z.string().min(16).max(16),
  label: z.string().min(1).max(120),
})

export type AdvisorScheduledSend = z.infer<typeof advisorScheduledSendSchema>

function parseLocalDateTime(value: string): LocalDateParts | null {
  const [datePart, timePart] = String(value || '').trim().split('T')
  if (!datePart || !timePart) return null

  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null
  }

  return { year, month, day, hour, minute }
}

function toLocalDateInput(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>) {
  const year = String(parts.year).padStart(4, '0')
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toLocalDateTimeInput(parts: LocalDateParts) {
  const date = toLocalDateInput(parts)
  const hour = String(parts.hour).padStart(2, '0')
  const minute = String(parts.minute).padStart(2, '0')
  return `${date}T${hour}:${minute}`
}

function addDays(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  date.setUTCDate(date.getUTCDate() + days)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function getLocalNowParts(now: Date, timeZone: string): LocalDateParts {
  const input = toDateTimeInputInTimeZone(now, timeZone)
  const parsed = parseLocalDateTime(input)
  if (parsed) return parsed

  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
  }
}

function parseNumericTime(rawHour: string, rawMinute?: string, meridiem?: string) {
  let hour = Number(rawHour)
  const minute = Number(rawMinute || 0)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null

  const normalizedMeridiem = (meridiem || '').toLowerCase()
  if (normalizedMeridiem === 'pm' && hour < 12) hour += 12
  if (normalizedMeridiem === 'am' && hour === 12) hour = 0
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

  return { hour, minute }
}

function parseTimeFromMessage(message: string) {
  const lower = message.toLowerCase()

  if (/\bnoon\b/.test(lower)) return { hour: 12, minute: 0 }
  if (/\bmidnight\b/.test(lower)) return { hour: 0, minute: 0 }
  if (/\bmorning\b/.test(lower)) return { hour: 9, minute: 0 }
  if (/\bafternoon\b/.test(lower)) return { hour: 15, minute: 0 }
  if (/\b(evening|tonight)\b/.test(lower)) return { hour: 18, minute: 0 }

  const patterns = [
    /\b(?:at|for|around|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
    /\b(?:at|for|around|by)\s+(\d{1,2}):(\d{2})\b/i,
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i,
    /^\s*(\d{1,2}):(\d{2})\s*$/i,
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
    /\b(\d{1,2}):(\d{2})\b/i,
  ]

  for (const pattern of patterns) {
    const match = lower.match(pattern)
    if (!match) continue
    const parsed = parseNumericTime(match[1], match[2], match[3])
    if (parsed) return parsed
  }

  return null
}

function parseExplicitDate(message: string) {
  const match = message.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return { year, month, day }
}

function findMentionedWeekday(message: string) {
  const lower = message.toLowerCase()
  return Object.entries(WEEKDAY_INDEX).find(([weekday]) => new RegExp(`\\b(?:next\\s+|this\\s+)?${weekday}\\b`).test(lower)) || null
}

export function containsAdvisorSchedulingIntent(message: string) {
  const lower = message.toLowerCase()
  return [
    /\b(send later|schedule|scheduled|later|tomorrow|today|tonight|next\s+\w+day|this\s+\w+day)\b/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(at|by|around)\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/,
  ].some((pattern) => pattern.test(lower))
}

export function formatAdvisorScheduledLabel(scheduledFor: string, timeZone?: string | null) {
  const date = new Date(scheduledFor)
  if (Number.isNaN(date.getTime())) return scheduledFor

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || DEFAULT_ADVISOR_TIME_ZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

export function resolveAdvisorClubTimeZone(club: {
  automationSettings?: unknown
  address?: string | null
  state?: string | null
  country?: string | null
}) {
  const automationSettings =
    club.automationSettings && typeof club.automationSettings === 'object' && !Array.isArray(club.automationSettings)
      ? club.automationSettings as Record<string, unknown>
      : {}

  const intelligence =
    automationSettings.intelligence && typeof automationSettings.intelligence === 'object' && !Array.isArray(automationSettings.intelligence)
      ? automationSettings.intelligence as Record<string, unknown>
      : {}

  const fromSettings = typeof intelligence.timezone === 'string' ? intelligence.timezone.trim() : ''
  if (fromSettings) return fromSettings

  return (
    guessTimeZoneFromLocation({
      address: club.address,
      state: club.state,
      country: club.country,
    }) || DEFAULT_ADVISOR_TIME_ZONE
  )
}

export function parseAdvisorScheduledSend(opts: {
  message: string
  timeZone?: string | null
  now?: Date
}): AdvisorScheduledSend | null {
  const { message } = opts
  if (!containsAdvisorSchedulingIntent(message)) return null

  const timeZone = String(opts.timeZone || '').trim() || DEFAULT_ADVISOR_TIME_ZONE
  const now = opts.now || new Date()
  const localNow = getLocalNowParts(now, timeZone)
  const lower = message.toLowerCase()
  const time = parseTimeFromMessage(message)
  const explicitDate = parseExplicitDate(message)

  if (!time && !explicitDate) return null

  let targetDate: { year: number; month: number; day: number } | null = null

  if (explicitDate) {
    targetDate = explicitDate
  } else if (/\btomorrow\b/.test(lower)) {
    targetDate = addDays(localNow, 1)
  } else if (/\btoday\b/.test(lower) || /\btonight\b/.test(lower)) {
    targetDate = { year: localNow.year, month: localNow.month, day: localNow.day }
  } else {
    const weekdayEntry = findMentionedWeekday(message)
    if (weekdayEntry) {
      const [weekdayName, weekdayIndex] = weekdayEntry
      const currentDay = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day)).getUTCDay()
      let dayOffset = (weekdayIndex - currentDay + 7) % 7
      const isNextWeekday = new RegExp(`\\bnext\\s+${weekdayName}\\b`).test(lower)
      const timeAlreadyPassed =
        !!time && dayOffset === 0 && (time.hour < localNow.hour || (time.hour === localNow.hour && time.minute <= localNow.minute))
      if (isNextWeekday && dayOffset === 0) dayOffset = 7
      if (dayOffset === 0 && timeAlreadyPassed) dayOffset = 7
      targetDate = addDays(localNow, dayOffset)
    }
  }

  if (!time) return null

  if (!targetDate) {
    const laterToday =
      time.hour > localNow.hour || (time.hour === localNow.hour && time.minute > localNow.minute)
    targetDate = laterToday
      ? { year: localNow.year, month: localNow.month, day: localNow.day }
      : addDays(localNow, 1)
  }

  const localDateTime = toLocalDateTimeInput({
    ...targetDate,
    hour: time.hour,
    minute: time.minute,
  })
  const scheduledFor = toUtcIsoFromLocalInput(localDateTime, timeZone)
  if (!scheduledFor) return null

  const scheduledDate = new Date(scheduledFor)
  if (Number.isNaN(scheduledDate.getTime())) return null
  if (scheduledDate.getTime() <= now.getTime()) return null

  return {
    scheduledFor,
    timeZone,
    localDateTime,
    label: formatAdvisorScheduledLabel(scheduledFor, timeZone),
  }
}
