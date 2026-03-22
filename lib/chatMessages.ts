import { formatUsDateShort } from '@/lib/dateFormat'

export type ChatMessageUser = {
  id: string
  name: string | null
  image: string | null
}

export type ChatMessage = {
  id: string
  userId: string
  text: string | null
  isDeleted: boolean
  createdAt: string | Date
  user?: ChatMessageUser
}

export function toLocalYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function groupMessagesByDate(messages: ChatMessage[]): { dateKey: string; dateLabel: string; list: ChatMessage[] }[] {
  const todayKey = toLocalYmd(new Date())
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = toLocalYmd(yesterday)
  const groups: { dateKey: string; dateLabel: string; list: ChatMessage[] }[] = []
  let currentKey = ''
  for (const m of messages) {
    const d = m.createdAt ? new Date(m.createdAt) : new Date()
    const key = toLocalYmd(d)
    if (key !== currentKey) {
      currentKey = key
      groups.push({
        dateKey: key,
        dateLabel: key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatUsDateShort(d) || '',
        list: [],
      })
    }
    groups[groups.length - 1]!.list.push(m)
  }
  return groups
}
