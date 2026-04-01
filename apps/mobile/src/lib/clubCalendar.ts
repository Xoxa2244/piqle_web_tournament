export const CLUB_CALENDAR_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const CLUB_CALENDAR_MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const pad2 = (n: number) => String(n).padStart(2, '0')

export const toLocalYmd = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

export const parseYmd = (key: string) => {
  const [y, m, d] = key.split('-').map((x) => Number(x))
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

export const startOfWeek = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - d.getDay())
  return d
}

export const addDays = (date: Date, delta: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + delta)
  return d
}

export const addMonths = (date: Date, delta: number) =>
  new Date(date.getFullYear(), date.getMonth() + delta, 1)

export const addWeeks = (date: Date, delta: number) => addDays(date, delta * 7)

export const buildMonthGrid = (month: Date) => {
  const first = startOfMonth(month)
  const startOffset = first.getDay()
  const gridStart = addDays(first, -startOffset)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

export const formatMonthYear = (date: Date) =>
  `${CLUB_CALENDAR_MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`

const formatUsDateShort = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export const formatWeekRange = (weekStart: Date) => {
  const end = addDays(weekStart, 6)
  return `${formatUsDateShort(weekStart)}-${formatUsDateShort(end)}`
}

export const formatEventTimeRange = (
  startDate: Date | string,
  endDate?: Date | string,
  timeZone?: string | null,
) => {
  const start = new Date(startDate)
  const end = new Date(endDate ?? startDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: String(timeZone || '').trim() || undefined,
    })
    return `${formatter.format(start)} - ${formatter.format(end)}`
  } catch {
    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
}

export type ClubCalendarEvent = {
  id: string
  title: string
  startDate: string | Date
  endDate?: string | Date | null
  timezone?: string | null
  entryFeeCents?: number | null
  format?: string | null
  totals?: { totalSlots: number; filledSlots: number } | null
  genderLabel?: string | null
  duprLabel?: string | null
}

export const mapClubTournamentsToCalendarEvents = (tournaments: unknown[]): ClubCalendarEvent[] => {
  const mapped = (Array.isArray(tournaments) ? tournaments : [])
    .map((item: any) => {
      const id = String(item?.id ?? '').trim()
      const title = String(item?.title ?? '').trim()
      const startDate = item?.startDate
      if (!id || !title || !startDate) return null
      return {
        id,
        title,
        startDate,
        endDate: item?.endDate ?? null,
        timezone: item?.timezone ?? null,
        entryFeeCents: typeof item?.entryFeeCents === 'number' ? item.entryFeeCents : null,
        format: item?.format ?? null,
        totals:
          item?.totals &&
          typeof item.totals.totalSlots === 'number' &&
          typeof item.totals.filledSlots === 'number'
            ? { totalSlots: item.totals.totalSlots, filledSlots: item.totals.filledSlots }
            : null,
        genderLabel: item?.genderLabel ?? null,
        duprLabel: item?.duprLabel ?? null,
      } satisfies ClubCalendarEvent
    })
    .filter(Boolean) as ClubCalendarEvent[]

  return mapped.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
}

export const buildEventsByDay = (events: ClubCalendarEvent[]) => {
  const map = new Map<string, ClubCalendarEvent[]>()
  for (const event of events) {
    const d = new Date(event.startDate)
    if (Number.isNaN(d.getTime())) continue
    const key = toLocalYmd(d)
    const list = map.get(key) ?? []
    list.push(event)
    map.set(key, list)
  }
  map.forEach((list, key) => {
    list.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    map.set(key, list)
  })
  return map
}

export const getUpcomingEventDays = (eventsByDay: Map<string, ClubCalendarEvent[]>, limit = 5) => {
  const todayKey = toLocalYmd(new Date())
  return Array.from(eventsByDay.keys())
    .filter((key) => key >= todayKey)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit)
}
