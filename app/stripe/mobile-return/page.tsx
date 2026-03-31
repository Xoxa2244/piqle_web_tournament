'use client'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

const APP_SCHEME = 'piqle://profile/edit'

export default function StripeMobileReturnPage() {
  const params = useSearchParams()
  const status = (params.get('status') || 'return').trim().toLowerCase()
  const target = useMemo(() => `${APP_SCHEME}?stripe=${encodeURIComponent(status)}`, [status])

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = target
    }, 120)
    return () => clearTimeout(timer)
  }, [target])

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0b0b', color: '#fff' }}>
      <div style={{ maxWidth: 440, padding: 24, textAlign: 'center', lineHeight: 1.5 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Returning to Piqle...</h1>
        <p style={{ marginTop: 12, opacity: 0.84 }}>
          If the app did not open automatically, tap the button below.
        </p>
        <a
          href={target}
          style={{
            display: 'inline-block',
            marginTop: 14,
            padding: '10px 16px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Open Piqle app
        </a>
      </div>
    </main>
  )
}

