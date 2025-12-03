'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Trophy, 
  Users, 
  Target, 
  Info, 
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react'
import BracketPyramid from '@/components/BracketPyramid'
import BracketModal from '@/components/BracketModal'
import TournamentNavBar from '@/components/TournamentNavBar'
import Link from 'next/link'
import { getTeamDisplayName } from '@/lib/utils'

interface TeamStanding {
  teamId: string
  teamName: string
  rank: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
  headToHead: Record<string, { wins: number; losses: number; pointDiff: number }>
}

interface PlayInMatch {
  id: string
  teamA: { id: string; name: string; seed: number }
  teamB: { id: string; name: string; seed: number }
  games: Array<{ scoreA: number; scoreB: number }>
  roundIndex: number
}

interface PlayoffMatch {
  id: string
  teamA: { id: string; name: string; seed: number } | null
  teamB: { id: string; name: string; seed: number } | null
  games: Array<{ scoreA: number; scoreB: number }>
  roundIndex: number
  stage: string
}

export default function DivisionDashboard() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tournamentId = params.id as string
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  const [showConnectingLines, setShowConnectingLines] = useState(true)
  const [showBracketModal, setShowBracketModal] = useState(false)
  const [scoreModal, setScoreModal] = useState<{
    isOpen: boolean
    matchId: string | null
    teamAName: string
    teamBName: string
  }>({ isOpen: false, matchId: null, teamAName: '', teamBName: '' })

  // Get tournament data
  const { data: tournament, isLoading: tournamentLoading, refetch: refetchTournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  // Read division from URL params on mount and when URL changes
  useEffect(() => {
    if (!tournament || (tournament.divisions as any[]).length === 0) return
    
    const divisions = tournament.divisions as any[]
    const divisionFromUrl = searchParams.get('division')
    if (divisionFromUrl && divisions.some((d: any) => d.id === divisionFromUrl)) {
      // Division from URL is valid - use it
      if (selectedDivisionId !== divisionFromUrl) {
        setSelectedDivisionId(divisionFromUrl)
      }
    } else if (!selectedDivisionId && divisions.length > 0) {
      // No division in URL and no selected division - set first one and update URL
      const firstDivisionId = divisions[0]?.id || ''
      setSelectedDivisionId(firstDivisionId)
      if (!divisionFromUrl) {
        router.replace(`/admin/${tournamentId}/dashboard?division=${firstDivisionId}`, { scroll: false })
      }
    }
  }, [searchParams, tournament])

  // Update URL when division changes via selector (not from URL read)
  useEffect(() => {
    if (selectedDivisionId && tournament && (tournament.divisions as any[]).length > 0) {
      const divisionFromUrl = searchParams.get('division')
      // Only update URL if it's different and division was not just set from URL
      if (divisionFromUrl !== selectedDivisionId) {
        // Small delay to avoid race condition with URL reading
        const timeoutId = setTimeout(() => {
          router.replace(`/admin/${tournamentId}/dashboard?division=${selectedDivisionId}`, { scroll: false })
        }, 0)
        return () => clearTimeout(timeoutId)
      }
    }
  }, [selectedDivisionId, tournamentId, router])

  // Set first division as default
  const currentDivision = (tournament?.divisions as any[])?.find((d: any) => d.id === selectedDivisionId) ||
                          (tournament?.divisions as any[])?.[0]

  // Get standings for current division
  const { data: standingsData, isLoading: standingsLoading } = trpc.standings.calculateStandings.useQuery(
    { divisionId: currentDivision?.id || '' },
    { enabled: !!currentDivision?.id }
  )

  // Get division stage
  const { data: divisionStage, isLoading: stageLoading, refetch: refetchStage } = trpc.divisionStage.getDivisionStage.useQuery(
    { divisionId: currentDivision?.id || '' },
    { enabled: !!currentDivision?.id }
  )

  // Get play-in status
  const { data: playInStatus, isLoading: playInLoading } = trpc.standings.checkPlayInStatus.useQuery(
    { divisionId: currentDivision?.id || '' },
    { enabled: !!currentDivision?.id }
  )

  // Mutations
  const updateMatchResultMutation = trpc.divisionStage.updateMatchResult.useMutation({
    onSuccess: () => {
      refetchStage()
      refetchTournament()
      setScoreModal({ isOpen: false, matchId: null, teamAName: '', teamBName: '' })
    },
    onError: (error) => {
      alert(`Error: ${error.message}`)
    },
  })

  const transitionToNextStageMutation = trpc.divisionStage.transitionToNextStage.useMutation({
    onSuccess: () => {
      refetchStage()
      refetchTournament()
    },
    onError: (error) => {
      alert(`Error: ${error.message}`)
    },
  })

  const handleScoreInput = (matchId: string, teamAName: string, teamBName: string) => {
    setScoreModal({
      isOpen: true,
      matchId,
      teamAName,
      teamBName,
    })
  }

  const handleScoreSubmit = (scoreA: number, scoreB: number) => {
    if (!scoreModal.matchId) return
    
    updateMatchResultMutation.mutate({
      matchId: scoreModal.matchId,
      scoreA,
      scoreB,
    })
  }

  const handleScoreModalClose = () => {
    setScoreModal({ isOpen: false, matchId: null, teamAName: '', teamBName: '' })
  }

  const handleTransitionToNextStage = () => {
    if (!currentDivision?.id) return
    
    transitionToNextStageMutation.mutate({
      divisionId: currentDivision.id,
    })
  }

  if (tournamentLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!tournament) {
    return <div className="flex items-center justify-center min-h-screen">Tournament not found</div>
  }

  if (tournament.divisions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">No divisions yet</h2>
          <p className="text-gray-600 mb-6">
            Create a division to start adding teams, generating schedules, and entering scores.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`/admin/${tournamentId}/divisions`}
              className="flex-1 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Create division
            </Link>
            <Link
              href={`/admin/${tournamentId}`}
              className="flex-1 inline-flex items-center justify-center border border-gray-300 text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-50"
            >
              Back to tournament
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const standings = standingsData?.standings || []
  const rrMatches = divisionStage?.matches?.filter(m => m.stage === 'ROUND_ROBIN') || []
  const playInMatches = divisionStage?.matches?.filter(m => m.stage === 'PLAY_IN') || []
  const playoffMatches = divisionStage?.matches?.filter(m => m.stage === 'ELIMINATION') || []

  const isRRComplete = divisionStage?.stage === 'RR_COMPLETE' || 
                      (divisionStage?.stage !== 'RR_IN_PROGRESS' && rrMatches.length > 0)
  // Calculate Play-In logic based on team count and target bracket size
  const teamCount = standings.length
  const getTargetBracketSize = (teamCount: number) => {
    if (teamCount <= 8) return 4      // Up to 8 teams → bracket 4
    if (teamCount <= 16) return 8     // 9-16 teams → bracket 8
    if (teamCount <= 24) return 16    // 17-24 teams → bracket 16
    if (teamCount <= 32) return 32    // 25-32 teams → bracket 32
    return 64                         // 33+ teams → bracket 64
  }
  
  const targetBracketSize = getTargetBracketSize(teamCount)
  const needsPlayIn = targetBracketSize < teamCount && teamCount < 2 * targetBracketSize
  const autoQualifiedCount = needsPlayIn ? targetBracketSize - (teamCount - targetBracketSize) : Math.min(targetBracketSize, teamCount)
  
  const hasPlayIn = needsPlayIn
  const isPlayInComplete = divisionStage?.stage === 'PLAY_IN_COMPLETE'
  const currentStage = divisionStage?.stage || 'RR_IN_PROGRESS'

  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  const isOwner = tournament?.userAccessInfo?.isOwner
  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <TournamentNavBar
        tournamentTitle={tournament.title}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
        publicScoreboardUrl={tournament?.isPublicBoardEnabled ? `${typeof window !== 'undefined' ? window.location.origin : 'https://dtest.piqle.io'}/scoreboard/${tournamentId}` : undefined}
        onPublicScoreboardClick={() => {
          if (!tournament?.isPublicBoardEnabled) {
            alert('Public Scoreboard is not available. Please enable it in tournament settings.')
            return
          }
          window.open(`/scoreboard/${tournamentId}`, '_blank')
        }}
      />
      
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">Division Dashboard</h1>
              {/* Status badges hidden per user request */}
            </div>
            
            {/* Show Bracket Button */}
            {isRRComplete && currentDivision && (
              <Button
                onClick={() => setShowBracketModal(true)}
                variant="outline"
                className="flex items-center space-x-2 mr-4"
              >
                <Trophy className="h-4 w-4" />
                <span>Show Bracket</span>
              </Button>
            )}

            {/* Division Switcher */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const currentIndex = (tournament.divisions as any[]).findIndex((d: any) => d.id === selectedDivisionId)
                  const divisions = tournament.divisions as any[]
                  const prevIndex = currentIndex > 0 ? currentIndex - 1 : divisions.length - 1
                  setSelectedDivisionId(divisions[prevIndex].id)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <select
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(tournament.divisions as any[]).map((division: any) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const currentIndex = (tournament.divisions as any[]).findIndex((d: any) => d.id === selectedDivisionId)
                  const divisions = tournament.divisions as any[]
                  const nextIndex = currentIndex < divisions.length - 1 ? currentIndex + 1 : 0
                  setSelectedDivisionId(divisions[nextIndex].id)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentDivision ? (
          <>
            {/* Desktop Layout */}
            <div className="hidden lg:block space-y-6">
              {/* Round Robin Section */}
              <div className="grid grid-cols-12 gap-6">
                {/* RR Summary */}
                <div className="col-span-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Users className="h-5 w-5" />
                        <span>Round Robin</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Status:</span>
                          {isRRComplete ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Complete
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3 mr-1" />
                              In Progress
                            </Badge>
                          )}
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          <p>Teams: {standings.length}</p>
                          <p>Target bracket: {targetBracketSize}</p>
                        </div>
                        
                        {!isRRComplete && (
                          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                            <div className="flex items-center space-x-1">
                              <AlertCircle className="h-4 w-4 text-yellow-600" />
                              <span className="text-sm text-yellow-800">
                                Not all results entered — seeding and playoffs unavailable
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Tournament Info</span>
                        </div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <p>Round Robin format</p>
                          <p>Best of 3 games</p>
                          <p>Win by 2 points</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* RR Table */}
                <div className="col-span-9">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Standings</CardTitle>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Export CSV
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2">#</th>
                              <th className="text-left py-2">Team</th>
                              <th className="text-center py-2">W</th>
                              <th className="text-center py-2">L</th>
                              <th className="text-center py-2">PF</th>
                              <th className="text-center py-2">PA</th>
                              <th className="text-center py-2">Diff</th>
                              <th className="text-center py-2">H2H Diff</th>
                              <th className="text-center py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((team: TeamStanding) => {
                              // teamName already comes from backend with helper applied
                              return (
                              <tr key={team.teamId} className="border-b hover:bg-gray-50">
                                <td className="py-2 font-medium">{team.rank}</td>
                                <td className="py-2 font-medium">{team.teamName}</td>
                                <td className="py-2 text-center">{team.wins}</td>
                                <td className="py-2 text-center">{team.losses}</td>
                                <td className="py-2 text-center">{team.pointsFor}</td>
                                <td className="py-2 text-center">{team.pointsAgainst}</td>
                                <td className="py-2 text-center">
                                  <span className={team.pointDiff >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    {team.pointDiff > 0 ? '+' : ''}{team.pointDiff}
                                  </span>
                                </td>
                                <td className="py-2 text-center">—</td>
                                <td className="py-2 text-center">
                                  {team.rank <= autoQualifiedCount && hasPlayIn ? (
                                    <Badge variant="default" className="bg-green-100 text-green-800">
                                      Auto-qualified
                                    </Badge>
                                  ) : hasPlayIn ? (
                                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                      Play-in
                                    </Badge>
                                  ) : (
                                    <Badge variant="default" className="bg-green-100 text-green-800">
                                      Qualified
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Play-In Section */}
              {hasPlayIn && (
                <Card>
                  <CardHeader>
                    <CardTitle>Play-In</CardTitle>
                    <p className="text-sm text-gray-600">
                      Preliminary stage to reduce to the required number of participants
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {playInMatches.map((match) => {
                        const hasResults = match.games && match.games.length > 0
                        const scoreA = hasResults ? match.games[0]?.scoreA : null
                        const scoreB = hasResults ? match.games[0]?.scoreB : null
                        const winner = scoreA !== null && scoreB !== null ? (scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null) : null
                        
                        // Get seeds from standings
                        const teamASeed = standings.find(s => s.teamId === match.teamA?.id)?.rank
                        const teamBSeed = standings.find(s => s.teamId === match.teamB?.id)?.rank
                        
                        return (
                          <div key={match.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 h-36 flex flex-col">
                            {/* Header - Match Status */}
                            <div className="flex justify-between items-center mb-3">
                              <div className="text-xs text-gray-500 font-medium">Play-in</div>
                              {!hasResults ? (
                                <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                  Scheduled
                                </div>
                              ) : (
                                <div className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                                  Completed
                                </div>
                              )}
                            </div>

                            {/* Body - Teams and Scores */}
                            <div className="flex-1 space-y-2">
                              {/* Team A */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2 min-w-0 flex-1">
                                  <div className="text-xs text-gray-500 font-medium w-6">
                                    #{teamASeed || '?'}
                                  </div>
                                  <div className="text-sm font-medium text-gray-900 truncate" title={match.teamA ? getTeamDisplayName(match.teamA as any, currentDivision?.teamKind) : 'TBD'}>
                                    {match.teamA ? getTeamDisplayName(match.teamA as any, currentDivision?.teamKind) : 'TBD'}
                                  </div>
                                  {winner === 'A' && (
                                    <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                      Winner
                                    </div>
                                  )}
                                </div>
                                <div className={`text-xl font-semibold font-mono tabular-nums ${
                                  winner === 'A' ? 'text-blue-600' : 
                                  winner === 'B' ? 'text-gray-400' : 
                                  'text-blue-600'
                                }`}>
                                  {scoreA !== null ? scoreA : '—'}
                                </div>
                              </div>

                              {/* Divider */}
                              <div className="border-t border-gray-100"></div>

                              {/* Team B */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2 min-w-0 flex-1">
                                  <div className="text-xs text-gray-500 font-medium w-6">
                                    #{teamBSeed || '?'}
                                  </div>
                                  <div className={`text-sm font-medium truncate ${
                                    winner === 'B' ? 'text-gray-900' : 
                                    winner === 'A' ? 'text-gray-500' : 
                                    'text-gray-900'
                                  }`} title={match.teamB ? getTeamDisplayName(match.teamB as any, currentDivision?.teamKind) : 'TBD'}>
                                    {match.teamB ? getTeamDisplayName(match.teamB as any, currentDivision?.teamKind) : 'TBD'}
                                  </div>
                                  {winner === 'B' && (
                                    <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                      Winner
                                    </div>
                                  )}
                                </div>
                                <div className={`text-xl font-semibold font-mono tabular-nums ${
                                  winner === 'B' ? 'text-blue-600' : 
                                  winner === 'A' ? 'text-gray-400' : 
                                  'text-blue-600'
                                }`}>
                                  {scoreB !== null ? scoreB : '—'}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bracket Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Playoff Bracket</CardTitle>
                </CardHeader>
                <CardContent>
                  <BracketPyramid
                    matches={playoffMatches.map(match => ({
                      id: match.id,
                      teamA: match.teamA ? {
                        id: match.teamA.id,
                        name: getTeamDisplayName(match.teamA as any, currentDivision?.teamKind),
                        seed: standings.find(s => s.teamId === match.teamA?.id)?.rank
                      } : null,
                      teamB: match.teamB ? {
                        id: match.teamB.id,
                        name: getTeamDisplayName(match.teamB as any, currentDivision?.teamKind),
                        seed: standings.find(s => s.teamId === match.teamB?.id)?.rank
                      } : null,
                      games: match.games || [],
                      roundIndex: match.roundIndex,
                      stage: match.stage,
                      note: (match as any).note
                    }))}
                    showConnectingLines={showConnectingLines}
                    onMatchClick={(matchId) => {
                      // Handle match click - could open score input modal
                      console.log('Match clicked:', matchId)
                    }}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Mobile Layout */}
            <div className="lg:hidden">
              <Tabs defaultValue="rr" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="rr">RR</TabsTrigger>
                  <TabsTrigger value="playin" disabled={!hasPlayIn}>Play-In</TabsTrigger>
                  <TabsTrigger value="bracket">Bracket</TabsTrigger>
                </TabsList>
                
                <TabsContent value="rr" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Round Robin</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Mobile RR content */}
                      <div className="space-y-4">
                        <div className="text-sm text-gray-600">
                          <p>Teams: {standings.length}</p>
                          <p>Status: {isRRComplete ? 'Complete' : 'In Progress'}</p>
                        </div>
                        {/* Mobile table would go here */}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="playin">
                  <Card>
                    <CardHeader>
                      <CardTitle>Play-In</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center text-gray-500 py-8">
                        <p>Play-In matches will be shown here</p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="bracket">
                  <Card>
                    <CardHeader>
                      <CardTitle>Bracket</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <BracketPyramid
                        matches={playoffMatches.map(match => ({
                          id: match.id,
                          teamA: match.teamA ? {
                            id: match.teamA.id,
                            name: match.teamA.name,
                            seed: standings.find(s => s.teamId === match.teamA?.id)?.rank
                          } : null,
                          teamB: match.teamB ? {
                            id: match.teamB.id,
                            name: match.teamB.name,
                            seed: standings.find(s => s.teamId === match.teamB?.id)?.rank
                          } : null,
                          games: match.games || [],
                          roundIndex: match.roundIndex,
                          stage: match.stage,
                          note: (match as any).note
                        }))}
                        showConnectingLines={showConnectingLines}
                        onMatchClick={(matchId) => {
                          console.log('Match clicked:', matchId)
                        }}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            {/* Bracket Modal */}
            {showBracketModal && currentDivision && (
              <BracketModal
                isOpen={showBracketModal}
                onClose={() => setShowBracketModal(false)}
                divisionId={currentDivision.id}
              />
            )}
            <p className="text-gray-500">Select division</p>
          </div>
        )}
      </div>

      {/* Bracket Modal */}
      {showBracketModal && currentDivision && (
        <BracketModal
          isOpen={showBracketModal}
          onClose={() => setShowBracketModal(false)}
          divisionId={currentDivision.id}
        />
      )}
    </div>
  )
}
