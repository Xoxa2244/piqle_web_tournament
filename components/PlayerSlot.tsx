'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  GripVertical, 
  Trash2, 
  User, 
  Mail, 
  Hash,
  Star
} from 'lucide-react'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dupr: string | null
  duprRating: string | null
  gender: string | null
}

interface PlayerSlotProps {
  slotIndex: number
  player: Player | null
  teamKind: 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
  teamId: string
  onAddPlayer: (slotIndex: number) => void
  onRemovePlayer: (slotIndex: number) => void
  onMovePlayer: (fromTeamId: string, toTeamId: string, fromSlot: number, toSlot: number) => void
  isDragDisabled?: boolean
}

export default function PlayerSlot({
  slotIndex,
  player,
  teamKind,
  teamId,
  onAddPlayer,
  onRemovePlayer,
  onMovePlayer,
  isDragDisabled = false
}: PlayerSlotProps) {
  const slotId = `player-${teamId}-slot-${slotIndex}`
  const isDisabled = !player || isDragDisabled
  
  console.log('[PlayerSlot] Render - slotId:', slotId, 'teamId:', teamId, 'player:', player?.firstName, 'disabled:', isDisabled)
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: slotId,
    disabled: isDisabled,
    data: {
      teamId,
      slotIndex,
      playerId: player?.id
    }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  
  if (isDragging) {
    console.log('[PlayerSlot] Is dragging - slotId:', slotId, 'player:', player?.firstName)
  }

  const handleRemoveClick = () => {
    if (window.confirm(`Are you sure you want to remove ${player?.firstName} ${player?.lastName} from this team?`)) {
      console.log('[PlayerSlot] Removing player from slot:', slotIndex)
      onRemovePlayer(slotIndex)
    }
  }

  if (!player) {
  // Empty slot
  return (
    <div 
      ref={setNodeRef}
      className="flex items-center space-x-2 p-2 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg"
    >
      <div className="flex items-center justify-center w-6 h-6 bg-gray-200 rounded-full">
        <span className="text-xs font-medium text-gray-500">{slotIndex + 1}</span>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-500">Empty slot</div>
        <div className="text-xs text-gray-400">Click + to add</div>
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddPlayer(slotIndex)}
        className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
  }

  // Filled slot
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center space-x-2 p-2 bg-white border rounded-lg shadow-sm ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-center w-6 h-6 bg-blue-100 rounded-full">
        <span className="text-xs font-medium text-blue-600">{slotIndex + 1}</span>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-xs truncate">
          {player.firstName} {player.lastName}
        </div>
        
        <div className="flex items-center space-x-2 mt-1">
          {player.email && (
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <Mail className="h-3 w-3" />
              <span className="truncate max-w-20">{player.email}</span>
            </div>
          )}
          
          {player.duprRating && (
            <Badge variant="outline" className="text-xs">
              <Star className="h-3 w-3 mr-1" />
              {player.duprRating}
            </Badge>
          )}
        </div>
      </div>
      
      <div className="flex items-center space-x-1">
        {!isDragDisabled && (
          <div 
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          >
            <GripVertical className="h-3 w-3" />
          </div>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemoveClick}
          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
          title="Remove player"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
