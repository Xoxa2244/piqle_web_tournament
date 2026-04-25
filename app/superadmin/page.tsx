'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import { formatUsDateShort } from '@/lib/dateFormat'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/use-toast'
import ConfirmModal from '@/components/ConfirmModal'

export default function SuperAdminPage() {
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Get all tournament owners
  const { data: owners } = trpc.superadmin.getAllTournamentOwners.useQuery(
    undefined,
    { enabled: true }
  )

  // Get tournaments with optional user filter
  const { data: tournaments, isLoading, refetch } = trpc.superadmin.getAllTournaments.useQuery(
    { userId: selectedUserId || undefined },
    { enabled: true }
  )

  const deleteTournament = trpc.superadmin.deleteTournament.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const updateTournament = trpc.superadmin.updateTournament.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message || 'Failed to update tournament', variant: 'destructive' })
    },
  })

  const handleDeleteClick = (tournamentId: string, tournamentTitle: string) => {
    setDeleteTarget({ id: tournamentId, title: tournamentTitle })
    setDeleteConfirmText('')
  }

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    deleteTournament.mutate({ id: deleteTarget.id })
    setDeleteTarget(null)
    setDeleteConfirmText('')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Super Admin Panel</h1>
            <p className="text-gray-600 mt-2">Full access to all tournaments</p>
          </div>
          <div className="flex gap-4">
            <Link href="/superadmin/agent-rollout">
              <Button variant="outline">
                Agent Rollout
              </Button>
            </Link>
            <Link href="/superadmin/integration-ops">
              <Button variant="outline">
                Integration Ops
              </Button>
            </Link>
            <Link href="/superadmin/players">
              <Button variant="outline">
                Players
              </Button>
            </Link>
            <Link href="/superadmin/partners">
              <Button variant="outline">
                Partner Integrations
              </Button>
            </Link>
            <Button
              onClick={() => signOut({ callbackUrl: '/auth/signin?callbackUrl=/superadmin' })}
              variant="outline"
            >
              Sign out
            </Button>
          </div>
        </div>

        {/* User Filter */}
        <div className="mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <label htmlFor="user-filter" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Filter by Owner:
                </label>
                <select
                  id="user-filter"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex-1 pl-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                >
                  <option value="">All Tournaments</option>
                  {owners?.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name || owner.email} ({owner.email})
                    </option>
                  ))}
                </select>
                {selectedUserId && (
                  <Button
                    onClick={() => setSelectedUserId('')}
                    variant="outline"
                    size="sm"
                  >
                    Clear Filter
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-lg">Loading tournaments...</div>
          </div>
        ) : tournaments && tournaments.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((tournament) => (
              <Card key={tournament.id} className="bg-white relative">
                {/* Public/Private Badge */}
                <div className="absolute top-4 right-4 z-10">
                  <button
                    type="button"
                    onClick={() =>
                      updateTournament.mutate({
                        id: tournament.id,
                        isPublicBoardEnabled: !tournament.isPublicBoardEnabled,
                      })
                    }
                    className="focus:outline-none"
                    title="Toggle public board"
                  >
                    <Badge 
                      variant={tournament.isPublicBoardEnabled ? "default" : "secondary"}
                      className={
                        tournament.isPublicBoardEnabled 
                          ? "bg-green-500 hover:bg-green-600 text-white" 
                          : "bg-gray-500 hover:bg-gray-600 text-white"
                      }
                    >
                      {tournament.isPublicBoardEnabled ? 'Public' : 'Private'}
                    </Badge>
                  </button>
                </div>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold pr-16">{tournament.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {tournament.description && (
                    <div className="mb-4">
                      <div
                        className="text-gray-600 text-sm break-words line-clamp-3"
                        dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                      />
                    </div>
                  )}

                  <div className="space-y-2 text-sm text-gray-500 mb-4">
                    <div>Start: {formatUsDateShort(tournament.startDate)}</div>
                    <div>End: {formatUsDateShort(tournament.endDate)}</div>
                    <div>Divisions: {tournament._count.divisions}</div>
                    <div>Owner: {tournament.user.name || tournament.user.email}</div>
                    {tournament.entryFee && (
                      <div>Entry Fee: ${tournament.entryFee}</div>
                    )}
                    {tournament.divisions.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <div className="font-medium text-gray-700 mb-1">Division Details:</div>
                        {tournament.divisions.map((division) => (
                          <div key={division.id} className="text-xs">
                            {division.name}: {division._count.teams} teams, {division._count.matches} matches
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/superadmin/${tournament.id}`}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                    >
                      Manage
                    </Link>
                    <button
                      onClick={() => handleDeleteClick(tournament.id, tournament.title)}
                      disabled={deleteTournament.isLoading}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                    >
                      {deleteTournament.isLoading ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No tournaments found</h3>
            <p className="text-gray-600">There are no tournaments in the system yet.</p>
          </div>
        )}
      </div>
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteConfirmText('') }}
        onConfirm={handleDeleteConfirm}
        isPending={deleteTournament.isPending}
        destructive
        confirmDisabled={deleteConfirmText !== 'DELETE'}
        title="Delete tournament?"
        description={deleteTarget ? `Are you sure you want to delete the tournament "${deleteTarget.title}"? This action cannot be undone and will permanently remove all tournament data, divisions, teams, matches, and player information.` : ''}
        confirmText={deleteTournament.isPending ? 'Deleting…' : 'Delete'}
      >
        {deleteTarget ? (
          <Input
            placeholder='Type "DELETE" to confirm'
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            className="mt-2"
          />
        ) : null}
      </ConfirmModal>
    </div>
  )
}
