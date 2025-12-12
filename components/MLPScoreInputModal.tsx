'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { HelpCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import PlayersWithoutDuprModal from './PlayersWithoutDuprModal'

interface Player {
  id: string
  firstName: string
  lastName: string
  duprId: string | null
  duprNumericId: bigint | null
}

interface MLPScoreInputModalProps {
  isOpen: boolean
  onClose: () => void
  matchId: string
  teamAName: string
  teamBName: string
  poolName?: string
  existingGames?: Array<{ index: number; scoreA: number; scoreB: number; gameType?: string }>
  onSuccess?: () => void
  teamAPlayers?: Player[]
  teamBPlayers?: Player[]
  allowDuprSubmission?: boolean
  duprSubmissionStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | null
  onRetryDuprSubmission?: () => void
}

const GAME_TYPES = [
  { index: 0, label: 'Game 1: Women', type: 'WOMEN' },
  { index: 1, label: 'Game 2: Men', type: 'MEN' },
  { index: 2, label: 'Game 3: Mixed #1', type: 'MIXED_1' },
  { index: 3, label: 'Game 4: Mixed #2', type: 'MIXED_2' },
]

export default function MLPScoreInputModal({
  isOpen,
  onClose,
  matchId,
  teamAName,
  teamBName,
  poolName,
  existingGames = [],
  onSuccess,
  teamAPlayers = [],
  teamBPlayers = [],
  allowDuprSubmission = false,
  duprSubmissionStatus = null,
  onRetryDuprSubmission,
}: MLPScoreInputModalProps) {
  const [games, setGames] = useState<Array<{ scoreA: string; scoreB: string }>>([
    { scoreA: '', scoreB: '' },
    { scoreA: '', scoreB: '' },
    { scoreA: '', scoreB: '' },
    { scoreA: '', scoreB: '' },
  ])
  const [sendToDupr, setSendToDupr] = useState(false)
  const [showPlayersWithoutDupr, setShowPlayersWithoutDupr] = useState(false)

  // Check if all players have DUPR rating (for MLP, need 4 players per team = 8 total)
  const allPlayersHaveDupr = useMemo(() => {
    if (!allowDuprSubmission) return false
    
    const allPlayers = [...teamAPlayers, ...teamBPlayers]
    // For MLP doubles, need 4 players total (2 per team)
    return allPlayers.length === 4 && 
      allPlayers.every(p => p.duprId || p.duprNumericId)
  }, [teamAPlayers, teamBPlayers, allowDuprSubmission])

  // Get players without DUPR rating
  const playersWithoutDupr = useMemo(() => {
    return [...teamAPlayers, ...teamBPlayers].filter(
      p => !p.duprId && !p.duprNumericId
    )
  }, [teamAPlayers, teamBPlayers])

  // Set default checkbox state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSendToDupr(allPlayersHaveDupr)
    }
  }, [isOpen, allPlayersHaveDupr])

  const updateGameScore = trpc.match.updateGameScore.useMutation({
    onSuccess: () => {
      // Call onSuccess after each game score update to refresh data
      onSuccess?.()
    },
    onError: (error) => {
      console.error('Error updating game score:', error)
      alert('Error updating game score: ' + error.message)
    },
  })

  useEffect(() => {
    if (isOpen && existingGames.length > 0) {
      const newGames = [...games]
      existingGames.forEach(game => {
        if (game.index >= 0 && game.index < 4) {
          newGames[game.index] = {
            scoreA: (game.scoreA !== null && game.scoreA !== undefined) ? game.scoreA.toString() : '',
            scoreB: (game.scoreB !== null && game.scoreB !== undefined) ? game.scoreB.toString() : '',
          }
        }
      })
      setGames(newGames)
    } else if (isOpen) {
      // Reset when opening
      setGames([
        { scoreA: '', scoreB: '' },
        { scoreA: '', scoreB: '' },
        { scoreA: '', scoreB: '' },
        { scoreA: '', scoreB: '' },
      ])
    }
  }, [isOpen, existingGames])

  const handleGameChange = (index: number, field: 'scoreA' | 'scoreB', value: string) => {
    const newGames = [...games]
    newGames[index] = {
      ...newGames[index],
      [field]: value,
    }
    setGames(newGames)
  }

  const handleGameSubmit = async (index: number) => {
    const game = games[index]
    
    // Allow empty scores (null)
    const scoreA = game.scoreA.trim() === '' ? null : parseInt(game.scoreA)
    const scoreB = game.scoreB.trim() === '' ? null : parseInt(game.scoreB)
    
    // If both are empty, set to null
    if (scoreA === null && scoreB === null) {
      try {
        await updateGameScore.mutateAsync({
          matchId,
          gameIndex: index,
          scoreA: null,
          scoreB: null,
        })
        return
      } catch (error) {
        // Error is already handled in mutation's onError callback
        return
      }
    }
    
    // If one is empty but not both, show error
    if (scoreA === null || scoreB === null || isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
      alert('Please enter valid scores (non-negative numbers) or leave both empty')
      return
    }

    try {
      await updateGameScore.mutateAsync({
        matchId,
        gameIndex: index,
        scoreA,
        scoreB,
      })
      // onSuccess is already called in mutation's onSuccess callback
    } catch (error) {
      // Error is already handled in mutation's onError callback
    }
  }

  const handleSubmitAll = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Submit all games - save only games with valid scores or both empty
    // Skip games where only one score is filled (incomplete)
    for (let i = 0; i < games.length; i++) {
      const game = games[i]
      const scoreAStr = game.scoreA.trim()
      const scoreBStr = game.scoreB.trim()
      
      const scoreA = scoreAStr === '' ? null : parseInt(scoreAStr)
      const scoreB = scoreBStr === '' ? null : parseInt(scoreBStr)
      
      // If both are empty, set to null (clear the game)
      if (scoreA === null && scoreB === null) {
        try {
          await updateGameScore.mutateAsync({
            matchId,
            gameIndex: i,
            scoreA: null as any,
            scoreB: null as any,
          })
        } catch (error) {
          console.error(`Error saving game ${i}:`, error)
        }
        continue
      }
      
      // If one is filled but not both, skip this game (don't save incomplete data)
      if (scoreA === null || scoreB === null) {
        // Skip - don't save incomplete scores
        continue
      }
      
      // Both are filled - validate they are valid numbers
      if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
        // Skip invalid scores - don't block saving other games
        console.warn(`Invalid scores for ${GAME_TYPES[i].label}, skipping`)
        continue
      }
      
      // Both scores are valid - save them
      try {
        await updateGameScore.mutateAsync({
          matchId,
          gameIndex: i,
          scoreA: scoreA as number,
          scoreB: scoreB as number,
        })
      } catch (error) {
        console.error(`Error saving game ${i}:`, error)
        // Continue with other games even if one fails
      }
    }

    onSuccess?.()
    onClose()
  }

  const handleClose = () => {
    setGames([
      { scoreA: '', scoreB: '' },
      { scoreA: '', scoreB: '' },
      { scoreA: '', scoreB: '' },
      { scoreA: '', scoreB: '' },
    ])
    setSendToDupr(false)
    setShowPlayersWithoutDupr(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          Enter MLP Match Scores
          {poolName && (
            <span className="text-sm font-normal text-gray-600 ml-2">
              - {poolName}
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {teamAName} vs {teamBName}
        </p>
        
        <form onSubmit={handleSubmitAll} className="space-y-6">
          {GAME_TYPES.map((gameType, index) => {
            const game = games[index]
            const existingGame = existingGames.find(g => g.index === index)
            const isCompleted = existingGame && 
              existingGame.scoreA !== null && 
              existingGame.scoreA !== undefined &&
              existingGame.scoreB !== null && 
              existingGame.scoreB !== undefined &&
              (existingGame.scoreA > 0 || existingGame.scoreB > 0)
            
            return (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-700">{gameType.label}</h3>
                  {isCompleted && (
                    <span className="text-xs text-green-600 font-medium">Completed</span>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {teamAName}
                    </label>
                    <input
                      type="text"
                      value={game.scoreA}
                      onChange={(e) => handleGameChange(index, 'scoreA', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Score"
                      pattern="[0-9]*"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {teamBName}
                    </label>
                    <input
                      type="text"
                      value={game.scoreB}
                      onChange={(e) => handleGameChange(index, 'scoreB', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Score"
                      pattern="[0-9]*"
                    />
                  </div>
                </div>
                
                {isCompleted && existingGame && (
                  <div className="text-xs text-gray-500">
                    Current: {existingGame.scoreA ?? '-'} - {existingGame.scoreB ?? '-'}
                  </div>
                )}
              </div>
            )
          })}

          {/* DUPR Submission Checkbox */}
          {allowDuprSubmission && (
            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendToDupr"
                  checked={sendToDupr}
                  onCheckedChange={(checked) => setSendToDupr(checked === true)}
                  disabled={!allPlayersHaveDupr}
                />
                <label
                  htmlFor="sendToDupr"
                  className={`text-sm font-medium ${
                    allPlayersHaveDupr ? 'text-gray-700' : 'text-gray-400'
                  }`}
                >
                  Send results to DUPR
                </label>
                {!allPlayersHaveDupr && (
                  <button
                    type="button"
                    onClick={() => setShowPlayersWithoutDupr(true)}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                    title="Show players without DUPR rating"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
              {!allPlayersHaveDupr && (
                <p className="text-xs text-gray-500 ml-6">
                  Rating missing
                </p>
              )}
              {duprSubmissionStatus === 'SUCCESS' && (
                <p className="text-xs text-green-600 ml-6">
                  ✓ Successfully sent
                </p>
              )}
              {duprSubmissionStatus === 'FAILED' && onRetryDuprSubmission && (
                <div className="ml-6">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRetryDuprSubmission}
                    className="text-xs"
                  >
                    Retry sending score
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={updateGameScore.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={updateGameScore.isPending}
            >
              {updateGameScore.isPending ? 'Saving...' : 'Save All Scores'}
            </Button>
          </div>
        </form>

        {/* Players Without DUPR Modal */}
        <PlayersWithoutDuprModal
          isOpen={showPlayersWithoutDupr}
          onClose={() => setShowPlayersWithoutDupr(false)}
          players={playersWithoutDupr}
        />
      </div>
    </div>
  )
}

