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

  // Validate pairs - check for duplicate matchups
  const validatePairs = () => {
    const errors: string[] = []
    const currentMatches = matches.map(match => {
      const swap = swaps.find(s => s.matchId === match.id)
      return {
        id: match.id,
        teamAId: swap?.newTeamAId || match.teamA.id,
        teamBId: swap?.newTeamBId || match.teamB.id,
      }
    })

    // Check for same team playing against itself
    currentMatches.forEach((match, idx) => {
      if (match.teamAId === match.teamBId) {
        errors.push(`Match ${idx + 1}: A team cannot play against itself`)
      }
    })

    // Check for duplicate matchups (same pair of teams in different matches)
    const pairStrings = new Set<string>()
    currentMatches.forEach((match, idx) => {
      // Create a normalized pair string (sorted team IDs so A vs B = B vs A)
      const pairStr = [match.teamAId, match.teamBId].sort().join('-')
      
      if (pairStrings.has(pairStr)) {
        const teamA = teams.find(t => t.id === match.teamAId)
        const teamB = teams.find(t => t.id === match.teamBId)
        errors.push(`Match ${idx + 1}: ${teamA?.name} vs ${teamB?.name} already exists`)
      } else {
        pairStrings.add(pairStr)
      }
    })

    // For Round Robin - check that no team appears more than expected times
    // Count how many times each team appears
    const teamCounts = new Map<string, number>()
    currentMatches.forEach(match => {
      teamCounts.set(match.teamAId, (teamCounts.get(match.teamAId) || 0) + 1)
      teamCounts.set(match.teamBId, (teamCounts.get(match.teamBId) || 0) + 1)
    })

    // For Play-In and Play-Off: each team should appear at most once
    // For RR: depends on pool structure, but we check for duplicates above
    if (title.includes('Play-In') || title.includes('Play-off')) {
      teamCounts.forEach((count, teamId) => {
        if (count > 1) {
          const team = teams.find(t => t.id === teamId)
          errors.push(`${team?.name} appears in multiple matches (should appear only once)`)
        }
      })
    }

    return errors
  }

  const validationErrors = validatePairs()
  const hasErrors = validationErrors.length > 0

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

  // Reset swaps when modal opens
  const handleReset = () => {
    setSwaps([])
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

          {/* Validation Errors */}
          {hasErrors && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-red-800 mb-2">Validation Errors:</h4>
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((error, idx) => (
                  <li key={idx} className="text-sm text-red-700">{error}</li>
                ))}
              </ul>
            </div>
          )}

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
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              disabled={isLoading || swaps.length === 0 || hasErrors}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
