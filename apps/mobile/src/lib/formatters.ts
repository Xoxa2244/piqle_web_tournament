const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

export const formatDateTime = (value?: string | Date | null) => {
  if (!value) return 'TBD'
  return dateTimeFormatter.format(new Date(value))
}

/** Дата/время старта ивента в таймзоне турнира (как на вебе в списке чатов). */
export const formatEventStartInTimezone = (value?: string | Date | null, timeZone?: string | null) => {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'TBD'
  const tz = String(timeZone || '').trim()
  try {
    if (tz) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: tz,
      }).format(date)
    }
  } catch {
    // fall through
  }
  return dateTimeFormatter.format(date)
}

/** Короткая подпись таймзоны (как на вебе). */
export const getEventTimezoneLabel = (timeZone?: string | null) => {
  const tz = String(timeZone || '').trim()
  if (!tz) return 'Local time'
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
      hour: '2-digit',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}

export const formatDate = (value?: string | Date | null) => {
  if (!value) return 'TBD'
  return dateFormatter.format(new Date(value))
}

export const formatDateRange = (
  start?: string | Date | null,
  end?: string | Date | null
) => {
  if (!start) return 'TBD'
  const startLabel = formatDateTime(start)
  const endLabel = end ? formatDateTime(end) : startLabel
  return `${startLabel} - ${endLabel}`
}

export const formatMoney = (amountCents?: number | null, currency = 'USD') => {
  const value = Number(amountCents ?? 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export const formatLocation = (parts: Array<string | null | undefined>) => {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(', ') || 'Location not set'
}

/** Gender line under the name on profile (English only). */
export const formatGenderLabel = (gender?: string | null) => {
  const g = String(gender ?? '').trim().toUpperCase()
  if (g === 'M') return 'Male'
  if (g === 'F') return 'Female'
  if (g === 'X') return 'Other'
  return 'Gender not specified'
}

export const formatPlayerName = (input: {
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  email?: string | null
}) => {
  const fullName = [input.firstName, input.lastName].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ')
  return fullName || input.name || input.email || 'Player'
}
