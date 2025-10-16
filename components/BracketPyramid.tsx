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
      
      // Calculate total rounds dynamically
      const totalRounds = maxRound + 1
      
      // Determine round name based on position in bracket
      if (roundIndex === 0) {
        // First round - determine based on total rounds
        if (totalRounds === 1) {
          roundName = 'Final'
        } else if (totalRounds === 2) {
          roundName = 'Semi-Final'
        } else if (totalRounds === 3) {
          roundName = 'Quarter-Final'
        } else if (totalRounds === 4) {
          roundName = 'Round of 16'
        } else if (totalRounds === 5) {
          roundName = 'Round of 32'
        } else {
          roundName = 'Round of 64'
        }
      } else if (roundIndex === maxRound) {
        // Last round is always Final
        roundName = 'Final'
      } else {
        // Middle rounds
        const roundsFromEnd = maxRound - roundIndex
        if (roundsFromEnd === 1) {
          roundName = 'Semi-Final'
        } else if (roundsFromEnd === 2) {
          roundName = 'Quarter-Final'
        } else if (roundsFromEnd === 3) {
          roundName = 'Round of 16'
        } else if (roundsFromEnd === 4) {
          roundName = 'Round of 32'
        } else {
          roundName = 'Round of 64'
        }
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
      return { status: 'scheduled', text: 'Awaiting score' }
    }
    
    const totalScoreA = match.games.reduce((sum, game) => sum + game.scoreA, 0)
    const totalScoreB = match.games.reduce((sum, game) => sum + game.scoreB, 0)
    
    if (totalScoreA > totalScoreB || totalScoreB > totalScoreA) {
      return { status: 'completed', text: 'Completed' }
    } else {
      return { status: 'tie', text: 'Tie' }
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

  const getPlacementTeams = () => {
    const finalMatch = matches.find(m => m.roundIndex === maxRound)
    const semiFinalMatches = matches.filter(m => m.roundIndex === maxRound - 1)
    
    if (!finalMatch || semiFinalMatches.length === 0) return { secondPlace: null, thirdPlace: null }
    
    const finalWinner = getWinner(finalMatch)
    const finalLoser = finalWinner === finalMatch.teamA ? finalMatch.teamB : finalMatch.teamA
    
    // Find semi-final losers
    const semiFinalLosers = semiFinalMatches
      .map(match => {
        const winner = getWinner(match)
        return winner === match.teamA ? match.teamB : match.teamA
      })
      .filter(team => team !== null)
    
    return {
      secondPlace: finalLoser,
      thirdPlace: semiFinalLosers.length > 0 ? semiFinalLosers[0] : null
    }
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-8">
        <Trophy className="h-12 w-12 mx-auto mb-2 text-gray-400" />
        <p className="text-gray-500">No playoff matches</p>
        <p className="text-sm text-gray-400">Generate playoffs to display bracket</p>
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
              </div>

              {/* Matches */}
              <div className="space-y-6">
                {round.matches.map((match, matchIdx) => {
                  const matchStatus = getMatchStatus(match)
                  const winner = getWinner(match)
                  const scores = getScores(match)
                  const isHovered = hoveredMatch === match.id
                  const isThirdPlaceMatch = (match as any).note === 'Third Place Match'
                  const isFinalMatch = round.roundName === 'Final' && !isThirdPlaceMatch
                  
                  return (
                    <div
                      key={match.id}
                      className={`relative transition-all duration-200 flex items-center ${
                        isHovered ? 'scale-105 z-10' : ''
                      }`}
                      onMouseEnter={() => setHoveredMatch(match.id)}
                      onMouseLeave={() => setHoveredMatch(null)}
                    >
                      {/* Place Label for Final Round */}
                      {round.roundName === 'Final' && (
                        <div className="flex items-center justify-center mr-4 w-8 h-32">
                          <div className="text-sm font-bold text-gray-600">
                            {isThirdPlaceMatch ? '3rd' : '1st'}
                          </div>
                        </div>
                      )}
                      {/* Match Card */}
                      <Card 
                        className={`w-48 h-32 cursor-pointer bg-white border-gray-200 rounded-lg ${
                          isHovered ? 'shadow-lg' : 'shadow-sm'
                        }`}
                        onClick={() => onMatchClick?.(match.id)}
                      >
                        <CardContent className="p-3 h-full flex flex-col justify-center">
                          {/* Team A */}
                          <div className={`flex items-center justify-between mb-3 ${
                            winner === match.teamA ? 'bg-green-50 border border-green-200 rounded-md p-1' : ''
                          }`}>
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
                              {winner === match.teamA && (
                                <Crown className="h-3 w-3 text-green-600 flex-shrink-0" />
                              )}
                              <div className="text-xs text-gray-500 font-medium">
                                #{match.teamA?.seed || '?'}
                              </div>
                              <div className={`text-sm font-medium truncate ${
                                winner === match.teamB ? 'text-gray-400' : 
                                winner === match.teamA ? 'text-green-800 font-semibold' : 
                                'text-gray-900'
                              }`} title={match.teamA?.name || 'TBD'}>
                                {match.teamA?.name || 'TBD'}
                              </div>
                            </div>
                            <div className={`text-lg font-semibold font-mono tabular-nums text-right ${
                              winner === match.teamA ? 'text-green-800' : 
                              winner === match.teamB ? 'text-gray-400' : 
                              'text-gray-900'
                            }`}>
                              {scores.scoreA !== null ? scores.scoreA : '—'}
                            </div>
                          </div>

                          {/* Team B */}
                          <div className={`flex items-center justify-between ${
                            winner === match.teamB ? 'bg-green-50 border border-green-200 rounded-md p-1' : ''
                          }`}>
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
                              {winner === match.teamB && (
                                <Crown className="h-3 w-3 text-green-600 flex-shrink-0" />
                              )}
                              <div className="text-xs text-gray-500 font-medium">
                                #{match.teamB?.seed || '?'}
                              </div>
                              <div className={`text-sm font-medium truncate ${
                                winner === match.teamA ? 'text-gray-400' : 
                                winner === match.teamB ? 'text-green-800 font-semibold' : 
                                'text-gray-900'
                              }`} title={match.teamB?.name || 'TBD'}>
                                {match.teamB?.name || 'TBD'}
                              </div>
                            </div>
                            <div className={`text-lg font-semibold font-mono tabular-nums text-right ${
                              winner === match.teamB ? 'text-green-800' : 
                              winner === match.teamA ? 'text-gray-400' : 
                              'text-gray-900'
                            }`}>
                              {scores.scoreB !== null ? scores.scoreB : '—'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>


                      {/* Connecting Lines to Next Round - Removed per user request */}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        
        {/* Final Standings Plaques */}
        {(() => {
          const finalMatch = matches.find(m => m.roundIndex === maxRound && (m as any).note !== 'Third Place Match')
          if (!finalMatch) return null
          
          const winner = getWinner(finalMatch)
          const { secondPlace, thirdPlace } = getPlacementTeams()
          
          return (
            <div className="ml-8 flex flex-col items-center space-y-2">
              {/* Champion */}
              {winner && (
                <div className="flex items-center space-x-1 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded-full">
                  <Trophy className="h-3 w-3 text-yellow-600" />
                  <span className="text-xs text-yellow-700 font-medium">Champion: {winner.name}</span>
                </div>
              )}
              
              {/* 2nd Place */}
              {secondPlace && (
                <div className="flex items-center space-x-1 bg-gray-50 border border-gray-200 px-2 py-1 rounded-full">
                  <Trophy className="h-3 w-3 text-gray-600" />
                  <span className="text-xs text-gray-700 font-medium">2nd: {secondPlace.name}</span>
                </div>
              )}
              
              {/* 3rd Place */}
              {thirdPlace && (
                <div className="flex items-center space-x-1 bg-orange-50 border border-orange-200 px-2 py-1 rounded-full">
                  <Trophy className="h-3 w-3 text-orange-600" />
                  <span className="text-xs text-orange-700 font-medium">3rd: {thirdPlace.name}</span>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
