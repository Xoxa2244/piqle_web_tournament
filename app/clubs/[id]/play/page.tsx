'use client'

import { useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * /clubs/[id]/play — Deep link landing page
 *
 * Redirects to the club's main page with session context preserved.
 * When ?session=<id> is present, passes it through so the club page
 * can highlight / auto-open the booking flow for that session.
 */
export default function PlayPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const clubId = params.id
    const sessionId = searchParams.get('session')

    // Redirect to club page with play tab + optional session
    const target = sessionId
      ? `/clubs/${clubId}?tab=play&session=${sessionId}`
      : `/clubs/${clubId}?tab=play`

    router.replace(target)
  }, [params.id, searchParams, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-lime-600 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading session...</p>
      </div>
    </div>
  )
}
