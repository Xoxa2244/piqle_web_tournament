'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

interface TiebreakerSequenceSlot {
  order: number
  teamAPlayerId?: string
  teamBPlayerId?: string
}

interface TiebreakerModalProps {
  isOpen: boolean
  onClose: () => void
  matchId: string
  teamAName: string
  teamBName: string
  teamAPlayers: Array<{ id: string; firstName: string; lastName: string }>
  teamBPlayers: Array<{ id: string; firstName: string; lastName: string }>
  existingTiebreaker?: {
    teamAScore: number
    teamBScore: number
    sequence: TiebreakerSequenceSlot[] | null
  }
  onSuccess?: () => void
}

export default function TiebreakerModal({
  isOpen,
  onClose,
  matchId,
  teamAName,
  teamBName,
  teamAPlayers,
  teamBPlayers,
  existingTiebreaker,
  onSuccess,
}: TiebreakerModalProps) {
  const [teamAScore, setTeamAScore] = useState('')
  const [teamBScore, setTeamBScore] = useState('')
  const [sequence, setSequence] = useState<TiebreakerSequenceSlot[]>([])
  const [numSlots, setNumSlots] = useState(4)

  const saveTiebreaker = trpc.match.saveTiebreaker.useMutation({
    onSuccess: () => {
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      console.error('Error saving tiebreaker:', error)
      alert('Error saving tiebreaker: ' + error.message)
    },
  })

  useEffect(() => {
    if (existingTiebreaker) {
      setTeamAScore(existingTiebreaker.teamAScore.toString())
      setTeamBScore(existingTiebreaker.teamBScore.toString())
      if (existingTiebreaker.sequence) {
        setSequence(existingTiebreaker.sequence)
        setNumSlots(Math.max(4, existingTiebreaker.sequence.length))
      }
    } else {
      setTeamAScore('')
      setTeamBScore('')
      setSequence([])
      setNumSlots(4)
    }
  }, [existingTiebreaker, isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const scoreA = parseInt(teamAScore)
    const scoreB = parseInt(teamBScore)
    
    if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
      alert('Please enter valid scores (non-negative numbers)')
      return
    }

    if (scoreA === scoreB) {
      alert('Tiebreaker cannot end in a tie. Please enter different scores.')
      return
    }

    // Filter out empty sequence slots
    const filteredSequence = sequence.filter(
      slot => slot.teamAPlayerId || slot.teamBPlayerId
    )

    saveTiebreaker.mutate({
      matchId,
      teamAScore: scoreA,
      teamBScore: scoreB,
      sequence: filteredSequence.length > 0 ? filteredSequence : null,
    })
  }

  const handleClose = () => {
    setTeamAScore('')
    setTeamBScore('')
    setSequence([])
    setNumSlots(4)
    onClose()
  }

  const updateSequenceSlot = (index: number, field: 'teamAPlayerId' | 'teamBPlayerId', value: string) => {
    const newSequence = [...sequence]
    if (!newSequence[index]) {
      newSequence[index] = { order: index + 1 }
    }
    newSequence[index] = {
      ...newSequence[index],
      [field]: value || undefined,
    }
    setSequence(newSequence)
  }

  const addSlot = () => {
    setNumSlots(numSlots + 1)
  }

  const removeSlot = () => {
    if (numSlots > 1) {
      setNumSlots(numSlots - 1)
      setSequence(sequence.filter(slot => slot.order <= numSlots - 1))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Tiebreaker</h2>
        <p className="text-sm text-gray-600 mb-4">
          Match ended 2:2. Enter tiebreaker result.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sequence Section (Optional) */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Player Sequence (Optional)
              </label>
              {/* Hide add/remove slot buttons as requested */}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Optionally record the sequence of players in the tiebreaker.
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Array.from({ length: numSlots }).map((_, index) => (
                <div key={index} className="flex items-center gap-2 p-2 border rounded">
                  <span className="text-sm font-medium w-12">Slot {index + 1}</span>
                  <select
                    value={sequence[index]?.teamAPlayerId || ''}
                    onChange={(e) => updateSequenceSlot(index, 'teamAPlayerId', e.target.value)}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                  >
                    <option value="">Select {teamAName} player</option>
                    {teamAPlayers.map(player => (
                      <option key={player.id} value={player.id}>
                        {player.firstName} {player.lastName}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-400">vs</span>
                  <select
                    value={sequence[index]?.teamBPlayerId || ''}
                    onChange={(e) => updateSequenceSlot(index, 'teamBPlayerId', e.target.value)}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                  >
                    <option value="">Select {teamBName} player</option>
                    {teamBPlayers.map(player => (
                      <option key={player.id} value={player.id}>
                        {player.firstName} {player.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Score Section (Required) */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Final Score (Required)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {teamAName}
                </label>
                <input
                  type="number"
                  value={teamAScore}
                  onChange={(e) => setTeamAScore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Score"
                  min="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {teamBName}
                </label>
                <input
                  type="number"
                  value={teamBScore}
                  onChange={(e) => setTeamBScore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Score"
                  min="0"
                  required
                />
              </div>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={saveTiebreaker.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={saveTiebreaker.isPending}
            >
              {saveTiebreaker.isPending ? 'Saving...' : 'Save Tiebreaker'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

