import { useMemo } from 'react'

import { useRealtimeConnection } from '../providers/RealtimeProvider'

/**
 * Mobile сначала слушает `/api/realtime` через stream, а polling остаётся только fallback-режимом,
 * если realtime не подключился или временно отвалился.
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
  refetchOnMount: 'always' as const,
} as const

export const messageThreadRealtimeQueryOptions = {
  refetchInterval: 3000,
  staleTime: 0,
  refetchOnMount: 'always' as const,
} as const

export function useRealtimeAwareQueryOptions() {
  const { enabled, connected } = useRealtimeConnection()
  return useMemo(
    () => ({
      refetchInterval: enabled && connected ? false : REALTIME_POLL_INTERVAL_MS,
      staleTime: 15_000,
    }),
    [connected, enabled]
  )
}

export function useChatRealtimeQueryOptions() {
  const { enabled, connected } = useRealtimeConnection()
  return useMemo(
    () => ({
      refetchInterval: enabled && connected ? false : CHAT_REALTIME_POLL_INTERVAL_MS,
      staleTime: 0,
      refetchOnMount: 'always' as const,
    }),
    [connected, enabled]
  )
}

export function useMessageThreadRealtimeQueryOptions() {
  const { enabled, connected } = useRealtimeConnection()
  return useMemo(
    () => ({
      refetchInterval: enabled && connected ? false : 3000,
      staleTime: 0,
      refetchOnMount: 'always' as const,
    }),
    [connected, enabled]
  )
}
