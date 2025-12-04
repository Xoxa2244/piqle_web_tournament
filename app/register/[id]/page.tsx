'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react'
import Link from 'next/link'

export default function TournamentRegisterPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const tournamentId = params.id as string

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    gender: '' as 'M' | 'F' | '',
    duprRating: '',
  })

  const [error, setError] = useState('')

  // Fetch tournament details
  const { data: tournament, isLoading: tournamentLoading } = trpc.public.getTournamentById.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  const createCheckout = trpc.payment.createRegistrationCheckout.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    },
    onError: (error) => {
      // If Stripe is not configured, show message and redirect to scoreboard
      alert(`Registration successful! Entry fee payment is pending. ${error.message}`)
      router.push(`/scoreboard/${tournamentId}?success=registered&paymentPending=true`)
    },
  })

  const registerMutation = trpc.player.register.useMutation({
    onSuccess: (data) => {
      // If tournament requires payment, create Stripe checkout
      if (data.tournament.requiresPayment) {
        createCheckout.mutate({
          tournamentId,
          playerId: data.player.id,
        })
      } else {
        // Free tournament - registration complete
        alert('Registration successful! You are now registered for this tournament.')
        router.push(`/scoreboard/${tournamentId}?success=registered`)
      }
    },
    onError: (error) => {
      setError(error.message)
    },
  })

  // Pre-fill user data from session
  useEffect(() => {
    if (session?.user) {
      setFormData(prev => ({
        ...prev,
        email: session.user.email || '',
        firstName: session.user.name?.split(' ')[0] || '',
        lastName: session.user.name?.split(' ').slice(1).join(' ') || '',
      }))
    }
  }, [session])

  // Redirect if not authenticated
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    )
  }

  if (sessionStatus === 'unauthenticated') {
    router.push(`/auth/signin?callbackUrl=/register/${tournamentId}`)
    return null
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.gender) {
      setError('Please select your gender')
      return
    }

    registerMutation.mutate({
      tournamentId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      gender: formData.gender,
      duprRating: formData.duprRating ? parseFloat(formData.duprRating) : undefined,
    })
  }

  if (tournamentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full p-6">
          <CardTitle className="text-center text-red-600">Tournament Not Found</CardTitle>
          <Link href="/" className="mt-4 block text-center text-blue-600 hover:underline">
            Back to Home
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Tournaments</span>
        </Link>

        {/* Tournament Info Card */}
        <Card className="mb-6 border-l-4 border-l-blue-600">
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{tournament.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div>
                📅 {new Date(tournament.startDate).toLocaleDateString()} - {new Date(tournament.endDate).toLocaleDateString()}
              </div>
              {tournament.venueName && (
                <div>📍 {tournament.venueName}</div>
              )}
            </div>
            {tournament.entryFee && parseFloat(tournament.entryFee) > 0 && (
              <div className="mt-3 inline-flex items-center bg-green-100 text-green-800 px-3 py-1.5 rounded-lg font-semibold">
                💵 Entry Fee: ${tournament.entryFee}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Registration Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Player Registration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* First Name */}
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                  className="mt-1"
                  placeholder="John"
                />
              </div>

              {/* Last Name */}
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                  className="mt-1"
                  placeholder="Doe"
                />
              </div>

              {/* Email */}
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="mt-1"
                  placeholder="john.doe@example.com"
                />
              </div>

              {/* Gender */}
              <div>
                <Label htmlFor="gender">Gender *</Label>
                <select
                  id="gender"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' })}
                  required
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select Gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              {/* DUPR Rating */}
              <div>
                <Label htmlFor="duprRating">DUPR Rating (Optional)</Label>
                <Input
                  id="duprRating"
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  value={formData.duprRating}
                  onChange={(e) => setFormData({ ...formData, duprRating: e.target.value })}
                  className="mt-1"
                  placeholder="3.5"
                />
                <p className="text-xs text-gray-500 mt-1">Enter your DUPR rating if you have one (0.00 - 5.00)</p>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-6 text-base shadow-lg"
                >
                  {registerMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Registering...
                    </>
                  ) : tournament.entryFee && parseFloat(tournament.entryFee) > 0 ? (
                    <>Register & Proceed to Payment</>
                  ) : (
                    <>Complete Registration</>
                  )}
                </Button>
              </div>

              <p className="text-xs text-gray-500 text-center mt-4">
                By registering, you agree to the tournament rules and policies.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

