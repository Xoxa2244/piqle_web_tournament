'use client'

import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save } from 'lucide-react'
export default function MatchupDetailPage({ params }: { params: Promise<{ id: string; matchupId: string }> }) {
  const router = useRouter()
  const [tournamentId, setTournamentId] = useState<string>('')
  const [matchupId, setMatchupId] = useState<string>('')
  const [showCourtModal, setShowCourtModal] = useState(false)
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')
  
  useEffect(() => {
    params.then((p) => {
      setTournamentId(p.id)
      setMatchupId(p.matchupId)
    })
  }, [params])

  // Get matchup data directly by ID
  const { data: currentMatchup } = trpc.indyMatchup.get.useQuery(
    { matchupId },
    {
      enabled: !!matchupId, // Only run query when matchupId is available
    }
  )

  const [homeRosters, setHomeRosters] = useState<any[]>([])
  const [awayRosters, setAwayRosters] = useState<any[]>([])

  const updateRoster = trpc.indyMatchup.updateRoster.useMutation({
    onSuccess: () => {
      // Refetch will happen automatically via React Query
      window.location.reload() // Simple refresh for now
    },
    onError: (error) => {
      alert('Error updating roster: ' + error.message)
    },
  })

  const updateTieBreak = trpc.indyMatchup.updateTieBreak.useMutation({
    onSuccess: () => {
      // Refetch will happen automatically via React Query
      window.location.reload() // Simple refresh for now
    },
    onError: (error) => {
      alert('Error updating tie-break: ' + error.message)
    },
  })

  const setCourt = trpc.indyMatchup.setCourt.useMutation({
    onSuccess: () => {
      setShowCourtModal(false)
      setSelectedCourtId('')
      window.location.reload()
    },
    onError: (error) => {
      alert('Error updating court: ' + error.message)
    },
  })

  // Initialize rosters from matchup data
  useEffect(() => {
    if (currentMatchup) {
      const homeRostersFromDb = currentMatchup.rosters?.filter((r: any) => r.teamId === currentMatchup.homeTeamId) || []
      const awayRostersFromDb = currentMatchup.rosters?.filter((r: any) => r.teamId === currentMatchup.awayTeamId) || []

      // Create a map of existing rosters by playerId to preserve letters
      const homeRosterMap = new Map(homeRostersFromDb.map((r: any) => [r.playerId, r]))
      const awayRosterMap = new Map(awayRostersFromDb.map((r: any) => [r.playerId, r]))

      // Always create rosters for all team players, preserving existing letters
      if (currentMatchup.homeTeam?.teamPlayers) {
        const newHome = currentMatchup.homeTeam.teamPlayers.map((tp: any) => {
          const existingRoster = homeRosterMap.get(tp.player.id)
          return {
            playerId: tp.player.id,
            teamId: currentMatchup.homeTeamId,
            isActive: existingRoster?.isActive || false,
            letter: existingRoster?.letter || null,
          }
        })
        setHomeRosters(newHome)
      } else {
        setHomeRosters(homeRostersFromDb)
      }

      if (currentMatchup.awayTeam?.teamPlayers) {
        const newAway = currentMatchup.awayTeam.teamPlayers.map((tp: any) => {
          const existingRoster = awayRosterMap.get(tp.player.id)
          return {
            playerId: tp.player.id,
            teamId: currentMatchup.awayTeamId,
            isActive: existingRoster?.isActive || false,
            letter: existingRoster?.letter || null,
          }
        })
        setAwayRosters(newAway)
      } else {
        setAwayRosters(awayRostersFromDb.map((r: any) => ({
          playerId: r.playerId,
          teamId: r.teamId,
          isActive: r.isActive,
          letter: r.letter,
        })))
      }
    }
  }, [currentMatchup])

  const handleAutoAssign = (teamRosters: any[], setRosters: any) => {
    const activePlayers = teamRosters.filter((r) => r.isActive)
    if (activePlayers.length !== 4) {
      alert('Please select exactly 4 active players first')
      return
    }

    const letters = ['A', 'B', 'C', 'D']
    const updated = teamRosters.map((roster, index) => {
      if (roster.isActive) {
        const letterIndex = activePlayers.indexOf(roster)
        return { ...roster, letter: letters[letterIndex] }
      }
      return roster
    })

    setRosters(updated)
  }

  const handleSaveRoster = () => {
    const allRosters = [...homeRosters, ...awayRosters]
    updateRoster.mutate({
      matchupId,
      rosters: allRosters.map((r) => ({
        playerId: r.playerId,
        teamId: r.teamId,
        isActive: r.isActive,
        letter: r.letter as 'A' | 'B' | 'C' | 'D' | null,
      })),
    })
  }

  const handleTieBreakChange = (winnerTeamId: string) => {
    updateTieBreak.mutate({
      matchupId,
      tieBreakWinnerTeamId: winnerTeamId,
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

  // Get tournament data for nav bar
  const { data: tournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    {
      enabled: !!tournamentId,
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

  const { data: courts } = trpc.indyCourt.list.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )

  if (!currentMatchup) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-gray-600">Loading matchup...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const needsTieBreak =
    currentMatchup.gamesWonHome === 6 &&
    currentMatchup.gamesWonAway === 6 &&
    !currentMatchup.tieBreakWinnerTeamId

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {currentMatchup.homeTeam.name} vs {currentMatchup.awayTeam.name}
            </h1>
            <p className="text-gray-600 mt-2">
              {currentMatchup.division.name} • {currentMatchup.gamesWonHome} - {currentMatchup.gamesWonAway}
            </p>
            <p className="text-gray-600 mt-1">
              Court: {currentMatchup.court?.name || 'Unassigned'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedCourtId(currentMatchup.court?.id || '')
                setShowCourtModal(true)
              }}
            >
              Change Court
            </Button>
            {getStatusBadge(currentMatchup.status)}
          </div>
        </div>
      </div>

      {showCourtModal && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Change Court</CardTitle>
            <CardDescription>
              Select a court for this matchup. Multiple matchups can share the same court.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!courts || courts.length === 0 ? (
              <p className="text-gray-600">No courts available. Create courts first.</p>
            ) : (
              <div className="flex items-center gap-4">
                <select
                  value={selectedCourtId}
                  onChange={(e) => setSelectedCourtId(e.target.value)}
                  className="pl-3 pr-10 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Unassigned</option>
                  {courts.map((court: any) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCourtModal(false)
                      setSelectedCourtId('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() =>
                      setCourt.mutate({
                        matchupId,
                        courtId: selectedCourtId ? selectedCourtId : null,
                      })
                    }
                    disabled={setCourt.isPending}
                  >
                    {setCourt.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Roster Management */}
      {currentMatchup.status === 'PENDING' || currentMatchup.status === 'READY' || currentMatchup.status === 'IN_PROGRESS' ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Assign Players & Letters</CardTitle>
            <CardDescription>
              Select 4 active players for each team and assign letters A, B, C, D
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              {/* Home Team */}
              <div>
                <h3 className="font-semibold mb-3">Home: {currentMatchup.homeTeam.name}</h3>
                <div className="space-y-2">
                  {homeRosters.map((roster, idx) => {
                    const player = currentMatchup.homeTeam?.teamPlayers?.find(
                      (tp: any) => tp.player.id === roster.playerId
                    )?.player
                    if (!player) return null

                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                        <input
                          type="checkbox"
                          checked={roster.isActive}
                          onChange={(e) => {
                            const updated = [...homeRosters]
                            updated[idx].isActive = e.target.checked
                            if (!e.target.checked) {
                              updated[idx].letter = null
                            }
                            setHomeRosters(updated)
                          }}
                        />
                        <span className="flex-1">
                          {player.firstName} {player.lastName}
                        </span>
                        {roster.isActive && (
                          <select
                            value={roster.letter || ''}
                            onChange={(e) => {
                              const updated = [...homeRosters]
                              updated[idx].letter = e.target.value || null
                              setHomeRosters(updated)
                            }}
                            className="pl-2 pr-10 py-1 border rounded text-sm"
                          >
                            <option value="">Select letter...</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => handleAutoAssign(homeRosters, setHomeRosters)}
                >
                  Auto-assign A/B/C/D
                </Button>
              </div>

              {/* Away Team */}
              <div>
                <h3 className="font-semibold mb-3">Away: {currentMatchup.awayTeam.name}</h3>
                <div className="space-y-2">
                  {awayRosters.map((roster, idx) => {
                    const player = currentMatchup.awayTeam?.teamPlayers?.find(
                      (tp: any) => tp.player.id === roster.playerId
                    )?.player
                    if (!player) return null

                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                        <input
                          type="checkbox"
                          checked={roster.isActive}
                          onChange={(e) => {
                            const updated = [...awayRosters]
                            updated[idx].isActive = e.target.checked
                            if (!e.target.checked) {
                              updated[idx].letter = null
                            }
                            setAwayRosters(updated)
                          }}
                        />
                        <span className="flex-1">
                          {player.firstName} {player.lastName}
                        </span>
                        {roster.isActive && (
                          <select
                            value={roster.letter || ''}
                            onChange={(e) => {
                              const updated = [...awayRosters]
                              updated[idx].letter = e.target.value || null
                              setAwayRosters(updated)
                            }}
                            className="pl-2 pr-10 py-1 border rounded text-sm"
                          >
                            <option value="">Select letter...</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => handleAutoAssign(awayRosters, setAwayRosters)}
                >
                  Auto-assign A/B/C/D
                </Button>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveRoster} disabled={updateRoster.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save Roster
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Tie-break */}
      {needsTieBreak && (
        <Card className="mb-6 border-yellow-300 bg-yellow-50">
          <CardHeader>
            <CardTitle>Tie-Break Required</CardTitle>
            <CardDescription>
              Games are 6-6. Please select the tie-break winner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button
                variant={currentMatchup.tieBreakWinnerTeamId === currentMatchup.homeTeamId ? 'default' : 'outline'}
                onClick={() => handleTieBreakChange(currentMatchup.homeTeamId)}
              >
                {currentMatchup.homeTeam.name}
              </Button>
              <Button
                variant={currentMatchup.tieBreakWinnerTeamId === currentMatchup.awayTeamId ? 'default' : 'outline'}
                onClick={() => handleTieBreakChange(currentMatchup.awayTeamId)}
              >
                {currentMatchup.awayTeam.name}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}

