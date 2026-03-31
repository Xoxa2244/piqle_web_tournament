'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function IntelligenceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const params = useParams()
  const clubId = params?.id as string

  useEffect(() => {
    Sentry.captureException(error, {
      tags: { module: 'intelligence', clubId },
    })
    console.error('[Intelligence Error]', error.message)
  }, [error, clubId])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>

        <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--heading, #f1f5f9)' }}>
          Something went wrong
        </h2>

        <p className="text-sm mb-1" style={{ color: 'var(--t3, #94a3b8)' }}>
          The intelligence module encountered an error. Our team has been notified.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <p className="text-xs mb-4 font-mono px-3 py-2 rounded-lg mt-3"
            style={{ background: 'rgba(239,68,68,0.05)', color: '#f87171', wordBreak: 'break-all' }}>
            {error.message}
          </p>
        )}

        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>

          {clubId && (
            <Link
              href={`/clubs/${clubId}/intelligence`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
              style={{ color: 'var(--t3, #94a3b8)', border: '1px solid var(--card-border, #334155)' }}
            >
              <Home className="w-4 h-4" />
              Dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
