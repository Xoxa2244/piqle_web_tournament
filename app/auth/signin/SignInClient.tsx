'use client'

import { signIn, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useBrand } from "@/components/BrandProvider"

export default function SignInClient() {
  const brand = useBrand()
  const searchParams = useSearchParams()
  const router = useRouter()
  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const { data: session, status } = useSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [signInStep, setSignInStep] = useState<'password' | 'resetEmail' | 'resetDetails'>('password')
  const [step, setStep] = useState<'email' | 'details'>('email')
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [smsConsent, setSmsConsent] = useState(false)
  const hasAutoStartedProvider = useRef(false)

  useEffect(() => {
    if (status === 'authenticated' && session) {
      router.replace(callbackUrl)
    }
  }, [status, session, callbackUrl, router])

  useEffect(() => {
    const modeParam = searchParams.get('mode')
    const emailParam = searchParams.get('email')
    const providerParam = searchParams.get('provider')

    if (modeParam === 'signup') {
      setMode('signup')
      setStep('email')
      setSignInStep('password')
    }

    if (emailParam && !email) {
      setEmail(emailParam)
    }

    if (providerParam === 'google' && !hasAutoStartedProvider.current) {
      hasAutoStartedProvider.current = true
      signIn('google', { callbackUrl })
    }
  }, [searchParams, email, callbackUrl])

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl })
  }

  const handleRequestCode = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setIsSending(true)

    try {
      const response = await fetch('/api/auth/email/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        if (payload?.error === 'GOOGLE_ACCOUNT_EXISTS') {
          setError('This email is already linked to a Google account. Please sign in with Google.')
          return
        }
        if (payload?.error === 'USER_EXISTS') {
          setError('This email already has a password. Please sign in instead.')
          return
        }
        if (payload?.error === 'CODE_COOLDOWN') {
          setError('Please wait before requesting a new code.')
          return
        }
        setError('Failed to send verification code. Please try again.')
        return
      }

      setStep('details')
    } catch (err) {
      console.error(err)
      setError('Failed to send verification code. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setIsVerifying(true)

    try {
      await signIn('email-password', {
        email,
        password,
        callbackUrl,
      })
      return
    } catch (err) {
      console.error(err)
      setError('Failed to sign in. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsVerifying(true)
    try {
      const response = await fetch('/api/auth/email/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code,
          firstName,
          lastName,
          password,
          smsConsent,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        if (payload?.error === 'GOOGLE_ACCOUNT_EXISTS') {
          setError('This email is already linked to a Google account. Please sign in with Google.')
          return
        }
        if (payload?.error === 'USER_EXISTS') {
          setError('This email already has a password. Please sign in instead.')
          return
        }
        if (payload?.error === 'CODE_EXPIRED') {
          setError('This code has expired. Please request a new one.')
          return
        }
        if (payload?.error === 'CODE_ATTEMPTS_EXCEEDED') {
          setError('Too many attempts. Please request a new code.')
          return
        }
        setError('Failed to sign up. Please try again.')
        return
      }

      await signIn('email-password', {
        email,
        password,
        callbackUrl,
      })
      return
    } catch (err) {
      console.error(err)
      setError('Failed to sign up. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleRequestPasswordResetCode = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setIsSending(true)

    try {
      const response = await fetch('/api/auth/email/password-reset/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        if (payload?.error === 'GOOGLE_ACCOUNT_EXISTS') {
          setError('This email is linked to a Google account. You can still add a password using the reset code flow.')
          return
        }
        if (payload?.error === 'USER_NOT_FOUND') {
          setError('No account exists for this email yet.')
          return
        }
        if (payload?.error === 'CODE_COOLDOWN') {
          setError('Please wait before requesting a new code.')
          return
        }
        setError('Failed to send password reset code. Please try again.')
        return
      }

      setSignInStep('resetDetails')
      setNotice('We sent a password reset code to your email.')
    } catch (err) {
      console.error(err)
      setError('Failed to send password reset code. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (resetPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (resetPassword !== resetConfirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsVerifying(true)

    try {
      const response = await fetch('/api/auth/email/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: resetCode,
          password: resetPassword,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        if (payload?.error === 'USER_NOT_FOUND') {
          setError('No account exists for this email yet.')
          return
        }
        if (payload?.error === 'CODE_EXPIRED') {
          setError('This code has expired. Please request a new one.')
          return
        }
        if (payload?.error === 'CODE_ATTEMPTS_EXCEEDED') {
          setError('Too many attempts. Please request a new code.')
          return
        }
        if (payload?.error === 'CODE_INVALID') {
          setError('The password reset code is invalid.')
          return
        }
        setError('Failed to reset password. Please try again.')
        return
      }

      await signIn('email-password', {
        email,
        password: resetPassword,
        callbackUrl,
      })
    } catch (err) {
      console.error(err)
      setError('Failed to reset password. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const smsConsentBlock = (
    <div className="flex items-start gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
      <input
        type="checkbox"
        id="sms-consent"
        checked={smsConsent}
        onChange={(e) => setSmsConsent(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <label htmlFor="sms-consent" className="text-xs text-gray-600 leading-relaxed">
        I agree to receive recurring automated SMS notifications from IQSport about my club activity including booking reminders, session invites, and event updates. Message frequency: 2-8 msgs/month. Msg&amp;data rates may apply. Reply STOP to opt out anytime.{' '}
        <a href="https://iqsport.ai/sms-terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">SMS Terms</a>
        {' · '}
        <a href="https://iqsport.ai/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Privacy Policy</a>
      </label>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-3xl font-bold text-center text-gray-900">
            Sign in to {brand.name}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {brand.tagline}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex rounded-md border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setSignInStep('password')
                setError(null)
                setNotice(null)
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                mode === 'signin'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setStep('email')
                setError(null)
                setNotice(null)
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                mode === 'signup'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Sign Up
            </button>
          </div>

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

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          {mode === 'signin' && signInStep === 'password' && (
            <form onSubmit={handlePasswordSignIn} className="space-y-4">
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

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your password"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSignInStep('resetEmail')
                    setError(null)
                    setNotice(null)
                    setResetCode('')
                    setResetPassword('')
                    setResetConfirmPassword('')
                  }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                disabled={!email || !password || isVerifying}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isVerifying ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          )}

          {mode === 'signin' && signInStep === 'resetEmail' && (
            <form onSubmit={handleRequestPasswordResetCode} className="space-y-4">
              <div>
                <label htmlFor="email-reset" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="email-reset"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="you@example.com"
                />
                <p className="mt-2 text-sm text-gray-500">
                  We&apos;ll send a 6-digit code to this email so you can choose a new password.
                  If this account was created with a social sign-in provider, this will add
                  password sign-in to the same account.
                </p>
              </div>

              <Button
                type="submit"
                disabled={!email || isSending}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isSending ? 'Sending reset code...' : 'Send reset code'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setSignInStep('password')
                  setError(null)
                  setNotice(null)
                }}
                className="w-full text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Back to sign in
              </button>
            </form>
          )}

          {mode === 'signin' && signInStep === 'resetDetails' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="reset-code" className="block text-sm font-medium text-gray-700">
                  Reset code
                </label>
                <input
                  id="reset-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter 6-digit code"
                />
              </div>

              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700">
                  New password
                </label>
                <input
                  id="reset-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-gray-700">
                  Confirm new password
                </label>
                <input
                  id="reset-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <Button
                type="submit"
                disabled={!resetCode || !resetPassword || !resetConfirmPassword || isVerifying}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isVerifying ? 'Updating password...' : 'Update password'}
              </Button>

              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setSignInStep('password')
                    setError(null)
                    setNotice(null)
                  }}
                  className="text-blue-600 hover:text-blue-500"
                >
                  Back to sign in
                </button>
                <button
                  type="button"
                  onClick={handleRequestPasswordResetCode}
                  className="text-blue-600 hover:text-blue-500"
                  disabled={isSending}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {mode === 'signup' && step === 'email' && (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <div>
                <label htmlFor="email-signup" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="email-signup"
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

              {smsConsentBlock}

              <Button
                type="submit"
                disabled={!email || isSending}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isSending ? 'Sending code...' : 'Send verification code'}
              </Button>
            </form>
          )}

          {mode === 'signup' && step === 'details' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                  Verification code
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter 6-digit code"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                    First name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                    Last name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password-signup" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password-signup"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {smsConsentBlock}

              <Button
                type="submit"
                disabled={!code || !firstName || !lastName || !password || !confirmPassword || isVerifying}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isVerifying ? 'Creating account...' : 'Create account'}
              </Button>

              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email')
                    setCode('')
                  }}
                  className="text-blue-600 hover:text-blue-500"
                >
                  Change email
                </button>
                <button
                  type="button"
                  onClick={handleRequestCode}
                  className="text-blue-600 hover:text-blue-500"
                  disabled={isSending}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-gray-600">
          {mode === 'signin'
            ? signInStep === 'password'
              ? 'Use your email and password or Google to sign in.'
              : 'Reset your password with a code sent to your email. This can also add a password to an existing social-sign-in account with the same email.'
            : 'Create an account with email verification. If this email already exists via social sign-in, we will add password sign-in to that same account.'}
        </p>
      </div>
    </div>
  )
}
