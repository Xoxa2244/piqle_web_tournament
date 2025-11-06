'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { trpc } from '@/lib/trpc'
import { X, RefreshCw, Trophy } from 'lucide-react'
import { useMemo } from 'react'
import BracketPyramidNew from '@/components/BracketPyramidNew'

interface BracketModalProps {
  isOpen: boolean
  onClose: () => void
  divisionId: string
  isPublic?: boolean
}

interface MatchNode {
  matchId: string | null
  roundIndex: number
  teamA: { id: string; name: string; seed?: number }
  teamB: { id: string; name: string; seed?: number }
  isCompleted: boolean
  winner: { id: string; name: string } | null
}

// Type for BracketMatch from API
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
  nextMatchId?: string
  nextSlot?: 'left' | 'right'
  matchId?: string
  games?: Array<{ scoreA: number; scoreB: number }>
}

export default function BracketModal({
  isOpen,
  onClose,
  divisionId,
  isPublic = false
}: BracketModalProps) {
  const bracketQuery = isPublic
    ? (trpc as any).public.getBracketPublic.useQuery(
        { divisionId },
        { 
          enabled: isOpen && !!divisionId,
          retry: 1,
          refetchOnWindowFocus: false,
        }
      )
    : trpc.standings.getBracket.useQuery(
        { divisionId },
        { 
          enabled: isOpen && !!divisionId,
          retry: 1,
          refetchOnWindowFocus: false,
        }
      )
  
  const { data: bracketData, refetch, isLoading, isError, error } = bracketQuery

  // Use new structure if available, otherwise fall back to old structure
  const allMatches: BracketMatch[] | null = useMemo(() => {
    if (!bracketData) return null
    
    // Check if we have the new allMatches structure
    if ((bracketData as any).allMatches && Array.isArray((bracketData as any).allMatches)) {
      return (bracketData as any).allMatches as BracketMatch[]
    }
    
    // Fall back to old structure - convert to new format
    const oldMatches: BracketMatch[] = []
    
    // Add play-in matches
    if (bracketData.playInBracket && Array.isArray(bracketData.playInBracket)) {
      bracketData.playInBracket.forEach((match: any, index: number) => {
        oldMatches.push({
          id: match.matchId || `playin-${index}`,
          round: 0,
          position: index,
          left: {
            seed: match.teamA?.seed || 0,
            teamId: match.teamA?.id,
            teamName: match.teamA?.name,
            isBye: false,
          },
          right: {
            seed: match.teamB?.seed || 0,
            teamId: match.teamB?.id,
            teamName: match.teamB?.name,
            isBye: false,
          },
          status: match.isCompleted ? 'finished' : 'scheduled',
          winnerTeamId: match.winner?.id,
          winnerTeamName: match.winner?.name,
          matchId: match.matchId || undefined,
        })
      })
    }
    
    // Add playoff matches
    if (bracketData.playoffBracket && Array.isArray(bracketData.playoffBracket)) {
      bracketData.playoffBracket.forEach((match: any, index: number) => {
        oldMatches.push({
          id: match.matchId || `playoff-${match.roundIndex}-${index}`,
          round: (match.roundIndex || 0) + 1, // Convert roundIndex to round (Round 1 = round 1)
          position: index,
          left: {
            seed: match.teamA?.seed || 0,
            teamId: match.teamA?.id,
            teamName: match.teamA?.name,
            isBye: false,
          },
          right: {
            seed: match.teamB?.seed || 0,
            teamId: match.teamB?.id,
            teamName: match.teamB?.name,
            isBye: false,
          },
          status: match.isCompleted ? 'finished' : 'scheduled',
          winnerTeamId: match.winner?.id,
          winnerTeamName: match.winner?.name,
          matchId: match.matchId || undefined,
        })
      })
    }
    
    return oldMatches.length > 0 ? oldMatches : null
  }, [bracketData])

  // Organize playoff matches by round (for old structure display)
  const playoffRounds = useMemo(() => {
    if (!bracketData?.playoffBracket || allMatches) return []
    
    const rounds: Map<number, MatchNode[]> = new Map()
    bracketData.playoffBracket.forEach((match: MatchNode) => {
      const round = match.roundIndex || 0
      if (!rounds.has(round)) {
        rounds.set(round, [])
      }
      rounds.get(round)!.push(match)
    })
    
    return Array.from(rounds.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([roundIndex, matches]) => ({
        roundIndex,
        matches: matches.sort((a, b) => {
          // Sort by seed if available, otherwise by team name
          const aSeed = a.teamA.seed || 999
          const bSeed = b.teamA.seed || 999
          return aSeed - bSeed
        })
      }))
  }, [bracketData, allMatches])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-7xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b flex-shrink-0">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-3">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold">
                Bracket: {bracketData?.divisionName || 'Loading...'}
              </CardTitle>
              {bracketData?.needsPlayIn && (
                <p className="text-sm text-gray-500 mt-1">Play-In + Play-Off</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log('[BracketModal] Refresh button clicked')
                refetch()
              }}
              disabled={isLoading}
              className="h-8 px-3"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-auto pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading bracket...</p>
              </div>
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-red-600 mb-2">Error loading bracket</p>
                <p className="text-sm text-gray-500">{error?.message || 'Unknown error occurred'}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="mt-4"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Use new bracket component if new structure is available */}
              {allMatches && allMatches.length > 0 ? (
                <BracketPyramidNew
                  matches={allMatches}
                  showConnectingLines={true}
                  onMatchClick={(matchId) => {
                    console.log('Match clicked:', matchId)
                  }}
                  totalTeams={(bracketData as any)?.standings?.length}
                  bracketSize={(bracketData as any)?.bracketSize}
                />
              ) : allMatches !== null && allMatches.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="mb-2">Bracket structure is being generated...</p>
                  <p className="text-sm text-gray-400">Please generate Play-In or Play-Off matches to view the bracket.</p>
                </div>
              ) : (
                <>
                  {/* Fallback to old structure display */}
                  {/* Play-In Bracket */}
                  {bracketData.needsPlayIn && bracketData.playInBracket && bracketData.playInBracket.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <Trophy className="h-5 w-5 mr-2 text-orange-500" />
                        Play-In
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {bracketData.playInBracket.map((match: MatchNode, index: number) => (
                          <div
                            key={match.matchId || `playin-preview-${index}`}
                            className="border rounded-lg p-4 bg-white shadow-sm"
                          >
                            <div className="space-y-2">
                              <div className={`p-2 rounded ${match.winner?.id === match.teamA.id ? 'bg-green-100 border-2 border-green-500' : match.isCompleted && match.winner?.id !== match.teamA.id ? 'bg-gray-50 opacity-50' : 'bg-blue-50'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{match.teamA.name}</span>
                                  {match.teamA.seed && (
                                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                                      #{match.teamA.seed}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-center text-xs text-gray-400">vs</div>
                              <div className={`p-2 rounded ${match.winner?.id === match.teamB.id ? 'bg-green-100 border-2 border-green-500' : match.isCompleted && match.winner?.id !== match.teamB.id ? 'bg-gray-50 opacity-50' : 'bg-blue-50'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{match.teamB.name}</span>
                                  {match.teamB.seed && (
                                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                                      #{match.teamB.seed}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {match.isCompleted && match.winner && (
                              <div className="mt-2 text-xs text-center text-green-600 font-medium">
                                Winner: {match.winner.name}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Playoff Bracket */}
                  {playoffRounds.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <Trophy className="h-5 w-5 mr-2 text-blue-500" />
                        Play-Off
                      </h3>
                      <div className="overflow-x-auto">
                        <div className="flex space-x-4 min-w-max pb-4">
                          {playoffRounds.map((round, roundIdx) => (
                            <div key={round.roundIndex} className="flex flex-col space-y-4 min-w-[200px]">
                              <div className="text-center font-semibold text-gray-700 mb-2">
                                {round.roundIndex === 0 ? 'Round 1' : 
                                 round.roundIndex === 1 ? 'Round 2' :
                                 round.roundIndex === 2 ? 'Round 3' :
                                 round.roundIndex === 3 ? 'Semi-Finals' :
                                 round.roundIndex === 4 ? 'Finals' : `Round ${round.roundIndex + 1}`}
                              </div>
                              {round.matches.map((match, matchIdx) => (
                                <div
                                  key={match.matchId || `playoff-${round.roundIndex}-${matchIdx}`}
                                  className="border rounded-lg p-3 bg-white shadow-sm relative"
                                >
                                  {/* Connector line from previous round */}
                                  {roundIdx > 0 && (
                                    <div className="absolute left-0 top-1/2 -translate-x-4 w-4 h-px bg-gray-300"></div>
                                  )}
                                  
                                  <div className="space-y-1.5">
                                    <div className={`p-2 rounded text-sm ${match.winner?.id === match.teamA.id ? 'bg-green-100 border-2 border-green-500' : match.isCompleted && match.winner?.id !== match.teamA.id ? 'bg-gray-50 opacity-50' : 'bg-blue-50'}`}>
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium truncate">{match.teamA.name}</span>
                                        {match.teamA.seed && (
                                          <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded ml-1 flex-shrink-0">
                                            #{match.teamA.seed}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-center text-xs text-gray-400">vs</div>
                                    <div className={`p-2 rounded text-sm ${match.winner?.id === match.teamB.id ? 'bg-green-100 border-2 border-green-500' : match.isCompleted && match.winner?.id !== match.teamB.id ? 'bg-gray-50 opacity-50' : 'bg-blue-50'}`}>
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium truncate">{match.teamB.name}</span>
                                        {match.teamB.seed && (
                                          <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded ml-1 flex-shrink-0">
                                            #{match.teamB.seed}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {match.isCompleted && match.winner && (
                                    <div className="mt-1.5 text-xs text-center text-green-600 font-medium">
                                      ✓ {match.winner.name}
                                    </div>
                                  )}
                                  
                                  {/* Connector line to next round */}
                                  {roundIdx < playoffRounds.length - 1 && (
                                    <div className="absolute right-0 top-1/2 translate-x-4 w-4 h-px bg-gray-300"></div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {!bracketData.needsPlayIn && playoffRounds.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      No bracket data available. Generate Play-In or Play-Off to view the bracket.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

