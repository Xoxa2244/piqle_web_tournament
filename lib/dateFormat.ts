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

export const formatUsDateShort = (value: Date | string | number | null | undefined) => {
  if (value == null) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return usDateShortFormatter.format(date)
}

export const formatUsDateTimeShort = (value: Date | string | number | null | undefined) => {
  if (value == null) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return usDateTimeShortFormatter.format(date)
}
