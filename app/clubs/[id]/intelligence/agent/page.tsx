'use client'
/**
 * AI Agent tab retired 2026-04-24.
 *
 * Advisor itself is the agent now — pending queue, batch actions, and
 * decision records all surface inline in /intelligence/advisor. The
 * dedicated agent page + 8755-line AgentIQ.tsx component were removed.
 *
 * This route is kept as a client-side redirect because several durable
 * URLs point at `/intelligence/agent` that predate the retirement:
 *   - admin reminder hrefs persisted in AdminReminderRecord rows
 *   - launch-preflight actionHref fields
 *   - superadmin/integration-ops + agent-rollout Links
 *   - Advisor API response strings ("View all ... in Agent page")
 *
 * Deleting the route would 404 all of them. The redirect lands admins on
 * Advisor so old links still make sense.
 */
import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function AgentPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const clubId = params.id as string

  useEffect(() => {
    // Preserve demo mode + any focus= param so the advisor page can
    // pattern-match on them (`focus=ops-queue` / `focus=pending-queue`
    // are the ones the old agent page accepted).
    const qs = new URLSearchParams(searchParams.toString())
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    router.replace(`/clubs/${clubId}/intelligence/advisor${suffix}`)
  }, [clubId, router, searchParams])

  return (
    <div className="p-8 text-center text-muted-foreground text-sm">
      Redirecting to AI Advisor…
    </div>
  )
}
