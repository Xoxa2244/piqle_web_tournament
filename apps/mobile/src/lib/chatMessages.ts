import { formatDate } from './formatters'

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
  clientOrder?: number
}

export function toLocalYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function groupMessagesByDate(
  messages: ChatMessage[]
): { dateKey: string; dateLabel: string; list: ChatMessage[] }[] {
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
        dateLabel:
          key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatDate(d) || '',
        list: [],
      })
    }
    groups[groups.length - 1]!.list.push(m)
  }
  return groups
}

export function formatChatTime(value?: string | Date | null): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function mergeMessagesByStableLiveOrder(
  serverMessages: ChatMessage[],
  optimisticMessages: ChatMessage[],
  orderById: Map<string, number>,
  nextOrderRef: { current: number }
): ChatMessage[] {
  const merged = new Map<string, ChatMessage>()

  for (const message of serverMessages) {
    merged.set(message.id, message)
  }
  for (const message of optimisticMessages) {
    if (!merged.has(message.id)) {
      merged.set(message.id, message)
    }
  }

  const list = Array.from(merged.values())
  for (const message of list) {
    if (!orderById.has(message.id)) {
      orderById.set(message.id, nextOrderRef.current++)
    }
  }

  return list.sort((left, right) => {
    const leftOrder = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })
}
