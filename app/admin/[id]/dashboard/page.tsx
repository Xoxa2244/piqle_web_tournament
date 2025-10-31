'use client'

import { useState, useCallback } from 'react'
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
import Link from 'next/link'

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
  const [showConnectingLines, setShowConnectingLines] = useState(true)
  const [scoreModal, setScoreModal] = useState<{
    isOpen: boolean
    matchId: string | null
    teamAName: string
    teamBName: string
  }>({ isOpen: false, matchId: null, teamAName: '', teamBName: '' })

  const utils = trpc.useUtils()

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

  const handleExportCSV = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    if (!currentDivision?.id) {
      alert('Please select a division')
      return
    }
    
    if (!tournament) {
      alert('Tournament data not available')
      return
    }

    if (!utils) {
      alert('tRPC utils not available')
      return
    }

    try {
      
      // Use utils.fetch method
      const exportData = await utils.divisionStage.getMatchesForExport.fetch({
        divisionId: currentDivision.id,
      })

      if (!exportData) {
        alert('Failed to fetch match data')
        return
      }
      
      if (!exportData.matches || exportData.matches.length === 0) {
        alert('No matches found to export')
        return
      }

      // Determine match type based on teamKind
      const matchType = exportData.teamKind === 'SINGLES_1v1' ? 'S' : 'D'
      
      // Format tournament name with division
      const eventName = `${tournament.title} - ${exportData.name}`
      
      // Format date (use tournament start date or match date)
      const formatDate = (date: Date | string) => {
        const d = typeof date === 'string' ? new Date(date) : date
        return d.toISOString().split('T')[0] // YYYY-MM-DD
      }

      // Helper function to escape CSV values
      const escapeCSV = (value: string | number | null | undefined) => {
        if (value === null || value === undefined || value === '') return ''
        const str = String(value)
        // Only quote if contains comma, quotes, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      // Helper function to format player name
      const formatPlayerName = (firstName: string, lastName: string) => {
        return `${firstName} ${lastName}`.trim()
      }

      // Create CSV rows for matches
      const matchRows = exportData.matches.map((match: any) => {
        const teamAPlayers = match.teamA.teamPlayers || []
        const teamBPlayers = match.teamB.teamPlayers || []
        
        // Get players for team A
        const playerA1 = teamAPlayers[0]?.player
        const playerA2 = teamAPlayers[1]?.player
        const playerB1 = teamBPlayers[0]?.player
        const playerB2 = teamBPlayers[1]?.player

        // Format games scores (up to 5 games)
        const games = match.games || []
        const gameScores: (string | number)[] = []
        for (let i = 0; i < 5; i++) {
          if (games[i]) {
            gameScores.push(games[i].scoreA)
            gameScores.push(games[i].scoreB)
          } else {
            gameScores.push('')
            gameScores.push('')
          }
        }

        // Match date - use match createdAt or tournament startDate
        const matchDate = match.createdAt || exportData.tournament.startDate
        
        return [
          '', // Empty column A
          '', // Empty column B
          '', // Empty column C
          matchType, // matchType
          eventName, // event
          formatDate(matchDate), // date
          playerA1 ? formatPlayerName(playerA1.firstName, playerA1.lastName) : '', // playerA1
          '', // playerA1DuprId - leave empty for manual entry in DUPR
          '', // playerA1ExternalId
          playerA2 ? formatPlayerName(playerA2.firstName, playerA2.lastName) : '', // playerA2
          '', // playerA2DuprId - leave empty for manual entry in DUPR
          '', // playerA2ExternalId
          playerB1 ? formatPlayerName(playerB1.firstName, playerB1.lastName) : '', // playerB1
          '', // playerB1DuprId - leave empty for manual entry in DUPR
          '', // playerB1ExternalId
          playerB2 ? formatPlayerName(playerB2.firstName, playerB2.lastName) : '', // playerB2
          '', // playerB2DuprId - leave empty for manual entry in DUPR
          '', // playerB2ExternalId
          '', // Empty column S
          ...gameScores, // teamAGame1, teamBGame1, ..., teamAGame5, teamBGame5
        ]
      })

      // Create CSV content following DUPR template format
      const csvLines: string[] = []

      // Add instruction rows (lines 1-9 from template)
      csvLines.push(',,,Notes:,"Remove the rows that do not have match data (rows 1-10), including the header row, prior to import",,,,,,,,,,,,,,,,,,,,,,,')
      csvLines.push(',,,"Specify match type as ""S"" for singles or ""D"" for doubles",,,,,,,,,,,,,,,,,,,,,,,')
      csvLines.push(',,,,Include your event name with division and any other details you\'d like to include,,,,,,,,,,,,,,,,,,,,,,,')
      csvLines.push(',,,,Date format should be YYYY-MM-DD,,,,,,,,,,,,,,,,,,,,,,,')
      csvLines.push(',,,,Player DUPR IDs must be an exact match. The DUPR ID can be copy/pasted from a player\'s profile.,,,,,,,,,,,,,,,,,,,,,,,,')
      csvLines.push(',,,,Player names do not need to be an exact match. Only the DUPR ID is used to validate a player.,,,,,,,,,,,,,,,,,,,,,,,,')
      csvLines.push(',,,,Leave the External ID column blank,,,,,,,,,,,,,,,,,,,,,,,')
      csvLines.push(',,,,"Do NOT delete blank columns (A, B, C, S)",,,,,,,,,,,,,,,,,,,,,,,,')
      csvLines.push(',,,,,,,,,,,,,,,,,,,,,,,,,,,,')
      
      // Add header row (line 10) - first 3 columns must be empty
      csvLines.push(',,,matchType,event,date,playerA1,playerA1DuprId,playerA1ExternalId,playerA2,playerA2DuprId,playerA2ExternalId,playerB1,playerB1DuprId,playerB1ExternalId,playerB2,playerB2DuprId,playerB2ExternalId,,teamAGame1,teamBGame1,teamAGame2,teamBGame2,teamAGame3,teamBGame3,teamAGame4,teamBGame4,teamAGame5,teamBGame5')
      
      // Add match rows - ensure proper CSV formatting
      matchRows.forEach((row: any[]) => {
        const formattedRow = row.map((cell: any) => {
          if (cell === null || cell === undefined || cell === '') return ''
          const str = String(cell)
          // Quote values containing commas, quotes, or newlines
          if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        }).join(',')
        csvLines.push(formattedRow)
      })

      const csvContent = csvLines.join('\n')

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `${exportData.name}_matches_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Error exporting CSV: ${errorMessage}`)
    }
  }, [currentDivision, tournament, utils])

  if (tournamentLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!tournament) {
    return <div className="flex items-center justify-center min-h-screen">Tournament not found</div>
  }

  if (tournament.divisions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No Access to Divisions</h2>
          <p className="text-gray-600 mb-6">
            You don&apos;t have access to any divisions in this tournament.
            Please contact the tournament administrator to request access.
          </p>
          <Link
            href={`/admin/${tournamentId}`}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Back to Tournament
          </Link>
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Division Dashboard</h1>
              <p className="text-gray-600">{tournament.title}</p>
              {/* Status badges hidden per user request */}
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
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleExportCSV}
                        >
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
            <p className="text-gray-500">Select division</p>
          </div>
        )}
      </div>
    </div>
  )
}
