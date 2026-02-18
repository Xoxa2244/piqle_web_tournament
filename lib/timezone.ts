type DateInputParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const timezoneFormatterCache = new Map<string, Intl.DateTimeFormat>()
const US_COUNTRY_SET = new Set(['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'])

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
}

// Coarse fallback when geocoding/timezone APIs are unavailable.
// For split-timezone states we pick the dominant one.
const US_STATE_TO_TIMEZONE: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  IA: 'America/Chicago',
  ID: 'America/Denver',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  MA: 'America/New_York',
  MD: 'America/New_York',
  ME: 'America/New_York',
  MI: 'America/New_York',
  MN: 'America/Chicago',
  MO: 'America/Chicago',
  MS: 'America/Chicago',
  MT: 'America/Denver',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  NE: 'America/Chicago',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NV: 'America/Los_Angeles',
  NY: 'America/New_York',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VA: 'America/New_York',
  VT: 'America/New_York',
  WA: 'America/Los_Angeles',
  WI: 'America/Chicago',
  WV: 'America/New_York',
  WY: 'America/Denver',
  DC: 'America/New_York',
}

const normalizeUsStateCode = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (US_STATE_TO_TIMEZONE[upper]) return upper
  const byName = US_STATE_NAME_TO_CODE[upper]
  if (byName) return byName
  return null
}

const extractUsStateFromAddress = (address?: string | null) => {
  const raw = String(address || '').trim()
  if (!raw) return null
  const upper = raw.toUpperCase()

  // Common US address fragment: ", IN 46032" or ", IN, USA"
  const abbrMatch = upper.match(/,\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?|,|\b)/)
  if (abbrMatch?.[1] && US_STATE_TO_TIMEZONE[abbrMatch[1]]) return abbrMatch[1]

  for (const [name, code] of Object.entries(US_STATE_NAME_TO_CODE)) {
    if (upper.includes(name)) return code
  }
  return null
}

const inferLikelyUsCountry = (address?: string | null) => {
  const raw = String(address || '').trim().toUpperCase()
  if (!raw) return false
  if (raw.includes('USA') || raw.includes('UNITED STATES')) return true
  return Boolean(extractUsStateFromAddress(raw))
}

export const guessTimeZoneFromLocation = (input: {
  address?: string | null
  state?: string | null
  country?: string | null
}) => {
  const country = String(input.country || '').trim().toUpperCase()
  const isUs = country ? US_COUNTRY_SET.has(country) : inferLikelyUsCountry(input.address)
  if (!isUs) return null

  const stateCode =
    normalizeUsStateCode(input.state) || extractUsStateFromAddress(input.address)
  if (!stateCode) return null
  return US_STATE_TO_TIMEZONE[stateCode] ?? null
}

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
