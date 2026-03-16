'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const buildDeepLink = (rawPath: string, payment: string | null, scheme: string) => {
  const [pathname, rawQuery = ''] = rawPath.split('?')
  const normalizedPath = pathname.replace(/^\/+/, '')
  const params = new URLSearchParams(rawQuery)

  if (payment) {
    params.set('payment', payment)
  }

  const query = params.toString()
  return `${scheme}://${normalizedPath}${query ? `?${query}` : ''}`
}

export default function MobileReturnPage() {
  const searchParams = useSearchParams()
  const rawPath = searchParams.get('path') ?? '/'
  const payment = searchParams.get('payment')
  const scheme = searchParams.get('scheme') || 'piqle'

  const deepLink = useMemo(
    () => buildDeepLink(rawPath, payment, scheme),
    [payment, rawPath, scheme]
  )

  useEffect(() => {
    window.location.replace(deepLink)
  }, [deepLink])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#f8fafc',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#ffffff',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
          Returning to Piqle
        </h1>
        <p style={{ margin: '12px 0 0', color: '#475569', lineHeight: 1.5 }}>
          If the app did not open automatically, tap the button below.
        </p>
        <Link
          href={deepLink}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '20px',
            minHeight: '48px',
            padding: '0 20px',
            borderRadius: '999px',
            background: '#16a34a',
            color: '#ffffff',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Open app
        </Link>
      </div>
    </main>
  )
}
