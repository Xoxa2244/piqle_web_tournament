'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar, Trash2, Edit, Upload } from 'lucide-react'
export default function MatchDaysPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [tournamentId, setTournamentId] = useState<string>('')
  
  useEffect(() => {
    params.then((p) => {
      setTournamentId(p.id)
    })
  }, [params])

  const [showAddModal, setShowAddModal] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: tournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    {
      enabled: !!tournamentId, // Only run query when tournamentId is available
    }
  )
  const { data: matchDays, refetch: refetchMatchDays } = trpc.matchDay.list.useQuery(
    {
      tournamentId,
    },
    {
      enabled: !!tournamentId, // Only run query when tournamentId is available
    }
  )
  const { data: divisions } = trpc.division.list.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
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

  const createMatchDay = trpc.matchDay.create.useMutation({
    onSuccess: () => {
      setShowAddModal(false)
      setNewDate('')
      refetchMatchDays()
    },
    onError: (error) => {
      alert('Error creating match day: ' + error.message)
    },
  })

  const createMatchup = trpc.indyMatchup.create.useMutation()

  const deleteMatchDay = trpc.matchDay.delete.useMutation({
    onSuccess: () => {
      refetchMatchDays()
    },
    onError: (error) => {
      alert('Error deleting match day: ' + error.message)
    },
  })

  const updateStatus = trpc.matchDay.updateStatus.useMutation({
    onSuccess: () => {
      refetchMatchDays()
    },
    onError: (error) => {
      alert('Error updating status: ' + error.message)
    },
  })

  const handleCreate = () => {
    if (!newDate) {
      alert('Please select a date')
      return
    }

    createMatchDay.mutate({
      tournamentId,
      date: newDate,
    })
  }

  const normalizeName = (value: string) => value.trim().toLowerCase()

  const parseMatchupCsv = (csvText: string) => {
    const lines = csvText.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0) {
      throw new Error('CSV file is empty')
    }

    const headerLine = lines[0]
    const delimiter = headerLine.includes(';') ? ';' : ','
    const headers = headerLine.split(delimiter).map((h) => h.trim())
    const requiredHeaders = ['Division', 'Date', 'Team 1', 'Team 2']
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h))
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`)
    }

    const headerIndex = new Map(headers.map((h, idx) => [h, idx]))
    const rows = lines.slice(1).map((line) => line.split(delimiter).map((v) => v.trim()))

    return rows.map((row, index) => ({
      divisionName: row[headerIndex.get('Division') ?? -1],
      dateRaw: row[headerIndex.get('Date') ?? -1],
      team1Name: row[headerIndex.get('Team 1') ?? -1],
      team2Name: row[headerIndex.get('Team 2') ?? -1],
      rowNumber: index + 2,
    }))
  }

  const parseDateWithYear = (value: string, year: number) => {
    if (!value) {
      return null
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    const parts = value.split(',').map((part) => part.trim())
    const datePart = parts.length > 1 ? parts.slice(1).join(' ') : value
    const parsed = new Date(`${datePart}, ${year}`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const handleCsvImport = async () => {
    if (!csvFile) {
      alert('Please select a CSV file')
      return
    }
    if (!divisions || divisions.length === 0) {
      alert('No divisions found. Please create divisions first.')
      return
    }
    if (!matchDays) {
      alert('Match days data is not loaded yet.')
      return
    }

    setIsImporting(true)
    try {
      const csvText = await csvFile.text()
      const entries = parseMatchupCsv(csvText)

      const divisionMap = new Map(divisions.map((division: any) => [normalizeName(division.name), division]))
      const teamMapByDivision = new Map(
        divisions.map((division: any) => [
          division.id,
          new Map(division.teams.map((team: any) => [normalizeName(team.name), team])),
        ])
      )

      const year = tournament?.startDate ? new Date(tournament.startDate).getFullYear() : new Date().getFullYear()
      const existingDaysByDate = new Map(
        matchDays.map((day) => [
          new Date(day.date).toISOString().split('T')[0],
          day,
        ])
      )

      const existingMatchups = new Set<string>()
      matchDays.forEach((day) => {
        day.matchups?.forEach((matchup: any) => {
          existingMatchups.add(`${day.id}:${matchup.homeTeamId}:${matchup.awayTeamId}`)
          existingMatchups.add(`${day.id}:${matchup.awayTeamId}:${matchup.homeTeamId}`)
        })
      })

      const createdDays = new Map<string, string>()
      let createdMatchups = 0
      const errors: string[] = []

      for (const entry of entries) {
        const division = divisionMap.get(normalizeName(entry.divisionName))
        if (!division) {
          errors.push(`Row ${entry.rowNumber}: Division not found - ${entry.divisionName}`)
          continue
        }

        const teamMap = teamMapByDivision.get(division.id) || new Map()
        const homeTeam = teamMap.get(normalizeName(entry.team1Name))
        const awayTeam = teamMap.get(normalizeName(entry.team2Name))
        if (!homeTeam || !awayTeam) {
          errors.push(`Row ${entry.rowNumber}: Team not found - ${entry.team1Name} vs ${entry.team2Name}`)
          continue
        }

        const parsedDate = parseDateWithYear(entry.dateRaw, year)
        if (!parsedDate) {
          errors.push(`Row ${entry.rowNumber}: Invalid date - ${entry.dateRaw}`)
          continue
        }

        const dateKey = parsedDate.toISOString().split('T')[0]
        let dayId = existingDaysByDate.get(dateKey)?.id || createdDays.get(dateKey)
        if (!dayId) {
          const createdDay = await createMatchDay.mutateAsync({
            tournamentId,
            date: dateKey,
          })
          dayId = createdDay.id
          createdDays.set(dateKey, dayId)
        }

        const matchupKey = `${dayId}:${homeTeam.id}:${awayTeam.id}`
        if (existingMatchups.has(matchupKey)) {
          continue
        }

        await createMatchup.mutateAsync({
          matchDayId: dayId,
          divisionId: division.id,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
        })
        existingMatchups.add(matchupKey)
        existingMatchups.add(`${dayId}:${awayTeam.id}:${homeTeam.id}`)
        createdMatchups += 1
      }

      await refetchMatchDays()
      setCsvFile(null)

      if (errors.length > 0) {
        alert(`Import completed with warnings:\n${errors.join('\n')}`)
      } else {
        alert(`Import completed. Matchups created: ${createdMatchups}`)
      }
    } catch (error: any) {
      alert(error?.message || 'CSV import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const handleDelete = (matchDayId: string) => {
    if (!confirm('Are you sure you want to delete this match day?')) {
      return
    }

    deleteMatchDay.mutate({ matchDayId })
  }

  const handleStatusChange = (matchDayId: string, status: 'DRAFT' | 'IN_PROGRESS' | 'FINALIZED') => {
    updateStatus.mutate({ matchDayId, status })
  }

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="outline">Draft</Badge>
      case 'IN_PROGRESS':
        return <Badge variant="default" className="bg-blue-500">In Progress</Badge>
      case 'FINALIZED':
        return <Badge variant="default" className="bg-green-500">Finalized</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const isLeagueRoundRobin = tournament?.format === 'LEAGUE_ROUND_ROBIN'

  if (tournament?.format !== 'INDY_LEAGUE' && tournament?.format !== 'LEAGUE_ROUND_ROBIN') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600">
              This page is only available for Indy League and League Round Robin tournaments.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Match Days</h1>
            <p className="text-gray-600 mt-2">
              Manage match days for {tournament?.title}
            </p>
          </div>
        <div className="flex items-center gap-2">
          {!isLeagueRoundRobin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                CSV Import
              </Button>
              <Button
                variant="outline"
                onClick={handleCsvImport}
                disabled={!csvFile || isImporting}
              >
                {isImporting ? 'Importing...' : 'Upload'}
              </Button>
            </>
          )}
          <Button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Match Day
          </Button>
        </div>
      </div>

      {showAddModal && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add New Match Day</CardTitle>
            <CardDescription>
              Select a date for the new match day. The date must be unique for this tournament.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label htmlFor="matchDayDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Date *
                </label>
                <input
                  type="date"
                  id="matchDayDate"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full pl-3 pr-7 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddModal(false)
                    setNewDate('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMatchDay.isPending}
                >
                  {createMatchDay.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {matchDays && matchDays.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No match days created yet.</p>
            <p className="text-sm text-gray-500 mt-2">
              Click &quot;Add Match Day&quot; to create your first match day.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {matchDays?.map((matchDay) => (
            <Card key={matchDay.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-5 w-5 text-gray-500" />
                        <h3 className="text-lg font-semibold">
                          {formatDate(matchDay.date)}
                        </h3>
                        {getStatusBadge(matchDay.status)}
                      </div>
                      {!isLeagueRoundRobin && (
                        <p className="text-sm text-gray-500">
                          {matchDay.matchups?.length || 0} matchup(s)
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={matchDay.status}
                      onChange={(e) =>
                        handleStatusChange(
                          matchDay.id,
                          e.target.value as 'DRAFT' | 'IN_PROGRESS' | 'FINALIZED'
                        )
                      }
                      className="pl-3 pr-7 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={updateStatus.isPending}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="FINALIZED">Finalized</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(isLeagueRoundRobin ? `/admin/${tournamentId}/stages` : `/admin/${tournamentId}/match-days/${matchDay.id}`)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      {isLeagueRoundRobin ? 'Stages' : 'Manage'}
                    </Button>
                    {matchDay.status !== 'FINALIZED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(matchDay.id)}
                        disabled={deleteMatchDay.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
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

