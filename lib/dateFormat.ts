import { getTimezoneOptionLabel, normalizeKnownTimezone } from '@/lib/timezoneList'

type DateFormatOptions = {
  timeZone?: string | null
}

const usDateShortFormatter = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: '2-digit',
})

const usDateTimeShortFormatter = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
})

const usDateTimeFormatterByTimezone = new Map<string, Intl.DateTimeFormat>()
const usDateFormatterByTimezone = new Map<string, Intl.DateTimeFormat>()

const getDate = (value: Date | string | number | null | undefined) => {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const getUsDateTimeFormatter = (timeZone?: string | null) => {
  const tz = String(timeZone || '').trim()
  if (!tz) return usDateTimeShortFormatter
  const cached = usDateTimeFormatterByTimezone.get(tz)
  if (cached) return cached
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    })
    usDateTimeFormatterByTimezone.set(tz, formatter)
    return formatter
  } catch {
    return usDateTimeShortFormatter
  }
}

const getUsDateFormatter = (timeZone?: string | null) => {
  const tz = String(timeZone || '').trim()
  if (!tz) return usDateShortFormatter
  const cached = usDateFormatterByTimezone.get(tz)
  if (cached) return cached
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
      timeZone: tz,
    })
    usDateFormatterByTimezone.set(tz, formatter)
    return formatter
  } catch {
    return usDateShortFormatter
  }
}

export const getTimezoneLabel = (timeZone?: string | null) => {
  const tz = String(timeZone || '').trim()
  if (!tz) return 'Local time'
  const presetLabel = getTimezoneOptionLabel(tz)
  if (presetLabel) return presetLabel
  const normalized = normalizeKnownTimezone(tz)
  if (normalized && normalized !== tz) {
    const normalizedLabel = getTimezoneOptionLabel(normalized)
    if (normalizedLabel) return normalizedLabel
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
      hour: '2-digit',
    }).formatToParts(new Date())
    const short = parts.find((part) => part.type === 'timeZoneName')?.value
    return short ? `${short} (${tz})` : tz
  } catch {
    return tz
  }
}

export const formatUsDateShort = (
  value: Date | string | number | null | undefined,
  opts?: DateFormatOptions
) => {
  const date = getDate(value)
  if (!date) return ''
  return getUsDateFormatter(opts?.timeZone).format(date)
}

export const formatUsDateTimeShort = (
  value: Date | string | number | null | undefined,
  opts?: DateFormatOptions
) => {
  const date = getDate(value)
  if (!date) return ''
  return getUsDateTimeFormatter(opts?.timeZone).format(date)
}
