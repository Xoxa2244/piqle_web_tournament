'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Eye, Ban } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

const genderLabel = (gender?: string | null) => {
  if (gender === 'M') return 'Male'
  if (gender === 'F') return 'Female'
  if (gender === 'X') return 'Other'
  return '—'
}

const organizerTierLabel = (tier?: string | null) => {
  if (tier === 'PRO') return 'Pro'
  return 'Basic'
}

export default function SuperAdminPlayersPage() {
  const [query, setQuery] = useState('')

  const listInput = useMemo(() => {
    const q = query.trim()
    return q ? { query: q } : undefined
  }, [query])

  const { data: players = [], isLoading, refetch } = trpc.superadmin.listPlayers.useQuery(
    listInput,
    { enabled: true }
  )

  const setUserActive = trpc.superadmin.setUserActive.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast({ title: 'Error', description: err.message || 'Failed to update user', variant: 'destructive' }),
  })

  const setOrganizerTier = trpc.superadmin.setOrganizerTier.useMutation({
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Organizer tier updated' })
      refetch()
    },
    onError: (err) =>
      toast({ title: 'Error', description: err.message || 'Failed to update organizer tier', variant: 'destructive' }),
  })

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
                    <th className="text-left p-3 font-medium">Role</th>
                    <th className="text-left p-3 font-medium">Organizer Tier</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-500">Loading...</td>
                    </tr>
                  ) : players.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-500">No players found.</td>
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
                          <Badge variant="outline">{player.role}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex min-w-[170px] items-center gap-2">
                            <Badge
                              variant={player.organizerTier === 'PRO' ? 'default' : 'secondary'}
                              className={player.organizerTier === 'PRO' ? 'bg-blue-600 hover:bg-blue-600' : ''}
                            >
                              {organizerTierLabel(player.organizerTier)}
                            </Badge>
                            <select
                              value={player.organizerTier || 'BASIC'}
                              disabled={player.role !== 'TD' || setOrganizerTier.isPending}
                              onChange={(e) => {
                                const nextTier = e.target.value as 'BASIC' | 'PRO'
                                if (nextTier === (player.organizerTier || 'BASIC')) return
                                setOrganizerTier.mutate({ userId: player.id, organizerTier: nextTier })
                              }}
                              className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="BASIC">Basic</option>
                              <option value="PRO">Pro</option>
                            </select>
                          </div>
                          {player.role !== 'TD' && (
                            <div className="mt-1 text-[11px] text-gray-500">TD only</div>
                          )}
                        </td>
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
                              disabled={setUserActive.isPending}
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
