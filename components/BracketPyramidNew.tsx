'use client'

import { useMemo, useEffect, useState } from 'react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { buildElkBracketGraph, type BracketMatch as ElkBracketMatch } from './elk-bracket-client'

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
  totalTeams?: number
  bracketSize?: number
}

interface BracketRound {
  round: number
  roundName: string
  matches: BracketMatch[]
}

export default function BracketPyramidNew({ 
  matches, 
  showConnectingLines = true, 
  onMatchClick,
  totalTeams,
  bracketSize
}: BracketPyramidNewProps) {
  // Calculate totalTeams and bracketSize if not provided
  const calculatedTotalTeams = totalTeams || matches.reduce((max, m) => {
    return Math.max(max, m.left.seed || 0, m.right.seed || 0)
  }, 0)
  
  const calculatedBracketSize = bracketSize || (() => {
    const n = calculatedTotalTeams
    if (n <= 1) return 1
    return Math.pow(2, Math.ceil(Math.log2(n)))
  })()
  
  // Initialize ELK
  const [elk] = useState(() => new ELK())
  
  // Build ELK graph and calculate layout
  const [layoutedGraph, setLayoutedGraph] = useState<any>(null)
  
  useEffect(() => {
    if (matches.length === 0) {
      setLayoutedGraph(null)
      return
    }
    
    // Build ELK graph
    const graph = buildElkBracketGraph(matches, calculatedTotalTeams, calculatedBracketSize)
    
    // Calculate layout
    elk.layout(graph)
      .then((layouted) => {
        setLayoutedGraph(layouted)
      })
      .catch((error) => {
        console.error('[BracketPyramidNew] ELK layout error:', error)
        setLayoutedGraph(null)
      })
  }, [matches, calculatedTotalTeams, calculatedBracketSize, elk])
  // Group matches by round
  const rounds: BracketRound[] = useMemo(() => {
    const roundsMap = new Map<number, BracketMatch[]>()
    const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0
    
    for (let round = 0; round <= maxRound; round++) {
      const roundMatches = matches
        .filter(m => m.round === round)
        .sort((a, b) => a.position - b.position)
      if (roundMatches.length > 0) {
        let roundName = ''
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
        roundsMap.set(round, roundMatches)
      }
    }
    
    return Array.from(roundsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, matches]) => ({
        round,
        roundName: round === 0 ? 'Play-In' : 
                   round === maxRound ? 'Final' :
                   maxRound - round === 1 ? 'Semi-Finals' :
                   maxRound - round === 2 ? 'Quarter-Finals' :
                   `Round ${round}`,
        matches
      }))
  }, [matches])
  
  // Build legend: seed number -> team name mapping
  const legend = useMemo(() => {
    const seedMap = new Map<number, string>()
    
    matches.forEach(match => {
      if (match.left.seed > 0 && !match.left.isBye) {
        if (match.left.teamName) {
          seedMap.set(match.left.seed, match.left.teamName)
        } else if (!seedMap.has(match.left.seed)) {
          seedMap.set(match.left.seed, '?')
        }
      }
      
      if (match.right.seed > 0 && !match.right.isBye) {
        if (match.right.teamName) {
          seedMap.set(match.right.seed, match.right.teamName)
        } else if (!seedMap.has(match.right.seed)) {
          seedMap.set(match.right.seed, '?')
        }
      }
      
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
  
  // Get seed display for a slot
  const getSeedDisplay = (slot: SeedSlot): number | null => {
    if (slot.isBye) return null
    if (slot.seed > 0) return slot.seed
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
  
  // Calculate deterministic layout dimensions
  const circleSize = 36
  const matchSpacing = 60 // Vertical spacing between matches
  const roundSpacing = 180 // Horizontal spacing between rounds
  const matchHeight = 80 // Height of a match (circle + line + circle)
  
  // Calculate max height for centering
  const maxMatches = Math.max(...rounds.map(r => r.matches.length))
  const maxHeight = maxMatches > 0 ? (maxMatches - 1) * matchSpacing + matchHeight : matchHeight
  
  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <div className="flex justify-start min-w-max py-4">
          {rounds.map((round, roundIdx) => {
            const roundHeight = round.matches.length > 0 
              ? (round.matches.length - 1) * matchSpacing + matchHeight 
              : matchHeight
            const roundTopOffset = (maxHeight - roundHeight) / 2
            
            return (
              <div 
                key={round.round} 
                className="flex flex-col items-center relative"
                style={{ 
                  minHeight: `${maxHeight}px`,
                  width: `${roundSpacing}px`,
                  marginRight: roundIdx < rounds.length - 1 ? '0' : '0'
                }}
              >
                {/* Round Header */}
                <div className="mb-3 text-center">
                  <h3 className="font-semibold text-gray-900 text-sm">{round.roundName}</h3>
                </div>
                
                {/* Matches */}
                <div 
                  className="relative"
                  style={{ 
                    minHeight: `${maxHeight}px`,
                    width: '100%'
                  }}
                >
                  {round.matches.map((match, matchIdx) => {
                    const leftSeed = getSeedDisplay(match.left)
                    const rightSeed = getSeedDisplay(match.right)
                    const y = roundTopOffset + matchIdx * matchSpacing
                    const matchCenterY = y + matchHeight / 2
                    
                    return (
                      <div key={match.id}>
                        {/* Match container */}
                        <div
                          className="absolute flex flex-col items-center"
                          style={{
                            top: `${y}px`,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: `${circleSize * 2}px`,
                          }}
                        >
                          {/* Top circle (left slot) */}
                          <div
                            className={`flex items-center justify-center rounded-full border-2 transition-all ${
                              match.status === 'finished' && match.winnerTeamId === match.left.teamId
                                ? 'bg-green-100 border-green-500'
                                : match.left.isBye
                                ? 'bg-white border-gray-300 opacity-50'
                                : leftSeed !== null
                                ? 'bg-blue-50 border-blue-300'
                                : 'bg-white border-gray-300'
                            } cursor-pointer`}
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
                          
                          {/* Vertical line connecting circles */}
                          <div 
                            className="bg-gray-400"
                            style={{ 
                              width: '2px',
                              height: `${matchHeight - circleSize * 2}px`,
                              margin: '4px 0',
                            }}
                          />
                          
                          {/* Bottom circle (right slot) */}
                          <div
                            className={`flex items-center justify-center rounded-full border-2 transition-all ${
                              match.status === 'finished' && match.winnerTeamId === match.right.teamId
                                ? 'bg-green-100 border-green-500'
                                : match.right.isBye
                                ? 'bg-white border-gray-300 opacity-50'
                                : rightSeed !== null
                                ? 'bg-blue-50 border-blue-300'
                                : 'bg-white border-gray-300'
                            } cursor-pointer`}
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
                </div>
              </div>
            )
          })}
          
          {/* Winner Circle after Final */}
          {(() => {
            const finalRound = rounds.find(r => r.roundName === 'Final')
            if (!finalRound || finalRound.matches.length === 0) return null
            
            const finalMatch = finalRound.matches[0]
            const finalWinner = finalMatch.status === 'finished' || finalMatch.winnerTeamId ? {
              seed: finalMatch.winnerSeed || finalMatch.left.seed || finalMatch.right.seed || 0,
              teamName: finalMatch.winnerTeamName || finalMatch.left.teamName || finalMatch.right.teamName || '?'
            } : null
            
            const finalRoundHeight = (finalRound.matches.length - 1) * matchSpacing + matchHeight
            const finalRoundTopOffset = (maxHeight - finalRoundHeight) / 2
            const finalMatchY = finalRoundTopOffset
            const finalMatchCenterY = finalMatchY + matchHeight / 2
            const winnerY = finalMatchCenterY - circleSize / 2
            
            return (
              <div 
                className="flex flex-col items-center relative"
                style={{ 
                  minHeight: `${maxHeight}px`,
                  width: `${roundSpacing}px`,
                }}
              >
                <div className="mb-3 text-center">
                  <h3 className="font-semibold text-gray-900 text-sm">Winner</h3>
                </div>
                <div 
                  className="relative"
                  style={{ marginTop: `${winnerY}px` }}
                >
                  {/* Connecting line from Final */}
                  {showConnectingLines && (
                    <div 
                      className="absolute right-full top-1/2 bg-gray-400"
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
                    className={`flex items-center justify-center rounded-full border-2 ${
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
