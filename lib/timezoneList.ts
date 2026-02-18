const TIMEZONE_FALLBACK = [
  'UTC',
  'Etc/UTC',
  'Etc/GMT',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
]

const TIMEZONE_EXTRA = ['UTC', 'Etc/UTC', 'Etc/GMT', 'Etc/GMT+0', 'Etc/GMT-0']

let cachedTimezones: string[] | null = null
let cachedTimezoneLowerMap: Map<string, string> | null = null

const buildTimezoneList = () => {
  const fromIntl: string[] = []
  try {
    const valuesProvider = (Intl as unknown as {
      supportedValuesOf?: (key: 'timeZone') => string[]
    }).supportedValuesOf
    if (typeof valuesProvider === 'function') {
      const values = valuesProvider('timeZone')
      if (Array.isArray(values)) fromIntl.push(...values)
    }
  } catch {
    // Ignore and fallback below.
  }

  const combined = new Set<string>([
    ...(fromIntl.length > 0 ? fromIntl : TIMEZONE_FALLBACK),
    ...TIMEZONE_EXTRA,
  ])

  return Array.from(combined).sort((a, b) => a.localeCompare(b))
}

export const getAllTimezones = () => {
  if (!cachedTimezones) cachedTimezones = buildTimezoneList()
  return cachedTimezones
}

const getTimezoneLowerMap = () => {
  if (!cachedTimezoneLowerMap) {
    cachedTimezoneLowerMap = new Map<string, string>()
    for (const tz of getAllTimezones()) {
      cachedTimezoneLowerMap.set(tz.toLowerCase(), tz)
    }
  }
  return cachedTimezoneLowerMap
}

export const normalizeKnownTimezone = (value?: string | null) => {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (getAllTimezones().includes(raw)) return raw

  const byLower = getTimezoneLowerMap().get(raw.toLowerCase())
  if (byLower) return byLower

  return null
}
