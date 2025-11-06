'use client'

import { useState, useMemo } from 'react'

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

  // Get final winner if final is finished
  const finalMatch = rounds.find(r => r.roundName === 'Final')?.matches[0]
  const finalWinner = finalMatch?.status === 'finished' ? {
    seed: finalMatch.winnerSeed || 0,
    teamName: finalMatch.winnerTeamName || '?'
  } : null

  // Build legend: seed number -> team name mapping
  const legend = useMemo(() => {
    const seedMap = new Map<number, string>()
    
    matches.forEach(match => {
      // Add left slot
      if (match.left.seed > 0 && !match.left.isBye) {
        if (match.left.teamName) {
          seedMap.set(match.left.seed, match.left.teamName)
        } else if (!seedMap.has(match.left.seed)) {
          seedMap.set(match.left.seed, '?')
        }
      }
      
      // Add right slot
      if (match.right.seed > 0 && !match.right.isBye) {
        if (match.right.teamName) {
          seedMap.set(match.right.seed, match.right.teamName)
        } else if (!seedMap.has(match.right.seed)) {
          seedMap.set(match.right.seed, '?')
        }
      }
      
      // Add winner if match is finished
      if (match.status === 'finished' && match.winnerSeed) {
        if (match.winnerTeamName) {
          seedMap.set(match.winnerSeed, match.winnerTeamName)
        } else if (!seedMap.has(match.winnerSeed)) {
          seedMap.set(match.winnerSeed, '?')
        }
      }
    })
    
    return Array.from(seedMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([seed, name]) => ({ seed, name }))
  }, [matches])

  // Get seed number to display for a slot - always show the actual seed from slot
  const getSeedDisplay = (slot: SeedSlot, match: BracketMatch, isLeft: boolean): number | null => {
    // If this is a BYE, don't show seed
    if (slot.isBye) {
      return null
    }
    
    // Always show the seed number from the slot (this is the actual seed)
    if (slot.seed > 0) {
      return slot.seed
    }
    
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

  // Calculate dimensions - increased spacing to prevent overlap
  const circleSize = 40 // Size of seed circle
  const circleSpacing = 80 // Vertical spacing between circles (increased from 60)
  const roundSpacing = 150 // Horizontal spacing between rounds (increased from 120)
  const matchBoxHeight = 40 // Height of match box (connects two circles)
  const matchBoxWidth = 60 // Width of match box

  // Calculate positions for each match in each round
  const getMatchPosition = (roundIdx: number, matchIdx: number, totalMatches: number): number => {
    // For bracket structure, matches should be positioned to form a pyramid
    // Each round has half the matches of the previous round
    // Position matches evenly distributed
    return matchIdx * circleSpacing * 2 // Each match takes 2 circleSpacing units (top circle + bottom circle + spacing)
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <div className="flex justify-start min-w-max">
          <div className="flex items-start py-4" style={{ gap: `${roundSpacing}px` }}>
            {rounds.map((round, roundIdx) => {
              const matchCount = round.matches.length
              // Calculate total height needed: each match needs 2 circles + match box + spacing
              const totalHeight = matchCount > 0 
                ? (matchCount - 1) * circleSpacing * 2 + circleSize * 2 + matchBoxHeight
                : 0
              
              return (
                <div key={round.round} className="flex flex-col items-center relative">
                  {/* Round Header */}
                  <div className="mb-4 text-center">
                    <h3 className="font-semibold text-gray-900 text-sm">{round.roundName}</h3>
                  </div>

                  {/* Matches */}
                  <div className="relative" style={{ minHeight: `${totalHeight}px`, width: `${matchBoxWidth + roundSpacing}px` }}>
                    {round.matches.map((match, matchIdx) => {
                      const isHovered = hoveredMatch === match.id
                      const leftSeed = getSeedDisplay(match.left, match, true)
                      const rightSeed = getSeedDisplay(match.right, match, false)
                      const isFinal = round.round === maxRound && round.round > 0
                      
                      // Calculate vertical position - each match is spaced by circleSpacing * 2
                      const topOffset = matchIdx * circleSpacing * 2
                      
                      return (
                        <div
                          key={match.id}
                          className="absolute left-0 flex flex-col items-center"
                          style={{ 
                            top: `${topOffset}px`,
                            width: `${matchBoxWidth}px`,
                          }}
                          onMouseEnter={() => setHoveredMatch(match.id)}
                          onMouseLeave={() => setHoveredMatch(null)}
                        >
                          {/* Left Seed Circle */}
                          <div className="relative mb-1">
                            {/* Connecting line FROM previous round (left side) */}
                            {showConnectingLines && roundIdx > 0 && (
                              <div 
                                className="absolute right-full top-1/2 bg-gray-400 z-10"
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
                              } ${isHovered ? 'scale-110' : ''} cursor-pointer`}
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

                          {/* Match Box (connects left and right circles) - just a vertical line */}
                          <div
                            className="relative mb-1"
                            style={{
                              width: `${matchBoxWidth}px`,
                              height: `${matchBoxHeight}px`,
                            }}
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
                                className="absolute left-full top-1/2 bg-gray-400 z-10"
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
                              } ${isHovered ? 'scale-110' : ''} cursor-pointer`}
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

                          {/* Connecting line TO next round - horizontal line from match center */}
                          {showConnectingLines && roundIdx < rounds.length - 1 && (
                            <div 
                              className="absolute left-1/2 top-full bg-gray-400 z-10"
                              style={{ 
                                width: `${roundSpacing / 2}px`,
                                height: '2px',
                                transform: 'translateX(-50%)',
                                top: `${circleSize + matchBoxHeight + circleSize}px`,
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
                            const match1Center = matchIdx * circleSpacing * 2 + circleSize + matchBoxHeight + circleSize / 2
                            const match2Center = (matchIdx + 1) * circleSpacing * 2 + circleSize + matchBoxHeight + circleSize / 2
                            const connectorTop = match1Center
                            const connectorHeight = match2Center - match1Center
                            
                            return (
                              <div
                                key={`connector-${match.id}`}
                                className="absolute bg-gray-400 z-10"
                                style={{
                                  left: `${matchBoxWidth / 2 + roundSpacing / 2}px`,
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
            
            {/* Winner Circle after Final */}
            {finalWinner && (
              <div className="flex flex-col items-center relative">
                <div className="mb-4 text-center">
                  <h3 className="font-semibold text-gray-900 text-sm">Winner</h3>
                </div>
                <div className="relative mt-4">
                  {/* Connecting line FROM Final */}
                  {showConnectingLines && (
                    <div 
                      className="absolute right-full top-1/2 bg-gray-400 z-10"
                      style={{ 
                        width: `${roundSpacing / 2}px`,
                        height: '2px',
                      }}
                    />
                  )}
                  
                  {/* Winner Circle */}
                  <div
                    className="flex items-center justify-center rounded-full border-2 bg-yellow-100 border-yellow-500 cursor-pointer"
                    style={{
                      width: `${circleSize}px`,
                      height: `${circleSize}px`,
                    }}
                    title={finalWinner.teamName}
                  >
                    <span className="text-sm font-bold text-gray-900">{finalWinner.seed}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Legend */}
      {legend.length > 0 && (
        <div className="mt-8 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Legend</h4>
          <div className="flex flex-wrap gap-4">
            {legend.map(({ seed, name }) => (
              <div key={seed} className="text-sm text-gray-600">
                <span className="font-medium">#{seed}</span>
                {' - '}
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
