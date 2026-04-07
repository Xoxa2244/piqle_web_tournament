/**
 * На сайте колокольчик и чаты обновляются через SSE `/api/realtime` + refetch каждые 5 с.
 * В React Native EventSource с next-auth не подключён — те же данные поллим по tRPC.
 */
export const REALTIME_POLL_INTERVAL_MS = 5000
export const CHAT_REALTIME_POLL_INTERVAL_MS = 2000

export const realtimeAwareQueryOptions = {
  refetchInterval: REALTIME_POLL_INTERVAL_MS,
  /** Глобальный staleTime в AppProviders — 2 мин; для этих запросов нужна свежесть. */
  staleTime: 15_000,
} as const

export const chatRealtimeQueryOptions = {
  refetchInterval: CHAT_REALTIME_POLL_INTERVAL_MS,
  staleTime: 0,
} as const
