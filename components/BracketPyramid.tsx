'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trophy, Crown, Zap, Clock, CheckCircle } from 'lucide-react'

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
  showMetrics: 'seed' | 'wins' | 'diff'
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
  showMetrics, 
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
      
      // Правильные названия раундов
      if (roundIndex === 0) {
        roundName = totalTeams <= 4 ? 'Semi-Final' : 
                   totalTeams <= 8 ? 'Quarter-Final' : 'Round of 16'
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

  const getTeamDisplayName = (team: Team | null) => {
    if (!team) return 'TBD'
    
    let display = team.name
    if (showMetrics === 'seed' && team.seed) {
      display = `#${team.seed} ${team.name}`
    } else if (showMetrics === 'wins' && team.wins !== undefined) {
      display = `${team.name} (${team.wins}-${team.losses || 0})`
    } else if (showMetrics === 'diff' && team.pointDiff !== undefined) {
      display = `${team.name} (${team.pointDiff > 0 ? '+' : ''}${team.pointDiff})`
    }
    
    return display
  }

  const getMatchStatus = (match: Match) => {
    if (!match.games || match.games.length === 0) {
      return { status: 'scheduled', color: 'bg-gray-100 border-gray-200' }
    }
    
    const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
    const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
    
    if (totalScoreA > totalScoreB) {
      return { status: 'teamA-wins', color: 'bg-green-50 border-green-200' }
    } else if (totalScoreB > totalScoreA) {
      return { status: 'teamB-wins', color: 'bg-green-50 border-green-200' }
    } else {
      return { status: 'tie', color: 'bg-yellow-50 border-yellow-200' }
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

  const getScore = (match: Match) => {
    if (!match.games || match.games.length === 0) return null
    
    const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
    const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
    
    return `${totalScoreA} - ${totalScoreB}`
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
                <p className="text-xs text-gray-500">Round {round.roundIndex + 1}</p>
              </div>

              {/* Matches */}
              <div className="space-y-6">
                {round.matches.map((match, matchIdx) => {
                  const matchStatus = getMatchStatus(match)
                  const winner = getWinner(match)
                  const score = getScore(match)
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
                        className={`w-36 cursor-pointer ${matchStatus.color} ${
                          isHovered ? 'shadow-lg' : 'shadow-sm'
                        }`}
                        onClick={() => onMatchClick?.(match.id)}
                      >
                        <CardContent className="p-2">
                          {/* Team A */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-1">
                              {winner === match.teamA && (
                                <Crown className="h-3 w-3 text-yellow-500" />
                              )}
                              <span className={`text-xs font-medium truncate ${
                                winner === match.teamA ? 'text-green-700' : 
                                winner === match.teamB ? 'text-gray-400' : 'text-gray-900'
                              }`}>
                                {getTeamDisplayName(match.teamA)}
                              </span>
                            </div>
                            {match.teamA && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                {match.teamA.seed || '?'}
                              </Badge>
                            )}
                          </div>

                          {/* VS */}
                          <div className="text-center py-1">
                            <div className="text-xs text-gray-500">vs</div>
                            {score && (
                              <div className="text-sm font-bold text-blue-600">{score}</div>
                            )}
                          </div>

                          {/* Team B */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1">
                              {winner === match.teamB && (
                                <Crown className="h-3 w-3 text-yellow-500" />
                              )}
                              <span className={`text-xs font-medium truncate ${
                                winner === match.teamB ? 'text-green-700' : 
                                winner === match.teamA ? 'text-gray-400' : 'text-gray-900'
                              }`}>
                                {getTeamDisplayName(match.teamB)}
                              </span>
                            </div>
                            {match.teamB && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                {match.teamB.seed || '?'}
                              </Badge>
                            )}
                          </div>

                          {/* Match Status */}
                          <div className="mt-1 text-center">
                            {matchStatus.status === 'scheduled' && (
                              <Badge variant="secondary" className="text-xs px-1 py-0">
                                <Clock className="h-2 w-2 mr-1" />
                                Scheduled
                              </Badge>
                            )}
                            {matchStatus.status === 'teamA-wins' && (
                              <Badge variant="default" className="text-xs bg-green-100 text-green-800 px-1 py-0">
                                <CheckCircle className="h-2 w-2 mr-1" />
                                Complete
                              </Badge>
                            )}
                            {matchStatus.status === 'teamB-wins' && (
                              <Badge variant="default" className="text-xs bg-green-100 text-green-800 px-1 py-0">
                                <CheckCircle className="h-2 w-2 mr-1" />
                                Complete
                              </Badge>
                            )}
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

      {/* Legend */}
      <div className="mt-6 text-center">
        <div className="inline-flex items-center space-x-4 text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <Crown className="h-3 w-3 text-yellow-500" />
            <span>Winner</span>
          </div>
          <div className="flex items-center space-x-1">
            <Badge variant="outline" className="text-xs">#</Badge>
            <span>Seed</span>
          </div>
          <div className="flex items-center space-x-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            <span>Complete</span>
          </div>
        </div>
      </div>
    </div>
  )
}
