'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ChevronDown, 
  ChevronRight,
  GripVertical, 
  Users, 
  Edit, 
  Trash2, 
  MoreVertical,
  Plus
} from 'lucide-react'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import PlayerSlot from './PlayerSlot'
import PlayerSelectionModal from './PlayerSelectionModal'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dupr: string | null
  duprRating: string | null
  gender: string | null
  isWaitlist?: boolean
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
    player: Player
  }>
}

interface TeamWithSlotsProps {
  team: Team
  teamKind: 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
  isExpanded: boolean
  availablePlayers: Player[]
  tournamentId: string
  onToggleExpansion: () => void
  onEdit: () => void
  onDelete: () => void
  onContextMenu: () => void
  onAddPlayer: (slotIndex: number, playerId: string) => void
  onRemovePlayer: (slotIndex: number) => void
  onMovePlayer: (fromSlot: number, toSlot: number) => void
  isDragDisabled?: boolean
}

export default function TeamWithSlots({
  team,
  teamKind,
  isExpanded,
  availablePlayers,
  tournamentId,
  onToggleExpansion,
  onEdit,
  onDelete,
  onContextMenu,
  onAddPlayer,
  onRemovePlayer,
  onMovePlayer,
  isDragDisabled = false
}: TeamWithSlotsProps) {
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
    switch (teamKind) {
      case 'SINGLES_1v1': return 1
      case 'DOUBLES_2v2': return 2
      case 'SQUAD_4v4': return 4
      default: return 2
    }
  }, [teamKind])

  // Create slots array with players
  const slots = useMemo(() => {
    const slotsArray: (Player | null)[] = new Array(slotCount).fill(null)
    
    // Fill slots with existing players
    team.teamPlayers.forEach((teamPlayer, index) => {
      if (index < slotCount) {
        slotsArray[index] = teamPlayer.player
      }
    })
    
    return slotsArray
  }, [team.teamPlayers, slotCount])

  const filledSlots = slots.filter(slot => slot !== null).length
  const teamName = team.name || `${team.teamPlayers[0]?.player.firstName} ${team.teamPlayers[0]?.player.lastName}`

  const handleAddPlayerClick = (slotIndex: number) => {
    setSelectedSlotIndex(slotIndex)
    setShowPlayerSelection(true)
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
        {/* Team Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center space-x-3">
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
            <Badge variant="outline" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              {filledSlots}/{slotCount}
            </Badge>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="h-6 w-6 p-0"
            >
              <Edit className="h-3 w-3" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onContextMenu}
              className="h-6 w-6 p-0"
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Player Slots */}
        {isExpanded && (
          <div className="p-3 space-y-2">
            {slots.map((player, index) => (
              <PlayerSlot
                key={index}
                slotIndex={index}
                player={player}
                teamKind={teamKind}
                onAddPlayer={handleAddPlayerClick}
                onRemovePlayer={onRemovePlayer}
                onMovePlayer={onMovePlayer}
                isDragDisabled={isDragDisabled}
              />
            ))}
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
