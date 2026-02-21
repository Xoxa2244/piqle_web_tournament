'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ChevronDown, 
  ChevronRight,
  GripVertical, 
  Users,
  User, 
  Edit, 
  Trash2, 
  Star
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import PlayerSlot from './PlayerSlot'
import PlayerSelectionModal from './PlayerSelectionModal'
import { getTeamDisplayName, formatDuprRating } from '@/lib/utils'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dupr: string | null
  duprRating: string | null
  gender: string | null
  isWaitlist: boolean | null
  teamId?: string | null
  teamName?: string | null
}

interface Team {
  id: string
  name: string
  seed: number | null
  note: string | null
  poolId: string | null
  teamPlayers: Array<{
    id: string
    role: string
    createdAt: string
    updatedAt: string
    slotIndex?: number | null
    player: Player
  }>
}

interface TeamWithSlotsProps {
  team: Team
  teamKind: 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
  isExpanded: boolean
  availablePlayers: Player[]
  tournamentId: string
  tournamentFormat?: string
  onToggleExpansion: () => void
  onEdit: () => void
  onDelete: () => void
  onAddPlayer: (slotIndex: number, playerId: string) => void
  onRemovePlayer: (teamPlayerId: string, slotIndex: number) => void
  onMovePlayer: (fromTeamId: string, toTeamId: string, fromSlot: number, toSlot: number) => void
  isDragDisabled?: boolean
  dropTargetId?: string | null
}

