export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'

export type RecurrenceConfig = {
  frequency: RecurrenceFrequency
  count: number
  weekdays?: number[] // 0=Sun..6=Sat (UTC-based, matches JS getUTCDay)
}

export const parseYmdToUtc = (ymd: string): Date | null => {
  const parts = String(ymd || '').split('-').map((v) => Number(v))
  if (parts.length !== 3) return null
  const [y, m, d] = parts
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return new Date(Date.UTC(y, m - 1, d))
}

export const addDaysUtc = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000)

export const addMonthsUtc = (date: Date, months: number) => {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const hour = date.getUTCHours()
  const minute = date.getUTCMinutes()
  const second = date.getUTCSeconds()
  const ms = date.getUTCMilliseconds()

  const targetMonth = month + months
  const lastDayOfTargetMonth = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, lastDayOfTargetMonth)
  return new Date(Date.UTC(year, targetMonth, clampedDay, hour, minute, second, ms))
}

export const generateRecurringStartDates = (
  startDate: Date,
  input: RecurrenceConfig,
  opts?: { maxScanDays?: number }
): { startDates: Date[] } | { error: string } => {
  const count = Math.max(1, Math.min(12, Math.trunc(input.count || 1)))
  const frequency = input.frequency

  if (count <= 1) {
    return { startDates: [startDate] }
  }

  if (frequency === 'DAILY') {
    return {
      startDates: Array.from({ length: count }, (_, i) => addDaysUtc(startDate, i)),
    }
  }

  if (frequency === 'MONTHLY') {
    return {
      startDates: Array.from({ length: count }, (_, i) => addMonthsUtc(startDate, i)),
    }
  }

  const intervalWeeks = frequency === 'BIWEEKLY' ? 2 : 1
  const selectedDaysRaw =
    Array.isArray(input.weekdays) && input.weekdays.length ? input.weekdays : [startDate.getUTCDay()]
  const selectedDays = Array.from(new Set(selectedDaysRaw))
    .map((d) => Math.max(0, Math.min(6, Math.trunc(d))))
    .sort((a, b) => a - b)

  if (selectedDays.length < 1) {
    return { error: 'Pick at least one weekday.' }
  }

  const maxScanDays = opts?.maxScanDays ?? 366
  const startDates: Date[] = []

  for (let offsetDays = 0; startDates.length < count && offsetDays <= maxScanDays; offsetDays++) {
    const candidate = addDaysUtc(startDate, offsetDays)
    const weekIndex = Math.floor(offsetDays / 7)
    if (weekIndex % intervalWeeks !== 0) continue
    if (!selectedDays.includes(candidate.getUTCDay())) continue
    startDates.push(candidate)
  }

  if (startDates.length < count) {
    return { error: 'Could not generate recurring dates. Adjust weekdays or count.' }
  }

  return { startDates }
}

