'use client'

import { useState } from 'react'
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
  onAddPlayer: (slotIndex: number) => void
  onRemovePlayer: (slotIndex: number) => void
  onMovePlayer: (fromSlot: number, toSlot: number) => void
  isDragDisabled?: boolean
}

export default function PlayerSlot({
  slotIndex,
  player,
  teamKind,
  onAddPlayer,
  onRemovePlayer,
  onMovePlayer,
  isDragDisabled = false
}: PlayerSlotProps) {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: `player-slot-${slotIndex}`,
    disabled: !player || isDragDisabled
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleRemoveClick = () => {
    if (showRemoveConfirm) {
      onRemovePlayer(slotIndex)
      setShowRemoveConfirm(false)
    } else {
      setShowRemoveConfirm(true)
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowRemoveConfirm(false), 3000)
    }
  }

  if (!player) {
    // Empty slot
    return (
      <div className="flex items-center space-x-3 p-3 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
        <div className="flex items-center justify-center w-8 h-8 bg-gray-200 rounded-full">
          <span className="text-sm font-medium text-gray-500">{slotIndex + 1}</span>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-500">Empty slot</div>
          <div className="text-xs text-gray-400">Click + to add player</div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddPlayer(slotIndex)}
          className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  // Filled slot
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center space-x-3 p-3 bg-white border rounded-lg shadow-sm ${
        isDragging ? 'opacity-50' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
        <span className="text-sm font-medium text-blue-600">{slotIndex + 1}</span>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">
          {player.firstName} {player.lastName}
        </div>
        
        <div className="flex items-center space-x-3 mt-1">
          {player.email && (
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <Mail className="h-3 w-3" />
              <span className="truncate max-w-24">{player.email}</span>
            </div>
          )}
          
          {player.dupr && (
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <Hash className="h-3 w-3" />
              <span>{player.dupr}</span>
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
          <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemoveClick}
          className={`h-8 w-8 p-0 ${
            showRemoveConfirm 
              ? 'text-red-600 hover:text-red-700 bg-red-50' 
              : 'text-red-500 hover:text-red-700'
          }`}
          title={showRemoveConfirm ? 'Click again to confirm removal' : 'Remove player'}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
