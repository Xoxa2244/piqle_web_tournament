'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function SchedulePage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.id as string

  useEffect(() => {
    // Перенаправляем на новый экран управления стадиями
    router.replace(`/admin/${tournamentId}/stages`)
  }, [tournamentId, router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-4 text-gray-600">Перенаправление на новый экран управления стадиями...</p>
      </div>
    </div>
  )
}