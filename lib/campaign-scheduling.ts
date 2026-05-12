export type SequenceDelayUnit = 'days' | 'minutes'

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'interval_minutes'

export interface SequenceDelayShape {
  delayDays?: number | null
  delayMinutes?: number | null
}

export interface ResolvedSequenceDelay {
  amount: number
  unit: SequenceDelayUnit
}

export interface RecurringScheduleShape {
  format?: string | null
  recurringFrequency?: RecurringFrequency | null
  recurringDayOfWeek?: number | null
  recurringDayOfMonth?: number | null
  recurringHour?: number | null
  recurringIntervalMinutes?: number | null
}

export type ParsedRecurringCron =
  | { kind: 'interval_minutes'; minuteInterval: number }
  | { kind: 'daily'; hour: number }
  | { kind: 'weekly'; hour: number; dayOfWeek: number }
  | { kind: 'monthly'; hour: number; dayOfMonth: number }

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function clampRecurringIntervalMinutes(value: number | null | undefined) {
  return clamp(toInt(value) ?? 10, 1, 59)
}

export function resolveSequenceDelay(step: SequenceDelayShape): ResolvedSequenceDelay {
  const delayMinutes = toInt(step.delayMinutes)
  if (delayMinutes !== null && delayMinutes > 0) {
    return { amount: delayMinutes, unit: 'minutes' }
  }

  return {
    amount: Math.max(0, toInt(step.delayDays) ?? 0),
    unit: 'days',
  }
}

export function formatSequenceDelayCompact(step: SequenceDelayShape): string {
  const delay = resolveSequenceDelay(step)
  return `+${delay.amount}${delay.unit === 'minutes' ? 'm' : 'd'}`
}

export function buildRecurringCron(schedule: RecurringScheduleShape): string | null {
  if (schedule.format !== 'recurring') return null

  switch (schedule.recurringFrequency) {
    case 'interval_minutes':
      return `*/${clampRecurringIntervalMinutes(schedule.recurringIntervalMinutes)} * * * *`
    case 'daily': {
      const hour = clamp(toInt(schedule.recurringHour) ?? 9, 0, 23)
      return `0 ${hour} * * *`
    }
    case 'weekly': {
      const hour = clamp(toInt(schedule.recurringHour) ?? 9, 0, 23)
      const dayOfWeek = clamp(toInt(schedule.recurringDayOfWeek) ?? 1, 0, 6)
      return `0 ${hour} * * ${dayOfWeek}`
    }
    case 'monthly': {
      const hour = clamp(toInt(schedule.recurringHour) ?? 9, 0, 23)
      const dayOfMonth = clamp(toInt(schedule.recurringDayOfMonth) ?? 1, 1, 28)
      return `0 ${hour} ${dayOfMonth} * *`
    }
    default:
      return null
  }
}

export function parseRecurringCron(expr: string): ParsedRecurringCron | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const intervalMatch = minute.match(/^\*\/(\d{1,2})$/)
    if (!intervalMatch) return null
    return {
      kind: 'interval_minutes',
      minuteInterval: clampRecurringIntervalMinutes(parseInt(intervalMatch[1], 10)),
    }
  }

  if (minute !== '0') return null

  const parsedHour = parseInt(hour, 10)
  if (Number.isNaN(parsedHour) || parsedHour < 0 || parsedHour > 23) return null

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return { kind: 'daily', hour: parsedHour }
  }

  if (dayOfWeek !== '*' && dayOfMonth === '*' && month === '*') {
    const parsedDayOfWeek = parseInt(dayOfWeek, 10)
    if (Number.isNaN(parsedDayOfWeek) || parsedDayOfWeek < 0 || parsedDayOfWeek > 6) return null
    return { kind: 'weekly', hour: parsedHour, dayOfWeek: parsedDayOfWeek }
  }

  if (dayOfMonth !== '*' && dayOfWeek === '*' && month === '*') {
    const parsedDayOfMonth = parseInt(dayOfMonth, 10)
    if (Number.isNaN(parsedDayOfMonth) || parsedDayOfMonth < 1 || parsedDayOfMonth > 31) return null
    return { kind: 'monthly', hour: parsedHour, dayOfMonth: parsedDayOfMonth }
  }

  return null
}

function getCalendarParts(tz: string, now: Date) {
  let hour = -1
  let minute = -1
  let weekdayShort = ''
  let day = -1

  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      day: 'numeric',
    })
    for (const part of fmt.formatToParts(now)) {
      if (part.type === 'hour') hour = parseInt(part.value, 10)
      else if (part.type === 'minute') minute = parseInt(part.value, 10)
      else if (part.type === 'weekday') weekdayShort = part.value
      else if (part.type === 'day') day = parseInt(part.value, 10)
    }
  } catch {
    hour = now.getUTCHours()
    minute = now.getUTCMinutes()
    day = now.getUTCDate()
    weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getUTCDay()]
  }

  if (hour === 24) hour = 0
  if (minute === 60) minute = 0

  return { hour, minute, day, weekdayShort }
}

export function shouldFireRecurringNow(
  cron: ParsedRecurringCron,
  tz: string,
  now: Date,
  lastRun: Date | null,
): boolean {
  if (cron.kind === 'interval_minutes') {
    const { minute } = getCalendarParts(tz, now)
    if (minute < 0 || minute % cron.minuteInterval !== 0) return false

    if (lastRun) {
      const intervalMs = cron.minuteInterval * 60 * 1000
      if (now.getTime() - lastRun.getTime() < intervalMs - 15000) return false
    }

    return true
  }

  const { hour, day, weekdayShort } = getCalendarParts(tz, now)
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dayOfWeek = dowMap[weekdayShort] ?? -1

  if (cron.kind === 'monthly' && cron.dayOfMonth !== day) return false
  if (cron.kind === 'weekly' && cron.dayOfWeek !== dayOfWeek) return false
  if (hour < cron.hour) return false

  if (lastRun) {
    const hoursAgo = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)
    if (hoursAgo < 22) return false
  }

  return true
}

export function describeRecurringCron(expr: string, tz: string): string {
  const cron = parseRecurringCron(expr)
  if (!cron) return 'Custom schedule'

  if (cron.kind === 'interval_minutes') {
    return cron.minuteInterval === 1
      ? 'Every minute'
      : `Every ${cron.minuteInterval} minutes`
  }

  const hh = String(cron.hour).padStart(2, '0')
  const tzSuffix = ` ${tz}`

  if (cron.kind === 'daily') {
    return `Every day at ${hh}:00${tzSuffix}`
  }

  if (cron.kind === 'weekly') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `Every ${days[cron.dayOfWeek]} at ${hh}:00${tzSuffix}`
  }

  const day = cron.dayOfMonth
  const ord = day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`
  return `${ord} of each month at ${hh}:00${tzSuffix}`
}
