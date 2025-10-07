'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Crown, Clock, CheckCircle } from 'lucide-react'

interface Team {
  id: string
  name: string
  seed?: number
  wins?: number
  losses?: number
  pointDiff?: number
}

interface Match {
  id: string
  teamA: Team | null
  teamB: Team | null
  games: Array<{ scoreA: number; scoreB: number }>
  roundIndex: number
  stage: string
}

interface BracketPyramidProps {
  matches: Match[]
  showConnectingLines: boolean
  onMatchClick?: (matchId: string) => void
}

interface BracketRound {
  roundIndex: number
  roundName: string
  matches: Match[]
}

export default function BracketPyramid({ 
  matches, 
  showConnectingLines, 
  onMatchClick 
}: BracketPyramidProps) {
  const [hoveredMatch, setHoveredMatch] = useState<string | null>(null)

  // Group matches by round
  const rounds: BracketRound[] = []
  const maxRound = Math.max(...matches.map(m => m.roundIndex), 0)
  
  for (let roundIndex = 0; roundIndex <= maxRound; roundIndex++) {
    const roundMatches = matches.filter(m => m.roundIndex === roundIndex)
    if (roundMatches.length > 0) {
      let roundName = ''
      const totalTeams = matches.length * 2 // Approximate
      
      // Правильные названия раундов согласно ТЗ
      if (roundIndex === 0) {
        if (totalTeams <= 4) {
          roundName = 'Semi-Final'
        } else if (totalTeams <= 8) {
          roundName = 'Quarter-Final'
        } else if (totalTeams <= 16) {
          roundName = 'Round of 16'
        } else if (totalTeams <= 32) {
          roundName = 'Round of 32'
        } else {
          roundName = 'Round of 64'
        }
      } else if (roundIndex === 1) {
        roundName = totalTeams <= 4 ? 'Final' : 'Semi-Final'
      } else if (roundIndex === 2) {
        roundName = totalTeams <= 4 ? 'Champion' : 'Final'
      } else if (roundIndex === 3) {
        roundName = 'Champion'
      } else {
        roundName = `Round ${roundIndex + 1}`
      }
      
      rounds.push({
        roundIndex,
        roundName,
        matches: roundMatches
      })
    }
  }

  const getMatchStatus = (match: Match) => {
    if (!match.games || match.games.length === 0) {
      return { status: 'scheduled', text: 'Ожидает счёта' }
    }
    
    const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
    const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
    
    if (totalScoreA > totalScoreB || totalScoreB > totalScoreA) {
      return { status: 'completed', text: 'Завершён' }
    } else {
      return { status: 'tie', text: 'Ничья' }
    }
  }

  const getWinner = (match: Match) => {
    if (!match.games || match.games.length === 0) return null
    
    const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
    const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
    
    if (totalScoreA > totalScoreB) return match.teamA
    if (totalScoreB > totalScoreA) return match.teamB
    return null
  }

  const getScores = (match: Match) => {
    if (!match.games || match.games.length === 0) return { scoreA: null, scoreB: null }
    
    const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
    const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
    
    return { scoreA: totalScoreA, scoreB: totalScoreB }
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-8">
        <Trophy className="h-12 w-12 mx-auto mb-2 text-gray-400" />
        <p className="text-gray-500">Нет матчей плей-офф</p>
        <p className="text-sm text-gray-400">Сгенерируйте плей-офф для отображения сетки</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex justify-center min-w-max">
        <div className="flex items-start space-x-8 py-4">
          {rounds.map((round, roundIdx) => (
            <div key={round.roundIndex} className="flex flex-col items-center relative">
              {/* Round Header */}
              <div className="mb-4 text-center">
                <h3 className="font-semibold text-gray-900">{round.roundName}</h3>
                {round.roundName === 'Champion' && (
                  <div className="flex items-center justify-center mt-1">
                    <Trophy className="h-4 w-4 text-yellow-500 mr-1" />
                    <span className="text-xs text-yellow-600 font-medium">Champion</span>
                  </div>
                )}
              </div>

              {/* Matches */}
              <div className="space-y-6">
                {round.matches.map((match, matchIdx) => {
                  const matchStatus = getMatchStatus(match)
                  const winner = getWinner(match)
                  const scores = getScores(match)
                  const isHovered = hoveredMatch === match.id
                  
                  return (
                    <div
                      key={match.id}
                      className={`relative transition-all duration-200 ${
                        isHovered ? 'scale-105 z-10' : ''
                      }`}
                      onMouseEnter={() => setHoveredMatch(match.id)}
                      onMouseLeave={() => setHoveredMatch(null)}
                    >
                      {/* Match Card */}
                      <Card 
                        className={`w-40 h-32 cursor-pointer bg-white border border-gray-200 ${
                          isHovered ? 'shadow-lg' : 'shadow-sm'
                        }`}
                        onClick={() => onMatchClick?.(match.id)}
                      >
                        <CardContent className="p-3 h-full flex flex-col">
                          {/* Header - Match Status */}
                          <div className="flex justify-between items-center mb-2">
                            <div className="text-xs text-gray-500 font-medium">Плей-офф</div>
                            <div className={`text-xs px-2 py-1 rounded-full ${
                              matchStatus.status === 'scheduled' 
                                ? 'text-gray-500 bg-gray-100' 
                                : 'text-green-700 bg-green-50 border border-green-200'
                            }`}>
                              {matchStatus.text}
                            </div>
                          </div>

                          {/* Body - Teams and Scores */}
                          <div className="flex-1 space-y-2">
                            {/* Team A */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2 min-w-0 flex-1">
                                <div className="text-xs text-gray-500 font-medium w-6">
                                  #{match.teamA?.seed || '?'}
                                </div>
                                <div className={`text-sm font-medium truncate ${
                                  winner === match.teamA ? 'text-gray-900' : 
                                  winner === match.teamB ? 'text-gray-500' : 
                                  'text-gray-900'
                                }`} title={match.teamA?.name || 'TBD'}>
                                  {match.teamA?.name || 'TBD'}
                                </div>
                                {winner === match.teamA && (
                                  <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    Победитель
                                  </div>
                                )}
                              </div>
                              <div className={`text-xl font-semibold font-mono tabular-nums ${
                                winner === match.teamA ? 'text-blue-600' : 
                                winner === match.teamB ? 'text-gray-400' : 
                                'text-blue-600'
                              }`}>
                                {scores.scoreA !== null ? scores.scoreA : '—'}
                              </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-gray-100"></div>

                            {/* Team B */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2 min-w-0 flex-1">
                                <div className="text-xs text-gray-500 font-medium w-6">
                                  #{match.teamB?.seed || '?'}
                                </div>
                                <div className={`text-sm font-medium truncate ${
                                  winner === match.teamB ? 'text-gray-900' : 
                                  winner === match.teamA ? 'text-gray-500' : 
                                  'text-gray-900'
                                }`} title={match.teamB?.name || 'TBD'}>
                                  {match.teamB?.name || 'TBD'}
                                </div>
                                {winner === match.teamB && (
                                  <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    Победитель
                                  </div>
                                )}
                              </div>
                              <div className={`text-xl font-semibold font-mono tabular-nums ${
                                winner === match.teamB ? 'text-blue-600' : 
                                winner === match.teamA ? 'text-gray-400' : 
                                'text-blue-600'
                              }`}>
                                {scores.scoreB !== null ? scores.scoreB : '—'}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Connecting Lines to Next Round */}
                      {showConnectingLines && roundIdx < rounds.length - 1 && (
                        <div className="absolute top-1/2 -right-4 w-8 h-px bg-gray-400 transform -translate-y-1/2 z-0" />
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
