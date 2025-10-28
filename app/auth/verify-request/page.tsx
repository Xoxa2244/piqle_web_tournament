'use client'

import { CheckCircle, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div className="text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            We sent a magic link to your email address.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <Mail className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Email sent!</p>
              <p className="mt-1">Click the link in the email to sign in.</p>
              <p className="mt-2 text-blue-600">
                Check your spam folder if you don&apos;t see it.
              </p>
            </div>
          </div>
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

