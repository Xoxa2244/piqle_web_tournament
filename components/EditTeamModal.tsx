'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { X, Edit, Trash2, UserPlus } from 'lucide-react'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dupr: string | null
  teamPlayers: Array<{
    id: string
    teamId: string
    role: string
  }>
}

interface Team {
  id: string
  name: string
  seed: number | null
  note: string | null
  poolId: string | null
  divisionId: string
  teamPlayers: Array<{
    id: string
    role: string
    player: {
      id: string
      firstName: string
      lastName: string
      email: string | null
      dupr: string | null
    }
  }>
  division: {
    id: string
    name: string
    teamKind: string
    maxTeams: number | null
  }
  pool?: {
    id: string
    name: string
    order: number
  } | null
}

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

interface EditTeamModalProps {
  team: Team
  divisions: Division[]
  tournamentId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function EditTeamModal({ team, divisions, tournamentId, isOpen, onClose, onSuccess }: EditTeamModalProps) {
  const [teamName, setTeamName] = useState('')
  const [teamNote, setTeamNote] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [selectedPoolId, setSelectedPoolId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState(false)

  // Initialize form data when team changes
  useEffect(() => {
    if (team) {
      setTeamName(team.name)
      setTeamNote(team.note || '')
      setSelectedDivisionId(team.divisionId)
      setSelectedPoolId(team.poolId || '')
    }
  }, [team])

  const updateTeamMutation = trpc.team.update.useMutation({
    onSuccess: () => {
      setIsSubmitting(false)
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      console.error('Failed to update team:', error)
      alert(`Error updating team: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const removeFromTeamMutation = trpc.player.removeFromTeam.useMutation({
    onSuccess: () => {
      onSuccess?.()
    },
    onError: (error) => {
      console.error('Failed to remove player:', error)
      alert(`Error removing player: ${error.message}`)
    }
  })

  // Get available players for adding to team
  const { data: availablePlayers } = trpc.player.list.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )

  const selectedDivision = divisions.find(d => d.id === selectedDivisionId)
  const currentPlayers = team.teamPlayers || []

  const getMaxPlayersForTeam = (teamKind: string) => {
    switch (teamKind) {
      case 'SINGLES_1v1': return 1
      case 'DOUBLES_2v2': return 2
      case 'SQUAD_4v4': return 4
      default: return 2
    }
  }

  const maxPlayers = selectedDivision ? getMaxPlayersForTeam(selectedDivision.teamKind) : 2
  const canAddMorePlayers = currentPlayers.length < maxPlayers

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!teamName.trim()) {
      alert('Enter team name')
      return
    }

    if (!selectedDivisionId) {
      alert('Select division')
      return
    }

    setIsSubmitting(true)
    
    try {
      await updateTeamMutation.mutateAsync({
        id: team.id,
        name: teamName.trim(),
        note: teamNote.trim() || undefined,
        divisionId: selectedDivisionId,
        poolId: selectedPoolId || undefined,
      })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleRemovePlayer = async (teamPlayerId: string) => {
    if (!confirm('Remove player from team?')) {
      return
    }

    try {
      await removeFromTeamMutation.mutateAsync({ teamPlayerId })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setShowAddPlayer(false)
      onClose()
    }
  }

  const handleDivisionChange = (divisionId: string) => {
    setSelectedDivisionId(divisionId)
    setSelectedPoolId('') // Reset pool when division changes
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Edit Team</CardTitle>
            <CardDescription>
              Change team information and manage roster
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
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Team Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-1">
                  Team Name *
                </label>
                <Input
                  id="teamName"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter team name"
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="division" className="block text-sm font-medium text-gray-700 mb-1">
                  Division *
                </label>
                <select
                  id="division"
                  value={selectedDivisionId}
                  onChange={(e) => handleDivisionChange(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select division</option>
                  {divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name} ({division.teamKind})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="teamNote" className="block text-sm font-medium text-gray-700 mb-1">
                Note (optional)
              </label>
              <Input
                id="teamNote"
                type="text"
                value={teamNote}
                onChange={(e) => setTeamNote(e.target.value)}
                placeholder="Additional team information"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            {selectedDivision && selectedDivision.pools.length > 0 && (
              <div>
                <label htmlFor="pool" className="block text-sm font-medium text-gray-700 mb-1">
                  Pool (optional)
                </label>
                <select
                  id="pool"
                  value={selectedPoolId}
                  onChange={(e) => setSelectedPoolId(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">WaitList (no pool)</option>
                  {selectedDivision.pools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Team Players */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  Team Roster ({currentPlayers.length}/{maxPlayers})
                </h3>
                {canAddMorePlayers && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddPlayer(!showAddPlayer)}
                    className="flex items-center space-x-1"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Add Player</span>
                  </Button>
                )}
              </div>

              {!canAddMorePlayers && (
                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
                  ⚠️ Maximum team size reached for this division type
                </div>
              )}

              <div className="space-y-2">
                {currentPlayers.length === 0 ? (
                  <div className="text-sm text-gray-500 italic py-4">
                    No players in team
                  </div>
                ) : (
                  currentPlayers.map((teamPlayer) => (
                    <div
                      key={teamPlayer.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {teamPlayer.player.firstName} {teamPlayer.player.lastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {teamPlayer.player.email}
                          {teamPlayer.player.dupr && ` • DUPR: ${teamPlayer.player.dupr}`}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary" className="text-xs">
                          {teamPlayer.role}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePlayer(teamPlayer.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2 pt-4 border-t">
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
                disabled={isSubmitting || !teamName.trim() || !selectedDivisionId}
                className="flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
