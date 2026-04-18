'use client'

import { signIn, useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'

export function useSuperadminAccess() {
  const { data: session, status } = useSession()
  const accessQuery = trpc.superadmin.getAccess.useQuery(undefined, {
    enabled: status === 'authenticated',
    retry: false,
    refetchOnWindowFocus: false,
  })

  const loading = status === 'loading' || (status === 'authenticated' && accessQuery.isLoading)
  const allowed = accessQuery.data?.allowed === true
  const needsSignIn = status === 'unauthenticated'
  const reason =
    accessQuery.data?.reason
    || accessQuery.error?.message
    || (needsSignIn ? 'Sign in required.' : null)

  const requestSignIn = () => {
    const callbackUrl =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '/superadmin'

    return signIn(undefined, { callbackUrl })
  }

  return {
    session,
    status,
    loading,
    allowed,
    needsSignIn,
    reason,
    access: accessQuery.data,
    refetchAccess: accessQuery.refetch,
    requestSignIn,
  }
}
