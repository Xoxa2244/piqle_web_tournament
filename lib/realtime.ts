/**
 * In-memory store for SSE connections per user.
 * Used to push invalidation events so notification/chat indicators update in real time.
 */

export type RealtimeEvent = {
  type: 'invalidate'
  keys: (
    | 'notification.list'
    | 'club.listMyChatClubs'
    | 'tournamentChat.listMyEventChats'
    | 'registration.getMyStatus'
    | 'registration.getSeatMap'
  )[]
}

type SendFn = (event: RealtimeEvent) => void

const connectionsByUser = new Map<string, Set<SendFn>>()

export function addConnection(userId: string, send: SendFn): void {
  let set = connectionsByUser.get(userId)
  if (!set) {
    set = new Set()
    connectionsByUser.set(userId, set)
  }
  set.add(send)
}

export function removeConnection(userId: string, send: SendFn): void {
  const set = connectionsByUser.get(userId)
  if (!set) return
  set.delete(send)
  if (set.size === 0) connectionsByUser.delete(userId)
}

export function pushToUser(userId: string, event: RealtimeEvent): void {
  const set = connectionsByUser.get(userId)
  if (!set) return
  set.forEach((send) => {
    try {
      send(event)
    } catch (_) {
      // ignore
    }
  })
}

export function pushToUsers(userIds: string[], event: RealtimeEvent): void {
  const seen = new Set<string>()
  userIds.forEach((id) => {
    if (seen.has(id)) return
    seen.add(id)
    pushToUser(id, event)
  })
}
