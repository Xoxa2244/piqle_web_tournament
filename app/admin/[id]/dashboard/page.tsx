'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
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
  const tournamentId = params.id as string
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  const [showMetrics, setShowMetrics] = useState<'seed' | 'wins' | 'diff'>('seed')
  const [showConnectingLines, setShowConnectingLines] = useState(true)
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

  // Set first division as default
  const currentDivision = tournament?.divisions.find(d => d.id === selectedDivisionId) || 
                         tournament?.divisions[0]
  
  if (currentDivision && !selectedDivisionId) {
    setSelectedDivisionId(currentDivision.id)
  }

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
      alert(`Ошибка: ${error.message}`)
    },
  })

  const transitionToNextStageMutation = trpc.divisionStage.transitionToNextStage.useMutation({
    onSuccess: () => {
      refetchStage()
      refetchTournament()
    },
    onError: (error) => {
      alert(`Ошибка: ${error.message}`)
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
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>
  }

  if (!tournament) {
    return <div className="flex items-center justify-center min-h-screen">Турнир не найден</div>
  }

  if (tournament.divisions.length === 0) {
    return <div className="flex items-center justify-center min-h-screen">Нет дивизионов</div>
  }

  const standings = standingsData?.standings || []
  const rrMatches = divisionStage?.matches?.filter(m => m.stage === 'ROUND_ROBIN') || []
  const playInMatches = divisionStage?.matches?.filter(m => m.stage === 'PLAY_IN') || []
  const playoffMatches = divisionStage?.matches?.filter(m => m.stage === 'ELIMINATION') || []

  const isRRComplete = divisionStage?.stage === 'RR_COMPLETE' || 
                      (divisionStage?.stage !== 'RR_IN_PROGRESS' && rrMatches.length > 0)
  const hasPlayIn = playInMatches.length > 0
  const isPlayInComplete = divisionStage?.stage === 'PLAY_IN_COMPLETE'
  const currentStage = divisionStage?.stage || 'RR_IN_PROGRESS'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Division Dashboard</h1>
              <p className="text-gray-600">{tournament.title}</p>
              {currentDivision && (
                <div className="mt-2">
                  <Badge variant="outline" className="mr-2">
                    {currentStage.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    {currentDivision.teams.length} команд
                  </span>
                  {(currentStage.endsWith('_COMPLETE') && !currentStage.includes('DIVISION_COMPLETE')) && (
                    <Button 
                      size="sm" 
                      className="ml-2"
                      onClick={handleTransitionToNextStage}
                      disabled={transitionToNextStageMutation.isPending}
                    >
                      {transitionToNextStageMutation.isPending ? 'Переход...' : 'Следующая стадия'}
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {/* Division Switcher */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
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
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {tournament.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
              
              <Button
                variant="outline"
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
                          <p>Target bracket: {currentDivision.teams.length <= 4 ? '4' : 
                                             currentDivision.teams.length <= 8 ? '8' : '16'}</p>
                        </div>
                        
                        {!isRRComplete && (
                          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                            <div className="flex items-center space-x-1">
                              <AlertCircle className="h-4 w-4 text-yellow-600" />
                              <span className="text-sm text-yellow-800">
                                Не все результаты внесены — посев и плей-офф недоступны
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Tiebreakers:</span>
                          <Info className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <p>1. Match Wins</p>
                          <p>2. Point Diff (H2H)</p>
                          <p>3. Point Diff (Overall)</p>
                          <p>4. Points For</p>
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
                            {standings.map((team: TeamStanding) => (
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
                                  {team.rank <= 2 && hasPlayIn ? (
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
                            ))}
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
                      Предварительный этап для сокращения до {currentDivision.teams.length <= 4 ? '4' : 
                                                           currentDivision.teams.length <= 8 ? '8' : '16'} участников
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4">
                      {playInMatches.map((match) => (
                        <div key={match.id} className="flex-1 min-w-[200px]">
                          <div className={`p-4 border rounded-lg ${
                            match.games.length > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="text-center">
                                <div className="font-medium">#{match.teamA?.name || 'TBD'}</div>
                                <div className="text-sm text-gray-600">{match.teamA?.name || 'TBD'}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-bold">vs</div>
                                {match.games.length > 0 && (
                                  <div className="text-sm">
                                    {match.games[0]?.scoreA || 0} - {match.games[0]?.scoreB || 0}
                                  </div>
                                )}
                              </div>
                              <div className="text-center">
                                <div className="font-medium">#{match.teamB?.name || 'TBD'}</div>
                                <div className="text-sm text-gray-600">{match.teamB?.name || 'TBD'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bracket Section */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Playoff Bracket</CardTitle>
                    <div className="flex items-center space-x-4">
                      <select
                        value={showMetrics}
                        onChange={(e) => setShowMetrics(e.target.value as 'seed' | 'wins' | 'diff')}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="seed">Show Seed</option>
                        <option value="wins">Show Wins/Losses</option>
                        <option value="diff">Show Point Diff</option>
                      </select>
                    </div>
                  </div>
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
                      stage: match.stage
                    }))}
                    showMetrics={showMetrics}
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
                          stage: match.stage
                        }))}
                        showMetrics={showMetrics}
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
            <p className="text-gray-500">Выберите дивизион</p>
          </div>
        )}
      </div>
    </div>
  )
}
