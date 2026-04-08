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
import { RealtimeConnectionProvider } from './RealtimeProvider'
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

function useMobileRealtimeSync() {
  const utils = trpc.useUtils()
  const { token, clearSession } = useAuth()
  const [connected, setConnected] = useState(false)
  const [chatScopeActive, setChatScopeActive] = useState(false)

  useEffect(() => {
    if (!token || !chatScopeActive) {
      setConnected(false)
      return
    }

    let cancelled = false
    let shouldReconnect = true
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let abortController: AbortController | null = null
    const decoder = new TextDecoder()

    const handleRealtimePayload = (raw: string) => {
      try {
        const payload = JSON.parse(String(raw ?? '{}')) as {
          type?: string
          keys?: string[]
        }

        if (payload.type !== 'invalidate' || !Array.isArray(payload.keys)) return

        for (const key of payload.keys) {
          if (key === 'directChat.listMyChats') {
            void utils.directChat.listMyChats.invalidate()
            void utils.directChat.getThread.invalidate()
            void utils.directChat.list.invalidate()
          }
          if (key === 'club.listMyChatClubs') {
            void utils.club.listMyChatClubs.invalidate()
            void utils.clubChat.list.invalidate()
          }
          if (key === 'clubChat.listThread') {
            void utils.clubChat.listThread.invalidate()
          }
          if (key === 'tournamentChat.listMyEventChats') {
            void utils.tournamentChat.listMyEventChats.invalidate()
            void utils.tournamentChat.listTournament.invalidate()
            void utils.tournamentChat.listDivision.invalidate()
          }
          if (key === 'tournamentChat.listTournamentThread') {
            void utils.tournamentChat.listTournamentThread.invalidate()
          }
          if (key === 'tournamentChat.listDivisionThread') {
            void utils.tournamentChat.listDivisionThread.invalidate()
          }
        }
      } catch (error) {
        console.warn('[MobileRealtimeSync] failed to handle realtime event', error)
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      reconnectTimer = setTimeout(() => {
        void connect()
      }, 2_000)
    }

    const consumeSseStream = async (response: Response) => {
      const reader = response.body?.getReader?.()
      if (!reader) {
        throw new Error('SSE stream is not supported in this runtime')
      }

      let buffer = ''
      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = buffer.replace(/\r\n/g, '\n')

        let boundaryIndex = buffer.indexOf('\n\n')
        while (boundaryIndex >= 0) {
          const block = buffer.slice(0, boundaryIndex)
          buffer = buffer.slice(boundaryIndex + 2)

          const dataLines = block
            .split('\n')
            .map((line) => line.replace(/\r$/, ''))
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())

          if (dataLines.length > 0) {
            handleRealtimePayload(dataLines.join('\n'))
          }

          boundaryIndex = buffer.indexOf('\n\n')
        }
      }
    }

    const connect = async () => {
      abortController?.abort()
      abortController = new AbortController()

      try {
        const realtimeUrl = `${buildApiUrl('/api/realtime')}?access_token=${encodeURIComponent(token)}`
        const response = await fetch(realtimeUrl, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          signal: abortController.signal,
        })

        if (response.status === 401 || response.status === 403) {
          shouldReconnect = false
          setConnected(false)
          void clearSession()
          return
        }

        if (!response.ok) {
          throw new Error(`Realtime HTTP ${response.status}`)
        }

        setConnected(true)
        await consumeSseStream(response)
      } catch (error: any) {
        if (cancelled || error?.name === 'AbortError') return
      } finally {
        if (!cancelled && shouldReconnect) {
          setConnected(false)
          scheduleReconnect()
        }
      }
    }

    void connect()

    return () => {
      cancelled = true
      setConnected(false)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      abortController?.abort()
    }
  }, [chatScopeActive, clearSession, token, utils])

  return { connected, enabled: Boolean(token) && chatScopeActive, chatScopeActive, setChatScopeActive }
}

const MobileRealtimeConnectionLayer = ({ children }: PropsWithChildren) => {
  const realtime = useMobileRealtimeSync()

  return (
    <RealtimeConnectionProvider value={realtime}>
      <NotificationSwipeHiddenProvider>{children}</NotificationSwipeHiddenProvider>
    </RealtimeConnectionProvider>
  )
}

const TrpcLayer = ({ children }: PropsWithChildren) => {
  const { token, clearSession } = useAuth()
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
          async fetch(url, options) {
            const response = await globalThis.fetch(url, options)
            if (response.status === 401 || response.status === 403) {
              void clearSession()
            }
            return response
          },
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
        <MobileRealtimeConnectionLayer>{children}</MobileRealtimeConnectionLayer>
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
