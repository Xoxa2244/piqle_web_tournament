'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

interface MLPScoreInputModalProps {
  isOpen: boolean
  onClose: () => void
  matchId: string
  teamAName: string
  teamBName: string
  poolName?: string
  existingGames?: Array<{ index: number; scoreA: number; scoreB: number; gameType?: string }>
  onSuccess?: () => void
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
}: MLPScoreInputModalProps) {
  const [games, setGames] = useState<Array<{ scoreA: string; scoreB: string }>>([
    { scoreA: '', scoreB: '' },
    { scoreA: '', scoreB: '' },
    { scoreA: '', scoreB: '' },
    { scoreA: '', scoreB: '' },
  ])

  const updateGameScore = trpc.match.updateGameScore.useMutation({
    onSuccess: () => {
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
            scoreA: game.scoreA.toString(),
            scoreB: game.scoreB.toString(),
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
    const scoreA = parseInt(game.scoreA)
    const scoreB = parseInt(game.scoreB)
    
    if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
      alert('Please enter valid scores (non-negative numbers)')
      return
    }

    await updateGameScore.mutateAsync({
      matchId,
      gameIndex: index,
      scoreA,
      scoreB,
    })
  }

  const handleSubmitAll = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all games
    for (let i = 0; i < games.length; i++) {
      const game = games[i]
      const scoreA = parseInt(game.scoreA)
      const scoreB = parseInt(game.scoreB)
      
      if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
        alert(`Please enter valid scores for ${GAME_TYPES[i].label}`)
        return
      }
    }

    // Submit all games
    for (let i = 0; i < games.length; i++) {
      const game = games[i]
      const scoreA = parseInt(game.scoreA)
      const scoreB = parseInt(game.scoreB)
      
      await updateGameScore.mutateAsync({
        matchId,
        gameIndex: i,
        scoreA,
        scoreB,
      })
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
            const isCompleted = existingGame && (existingGame.scoreA > 0 || existingGame.scoreB > 0)
            
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
                      type="number"
                      value={game.scoreA}
                      onChange={(e) => handleGameChange(index, 'scoreA', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Score"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {teamBName}
                    </label>
                    <input
                      type="number"
                      value={game.scoreB}
                      onChange={(e) => handleGameChange(index, 'scoreB', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Score"
                      min="0"
                      required
                    />
                  </div>
                </div>
                
                {isCompleted && (
                  <div className="text-xs text-gray-500">
                    Current: {existingGame.scoreA} - {existingGame.scoreB}
                  </div>
                )}
              </div>
            )
          })}

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
      </div>
    </div>
  )
}

