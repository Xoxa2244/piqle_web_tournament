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

export function ClubTournamentCard({
  tournament,
  onPress,
  fallbackVenueName,
  fallbackVenueAddress,
}: {
  tournament: ClubTournament
  onPress: () => void
  fallbackVenueName?: string | null
  fallbackVenueAddress?: string | null
}) {
  return (
    <TournamentCard
      tournament={{
        ...tournament,
        startDate: tournament.startDate ?? new Date().toISOString(),
        endDate: tournament.endDate ?? tournament.startDate ?? new Date().toISOString(),
        venueName: tournament.venueName ?? fallbackVenueName ?? null,
        venueAddress: tournament.venueAddress ?? fallbackVenueAddress ?? null,
        divisions: tournament.divisions ?? [],
        _count: tournament._count ?? { players: 0 },
        feedbackSummary: tournament.feedbackSummary ?? null,
      }}
      statusLabel="Open"
      statusTone="success"
      onPress={onPress}
    />
  )
}
