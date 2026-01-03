'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, RefreshCw, Users, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import TournamentNavBar from '@/components/TournamentNavBar'

export default function MatchDayDetailPage({ params }: { params: Promise<{ id: string; dayId: string }> }) {
  const router = useRouter()
  const [tournamentId, setTournamentId] = useState<string>('')
  const [matchDayId, setMatchDayId] = useState<string>('')
  
  useEffect(() => {
    params.then((p) => {
      setTournamentId(p.id)
      setMatchDayId(p.dayId)
    })
  }, [params])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState<string>('')
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState<string>('')

  const { data: matchDay, refetch: refetchMatchDay } = trpc.matchDay.get.useQuery(
    {
      matchDayId,
    },
    {
      enabled: !!matchDayId, // Only run query when matchDayId is available
    }
  )

  const { data: tournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    {
      enabled: !!tournamentId, // Only run query when tournamentId is available
    }
  )

  // Check if user has admin access
  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  const isOwner = tournament?.userAccessInfo?.isOwner

  // Get pending access requests count (only for owner)
  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0

  // Get all match days for the tournament to enable day switching
  const { data: allMatchDays } = trpc.matchDay.list.useQuery(
    {
      tournamentId,
    },
    {
      enabled: !!tournamentId, // Only run query when tournamentId is available
    }
  )

  const { data: matchups, refetch: refetchMatchups } = trpc.indyMatchup.list.useQuery(
    {
      matchDayId,
    },
    {
      enabled: !!matchDayId, // Only run query when matchDayId is available
    }
  )

  const createMatchup = trpc.indyMatchup.create.useMutation({
    onSuccess: () => {
      setShowCreateModal(false)
      setSelectedDivisionId('')
      setSelectedHomeTeamId('')
      setSelectedAwayTeamId('')
      refetchMatchups()
    },
    onError: (error) => {
      alert('Error creating matchup: ' + error.message)
    },
  })

  const swapHomeAway = trpc.indyMatchup.swapHomeAway.useMutation({
    onSuccess: () => {
      refetchMatchups()
    },
    onError: (error) => {
      alert('Error swapping teams: ' + error.message)
    },
  })

  const generateGames = trpc.indyMatchup.generateGames.useMutation({
    onSuccess: () => {
      refetchMatchups()
    },
    onError: (error) => {
      alert('Error generating games: ' + error.message)
    },
  })

  const handleCreate = () => {
    if (!selectedDivisionId || !selectedHomeTeamId || !selectedAwayTeamId) {
      alert('Please select division and both teams')
      return
    }

    if (selectedHomeTeamId === selectedAwayTeamId) {
      alert('Home and away teams cannot be the same')
      return
    }

    createMatchup.mutate({
      matchDayId,
      divisionId: selectedDivisionId,
      homeTeamId: selectedHomeTeamId,
      awayTeamId: selectedAwayTeamId,
    })
  }

  const handleSwap = (matchupId: string) => {
    swapHomeAway.mutate({ matchupId })
  }

  const handleGenerateGames = (matchupId: string) => {
    if (!confirm('Generate 12 games for this matchup? This action cannot be undone.')) {
      return
    }
    generateGames.mutate({ matchupId })
  }

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline">Pending</Badge>
      case 'READY':
        return <Badge variant="default" className="bg-yellow-500">Ready</Badge>
      case 'IN_PROGRESS':
        return <Badge variant="default" className="bg-blue-500">In Progress</Badge>
      case 'COMPLETED':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Group matchups by division
  const matchupsByDivision = matchups?.reduce((acc: any, matchup: any) => {
    const divName = matchup.division.name
    if (!acc[divName]) {
      acc[divName] = []
    }
    acc[divName].push(matchup)
    return acc
  }, {} as Record<string, any[]>)

  // Find current day index and get previous/next days
  const currentDayIndex = allMatchDays?.findIndex(d => d.id === matchDayId) ?? -1
  const previousDay = currentDayIndex > 0 ? allMatchDays?.[currentDayIndex - 1] : null
  const nextDay = currentDayIndex >= 0 && currentDayIndex < (allMatchDays?.length ?? 0) - 1 
    ? allMatchDays?.[currentDayIndex + 1] 
    : null

  const handleDayChange = (newDayId: string) => {
    router.push(`/admin/${tournamentId}/match-days/${newDayId}`)
  }

  if (!matchDay) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TournamentNavBar
          tournamentTitle={tournament?.title}
          isAdmin={isAdmin}
          isOwner={isOwner}
          pendingRequestsCount={pendingRequestsCount}
          tournamentFormat={tournament?.format}
        />
        <div className="max-w-6xl mx-auto p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-gray-600">Loading match day...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <TournamentNavBar
        tournamentTitle={tournament?.title}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
        tournamentFormat={tournament?.format}
      />

      <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => router.push(`/admin/${tournamentId}/match-days`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Match Days
        </Button>
        
        {/* Day Selector */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{formatDate(matchDay.date)}</h1>
            <p className="text-gray-600 mt-2">
              Manage matchups for this match day
            </p>
          </div>
          
          {/* Day Navigation */}
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => previousDay && handleDayChange(previousDay.id)}
              disabled={!previousDay}
              title={previousDay ? `Go to ${formatDate(previousDay.date)}` : 'No previous day'}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <select
              value={matchDayId}
              onChange={(e) => handleDayChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {allMatchDays?.map((day) => (
                <option key={day.id} value={day.id}>
                  {formatDate(day.date)}
                </option>
              ))}
            </select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => nextDay && handleDayChange(nextDay.id)}
              disabled={!nextDay}
              title={nextDay ? `Go to ${formatDate(nextDay.date)}` : 'No next day'}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Matchup</CardTitle>
            <CardDescription>
              Select division and teams for the matchup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Division *
                </label>
                <select
                  value={selectedDivisionId}
                  onChange={(e) => {
                    setSelectedDivisionId(e.target.value)
                    setSelectedHomeTeamId('')
                    setSelectedAwayTeamId('')
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select division...</option>
                  {tournament?.divisions?.map((div: any) => (
                    <option key={div.id} value={div.id}>
                      {div.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDivisionId && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Home Team *
                    </label>
                    <select
                      value={selectedHomeTeamId}
                      onChange={(e) => setSelectedHomeTeamId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select home team...</option>
                      {tournament?.divisions
                        ?.find((d: any) => d.id === selectedDivisionId)
                        ?.teams?.map((team: any) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Away Team *
                    </label>
                    <select
                      value={selectedAwayTeamId}
                      onChange={(e) => setSelectedAwayTeamId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select away team...</option>
                      {tournament?.divisions
                        ?.find((d: any) => d.id === selectedDivisionId)
                        ?.teams?.filter((team: any) => team.id !== selectedHomeTeamId)
                        ?.map((team: any) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false)
                    setSelectedDivisionId('')
                    setSelectedHomeTeamId('')
                    setSelectedAwayTeamId('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMatchup.isPending}
                >
                  {createMatchup.isPending ? 'Creating...' : 'Create Matchup'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Matchups</h2>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Matchup
        </Button>
      </div>

      {!matchups || matchups.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No matchups created yet.</p>
            <p className="text-sm text-gray-500 mt-2">
              Click &quot;Add Matchup&quot; to create your first matchup.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(matchupsByDivision || {}).map(([divisionName, divMatchups]) => (
            <Card key={divisionName}>
              <CardHeader>
                <CardTitle>{divisionName}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(divMatchups as any[]).map((matchup: any) => (
                    <div
                      key={matchup.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="font-semibold">
                              {matchup.homeTeam.name} vs {matchup.awayTeam.name}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {matchup.gamesWonHome} - {matchup.gamesWonAway}
                            </div>
                          </div>
                          {getStatusBadge(matchup.status)}
                        </div>
                        <div className="flex items-center gap-2">
                          {matchup.status === 'READY' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateGames(matchup.id)}
                              disabled={generateGames.isPending}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Generate Games
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSwap(matchup.id)}
                            disabled={swapHomeAway.isPending}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Swap
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              router.push(`/admin/${tournamentId}/matchups/${matchup.id}`)
                            }
                          >
                            Manage Roster & Scores
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

