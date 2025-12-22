'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface Player {
  id: string
  firstName: string
  lastName: string
  duprId: string | null
  duprNumericId: bigint | null
}

interface PlayersWithoutDuprModalProps {
  isOpen: boolean
  onClose: () => void
  players: Player[]
  teamLabel?: string
}

export default function PlayersWithoutDuprModal({
  isOpen,
  onClose,
  players,
  teamLabel = 'Team',
}: PlayersWithoutDuprModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Players Without DUPR Rating</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {players.length === 0 ? (
          <p className="text-gray-600">All players have DUPR ratings.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-4">
              The following {teamLabel.toLowerCase()} {players.length === 1 ? 'player' : 'players'} {players.length === 1 ? 'does' : 'do'} not have a DUPR rating:
            </p>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {players.map((player) => (
                <li
                  key={player.id}
                  className="p-2 bg-gray-50 rounded border border-gray-200"
                >
                  <div className="font-medium text-gray-900">
                    {player.firstName} {player.lastName}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    No DUPR ID linked
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

