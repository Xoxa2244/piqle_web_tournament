'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Eye, Ban } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

const SUPERADMIN_AUTH_KEY = 'superadmin_authenticated'

const genderLabel = (gender?: string | null) => {
  if (gender === 'M') return 'Male'
  if (gender === 'F') return 'Female'
  if (gender === 'X') return 'Other'
  return '—'
}

export default function SuperAdminPlayersPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [query, setQuery] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const authStatus = localStorage.getItem(SUPERADMIN_AUTH_KEY)
    if (authStatus === 'true') {
      setIsAuthenticated(true)
    }
  }, [])

  const authenticate = trpc.superadmin.authenticate.useMutation({
    onSuccess: () => {
      setIsAuthenticated(true)
      localStorage.setItem(SUPERADMIN_AUTH_KEY, 'true')
      setError('')
    },
    onError: (err) => {
      setError(err.message || 'Invalid credentials')
    },
  })

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    authenticate.mutate({ login, password })
  }

  const listInput = useMemo(() => {
    const q = query.trim()
    return q ? { query: q } : undefined
  }, [query])

  const { data: players = [], isLoading, refetch } = trpc.superadmin.listPlayers.useQuery(
    listInput,
    { enabled: isAuthenticated }
  )

  const setUserActive = trpc.superadmin.setUserActive.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast({ title: 'Error', description: err.message || 'Failed to update user', variant: 'destructive' }),
  })

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Super Admin Login</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Login</label>
                <Input value={login} onChange={(e) => setLogin(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
              <Button type="submit" className="w-full">Login</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Players</h1>
            <p className="text-sm text-gray-500">Super admin player directory</p>
          </div>
          <Link href="/superadmin" className="text-sm text-blue-600 hover:text-blue-700">
            Back to tournaments
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Search by name, email, or city..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Players ({players.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">ID</th>
                    <th className="text-left p-3 font-medium">Player Name</th>
                    <th className="text-left p-3 font-medium">Location</th>
                    <th className="text-left p-3 font-medium">Gender</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-500">Loading...</td>
                    </tr>
                  ) : players.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-500">No players found.</td>
                    </tr>
                  ) : (
                    players.map((player) => (
                      <tr key={player.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-mono text-xs">{player.id}</td>
                        <td className="p-3">
                          <div className="font-medium">{player.name || player.email || 'Piqle user'}</div>
                          <div className="text-xs text-gray-500">{player.email || '—'}</div>
                        </td>
                        <td className="p-3">{player.city || '—'}</td>
                        <td className="p-3">{genderLabel(player.gender)}</td>
                        <td className="p-3">
                          <Badge variant={player.isActive ? 'default' : 'secondary'}>
                            {player.isActive ? 'Active' : 'Blocked'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/profile/${player.id}`}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setUserActive.mutate({ userId: player.id, isActive: !player.isActive })
                              }
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              {player.isActive ? 'Block' : 'Unblock'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
