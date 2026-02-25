'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Search, 
  Users, 
  UserPlus,
  Edit,
  Trash2,
  Mail
} from 'lucide-react'
import Link from 'next/link'
import AddParticipantModal from '@/components/AddParticipantModal'
import EditPlayerModal from '@/components/EditPlayerModal'
import ConfirmModal from '@/components/ConfirmModal'
import { formatDuprRating } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  user: {
    id: string
    name: string | null
    email: string | null
    gender: 'M' | 'F' | 'X' | null
    duprId: string | null
    duprRatingSingles: string | null
    duprRatingDoubles: string | null
  } | null
  dupr: string | null
  duprRating: string | null  // Decimal from Prisma serializes as string
  gender: 'M' | 'F' | 'X' | null
  isPaid: boolean | null
  isWaitlist: boolean | null
  teamPlayers: Array<{
    id: string
    teamId: string
    role: string
    team: {
      id: string
      name: string
      division: {
        id: string
        name: string
      }
    }
  }>
}

export default function PlayersPage() {
  const params = useParams()
  const tournamentId = params.id as string
  
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
  const [showInvitePlayerModal, setShowInvitePlayerModal] = useState(false)
  const [inviteSearchInput, setInviteSearchInput] = useState('')
  const [inviteSearchDebounced, setInviteSearchDebounced] = useState('')
  const [showEditPlayerModal, setShowEditPlayerModal] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null)
  const [rosterFilter, setRosterFilter] = useState<'active_in_team' | 'waitlist' | 'no_team' | 'all'>('all')
  const [divisionFilter, setDivisionFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')

  const { data: tournament, refetch } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )
  
  // Check if user has admin access (owner or ADMIN access level)
  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  const isOwner = tournament?.userAccessInfo?.isOwner
  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0

  // Get all players (participants)
  const { data: players, refetch: refetchPlayers } = trpc.player.list.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )
  const playersList = useMemo(() => (players as unknown as Player[]) ?? [], [players])

  // Delete player mutation
  const deletePlayerMutation = trpc.player.delete.useMutation({
    onSuccess: () => {
      refetchPlayers()
    },
    onError: (error) => {
      console.error('Failed to delete player:', error)
      toast({ title: 'Error', description: 'Error deleting player', variant: 'destructive' })
    }
  })

  // Eligible platform users for invite (no email), with invitation status
  const { data: eligibleUsers, refetch: refetchEligibleUsers } = trpc.tournamentInvitation.listEligibleUsers.useQuery(
    { tournamentId, search: inviteSearchDebounced || undefined },
    { enabled: !!tournamentId && showInvitePlayerModal }
  )
  useEffect(() => {
    if (!showInvitePlayerModal) return
    const t = setTimeout(() => setInviteSearchDebounced(inviteSearchInput), 300)
    return () => clearTimeout(t)
  }, [inviteSearchInput, showInvitePlayerModal])
  const invitePlayerMutation = trpc.tournamentInvitation.create.useMutation({
    onSuccess: () => {
      refetchEligibleUsers()
    },
    onError: (e) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    },
  })

  const inviteByEmailMutation = trpc.player.inviteByEmail.useMutation({
    onSuccess: () => {
      toast({ description: 'Invitation sent.', variant: 'success' })
    },
    onError: (e) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    },
  })

  // Get divisions and teams from tournament
  const divisions = tournament?.divisions || []
  
  // Get all teams from all divisions for filter
  const teams = (divisions as any[]).flatMap((division: any) => division.teams || [])

  // Filter players based on all criteria
  const filteredPlayers = useMemo(() => {
    if (!playersList.length) return []
    
    let filtered = playersList

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(player => 
        `${player.firstName} ${player.lastName}`.toLowerCase().includes(query) ||
        player.user?.name?.toLowerCase().includes(query) ||
        player.email?.toLowerCase().includes(query) ||
        player.user?.email?.toLowerCase().includes(query) ||
        player.dupr?.toLowerCase().includes(query) ||
        player.user?.duprId?.toLowerCase().includes(query) ||
        player.teamPlayers.some(tp => 
          tp.team.name.toLowerCase().includes(query) ||
          tp.team.division.name.toLowerCase().includes(query)
        )
      )
    }

    // Roster status filter
    if (rosterFilter === 'active_in_team') {
      filtered = filtered.filter((player) => !player.isWaitlist && player.teamPlayers.length > 0)
    } else if (rosterFilter === 'waitlist') {
      filtered = filtered.filter((player) => player.isWaitlist)
    } else if (rosterFilter === 'no_team') {
      filtered = filtered.filter(
        (player) => !player.isWaitlist && player.teamPlayers.length === 0
      )
    }

    // Division filter
    if (divisionFilter) {
      filtered = filtered.filter(player => 
        player.teamPlayers.some(tp => tp.team.division.id === divisionFilter)
      )
    }

    // Team filter
    if (teamFilter) {
      filtered = filtered.filter(player => 
        player.teamPlayers.some(tp => tp.team.id === teamFilter)
      )
    }

    // Payment filter
    if (paymentFilter) {
      const isPaid = paymentFilter === 'paid'
      filtered = filtered.filter(player => player.isPaid === isPaid)
    }

    return filtered
  }, [playersList, searchQuery, rosterFilter, divisionFilter, teamFilter, paymentFilter])

  const handleAddPlayer = () => {
    setShowAddPlayerModal(true)
  }

  const handleEditPlayer = (player: Player) => {
    setSelectedPlayer(player)
    setShowEditPlayerModal(true)
  }

  const handleDeletePlayer = (playerId: string) => {
    setPlayerToDelete(playerId)
  }

  const getPlayerDivision = (player: Player) => {
    const teamPlayer = player.teamPlayers[0]
    return teamPlayer ? teamPlayer.team.division.name : '—'
  }

  const getPlayerTeam = (player: Player) => {
    const teamPlayer = player.teamPlayers[0]
    return teamPlayer ? teamPlayer.team.name : '—'
  }

  const getDuprRating = (player: Player) => {
    const userRating = player.user?.duprRatingDoubles ?? player.user?.duprRatingSingles
    if (userRating != null) return formatDuprRating(String(userRating)) || '—'
    if (player.duprRating === null) return '—'
    return formatDuprRating(player.duprRating) || '—'
  }

  const getDisplayDuprId = (player: Player) => {
    return player.user?.duprId || player.dupr || '—'
  }

  const getDisplayGender = (player: Player) => {
    return player.user?.gender ?? player.gender
  }

  const getDisplayName = (player: Player) => {
    const userName = player.user?.name?.trim()
    if (userName) return userName
    return `${player.firstName} ${player.lastName}`.trim()
  }

  const getDisplayEmail = (player: Player) => {
    return player.user?.email || player.email || '—'
  }

  const getListStatus = (player: Player): 'WAITLIST' | 'ACTIVE' | 'NO_TEAM' | 'INACTIVE' => {
    if (player.isWaitlist) return 'WAITLIST'
    if (player.teamPlayers.length > 0) return 'ACTIVE'
    // Not in any team: show neutral "No team" (covers new players and unassigned)
    if (player.isPaid !== true) return 'NO_TEAM'
    return 'INACTIVE'
  }

  if (!tournament) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading tournament...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Player Management</h1>
          <p className="text-gray-600 mt-1">General tournament participants list</p>
        </div>

      {/* Filters and Controls */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search all fields..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Division Filter */}
            <select
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              className="pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              }}
            >
              <option value="">All divisions</option>
              {(divisions as any[]).map((division: any) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>

            {/* Team Filter */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              }}
            >
              <option value="">All teams</option>
              {teams?.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>

            {/* Roster Status Filter */}
            <select
              value={rosterFilter}
              onChange={(e) => setRosterFilter(e.target.value as 'active_in_team' | 'waitlist' | 'no_team' | 'all')}
              className="pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              }}
            >
              <option value="active_in_team">Active in team</option>
              <option value="waitlist">Waitlist</option>
              <option value="no_team">No team</option>
              <option value="all">All roster statuses</option>
            </select>

            {/* Payment Filter */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              }}
            >
              <option value="">All payment statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Pending payment</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span>Default view:</span>
              <Badge variant="outline">Active in team</Badge>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button onClick={handleAddPlayer} size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Player
                </Button>
                <Button onClick={() => { setShowInvitePlayerModal(true); setInviteSearchInput(''); setInviteSearchDebounced('') }} variant="outline" size="sm">
                  <Users className="h-4 w-4 mr-2" />
                  Invite Player
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Players Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Players List ({filteredPlayers.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Player Name</th>
                  <th className="text-left p-3 font-medium">Gender</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">DUPR ID</th>
                  <th className="text-left p-3 font-medium">DUPR Rating</th>
                  <th className="text-left p-3 font-medium">Division</th>
                  <th className="text-left p-3 font-medium">Team</th>
                  <th className="text-left p-3 font-medium">Payment Status</th>
                  <th className="text-left p-3 font-medium">List Status</th>
                  <th className="text-left p-3 font-medium">Account</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-gray-500">
                      {searchQuery || divisionFilter || teamFilter || paymentFilter || rosterFilter !== 'active_in_team'
                        ? 'Players not found' 
                        : 'No players in tournament'
                      }
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player) => (
                    <tr key={player.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium">
                          {getDisplayName(player)}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {getDisplayGender(player) ? (
                          <Badge variant={getDisplayGender(player) === 'M' ? 'default' : getDisplayGender(player) === 'F' ? 'secondary' : 'outline'}>
                            {getDisplayGender(player) === 'M' ? 'Male' : getDisplayGender(player) === 'F' ? 'Female' : 'Other'}
                          </Badge>
                        ) : '—'}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {getDisplayEmail(player)}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {getDisplayDuprId(player)}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {getDuprRating(player)}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {getPlayerDivision(player)}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {getPlayerTeam(player)}
                      </td>
                      <td className="p-3">
                        <Badge variant={player.isPaid ? "default" : "secondary"}>
                          {player.isPaid ? 'Paid' : 'Pending'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {getListStatus(player) === 'WAITLIST' ? (
                          <Badge variant="secondary">Waitlist</Badge>
                        ) : getListStatus(player) === 'ACTIVE' ? (
                          <Badge variant="default">Active</Badge>
                        ) : getListStatus(player) === 'NO_TEAM' ? (
                          <Badge variant="secondary">No team</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {player.user?.id ? (
                          <Badge variant="default">Registered</Badge>
                        ) : player.email ? (
                          <Badge variant="secondary">Not registered</Badge>
                        ) : (
                          <Badge variant="outline">No email</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {isAdmin && (
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={inviteByEmailMutation.isPending || !player.email || Boolean(player.user?.id)}
                              onClick={() => inviteByEmailMutation.mutate({ playerId: player.id, baseUrl: typeof window !== 'undefined' ? window.location.origin : null })}
                              title={
                                !player.email
                                  ? 'No email on player'
                                  : player.user?.id
                                    ? 'Already registered'
                                    : 'Invite by email'
                              }
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditPlayer(player)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePlayer(player.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <AddParticipantModal
        tournamentId={tournamentId}
        isOpen={showAddPlayerModal}
        onClose={() => setShowAddPlayerModal(false)}
        onSuccess={() => {
          refetchPlayers()
        }}
      />

      {/* Invite Player Modal: fixed size, on top, darkened backdrop */}
      {showInvitePlayerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={() => setShowInvitePlayerModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[28rem] h-[42rem] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold">Invite Player</h2>
              <p className="text-sm text-gray-500 mt-1">Choose a registered user to invite. They will receive an email to accept or decline.</p>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name..."
                  value={inviteSearchInput}
                  onChange={(e) => setInviteSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {eligibleUsers === undefined ? (
                <div className="p-6 text-center text-gray-500">Loading...</div>
              ) : eligibleUsers.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  {inviteSearchDebounced ? 'No users found for this name.' : 'No users to show. Try searching by name.'}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {eligibleUsers.map((u) => {
                    const status = u.invitationStatus
                    const isPending = status === 'PENDING'
                    const isDeclined = status === 'DECLINED'
                    const canInvite = !isPending
                    const duprStr = u.duprRatingDoubles != null
                      ? formatDuprRating(String(u.duprRatingDoubles))
                      : u.duprRatingSingles != null
                        ? formatDuprRating(String(u.duprRatingSingles))
                        : null
                    return (
                      <li key={u.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center text-gray-600 font-medium">
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.image} alt="" width={40} height={40} className="w-10 h-10 object-cover" />
                          ) : (
                            <span>{(u.name || '?').charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">{u.name || 'Unnamed'}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                            {u.city && <span>{u.city}</span>}
                            {u.gender && <span>{u.gender === 'M' ? 'M' : u.gender === 'F' ? 'F' : '—'}</span>}
                            {duprStr && <span>DUPR {duprStr}</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {isPending ? (
                            <Button size="sm" variant="secondary" disabled>Pending</Button>
                          ) : isDeclined ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={invitePlayerMutation.isPending}
                              onClick={() => invitePlayerMutation.mutate({ tournamentId, invitedUserId: u.id, baseUrl: typeof window !== 'undefined' ? window.location.origin : null })}
                            >
                              Invite again
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={invitePlayerMutation.isPending}
                              onClick={() => invitePlayerMutation.mutate({ tournamentId, invitedUserId: u.id, baseUrl: typeof window !== 'undefined' ? window.location.origin : null })}
                            >
                              Invite
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="p-4 border-t flex-shrink-0">
              <Button variant="outline" className="w-full" onClick={() => { setShowInvitePlayerModal(false); setInviteSearchInput(''); setInviteSearchDebounced('') }}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedPlayer && (
        <EditPlayerModal
          player={selectedPlayer}
          tournamentId={tournamentId}
          isOpen={showEditPlayerModal}
          onClose={() => {
            setShowEditPlayerModal(false)
            setSelectedPlayer(null)
          }}
          onSuccess={() => {
            refetchPlayers()
          }}
        />
      )}
      <ConfirmModal
        open={!!playerToDelete}
        onClose={() => setPlayerToDelete(null)}
        onConfirm={() => {
          if (!playerToDelete) return
          deletePlayerMutation.mutate({ id: playerToDelete })
          setPlayerToDelete(null)
        }}
        isPending={deletePlayerMutation.isPending}
        destructive
        title="Delete player?"
        description="This player will be removed from the tournament roster."
        confirmText={deletePlayerMutation.isPending ? 'Deleting…' : 'Delete'}
      />
      </div>
    </div>
  )
}
