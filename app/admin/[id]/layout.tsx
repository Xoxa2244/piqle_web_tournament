'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import TournamentNavBar from '@/components/TournamentNavBar'

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
      alert('Public Scoreboard is not available. Please enable it in tournament settings.')
      return
    }
    window.open(`/scoreboard/${tournamentId}`, '_blank')
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
        onPublicScoreboardClick={handlePublicScoreboardClick}
        onEditTournamentClick={handleEditTournamentClick}
        publicScoreboardUrl={tournament.isPublicBoardEnabled && baseUrl ? `${baseUrl}/scoreboard/${tournamentId}` : undefined}
        tournamentFormat={tournament.format}
      />
      <div className="pt-[7.5rem]">
        {children}
      </div>
    </>
  )
}
