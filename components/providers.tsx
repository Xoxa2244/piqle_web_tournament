'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import { httpBatchLink, httpLink, splitLink } from '@trpc/client'
import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'

/**
 * tRPC procedures that should NEVER share an HTTP request with anything
 * else. Each of these is known-slow (multi-second SQL) on prod — when
 * they were inside the dashboard megabatch they pinned the entire 13-
 * procedure response time to their worst case, leaving fast tiles
 * (Customer Health, Business Insights, KPI placeholders) staring at
 * "Loading…" for the full duration.
 *
 * Routing them through `httpLink` (no batching) means:
 *  • Fast queries that fire in the same React render tick still batch
 *    together via httpBatchLink → one HTTP request, ~600ms response
 *  • Each slow query gets its own HTTP request in parallel → tiles
 *    fill in progressively as each query resolves
 *
 * Add a path here if you discover another slow procedure that's
 * blocking the dashboard. Removing one (or moving to fast batch) is
 * also safe — splitLink falls through to httpBatchLink by default.
 */
const STANDALONE_PATHS = new Set([
  'intelligence.getDashboardV2',           // KPI computer — large SQL JOIN over bookings
  'intelligence.getAIRevenueAttribution',  // attribution + spend aggregate
  'intelligence.getOccupancyHeatmap',      // 90-day session grid
  'intelligence.getMemberGrowth',          // 6-month rollup
])

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        cacheTime: 10 * 60 * 1000, // 10 min — keep cache longer to survive navigation
        refetchOnWindowFocus: false,
      },
    },
  }))
  const [trpcClient] = useState(() => {
    // Shared fetch wrapper — both links use it so credentials behaviour
    // and any future middleware stays consistent.
    const sharedFetch = (url: RequestInfo | URL, options?: RequestInit) =>
      fetch(url as any, { ...options, credentials: 'include' })

    return trpc.createClient({
      links: [
        splitLink({
          // True → route to standalone httpLink (no batching).
          condition(op) {
            return STANDALONE_PATHS.has(op.path)
          },
          true: httpLink({ url: '/api/trpc', fetch: sharedFetch }),
          false: httpBatchLink({ url: '/api/trpc', fetch: sharedFetch }),
        }),
      ],
    })
  })

  return (
    <SessionProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    </SessionProvider>
  )
}
