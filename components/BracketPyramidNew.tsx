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
  
  // Debug: log matches to see if Round 0 exists
  console.log('[BracketPyramidNew] Total matches:', matches.length)
  console.log('[BracketPyramidNew] Rounds found:', matches.map(m => m.round).sort((a, b) => a - b))
  console.log('[BracketPyramidNew] Max round:', maxRound)
  
  for (let round = 0; round <= maxRound; round++) {
    const roundMatches = matches.filter(m => m.round === round).sort((a, b) => a.position - b.position)
    console.log(`[BracketPyramidNew] Round ${round} matches:`, roundMatches.length)
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

  // Get final winner - check if final exists and has a winner
  const finalMatch = rounds.find(r => r.roundName === 'Final')?.matches[0]
  const finalWinner = finalMatch && (finalMatch.status === 'finished' || finalMatch.winnerTeamId) ? {
    seed: finalMatch.winnerSeed || finalMatch.left.seed || finalMatch.right.seed || 0,
    teamName: finalMatch.winnerTeamName || finalMatch.left.teamName || finalMatch.right.teamName || '?'
  } : null
  
  console.log('[BracketPyramidNew] Final match:', finalMatch ? {
    id: finalMatch.id,
    status: finalMatch.status,
    winnerTeamId: finalMatch.winnerTeamId,
    winnerSeed: finalMatch.winnerSeed,
    winnerTeamName: finalMatch.winnerTeamName
  } : 'not found')
  console.log('[BracketPyramidNew] Final winner:', finalWinner)

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
  // For BYE, we don't show anything (empty circle), but the team with BYE automatically advances
  const getSeedDisplay = (slot: SeedSlot, match: BracketMatch, isLeft: boolean): number | null => {
    // If this is a BYE, return null (will show empty circle or "?")
    // The team with BYE automatically advances, so we don't show seed for BYE slot
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

  // Calculate dimensions - compact spacing
  const circleSize = 32 // Size of seed circle
  const circleSpacing = 50 // Vertical spacing between circles
  const roundSpacing = 100 // Horizontal spacing between rounds
  const matchBoxHeight = 30 // Height of match box (connects two circles)
  const matchBoxWidth = 50 // Width of match box

  // Calculate height for a round based on number of matches
  const getRoundHeight = (matchCount: number): number => {
    if (matchCount === 0) return 0
    return (matchCount - 1) * circleSpacing * 2 + circleSize * 2 + matchBoxHeight
  }

  // Find maximum height among all rounds (for centering)
  const maxHeight = Math.max(...rounds.map(round => getRoundHeight(round.matches.length)))

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <div className="flex justify-start min-w-max">
          <div className="flex items-start py-4" style={{ gap: `${roundSpacing}px`, minHeight: `${maxHeight}px` }}>
            {rounds.map((round, roundIdx) => {
              const matchCount = round.matches.length
              const roundHeight = getRoundHeight(matchCount)
              
              // Center this round vertically relative to max height
              const roundTopOffset = (maxHeight - roundHeight) / 2
              
              return (
                <div key={round.round} className="flex flex-col items-center relative" style={{ minHeight: `${maxHeight}px` }}>
                  {/* Round Header */}
                  <div className="mb-4 text-center">
                    <h3 className="font-semibold text-gray-900 text-sm">{round.roundName}</h3>
                  </div>

                  {/* Matches */}
                  <div className="relative" style={{ minHeight: `${maxHeight}px`, width: `${matchBoxWidth + roundSpacing}px` }}>
                    {round.matches.map((match, matchIdx) => {
                      const isHovered = hoveredMatch === match.id
                      const leftSeed = getSeedDisplay(match.left, match, true)
                      const rightSeed = getSeedDisplay(match.right, match, false)
                      const isFinal = round.round === maxRound && round.round > 0
                      
                      // Calculate vertical position - centered round + match position within round
                      const matchTopOffset = roundTopOffset + matchIdx * circleSpacing * 2
                      
                      // Calculate match center (for connecting lines)
                      const matchCenter = matchTopOffset + circleSize + matchBoxHeight / 2
                      
                      return (
                        <div
                          key={match.id}
                          className="absolute left-0 flex flex-col items-center"
                          style={{ 
                            top: `${matchTopOffset}px`,
                            width: `${matchBoxWidth}px`,
                          }}
                          onMouseEnter={() => setHoveredMatch(match.id)}
                          onMouseLeave={() => setHoveredMatch(null)}
                        >
                          {/* Left Seed Circle */}
                          <div className="relative mb-1">
                            
                            {/* Circle */}
                            <div
                              className={`flex items-center justify-center rounded-full border-2 transition-all ${
                                match.status === 'finished' && match.winnerTeamId === match.left.teamId
                                  ? 'bg-green-100 border-green-500'
                                  : match.left.isBye
                                  ? 'bg-white border-gray-300 opacity-50'
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
                            {leftSeed !== null ? (
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
                            
                            {/* Circle */}
                            <div
                              className={`flex items-center justify-center rounded-full border-2 transition-all ${
                                match.status === 'finished' && match.winnerTeamId === match.right.teamId
                                  ? 'bg-green-100 border-green-500'
                                  : match.right.isBye
                                  ? 'bg-white border-gray-300 opacity-50'
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
                            {rightSeed !== null ? (
                              <span className="text-sm font-bold text-gray-900">{rightSeed}</span>
                            ) : (
                              <span className="text-xs text-gray-400">?</span>
                            )}
                            </div>
                          </div>

                        </div>
                      )
                    })}
                    
                    {/* Connecting lines between rounds */}
                    {showConnectingLines && roundIdx < rounds.length - 1 && round.matches.length > 0 && (
                      <>
                        {round.matches.map((match, matchIdx) => {
                          // Find corresponding matches in next round
                          const nextRound = rounds[roundIdx + 1]
                          if (!nextRound || nextRound.matches.length === 0) return null
                          
                          // Special handling for Round 0 (Play-In) - each match connects to a specific match in Round 1
                          if (round.round === 0) {
                            // Play-In matches connect directly to Round 1 matches
                            // The winner of Play-In match goes to a specific position in Round 1
                            // We need to find which Round 1 match contains the Play-In winner
                            const playInWinner = match.winnerTeamId || match.left.teamId || match.right.teamId
                            
                            // Find the Round 1 match that contains this winner
                            const targetRound1Match = nextRound.matches.find(m => 
                              m.left.teamId === playInWinner || m.right.teamId === playInWinner
                            )
                            
                            if (!targetRound1Match) return null
                            
                            const targetMatchIdx = nextRound.matches.indexOf(targetRound1Match)
                            
                            // Calculate positions
                            const playInMatchTopOffset = roundTopOffset + matchIdx * circleSpacing * 2
                            const playInMatchCenter = playInMatchTopOffset + circleSize + matchBoxHeight / 2
                            
                            const nextRoundHeight = getRoundHeight(nextRound.matches.length)
                            const nextRoundTopOffset = (maxHeight - nextRoundHeight) / 2
                            const targetMatchTopOffset = nextRoundTopOffset + targetMatchIdx * circleSpacing * 2
                            const targetMatchCenter = targetMatchTopOffset + circleSize + matchBoxHeight / 2
                            
                            // Determine which side of the target match (left or right)
                            const isLeft = targetRound1Match.left.teamId === playInWinner
                            const targetCircleCenter = isLeft 
                              ? targetMatchTopOffset + circleSize / 2
                              : targetMatchTopOffset + circleSize + matchBoxHeight + circleSize / 2
                            
                            // Calculate connection points
                            const horizontalLineY = playInMatchCenter
                            const verticalLineStartY = Math.min(horizontalLineY, targetCircleCenter)
                            const verticalLineHeight = Math.abs(targetCircleCenter - horizontalLineY)
                            
                            return (
                              <div key={`playin-connector-${match.id}`}>
                                {/* Horizontal line from Play-In match center */}
                                <div
                                  className="absolute bg-gray-400 z-10"
                                  style={{
                                    left: `${matchBoxWidth / 2}px`,
                                    top: `${horizontalLineY}px`,
                                    width: `${roundSpacing}px`,
                                    height: '2px',
                                    transform: 'translateY(-50%)',
                                  }}
                                />
                                {/* Vertical line from horizontal line end to target circle center */}
                                {verticalLineHeight > 0 && (
                                  <div
                                    className="absolute bg-gray-400 z-10"
                                    style={{
                                      left: `${matchBoxWidth / 2 + roundSpacing}px`,
                                      top: `${verticalLineStartY}px`,
                                      width: '2px',
                                      height: `${verticalLineHeight}px`,
                                    }}
                                  />
                                )}
                              </div>
                            )
                          }
                          
                          // For other rounds: connect pairs of matches to one match in next round
                          // Only process even-indexed matches (they are the first of a pair)
                          if (matchIdx % 2 === 1) return null
                          
                          // Check if we have a second match in the pair
                          const match2 = round.matches[matchIdx + 1]
                          if (!match2) return null
                          
                          const nextMatchIdx = Math.floor(matchIdx / 2)
                          const nextMatch = nextRound.matches[nextMatchIdx]
                          if (!nextMatch) return null
                          
                          // Calculate positions in current round
                          const match1TopOffset = roundTopOffset + matchIdx * circleSpacing * 2
                          const match2TopOffset = roundTopOffset + (matchIdx + 1) * circleSpacing * 2
                          const match1Center = match1TopOffset + circleSize + matchBoxHeight / 2
                          const match2Center = match2TopOffset + circleSize + matchBoxHeight / 2
                          
                          // Calculate positions in next round
                          const nextRoundHeight = getRoundHeight(nextRound.matches.length)
                          const nextRoundTopOffset = (maxHeight - nextRoundHeight) / 2
                          const nextMatchTopOffset = nextRoundTopOffset + nextMatchIdx * circleSpacing * 2
                          const nextMatchCenter = nextMatchTopOffset + circleSize + matchBoxHeight / 2
                          
                          // Calculate connector positions
                          const connectorY = (match1Center + match2Center) / 2
                          const connectorHeight = Math.abs(match2Center - match1Center)
                          const connectorTop = Math.min(match1Center, match2Center)
                          
                          // Calculate the exact connection point
                          // We need to connect from the center of the pair to the center of the next match
                          // The connection should be: vertical line from pair center, horizontal line, then vertical to next match
                          
                          return (
                            <div key={`connector-${match.id}`}>
                              {/* Vertical line connecting two matches in current round (from match1 center to match2 center) */}
                              <div
                                className="absolute bg-gray-400 z-10"
                                style={{
                                  left: `${matchBoxWidth / 2}px`,
                                  top: `${connectorTop}px`,
                                  width: '2px',
                                  height: `${connectorHeight}px`,
                                }}
                              />
                              {/* Horizontal line from connector center to next round */}
                              <div
                                className="absolute bg-gray-400 z-10"
                                style={{
                                  left: `${matchBoxWidth / 2}px`,
                                  top: `${connectorY}px`,
                                  width: `${roundSpacing}px`,
                                  height: '2px',
                                  transform: 'translateY(-50%)',
                                }}
                              />
                              {/* Vertical line from horizontal line end to next match center */}
                              {/* This line should connect the horizontal line to the center of the next match */}
                              {connectorY !== nextMatchCenter && (
                                <div
                                  className="absolute bg-gray-400 z-10"
                                  style={{
                                    left: `${matchBoxWidth / 2 + roundSpacing}px`,
                                    top: `${Math.min(connectorY, nextMatchCenter)}px`,
                                    width: '2px',
                                    height: `${Math.abs(nextMatchCenter - connectorY)}px`,
                                  }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            
            {/* Winner Circle after Final - always show if final exists, even if not finished */}
            {finalMatch && (() => {
              // Find the Final round to get its position
              const finalRound = rounds.find(r => r.roundName === 'Final')
              if (!finalRound) return null
              
              const finalRoundHeight = getRoundHeight(finalRound.matches.length)
              const finalRoundTopOffset = (maxHeight - finalRoundHeight) / 2
              const finalMatchIdx = finalRound.matches.indexOf(finalMatch)
              const finalMatchTopOffset = finalRoundTopOffset + finalMatchIdx * circleSpacing * 2
              const finalMatchCenter = finalMatchTopOffset + circleSize + matchBoxHeight / 2
              
              // Winner circle should be centered at the same height as the final match center
              const winnerCircleTop = (maxHeight - circleSize) / 2
              
              return (
                <div className="flex flex-col items-center relative" style={{ minHeight: `${maxHeight}px` }}>
                  <div className="mb-4 text-center">
                    <h3 className="font-semibold text-gray-900 text-sm">Winner</h3>
                  </div>
                  <div className="relative" style={{ marginTop: `${winnerCircleTop}px` }}>
                    {/* Connecting line FROM Final */}
                    {showConnectingLines && (
                      <div 
                        className="absolute right-full top-1/2 bg-gray-400 z-10"
                        style={{ 
                          width: `${roundSpacing / 2}px`,
                          height: '2px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      />
                    )}
                    
                    {/* Winner Circle */}
                    <div
                      className={`flex items-center justify-center rounded-full border-2 transition-all ${
                        finalWinner ? 'bg-yellow-100 border-yellow-500' : 'bg-white border-gray-300 opacity-50'
                      }`}
                      style={{
                        width: `${circleSize}px`,
                        height: `${circleSize}px`,
                      }}
                      title={finalWinner ? finalWinner.teamName : 'Winner not determined yet'}
                    >
                      {finalWinner ? (
                        <span className="text-sm font-bold text-gray-900">{finalWinner.seed}</span>
                      ) : (
                        <span className="text-xs text-gray-400">?</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>
      
      {/* Legend - transparent table format */}
      {legend.length > 0 && (
        <div className="mt-8 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Legend</h4>
          <div className="inline-block bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg p-4 shadow-sm">
            <table className="w-auto">
              <tbody>
                {legend.map(({ seed, name }) => (
                  <tr key={seed} className="border-b border-gray-100 last:border-b-0">
                    <td className="text-sm font-medium text-gray-700 text-right pr-4 py-1">
                      #{seed}
                    </td>
                    <td className="text-sm text-gray-600 py-1">
                      {name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
