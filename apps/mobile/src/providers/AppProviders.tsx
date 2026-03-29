import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpLink } from '@trpc/client'
import type { PropsWithChildren } from 'react'
import { useEffect, useRef, useState } from 'react'

import { buildApiUrl } from '../lib/config'
import { isAbortLikeError } from '../lib/isAbortLikeError'
import { getClientAuthToken } from '../lib/authStorage'
import { trpc } from '../lib/trpc'
import { AuthProvider, useAuth } from './AuthProvider'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from './ToastProvider'

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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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
