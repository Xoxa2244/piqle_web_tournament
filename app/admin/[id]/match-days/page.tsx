'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar, Trash2, Edit } from 'lucide-react'

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

  const { data: tournament } = trpc.tournament.get.useQuery({ id: tournamentId })
  const { data: matchDays, refetch: refetchMatchDays } = trpc.matchDay.list.useQuery({
    tournamentId,
  })

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

  if (tournament?.format !== 'INDY_LEAGUE') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600">
              This page is only available for IndyLeague tournaments.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Match Days</h1>
          <p className="text-gray-600 mt-2">
            Manage match days for {tournament?.title}
          </p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Match Day
        </Button>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <p className="text-sm text-gray-500">
                        {matchDay.matchups?.length || 0} matchup(s)
                      </p>
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
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={updateStatus.isPending}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="FINALIZED">Finalized</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/admin/${tournamentId}/match-days/${matchDay.id}`)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Manage
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
  )
}

