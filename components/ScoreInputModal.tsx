'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { HelpCircle } from 'lucide-react'
import PlayersWithoutDuprModal from './PlayersWithoutDuprModal'

interface Player {
  id: string
  firstName: string
  lastName: string
  duprId: string | null
  duprNumericId: bigint | null
}

interface ScoreInputModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (scoreA: number, scoreB: number, sendToDupr?: boolean) => void
  teamAName: string
  teamBName: string
  poolName?: string
  isLoading?: boolean
  teamAPlayers?: Player[]
  teamBPlayers?: Player[]
  teamKind?: 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
  allowDuprSubmission?: boolean
  duprSubmissionStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | null
  onRetryDuprSubmission?: () => void
  existingScoreA?: number | null
  existingScoreB?: number | null
}

export default function ScoreInputModal({
  isOpen,
  onClose,
  onSubmit,
  teamAName,
  teamBName,
  poolName,
  isLoading = false,
  teamAPlayers = [],
  teamBPlayers = [],
  teamKind = 'DOUBLES_2v2',
  allowDuprSubmission = false,
  duprSubmissionStatus = null,
  onRetryDuprSubmission,
  existingScoreA,
  existingScoreB,
}: ScoreInputModalProps) {
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [sendToDupr, setSendToDupr] = useState(false)
  const [showPlayersWithoutDupr, setShowPlayersWithoutDupr] = useState(false)

  // Check if all players have DUPR rating
  const allPlayersHaveDupr = useMemo(() => {
    if (!allowDuprSubmission) return false
    
    const allPlayers = [...teamAPlayers, ...teamBPlayers]
    if (allPlayers.length === 0) return false

    // For SINGLES: need 2 players with DUPR
    if (teamKind === 'SINGLES_1v1') {
      return allPlayers.length === 2 && 
        allPlayers.every(p => p.duprId || p.duprNumericId)
    }
    
    // For DOUBLES: need 4 players with DUPR
    if (teamKind === 'DOUBLES_2v2') {
      return allPlayers.length === 4 && 
        allPlayers.every(p => p.duprId || p.duprNumericId)
    }
    
    // For SQUAD: need 8 players with DUPR (4 per team)
    if (teamKind === 'SQUAD_4v4') {
      return allPlayers.length === 8 && 
        allPlayers.every(p => p.duprId || p.duprNumericId)
    }
    
    return false
  }, [teamAPlayers, teamBPlayers, teamKind, allowDuprSubmission])

  // Get players without DUPR rating
  const playersWithoutDupr = useMemo(() => {
    return [...teamAPlayers, ...teamBPlayers].filter(
      p => !p.duprId && !p.duprNumericId
    )
  }, [teamAPlayers, teamBPlayers])

  // Set default checkbox state and existing scores when modal opens
  useEffect(() => {
    if (isOpen) {
      setSendToDupr(allPlayersHaveDupr)
      // Set existing scores if available
      if (existingScoreA !== null && existingScoreA !== undefined) {
        setScoreA(String(existingScoreA))
      } else {
        setScoreA('')
      }
      if (existingScoreB !== null && existingScoreB !== undefined) {
        setScoreB(String(existingScoreB))
      } else {
        setScoreB('')
      }
    }
  }, [isOpen, allPlayersHaveDupr, existingScoreA, existingScoreB])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const scoreAValue = parseInt(scoreA)
    const scoreBValue = parseInt(scoreB)
    
    if (isNaN(scoreAValue) || isNaN(scoreBValue) || scoreAValue < 0 || scoreBValue < 0) {
      alert('Please enter valid scores (non-negative numbers)')
      return
    }

    onSubmit(scoreAValue, scoreBValue, sendToDupr && allPlayersHaveDupr)
  }

  const handleClose = () => {
    setScoreA('')
    setScoreB('')
    setSendToDupr(false)
    setShowPlayersWithoutDupr(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">
          Enter Score
          {poolName && (
            <span className="text-sm font-normal text-gray-600 ml-2">
              - {poolName}
            </span>
          )}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {teamAName}
            </label>
            <input
              type="number"
              value={scoreA}
                  onChange={(e) => setScoreA(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Team A score"
                  min="0"
                  required
                />
          </div>

          <div className="text-center text-gray-500 font-medium">VS</div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {teamBName}
            </label>
            <input
              type="number"
              value={scoreB}
                  onChange={(e) => setScoreB(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Team B score"
                  min="0"
                  required
                />
          </div>

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
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Score'}
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
