'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDuprRating } from '@/lib/utils'
import { 
  Search, 
  X, 
  User, 
  Mail, 
  Hash,
  Star,
  Users,
  Check
} from 'lucide-react'

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

interface PlayerSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectPlayer: (playerId: string) => void
  availablePlayers: Player[]
  tournamentId: string
}

export default function PlayerSelectionModal({
  isOpen,
  onClose,
  onSelectPlayer,
  availablePlayers,
  tournamentId
}: PlayerSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  // Filter players based on search query
  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return availablePlayers

    const query = searchQuery.toLowerCase()
    return availablePlayers.filter(player => {
      const fullName = `${player.firstName} ${player.lastName}`.toLowerCase()
      const email = player.email?.toLowerCase() || ''
      
      return (
        fullName.includes(query) ||
        email.includes(query) ||
        (player.duprRating && player.duprRating.toString().includes(query))
      )
    })
  }, [availablePlayers, searchQuery])

  const handleSelectPlayer = () => {
    if (selectedPlayerId) {
      onSelectPlayer(selectedPlayerId)
      setSelectedPlayerId(null)
      setSearchQuery('')
      onClose()
    }
  }

  const handleClose = () => {
    setSelectedPlayerId(null)
    setSearchQuery('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Select Player</h2>
            <p className="text-sm text-gray-500 mt-1">
              Choose a player to add to the team slot
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="p-6 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, email, or rating..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Player List */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto p-6 max-h-96">
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {availablePlayers.length === 0 ? 'No available players' : 'No players found'}
                </h3>
                <p className="text-gray-500">
                  {availablePlayers.length === 0 
                    ? 'All players are already assigned to teams or on waitlist'
                    : 'Try adjusting your search criteria'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPlayers.map((player) => (
                  <Card
                    key={player.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedPlayerId === player.id 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedPlayerId(player.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {player.firstName} {player.lastName}
                              </div>
                              
                              <div className="flex items-center space-x-3 mt-1">
                                {player.email && (
                                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                                    <Mail className="h-3 w-3" />
                                    <span className="truncate max-w-28">{player.email}</span>
                                  </div>
                                )}
                                
                                {player.duprRating && (
                                  <Badge variant="outline" className="text-xs">
                                    <Star className="h-3 w-3 mr-1" />
                                    {formatDuprRating(player.duprRating)}
                                  </Badge>
                                )}
                                
                                {player.gender && (
                                  <Badge variant="secondary" className="text-xs">
                                    {player.gender}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {selectedPlayerId === player.id && (
                          <div className="flex items-center justify-center w-6 h-6 bg-blue-500 rounded-full">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            {filteredPlayers.length} of {availablePlayers.length} players available
          </div>
          
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSelectPlayer}
              disabled={!selectedPlayerId}
            >
              Add Player
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
