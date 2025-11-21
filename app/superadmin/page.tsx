'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function SuperAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const authenticate = trpc.superadmin.authenticate.useMutation({
    onSuccess: () => {
      setIsAuthenticated(true)
      setError('')
    },
    onError: (err) => {
      setError(err.message || 'Invalid credentials')
    },
  })

  // Get all tournament owners
  const { data: owners } = trpc.superadmin.getAllTournamentOwners.useQuery(
    undefined,
    { enabled: isAuthenticated }
  )

  // Get tournaments with optional user filter
  const { data: tournaments, isLoading, refetch } = trpc.superadmin.getAllTournaments.useQuery(
    { userId: selectedUserId || undefined },
    { enabled: isAuthenticated }
  )

  const deleteTournament = trpc.superadmin.deleteTournament.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    authenticate.mutate({ login, password })
  }

  const handleDelete = (tournamentId: string, tournamentTitle: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the tournament "${tournamentTitle}"?\n\n` +
      `This action cannot be undone and will permanently remove:\n` +
      `• All tournament data\n` +
      `• All divisions and teams\n` +
      `• All matches and results\n` +
      `• All player information\n\n` +
      `Type "DELETE" to confirm:`
    )

    if (confirmed) {
      const userInput = window.prompt('Type "DELETE" to confirm:')
      if (userInput === 'DELETE') {
        deleteTournament.mutate({ id: tournamentId })
      }
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Super Admin Login</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1">
                  Login
                </label>
                <Input
                  id="login"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full"
                />
              </div>
              {error && (
                <div className="text-red-600 text-sm text-center">{error}</div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={authenticate.isLoading}
              >
                {authenticate.isLoading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Super Admin Panel</h1>
            <p className="text-gray-600 mt-2">Full access to all tournaments</p>
          </div>
          <Button
            onClick={() => setIsAuthenticated(false)}
            variant="outline"
          >
            Logout
          </Button>
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
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <div>Start: {new Date(tournament.startDate).toLocaleDateString()}</div>
                    <div>End: {new Date(tournament.endDate).toLocaleDateString()}</div>
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
                    {tournament.isPublicBoardEnabled && (
                      <Link
                        href={`/t/${tournament.publicSlug}`}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                      >
                        View Board
                      </Link>
                    )}
                    <button
                      onClick={() => handleDelete(tournament.id, tournament.title)}
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
    </div>
  )
}

