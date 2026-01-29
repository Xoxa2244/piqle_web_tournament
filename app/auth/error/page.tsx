'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const errorMessages: Record<string, string> = {
  CredentialsSignin: 'Invalid email or password.',
  EMAIL_GOOGLE_ACCOUNT:
    'This email is already linked to a Google account. Please sign in with Google.',
  EMAIL_PASSWORD_NOT_SET: 'This account does not have a password. Please sign up.',
  EMAIL_PASSWORD_INVALID: 'Invalid email or password.',
  AccessDenied: 'Access denied. Please try again.',
  Configuration: 'Authentication is not configured correctly.',
  Default: 'Unable to sign in. Please try again.',
}

export default function AuthErrorPage() {
  const params = useSearchParams()
  const error = params.get('error') || 'Default'
  const message = errorMessages[error] || errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-6 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-2xl font-bold text-center text-gray-900">
            Sign in failed
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {message}
          </p>
        </div>

        <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
          <Link href="/auth/signin">Back to Sign In</Link>
        </Button>
      </div>
    </div>
  )
}
'use client'

import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'Configuration':
        return 'There is a problem with the server configuration. Please contact support.'
      case 'AccessDenied':
        return 'You do not have permission to sign in.'
      case 'Verification':
        return 'The verification token has expired or has already been used.'
      default:
        return 'An error occurred during authentication. Please try again.'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div className="text-center">
          <AlertCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">
            Authentication Error
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {getErrorMessage(error)}
          </p>
        </div>

        <Button
          onClick={() => window.location.href = '/auth/signin'}
          variant="outline"
          className="w-full"
        >
          Back to Sign In
        </Button>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  )
}
