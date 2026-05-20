'use client'

/**
 * Legacy /leagues route — redirects to Programming IQ.
 *
 * Per DASHBOARD_AND_ACTION_CENTER_SPEC.md v1.3 §8.3: Leagues is no
 * longer a top-level sidebar entry. The read-only league catalogue
 * is reachable as a drawer inside Programming IQ. This page exists
 * only so historic links (emails, bookmarks, admin reminders) don't
 * 404; it client-side redirects to `/programming` and never renders
 * any UI of its own.
 */

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function LeaguesRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const clubId = (params?.id as string) || ''
    if (!clubId) return
    const demoParam = searchParams?.get('demo') === 'true' ? '?demo=true' : ''
    router.replace(`/clubs/${clubId}/intelligence/programming${demoParam}`)
  }, [params, router, searchParams])

  return null
}
