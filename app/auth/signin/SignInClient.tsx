'use client'

import { signIn, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useBrand } from "@/components/BrandProvider"
import { ArrowRight, CheckCircle2, Lock, Mail, MessageSquare, Shield, Sparkles } from "lucide-react"

const inputClass =
  "mt-2 block w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-400/20"

const secondaryButtonClass =
  "text-sm font-medium text-cyan-300 transition hover:text-cyan-200"

function StepBadge({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-gradient-to-r from-violet-500/30 to-cyan-400/20 text-white shadow-[0_10px_30px_rgba(6,182,212,0.12)]"
          : "text-white/55 hover:text-white/80"
      }`}
    >
      {children}
    </div>
  )
}

function InfoBanner({ tone, children }: { tone: 'error' | 'notice'; children: React.ReactNode }) {
  const isError = tone === 'error'
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm backdrop-blur-xl ${
        isError
          ? "border-red-400/20 bg-red-500/10 text-red-100"
          : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      }`}
    >
      {children}
    </div>
  )
}

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
      setNotice('Verification code sent. Check your inbox to continue.')
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="sms-consent"
          checked={smsConsent}
          onChange={(e) => setSmsConsent(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-cyan-400 focus:ring-cyan-400"
        />
        <label htmlFor="sms-consent" className="text-xs leading-6 text-white/70">
          I agree to receive recurring automated SMS notifications from IQSport about my club activity including booking reminders, session invites, and event updates. Message frequency: 2-8 msgs/month. Msg&amp;data rates may apply. Reply STOP to opt out anytime.{" "}
          <a href="https://iqsport.ai/sms-terms" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2">
            SMS Terms
          </a>
          {" · "}
          <a href="https://iqsport.ai/privacy" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2">
            Privacy Policy
          </a>
        </label>
      </div>
    </div>
  )

  const subCopy =
    mode === 'signin'
      ? signInStep === 'password'
        ? 'Use your email and password or Google to sign in.'
        : 'Reset your password with a code sent to your email. This can also add a password to an existing social-sign-in account with the same email.'
      : 'Create an account with email verification. If this email already exists via social sign-in, we will add password sign-in to that same account.'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B0D17] text-white">
      <div className="absolute inset-0">
        <div className="absolute left-[-10%] top-[-8%] h-[28rem] w-[28rem] rounded-full bg-violet-600/18 blur-3xl" />
        <div className="absolute bottom-[-12%] right-[-8%] h-[30rem] w-[30rem] rounded-full bg-cyan-500/14 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_38%),linear-gradient(180deg,rgba(11,13,23,0.5),#0B0D17_55%)]" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <section className="hidden min-h-[720px] flex-col justify-between rounded-[32px] border border-white/8 bg-white/[0.03] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl lg:flex">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                IQSport Access
              </div>

              <div className="max-w-xl space-y-5">
                <h1 className="text-5xl font-semibold leading-tight tracking-tight text-white">
                  Enter the club operating system built for modern racket venues.
                </h1>
                <p className="max-w-lg text-base leading-7 text-white/65">
                  Sign in to manage members, campaigns, schedule intelligence, and AI workflows in the same visual language as the rest of the IQSport platform.
                </p>
              </div>

              <div className="grid gap-4">
                {[
                  {
                    icon: Shield,
                    title: "Secure access",
                    body: "Google sign-in, email verification, and password recovery stay in one clean flow.",
                  },
                  {
                    icon: MessageSquare,
                    title: "Member messaging ready",
                    body: "Registration keeps your SMS disclosure intact so the compliance step stays visible.",
                  },
                  {
                    icon: CheckCircle2,
                    title: "Built for operations",
                    body: "Same dark glass aesthetic, same high-signal interface, no separate-feeling auth page.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 rounded-3xl border border-white/8 bg-[#12162A]/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-cyan-400/20 text-cyan-200">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-white">{item.title}</div>
                      <p className="text-sm leading-6 text-white/60">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-gradient-to-r from-violet-500/12 to-cyan-400/10 p-6">
              <div className="mb-3 text-xs uppercase tracking-[0.24em] text-white/45">Platform</div>
              <div className="text-2xl font-semibold text-white">{brand.name}</div>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/60">{brand.tagline}</p>
            </div>
          </section>

          <section className="flex items-center justify-center">
            <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-[rgba(15,18,35,0.82)] p-5 shadow-[0_32px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-8">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/60 lg:hidden">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                    IQSport Access
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                      {mode === 'signup' ? `Create your ${brand.name} account` : `Welcome to ${brand.name}`}
                    </h2>
                    <p className="max-w-lg text-sm leading-6 text-white/60">
                      {subCopy}
                    </p>
                  </div>

                  <div className="flex rounded-[22px] border border-white/10 bg-white/[0.03] p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signin')
                        setSignInStep('password')
                        setError(null)
                        setNotice(null)
                      }}
                      className="flex-1"
                    >
                      <StepBadge active={mode === 'signin'}>Sign In</StepBadge>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup')
                        setStep('email')
                        setError(null)
                        setNotice(null)
                      }}
                      className="flex-1"
                    >
                      <StepBadge active={mode === 'signup'}>Sign Up</StepBadge>
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleGoogleSignIn}
                  className="h-14 w-full justify-center gap-3 rounded-2xl border border-white/12 bg-white/[0.05] text-white hover:bg-white/[0.08]"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Continue with Google</span>
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-[0.24em]">
                    <span className="bg-[rgba(15,18,35,0.92)] px-3 text-white/35">Or continue with email</span>
                  </div>
                </div>

                {error && <InfoBanner tone="error">{error}</InfoBanner>}
                {notice && <InfoBanner tone="notice">{notice}</InfoBanner>}

                {mode === 'signin' && signInStep === 'password' && (
                  <form onSubmit={handlePasswordSignIn} className="space-y-5">
                    <div>
                      <label htmlFor="email" className="text-sm font-medium text-white/70">Email address</label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`${inputClass} pl-11`}
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="password" className="text-sm font-medium text-white/70">Password</label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="password"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={`${inputClass} pl-11`}
                          placeholder="Enter your password"
                        />
                      </div>
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
                        className={secondaryButtonClass}
                      >
                        Forgot password?
                      </button>
                    </div>

                    <Button
                      type="submit"
                      disabled={!email || !password || isVerifying}
                      className="h-14 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_18px_40px_rgba(124,58,237,0.28)] hover:opacity-95"
                    >
                      {isVerifying ? 'Signing in...' : 'Sign in'}
                    </Button>
                  </form>
                )}

                {mode === 'signin' && signInStep === 'resetEmail' && (
                  <form onSubmit={handleRequestPasswordResetCode} className="space-y-5">
                    <div>
                      <label htmlFor="email-reset" className="text-sm font-medium text-white/70">Email address</label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="email-reset"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`${inputClass} pl-11`}
                          placeholder="you@example.com"
                        />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/50">
                        We&apos;ll send a 6-digit code to this email so you can choose a new password. If this account was created with a social sign-in provider, this will add password sign-in to the same account.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      disabled={!email || isSending}
                      className="h-14 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_18px_40px_rgba(124,58,237,0.28)] hover:opacity-95"
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
                      className={secondaryButtonClass}
                    >
                      Back to sign in
                    </button>
                  </form>
                )}

                {mode === 'signin' && signInStep === 'resetDetails' && (
                  <form onSubmit={handleResetPassword} className="space-y-5">
                    <div>
                      <label htmlFor="reset-code" className="text-sm font-medium text-white/70">Reset code</label>
                      <input
                        id="reset-code"
                        name="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        className={inputClass}
                        placeholder="Enter 6-digit code"
                      />
                    </div>

                    <div>
                      <label htmlFor="reset-password" className="text-sm font-medium text-white/70">New password</label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="reset-password"
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          className={`${inputClass} pl-11`}
                          placeholder="At least 8 characters"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reset-confirm-password" className="text-sm font-medium text-white/70">Confirm new password</label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="reset-confirm-password"
                          name="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={resetConfirmPassword}
                          onChange={(e) => setResetConfirmPassword(e.target.value)}
                          className={`${inputClass} pl-11`}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={!resetCode || !resetPassword || !resetConfirmPassword || isVerifying}
                      className="h-14 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_18px_40px_rgba(124,58,237,0.28)] hover:opacity-95"
                    >
                      {isVerifying ? 'Updating password...' : 'Update password'}
                    </Button>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setSignInStep('password')
                          setError(null)
                          setNotice(null)
                        }}
                        className={secondaryButtonClass}
                      >
                        Back to sign in
                      </button>
                      <button
                        type="button"
                        onClick={handleRequestPasswordResetCode}
                        className={secondaryButtonClass}
                        disabled={isSending}
                      >
                        Resend code
                      </button>
                    </div>
                  </form>
                )}

                {mode === 'signup' && step === 'email' && (
                  <form onSubmit={handleRequestCode} className="space-y-5">
                    <div>
                      <label htmlFor="email-signup" className="text-sm font-medium text-white/70">Email address</label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="email-signup"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`${inputClass} pl-11`}
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>

                    {smsConsentBlock}

                    <Button
                      type="submit"
                      disabled={!email || isSending}
                      className="h-14 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_18px_40px_rgba(124,58,237,0.28)] hover:opacity-95"
                    >
                      <span>{isSending ? 'Sending code...' : 'Send verification code'}</span>
                      {!isSending && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </form>
                )}

                {mode === 'signup' && step === 'details' && (
                  <form onSubmit={handleSignUp} className="space-y-5">
                    <div>
                      <label htmlFor="code" className="text-sm font-medium text-white/70">Verification code</label>
                      <input
                        id="code"
                        name="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className={inputClass}
                        placeholder="Enter 6-digit code"
                      />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label htmlFor="firstName" className="text-sm font-medium text-white/70">First name</label>
                        <input
                          id="firstName"
                          name="firstName"
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="lastName" className="text-sm font-medium text-white/70">Last name</label>
                        <input
                          id="lastName"
                          name="lastName"
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="password-signup" className="text-sm font-medium text-white/70">Password</label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="password-signup"
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={`${inputClass} pl-11`}
                          placeholder="At least 8 characters"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="confirm-password" className="text-sm font-medium text-white/70">Confirm password</label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="confirm-password"
                          name="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={`${inputClass} pl-11`}
                        />
                      </div>
                    </div>

                    {smsConsentBlock}

                    <Button
                      type="submit"
                      disabled={!code || !firstName || !lastName || !password || !confirmPassword || isVerifying}
                      className="h-14 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_18px_40px_rgba(124,58,237,0.28)] hover:opacity-95"
                    >
                      {isVerifying ? 'Creating account...' : 'Create account'}
                    </Button>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setStep('email')
                          setCode('')
                        }}
                        className={secondaryButtonClass}
                      >
                        Change email
                      </button>
                      <button
                        type="button"
                        onClick={handleRequestCode}
                        className={secondaryButtonClass}
                        disabled={isSending}
                      >
                        Resend code
                      </button>
                    </div>
                  </form>
                )}

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
                  <div className="mb-1 flex items-center gap-2 font-medium text-white/75">
                    <Shield className="h-4 w-4 text-cyan-300" />
                    Secure access
                  </div>
                  Your sign-in, verification, and recovery flows stay inside the IQSport environment.
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
