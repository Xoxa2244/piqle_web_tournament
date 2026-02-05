'use client'

import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function InvitationRespondPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const invitationId = params.id as string
  const action = searchParams.get('action') === 'accept' ? 'accept' : searchParams.get('action') === 'decline' ? 'decline' : null

  const [done, setDone] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: invitation } = trpc.tournamentInvitation.getById.useQuery(
    { id: invitationId },
    { enabled: !!invitationId && status === 'authenticated' }
  )

  const acceptMutation = trpc.tournamentInvitation.accept.useMutation({
    onSuccess: (data) => {
      setDone(true)
      setTimeout(() => router.push(`/scoreboard/${data.tournamentId}`), 2000)
    },
    onError: (e) => setError(e.message),
  })
  const declineMutation = trpc.tournamentInvitation.decline.useMutation({
    onSuccess: () => {
      setDone(true)
    },
    onError: (e) => setError(e.message),
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      const callbackUrl = `/invitation/${invitationId}/respond?action=${action || 'accept'}`
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`)
      return
    }
    if (status !== 'authenticated' || !invitation || !action) return
    if (done !== null) return
    if (action === 'accept' && !acceptMutation.isPending && !acceptMutation.isSuccess) {
      acceptMutation.mutate({ invitationId })
    } else if (action === 'decline' && !declineMutation.isPending && !declineMutation.isSuccess) {
      declineMutation.mutate({ invitationId })
    }
  }, [status, invitation, action, invitationId, done, acceptMutation, declineMutation, router])

  if (status === 'loading' || (status === 'authenticated' && !invitation && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invitation not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">This invitation does not exist or you do not have access to it.</p>
            <Button asChild className="mt-4">
              <Link href="/">Go to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/">Go to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{action === 'accept' ? 'Invitation accepted' : 'Invitation declined'}</CardTitle>
          </CardHeader>
          <CardContent>
            {action === 'accept' ? (
              <p className="text-gray-600">You have been added to the tournament. Redirecting to players list...</p>
            ) : (
              <p className="text-gray-600">You have declined the invitation. You can be invited again later.</p>
            )}
            <Button asChild className="mt-4">
              <Link href="/">Go to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <p className="text-center text-gray-600">Processing your response...</p>
        </CardContent>
      </Card>
    </div>
  )
}
