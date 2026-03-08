'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ImportRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const clubId = params.id as string

  useEffect(() => {
    router.replace(`/clubs/${clubId}/intelligence/advisor`)
  }, [clubId, router])

  return null
}
