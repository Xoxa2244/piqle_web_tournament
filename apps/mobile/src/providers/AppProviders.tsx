import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'

import { buildApiUrl } from '../lib/config'
import { getClientAuthToken } from '../lib/authStorage'
import { trpc } from '../lib/trpc'
import { AuthProvider, useAuth } from './AuthProvider'

const TrpcLayer = ({ children }: PropsWithChildren) => {
  const { token } = useAuth()
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnReconnect: true,
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 20_000,
          },
        },
      })
  )
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: buildApiUrl('/api/trpc'),
          async headers() {
            const authToken = getClientAuthToken()
            return authToken ? { authorization: `Bearer ${authToken}` } : {}
          },
        }),
      ],
    })
  )

  useEffect(() => {
    queryClient.clear()
  }, [queryClient, token])

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}

export const AppProviders = ({ children }: PropsWithChildren) => {
  return (
    <AuthProvider>
      <TrpcLayer>{children}</TrpcLayer>
    </AuthProvider>
  )
}
