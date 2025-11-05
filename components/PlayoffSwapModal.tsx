'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Team {
  id: string
  name: string
}

interface Match {
  id: string
  teamA: Team
  teamB: Team
}

interface PlayoffSwapModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (swaps: Array<{ matchId: string; newTeamAId: string; newTeamBId: string }>) => void
  matches: Match[]
  teams: Team[]
  isLoading?: boolean
  title?: string
}

export default function PlayoffSwapModal({
  isOpen,
  onClose,
  onSubmit,
  matches,
  teams,
  isLoading = false,
  title = 'Edit Playoff Pairs',
}: PlayoffSwapModalProps) {
  const [swaps, setSwaps] = useState<Array<{ matchId: string; newTeamAId: string; newTeamBId: string }>>([])

  const handleTeamChange = (matchId: string, teamPosition: 'A' | 'B', newTeamId: string) => {
    setSwaps(prev => {
      const existingSwap = prev.find(s => s.matchId === matchId)
      if (existingSwap) {
        return prev.map(s => 
          s.matchId === matchId 
            ? { ...s, [`newTeam${teamPosition}Id`]: newTeamId }
            : s
        )
      } else {
        const match = matches.find(m => m.id === matchId)
        if (!match) return prev
        
        return [...prev, {
          matchId,
          newTeamAId: teamPosition === 'A' ? newTeamId : match.teamA.id,
          newTeamBId: teamPosition === 'B' ? newTeamId : match.teamB.id,
        }]
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(swaps)
  }

  const handleClose = () => {
    setSwaps([])
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{title}</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {matches.map((match) => {
            const currentSwap = swaps.find(s => s.matchId === match.id)
            const currentTeamAId = currentSwap?.newTeamAId || match.teamA.id
            const currentTeamBId = currentSwap?.newTeamBId || match.teamB.id
            
            return (
              <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium mb-3">Match {matches.indexOf(match) + 1}</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Team A
                    </label>
                    <select
                      value={currentTeamAId}
                      onChange={(e) => handleTeamChange(match.id, 'A', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Team B
                    </label>
                    <select
                      value={currentTeamBId}
                      onChange={(e) => handleTeamChange(match.id, 'B', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={isLoading || swaps.length === 0}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
