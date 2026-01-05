'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dupr: string | null
  duprRating: string | null
  gender: string | null
}

interface TeamPlayer {
  id: string
  player: Player
}

interface IndyLeagueTeamPlayersProps {
  teamId: string
  teamPlayers: TeamPlayer[]
  tournamentId: string
  onRefetch?: () => void
}

export default function IndyLeagueTeamPlayers({
  teamId,
  teamPlayers,
  tournamentId,
  onRefetch,
}: IndyLeagueTeamPlayersProps) {
  return (
    <div className="space-y-2">
      {teamPlayers.length === 0 ? (
        <div className="text-sm text-gray-500 italic p-4 text-center">
          No players in team
        </div>
      ) : (
        teamPlayers.map((teamPlayer) => {
          return (
            <div
              key={teamPlayer.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-colors",
                "bg-gray-50 border-gray-200"
              )}
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {/* Player Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {teamPlayer.player.firstName} {teamPlayer.player.lastName}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {teamPlayer.player.email}
                    {teamPlayer.player.dupr && ` • DUPR: ${teamPlayer.player.dupr}`}
                  </div>
                </div>
              </div>
            </div>
          )
        })
      )}

      {teamPlayers.length > 0 && teamPlayers.length < 8 && (
        <div className="text-xs text-gray-500 text-center pt-2">
          {teamPlayers.length} / 8 players
        </div>
      )}
    </div>
  )
}

