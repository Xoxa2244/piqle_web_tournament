'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Trophy, 
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowLeft
} from 'lucide-react'
import BracketPyramid from '@/components/BracketPyramid'
import BracketPyramidNew from '@/components/BracketPyramidNew'
import BracketModal from '@/components/BracketModal'
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

export default function PublicCoursePage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  const [showConnectingLines, setShowConnectingLines] = useState(true)
  const [showBracketModal, setShowBracketModal] = useState(false)

  // Get tournament data (using public endpoint)
  const { data: tournament, isLoading: tournamentLoading } = trpc.public.getTournamentById.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  // Set first division as default
  const divisions = tournament?.divisions as any[]
  const currentDivision = divisions?.find((d: any) => d.id === selectedDivisionId) || 
                         divisions?.[0]
  
  if (currentDivision && !selectedDivisionId) {
    setSelectedDivisionId(currentDivision.id)
  }

  // Get standings for current division (using public endpoint)
  const { data: standingsData, isLoading: standingsLoading } = trpc.public.getPublicStandings.useQuery(
    { divisionId: currentDivision?.id || '' },
    { enabled: !!currentDivision?.id }
  )

  // Get division stage (using public endpoint)
  const { data: divisionStage, isLoading: stageLoading } = trpc.public.getPublicDivisionStage.useQuery(
    { divisionId: currentDivision?.id || '' },
    { enabled: !!currentDivision?.id }
  )

  // Get bracket structure (play-in + elimination)
  const {
    data: bracketData,
    isLoading: bracketLoading,
  } = (trpc as any).public.getBracketPublic.useQuery(
    { divisionId: currentDivision?.id || '' },
    {
      enabled: !!currentDivision?.id,
      refetchOnWindowFocus: false,
    }
  )

  if (tournamentLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!tournament) {
    return <div className="flex items-center justify-center min-h-screen">Tournament not found</div>
  }

  if (tournament.divisions.length === 0) {
    return <div className="flex items-center justify-center min-h-screen">No divisions</div>
  }

  const standings = standingsData?.standings || []
  const rrMatches = divisionStage?.matches?.filter(m => m.stage === 'ROUND_ROBIN') || []
  const playInMatches = divisionStage?.matches?.filter(m => m.stage === 'PLAY_IN') || []
  const playoffMatches = divisionStage?.matches?.filter(m => m.stage === 'ELIMINATION') || []

  const bracketMatches = bracketData?.allMatches ?? []

  const legacyBracketMatches =
    playoffMatches.map(match => ({
      id: match.id,
      teamA: match.teamA
        ? {
            id: match.teamA.id,
            name: getTeamDisplayName(match.teamA as any, currentDivision?.teamKind),
            seed: standings.find(s => s.teamId === match.teamA?.id)?.rank,
          }
        : null,
      teamB: match.teamB
        ? {
            id: match.teamB.id,
            name: getTeamDisplayName(match.teamB as any, currentDivision?.teamKind),
            seed: standings.find(s => s.teamId === match.teamB?.id)?.rank,
          }
        : null,
      games: match.games || [],
      roundIndex: match.roundIndex,
      stage: match.stage,
      note: (match as any).note,
    })) ?? []

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Desktop Header */}
          <div className="hidden sm:flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Link
                href="/scoreboard"
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-sm font-medium">Back to Tournaments</span>
              </Link>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-2xl font-bold text-gray-900">
                Tournament Results: {tournament.title}
              </h1>
            </div>
            
            {/* Show Bracket Button */}
            {isRRComplete && currentDivision && (
              <button
                onClick={() => setShowBracketModal(true)}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors mr-4"
              >
                <Trophy className="h-4 w-4" />
                <span>Show Bracket</span>
              </button>
            )}

            {/* Division Switcher */}
            <div className="flex items-center space-x-2">
              <button
                className="p-2 hover:bg-gray-100 rounded-md"
                onClick={() => {
                  const divs = tournament.divisions as any[]
                  const currentIndex = divs.findIndex((d: any) => d.id === selectedDivisionId)
                  const prevIndex = currentIndex > 0 ? currentIndex - 1 : divs.length - 1
                  setSelectedDivisionId(divs[prevIndex].id)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
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
              
              <button
                className="p-2 hover:bg-gray-100 rounded-md"
                onClick={() => {
                  const divs = tournament.divisions as any[]
                  const currentIndex = divs.findIndex((d: any) => d.id === selectedDivisionId)
                  const nextIndex = currentIndex < divs.length - 1 ? currentIndex + 1 : 0
                  setSelectedDivisionId(divs[nextIndex].id)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mobile Header */}
          <div className="sm:hidden py-4 space-y-3">
            {/* Back Button */}
            <div>
              <Link
                href="/scoreboard"
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-sm font-medium">Back to Tournaments</span>
              </Link>
            </div>
            
            {/* Tournament Title */}
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                Tournament Results: {tournament.title}
              </h1>
            </div>
            
            {/* Division Switcher */}
            <div className="flex items-center justify-center space-x-2">
              <button
                className="p-2 hover:bg-gray-100 rounded-md"
                onClick={() => {
                  const divs = tournament.divisions as any[]
                  const currentIndex = divs.findIndex((d: any) => d.id === selectedDivisionId)
                  const prevIndex = currentIndex > 0 ? currentIndex - 1 : divs.length - 1
                  setSelectedDivisionId(divs[prevIndex].id)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              <select
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center min-w-0 flex-1"
              >
                {(tournament.divisions as any[]).map((division: any) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
              
              <button
                className="p-2 hover:bg-gray-100 rounded-md"
                onClick={() => {
                  const divs = tournament.divisions as any[]
                  const currentIndex = divs.findIndex((d: any) => d.id === selectedDivisionId)
                  const nextIndex = currentIndex < divs.length - 1 ? currentIndex + 1 : 0
                  setSelectedDivisionId(divs[nextIndex].id)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
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
                {/* RR Table - Full Width */}
                <div className="col-span-12">
                  <Card>
                    <CardHeader>
                      <CardTitle>Round Robin</CardTitle>
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
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Tournament Info */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <span>Teams: {standings.length}</span>
                          <span>Status: {isRRComplete ? 'Complete' : 'In Progress'}</span>
                        </div>
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
                                  <div className="text-sm font-medium text-gray-900 truncate" title={match.teamA?.name || 'TBD'}>
                                    {match.teamA?.name || 'TBD'}
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
                                  }`} title={match.teamB?.name || 'TBD'}>
                                    {match.teamB?.name || 'TBD'}
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
                  {bracketLoading ? (
                    <div className="py-8 text-center text-gray-500">Loading bracket…</div>
                  ) : bracketMatches.length > 0 ? (
                    <BracketPyramidNew
                      matches={bracketMatches}
                      showConnectingLines={showConnectingLines}
                      totalTeams={bracketData?.standings?.length}
                      bracketSize={bracketData?.bracketSize}
                      onMatchClick={(matchId) => {
                        console.log('Match clicked:', matchId)
                      }}
                    />
                  ) : legacyBracketMatches.length > 0 ? (
                    <BracketPyramid
                      matches={legacyBracketMatches}
                      showConnectingLines={showConnectingLines}
                      onMatchClick={(matchId) => {
                        console.log('Match clicked:', matchId)
                      }}
                    />
                  ) : (
                    <div className="py-8 text-center text-gray-500">
                      Bracket not available yet. Generate Play-In or Play-Off matches to view the structure.
                    </div>
                  )}
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
                                <td className="py-2 text-center">
                                  {team.rank <= autoQualifiedCount && hasPlayIn ? (
                                    <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                                      Auto
                                    </Badge>
                                  ) : hasPlayIn ? (
                                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                                      Play-in
                                    </Badge>
                                  ) : (
                                    <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                                      Qualified
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Tournament Info */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <span>Teams: {standings.length}</span>
                          <span>Status: {isRRComplete ? 'Complete' : 'In Progress'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="playin">
                  <Card>
                    <CardHeader>
                      <CardTitle>Play-In</CardTitle>
                      <p className="text-sm text-gray-600">
                        Preliminary stage to reduce to the required number of participants
                      </p>
                    </CardHeader>
                    <CardContent>
                      {hasPlayIn ? (
                        <div className="space-y-3">
                          {playInMatches.map((match) => {
                            const hasResults = match.games && match.games.length > 0
                            const scoreA = hasResults ? match.games[0]?.scoreA : null
                            const scoreB = hasResults ? match.games[0]?.scoreB : null
                            const winner = scoreA !== null && scoreB !== null ? (scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null) : null
                            
                            // Get seeds from standings
                            const teamASeed = standings.find(s => s.teamId === match.teamA?.id)?.rank
                            const teamBSeed = standings.find(s => s.teamId === match.teamB?.id)?.rank
                            
                            return (
                              <div key={match.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
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
                                <div className="space-y-2">
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
                      ) : (
                        <div className="text-center text-gray-500 py-8">
                          <p>Play-In matches not started yet</p>
                          <p className="text-sm text-gray-400 mt-1">Matches will appear here once Play-In begins</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="bracket">
                  <Card>
                    <CardHeader>
                      <CardTitle>Bracket</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {bracketLoading ? (
                        <div className="py-6 text-center text-gray-500 text-sm">Loading bracket…</div>
                      ) : bracketMatches.length > 0 ? (
                        <BracketPyramidNew
                          matches={bracketMatches}
                          showConnectingLines={showConnectingLines}
                          totalTeams={bracketData?.standings?.length}
                          bracketSize={bracketData?.bracketSize}
                          onMatchClick={(matchId) => {
                            console.log('Match clicked:', matchId)
                          }}
                        />
                      ) : legacyBracketMatches.length > 0 ? (
                        <BracketPyramid
                          matches={legacyBracketMatches}
                          showConnectingLines={showConnectingLines}
                          onMatchClick={(matchId) => {
                            console.log('Match clicked:', matchId)
                          }}
                        />
                      ) : (
                        <div className="py-6 text-center text-gray-500 text-sm">
                          Bracket not available yet. Generate Play-In or Play-Off matches to view the structure.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
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
          isPublic={true}
        />
      )}
    </div>
  )
}
