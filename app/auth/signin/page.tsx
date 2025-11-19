'use client'

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export default function SignInPage() {
  const [email, setEmail] = useState('')

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/admin' })
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    alert('This feature is not available yet, please sign in with Google')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-3xl font-bold text-center text-gray-900">
            Sign in to Piqle
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Tournament Management System
          </p>
        </div>

        <div className="space-y-4">
          {/* Google Sign In */}
          <Button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or</span>
            </div>
          </div>

          {/* Email Sign In */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <Button
              type="submit"
              disabled={!email}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Sign in with Email
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-600">
          New to Piqle?{" "}
          <a 
            href="#" 
            onClick={(e) => {
              e.preventDefault()
              alert('This feature is not available yet, please sign in with Google')
            }}
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Create an account
          </a>
        </p>
      </div>
    </div>
  )
}

