'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Save, Trash2 } from 'lucide-react'

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

interface Team {
  id: string
  name: string
  seed: number | null
  note: string | null
  poolId: string | null
  divisionId: string
}

interface EditTeamModalProps {
  team: Team | null
  divisions: Division[]
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function EditTeamModal({ team, divisions, isOpen, onClose, onSuccess }: EditTeamModalProps) {
  const [teamName, setTeamName] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [selectedPoolId, setSelectedPoolId] = useState('')
  const [teamNote, setTeamNote] = useState('')
  const [teamSeed, setTeamSeed] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize form with team data
  useEffect(() => {
    if (team) {
      setTeamName(team.name)
      setSelectedDivisionId(team.divisionId)
      setSelectedPoolId(team.poolId || '')
      setTeamNote(team.note || '')
      setTeamSeed(team.seed?.toString() || '')
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

  const deleteTeamMutation = trpc.team.delete.useMutation({
    onSuccess: () => {
      setIsSubmitting(false)
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      console.error('Failed to delete team:', error)
      alert(`Error deleting team: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const selectedDivision = divisions.find(d => d.id === selectedDivisionId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!team) return
    
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
        divisionId: selectedDivisionId,
        note: teamNote.trim() || undefined,
        poolId: selectedPoolId || undefined,
        seed: teamSeed ? parseInt(teamSeed) : undefined,
      })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleDelete = async () => {
    if (!team) return
    
    if (!window.confirm(`Are you sure you want to delete "${team.name}"? This will remove all players from the team and cannot be undone.`)) {
      return
    }

    setIsSubmitting(true)
    
    try {
      await deleteTeamMutation.mutateAsync({
        id: team.id
      })
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
    }
  }

  const handleDivisionChange = (divisionId: string) => {
    setSelectedDivisionId(divisionId)
    setSelectedPoolId('') // Reset pool when division changes
  }

  if (!isOpen || !team) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Edit Team</CardTitle>
            <CardDescription>
              Update team information
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

            <div>
              <label htmlFor="seed" className="block text-sm font-medium text-gray-700 mb-1">
                Seed (optional)
              </label>
              <Input
                id="seed"
                type="number"
                value={teamSeed}
                onChange={(e) => setTeamSeed(e.target.value)}
                placeholder="Enter seed number"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
                Note (optional)
              </label>
              <Input
                id="note"
                type="text"
                value={teamNote}
                onChange={(e) => setTeamNote(e.target.value)}
                placeholder="Enter team note"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex items-center space-x-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Team</span>
              </Button>
              
              <div className="flex space-x-2">
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
                      <Save className="h-4 w-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Info:</strong> If no pool is specified, the team will be placed in the WaitList of the selected division.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}