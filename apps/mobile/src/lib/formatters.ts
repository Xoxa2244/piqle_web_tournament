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

export const formatPlayerName = (input: {
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  email?: string | null
}) => {
  const fullName = [input.firstName, input.lastName].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ')
  return fullName || input.name || input.email || 'Player'
}
