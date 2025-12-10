'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X } from 'lucide-react'
import { formatDuprRating } from '@/lib/utils'

interface Division {
  id: string
  name: string
  teamKind: string
  poolCount: number
  pools: Array<{
    id: string
    name: string
    order: number
  }>
}

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  duprRating: string | null
}

interface AddPlayerModalProps {
  division: Division
  availablePlayers: Player[]
  tournamentId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddPlayerModal({ 
  division, 
  availablePlayers, 
  tournamentId,
  isOpen, 
  onClose, 
  onSuccess 
}: AddPlayerModalProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [selectedPoolId, setSelectedPoolId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize selectedPoolId to first pool if available
  useEffect(() => {
    if (division.pools.length > 0 && !selectedPoolId) {
      setSelectedPoolId(division.pools[0].id)
    }
  }, [division.pools, selectedPoolId])

  const deleteTeamMutation = trpc.team.delete.useMutation()
  
  const addPlayerToTeamMutation = trpc.teamPlayer.addPlayerToSlot.useMutation({
    onError: async (error, variables) => {
      // If adding player fails, delete the team
      if (variables.teamId) {
        try {
          await deleteTeamMutation.mutateAsync({ id: variables.teamId })
        } catch (deleteError) {
          console.error('Failed to delete team after error:', deleteError)
        }
      }
      alert(`Error adding player to team: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const createTeamWithPlayerMutation = trpc.team.create.useMutation({
    onSuccess: async (team) => {
      // After creating team, add player to it
      if (selectedPlayerId && team.id) {
        try {
          await addPlayerToTeamMutation.mutateAsync({
            teamId: team.id,
            playerId: selectedPlayerId,
            slotIndex: 0,
          })
          
          // Success - reset form and close
          setSelectedPlayerId('')
          setSelectedPoolId(division.pools.length > 0 ? division.pools[0].id : '')
          setIsSubmitting(false)
          onSuccess?.()
          onClose()
        } catch (error) {
          // Error handling is done in addPlayerToTeamMutation.onError
          // Team will be deleted there
        }
      } else {
        // No player selected - just close
        setSelectedPlayerId('')
        setSelectedPoolId(division.pools.length > 0 ? division.pools[0].id : '')
        setIsSubmitting(false)
        onSuccess?.()
        onClose()
      }
    },
    onError: (error) => {
      console.error('Failed to create team:', error)
      alert(`Error creating team: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedPlayerId) {
      alert('Select a player')
      return
    }

    setIsSubmitting(true)
    
    try {
      // Create team first (name will be auto-generated or use player name)
      const selectedPlayer = availablePlayers.find(p => p.id === selectedPlayerId)
      const teamName = selectedPlayer 
        ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}`
        : 'New Team'
      
      await createTeamWithPlayerMutation.mutateAsync({
        divisionId: division.id,
        name: teamName,
        note: undefined,
        poolId: selectedPoolId || undefined,
      })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setSelectedPlayerId('')
      setSelectedPoolId(division.pools.length > 0 ? division.pools[0].id : '')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Add Player</CardTitle>
            <CardDescription>
              Add player to {division.name}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="player" className="block text-sm font-medium text-gray-700 mb-1">
                Player *
              </label>
              <select
                id="player"
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select player</option>
                {availablePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.firstName} {player.lastName}
                    {player.duprRating && ` (${formatDuprRating(player.duprRating)})`}
                  </option>
                ))}
              </select>
              {availablePlayers.length === 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  No available players. Create a player first.
                </p>
              )}
            </div>

            {division.pools.length > 0 && (
              <div>
                <label htmlFor="pool" className="block text-sm font-medium text-gray-700 mb-1">
                  Pool *
                </label>
                <select
                  id="pool"
                  value={selectedPoolId}
                  onChange={(e) => setSelectedPoolId(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {division.pools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !selectedPlayerId || (division.pools.length > 0 && !selectedPoolId)}
                className="flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Adding...</span>
                  </>
                ) : (
                  <span>Add Player</span>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
