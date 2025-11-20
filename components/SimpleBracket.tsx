'use client'

import { useMemo, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface BracketMatch {
  id: string
  round: number
  position: number
  left: { seed: number; teamId?: string; teamName?: string; isBye?: boolean }
  right: { seed: number; teamId?: string; teamName?: string; isBye?: boolean }
  status: 'scheduled' | 'in_progress' | 'finished'
  winnerSeed?: number
  winnerTeamId?: string
  winnerTeamName?: string
  matchId?: string
  games?: Array<{ scoreA: number; scoreB: number }>
}

interface SimpleBracketProps {
  matches: BracketMatch[]
  onMatchClick?: (matchId: string) => void
}

interface MatchPosition {
  x: number
  y: number
  width: number
  height: number
}

const MATCH_WIDTH = 140
const MATCH_HEIGHT = 70
const ROUND_GAP = 180
const MATCH_GAP = 12
const HEADER_HEIGHT = 0 // No headers

export default function SimpleBracket({ matches, onMatchClick }: SimpleBracketProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const matchPositionsRef = useRef<Map<string, MatchPosition>>(new Map())

  // Group matches by round
  const matchesByRound = useMemo(() => {
    const grouped = new Map<number, BracketMatch[]>()
    
    matches.forEach(match => {
      if (!grouped.has(match.round)) {
        grouped.set(match.round, [])
      }
      grouped.get(match.round)!.push(match)
    })

    // Sort matches in each round by position
    grouped.forEach((roundMatches) => {
      roundMatches.sort((a, b) => a.position - b.position)
    })

    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])
  }, [matches])

  // Calculate maximum round height for centering
  const maxRoundHeight = useMemo(() => {
    if (matchesByRound.length === 0) return 0
    
    return Math.max(...matchesByRound.map(([_, roundMatches]) => {
      return roundMatches.length * (MATCH_HEIGHT + MATCH_GAP) - MATCH_GAP
    }))
  }, [matchesByRound])

  // Calculate positions for all matches (centered vertically)
  const matchPositions = useMemo(() => {
    const positions = new Map<string, MatchPosition>()
    let currentX = 30

    matchesByRound.forEach(([round, roundMatches]) => {
      const roundHeight = roundMatches.length * (MATCH_HEIGHT + MATCH_GAP) - MATCH_GAP
      // Center this round vertically relative to the tallest round
      const verticalOffset = (maxRoundHeight - roundHeight) / 2
      let currentY = HEADER_HEIGHT + verticalOffset

      roundMatches.forEach((match) => {
        positions.set(match.id, {
          x: currentX,
          y: currentY,
          width: MATCH_WIDTH,
          height: MATCH_HEIGHT,
        })
        currentY += MATCH_HEIGHT + MATCH_GAP
      })

      currentX += MATCH_WIDTH + ROUND_GAP
    })

    return positions
  }, [matchesByRound, maxRoundHeight])

  // Store positions in ref for SVG calculations
  useEffect(() => {
    matchPositionsRef.current = matchPositions
  }, [matchPositions])

  // Calculate SVG dimensions
  const svgDimensions = useMemo(() => {
    if (matchPositions.size === 0) return { width: 0, height: 0 }
    
    const maxX = Math.max(...Array.from(matchPositions.values()).map(p => p.x + p.width))
    const totalHeight = HEADER_HEIGHT + maxRoundHeight + 30
    
    return {
      width: maxX + 30,
      height: totalHeight,
    }
  }, [matchPositions, maxRoundHeight])

  // Generate connection lines between rounds
  const connectionLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

    matchesByRound.forEach(([round, roundMatches], roundIndex) => {
      if (roundIndex === matchesByRound.length - 1) return // Last round, no connections

      const nextRound = matchesByRound[roundIndex + 1]
      if (!nextRound) return

      const [nextRoundNumber, nextRoundMatches] = nextRound

      // Connect pairs of matches from current round to next round
      for (let i = 0; i < roundMatches.length; i += 2) {
        const match1 = roundMatches[i]
        const match2 = roundMatches[i + 1]
        const nextMatchIndex = Math.floor(i / 2)
        const nextMatch = nextRoundMatches[nextMatchIndex]

        if (!match1 || !nextMatch) continue

        const currentPos1 = matchPositions.get(match1.id)
        if (!currentPos1) continue

        const nextPos = matchPositions.get(nextMatch.id)
        if (!nextPos) continue

        // Connection from match1 (top match) to next match (top slot)
        // Start: right center of match1
        const x1_1 = currentPos1.x + currentPos1.width
        const y1_1 = currentPos1.y + currentPos1.height / 2
        // End: left center of top half of next match
        const x2_1 = nextPos.x
        const y2_1 = nextPos.y + nextPos.height / 4

        lines.push({ x1: x1_1, y1: y1_1, x2: x2_1, y2: y2_1 })

        // Connection from match2 (bottom match) to next match (bottom slot) if it exists
        if (match2) {
          const currentPos2 = matchPositions.get(match2.id)
          if (currentPos2) {
            // Start: right center of match2
            const x1_2 = currentPos2.x + currentPos2.width
            const y1_2 = currentPos2.y + currentPos2.height / 2
            // End: left center of bottom half of next match
            const x2_2 = nextPos.x
            const y2_2 = nextPos.y + (nextPos.height * 3) / 4

            lines.push({ x1: x1_2, y1: y1_2, x2: x2_2, y2: y2_2 })
          }
        } else {
          // If match2 doesn't exist (odd number of matches), connect match1 to bottom slot as well
          // This handles BYE cases
          const x1_2 = currentPos1.x + currentPos1.width
          const y1_2 = currentPos1.y + currentPos1.height / 2
          const x2_2 = nextPos.x
          const y2_2 = nextPos.y + (nextPos.height * 3) / 4

          lines.push({ x1: x1_2, y1: y1_2, x2: x2_2, y2: y2_2 })
        }
      }
    })

    return lines
  }, [matchesByRound, matchPositions])

  if (matches.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Bracket not started yet</p>
        <p className="text-sm text-gray-400">Matches will appear here once bracket begins</p>
      </div>
    )
  }

  const getRoundName = (round: number): string => {
    if (round === 0) return 'Play-In'
    
    const totalRounds = Math.max(...matchesByRound.map(([r]) => r))
    const roundsFromEnd = totalRounds - round + 1
    const teamsInRound = Math.pow(2, roundsFromEnd)

    if (teamsInRound === 2) return 'Final'
    if (teamsInRound === 4) return 'Semi-Finals'
    if (teamsInRound === 8) return 'Quarter-Finals'
    if (teamsInRound === 16) return 'Round of 16'
    if (teamsInRound === 32) return 'Round of 32'
    
    return `Round ${round}`
  }

  const getScore = (match: BracketMatch): { scoreA: number | null; scoreB: number | null } => {
    if (!match.games || match.games.length === 0) {
      return { scoreA: null, scoreB: null }
    }
    
    const totalScoreA = match.games.reduce((sum, g) => sum + (g.scoreA || 0), 0)
    const totalScoreB = match.games.reduce((sum, g) => sum + (g.scoreB || 0), 0)
    
    return {
      scoreA: totalScoreA > 0 ? totalScoreA : null,
      scoreB: totalScoreB > 0 ? totalScoreB : null,
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-auto">
      <div className="flex items-center justify-center min-h-full py-8">
        <div style={{ position: 'relative', width: `${svgDimensions.width}px`, height: `${svgDimensions.height}px` }}>
        {/* SVG overlay for connection lines */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {connectionLines.map((line, index) => {
            // Calculate midpoint for vertical line
            const midX = (line.x1 + line.x2) / 2
            
            return (
              <g key={index}>
                {/* Horizontal line from source match */}
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={midX}
                  y2={line.y1}
                  stroke="#CBD5E0"
                  strokeWidth="2"
                />
                {/* Vertical line connecting the two horizontal segments */}
                <line
                  x1={midX}
                  y1={line.y1}
                  x2={midX}
                  y2={line.y2}
                  stroke="#CBD5E0"
                  strokeWidth="2"
                />
                {/* Horizontal line to target match */}
                <line
                  x1={midX}
                  y1={line.y2}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#CBD5E0"
                  strokeWidth="2"
                />
              </g>
            )
          })}
        </svg>

        {/* Matches */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          {matchesByRound.map(([round, roundMatches]) => {
            const roundName = getRoundName(round)
            const firstMatchPos = matchPositions.get(roundMatches[0]?.id)
            
            return (
              <div
                key={round}
                style={{
                  position: 'absolute',
                  left: `${firstMatchPos?.x || 0}px`,
                  top: 0,
                }}
              >
                {/* Matches in this round */}
                <div>
                  {roundMatches.map((match) => {
                    const pos = matchPositions.get(match.id)
                    if (!pos) return null

                    const isFinished = match.status === 'finished'
                    const winnerId = match.winnerTeamId
                    const { scoreA, scoreB } = getScore(match)

                    return (
                      <div
                        key={match.id}
                        style={{
                          position: 'absolute',
                          top: `${pos.y}px`,
                          left: 0,
                        }}
                      >
                        <Card
                          className={`cursor-pointer transition-shadow hover:shadow-lg ${
                            isFinished ? 'border-green-200 bg-green-50/50' : 'border-gray-200'
                          }`}
                          onClick={() => match.matchId && onMatchClick?.(match.matchId)}
                          style={{ width: `${MATCH_WIDTH}px` }}
                        >
                          <CardContent className="p-2">
                            {/* Team A */}
                            <div
                              className={`flex items-center justify-between mb-1 p-1.5 rounded ${
                                winnerId === match.left.teamId
                                  ? 'bg-green-100 border-2 border-green-500'
                                  : isFinished && winnerId !== match.left.teamId
                                  ? 'bg-gray-50 opacity-50'
                                  : 'bg-blue-50'
                              }`}
                            >
                              <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                                <span className="text-[10px] text-gray-500 font-medium flex-shrink-0">
                                  #{match.left.seed || '?'}
                                </span>
                                <span
                                  className={`text-xs font-medium truncate ${
                                    winnerId === match.left.teamId
                                      ? 'text-green-800 font-semibold'
                                      : winnerId === match.right.teamId
                                      ? 'text-gray-400'
                                      : 'text-gray-900'
                                  }`}
                                  title={match.left.teamName || (match.left.isBye ? 'BYE' : 'TBD')}
                                >
                                  {match.left.isBye
                                    ? 'BYE'
                                    : match.left.teamName || 'TBD'}
                                </span>
                              </div>
                              {scoreA !== null && (
                                <span className="text-xs font-semibold text-blue-600 flex-shrink-0 ml-1.5">
                                  {scoreA}
                                </span>
                              )}
                            </div>

                            {/* VS divider */}
                            <div className="text-center text-[10px] text-gray-400 my-0.5">vs</div>

                            {/* Team B */}
                            <div
                              className={`flex items-center justify-between p-1.5 rounded ${
                                winnerId === match.right.teamId
                                  ? 'bg-green-100 border-2 border-green-500'
                                  : isFinished && winnerId !== match.right.teamId
                                  ? 'bg-gray-50 opacity-50'
                                  : 'bg-blue-50'
                              }`}
                            >
                              <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                                <span className="text-[10px] text-gray-500 font-medium flex-shrink-0">
                                  #{match.right.seed || '?'}
                                </span>
                                <span
                                  className={`text-xs font-medium truncate ${
                                    winnerId === match.right.teamId
                                      ? 'text-green-800 font-semibold'
                                      : winnerId === match.left.teamId
                                      ? 'text-gray-400'
                                      : 'text-gray-900'
                                  }`}
                                  title={match.right.teamName || (match.right.isBye ? 'BYE' : 'TBD')}
                                >
                                  {match.right.isBye
                                    ? 'BYE'
                                    : match.right.teamName || 'TBD'}
                                </span>
                              </div>
                              {scoreB !== null && (
                                <span className="text-xs font-semibold text-blue-600 flex-shrink-0 ml-1.5">
                                  {scoreB}
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        </div>
      </div>
    </div>
  )
}

