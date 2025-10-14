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
  Plus,
  Star
} from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
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
  isWaitlist: boolean
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
  onMovePlayer: (fromTeamId: string, toTeamId: string, fromSlot: number, toSlot: number) => void
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
  const [activePlayer, setActivePlayer] = useState<Player | null>(null)
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

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

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id as string
    console.log('[TeamWithSlots] DragStart - activeId:', activeId)
    console.log('[TeamWithSlots] DragStart - team:', team.name, 'teamId:', team.id)
    
    if (activeId.startsWith('player-slot-')) {
      const slotIndex = parseInt(activeId.replace('player-slot-', ''))
      const player = slots[slotIndex]
      console.log('[TeamWithSlots] DragStart - slotIndex:', slotIndex, 'player:', player?.firstName, player?.lastName)
      
      if (player) {
        setActivePlayer(player)
        setActiveSlotIndex(slotIndex)
        console.log('[TeamWithSlots] DragStart - Set active player and slot')
      } else {
        console.log('[TeamWithSlots] DragStart - No player in slot')
      }
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    console.log('[TeamWithSlots] DragEnd - active:', active?.id, 'over:', over?.id)
    console.log('[TeamWithSlots] DragEnd - activePlayer:', activePlayer?.firstName, 'activeSlotIndex:', activeSlotIndex)
    
    if (!over || !activePlayer || activeSlotIndex === null) {
      console.log('[TeamWithSlots] DragEnd - Missing required data, aborting')
      setActivePlayer(null)
      setActiveSlotIndex(null)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string

    console.log('[TeamWithSlots] DragEnd - activeId:', activeId, 'overId:', overId)

    // Check if dropping on another player slot
    if (overId.startsWith('player-slot-')) {
      const targetSlotIndex = parseInt(overId.replace('player-slot-', ''))
      const targetPlayer = slots[targetSlotIndex]
      
      console.log('[TeamWithSlots] DragEnd - targetSlotIndex:', targetSlotIndex, 'targetPlayer:', targetPlayer?.firstName)
      console.log('[TeamWithSlots] DragEnd - Same slot?', targetSlotIndex === activeSlotIndex)
      
      if (targetSlotIndex !== activeSlotIndex) {
        console.log('[TeamWithSlots] DragEnd - Calling onMovePlayer')
        console.log('[TeamWithSlots] DragEnd - From team:', team.id, 'To team:', team.id)
        console.log('[TeamWithSlots] DragEnd - From slot:', activeSlotIndex, 'To slot:', targetSlotIndex)
        
        if (targetPlayer) {
          console.log('[TeamWithSlots] DragEnd - Swapping with player:', targetPlayer.firstName, targetPlayer.lastName)
          onMovePlayer(team.id, team.id, activeSlotIndex, targetSlotIndex)
        } else {
          console.log('[TeamWithSlots] DragEnd - Moving to empty slot')
          onMovePlayer(team.id, team.id, activeSlotIndex, targetSlotIndex)
        }
      } else {
        console.log('[TeamWithSlots] DragEnd - Same slot, no action')
      }
    } else {
      console.log('[TeamWithSlots] DragEnd - Not dropped on player slot')
    }

    setActivePlayer(null)
    setActiveSlotIndex(null)
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
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="p-2 space-y-2">
              <SortableContext items={slots.map((_, index) => `player-slot-${index}`)} strategy={verticalListSortingStrategy}>
                {slots.map((player, index) => (
                  <PlayerSlot
                    key={index}
                    slotIndex={index}
                    player={player}
                    teamKind={teamKind}
                    teamId={team.id}
                    onAddPlayer={handleAddPlayerClick}
                    onRemovePlayer={onRemovePlayer}
                    onMovePlayer={onMovePlayer}
                    isDragDisabled={isDragDisabled}
                  />
                ))}
              </SortableContext>
            </div>

            <DragOverlay>
              {activePlayer ? (
                <div className="flex items-center space-x-2 p-2 bg-white border rounded-lg shadow-lg">
                  <div className="flex items-center justify-center w-6 h-6 bg-blue-100 rounded-full">
                    <span className="text-xs font-medium text-blue-600">{activeSlotIndex! + 1}</span>
                  </div>
                  <div className="font-medium text-xs">
                    {activePlayer.firstName} {activePlayer.lastName}
                  </div>
                  {activePlayer.duprRating && (
                    <Badge variant="outline" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      {activePlayer.duprRating}
                    </Badge>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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
