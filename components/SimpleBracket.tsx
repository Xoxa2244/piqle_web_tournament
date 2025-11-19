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

const MATCH_WIDTH = 200
const MATCH_HEIGHT = 100
const ROUND_GAP = 80
const MATCH_GAP = 20

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

  // Calculate positions for all matches
  const matchPositions = useMemo(() => {
    const positions = new Map<string, MatchPosition>()
    let currentX = 50

    matchesByRound.forEach(([round, roundMatches]) => {
      const roundHeight = roundMatches.length * (MATCH_HEIGHT + MATCH_GAP) - MATCH_GAP
      let currentY = 50

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
  }, [matchesByRound])

  // Store positions in ref for SVG calculations
  useEffect(() => {
    matchPositionsRef.current = matchPositions
  }, [matchPositions])

  // Calculate SVG dimensions
  const svgDimensions = useMemo(() => {
    if (matchPositions.size === 0) return { width: 0, height: 0 }
    
    const maxX = Math.max(...Array.from(matchPositions.values()).map(p => p.x + p.width))
    const maxY = Math.max(...Array.from(matchPositions.values()).map(p => p.y + p.height))
    
    return {
      width: maxX + 50,
      height: maxY + 50,
    }
  }, [matchPositions])

  // Generate connection lines between rounds
  const connectionLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

    matchesByRound.forEach(([round, roundMatches], roundIndex) => {
      if (roundIndex === matchesByRound.length - 1) return // Last round, no connections

      const nextRound = matchesByRound[roundIndex + 1]
      if (!nextRound) return

      const [nextRoundNumber, nextRoundMatches] = nextRound

      roundMatches.forEach((match, matchIndex) => {
        const currentPos = matchPositions.get(match.id)
        if (!currentPos) return

        // Calculate which match in next round this connects to
        const nextMatchIndex = Math.floor(matchIndex / 2)
        const nextMatch = nextRoundMatches[nextMatchIndex]
        if (!nextMatch) return

        const nextPos = matchPositions.get(nextMatch.id)
        if (!nextPos) return

        // Start point: right center of current match
        const x1 = currentPos.x + currentPos.width
        const y1 = currentPos.y + currentPos.height / 2

        // End point: left center of next match (top or bottom based on matchIndex)
        const x2 = nextPos.x
        const y2 = matchIndex % 2 === 0 
          ? nextPos.y + nextPos.height / 4  // Top half
          : nextPos.y + (nextPos.height * 3) / 4  // Bottom half

        lines.push({ x1, y1, x2, y2 })
      })
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
      <div style={{ position: 'relative', width: `${svgDimensions.width}px`, height: `${svgDimensions.height}px`, minHeight: '600px' }}>
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
          {connectionLines.map((line, index) => (
            <g key={index}>
              {/* Horizontal line */}
              <line
                x1={line.x1}
                y1={line.y1}
                x2={(line.x1 + line.x2) / 2}
                y2={line.y1}
                stroke="#CBD5E0"
                strokeWidth="2"
              />
              {/* Vertical line */}
              <line
                x1={(line.x1 + line.x2) / 2}
                y1={line.y1}
                x2={(line.x1 + line.x2) / 2}
                y2={line.y2}
                stroke="#CBD5E0"
                strokeWidth="2"
              />
              {/* Final horizontal line */}
              <line
                x1={(line.x1 + line.x2) / 2}
                y1={line.y2}
                x2={line.x2}
                y2={line.y2}
                stroke="#CBD5E0"
                strokeWidth="2"
              />
            </g>
          ))}
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
                {/* Round header */}
                <div className="mb-4 text-center" style={{ height: '40px' }}>
                  <h3 className="text-lg font-semibold text-gray-900">{roundName}</h3>
                </div>

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
                          className={`w-[${MATCH_WIDTH}px] cursor-pointer transition-shadow hover:shadow-lg ${
                            isFinished ? 'border-green-200 bg-green-50/50' : 'border-gray-200'
                          }`}
                          onClick={() => match.matchId && onMatchClick?.(match.matchId)}
                          style={{ width: `${MATCH_WIDTH}px` }}
                        >
                          <CardContent className="p-3">
                            {/* Team A */}
                            <div
                              className={`flex items-center justify-between mb-2 p-2 rounded ${
                                winnerId === match.left.teamId
                                  ? 'bg-green-100 border-2 border-green-500'
                                  : isFinished && winnerId !== match.left.teamId
                                  ? 'bg-gray-50 opacity-50'
                                  : 'bg-blue-50'
                              }`}
                            >
                              <div className="flex items-center space-x-2 min-w-0 flex-1">
                                <span className="text-xs text-gray-500 font-medium flex-shrink-0">
                                  #{match.left.seed || '?'}
                                </span>
                                <span
                                  className={`text-sm font-medium truncate ${
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
                                <span className="text-sm font-semibold text-blue-600 flex-shrink-0 ml-2">
                                  {scoreA}
                                </span>
                              )}
                            </div>

                            {/* VS divider */}
                            <div className="text-center text-xs text-gray-400 my-1">vs</div>

                            {/* Team B */}
                            <div
                              className={`flex items-center justify-between p-2 rounded ${
                                winnerId === match.right.teamId
                                  ? 'bg-green-100 border-2 border-green-500'
                                  : isFinished && winnerId !== match.right.teamId
                                  ? 'bg-gray-50 opacity-50'
                                  : 'bg-blue-50'
                              }`}
                            >
                              <div className="flex items-center space-x-2 min-w-0 flex-1">
                                <span className="text-xs text-gray-500 font-medium flex-shrink-0">
                                  #{match.right.seed || '?'}
                                </span>
                                <span
                                  className={`text-sm font-medium truncate ${
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
                                <span className="text-sm font-semibold text-blue-600 flex-shrink-0 ml-2">
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
  )
}

