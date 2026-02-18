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

export const normalizeKnownTimezone = (value?: string | null) => {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (getAllTimezones().includes(raw)) return raw

  const byLower = getTimezoneLowerMap().get(raw.toLowerCase())
  if (byLower) return byLower

  const byLabel = getTimezoneLabelLowerMap().get(raw.toLowerCase())
  if (byLabel) return byLabel

  if (isValidIanaTimezone(raw)) return raw

  return null
}
