'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { CheckCircle2, CreditCard, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { fromCents } from '@/lib/payment'
import {
  INVITE_REGISTRATION_CLUBS,
  INVITE_REGISTRATION_LEVELS,
  isInviteRegistrationComment,
} from '@/lib/inviteRegistration'
import { formatUsDateTimeShort } from '@/lib/dateFormat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/use-toast'

type GenderValue = 'M' | 'F' | ''

type InvitePagePlayer = {
  id: string
  firstName?: string | null
  lastName?: string | null
  isPaid?: boolean | null
  registrationComment?: unknown
}

export default function TournamentInviteRegistrationPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.id as string
  const { data: session, status: authStatus } = useSession()
  const utils = trpc.useUtils()

  const [fullName, setFullName] = useState('')
  const [gender, setGender] = useState<GenderValue>('')
  const [duprRating, setDuprRating] = useState('')
  const [desiredLevel, setDesiredLevel] = useState('')
  const [clubName, setClubName] = useState('')
  const [showThanksModal, setShowThanksModal] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const handledPaymentResultRef = useRef<string | null>(null)
  const passivePaymentCheckRef = useRef<string | null>(null)

  const {
    data,
    isLoading,
    error,
    refetch,
  } = trpc.registration.getInviteRegistration.useQuery(
    { tournamentId },
    { enabled: authStatus === 'authenticated' && !!tournamentId }
  )

  const submitMutation = trpc.registration.submitInviteRegistration.useMutation({
    onSuccess: async () => {
      await utils.registration.getInviteRegistration.invalidate({ tournamentId })
      await refetch()
      setShowThanksModal(true)
    },
    onError: (mutationError) => {
      toast({
        title: 'Error',
        description: mutationError.message || 'Failed to register',
        variant: 'destructive',
      })
    },
  })
  const confirmPaymentMutation = trpc.payment.confirmCheckoutSession.useMutation()

  useEffect(() => {
    if (authStatus === 'unauthenticated' && tournamentId) {
      const queryString = typeof window !== 'undefined' ? window.location.search : ''
      const callbackUrl = `/tournaments/${tournamentId}/invite${queryString}`
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    }
  }, [authStatus, router, tournamentId])

  useEffect(() => {
    if (!session?.user?.name || fullName) return
    setFullName(session.user.name)
  }, [fullName, session?.user?.name])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (authStatus !== 'authenticated' || !tournamentId) return

    let cancelled = false

    const handleReturnFromPayment = async () => {
      const searchParams = new URLSearchParams(window.location.search)
      const paymentResult = searchParams.get('payment')
      if (!paymentResult || handledPaymentResultRef.current === paymentResult) return

      handledPaymentResultRef.current = paymentResult

      if (paymentResult === 'cancel') {
        await refetch()
        toast({ description: 'Payment was canceled.' })
      }

      if (paymentResult === 'success') {
        const checkoutSessionId = searchParams.get('session_id')
        let paid = false
        const maxAttempts = 10

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            const confirmed = await confirmPaymentMutation.mutateAsync({
              tournamentId,
              sessionId: checkoutSessionId,
            })
            paid = Boolean(confirmed.isPaid)
          } catch {
            paid = false
          }

          const { data: refreshed } = await refetch()
          if (cancelled) return

          paid = paid || Boolean(refreshed?.player?.isPaid)
          if (paid) break

          await new Promise((resolve) => window.setTimeout(resolve, 1500))
        }

        if (cancelled) return

        toast({
          description: paid
            ? 'Payment confirmed.'
            : 'Payment is being confirmed. The status will update automatically.',
          variant: 'success',
        })
      }

      searchParams.delete('payment')
      searchParams.delete('session_id')
      const nextQuery = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`
      window.history.replaceState({}, '', nextUrl)
    }

    const handleFocus = () => {
      void refetch()
    }

    void handleReturnFromPayment()
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handleFocus)
    }
  }, [authStatus, confirmPaymentMutation, refetch, tournamentId])

  const tournament = data?.tournament
  const player = data?.player as InvitePagePlayer | null | undefined
  const playerRegistrationComment: unknown = player?.registrationComment
  const inviteDetailsSubmitted = Boolean(isInviteRegistrationComment(playerRegistrationComment))
  const isPaidTournament = (tournament?.entryFeeCents ?? 0) > 0
  const feeLabel = tournament ? `$${fromCents(tournament.entryFeeCents).toFixed(2)}` : ''
  const paymentPending = Boolean(player && inviteDetailsSubmitted && isPaidTournament && !player.isPaid)

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    if (!paymentPending || !player?.id) return
    if (passivePaymentCheckRef.current === player.id) return

    passivePaymentCheckRef.current = player.id
    void confirmPaymentMutation
      .mutateAsync({ tournamentId, sessionId: null })
      .then((confirmed) => {
        if (confirmed.isPaid) {
          void refetch()
        }
      })
      .catch(() => {
        // Payment can still be pending or Stripe may be unavailable in local env.
      })
  }, [authStatus, confirmPaymentMutation, paymentPending, player?.id, refetch, tournamentId])

  useEffect(() => {
    if (fullName || !player || inviteDetailsSubmitted) return
    const existingName = `${player.lastName ?? ''} ${player.firstName ?? ''}`.trim()
    if (existingName) {
      setFullName(existingName)
    }
  }, [fullName, inviteDetailsSubmitted, player])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsedDuprRating = Number(duprRating)
    if (!fullName.trim() || fullName.trim().split(/\s+/).length < 2) {
      toast({ description: 'Enter last name and first name', variant: 'destructive' })
      return
    }
    if (!gender) {
      toast({ description: 'Select gender', variant: 'destructive' })
      return
    }
    if (!Number.isFinite(parsedDuprRating) || parsedDuprRating < 0 || parsedDuprRating > 8) {
      toast({ description: 'Enter current DUPR rating from 0 to 8', variant: 'destructive' })
      return
    }
    if (!desiredLevel || !clubName) {
      toast({ description: 'Select level and club', variant: 'destructive' })
      return
    }

    try {
      await submitMutation.mutateAsync({
        tournamentId,
        fullName: fullName.trim(),
        gender,
        duprRating: parsedDuprRating,
        desiredLevel: desiredLevel as (typeof INVITE_REGISTRATION_LEVELS)[number],
        clubName: clubName as (typeof INVITE_REGISTRATION_CLUBS)[number],
      })
    } catch {
      // Error toast is handled by the mutation.
    }
  }

  const handlePay = async () => {
    try {
      setPayLoading(true)
      const response = await fetch(
        `/api/tournaments/${tournamentId}/invite-registration/create-checkout-session`,
        { method: 'POST' }
      )
      const raw = await response.text()
      const payload = raw ? JSON.parse(raw) : null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to start payment')
      }
      if (!payload?.url) {
        throw new Error('Checkout session URL missing')
      }
      window.location.href = payload.url
    } catch (paymentError: any) {
      toast({
        title: 'Error',
        description: paymentError.message || 'Failed to start payment',
        variant: 'destructive',
      })
    } finally {
      setPayLoading(false)
    }
  }

  if (authStatus === 'loading' || authStatus === 'unauthenticated' || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading registration...
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center text-gray-600">
            {error?.message || 'Registration is unavailable. Please try again later.'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{tournament.title}</CardTitle>
                <div className="mt-2 text-sm text-gray-600">
                  {isPaidTournament ? (
                    <span>
                      Entry fee: <span className="font-medium text-gray-900">{feeLabel}</span>
                    </span>
                  ) : (
                    <span className="font-medium text-gray-900">Free tournament</span>
                  )}
                </div>
              </div>
              <Badge variant={tournament.registrationOpen ? 'default' : 'secondary'}>
                {tournament.registrationOpen ? 'Registration Open' : 'Registration Closed'}
              </Badge>
            </div>
            <div className="text-sm text-gray-600">
              Tournament starts:{' '}
              <span className="font-medium text-gray-900">
                {formatUsDateTimeShort(tournament.startDate)}
              </span>
            </div>
          </CardHeader>
        </Card>

        {player && inviteDetailsSubmitted ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 text-green-600" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">You are already registered</h1>
                  <p className="mt-1 text-sm text-gray-600">
                    Your registration is in the tournament players list.
                  </p>
                </div>
              </div>

              {isPaidTournament ? (
                player.isPaid ? (
                  <Badge variant="secondary" className="w-fit">Payment complete</Badge>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div className="text-sm font-medium text-amber-900">Payment pending</div>
                    <div className="text-sm text-amber-800">Please pay the {feeLabel} entry fee.</div>
                    <Button
                      onClick={handlePay}
                      disabled={payLoading || !tournament.payoutsActive}
                      className="gap-2"
                    >
                      {payLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      Pay {feeLabel}
                    </Button>
                    {!tournament.payoutsActive && (
                      <div className="text-xs text-amber-800">
                        Payments are not enabled yet. Contact the organizer.
                      </div>
                    )}
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Invite Registration</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                    Name (Last First) *
                  </label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Smith John"
                    disabled={submitMutation.isPending || !tournament.registrationOpen}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
                      Gender *
                    </label>
                    <select
                      id="gender"
                      value={gender}
                      onChange={(event) => setGender(event.target.value as GenderValue)}
                      disabled={submitMutation.isPending || !tournament.registrationOpen}
                      className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                      }}
                    >
                      <option value="">Select gender</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="duprRating" className="block text-sm font-medium text-gray-700 mb-1">
                      Current DUPR Rating *
                    </label>
                    <Input
                      id="duprRating"
                      type="number"
                      min="0"
                      max="8"
                      step="0.01"
                      value={duprRating}
                      onChange={(event) => setDuprRating(event.target.value)}
                      placeholder="3.50"
                      disabled={submitMutation.isPending || !tournament.registrationOpen}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="desiredLevel" className="block text-sm font-medium text-gray-700 mb-1">
                    Desired Level *
                  </label>
                  <select
                    id="desiredLevel"
                    value={desiredLevel}
                    onChange={(event) => setDesiredLevel(event.target.value)}
                    disabled={submitMutation.isPending || !tournament.registrationOpen}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                    }}
                  >
                    <option value="">Select level</option>
                    {INVITE_REGISTRATION_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="clubName" className="block text-sm font-medium text-gray-700 mb-1">
                    Club *
                  </label>
                  <select
                    id="clubName"
                    value={clubName}
                    onChange={(event) => setClubName(event.target.value)}
                    disabled={submitMutation.isPending || !tournament.registrationOpen}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                    }}
                  >
                    <option value="">Select club</option>
                    {INVITE_REGISTRATION_CLUBS.map((club) => (
                      <option key={club} value={club}>
                        {club}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  type="submit"
                  disabled={submitMutation.isPending || !tournament.registrationOpen}
                  className="w-full gap-2"
                >
                  {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Register
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {showThanksModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowThanksModal(false)}
        >
          <Card className="w-full max-w-md" onClick={(event) => event.stopPropagation()}>
            <CardContent className="p-6 space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Thank you for registering</h2>
                {isPaidTournament ? (
                  <p className="mt-2 text-sm text-gray-600">
                    {player?.isPaid
                      ? 'Your registration has been added and payment is complete.'
                      : `Please pay the ${feeLabel} entry fee to complete payment.`}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-gray-600">Your registration has been added.</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {isPaidTournament && !player?.isPaid && (
                  <Button
                    onClick={handlePay}
                    disabled={payLoading || !tournament.payoutsActive}
                    className="gap-2"
                  >
                    {payLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    Pay {feeLabel}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShowThanksModal(false)}>
                  Close
                </Button>
              </div>
              {isPaidTournament && !player?.isPaid && !tournament.payoutsActive && (
                <div className="text-xs text-amber-800">Payments are not enabled yet. Contact the organizer.</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
