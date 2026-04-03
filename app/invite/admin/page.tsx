'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { trpc } from '@/lib/trpc'

export default function AcceptAdminInvitePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}><p>Loading...</p></div>}>
      <AcceptAdminInviteContent />
    </Suspense>
  )
}

function AcceptAdminInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const token = searchParams.get('token')

  const [state, setState] = useState<'loading' | 'signing_in' | 'wrong_account' | 'accepting' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ clubId: string; clubName: string; role: string } | null>(null)
  const [inviteEmail, setInviteEmail] = useState<string | null>(null)

  // Fetch invite info to check email match
  const inviteQuery = trpc.club.getInviteInfo.useQuery(
    { token: token! },
    { enabled: !!token, retry: false }
  )

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

    if (sessionStatus === 'loading' || inviteQuery.isLoading) return

    if (sessionStatus === 'unauthenticated') {
      setState('signing_in')
      return
    }

    // Authenticated — check email match
    if (sessionStatus === 'authenticated' && state === 'loading') {
      const targetEmail = inviteQuery.data?.inviteeEmail
      const currentEmail = session?.user?.email

      if (targetEmail && currentEmail && targetEmail.toLowerCase() !== currentEmail.toLowerCase()) {
        setInviteEmail(targetEmail)
        setState('wrong_account')
        return
      }

      setState('accepting')
      acceptMutation.mutate({ token })
    }
  }, [token, sessionStatus, state, inviteQuery.isLoading, inviteQuery.data])

  if (!token) {
    return (
      <Container>
        <ErrorCard message="Invalid invite link. No token found." />
      </Container>
    )
  }

  if (state === 'wrong_account') {
    return (
      <Container>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#111827' }}>Wrong Account</h1>
          <p style={{ color: '#6b7280', marginBottom: 8 }}>
            This invite was sent to <strong>{inviteEmail}</strong>
          </p>
          <p style={{ color: '#6b7280', marginBottom: 24 }}>
            You&apos;re signed in as <strong>{session?.user?.email}</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={async () => {
                const { signOut, signIn: doSignIn } = await import('next-auth/react')
                await signOut({ redirect: false })
                doSignIn('google', { callbackUrl: `/invite/admin?token=${token}` }, { prompt: 'select_account' })
              }}
              style={{ padding: '12px 32px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
            >
              Switch Account
            </button>
            <button
              onClick={() => { setState('accepting'); acceptMutation.mutate({ token: token! }) }}
              style={{ padding: '12px 32px', background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Accept with current account anyway
            </button>
          </div>
        </div>
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
            onClick={() => signIn('google', { callbackUrl: `/invite/admin?token=${token}` }, { prompt: 'select_account' } as any)}
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
