'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Suspense } from 'react'

const errorMessages: Record<string, string> = {
  CredentialsSignin: 'Invalid email or password.',
  EMAIL_GOOGLE_ACCOUNT:
    'This email is linked to a social sign-in provider. You can continue with Google or reset your password to add email sign-in.',
  EMAIL_PASSWORD_NOT_SET:
    'This account does not have a password yet. Use Forgot password to add one and then sign in with email.',
  EMAIL_PASSWORD_INVALID: 'Invalid email or password.',
  AccessDenied: 'Access denied. Please try again.',
  Configuration: 'Authentication is not configured correctly.',
  Default: 'Unable to sign in. Please try again.',
}

function AuthErrorContent() {
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

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  )
}
