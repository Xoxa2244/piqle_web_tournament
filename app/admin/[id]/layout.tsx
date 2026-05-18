'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import TournamentNavBar from '@/components/TournamentNavBar'
import { toast } from '@/components/ui/use-toast'

export default function TournamentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params?.id as string
  const [baseUrl, setBaseUrl] = useState('')

  const { data: tournament, isLoading, isError } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  const isOwner = tournament?.userAccessInfo?.isOwner ?? false

  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length ?? 0

  useEffect(() => {
    setBaseUrl(typeof window !== 'undefined' ? window.location.origin : '')
  }, [])

  const handlePublicScoreboardClick = () => {
    if (!tournament?.isPublicBoardEnabled) {
      toast({ description: 'Public Scoreboard is not available. Please enable it in tournament settings.', variant: 'destructive' })
      return
    }
    router.push(`/scoreboard/${tournamentId}`)
  }

  const handleInviteRegistrationClick = async () => {
    const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
    const inviteUrl = `${origin}/tournaments/${tournamentId}/invite`

    try {
      await navigator.clipboard.writeText(inviteUrl)
      toast({ title: 'Invite link copied', description: 'Registration invite link has been copied to clipboard.' })
    } catch (error) {
      const textArea = document.createElement('textarea')
      textArea.value = inviteUrl
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        toast({ title: 'Invite link copied', description: 'Registration invite link has been copied to clipboard.' })
      } catch {
        toast({ title: 'Error', description: 'Failed to copy invite link.', variant: 'destructive' })
      } finally {
        document.body.removeChild(textArea)
      }
    }
  }

  const handleEditTournamentClick = () => {
    router.push(`/admin/${tournamentId}?edit=1`)
  }

  if (!tournamentId) {
    return <>{children}</>
  }

  if (isLoading || isError || !tournament) {
    return <>{children}</>
  }

  return (
    <>
      <TournamentNavBar
        tournamentTitle={tournament.title}
        tournamentImage={tournament.image ?? undefined}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
        onInviteRegistrationClick={handleInviteRegistrationClick}
        onPublicScoreboardClick={handlePublicScoreboardClick}
        onEditTournamentClick={handleEditTournamentClick}
        publicScoreboardUrl={tournament.isPublicBoardEnabled && baseUrl ? `${baseUrl}/scoreboard/${tournamentId}` : undefined}
        tournamentFormat={tournament.format}
        tournamentIsPro={tournament.isPro ?? true}
      />
      <div className="pt-[7.5rem]">
        {children}
      </div>
    </>
  )
}
