import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpLink } from '@trpc/client'
import type { PropsWithChildren } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { buildApiUrl } from '../lib/config'
import { isAbortLikeError } from '../lib/isAbortLikeError'
import { getClientAuthToken } from '../lib/authStorage'
import { trpc } from '../lib/trpc'
import { AuthProvider, useAuth } from './AuthProvider'
import { NotificationSwipeHiddenProvider } from './NotificationSwipeHiddenProvider'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from './ToastProvider'

/** Инвалидация при возврате в приложение (аналог refetchOnWindowFocus на вебе). */
function MobileForegroundSync() {
  const utils = trpc.useUtils()
  const { token } = useAuth()
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active' || !token) return
      void Promise.all([
        utils.notification.list.invalidate(),
        utils.directChat.listMyChats.invalidate(),
        utils.club.listMyChatClubs.invalidate(),
        utils.tournamentChat.listMyEventChats.invalidate(),
      ])
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [utils, token])
  return null
}

function MobileRealtimeSync() {
  const utils = trpc.useUtils()
  const { token } = useAuth()

  useEffect(() => {
    if (!token) return
    if (typeof EventSource === 'undefined') return

    const realtimeUrl = `${buildApiUrl('/api/realtime')}?access_token=${encodeURIComponent(token)}`
    const source = new EventSource(realtimeUrl)

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data ?? '{}')) as {
          type?: string
          keys?: string[]
        }

        if (payload.type !== 'invalidate' || !Array.isArray(payload.keys)) return

        for (const key of payload.keys) {
          if (key === 'notification.list') {
            void utils.notification.list.invalidate()
          }
          if (key === 'directChat.listMyChats') {
            void utils.directChat.listMyChats.invalidate()
            void utils.directChat.getThread.invalidate()
            void utils.directChat.list.invalidate()
          }
          if (key === 'club.listMyChatClubs') {
            void utils.club.listMyChatClubs.invalidate()
            void utils.clubChat.list.invalidate()
          }
          if (key === 'tournamentChat.listMyEventChats') {
            void utils.tournamentChat.listMyEventChats.invalidate()
            void utils.tournamentChat.listTournament.invalidate()
            void utils.tournamentChat.listDivision.invalidate()
          }
          if (key === 'registration.getMyStatus') {
            void utils.registration.getMyStatus.invalidate()
          }
          if (key === 'registration.getSeatMap') {
            void utils.registration.getSeatMap.invalidate()
          }
        }
      } catch (error) {
        console.warn('[MobileRealtimeSync] failed to handle realtime event', error)
      }
    }

    source.onerror = () => {
      // Native EventSource reconnects by itself; keep handler silent.
    }

    return () => {
      source.close()
    }
  }, [token, utils])

  return null
}

const TrpcLayer = ({ children }: PropsWithChildren) => {
  const { token } = useAuth()
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnReconnect: true,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (isAbortLikeError(error)) return false
              return failureCount < 1
            },
            /** Дольше считаем данные свежими — меньше лишних refetch при смене вкладок. */
            staleTime: 120_000,
            /** Держим кэш неактивных запросов дольше при навигации. */
            cacheTime: 30 * 60 * 1000,
          },
          mutations: {
            retry: (failureCount, error) => {
              if (isAbortLikeError(error)) return false
              return failureCount < 1
            },
          },
        },
      })
  )
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpLink({
          url: buildApiUrl('/api/trpc'),
          async headers() {
            const authToken = getClientAuthToken()
            return authToken ? { authorization: `Bearer ${authToken}` } : {}
          },
        }),
      ],
    })
  )

  const prevTokenRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (prevTokenRef.current === undefined) {
      prevTokenRef.current = token
      return
    }
    if (prevTokenRef.current !== token) {
      queryClient.clear()
      prevTokenRef.current = token
    }
  }, [queryClient, token])

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MobileForegroundSync />
        <MobileRealtimeSync />
        <NotificationSwipeHiddenProvider>{children}</NotificationSwipeHiddenProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

export const AppProviders = ({ children }: PropsWithChildren) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <TrpcLayer>{children}</TrpcLayer>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
