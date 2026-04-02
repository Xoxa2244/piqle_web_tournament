'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { trpc } from '@/lib/trpc'

export default function AcceptAdminInvitePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const token = searchParams.get('token')

  const [state, setState] = useState<'loading' | 'signing_in' | 'accepting' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ clubId: string; clubName: string; role: string } | null>(null)

  const acceptMutation = trpc.club.acceptAdminInvite.useMutation({
    onSuccess: (data) => {
      setResult(data)
      setState('success')
      setTimeout(() => {
        router.push(`/clubs/${data.clubId}/intelligence`)
      }, 2000)
    },
    onError: (err) => {
      setError(err.message)
      setState('error')
    },
  })

  useEffect(() => {
    if (!token) {
      setError('No invite token provided')
      setState('error')
      return
    }

    if (sessionStatus === 'loading') return

    if (sessionStatus === 'unauthenticated') {
      setState('signing_in')
      return
    }

    // Authenticated — accept the invite
    if (sessionStatus === 'authenticated' && state === 'loading') {
      setState('accepting')
      acceptMutation.mutate({ token })
    }
  }, [token, sessionStatus, state])

  if (!token) {
    return (
      <Container>
        <ErrorCard message="Invalid invite link. No token found." />
      </Container>
    )
  }

  if (state === 'signing_in') {
    return (
      <Container>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#111827' }}>Admin Invite</h1>
          <p style={{ color: '#6b7280', marginBottom: 24 }}>Sign in to accept your admin invitation</p>
          <button
            onClick={() => signIn(undefined, { callbackUrl: `/invite/admin?token=${token}` })}
            style={{
              padding: '12px 32px',
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </div>
      </Container>
    )
  }

  if (state === 'accepting' || state === 'loading') {
    return (
      <Container>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#111827' }}>Accepting invite...</h1>
          <p style={{ color: '#6b7280' }}>Setting up your admin access</p>
        </div>
      </Container>
    )
  }

  if (state === 'success' && result) {
    return (
      <Container>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#111827' }}>Welcome!</h1>
          <p style={{ color: '#6b7280', marginBottom: 8 }}>
            You are now <strong>{result.role === 'MODERATOR' ? 'Moderator' : 'Admin'}</strong> of <strong>{result.clubName}</strong>
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Redirecting to dashboard...</p>
        </div>
      </Container>
    )
  }

  return (
    <Container>
      <ErrorCard message={error || 'Something went wrong'} />
    </Container>
  )
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f9fafb',
      padding: 16,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '48px 40px',
        maxWidth: 420,
        width: '100%',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        {children}
      </div>
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#111827' }}>Invite Error</h1>
      <p style={{ color: '#ef4444' }}>{message}</p>
    </div>
  )
}
