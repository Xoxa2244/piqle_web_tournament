'use client'

/**
 * Programming IQ — removed from the sol2-lean build.
 *
 * The page, the ProgrammingIQ component and its grid/popover subcomponents
 * are gone; the nav item is removed. Server-side engines (lib/ai/
 * programming-iq-*) and tRPC procedures stay dormant in the tree. This
 * stub keeps durable links (insight deep-links with ?draftId, the legacy
 * /leagues redirect, old bookmarks) from 404ing — it lands on the
 * Dashboard. Restore from branch Sol2 when Programming IQ returns.
 */

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function ProgrammingRedirect() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const clubId = (params?.id as string) || ''
    if (!clubId) return
    const demoParam = searchParams?.get('demo') === 'true' ? '?demo=true' : ''
    router.replace(`/clubs/${clubId}/intelligence${demoParam}`)
  }, [params, router, searchParams])

  return null
}
