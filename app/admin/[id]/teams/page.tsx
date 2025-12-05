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
  AlertTriangle
} from 'lucide-react'
import Link from 'next/link'
import AddParticipantModal from '@/components/AddParticipantModal'
import AddTeamModal from '@/components/AddTeamModal'
import EditTeamModal from '@/components/EditTeamModal'
import TournamentNavBar from '@/components/TournamentNavBar'

interface Player {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dupr: string | null
  teamPlayers: Array<{
    id: string
    teamId: string
    role: string
    team: {
      id: string
      name: string
    }
  }>
}

interface Team {
  id: string
  name: string
  seed: number | null
  note: string | null
  poolId: string | null
  divisionId: string
  teamPlayers: Array<{
    id: string
    role: string
    player: {
      id: string
      firstName: string
      lastName: string
      email: string | null
      dupr: string | null
    }
  }>
  division: {
    id: string
    name: string
    teamKind: string
    maxTeams: number | null
  }
  pool?: {
    id: string
    name: string
    order: number
  } | null
}

interface Division {
  id: string
  name: string
  teamKind: string
  maxTeams: number | null
  poolCount: number
  pools: Array<{
    id: string
    name: string
    order: number
  }>
}

export default function TeamsPage() {
  const params = useParams()
  const tournamentId = params.id as string
  
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false)
  const [showAddTeamModal, setShowAddTeamModal] = useState(false)
  const [showEditTeamModal, setShowEditTeamModal] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

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

  // Delete team mutation
  const deleteTeamMutation = trpc.team.delete.useMutation({
    onSuccess: () => {
      refetch() // Refetch tournament to update teams
      refetchPlayers() // Refetch players to update their team assignments
    },
    onError: (error) => {
      console.error('Failed to delete team:', error)
      alert('Error deleting team')
    }
  })

  // Get divisions and teams from tournament
  const divisions = (tournament as any)?.divisions || []
  
  // Get all teams from all divisions and add division reference
  const teams = (divisions as any[]).flatMap((division: any) => 
    ((division.teams || []) as any[]).map((team: any) => ({
      ...team,
      division: {
        id: division.id,
        name: division.name,
        teamKind: division.teamKind,
        maxTeams: division.maxTeams
      }
    }))
  )
  
  // Refetch function for teams (via tournament refetch)
  const refetchTeams = refetch

  // Filter players without teams
  const unassignedPlayers = useMemo(() => {
    if (!players) return []
    return players.filter(player => player.teamPlayers.length === 0)
  }, [players])

  // Filter players by search query
  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return unassignedPlayers
    
    const query = searchQuery.toLowerCase()
    return unassignedPlayers.filter(player => 
      `${player.firstName} ${player.lastName}`.toLowerCase().includes(query) ||
      player.email?.toLowerCase().includes(query) ||
      player.dupr?.toLowerCase().includes(query)
    )
  }, [unassignedPlayers, searchQuery])

  const handleAddParticipant = () => {
    setShowAddParticipantModal(true)
  }

  const handleAddTeam = () => {
    setShowAddTeamModal(true)
  }

  const handleEditTeam = (team: Team) => {
    setSelectedTeam(team)
    setShowEditTeamModal(true)
  }

  const handleDeleteTeam = (teamId: string) => {
    if (!confirm('Are you sure you want to delete this team? All participants will be moved to the general list.')) {
      return
    }
    
    deleteTeamMutation.mutate({ id: teamId })
  }

  const getTeamDisplayName = (team: Team) => {
    const division = team.division
    const pool = team.pool
    const poolText = pool ? ` / ${pool.name}` : ' / WaitList'
    return `${team.name} (${division.name}${poolText})`
  }

  const getMaxPlayersForTeam = (team: Team) => {
    const teamKind = team.division.teamKind
    switch (teamKind) {
      case 'SINGLES_1v1': return 1
      case 'DOUBLES_2v2': return 2
      case 'SQUAD_4v4': return 4
      default: return 2
    }
  }

  if (!tournament) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading tournament...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <TournamentNavBar
        tournamentTitle={tournament?.title}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
      />
      
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Teams & Participants</h1>
          <p className="text-gray-600 mt-1">Manage roster and distribution</p>
        </div>

      {/* Main Content - Two Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Panel - Participants */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>All Participants</span>
                </CardTitle>
                <CardDescription>
                  Participants not in any team
                </CardDescription>
              </div>
              <Button onClick={handleAddParticipant} size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Participant
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by name, email or DUPR ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Participants List */}
            <div className="space-y-2">
              {filteredPlayers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchQuery ? 'Participants not found' : 'No free participants'}
                </div>
              ) : (
                filteredPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        {player.firstName} {player.lastName}
                      </div>
                      <div className="text-sm text-gray-500 space-y-1">
                        {player.email && <div>{player.email}</div>}
                        {player.dupr && <div>DUPR: {player.dupr}</div>}
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      Free
                    </Badge>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 text-sm text-gray-500">
              Total free participants: {filteredPlayers.length}
            </div>
          </CardContent>
        </Card>

        {/* Right Panel - Teams */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Teams</span>
                </CardTitle>
                <CardDescription>
                  Manage teams and their roster
                </CardDescription>
              </div>
              <Button onClick={handleAddTeam} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Team
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams && teams.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No teams created
                </div>
              ) : (
                teams?.map((team) => {
                  const maxPlayers = getMaxPlayersForTeam(team)
                  const currentPlayers = team.teamPlayers.length
                  const isOverLimit = currentPlayers > maxPlayers
                  
                  return (
                    <div
                      key={team.id}
                      className={`border rounded-lg p-4 ${
                        !team.divisionId ? 'border-red-300 bg-red-50' : ''
                      }`}
                    >
                      {/* Team Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-semibold text-lg">{team.name}</h3>
                            {isOverLimit && (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            {getTeamDisplayName(team)}
                          </div>
                          <div className="text-sm text-gray-500">
                            Roster: {currentPlayers}/{maxPlayers}
                            {isOverLimit && (
                              <span className="text-red-600 ml-2">
                                (limit exceeded!)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTeam(team)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTeam(team.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Team Players */}
                      <div className="space-y-2">
                        {team.teamPlayers.length === 0 ? (
                          <div className="text-sm text-gray-500 italic">
                            No participants in team
                          </div>
                        ) : (
                          (team.teamPlayers || []).map((teamPlayer: any) => (
                            <div
                              key={teamPlayer.id}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded"
                            >
                              <div>
                                <div className="font-medium text-sm">
                                  {teamPlayer.player.firstName} {teamPlayer.player.lastName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {teamPlayer.player.email}
                                  {teamPlayer.player.dupr && ` • DUPR: ${teamPlayer.player.dupr}`}
                                </div>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {teamPlayer.role}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Warning for teams without division */}
                      {!team.divisionId && (
                        <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-700">
                          ⚠️ Team not linked to division
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className="mt-4 text-sm text-gray-500">
              Total teams: {teams?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <AddParticipantModal
        tournamentId={tournamentId}
        teams={teams}
        isOpen={showAddParticipantModal}
        onClose={() => setShowAddParticipantModal(false)}
        onSuccess={() => {
          refetchPlayers()
          refetchTeams()
        }}
      />

      <AddTeamModal
        divisions={divisions}
        isOpen={showAddTeamModal}
        onClose={() => setShowAddTeamModal(false)}
        onSuccess={() => {
          refetchTeams()
        }}
      />

      {selectedTeam && (
        <EditTeamModal
          team={selectedTeam}
          divisions={divisions}
          isOpen={showEditTeamModal}
          onClose={() => {
            setShowEditTeamModal(false)
            setSelectedTeam(null)
          }}
          onSuccess={() => {
            refetchTeams()
            refetchPlayers()
          }}
        />
      )}
      </div>
    </div>
  )
}