export type TimezoneOption = {
  value: string
  label: string
}

const PRESET_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Etc/GMT+12', label: 'UTC-12' },
  { value: 'Etc/GMT+10', label: 'UTC-10' },
  { value: 'Etc/GMT+9', label: 'UTC-9' },
  { value: 'Etc/GMT+8', label: 'UTC-8 (PST)' },
  { value: 'Etc/GMT+7', label: 'UTC-7 (MST)' },
  { value: 'Etc/GMT+6', label: 'UTC-6 (CST)' },
  { value: 'Etc/GMT+5', label: 'UTC-5 (EST)' },
  { value: 'Etc/GMT+4', label: 'UTC-4 (EDT)' },
  { value: 'UTC', label: 'UTC+0 (GMT/WET)' },
  { value: 'Etc/GMT-1', label: 'UTC+1 (CET)' },
  { value: 'Etc/GMT-2', label: 'UTC+2 (EET)' },
  { value: 'Etc/GMT-3', label: 'UTC+3 (MSK)' },
  { value: 'Etc/GMT-4', label: 'UTC+4' },
  { value: 'Etc/GMT-5', label: 'UTC+5' },
  { value: 'Etc/GMT-6', label: 'UTC+6' },
  { value: 'Etc/GMT-7', label: 'UTC+7' },
  { value: 'Etc/GMT-8', label: 'UTC+8' },
  { value: 'Etc/GMT-9', label: 'UTC+9' },
  { value: 'Etc/GMT-10', label: 'UTC+10' },
  { value: 'Etc/GMT-11', label: 'UTC+11' },
  { value: 'Etc/GMT-12', label: 'UTC+12' },
  { value: 'Etc/GMT-13', label: 'UTC+13' },
]

let cachedTimezoneOptions: TimezoneOption[] | null = null
let cachedTimezoneLowerMap: Map<string, string> | null = null
let cachedTimezoneLabelLowerMap: Map<string, string> | null = null
let cachedTimezoneAliasLowerMap: Map<string, string> | null = null

export const getTimezoneOptions = () => {
  if (!cachedTimezoneOptions) {
    cachedTimezoneOptions = PRESET_TIMEZONE_OPTIONS.slice()
  }
  return cachedTimezoneOptions
}

export const getAllTimezones = () => getTimezoneOptions().map((option) => option.value)

const isValidIanaTimezone = (value: string) => {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const extractHourOffsetFromIana = (timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const offsetPart = parts.find((item) => item.type === 'timeZoneName')?.value || ''
    const match = offsetPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/)
    if (!match) return null
    const sign = match[1] === '-' ? -1 : 1
    const hours = Number(match[2])
    const minutes = Number(match[3] || '0')
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
    if (minutes !== 0) return null
    return sign * hours
  } catch {
    return null
  }
}

const offsetToPresetTimezone = (offsetHours: number) => {
  if (!Number.isFinite(offsetHours)) return null
  if (offsetHours === 0) return 'UTC'
  if (offsetHours > 0) return `Etc/GMT-${offsetHours}`
  return `Etc/GMT+${Math.abs(offsetHours)}`
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

const getTimezoneLabelLowerMap = () => {
  if (!cachedTimezoneLabelLowerMap) {
    cachedTimezoneLabelLowerMap = new Map<string, string>()
    for (const option of getTimezoneOptions()) {
      cachedTimezoneLabelLowerMap.set(option.label.toLowerCase(), option.value)
    }
  }
  return cachedTimezoneLabelLowerMap
}

const getTimezoneAliasLowerMap = () => {
  if (!cachedTimezoneAliasLowerMap) {
    cachedTimezoneAliasLowerMap = new Map<string, string>([
      ['etc/utc', 'UTC'],
      ['etc/gmt', 'UTC'],
      ['gmt', 'UTC'],
      ['z', 'UTC'],
      ['zulu', 'UTC'],
    ])
  }
  return cachedTimezoneAliasLowerMap
}

export const normalizeKnownTimezone = (value?: string | null) => {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (getAllTimezones().includes(raw)) return raw

  const byLower = getTimezoneLowerMap().get(raw.toLowerCase())
  if (byLower) return byLower

  const byLabel = getTimezoneLabelLowerMap().get(raw.toLowerCase())
  if (byLabel) return byLabel

  const byAlias = getTimezoneAliasLowerMap().get(raw.toLowerCase())
  if (byAlias) return byAlias

  if (isValidIanaTimezone(raw)) {
    const hourOffset = extractHourOffsetFromIana(raw)
    if (hourOffset !== null) {
      const asPreset = offsetToPresetTimezone(hourOffset)
      if (asPreset && getAllTimezones().includes(asPreset)) return asPreset
    }
  }

  return null
}
