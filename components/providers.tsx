'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import { httpBatchLink, httpLink, splitLink } from '@trpc/client'
import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'

/**
 * tRPC procedures that should NEVER share an HTTP request with anything
 * else. Each of these is *truly* multi-second on prod (10s+) and would
 * otherwise pin a whole batch's response time.
 *
 * IMPORTANT — auth-storm trade-off (May 2026):
 * Every standalone HTTP request runs the full tRPC context init, which
 * means one `getServerSession()` + one `protectedProcedure` DB hit per
 * request. With 7 parallel standalone requests on dashboard mount, that
 * is 14+ concurrent auth queries fighting for the pgbouncer pool — on a
 * cold lambda this exhausts the pool and triggers 30s timeouts that
 * surface as 401 UNAUTHORIZED to the client.
 *
 * Rule of thumb: only add a path here if (a) it's genuinely slow (≥5s
 * standalone) AND (b) you've also verified the page mounting it does
 * not already fire 4+ parallel queries. Otherwise let it ride in the
 * batch — the batch tail latency is bounded by the slowest query, but
 * you save N-1 auth round-trips.
 */
const STANDALONE_PATHS = new Set([
  // Genuinely heavy (10s+) — keep isolated.
  'intelligence.getDashboardV2',           // KPI computer — large SQL JOIN over bookings
  // Membership Health page — getTierHealth walks bookings for per-tier
  // bucketing. Isolated it's ~0.4s, but bundled in the page-load batch with
  // club/notification/settings it stretched the whole batch to ~7s under
  // load. Standalone so it only blocks its own page, not the shell.
  'intelligence.getMembershipHealth',
  // Pulled back into the batch (2026-05-28) — each adds <3s and the
  // savings in auth round-trips outweighs the marginal tile-fill delay:
  //   intelligence.getAIRevenueAttribution
  //   intelligence.getOccupancyHeatmap
  //   intelligence.getMemberGrowth
  //   intelligence.getMemberHealth
  //   intelligence.getVipAtRiskPercent
])

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        cacheTime: 10 * 60 * 1000, // 10 min — keep cache longer to survive navigation
        refetchOnWindowFocus: false,
        // Tight retry policy specifically for transient 401s caused by
        // cold-start auth-storm: one fast retry, then exponential. The
        // root cause (parallel auth checks exhausting pgbouncer) is
        // being fixed server-side; this just keeps the UX from staring
        // at N/A while React Query waits a full 30s before the first
        // retry per its default exponential schedule.
        retry: (failureCount, error: any) => {
          const httpStatus = error?.data?.httpStatus ?? error?.shape?.data?.httpStatus
          if (httpStatus === 401 || httpStatus === 503) {
            return failureCount < 2 // 2 fast retries on auth/availability blips
          }
          return failureCount < 1 // default: 1 retry on anything else
        },
        retryDelay: (attemptIndex, error: any) => {
          const httpStatus = error?.data?.httpStatus ?? error?.shape?.data?.httpStatus
          if (httpStatus === 401 || httpStatus === 503) {
            return 500 + attemptIndex * 500 // 500ms, 1000ms — fast catch-up
          }
          return Math.min(1000 * 2 ** attemptIndex, 8000)
        },
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
