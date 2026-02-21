'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export default function NewClubPage() {
  const router = useRouter()
  const { status } = useSession()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent('/clubs/new')}`)
      return
    }
    if (status === 'authenticated') {
      router.replace('/clubs?create=1')
    }
  }, [status, router])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex items-center justify-center min-h-[200px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
}
