'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Crown, CheckCircle } from 'lucide-react'

// Import types from bracket utils
type MatchStatus = 'scheduled' | 'in_progress' | 'finished'

interface SeedSlot {
  seed: number
  teamId?: string
  teamName?: string
  isBye?: boolean
}

interface BracketMatch {
  id: string
  round: number  // 0 = Play-In, 1..N
  position: number
  left: SeedSlot
  right: SeedSlot
  status: MatchStatus
  winnerSeed?: number
  winnerTeamId?: string
  winnerTeamName?: string
  nextMatchId?: string
  nextSlot?: 'left' | 'right'
  matchId?: string
  games?: Array<{ scoreA: number; scoreB: number }>
}

interface BracketPyramidNewProps {
  matches: BracketMatch[]
  showConnectingLines?: boolean
  onMatchClick?: (matchId: string) => void
}

interface BracketRound {
  round: number
  roundName: string
  matches: BracketMatch[]
}

export default function BracketPyramidNew({ 
  matches, 
  showConnectingLines = true, 
  onMatchClick 
}: BracketPyramidNewProps) {
  const [hoveredMatch, setHoveredMatch] = useState<string | null>(null)

  // Group matches by round
  const rounds: BracketRound[] = []
  const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0
  
  for (let round = 0; round <= maxRound; round++) {
    const roundMatches = matches.filter(m => m.round === round).sort((a, b) => a.position - b.position)
    if (roundMatches.length > 0) {
      let roundName = ''
      
      // Determine round name
      if (round === 0) {
        roundName = 'Play-In'
      } else if (round === 1) {
        roundName = 'Round 1'
      } else if (round === 2) {
        roundName = 'Round 2'
      } else if (round === 3) {
        roundName = 'Round 3'
      } else if (round === maxRound) {
        roundName = 'Final'
      } else {
        const roundsFromEnd = maxRound - round
        if (roundsFromEnd === 1) {
          roundName = 'Semi-Finals'
        } else if (roundsFromEnd === 2) {
          roundName = 'Quarter-Finals'
        } else {
          roundName = `Round ${round}`
        }
      }
      
      rounds.push({
        round,
        roundName,
        matches: roundMatches
      })
    }
  }

  const getScores = (match: BracketMatch) => {
    if (!match.games || match.games.length === 0) return { scoreA: null, scoreB: null }
    
    const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
    const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
    
    return { scoreA: totalScoreA, scoreB: totalScoreB }
  }

  // Determine if slot should show seed only or team name
  const getSlotDisplay = (slot: SeedSlot, match: BracketMatch, isLeft: boolean) => {
    // If match is finished and this is the winner, always show team name
    if (match.status === 'finished' && match.winnerTeamId) {
      if (isLeft && match.winnerTeamId === slot.teamId) {
        return { showSeed: false, display: slot.teamName || `#${slot.seed}`, isWinner: true }
      }
      if (!isLeft && match.winnerTeamId === slot.teamId) {
        return { showSeed: false, display: slot.teamName || `#${slot.seed}`, isWinner: true }
      }
      if (isLeft && match.winnerTeamId !== slot.teamId) {
        return { showSeed: false, display: slot.teamName || `#${slot.seed}`, isWinner: false }
      }
      if (!isLeft && match.winnerTeamId !== slot.teamId) {
        return { showSeed: false, display: slot.teamName || `#${slot.seed}`, isWinner: false }
      }
    }
    
    // If match is scheduled/in_progress and team is assigned, show team name
    if ((match.status === 'scheduled' || match.status === 'in_progress') && slot.teamId && slot.teamName) {
      return { showSeed: false, display: slot.teamName, isWinner: false }
    }
    
    // Otherwise show seed only
    return { showSeed: true, display: `#${slot.seed}`, isWinner: false }
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-8">
        <Trophy className="h-12 w-12 mx-auto mb-2 text-gray-400" />
        <p className="text-gray-500">Bracket not started yet</p>
        <p className="text-sm text-gray-400">Matches will appear here once bracket begins</p>
      </div>
    )
  }

  // Calculate match height for connecting lines
  const matchHeight = 128 // 32px * 4 (match card + spacing)
  const matchSpacing = 24

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex justify-start min-w-max">
        <div className="flex items-start space-x-8 py-4">
          {rounds.map((round, roundIdx) => (
            <div key={round.round} className="flex flex-col items-center relative">
              {/* Round Header */}
              <div className="mb-4 text-center">
                <h3 className="font-semibold text-gray-900">{round.roundName}</h3>
              </div>

              {/* Matches */}
              <div className="space-y-6">
                {round.matches.map((match, matchIdx) => {
                  const scores = getScores(match)
                  const isHovered = hoveredMatch === match.id
                  const leftDisplay = getSlotDisplay(match.left, match, true)
                  const rightDisplay = getSlotDisplay(match.right, match, false)
                  const isFinal = round.round === maxRound && round.round > 0
                  
                  return (
                    <div
                      key={match.id}
                      className={`relative transition-all duration-200 flex items-center ${
                        isHovered ? 'scale-105 z-10' : ''
                      }`}
                      style={{ height: `${matchHeight}px` }}
                      onMouseEnter={() => setHoveredMatch(match.id)}
                      onMouseLeave={() => setHoveredMatch(null)}
                    >
                      {/* Connecting Lines FROM previous round */}
                      {showConnectingLines && roundIdx > 0 && (
                        <>
                          {/* Left slot line */}
                          <div className="absolute left-0 top-1/2 -translate-x-8 w-8 h-0.5 bg-gray-300" />
                          <div className="absolute left-0 top-1/2 -translate-x-8 -translate-y-1/2 w-0.5 h-full bg-gray-300" style={{ height: `${matchHeight * 2 + matchSpacing}px` }} />
                          {/* Right slot line */}
                          <div className="absolute right-0 top-1/2 translate-x-8 w-8 h-0.5 bg-gray-300" />
                        </>
                      )}

                      {/* Match Card */}
                      <Card 
                        className={`w-48 h-32 cursor-pointer ${
                          isFinal 
                            ? 'bg-blue-50 border-blue-200'
                            : match.round === 0
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-white border-gray-200'
                        } rounded-lg ${
                          isHovered ? 'shadow-lg' : 'shadow-sm'
                        }`}
                        onClick={() => onMatchClick?.(match.matchId || match.id)}
                      >
                        <CardContent className="p-3 h-full flex flex-col justify-center">
                          {/* Left Slot */}
                          <div className={`flex items-center justify-between mb-3 ${
                            leftDisplay.isWinner ? 'bg-green-50 border border-green-200 rounded-md p-1' : ''
                          }`}>
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
                              {leftDisplay.isWinner && (
                                <Crown className="h-3 w-3 text-green-600 flex-shrink-0" />
                              )}
                              {leftDisplay.showSeed ? (
                                <div className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                                  {leftDisplay.display}
                                </div>
                              ) : (
                                <>
                                  <div className="text-xs text-gray-500 font-medium">
                                    #{match.left.seed}
                                  </div>
                                  <div className={`text-sm font-medium truncate ${
                                    rightDisplay.isWinner ? 'text-gray-400' : 
                                    leftDisplay.isWinner ? 'text-green-800 font-semibold' : 
                                    'text-gray-900'
                                  }`} title={match.left.teamName || `#${match.left.seed}`}>
                                    {leftDisplay.display}
                                  </div>
                                </>
                              )}
                            </div>
                            {!leftDisplay.showSeed && (
                              <div className={`text-lg font-semibold font-mono tabular-nums text-right ${
                                leftDisplay.isWinner ? 'text-green-800' : 
                                rightDisplay.isWinner ? 'text-gray-400' : 
                                'text-gray-900'
                              }`}>
                                {scores.scoreA !== null ? scores.scoreA : '—'}
                              </div>
                            )}
                            {match.left.isBye && (
                              <Badge variant="outline" className="ml-2 text-xs bg-gray-100">
                                BYE
                              </Badge>
                            )}
                          </div>

                          {/* Right Slot */}
                          <div className={`flex items-center justify-between ${
                            rightDisplay.isWinner ? 'bg-green-50 border border-green-200 rounded-md p-1' : ''
                          }`}>
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
                              {rightDisplay.isWinner && (
                                <Crown className="h-3 w-3 text-green-600 flex-shrink-0" />
                              )}
                              {rightDisplay.showSeed ? (
                                <div className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                                  {rightDisplay.display}
                                </div>
                              ) : (
                                <>
                                  <div className="text-xs text-gray-500 font-medium">
                                    #{match.right.seed}
                                  </div>
                                  <div className={`text-sm font-medium truncate ${
                                    leftDisplay.isWinner ? 'text-gray-400' : 
                                    rightDisplay.isWinner ? 'text-green-800 font-semibold' : 
                                    'text-gray-900'
                                  }`} title={match.right.teamName || `#${match.right.seed}`}>
                                    {rightDisplay.display}
                                  </div>
                                </>
                              )}
                            </div>
                            {!rightDisplay.showSeed && (
                              <div className={`text-lg font-semibold font-mono tabular-nums text-right ${
                                rightDisplay.isWinner ? 'text-green-800' : 
                                leftDisplay.isWinner ? 'text-gray-400' : 
                                'text-gray-900'
                              }`}>
                                {scores.scoreB !== null ? scores.scoreB : '—'}
                              </div>
                            )}
                            {match.right.isBye && (
                              <Badge variant="outline" className="ml-2 text-xs bg-gray-100">
                                BYE
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Connecting Lines TO next round */}
                      {showConnectingLines && roundIdx < rounds.length - 1 && match.nextMatchId && (
                        <div className="absolute right-0 top-1/2 translate-x-8 w-8 h-0.5 bg-gray-300" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

