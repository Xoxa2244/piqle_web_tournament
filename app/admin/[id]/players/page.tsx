'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Search, 
  Users, 
  UserPlus,
  Edit,
  Trash2,
  ArrowLeft,
  Filter,
  Eye,
  EyeOff
} from 'lucide-react'
import Link from 'next/link'
import AddPlayerModal from '@/components/AddPlayerModal'
import EditPlayerModal from '@/components/EditPlayerModal'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dupr: string | null
  duprRating: string | null  // Decimal from Prisma serializes as string
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
  const [showEditPlayerModal, setShowEditPlayerModal] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [showOnlyWaitlist, setShowOnlyWaitlist] = useState(false)
  const [divisionFilter, setDivisionFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')

  const { data: tournament, refetch } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  // Get all players (participants)
  const { data: players, refetch: refetchPlayers } = trpc.player.list.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )

  // Delete player mutation
  const deletePlayerMutation = trpc.player.delete.useMutation({
    onSuccess: () => {
      refetchPlayers()
    },
    onError: (error) => {
      console.error('Failed to delete player:', error)
      alert('Error deleting player')
    }
  })

  // Get divisions and teams from tournament
  const divisions = tournament?.divisions || []
  
  // Get all teams from all divisions for filter
  const teams = divisions.flatMap(division => division.teams || [])

  // Filter players based on all criteria
  const filteredPlayers = useMemo(() => {
    if (!players) return []
    
    let filtered = players

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(player => 
        `${player.firstName} ${player.lastName}`.toLowerCase().includes(query) ||
        player.email?.toLowerCase().includes(query) ||
        player.dupr?.toLowerCase().includes(query) ||
        player.teamPlayers.some(tp => 
          tp.team.name.toLowerCase().includes(query) ||
          tp.team.division.name.toLowerCase().includes(query)
        )
      )
    }

    // Waitlist filter
    if (showOnlyWaitlist) {
      filtered = filtered.filter(player => player.isWaitlist)
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
  }, [players, searchQuery, showOnlyWaitlist, divisionFilter, teamFilter, paymentFilter])

  const handleAddPlayer = () => {
    setShowAddPlayerModal(true)
  }

  const handleEditPlayer = (player: Player) => {
    setSelectedPlayer(player)
    setShowEditPlayerModal(true)
  }

  const handleDeletePlayer = (playerId: string) => {
    if (!confirm('Are you sure you want to delete this player?')) {
      return
    }
    
    deletePlayerMutation.mutate({ id: playerId })
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
    if (player.duprRating === null) return '—'
    return player.duprRating
  }

  if (!tournament) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading tournament...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Link href={`/admin/${tournamentId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Tournament
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Player Management</h1>
            <p className="text-gray-600 mt-1">General tournament participants list</p>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All divisions</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>

            {/* Team Filter */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All teams</option>
              {teams?.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>

            {/* Payment Filter */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All payment statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Pending payment</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant={showOnlyWaitlist ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOnlyWaitlist(!showOnlyWaitlist)}
                className="flex items-center space-x-2"
              >
                {showOnlyWaitlist ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span>{showOnlyWaitlist ? 'Show all' : 'Waitlist only'}</span>
              </Button>
            </div>

            <Button onClick={handleAddPlayer} size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Player
            </Button>
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
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">DUPR ID</th>
                  <th className="text-left p-3 font-medium">DUPR Rating</th>
                  <th className="text-left p-3 font-medium">Division</th>
                  <th className="text-left p-3 font-medium">Team</th>
                  <th className="text-left p-3 font-medium">Payment Status</th>
                  <th className="text-left p-3 font-medium">List Status</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-500">
                      {searchQuery || divisionFilter || teamFilter || paymentFilter || showOnlyWaitlist 
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
                          {player.firstName} {player.lastName}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {player.email || '—'}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {player.dupr || '—'}
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
                        <Badge variant={player.isWaitlist ? "secondary" : "default"}>
                          {player.isWaitlist ? 'Waitlist' : 'Active'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-2">
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
      <AddPlayerModal
        tournamentId={tournamentId}
        isOpen={showAddPlayerModal}
        onClose={() => setShowAddPlayerModal(false)}
        onSuccess={() => {
          refetchPlayers()
        }}
      />

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
    </div>
  )
}
