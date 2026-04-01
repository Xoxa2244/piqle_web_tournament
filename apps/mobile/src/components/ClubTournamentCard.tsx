import { useMemo } from 'react'

import { trpc } from '../lib/trpc'
import { TournamentCard } from './TournamentCard'

type ClubTournament = {
  id: string
  title: string
  image?: string | null
  startDate?: string | Date | null
  endDate?: string | Date | null
  venueName?: string | null
  venueAddress?: string | null
  entryFee?: string | number | null
  entryFeeCents?: number | null
  format?: string | null
  divisions?: Array<{
    id: string
    name: string
    teamKind?: string | null
    maxTeams?: number | null
    _count?: { teams?: number }
    teams?: Array<{
      teamPlayers?: Array<{
        slotIndex?: number | null
      } | null> | null
    } | null> | null
  }> | null
  _count?: { players?: number }
  user?: {
    id: string
    name?: string | null
    email?: string | null
  } | null
  feedbackSummary?: {
    averageRating: number | null
    total: number
    canPublish: boolean
  } | null
}

/** Как в списке турниров: подмешиваем `getBoardById`, чтобы были верные venue/club label и слоты. */
export function ClubTournamentCard({
  tournament,
  onPress,
}: {
  tournament: ClubTournament
  onPress: () => void
}) {
  const detailQuery = trpc.public.getBoardById.useQuery(
    { id: tournament.id },
    { enabled: Boolean(tournament.id), staleTime: 60_000, retry: false }
  )

  const tournamentForCard = useMemo(() => {
    const detail = detailQuery.data
    return {
      ...tournament,
      ...(detail ?? {}),
      startDate: tournament.startDate ?? new Date().toISOString(),
      endDate: tournament.endDate ?? tournament.startDate ?? new Date().toISOString(),
      divisions: detail?.divisions ?? tournament.divisions ?? [],
      _count: detail?._count ?? tournament._count ?? { players: 0 },
      feedbackSummary: tournament.feedbackSummary ?? null,
    }
  }, [detailQuery.data, tournament])

  return (
    <TournamentCard
      tournament={tournamentForCard}
      statusLabel="Open"
      statusTone="success"
      onPress={onPress}
    />
  )
}
