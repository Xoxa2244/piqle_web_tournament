'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type SuperadminAccessGateProps = {
  loading: boolean
  allowed: boolean
  needsSignIn: boolean
  reason?: string | null
  onSignIn?: () => void
  children: React.ReactNode
}

export function SuperadminAccessGate({
  loading,
  allowed,
  needsSignIn,
  reason,
  onSignIn,
  children,
}: SuperadminAccessGateProps) {
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Checking superadmin access</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Verifying your session and allowlist access…</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{needsSignIn ? 'Sign in required' : 'Superadmin access required'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              {reason || (needsSignIn ? 'Sign in to continue.' : 'Your account is not allowlisted for superadmin access.')}
            </p>
            {needsSignIn && onSignIn ? (
              <Button className="w-full" onClick={onSignIn}>
                Sign in
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