export default function TeamWithSlots({
  team,
  teamKind,
  isExpanded,
  availablePlayers,
  tournamentId,
  tournamentFormat,
  onToggleExpansion,
  onEdit,
  onDelete,
  onAddPlayer,
  onRemovePlayer,
  onMovePlayer,
  isDragDisabled = false,
  dropTargetId = null
}: TeamWithSlotsProps) {
  const isIndyLeague = tournamentFormat === 'INDY_LEAGUE'
  const [showPlayerSelection, setShowPlayerSelection] = useState(false)
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Determine number of slots based on team kind
  const slotCount = useMemo(() => {
    if (isIndyLeague && teamKind === 'SQUAD_4v4') return 32

    switch (teamKind) {
      case 'SINGLES_1v1': return 1
      case 'DOUBLES_2v2': return 2
      case 'SQUAD_4v4': return 4
      default: return 2
    }
  }, [isIndyLeague, teamKind])

  // Create slots array with players and teamPlayerIds
  const slots = useMemo(() => {
    const slotsArray: (Player & { teamPlayerId?: string } | null)[] = new Array(slotCount).fill(null)
    
    // Keep rendering stable: place explicit slotIndex first, then fill remaining slots.
    const playersWithSlot = team.teamPlayers
      .filter(
        (teamPlayer) =>
          teamPlayer.slotIndex !== null &&
          teamPlayer.slotIndex !== undefined &&
          teamPlayer.slotIndex >= 0 &&
          teamPlayer.slotIndex < slotCount
      )
      .sort((a, b) => {
        const aSlot = a.slotIndex as number
        const bSlot = b.slotIndex as number
        if (aSlot !== bSlot) return aSlot - bSlot
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

    const playersWithoutSlot = team.teamPlayers
      .filter(
        (teamPlayer) =>
          teamPlayer.slotIndex === null ||
          teamPlayer.slotIndex === undefined ||
          teamPlayer.slotIndex < 0 ||
          teamPlayer.slotIndex >= slotCount
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )

    // Fill explicit slots. If data is inconsistent and slot is already occupied, fallback to auto-placement.
    playersWithSlot.forEach((teamPlayer) => {
      const targetIndex = teamPlayer.slotIndex as number
      if (slotsArray[targetIndex] === null) {
        slotsArray[targetIndex] = {
          ...teamPlayer.player,
          teamPlayerId: teamPlayer.id
        }
      } else {
        playersWithoutSlot.push(teamPlayer)
      }
    })

    // Fill remaining empty slots for players without slotIndex.
    let nextFreeSlot = 0
    playersWithoutSlot.forEach((teamPlayer) => {
      while (nextFreeSlot < slotCount && slotsArray[nextFreeSlot] !== null) {
        nextFreeSlot += 1
      }

      if (nextFreeSlot >= slotCount) return

      slotsArray[nextFreeSlot] = {
        ...teamPlayer.player,
        teamPlayerId: teamPlayer.id
      }
      nextFreeSlot += 1
    })
    
    return slotsArray
  }, [team.teamPlayers, slotCount])

  // If teamPlayers contain more records than we can place into visible slots,
  // keep them visible in a fallback list instead of silently hiding them.
  const unplacedTeamPlayers = useMemo(() => {
    const placedTeamPlayerIds = new Set(
      slots
        .map((slot) => slot?.teamPlayerId)
        .filter((id): id is string => Boolean(id))
    )

    return team.teamPlayers.filter((teamPlayer) => !placedTeamPlayerIds.has(teamPlayer.id))
  }, [slots, team.teamPlayers])

  const filledSlots = slots.filter(slot => slot !== null).length
  // Use getTeamDisplayName to show player names for SINGLES_1v1, team names for others
  const teamName = getTeamDisplayName(team, teamKind)

  // For SINGLES_1v1, get player rating directly (no SUM/AVG needed)
  const playerRating = useMemo(() => {
    if (teamKind === 'SINGLES_1v1' && team.teamPlayers.length > 0) {
      const player = team.teamPlayers[0].player
      return player.duprRating || null
    }
    return null
  }, [team.teamPlayers, teamKind])

  // Calculate DUPR ratings for non-SINGLES (SUM/AVG)
  const duprStats = useMemo(() => {
    if (teamKind === 'SINGLES_1v1') {
      return { sum: null, avg: null, count: 0 }
    }
    
    const playersWithRatings = team.teamPlayers
      .map(tp => tp.player)
      .filter(player => player.duprRating !== null)
    
    if (playersWithRatings.length === 0) {
      return { sum: null, avg: null, count: 0 }
    }
    
    const sum = playersWithRatings.reduce((total, player) => {
      return total + parseFloat(player.duprRating || '0')
    }, 0)
    
    const avg = sum / playersWithRatings.length
    
    return {
      sum: sum.toFixed(3),
      avg: avg.toFixed(3),
      count: playersWithRatings.length
    }
  }, [team.teamPlayers, teamKind])

  const handleAddPlayerClick = (slotIndex: number) => {
    setSelectedSlotIndex(slotIndex)
    setShowPlayerSelection(true)
  }

  const handleRemovePlayer = (slotIndex: number) => {
    const player = slots[slotIndex]
    if (player?.teamPlayerId) {
      onRemovePlayer(player.teamPlayerId, slotIndex)
    }
  }

  const handlePlayerSelect = (playerId: string) => {
    if (selectedSlotIndex !== null) {
      onAddPlayer(selectedSlotIndex, playerId)
    }
    setShowPlayerSelection(false)
    setSelectedSlotIndex(null)
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-white border rounded-lg shadow-sm ${
          isDragging ? 'opacity-50' : ''
        }`}
      >
        {/* Team/Player Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center space-x-3">
            {/* For SINGLES_1v1, no expand button - player is always visible */}
            {teamKind !== 'SINGLES_1v1' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleExpansion}
                className="h-6 w-6 p-0"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
            
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            >
              <GripVertical className="h-4 w-4" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{teamName}</div>
              {team.seed && (
                <div className="text-xs text-gray-500">Seed: {team.seed}</div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
            {/* DUPR Rating/Stats */}
            {teamKind === 'SINGLES_1v1' ? (
              // For SINGLES_1v1: show only rating (no SUM/AVG)
              playerRating && (
                <Badge variant="outline" className="text-xs">
                  <Star className="h-3 w-3 mr-1" />
                  {formatDuprRating(playerRating)}
                </Badge>
              )
            ) : (
              // For DOUBLES/SQUAD: show SUM/AVG
              duprStats.count > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Star className="h-3 w-3 mr-1" />
                  SUM: {duprStats.sum} | AVG: {duprStats.avg}
                </Badge>
              )
            )}
            
            {/* Player count badge - for SINGLES_1v1 show only single user icon, for others show count */}
            {teamKind === 'SINGLES_1v1' ? (
              <Badge variant="outline" className="text-xs">
                <User className="h-3 w-3" />
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                <Users className="h-3 w-3 mr-1" />
                {filledSlots}/{slotCount}
              </Badge>
            )}
            {unplacedTeamPlayers.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                +{unplacedTeamPlayers.length} unplaced
              </Badge>
            )}
            
            {/* Edit button - hide for SINGLES_1v1 */}
            {teamKind !== 'SINGLES_1v1' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                className="h-6 w-6 p-0"
              >
                <Edit className="h-3 w-3" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Player Slots - only show for non-SINGLES or when expanded */}
        {teamKind !== 'SINGLES_1v1' && isExpanded && (
          <div className="p-2 space-y-2">
            {slots.map((player, index) => (
              <PlayerSlot
                key={`${team.id}-slot-${index}`}
                slotIndex={index}
                player={player}
                teamKind={teamKind}
                teamId={team.id}
                onAddPlayer={handleAddPlayerClick}
                onRemovePlayer={handleRemovePlayer}
                onMovePlayer={onMovePlayer}
                isDragDisabled={isDragDisabled}
                isDropTarget={dropTargetId === `player-${team.id}-slot-${index}`}
              />
            ))}

            {unplacedTeamPlayers.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                <div className="text-xs font-medium text-amber-800">
                  Players without visible slot ({unplacedTeamPlayers.length})
                </div>
                <div className="mt-1 space-y-1">
                  {unplacedTeamPlayers.map((teamPlayer) => (
                    <div key={teamPlayer.id} className="text-xs text-amber-900">
                      {teamPlayer.player.firstName} {teamPlayer.player.lastName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player Selection Modal */}
      <PlayerSelectionModal
        isOpen={showPlayerSelection}
        onClose={() => {
          setShowPlayerSelection(false)
          setSelectedSlotIndex(null)
        }}
        onSelectPlayer={handlePlayerSelect}
        availablePlayers={availablePlayers}
        tournamentId={tournamentId}
      />
    </>
  )
}
