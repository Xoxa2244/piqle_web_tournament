'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  User, 
  Edit, 
  Trash2,
  X
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
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
  letter?: string | null // A, B, C, or D from DayRoster
}

interface IndyLeagueTeamPlayersProps {
  teamId: string
  teamPlayers: TeamPlayer[]
  tournamentId: string
  onRefetch?: () => void
}

const LETTERS = ['A', 'B', 'C', 'D'] as const
type Letter = typeof LETTERS[number]

export default function IndyLeagueTeamPlayers({
  teamId,
  teamPlayers,
  tournamentId,
  onRefetch,
}: IndyLeagueTeamPlayersProps) {
  const [updatingPlayerId, setUpdatingPlayerId] = useState<string | null>(null)

  // Get the latest matchup for this team to show letters
  const { data: latestMatchup } = trpc.indyMatchup.getLatestForTeam.useQuery(
    { teamId },
    { enabled: !!teamId }
  )

  // Get rosters for the latest matchup
  const { data: rosters, refetch: refetchRosters } = trpc.indyMatchup.getRosters.useQuery(
    { matchupId: latestMatchup?.id || '' },
    { enabled: !!latestMatchup?.id }
  )

  // Create a map of playerId -> letter from rosters
  const playerLetterMap = new Map<string, string>()
  if (rosters) {
    rosters.forEach(roster => {
      if (roster.isActive && roster.letter) {
        playerLetterMap.set(roster.playerId, roster.letter)
      }
    })
  }

  // Update letter mutation
  const updateLetterMutation = trpc.indyMatchup.updatePlayerLetter.useMutation({
    onSuccess: () => {
      refetchRosters()
      onRefetch?.()
      setUpdatingPlayerId(null)
    },
    onError: (error) => {
      console.error('Failed to update letter:', error)
      alert('Failed to update letter: ' + error.message)
      setUpdatingPlayerId(null)
    },
  })

  const handleLetterChange = async (playerId: string, newLetter: Letter | null) => {
    if (!latestMatchup) {
      alert('No matchup found. Please create a matchup and add players to roster first.')
      return
    }

    setUpdatingPlayerId(playerId)

    // Find the roster entry for this player
    const existingRoster = rosters?.find(r => r.playerId === playerId && r.teamId === teamId)
    
    if (!existingRoster) {
      alert('Player is not in the roster for this matchup. Please add player to roster first.')
      setUpdatingPlayerId(null)
      return
    }

    // If assigning a letter, check if it's already taken by another player
    if (newLetter) {
      const letterTakenBy = rosters?.find(
        r => r.teamId === teamId && r.playerId !== playerId && r.letter === newLetter && r.isActive
      )
      
      if (letterTakenBy) {
        // Remove letter from the other player first
        await updateLetterMutation.mutateAsync({
          matchupId: latestMatchup.id,
          playerId: letterTakenBy.playerId,
          teamId,
          letter: null,
        })
      }
    }

    // Update this player's letter
    await updateLetterMutation.mutateAsync({
      matchupId: latestMatchup.id,
      playerId,
      teamId,
      letter: newLetter,
    })
  }

  // Get current letter for a player
  const getPlayerLetter = (playerId: string): Letter | null => {
    return (playerLetterMap.get(playerId) as Letter) || null
  }

  // Check if a letter is available (not taken by another active player)
  const isLetterAvailable = (letter: Letter, currentPlayerId: string): boolean => {
    if (!rosters) return true
    const takenBy = rosters.find(
      r => r.teamId === teamId && r.playerId !== currentPlayerId && r.letter === letter && r.isActive
    )
    return !takenBy
  }

  // Show warning if no matchup exists
  const showNoMatchupWarning = !latestMatchup && teamPlayers.length > 0

  return (
    <div className="space-y-2">
      {showNoMatchupWarning && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
          ⚠️ No matchup found. Create a matchup first to assign letters to players.
        </div>
      )}

      {teamPlayers.length === 0 ? (
        <div className="text-sm text-gray-500 italic p-4 text-center">
          No players in team
        </div>
      ) : (
        teamPlayers.map((teamPlayer) => {
          const currentLetter = getPlayerLetter(teamPlayer.player.id)
          const isUpdating = updatingPlayerId === teamPlayer.player.id

          return (
            <div
              key={teamPlayer.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-colors",
                currentLetter ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
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

                {/* Current Letter Badge */}
                {currentLetter && (
                  <Badge 
                    variant="default" 
                    className="text-xs font-bold min-w-[2rem] justify-center"
                  >
                    {currentLetter}
                  </Badge>
                )}
              </div>

              {/* Letter Selector - only show if matchup exists */}
              {latestMatchup && (
                <div className="flex items-center space-x-1 ml-3">
                  {LETTERS.map((letter) => {
                    const isAvailable = isLetterAvailable(letter, teamPlayer.player.id)
                    const isSelected = currentLetter === letter

                    return (
                      <Button
                        key={letter}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "h-8 w-8 p-0 text-xs font-bold",
                          isSelected && "bg-blue-600 hover:bg-blue-700",
                          !isAvailable && !isSelected && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={() => {
                          if (isUpdating) return
                          if (isSelected) {
                            handleLetterChange(teamPlayer.player.id, null)
                          } else if (isAvailable) {
                            handleLetterChange(teamPlayer.player.id, letter)
                          }
                        }}
                        disabled={isUpdating || (!isAvailable && !isSelected) || !latestMatchup}
                        title={
                          isSelected 
                            ? `Remove letter ${letter}`
                            : isAvailable 
                            ? `Assign letter ${letter}`
                            : `Letter ${letter} is already assigned`
                        }
                      >
                        {letter}
                      </Button>
                    )
                  })}

                  {/* Clear Letter Button */}
                  {currentLetter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                      onClick={() => {
                        if (isUpdating) return
                        handleLetterChange(teamPlayer.player.id, null)
                      }}
                      disabled={isUpdating}
                      title="Clear letter"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
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

