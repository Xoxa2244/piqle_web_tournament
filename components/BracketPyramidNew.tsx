'use client'

import { useState } from 'react'

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

  // Get seed number to display for a slot
  // Returns null if seed is unknown (game not played yet)
  const getSeedDisplay = (slot: SeedSlot, match: BracketMatch, isLeft: boolean): number | null => {
    // If this is a BYE, don't show seed
    if (slot.isBye) {
      return null
    }
    
    // If match is finished, show winner's seed for winner, original seed for loser
    if (match.status === 'finished' && match.winnerTeamId) {
      if ((isLeft && match.winnerTeamId === slot.teamId) || (!isLeft && match.winnerTeamId === slot.teamId)) {
        // Winner - show winner seed if available, otherwise original seed
        return match.winnerSeed || slot.seed
      }
      // Loser - show original seed
      if (slot.seed > 0) {
        return slot.seed
      }
    }
    
    // If match is scheduled/in_progress and team is assigned, show seed
    if (slot.seed > 0 && slot.teamId) {
      return slot.seed
    }
    
    // If seed is known from initial bracket structure (before match is played), show it
    if (slot.seed > 0) {
      return slot.seed
    }
    
    // Otherwise, seed is unknown (previous game not played or not determined)
    return null
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Bracket not started yet</p>
        <p className="text-sm text-gray-400">Matches will appear here once bracket begins</p>
      </div>
    )
  }

  // Calculate dimensions
  const circleSize = 40 // Size of seed circle
  const circleSpacing = 60 // Vertical spacing between circles
  const roundSpacing = 120 // Horizontal spacing between rounds
  const matchBoxHeight = 80 // Height of match box (connects two circles)
  const matchBoxWidth = 100 // Width of match box

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex justify-start min-w-max">
        <div className="flex items-start py-4" style={{ gap: `${roundSpacing}px` }}>
          {rounds.map((round, roundIdx) => {
            const matchCount = round.matches.length
            const totalHeight = matchCount * circleSpacing - (circleSpacing - matchBoxHeight)
            
            return (
              <div key={round.round} className="flex flex-col items-center relative">
                {/* Round Header */}
                <div className="mb-4 text-center">
                  <h3 className="font-semibold text-gray-900 text-sm">{round.roundName}</h3>
                </div>

                {/* Matches */}
                <div className="relative" style={{ minHeight: `${totalHeight}px` }}>
                  {round.matches.map((match, matchIdx) => {
                    const isHovered = hoveredMatch === match.id
                    const leftSeed = getSeedDisplay(match.left, match, true)
                    const rightSeed = getSeedDisplay(match.right, match, false)
                    const isFinal = round.round === maxRound && round.round > 0
                    
                    // Calculate vertical position
                    const topOffset = matchIdx * circleSpacing
                    
                    return (
                      <div
                        key={match.id}
                        className="absolute left-0 right-0 flex flex-col items-center"
                        style={{ 
                          top: `${topOffset}px`,
                        }}
                        onMouseEnter={() => setHoveredMatch(match.id)}
                        onMouseLeave={() => setHoveredMatch(null)}
                      >
                        {/* Left Seed Circle */}
                        <div className="relative mb-2">
                          {/* Connecting line FROM previous round (left side) */}
                          {showConnectingLines && roundIdx > 0 && (
                            <div 
                              className="absolute right-full top-1/2 bg-gray-400"
                              style={{ 
                                width: `${roundSpacing / 2}px`,
                                height: '2px',
                              }}
                            />
                          )}
                          
                          {/* Circle */}
                          <div
                            className={`flex items-center justify-center rounded-full border-2 transition-all ${
                              match.status === 'finished' && match.winnerTeamId === match.left.teamId
                                ? 'bg-green-100 border-green-500'
                                : match.left.isBye
                                ? 'bg-gray-100 border-gray-300'
                                : leftSeed !== null
                                ? 'bg-blue-50 border-blue-300'
                                : 'bg-white border-gray-300'
                            } ${isHovered ? 'scale-110 shadow-lg' : 'shadow-sm'} cursor-pointer`}
                            style={{
                              width: `${circleSize}px`,
                              height: `${circleSize}px`,
                            }}
                            onClick={() => onMatchClick?.(match.matchId || match.id)}
                            title={match.left.teamName || (match.left.isBye ? 'BYE' : `Seed ${match.left.seed}`)}
                          >
                            {match.left.isBye ? (
                              <span className="text-xs font-semibold text-gray-500">BYE</span>
                            ) : leftSeed !== null ? (
                              <span className="text-sm font-bold text-gray-900">{leftSeed}</span>
                            ) : (
                              <span className="text-xs text-gray-400">?</span>
                            )}
                          </div>
                        </div>

                        {/* Match Box (connects left and right circles) */}
                        <div
                          className={`relative mb-2 rounded border-2 transition-all ${
                            isFinal
                              ? 'bg-blue-50 border-blue-300'
                              : match.round === 0
                              ? 'bg-orange-50 border-orange-300'
                              : 'bg-gray-50 border-gray-300'
                          } ${isHovered ? 'scale-105 shadow-md' : 'shadow-sm'} cursor-pointer`}
                          style={{
                            width: `${matchBoxWidth}px`,
                            height: `${matchBoxHeight}px`,
                          }}
                          onClick={() => onMatchClick?.(match.matchId || match.id)}
                        >
                          {/* Vertical line connecting left and right circles */}
                          <div 
                            className="absolute left-1/2 top-0 bottom-0 bg-gray-400"
                            style={{ 
                              width: '2px',
                              transform: 'translateX(-50%)',
                            }}
                          />
                        </div>

                        {/* Right Seed Circle */}
                        <div className="relative">
                          {/* Connecting line FROM previous round (right side) */}
                          {showConnectingLines && roundIdx > 0 && (
                            <div 
                              className="absolute left-full top-1/2 bg-gray-400"
                              style={{ 
                                width: `${roundSpacing / 2}px`,
                                height: '2px',
                              }}
                            />
                          )}
                          
                          {/* Circle */}
                          <div
                            className={`flex items-center justify-center rounded-full border-2 transition-all ${
                              match.status === 'finished' && match.winnerTeamId === match.right.teamId
                                ? 'bg-green-100 border-green-500'
                                : match.right.isBye
                                ? 'bg-gray-100 border-gray-300'
                                : rightSeed !== null
                                ? 'bg-blue-50 border-blue-300'
                                : 'bg-white border-gray-300'
                            } ${isHovered ? 'scale-110 shadow-lg' : 'shadow-sm'} cursor-pointer`}
                            style={{
                              width: `${circleSize}px`,
                              height: `${circleSize}px`,
                            }}
                            onClick={() => onMatchClick?.(match.matchId || match.id)}
                            title={match.right.teamName || (match.right.isBye ? 'BYE' : `Seed ${match.right.seed}`)}
                          >
                            {match.right.isBye ? (
                              <span className="text-xs font-semibold text-gray-500">BYE</span>
                            ) : rightSeed !== null ? (
                              <span className="text-sm font-bold text-gray-900">{rightSeed}</span>
                            ) : (
                              <span className="text-xs text-gray-400">?</span>
                            )}
                          </div>
                        </div>

                        {/* Connecting line TO next round */}
                        {showConnectingLines && roundIdx < rounds.length - 1 && (
                          <div 
                            className="absolute left-1/2 top-full bg-gray-400"
                            style={{ 
                              width: '2px',
                              height: `${circleSpacing / 2}px`,
                              transform: 'translateX(-50%)',
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                  
                  {/* Vertical connector lines between rounds - connect pairs of matches */}
                  {showConnectingLines && roundIdx < rounds.length - 1 && round.matches.length > 1 && (
                    <>
                      {round.matches.map((match, matchIdx) => {
                        if (matchIdx % 2 === 0 && matchIdx + 1 < round.matches.length) {
                          // Connect pairs of matches to next round
                          const topOffset1 = matchIdx * circleSpacing + circleSize + matchBoxHeight + circleSize
                          const topOffset2 = (matchIdx + 1) * circleSpacing + circleSize + matchBoxHeight + circleSize
                          const connectorTop = topOffset1
                          const connectorHeight = topOffset2 - topOffset1
                          
                          return (
                            <div
                              key={`connector-${match.id}`}
                              className="absolute bg-gray-400"
                              style={{
                                left: `${matchBoxWidth / 2}px`,
                                top: `${connectorTop}px`,
                                width: '2px',
                                height: `${connectorHeight}px`,
                              }}
                            />
                          )
                        }
                        return null
                      })}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
