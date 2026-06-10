'use client'

/**
 * Action Center — removed from the sol2-lean build.
 *
 * The page, its feed components (TodayFeed / SignalFeed / TierConstructor /
 * SignalCard) and the nav item are gone. This stub stays so durable links
 * (notifications, bookmarks, admin-reminder hrefs) don't 404 — it lands
 * the operator on the Dashboard instead. Restore from branch Sol2 when
 * Action Center returns.
 */

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function ActionCenterRedirect() {
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
