'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { 
  ChevronLeft, 
  ChevronRight, 
  BarChart3, 
  Play, 
  RotateCcw, 
  Calculator,
  AlertTriangle,
  CheckCircle,
  Clock,
  Trophy,
  Users,
  Target,
  RefreshCw
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ScoreInputModal from '@/components/ScoreInputModal'

export default function DivisionStageManagement() {
  const router = useRouter()
  const params = useParams()
  const tournamentId = params.id as string
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<any>(null)
  const [showRRMatches, setShowRRMatches] = useState(true)
  const [showPlayInMatches, setShowPlayInMatches] = useState(true)
  const [showPlayoffMatches, setShowPlayoffMatches] = useState(true)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [regenerateType, setRegenerateType] = useState<'playin' | 'playoff' | 'rr' | null>(null)

  // Load tournament data
  const { data: tournament, refetch: refetchTournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  // Automatically select first division if not selected
  useEffect(() => {
    if (tournament && tournament.divisions.length > 0 && !selectedDivisionId) {
      setSelectedDivisionId(tournament.divisions[0].id)
    }
  }, [tournament, selectedDivisionId])

  // Load division data
  const { data: divisionData, refetch: refetchDivision } = trpc.divisionStage.getDivisionStage.useQuery(
    { divisionId: selectedDivisionId },
    { enabled: !!selectedDivisionId }
  )

  // Mutations for generation
  const generateRRMutation = trpc.match.generateRR.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  const generatePlayoffsMutation = trpc.standings.generatePlayoffs.useMutation({
    onSuccess: () => {
      console.log('generatePlayoffs success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('generatePlayoffs error:', error)
    }
  })

  const generatePlayoffAfterPlayInMutation = trpc.standings.generatePlayoffAfterPlayIn.useMutation({
    onSuccess: () => {
      console.log('generatePlayoffAfterPlayIn success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('generatePlayoffAfterPlayIn error:', error)
    }
  })

  const regeneratePlayInMutation = trpc.standings.generatePlayoffs.useMutation({
    onSuccess: () => {
      console.log('regeneratePlayInMutation success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('regeneratePlayInMutation error:', error)
      alert(`Error regenerating Play-In: ${error.message}`)
    }
  })

  const generateNextPlayoffRoundMutation = trpc.standings.generateNextPlayoffRound.useMutation({
    onSuccess: (data) => {
      console.log('generateNextPlayoffRound success:', data)
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('generateNextPlayoffRound error:', error)
    }
  })

  const regeneratePlayInMutation = trpc.standings.generatePlayoffs.useMutation({
    onSuccess: () => {
      console.log('regeneratePlayInMutation success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('regeneratePlayInMutation error:', error)
      alert(`Error regenerating Play-In: ${error.message}`)
    }
  })

  const generateNextPlayoffRoundMutation = trpc.standings.generateNextPlayoffRound.useMutation({
    onSuccess: () => {
      console.log('regeneratePlayoffsMutation success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('regeneratePlayoffsMutation error:', error)
      alert(`Error regenerating Play-Off: ${error.message}`)
    }
  })

  const regenerateRRMutation = trpc.match.regenerateRR.useMutation({
    onSuccess: () => {
      console.log('regenerateRRMutation success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('regenerateRRMutation error:', error)
      alert(`Error regenerating RR: ${error.message}`)
    }
  })

  const fillRandomResultsMutation = trpc.match.fillRandomResults.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  const updateMatchResultMutation = trpc.divisionStage.updateMatchResult.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  // Calculate statistics
  const division = divisionData
  const teams = division?.teams || []
  const matches = division?.matches || []
  
  const rrMatches = matches.filter(m => m.stage === 'ROUND_ROBIN')
  const playInMatches = matches.filter(m => m.stage === 'PLAY_IN')
  const eliminationMatches = matches.filter(m => m.stage === 'ELIMINATION')
  
  console.log('Matches data:', {
    totalMatches: matches.length,
    rrMatches: rrMatches.length,
    playInMatches: playInMatches.length,
    eliminationMatches: eliminationMatches.length,
    eliminationMatchesDetails: eliminationMatches.map(m => ({
      id: m.id,
      roundIndex: m.roundIndex,
      note: m.note,
      teamA: m.teamA?.name,
      teamB: m.teamB?.name
    }))
  })
  
  const completedRRMatches = rrMatches.filter(m => 
    m.games && m.games.length > 0 && m.games.some(g => g.scoreA > 0 || g.scoreB > 0)
  )
  
  const completedPlayInMatches = playInMatches.filter(m => 
    m.games && m.games.length > 0 && m.games.some(g => g.scoreA > 0 || g.scoreB > 0)
  )

  const teamCount = teams.length
  // Determine target bracket size based on team count
  const getTargetBracketSize = (teamCount: number) => {
    if (teamCount <= 8) return 4      // Up to 8 teams → bracket 4
    if (teamCount <= 16) return 8     // 9-16 teams → bracket 8
    if (teamCount <= 24) return 16    // 17-24 teams → bracket 16
    if (teamCount <= 32) return 32    // 25-32 teams → bracket 32
    return 64                         // 33+ teams → bracket 64
  }
  const targetBracketSize = getTargetBracketSize(teamCount)
  const needsPlayIn = teamCount > targetBracketSize && teamCount < targetBracketSize * 2
  const playInExcess = teamCount - targetBracketSize

  // Find current division in tournament for additional information
  const currentDivision = tournament?.divisions.find(d => d.id === selectedDivisionId)
  
  // Determine current stage
  const currentStage = division?.stage || 'RR_IN_PROGRESS'
  
  // Functions for handling actions
  const handleGenerateRR = () => {
    if (selectedDivisionId) {
      generateRRMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleGeneratePlayoffAfterPlayIn = () => {
    if (selectedDivisionId) {
      generatePlayoffAfterPlayInMutation.mutate({ 
        divisionId: selectedDivisionId, 
        bracketSize: targetBracketSize.toString() as "4" | "8" | "16"
      })
    }
  }

  const handleGeneratePlayoffs = () => {
    console.log('handleGeneratePlayoffs called:', {
      selectedDivisionId,
      currentStage,
      targetBracketSize,
      needsPlayIn,
      completedPlayInMatches: completedPlayInMatches.length,
      playInMatches: playInMatches.length
    })
    
    if (selectedDivisionId) {
      // If Play-In is completed (based on completed matches), use generatePlayoffAfterPlayIn
      if (needsPlayIn && completedPlayInMatches.length === playInMatches.length && playInMatches.length > 0) {
        console.log('Using generatePlayoffAfterPlayIn')
        generatePlayoffAfterPlayInMutation.mutate({ 
          divisionId: selectedDivisionId, 
          bracketSize: targetBracketSize.toString() as "4" | "8" | "16"
        })
      } else {
        console.log('Using generatePlayoffs')
        // Otherwise use regular Play-Off generation (directly after RR)
        generatePlayoffsMutation.mutate({ 
          divisionId: selectedDivisionId, 
          bracketSize: targetBracketSize.toString() as "4" | "8" | "16"
        })
      }
    }
  }

  // Check if next playoff round can be generated
  const canGenerateNextRound = () => {
    if (!eliminationMatches.length) return false
    
    // Find current round (highest roundIndex)
    const currentRound = Math.max(...eliminationMatches.map(m => m.roundIndex))
    const currentRoundMatches = eliminationMatches.filter(m => m.roundIndex === currentRound)
    
    // Check if all matches of current round are completed
    const allCompleted = currentRoundMatches.every(match => 
      match.games && match.games.length > 0 && match.games[0].scoreA > 0
    )
    
    // Check if this is the final round (has both final and third place matches)
    const hasThirdPlaceMatch = currentRoundMatches.some(m => (m as any).note === 'Third Place Match')
    const isFinalRound = currentRoundMatches.length === 2 && hasThirdPlaceMatch
    
    console.log('canGenerateNextRound check:', {
      eliminationMatchesLength: eliminationMatches.length,
      currentRound,
      currentRoundMatchesLength: currentRoundMatches.length,
      allCompleted,
      hasThirdPlaceMatch,
      isFinalRound,
      canGenerate: allCompleted && !isFinalRound
    })
    
    return allCompleted && !isFinalRound // Don't generate next round if this is the final round
  }

  const handleGenerateNextRound = () => {
    console.log('handleGenerateNextRound called with divisionId:', selectedDivisionId)
    if (selectedDivisionId) {
      generateNextPlayoffRoundMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleRegeneratePlayoffs = () => {
    if (selectedDivisionId) {
      regeneratePlayoffsMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleScoreInput = (match: any) => {
    setSelectedMatch(match)
    setShowScoreModal(true)
  }

  const handleScoreSubmit = (matchId: string, games: Array<{ scoreA: number; scoreB: number }>) => {
    const game = games[0] // Take first game
    updateMatchResultMutation.mutate({
      matchId,
      scoreA: game.scoreA,
      scoreB: game.scoreB
    })
    setShowScoreModal(false)
    setSelectedMatch(null)
  }

  const handleScoreModalClose = () => {
    setShowScoreModal(false)
    setSelectedMatch(null)
  }

  const handleRegenerate = (type: 'playin' | 'playoff' | 'rr') => {
    setRegenerateType(type)
    setShowRegenerateModal(true)
  }

  const handleRegenerateRR = () => {
    if (selectedDivisionId) {
      regenerateRRMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleFillRandomResults = () => {
    if (selectedDivisionId) {
      fillRandomResultsMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const confirmRegenerate = () => {
    if (regenerateType === 'rr') {
      // Regenerate Round Robin
      handleRegenerateRR()
    } else if (regenerateType === 'playin') {
      // Regenerate Play-In (resets both Play-In and Play-Off, but recreates only Play-In)
      regeneratePlayInMutation.mutate({ 
        divisionId: selectedDivisionId, 
        bracketSize: targetBracketSize.toString() as "4" | "8" | "16",
        regenerate: true
      })
    } else if (regenerateType === 'playoff') {
      // Regenerate Play-Off
      handleRegeneratePlayoffs()
    }
    setShowRegenerateModal(false)
    setRegenerateType(null)
  }

  // Determine button availability
  const canGenerateRR = !rrMatches.length
  const canInputRRResults = rrMatches.length > 0 && currentStage === 'RR_IN_PROGRESS'
  const canRecalculateSeeding = completedRRMatches.length === rrMatches.length && currentStage === 'RR_COMPLETE'
  const canRegenerateRR = rrMatches.length > 0 // Can regenerate if RR matches exist
  const canGeneratePlayIn = completedRRMatches.length === rrMatches.length && rrMatches.length > 0 && needsPlayIn && !playInMatches.length
  const canRegeneratePlayIn = playInMatches.length > 0
  const canGeneratePlayoff = (currentStage === 'PLAY_IN_COMPLETE' || (currentStage === 'RR_COMPLETE' && !needsPlayIn) || (needsPlayIn && completedPlayInMatches.length === playInMatches.length && playInMatches.length > 0)) && !eliminationMatches.length

  // Debug button availability
  console.log('Button availability debug:', {
    canGenerateRR,
    canRegenerateRR,
    canGeneratePlayIn,
    canRegeneratePlayIn,
    canGeneratePlayoff,
    rrMatchesLength: rrMatches.length,
    playInMatchesLength: playInMatches.length,
    eliminationMatchesLength: eliminationMatches.length,
    completedRRMatchesLength: completedRRMatches.length,
    currentStage,
    needsPlayIn,
    completedPlayInMatchesLength: completedPlayInMatches.length
  })

  // Debug information
  console.log('Debug Play-Off generation:', {
    currentStage,
    needsPlayIn,
    eliminationMatchesLength: eliminationMatches.length,
    canGeneratePlayoff,
    teamCount,
    targetBracketSize,
    playInExcess,
    completedPlayInMatches: completedPlayInMatches.length,
    playInMatches: playInMatches.length
  })

  if (!tournament || !division) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading division data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top panel */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left part - division information */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center space-x-2"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{division.name}</h1>
              <div className="flex items-center space-x-4 mt-1">
                <span className="text-sm text-gray-600">
                  {teamCount} teams • {currentDivision?.teamKind === 'SINGLES_1v1' ? 'Singles' : 'Doubles'} • {currentDivision?.pairingMode}
                </span>
                <Badge variant="outline" className="text-xs">
                  {currentStage.replace(/_/g, ' ')}
                </Badge>
                <span className="text-sm text-gray-500">
                  Target size: {targetBracketSize}
                </span>
              </div>
            </div>
          </div>

          {/* Right part - quick actions */}
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/admin/${tournamentId}/dashboard?division=${selectedDivisionId}`)}
              className="flex items-center space-x-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Dashboard</span>
            </Button>
            
            {/* Division switcher */}
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const currentIndex = tournament.divisions.findIndex(d => d.id === selectedDivisionId)
                  const prevIndex = currentIndex > 0 ? currentIndex - 1 : tournament.divisions.length - 1
                  setSelectedDivisionId(tournament.divisions[prevIndex].id)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <select
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                {tournament.divisions.map((div) => (
                  <option key={div.id} value={div.id}>
                    {div.name} ({div.teams?.length || 0} teams)
                  </option>
                ))}
              </select>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const currentIndex = tournament.divisions.findIndex(d => d.id === selectedDivisionId)
                  const nextIndex = currentIndex < tournament.divisions.length - 1 ? currentIndex + 1 : 0
                  setSelectedDivisionId(tournament.divisions[nextIndex].id)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Round Robin Block */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Round Robin</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* RR Summary */}
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Total matches: {rrMatches.length} • Matches per team: {(() => {
                    // Calculate matches per team within pools
                    if (currentDivision?.pools && currentDivision.pools.length > 0) {
                      const maxMatchesPerTeam = Math.max(...currentDivision.pools.map(pool => {
                        const poolTeams = teams.filter(team => team.poolId === pool.id)
                        return poolTeams.length - 1
                      }))
                      return maxMatchesPerTeam
                    }
                    return Math.max(0, teamCount - 1)
                  })()}
                </p>
                {rrMatches.length > 0 && (
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Progress 
                        value={(completedRRMatches.length / rrMatches.length) * 100} 
                        className="w-32"
                      />
                      <span className="text-sm text-gray-600">
                        {completedRRMatches.length}/{rrMatches.length} completed
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                {canGenerateRR && (
                  <Button
                    onClick={handleGenerateRR}
                    disabled={generateRRMutation.isPending}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Generate RR</span>
                  </Button>
                )}
                
                {canInputRRResults && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Show first match for result entry
                      if (rrMatches.length > 0) {
                        handleScoreInput(rrMatches[0])
                      }
                    }}
                    className="flex items-center space-x-2"
                  >
                    <Clock className="h-4 w-4" />
                    <span>Enter Results</span>
                  </Button>
                )}
                
                {canRecalculateSeeding && (
                  <Button
                    variant="outline"
                    onClick={() => {/* Recalculate seeding */}}
                    className="flex items-center space-x-2"
                    title="Recalculate team seeding based on Round Robin results for proper Play-In/Play-Off formation"
                  >
                    <Calculator className="h-4 w-4" />
                    <span>Recalculate Seeding</span>
                  </Button>
                )}
                
                {canRegenerateRR && (
                  <Button
                    variant="outline"
                    onClick={() => handleRegenerate('rr')}
                    className="flex items-center space-x-2 text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Regenerate RR</span>
                  </Button>
                )}
                
                {rrMatches.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleFillRandomResults}
                    disabled={fillRandomResultsMutation.isPending}
                    className="flex items-center space-x-2 text-purple-600 border-purple-600 hover:bg-purple-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Fill Random Results</span>
                  </Button>
                )}
                
                <Button
                  variant="ghost"
                  onClick={() => router.push(`/admin/${tournamentId}/dashboard?division=${selectedDivisionId}`)}
                  className="flex items-center space-x-2"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Dashboard</span>
                </Button>
              </div>
            </div>

            {/* RR Matches List */}
            {rrMatches.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Round Robin Matches</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRRMatches(!showRRMatches)}
                    className="flex items-center space-x-2"
                  >
                    <span>{showRRMatches ? 'Collapse' : 'Expand'}</span>
                  </Button>
                </div>
                
                {showRRMatches && (
                  <div className="space-y-6">
                    {/* Group matches by pools */}
                    {(() => {
                      // Get all pools from matches, sort by order
                      const pools = Array.from(new Set(rrMatches.map(m => m.poolId).filter(Boolean)))
                        .map(poolId => {
                          const pool = currentDivision?.pools?.find(p => p.id === poolId)
                          return { id: poolId, order: pool?.order || 0 }
                        })
                        .sort((a, b) => a.order - b.order)
                        .map(p => p.id)
                      
                      const waitListMatches = rrMatches.filter(m => m.poolId === null)
                      
                      return (
                        <>
                          {/* Pool matches */}
                          {pools.map(poolId => {
                            const poolMatches = rrMatches.filter(m => m.poolId === poolId)
                            const pool = currentDivision?.pools?.find(p => p.id === poolId)
                            const poolName = pool?.name?.startsWith('Pool ') ? pool.name : `Pool ${pool?.name || poolId}`
                            
                            // Group pool matches by rounds and sort
                            const rounds = Array.from(new Set(poolMatches.map(m => m.roundIndex))).sort()
                            
                            return (
                              <div key={poolId} className="space-y-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                  <h4 className="text-lg font-semibold text-blue-900 mb-2">{poolName}</h4>
                                  <p className="text-sm text-blue-700">
                                    {poolMatches.length} matches • {rounds.length} rounds
                                  </p>
                                </div>
                                
                                <div className="space-y-4">
                                  {rounds.map((roundIndex, index) => {
                                    const roundMatches = poolMatches.filter(m => m.roundIndex === roundIndex)
                                    return (
                                      <div key={roundIndex} className="space-y-2">
                                        <h5 className="text-sm font-medium text-gray-700">Round {index + 1}</h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                          {roundMatches.map((match) => (
                                            <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                                              <div className="flex items-center justify-between mb-2">
                                                <div className="text-sm font-medium">
                                                  {match.teamA.name}
                                                </div>
                                                <div className="text-sm text-gray-500">vs</div>
                                                <div className="text-sm font-medium">
                                                  {match.teamB.name}
                                                </div>
                                              </div>
                                              
                                              {match.games && match.games.length > 0 && match.games[0].scoreA > 0 ? (
                                                <div className="text-center space-y-2">
                                                  <div className="text-lg font-bold">
                                                    {match.games[0].scoreA} - {match.games[0].scoreB}
                                                  </div>
                                                  <div className="text-sm text-green-600 font-medium">
                                                    Winner: {match.games[0].winner === 'A' ? match.teamA.name : match.teamB.name}
                                                  </div>
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleScoreInput(match)}
                                                    className="w-full"
                                                  >
                                                    Change Score
                                                  </Button>
                                                </div>
                                              ) : (
                                                <Button
                                                  size="sm"
                                                  onClick={() => handleScoreInput(match)}
                                                  className="w-full"
                                                >
                                                  Enter Score
                                                </Button>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                          
                          {/* WaitList Matches */}
                          {waitListMatches.length > 0 && (
                            <div className="space-y-4">
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-gray-900 mb-2">WaitList</h4>
                                <p className="text-sm text-gray-700">
                                  {waitListMatches.length} matches • {Array.from(new Set(waitListMatches.map(m => m.roundIndex))).length} rounds
                                </p>
                              </div>
                              
                              <div className="space-y-4">
                                {Array.from(new Set(waitListMatches.map(m => m.roundIndex))).sort().map((roundIndex, index) => {
                                  const roundMatches = waitListMatches.filter(m => m.roundIndex === roundIndex)
                                  return (
                                    <div key={roundIndex} className="space-y-2">
                                      <h5 className="text-sm font-medium text-gray-700">Round {index + 1}</h5>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {roundMatches.map((match) => (
                                          <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-2">
                                              <div className="text-sm font-medium">
                                                {match.teamA.name}
                                              </div>
                                              <div className="text-sm text-gray-500">vs</div>
                                              <div className="text-sm font-medium">
                                                {match.teamB.name}
                                              </div>
                                            </div>
                                            
                                            {match.games && match.games.length > 0 && match.games[0].scoreA > 0 ? (
                                              <div className="text-center space-y-2">
                                                <div className="text-lg font-bold">
                                                  {match.games[0].scoreA} - {match.games[0].scoreB}
                                                </div>
                                                <div className="text-sm text-green-600 font-medium">
                                                  Winner: {match.games[0].winner === 'A' ? match.teamA.name : match.teamB.name}
                                                </div>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => handleScoreInput(match)}
                                                  className="w-full"
                                                >
                                                  Change Score
                                                </Button>
                                              </div>
                                            ) : (
                                              <Button
                                                size="sm"
                                                onClick={() => handleScoreInput(match)}
                                                className="w-full"
                                              >
                                                Enter Score
                                              </Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Block if RR not completed */}
            {currentStage === 'RR_IN_PROGRESS' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Complete all Round Robin matches to proceed to Play-In/Play-Off.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Information banner if not enough teams */}
        {teamCount < targetBracketSize && (
          <Card>
            <CardContent className="pt-6">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Not enough teams for selected bracket size. 
                  Teams: {teamCount}, required: {targetBracketSize}.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Play-In Block - show only if B < N < 2B */}
        {needsPlayIn && (
          <Card className={currentStage === 'RR_IN_PROGRESS' ? 'opacity-50 pointer-events-none' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <Target className="h-5 w-5" />
                  <span>Play-In</span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPlayInMatches(!showPlayInMatches)}
                  className="flex items-center space-x-2"
                >
                  <span>{showPlayInMatches ? 'Collapse' : 'Expand'}</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Play-In Summary */}
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Teams in division: {teamCount}. Target size: {targetBracketSize}. Excess: {playInExcess}.
                </p>
                <p className="text-sm text-gray-600">
                  Play-In includes bottom {playInExcess * 2} seeds. Winners will take {playInExcess} last R1 slots.
                </p>
              </div>

              {/* Play-In Buttons */}
              <div className="flex items-center space-x-2">
                {canGeneratePlayIn && (
                  <Button
                    onClick={() => {
                      // Generate Play-In through standings.generatePlayoffs
                      generatePlayoffsMutation.mutate({ 
                        divisionId: selectedDivisionId, 
                        bracketSize: targetBracketSize.toString() as "4" | "8" | "16"
                      })
                    }}
                    disabled={generatePlayoffsMutation.isPending}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Generate Play-In</span>
                  </Button>
                )}
                
                {canRegeneratePlayIn && (
                  <Button
                    variant="outline"
                    onClick={() => handleRegenerate('playin')}
                    className="flex items-center space-x-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Regenerate Play-In</span>
                  </Button>
                )}
              </div>

              {/* Play-In Progress */}
              {playInMatches.length > 0 && (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Progress 
                      value={(completedPlayInMatches.length / playInMatches.length) * 100} 
                      className="w-32"
                    />
                    <span className="text-sm text-gray-600">
                      {completedPlayInMatches.length}/{playInMatches.length} matches completed
                    </span>
                  </div>
                  
                  {completedPlayInMatches.length === playInMatches.length && (
                    <div className="flex items-center space-x-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Play-In completed</span>
                    </div>
                  )}
                </div>
              )}

              {/* Play-In Pairings List */}
              {playInMatches.length > 0 && showPlayInMatches && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {playInMatches.map((match) => (
                    <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">
                          [{match.teamA.seed || '?'}] {match.teamA.name}
                        </div>
                        <div className="text-sm text-gray-500">vs</div>
                        <div className="text-sm font-medium">
                          [{match.teamB.seed || '?'}] {match.teamB.name}
                        </div>
                      </div>
                      
                      {match.games && match.games.length > 0 && match.games[0].scoreA > 0 ? (
                        <div className="text-center space-y-2">
                          <div className="text-lg font-bold">
                            {match.games[0].scoreA} - {match.games[0].scoreB}
                          </div>
                          <div className="text-sm text-green-600 font-medium">
                            Winner: {match.games[0].winner === 'A' ? match.teamA.name : match.teamB.name}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleScoreInput(match)}
                            className="w-full"
                          >
                            Change Score
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleScoreInput(match)}
                          className="w-full"
                        >
                          Enter Score
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Play-Off Block */}
        <Card className={currentStage === 'RR_IN_PROGRESS' || (needsPlayIn && completedPlayInMatches.length !== playInMatches.length) ? 'opacity-50 pointer-events-none' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Trophy className="h-5 w-5" />
                <span>Play-Off</span>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPlayoffMatches(!showPlayoffMatches)}
                className="flex items-center space-x-2"
              >
                <span>{showPlayoffMatches ? 'Collapse' : 'Expand'}</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Play-Off Summary */}
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Teams in division: {teamCount}. Target bracket size: {targetBracketSize}.
              </p>
              
              {/* Show different descriptions based on current stage */}
              {eliminationMatches.length === 0 ? (
                // No playoff matches yet
                needsPlayIn ? (
                  <p className="text-sm text-gray-600">
                    Play-In needed: {playInExcess * 2} teams (bottom {playInExcess * 2} seeds) for {playInExcess} Play-Off slots.
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">
                    All teams advance to Play-Off directly.
                  </p>
                )
              ) : (
                // Playoff matches exist - show current stage info
                (() => {
                  const maxRound = Math.max(...eliminationMatches.map(m => m.roundIndex))
                  const currentRoundMatches = eliminationMatches.filter(m => m.roundIndex === maxRound)
                  const hasThirdPlaceMatch = currentRoundMatches.some(m => (m as any).note === 'Third Place Match')
                  const isFinalRound = currentRoundMatches.length === 2 && hasThirdPlaceMatch
                  
                  if (isFinalRound) {
                    return (
                      <p className="text-sm text-gray-600">
                        Final stage: 1st Place Match + 3rd Place Match
                      </p>
                    )
                  } else if (currentRoundMatches.length === 2) {
                    return (
                      <p className="text-sm text-gray-600">
                        Semi-Final stage: 2 matches
                      </p>
                    )
                  } else {
                    return (
                      <p className="text-sm text-gray-600">
                        Play-Off stage: {currentRoundMatches.length} match{currentRoundMatches.length > 1 ? 'es' : ''}
                      </p>
                    )
                  }
                })()
              )}
              
              <p className="text-sm text-gray-600">
                {eliminationMatches.length > 0 ? `${eliminationMatches.length} matches generated` : 'No matches generated'}
              </p>
            </div>

            {/* Play-Off Buttons */}
            <div className="flex items-center space-x-2">
              {canGeneratePlayoff && (
                <Button
                  onClick={handleGeneratePlayoffs}
                  disabled={generatePlayoffsMutation.isPending || generatePlayoffAfterPlayInMutation.isPending}
                  className="flex items-center space-x-2"
                >
                  <Trophy className="h-4 w-4" />
                  <span>Generate Play-Off</span>
                </Button>
              )}
              
              {canGenerateNextRound() && (
                <Button
                  onClick={handleGenerateNextRound}
                  disabled={generateNextPlayoffRoundMutation.isPending}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
                >
                  <Trophy className="h-4 w-4" />
                  <span>Next Round</span>
                </Button>
              )}
              
              {eliminationMatches.length > 0 && (
                <Button
                  onClick={() => setShowRegenerateModal(true)}
                  variant="outline"
                  className="flex items-center space-x-2 text-red-600 border-red-600 hover:bg-red-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Regenerate Play-Off</span>
                </Button>
              )}
            </div>

            {/* Block if Play-In in progress */}
            {needsPlayIn && completedPlayInMatches.length !== playInMatches.length && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Complete Play-In to generate Play-Off.
                </AlertDescription>
              </Alert>
            )}

            {/* Play-Off Matches List */}
            {eliminationMatches.length > 0 && showPlayoffMatches && (
              <div className="space-y-6">
                {/* Group matches by rounds */}
                {Array.from({ length: Math.max(...eliminationMatches.map(m => m.roundIndex)) + 1 }, (_, roundIndex) => {
                  const roundMatches = eliminationMatches.filter(m => m.roundIndex === roundIndex)
                  if (roundMatches.length === 0) return null
                  
                  const roundName = (() => {
                    // Check if this round has a third place match
                    const hasThirdPlaceMatch = roundMatches.some(m => m.note === 'Third Place Match')
                    
                    if (roundMatches.length === 2 && !hasThirdPlaceMatch) {
                      // 2 matches without third place = Semi-Final
                      return 'Semi-Final'
                    } else if (roundMatches.length === 2 && hasThirdPlaceMatch) {
                      // 2 matches with third place = Final & 3rd Place
                      return 'Final & 3rd Place'
                    } else if (roundMatches.length === 1) {
                      // 1 match = Final
                      return 'Final'
                    } else {
                      // Other cases
                      return `Round ${roundIndex + 1}`
                    }
                  })()
                  
                  return (
                    <div key={roundIndex} className="space-y-4">
                      <h4 className="font-medium text-lg">{roundName}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roundMatches.map((match) => {
                          // Check if this is a third place match
                          const isThirdPlace = match.note === 'Third Place Match'
                          // Check if this is a final match (1 match in final round or 2 matches where this is not third place)
                          const isFinalMatch = roundMatches.length === 1 || (roundMatches.length === 2 && !isThirdPlace)
                          
                          return (
                            <div key={match.id} className={`border border-gray-200 rounded-lg p-4 ${
                              // Only apply colors to Final round matches
                              roundName === 'Final & 3rd Place' 
                                ? (isThirdPlace ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200')
                                : 'bg-white'
                            }`}>
                              {/* Only show place labels in Final round */}
                              {roundName === 'Final & 3rd Place' && isThirdPlace && (
                                <div className="text-xs text-orange-600 font-medium mb-2 text-center">
                                  3rd Place Match
                                </div>
                              )}
                              {roundName === 'Final & 3rd Place' && isFinalMatch && !isThirdPlace && (
                                <div className="text-xs text-blue-600 font-medium mb-2 text-center">
                                  1st Place Match
                                </div>
                              )}
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-medium">
                                  {match.teamA.name}
                                </div>
                                <div className="text-sm text-gray-500">vs</div>
                                <div className="text-sm font-medium">
                                  {match.teamB.name}
                                </div>
                              </div>
                            
                            {match.games && match.games.length > 0 && match.games[0].scoreA > 0 ? (
                              <div className="text-center space-y-2">
                                <div className="text-lg font-bold">
                                  {match.games[0].scoreA} - {match.games[0].scoreB}
                                </div>
                                <div className="text-sm text-green-600 font-medium">
                                  Winner: {match.games[0].winner === 'A' ? match.teamA.name : match.teamB.name}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleScoreInput(match)}
                                  className="w-full"
                                >
                                  Change Score
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleScoreInput(match)}
                                className="w-full"
                              >
                                Enter Score
                              </Button>
                            )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Score input modal */}
      {showScoreModal && selectedMatch && (
        <ScoreInputModal
          isOpen={showScoreModal}
          onClose={handleScoreModalClose}
          onSubmit={(scoreA, scoreB) => {
            handleScoreSubmit(selectedMatch.id, [{ scoreA, scoreB }])
          }}
          teamAName={selectedMatch.teamA.name}
          teamBName={selectedMatch.teamB.name}
          poolName={selectedMatch.teamA.pool?.name}
          isLoading={updateMatchResultMutation.isPending}
        />
      )}

      {/* Regeneration confirmation modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Regenerate {regenerateType === 'rr' ? 'Round Robin' : regenerateType === 'playin' ? 'Play-In' : 'Play-Off'}
            </h3>
            <p className="text-gray-600 mb-6">
              {regenerateType === 'rr' 
                ? 'All Round Robin matches will be reset. This will allow teams to be redistributed across pools and create new matches. Continue?'
                : regenerateType === 'playin' 
                  ? 'All Play-In and Play-Off matches will be reset. Play-In will be regenerated based on current Round Robin results. Continue?'
                  : 'All Play-Off matches will be reset and regenerated. Continue?'
              }
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowRegenerateModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRegenerate}
              >
                Regenerate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
