'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, UserPlus } from 'lucide-react'

interface Team {
  id: string
  name: string
  divisionId: string
  division: {
    name: string
    teamKind: string
  }
  teamPlayers: Array<{
    playerId: string
  }>
}

interface AddParticipantModalProps {
  tournamentId: string
  teams?: Team[]
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddParticipantModal({ tournamentId, teams = [], isOpen, onClose, onSuccess }: AddParticipantModalProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [dupr, setDupr] = useState('')
  const [gender, setGender] = useState<'M' | 'F' | 'X' | ''>('')
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get tournament format to check if gender is required
  const { data: tournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId && isOpen }
  )
  const isMLP = tournament?.format === 'MLP'

  const createPlayerMutation = trpc.player.create.useMutation({
    onSuccess: () => {
      setFirstName('')
      setLastName('')
      setEmail('')
      setDupr('')
      setGender('')
      setSelectedTeamId('')
      setIsSubmitting(false)
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      console.error('Failed to create participant:', error)
      alert(`Error creating participant: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const addToTeamMutation = trpc.player.addToTeam.useMutation({
    onSuccess: () => {
      setIsSubmitting(false)
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      console.error('Failed to add to team:', error)
      alert(`Error adding to team: ${error.message}`)
      setIsSubmitting(false)
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!firstName.trim() || !lastName.trim()) {
      alert('Enter participant name and surname')
      return
    }

    if (isMLP && (!gender || gender === 'X')) {
      alert('Gender (M or F) is required for players in MLP tournaments')
      return
    }

    setIsSubmitting(true)
    
    try {
      // Create the player first
      const player = await createPlayerMutation.mutateAsync({
        tournamentId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        dupr: dupr.trim() || undefined,
        gender: gender ? (gender as 'M' | 'F' | 'X') : undefined,
      })

      // If a team is selected, add player to that team
      if (selectedTeamId) {
        await addToTeamMutation.mutateAsync({
          playerId: player.id,
          teamId: selectedTeamId,
          role: 'PLAYER',
        })
      }
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setFirstName('')
      setLastName('')
      setEmail('')
      setDupr('')
      setGender('')
      setSelectedTeamId('')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Add Participant</CardTitle>
            <CardDescription>
              Create new tournament participant
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
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                First Name *
              </label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name *
              </label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email (optional)
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="dupr" className="block text-sm font-medium text-gray-700 mb-1">
                DUPR ID (optional)
              </label>
              <Input
                id="dupr"
                type="text"
                value={dupr}
                onChange={(e) => setDupr(e.target.value)}
                placeholder="Enter DUPR ID"
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
                Gender {isMLP && <span className="text-red-500">*</span>} {!isMLP && '(optional)'}
              </label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as 'M' | 'F' | 'X' | '')}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required={isMLP}
              >
                <option value="">Select gender</option>
                <option value="M">Male (M)</option>
                <option value="F">Female (F)</option>
                {!isMLP && <option value="X">Other (X)</option>}
              </select>
              {isMLP && (
                <p className="text-xs text-gray-500 mt-1">Gender is required for MLP tournaments</p>
              )}
            </div>

            <div>
              <label htmlFor="team" className="block text-sm font-medium text-gray-700 mb-1">
                Team (optional)
              </label>
              <select
                id="team"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">General list</option>
                {teams?.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.division.name})
                  </option>
                ))}
              </select>
            </div>

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
                disabled={isSubmitting || !firstName.trim() || !lastName.trim() || (isMLP && (!gender || gender === 'X'))}
                className="flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    <span>Create Participant</span>
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Info:</strong> If no team is selected, the participant will be added to the general list and can be added to a team later.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
