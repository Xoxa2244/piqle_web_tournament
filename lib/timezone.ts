type DateInputParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const timezoneFormatterCache = new Map<string, Intl.DateTimeFormat>()

const getTimeZoneFormatter = (timeZone: string) => {
  const existing = timezoneFormatterCache.get(timeZone)
  if (existing) return existing

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  timezoneFormatterCache.set(timeZone, formatter)
  return formatter
}

const toComparableUtcMs = (parts: DateInputParts) =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0)

const parseLocalInput = (value: string): DateInputParts | null => {
  const raw = String(value || '').trim()
  if (!raw) return null

  const [datePart, timePartRaw] = raw.split('T')
  const dateParts = datePart.split('-').map((v) => Number(v))
  if (dateParts.length !== 3) return null
  const [year, month, day] = dateParts

  let hour = 0
  let minute = 0
  if (timePartRaw) {
    const hhmm = timePartRaw.slice(0, 5)
    const timeParts = hhmm.split(':').map((v) => Number(v))
    if (timeParts.length !== 2) return null
    hour = timeParts[0]
    minute = timeParts[1]
  }

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

  return {
    year,
    month,
    day,
    hour,
    minute,
  }
}

const getPartsInTimeZone = (date: Date, timeZone: string): DateInputParts | null => {
  try {
    const parts = getTimeZoneFormatter(timeZone).formatToParts(date)
    const getValue = (type: Intl.DateTimeFormatPartTypes) => {
      const part = parts.find((item) => item.type === type)
      return part ? Number(part.value) : Number.NaN
    }
    const year = getValue('year')
    const month = getValue('month')
    const day = getValue('day')
    const hour = getValue('hour')
    const minute = getValue('minute')
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
  } catch {
    return null
  }
}

const toInputDate = (parts: DateInputParts) => {
  const y = String(parts.year).padStart(4, '0')
  const m = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const toInputDateTime = (parts: DateInputParts) => {
  const ymd = toInputDate(parts)
  const hh = String(parts.hour).padStart(2, '0')
  const mm = String(parts.minute).padStart(2, '0')
  return `${ymd}T${hh}:${mm}`
}

export const toDateInputInTimeZone = (
  value: Date | string | null | undefined,
  timeZone?: string | null
) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const tz = String(timeZone || '').trim()
  if (tz) {
    const parts = getPartsInTimeZone(date, tz)
    if (parts) return toInputDate(parts)
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const toDateTimeInputInTimeZone = (
  value: Date | string | null | undefined,
  timeZone?: string | null
) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const tz = String(timeZone || '').trim()
  if (tz) {
    const parts = getPartsInTimeZone(date, tz)
    if (parts) return toInputDateTime(parts)
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export const toUtcDateFromLocalInput = (value: string, timeZone?: string | null) => {
  const parsed = parseLocalInput(value)
  if (!parsed) return null

  const tz = String(timeZone || '').trim()
  const fallbackLocal = () => {
    const fallback = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }
  if (!tz) {
    return fallbackLocal()
  }

  try {
    getTimeZoneFormatter(tz)
  } catch {
    return fallbackLocal()
  }

  let utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0, 0)
  for (let i = 0; i < 4; i++) {
    const zoned = getPartsInTimeZone(new Date(utcMs), tz)
    if (!zoned) break
    const diff = toComparableUtcMs(parsed) - toComparableUtcMs(zoned)
    if (diff === 0) break
    utcMs += diff
  }

  const result = new Date(utcMs)
  return Number.isNaN(result.getTime()) ? null : result
}

export const toUtcIsoFromLocalInput = (value: string, timeZone?: string | null) => {
  const date = toUtcDateFromLocalInput(value, timeZone)
  return date ? date.toISOString() : null
}
