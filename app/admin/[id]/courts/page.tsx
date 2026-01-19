'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Save } from 'lucide-react'
import TournamentNavBar from '@/components/TournamentNavBar'

export default function CourtsPage({ params }: { params: Promise<{ id: string }> }) {
  const [tournamentId, setTournamentId] = useState<string>('')
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string>('')

  useEffect(() => {
    params.then((p) => {
      setTournamentId(p.id)
    })
  }, [params])

  const { data: tournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  const { data: courts, refetch: refetchCourts } = trpc.indyCourt.list.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )

  const createCourt = trpc.indyCourt.create.useMutation({
    onSuccess: () => {
      refetchCourts()
    },
    onError: (error) => {
      alert('Error creating court: ' + error.message)
    },
  })

  const updateCourt = trpc.indyCourt.update.useMutation({
    onSuccess: () => {
      setEditingCourtId(null)
      setEditingName('')
      refetchCourts()
    },
    onError: (error) => {
      alert('Error updating court: ' + error.message)
    },
  })

  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  const isOwner = tournament?.userAccessInfo?.isOwner

  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0

  if (tournament?.format && tournament.format !== 'INDY_LEAGUE') {
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

  const handleCreateCourt = () => {
    createCourt.mutate({ tournamentId })
  }

  const handleEdit = (court: any) => {
    setEditingCourtId(court.id)
    setEditingName(court.name)
  }

  const handleSave = () => {
    if (!editingCourtId || !editingName.trim()) {
      alert('Please enter a court name')
      return
    }

    updateCourt.mutate({
      courtId: editingCourtId,
      name: editingName.trim(),
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TournamentNavBar
        tournamentTitle={tournament?.title}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
        tournamentFormat={tournament?.format}
      />

      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Courts</h1>
            <p className="text-gray-600 mt-2">
              Manage courts for {tournament?.title}
            </p>
          </div>
          <Button onClick={handleCreateCourt} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Court
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Available Courts</CardTitle>
            <CardDescription>
              New courts are created as Court #1, Court #2, and so on. You can rename any court.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!courts || courts.length === 0 ? (
              <p className="text-gray-600">No courts created yet.</p>
            ) : (
              <div className="space-y-3">
                {courts.map((court: any) => (
                  <div
                    key={court.id}
                    className="flex items-center justify-between border rounded-lg px-4 py-3"
                  >
                    {editingCourtId === court.id ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md mr-4"
                      />
                    ) : (
                      <div className="font-medium">{court.name}</div>
                    )}

                    {editingCourtId === court.id ? (
                      <Button onClick={handleSave} className="flex items-center gap-2">
                        <Save className="h-4 w-4" />
                        Save
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => handleEdit(court)}>
                        Edit
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
