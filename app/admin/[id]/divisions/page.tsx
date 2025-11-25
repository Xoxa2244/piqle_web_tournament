'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AddDivisionModal from '@/components/AddDivisionModal'
import EditDivisionDrawer from '@/components/EditDivisionDrawer'
import EditTeamModal from '@/components/EditTeamModal'
import BoardMode from '@/components/BoardMode'
import AddTeamModal from '@/components/AddTeamModal'
import AddPlayerModal from '@/components/AddPlayerModal'
import MergeDivisionModal from '@/components/MergeDivisionModal'
import UnmergeDivisionModal from '@/components/UnmergeDivisionModal'
import TeamWithSlots from '@/components/TeamWithSlots'
import TournamentNavBar from '@/components/TournamentNavBar'
import { 
  ChevronDown, 
  ChevronRight, 
  GripVertical, 
  Users, 
  Edit, 
  Trash2, 
  MoreVertical,
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  Settings,
  Copy,
  Download,
  ArrowLeft,
  Clock,
  Trophy,
  Target,
  GitMerge,
  GitBranch,
  AlertTriangle
} from 'lucide-react'

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
    createdAt: string
    updatedAt: string
    player: {
      id: string
      email: string | null
      createdAt: string
      updatedAt: string
      firstName: string
      lastName: string
      gender: string | null
      dupr: string | null
      duprRating: string | null
      birthDate: string | null
      isWaitlist: boolean | null
      teamId?: string | null
      teamName?: string | null
    }
  }>
}

interface Pool {
  id: string
  name: string
  order: number
  teams?: Team[] // Optional, will be computed dynamically
}

interface Division {
  id: string
  name: string
  teamKind: string
  pairingMode: string
  poolCount: number
  maxTeams: number | null
  stage: string | null
  teams: Team[]
  pools: Pool[]
  constraints: {
    minDupr: string | null  // Changed from number to string
    maxDupr: string | null  // Changed from number to string
    minAge: number | null
    maxAge: number | null
  } | null
}

interface Tournament {
  id: string
  title: string
  divisions: Division[]
}

// WaitList component
function WaitList({ 
  division, 
  onTeamMove, 
  onEditTeam, 
  onDeleteTeam,
  expandedTeams,
  availablePlayers,
  tournamentId,
  onToggleTeamExpansion,
  onAddPlayerToSlot,
  onRemovePlayerFromSlot,
  onMovePlayerBetweenSlots
}: {
  division: Division
  onTeamMove: (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => void
  onEditTeam: (team: Team) => void
  onDeleteTeam: (team: Team) => void
  expandedTeams: Set<string>
  availablePlayers: any[]
  tournamentId: string
  onToggleTeamExpansion: (teamId: string) => void
  onAddPlayerToSlot: (teamId: string, slotIndex: number, playerId: string) => void
  onRemovePlayerFromSlot: (teamId: string, slotIndex: number) => void
  onMovePlayerBetweenSlots: (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => void
}) {
  const waitListTeams = division.teams.filter(team => team.poolId === null)
  
  const { setNodeRef } = useDroppable({
    id: `waitlist-${division.id}`,
  })

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm text-gray-600 flex items-center">
          <Clock className="h-4 w-4 mr-1" />
          WaitList ({waitListTeams.length})
        </h4>
      </div>
      
      <div
        ref={setNodeRef}
        className="min-h-[80px] border-2 border-dashed border-gray-400 rounded-lg p-4 bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        {waitListTeams.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-4">
            Drag teams here to wait
          </div>
        ) : (
          <div className="space-y-2">
            {waitListTeams.map((team) => (
              <TeamWithSlots
                key={team.id}
                team={team}
                teamKind={division.teamKind as any}
                isExpanded={expandedTeams.has(team.id)}
                availablePlayers={availablePlayers}
                tournamentId={tournamentId}
                onToggleExpansion={() => onToggleTeamExpansion(team.id)}
                onEdit={() => onEditTeam(team)}
                onDelete={() => onDeleteTeam(team)}
                onContextMenu={() => {}}
                onAddPlayer={(slotIndex, playerId) => onAddPlayerToSlot(team.id, slotIndex, playerId)}
                onRemovePlayer={onRemovePlayerFromSlot}
                onMovePlayer={(fromTeamId, toTeamId, fromSlot, toSlot) => onMovePlayerBetweenSlots(fromTeamId, toTeamId, fromSlot, toSlot)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Pool component
function PoolCard({ 
  pool, 
  division, 
  onTeamMove, 
  onEditTeam, 
  onDeleteTeam,
  expandedTeams,
  availablePlayers,
  tournamentId,
  onToggleTeamExpansion,
  onAddPlayerToSlot,
  onRemovePlayerFromSlot,
  onMovePlayerBetweenSlots
}: {
  pool: Pool
  division: Division
  onTeamMove: (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => void
  onEditTeam: (team: Team) => void
  onDeleteTeam: (team: Team) => void
  expandedTeams: Set<string>
  availablePlayers: any[]
  tournamentId: string
  onToggleTeamExpansion: (teamId: string) => void
  onAddPlayerToSlot: (teamId: string, slotIndex: number, playerId: string) => void
  onRemovePlayerFromSlot: (teamId: string, slotIndex: number) => void
  onMovePlayerBetweenSlots: (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => void
}) {
  // Compute teams for this pool dynamically
  const poolTeams = division.teams.filter(team => team.poolId === pool.id)
  
  const { setNodeRef } = useDroppable({
    id: `pool-${pool.id}`,
  })

  return (
    <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm text-blue-600 flex items-center">
              <Target className="h-4 w-4 mr-1" />
              {pool.name || 'Pool'} ({poolTeams.length})
        </h4>
      </div>
      
      <div
        ref={setNodeRef}
        className="min-h-[80px] border-2 border-dashed border-blue-400 rounded-lg p-4 bg-blue-100 hover:bg-blue-200 transition-colors"
      >
        {poolTeams.length === 0 ? (
          <div className="text-center text-blue-400 text-sm py-4">
            Drag teams here
          </div>
        ) : (
          <div className="space-y-2">
            {poolTeams.map((team) => (
              <TeamWithSlots
                key={team.id}
                team={team}
                teamKind={division.teamKind as any}
                isExpanded={expandedTeams.has(team.id)}
                availablePlayers={availablePlayers}
                tournamentId={tournamentId}
                onToggleExpansion={() => onToggleTeamExpansion(team.id)}
                onEdit={() => onEditTeam(team)}
                onDelete={() => onDeleteTeam(team)}
                onContextMenu={() => {}}
                onAddPlayer={(slotIndex, playerId) => onAddPlayerToSlot(team.id, slotIndex, playerId)}
                onRemovePlayer={onRemovePlayerFromSlot}
                onMovePlayer={(fromTeamId, toTeamId, fromSlot, toSlot) => onMovePlayerBetweenSlots(fromTeamId, toTeamId, fromSlot, toSlot)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Sortable Team component
function SortableTeam({
  team,
  onEdit,
  onDelete,
  onExpand,
  isExpanded,
  onContextMenu,
  onDeletePlayer,
  onPlayerContextMenu,
}: {
  team: Team
  onEdit: () => void
  onDelete: () => void
  onExpand: () => void
  isExpanded: boolean
  onContextMenu: () => void
  onDeletePlayer: () => void
  onPlayerContextMenu: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const playerCount = team.teamPlayers.length
  const teamName = team.name || `${team.teamPlayers[0]?.player.firstName} ${team.teamPlayers[0]?.player.lastName}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center space-x-3 p-2 bg-white border rounded-lg shadow-sm ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{teamName}</div>
        {team.seed && (
          <div className="text-xs text-gray-500">Seed: {team.seed}</div>
        )}
      </div>
      
      <div className="flex items-center space-x-1">
        <div className="flex items-center text-xs text-gray-500">
          <Users className="h-3 w-3 mr-1" />
          {playerCount}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-6 w-6 p-0"
        >
          <Edit className="h-3 w-3" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onContextMenu}
          className="h-6 w-6 p-0"
        >
          <MoreVertical className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// Division Card component
function DivisionCard({ 
  division, 
  isExpanded, 
  onToggleExpansion, 
  onEditDivision, 
  onAddTeam, 
  onDistributeTeams,
  onMergeDivisions,
  onUnmergeDivisions,
  onDeleteDivision,
  onTeamMove, 
  onEditTeam, 
  onDeleteTeam,
  expandedTeams,
  availablePlayers,
  tournamentId,
  onToggleTeamExpansion,
  onAddPlayerToSlot,
  onRemovePlayerFromSlot,
  onMovePlayerBetweenSlots
}: {
  division: Division
  isExpanded: boolean
  onToggleExpansion: () => void
  onEditDivision: () => void
  onAddTeam: () => void
  onDistributeTeams: (divisionId: string) => void
  onMergeDivisions: (division: Division) => void
  onUnmergeDivisions?: (division: Division) => void
  onDeleteDivision: (divisionId: string) => void
  onTeamMove: (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => void
  onEditTeam: (team: Team) => void
  onDeleteTeam: (team: Team) => void
  expandedTeams: Set<string>
  availablePlayers: any[]
  tournamentId: string
  onToggleTeamExpansion: (teamId: string) => void
  onAddPlayerToSlot: (teamId: string, slotIndex: number, playerId: string) => void
  onRemovePlayerFromSlot: (teamId: string, slotIndex: number) => void
  onMovePlayerBetweenSlots: (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => void
}) {
  const activeTeams = division.teams.filter(team => team.poolId !== null)
  const waitListTeams = division.teams.filter(team => team.poolId === null)
  const totalTeams = division.teams.length

  // Add drop zone for division
  const { setNodeRef: setDivisionNodeRef } = useDroppable({
    id: `division-${division.id}`,
  })


  return (
    <Card ref={setDivisionNodeRef} className="mb-4 border-2 border-dashed border-green-300 hover:border-green-400 hover:bg-green-50 transition-colors">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpansion}
              className="h-6 w-6 p-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            
            <div>
              <CardTitle className="text-lg">{division.name} / {division.teamKind}</CardTitle>
              <CardDescription className="flex items-center space-x-2 mt-1">
                <span>{totalTeams} teams</span>
                <span>•</span>
                <span>{division.pairingMode}</span>
                {division.poolCount >= 1 && (
                  <>
                    <span>•</span>
                    <span>{division.poolCount} pools</span>
                  </>
                )}
                {division.maxTeams && (
                  <>
                    <span>•</span>
                    <span>limit: {division.maxTeams}</span>
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDistributeTeams(division.id)}
              className="h-8 px-3"
              title="Distribute teams by DUPR rating"
              disabled={(division as any).isMerged}
            >
              <Target className="h-4 w-4 mr-1" />
              Distribute
            </Button>
            
            {(division as any).isMerged ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUnmergeDivisions?.(division)}
                className="h-8 px-3 border-orange-300 text-orange-700 hover:bg-orange-50"
                title="Unmerge division back to original divisions"
              >
                <GitBranch className="h-4 w-4 mr-1" />
                Unmerge
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onMergeDivisions(division)}
                className="h-8 px-3"
                title="Merge with another division"
              >
                <GitMerge className="h-4 w-4 mr-1" />
                Merge
              </Button>
            )}
            
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditDivision}
                className="h-8 w-8 p-0"
              >
                <Edit className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddTeam}
                className="h-8 w-8 p-0"
                title={division.teamKind === 'SINGLES_1v1' ? 'Add player to division' : 'Add team to division'}
              >
                <Plus className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete "${division.name}"? All players in this division will become free agents.`)) {
                    onDeleteDivision(division.id)
                  }
                }}
                title="Delete Division"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent>
          <div className="space-y-4">
            {/* Pools */}
            {division.poolCount >= 1 && division.pools.length > 0 ? (
              <div className="space-y-4">
                {division.pools.map((pool) => (
                  <PoolCard
                    key={pool.id}
                    pool={pool}
                    division={division}
                    onTeamMove={onTeamMove}
                    onEditTeam={onEditTeam}
                    onDeleteTeam={onDeleteTeam}
                    expandedTeams={expandedTeams}
                    availablePlayers={availablePlayers}
                    tournamentId={tournamentId}
                    onToggleTeamExpansion={onToggleTeamExpansion}
                    onAddPlayerToSlot={onAddPlayerToSlot}
                    onRemovePlayerFromSlot={onRemovePlayerFromSlot}
                    onMovePlayerBetweenSlots={onMovePlayerBetweenSlots}
                  />
                ))}
              </div>
            ) : (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm text-green-600 flex items-center">
                    <Trophy className="h-4 w-4 mr-1" />
                    Active teams ({activeTeams.length})
                  </h4>
                </div>
                
                <div className="space-y-2">
                  {activeTeams.map((team) => (
                    <TeamWithSlots
                      key={team.id}
                      team={team}
                      teamKind={division.teamKind as any}
                      isExpanded={expandedTeams.has(team.id)}
                      availablePlayers={availablePlayers}
                      tournamentId={tournamentId}
                      onToggleExpansion={() => onToggleTeamExpansion(team.id)}
                      onEdit={() => onEditTeam(team)}
                      onDelete={() => onDeleteTeam(team)}
                      onContextMenu={() => {}}
                      onAddPlayer={(slotIndex, playerId) => onAddPlayerToSlot(team.id, slotIndex, playerId)}
                      onRemovePlayer={onRemovePlayerFromSlot}
                      onMovePlayer={(fromTeamId, toTeamId, fromSlot, toSlot) => onMovePlayerBetweenSlots(fromTeamId, toTeamId, fromSlot, toSlot)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* WaitList */}
            <WaitList
              division={division}
              onTeamMove={onTeamMove}
              onEditTeam={onEditTeam}
              onDeleteTeam={onDeleteTeam}
              expandedTeams={expandedTeams}
              availablePlayers={availablePlayers}
              tournamentId={tournamentId}
              onToggleTeamExpansion={onToggleTeamExpansion}
              onAddPlayerToSlot={onAddPlayerToSlot}
              onRemovePlayerFromSlot={onRemovePlayerFromSlot}
              onMovePlayerBetweenSlots={onMovePlayerBetweenSlots}
            />
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default function DivisionsPage() {
  const params = useParams()
  const tournamentId = params.id as string
  
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set())
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [activeTeam, setActiveTeam] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'overview' | 'board'>('overview')
  const [showEditDrawer, setShowEditDrawer] = useState(false)
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null)
  const [showAddTeamModal, setShowAddTeamModal] = useState(false)
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
  const [showEditTeamModal, setShowEditTeamModal] = useState(false)
  const [showAddDivisionModal, setShowAddDivisionModal] = useState(false)
  const [showMergeDivisionModal, setShowMergeDivisionModal] = useState(false)
  const [selectedDivisionForMerge, setSelectedDivisionForMerge] = useState<Division | null>(null)
  const [showUnmergeDivisionModal, setShowUnmergeDivisionModal] = useState(false)
  const [selectedDivisionForUnmerge, setSelectedDivisionForUnmerge] = useState<Division | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedDivisionForTeam, setSelectedDivisionForTeam] = useState<Division | null>(null)
  const [selectedDivisionForPlayer, setSelectedDivisionForPlayer] = useState<Division | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const { data: tournament, refetch } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )
  
  // Check if user has admin access (defined later, avoid redeclaration)

  // Get available players for the tournament
  const { data: availablePlayersData = [] } = trpc.teamPlayer.getAvailablePlayers.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )
  
  // Get divisions for team creation
  const divisions = tournament?.divisions || []
  
  // Local state for optimistic updates
  const [localDivisions, setLocalDivisions] = useState<Division[]>([])
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([])
  
  // Filter out divisions with 0 teams that were merged (i.e., there's a merged division containing their ID)
  const visibleDivisions = useMemo(() => {
    if (!tournament?.divisions) return []
    const divisions = tournament.divisions as any[]
    const mergedDivisions = divisions.filter((d: any) => d.isMerged && d.mergedFromDivisionIds)
    
    return divisions.filter((div: any) => {
      // Show merged divisions
      if (div.isMerged) return true
      // Show divisions with teams
      if ((div.teams?.length || 0) > 0) return true
      // Hide divisions with 0 teams that were merged into another division
      const wasMerged = mergedDivisions.some((merged: any) => {
        const mergedFromIds = Array.isArray(merged.mergedFromDivisionIds) 
          ? merged.mergedFromDivisionIds 
          : []
        return mergedFromIds.includes(div.id)
      })
      return !wasMerged
    })
  }, [tournament?.divisions])

  // Sync local divisions with fetched data (filtered)
  useEffect(() => {
    if (visibleDivisions.length > 0) {
      setLocalDivisions(visibleDivisions as Division[])
    } else if (tournament?.divisions) {
      setLocalDivisions(tournament.divisions)
    }
  }, [visibleDivisions, tournament?.divisions])
  
  // Sync local availablePlayers with fetched data
  useEffect(() => {
    if (availablePlayersData) {
      setAvailablePlayers(availablePlayersData)
    }
  }, [availablePlayersData])

  const moveTeamToDivisionMutation = trpc.team.moveToDivision.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      alert(`Error moving team: ${error.message}`)
    }
  })

  const moveTeamToPoolMutation = trpc.team.moveToPool.useMutation({
    onSuccess: () => {
      console.log('moveToPool success')
      refetch()
    },
    onError: (error) => {
      console.error('moveToPool error:', error)
      alert(`Error moving team: ${error.message}`)
    }
  })

  const updateDivisionMutation = trpc.division.update.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      alert(`Error updating division: ${error.message}`)
    }
  })

  const distributeTeamsMutation = trpc.division.distributeTeamsByDupr.useMutation({
    onSuccess: (result) => {
      refetch()
      alert(`Successfully distributed teams!\n\nTeams with DUPR ratings: ${result.teamsWithRatings}\nTeams without ratings: ${result.teamsWithoutRatings}`)
    },
    onError: (error) => {
      alert(`Error distributing teams: ${error.message}`)
    }
  })

  const deleteDivisionMutation = trpc.division.delete.useMutation({
    onSuccess: () => {
      refetch()
      alert('Division deleted successfully! All players are now free agents.')
    },
    onError: (error) => {
      alert(`Error deleting division: ${error.message}`)
    }
  })

  const deleteTeamMutation = trpc.team.delete.useMutation({
    onSuccess: () => {
      refetch()
      alert('Team deleted successfully!')
    },
    onError: (error) => {
      alert(`Error deleting team: ${error.message}`)
    }
  })

  // Player slot management mutations
  const addPlayerToSlotMutation = trpc.teamPlayer.addPlayerToSlot.useMutation({
    onMutate: async (variables) => {
      // Optimistically update the UI
      optimisticAddPlayer(variables.teamId, variables.playerId, variables.slotIndex)
    },
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      // Rollback on error
      refetch()
      alert(`Error adding player: ${error.message}`)
    }
  })

  const removePlayerFromSlotMutation = trpc.teamPlayer.removePlayerFromSlot.useMutation({
    onMutate: async (variables) => {
      // Optimistically update the UI
      optimisticRemovePlayer(variables.teamPlayerId, variables.slotIndex)
      
      // Also optimistically update availablePlayers
      const teamPlayer = localDivisions
        .flatMap(d => d.teams)
        .flatMap(t => t.teamPlayers)
        .find(tp => tp.id === variables.teamPlayerId)
      
      if (teamPlayer) {
        // Add player back to availablePlayers optimistically
        setAvailablePlayers(prev => [...prev, teamPlayer.player])
      }
    },
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      // Rollback on error
      refetch()
      alert(`Error removing player: ${error.message}`)
    }
  })

  const movePlayerBetweenSlotsMutation = trpc.teamPlayer.movePlayerBetweenSlots.useMutation({
    onMutate: async (variables) => {
      // Optimistically update the UI immediately
      optimisticMovePlayer(variables.fromTeamId, variables.toTeamId, variables.fromSlotIndex, variables.toSlotIndex)
    },
    onSuccess: () => {
      // Refetch to sync with server state
      refetch()
    },
    onError: (error) => {
      // Rollback on error
      refetch()
      alert(`Error moving player: ${error.message}`)
    }
  })

  // Optimistic update functions
  const optimisticMoveTeam = (teamId: string, targetDivisionId: string, targetPoolId: string | null) => {
    setLocalDivisions(prevDivisions => {
      return prevDivisions.map(division => {
        // Remove team from current division
        const updatedTeams = division.teams.filter(team => team.id !== teamId)
        
        // Add team to target division
        if (division.id === targetDivisionId) {
          const teamToMove = prevDivisions
            .flatMap(d => d.teams)
            .find(t => t.id === teamId)
          
          if (teamToMove) {
            return {
              ...division,
              teams: [...updatedTeams, { ...teamToMove, poolId: targetPoolId }]
            }
          }
        }
        
        return {
          ...division,
          teams: updatedTeams
        }
      })
    })
  }

  const rollbackTeamMove = () => {
    // Revert to server data
    if (tournament?.divisions) {
      setLocalDivisions(tournament.divisions)
    }
  }

  const optimisticMovePlayer = (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => {
    setLocalDivisions(prevDivisions => {
      return prevDivisions.map(division => ({
        ...division,
        teams: division.teams.map(team => {
          // Get the player being moved - ensure we're working with sorted arrays
          const fromTeam = prevDivisions.flatMap(d => d.teams).find(t => t.id === fromTeamId)
          const toTeam = prevDivisions.flatMap(d => d.teams).find(t => t.id === toTeamId)
          
          if (!fromTeam || !toTeam) return team
          
          // Sort teamPlayers by createdAt to match server behavior
          const sortedFromTeamPlayers = [...fromTeam.teamPlayers].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
          const sortedToTeamPlayers = [...toTeam.teamPlayers].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
          
          const playerToMove = sortedFromTeamPlayers[fromSlotIndex]
          const targetPlayer = sortedToTeamPlayers[toSlotIndex]
          
          if (!playerToMove) return team
          
          // Handle from team
          if (team.id === fromTeamId) {
            const newTeamPlayers = [...team.teamPlayers]
            
            if (fromTeamId === toTeamId) {
              // Same team - swap or reorder
              if (targetPlayer) {
                // Find indices in unsorted array
                const fromIndex = newTeamPlayers.findIndex(tp => tp.id === playerToMove.id)
                const toIndex = newTeamPlayers.findIndex(tp => tp.id === targetPlayer.id)
                
                if (fromIndex !== -1 && toIndex !== -1) {
                  // Swap
                  newTeamPlayers[fromIndex] = targetPlayer
                  newTeamPlayers[toIndex] = playerToMove
                }
              }
              // If moving to empty slot within same team, no change needed
            } else {
              // Different team - remove from this team
              if (targetPlayer) {
                // Find indices in unsorted array
                const fromIndex = newTeamPlayers.findIndex(tp => tp.id === playerToMove.id)
                const toIndex = newTeamPlayers.findIndex(tp => tp.id === targetPlayer.id)
                
                if (fromIndex !== -1 && toIndex !== -1) {
                  // Swap - replace with target player
                  newTeamPlayers[fromIndex] = targetPlayer
                }
              } else {
                // Just remove
                const fromIndex = newTeamPlayers.findIndex(tp => tp.id === playerToMove.id)
                if (fromIndex !== -1) {
                  newTeamPlayers.splice(fromIndex, 1)
                }
              }
            }
            
            return {
              ...team,
              teamPlayers: newTeamPlayers
            }
          }
          
          // Handle to team (only if different from from team)
          if (team.id === toTeamId && fromTeamId !== toTeamId) {
            const newTeamPlayers = [...team.teamPlayers]
            
            if (targetPlayer) {
              // Swap - target player already moved to from team
              const toIndex = newTeamPlayers.findIndex(tp => tp.id === targetPlayer.id)
              if (toIndex !== -1) {
                newTeamPlayers[toIndex] = playerToMove
              }
            } else {
              // Add to empty slot - append to end
              newTeamPlayers.push(playerToMove)
            }
            
            return {
              ...team,
              teamPlayers: newTeamPlayers
            }
          }
          
          return team
        })
      }))
    })
  }

  const optimisticRemovePlayer = (teamPlayerId: string, slotIndex: number) => {
    setLocalDivisions(prevDivisions => {
      return prevDivisions.map(division => ({
        ...division,
        teams: division.teams.map(team => {
          const teamPlayerIndex = team.teamPlayers.findIndex(tp => tp.id === teamPlayerId)
          if (teamPlayerIndex !== -1) {
            const newTeamPlayers = [...team.teamPlayers]
            // Remove player by teamPlayerId
            newTeamPlayers.splice(teamPlayerIndex, 1)
            
            return {
              ...team,
              teamPlayers: newTeamPlayers
            }
          }
          return team
        })
      }))
    })
  }

  const optimisticAddPlayer = (teamId: string, playerId: string, slotIndex: number) => {
    setLocalDivisions(prevDivisions => {
      return prevDivisions.map(division => ({
        ...division,
        teams: division.teams.map(team => {
          if (team.id === teamId) {
            // Find the player in available players BEFORE removing them
            const player = availablePlayers.find(p => p.id === playerId)
            if (!player) return team
            
            const newTeamPlayers = [...team.teamPlayers]
            // Add player to the specified slot
            newTeamPlayers[slotIndex] = {
              id: `temp-${Date.now()}`, // Temporary ID for optimistic update
              role: 'player', // Default role
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              player: {
                ...player,
                teamId: teamId,
                teamName: team.name
              }
            }
            
            return {
              ...team,
              teamPlayers: newTeamPlayers
            }
          }
          return team
        })
      }))
    })
    
    // Remove player from availablePlayers after successfully adding to team
    setAvailablePlayers(prev => prev.filter(p => p.id !== playerId))
  }

  const filteredDivisions = useMemo(() => {
    if (!localDivisions) return []
    
    // Filter out divisions that are part of a merged division
    const mergedDivisionIds = new Set<string>()
    const mergedDivisions = localDivisions.filter((div: any) => div.isMerged && div.mergedFromDivisionIds)
    
    mergedDivisions.forEach((div: any) => {
      const mergedFromIds = Array.isArray(div.mergedFromDivisionIds) 
        ? div.mergedFromDivisionIds 
        : []
      mergedFromIds.forEach((id: string) => mergedDivisionIds.add(id))
    })
    
    return localDivisions.filter((div: any) => {
      // Filter by search query
      const matchesSearch = div.name.toLowerCase().includes(searchQuery.toLowerCase())
      if (!matchesSearch) return false
      
      // Show merged divisions
      if (div.isMerged) return true
      // Show divisions with teams
      if ((div.teams?.length || 0) > 0) return true
      // Hide divisions with 0 teams that were merged into another division
      return !mergedDivisionIds.has(div.id)
    })
  }, [localDivisions, searchQuery])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTeam(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      setActiveTeam(null)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string

    console.log('[divisions/page] handleDragEnd - activeId:', activeId, 'overId:', overId)

    // Check if this is a player drag event
    // Pattern: player-{teamId}-slot-{slotIndex}
    // teamId is a UUID with dashes: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const playerPattern = /^player-(.+)-slot-(\d+)$/
    const activePlayerMatch = activeId.match(playerPattern)
    const overPlayerMatch = overId.match(playerPattern)
    
    console.log('[divisions/page] activePlayerMatch:', activePlayerMatch)
    console.log('[divisions/page] overPlayerMatch:', overPlayerMatch)

    if (activePlayerMatch && overPlayerMatch) {
      // Player drag-and-drop
      const fromTeamId = activePlayerMatch[1]
      const fromSlotIndex = parseInt(activePlayerMatch[2])
      const toTeamId = overPlayerMatch[1]
      const toSlotIndex = parseInt(overPlayerMatch[2])

      console.log('[divisions/page] Player drag detected')
      console.log('[divisions/page] From:', fromTeamId, 'slot:', fromSlotIndex)
      console.log('[divisions/page] To:', toTeamId, 'slot:', toSlotIndex)

      handleMovePlayerBetweenSlots(fromTeamId, toTeamId, fromSlotIndex, toSlotIndex)
      return
    }

    // Team drag-and-drop (existing logic)
    const teamId = activeId
    
    // Parse drop zone ID and determine target
    let targetDivisionId: string | null = null
    let targetPoolId: string | null = null

    if (overId.startsWith('waitlist-')) {
      targetDivisionId = overId.replace('waitlist-', '')
      targetPoolId = null
    } else if (overId.startsWith('pool-')) {
      const poolId = overId.replace('pool-', '')
      targetPoolId = poolId
      // Find division for this pool
      const division = localDivisions.find(d => 
        d.pools.some(p => p.id === poolId)
      )
      targetDivisionId = division?.id || null
    } else if (overId.startsWith('division-')) {
      targetDivisionId = overId.replace('division-', '')
      // For division drops, use first pool or waitlist
      const targetDivision = localDivisions.find(d => d.id === targetDivisionId)
      targetPoolId = targetDivision?.pools.length ? targetDivision.pools[0].id : null
    } else {
      // overId is not a drop zone - it's probably another team
      const targetTeam = localDivisions
        .flatMap(division => division.teams)
        .find(team => team.id === overId)
      
      if (targetTeam) {
        targetPoolId = targetTeam.poolId
        // Find division for this team
        const division = localDivisions.find(d => 
          d.teams.some(t => t.id === overId)
        )
        targetDivisionId = division?.id || null
      }
    }

    if (!targetDivisionId) {
      setActiveTeam(null)
      return
    }

    // Get current division
    const currentDivision = localDivisions.find(d => 
      d.teams.some(t => t.id === teamId)
    )
    
    if (!currentDivision) {
      setActiveTeam(null)
      return
    }

    // Apply optimistic update immediately
    optimisticMoveTeam(teamId, targetDivisionId, targetPoolId)

    // Make server request
    const performMove = async () => {
      try {
        if (targetDivisionId !== currentDivision.id) {
          await moveTeamToDivisionMutation.mutateAsync({
            teamId,
            divisionId: targetDivisionId,
          })
          
          // If targetPoolId is specified, also move to that pool
          if (targetPoolId) {
            await moveTeamToPoolMutation.mutateAsync({
              teamId,
              poolId: targetPoolId,
            })
          }
        } else {
          await moveTeamToPoolMutation.mutateAsync({
            teamId,
            poolId: targetPoolId,
          })
        }
      } catch (error) {
        console.error('Failed to move team:', error)
        rollbackTeamMove()
      }
    }

    performMove()
    setActiveTeam(null)
  }

  const toggleDivisionExpansion = (divisionId: string) => {
    const newExpanded = new Set(expandedDivisions)
    if (newExpanded.has(divisionId)) {
      newExpanded.delete(divisionId)
    } else {
      newExpanded.add(divisionId)
    }
    setExpandedDivisions(newExpanded)
  }

  const handleEditDivision = (division: Division) => {
    setSelectedDivision(division)
    setShowEditDrawer(true)
  }

  const handleAddTeam = (division: Division) => {
    // For SINGLES_1v1, use AddPlayerModal instead
    if (division.teamKind === 'SINGLES_1v1') {
      setSelectedDivisionForPlayer(division)
      setShowAddPlayerModal(true)
    } else {
      setSelectedDivisionForTeam(division)
      setShowAddTeamModal(true)
    }
  }

  const handleMergeDivisions = (division: Division) => {
    setSelectedDivisionForMerge(division)
    setShowMergeDivisionModal(true)
  }

  const handleUnmergeDivisions = (division: Division) => {
    setSelectedDivisionForUnmerge(division)
    setShowUnmergeDivisionModal(true)
  }

  const handleDistributeTeams = (divisionId: string) => {
    if (window.confirm('Are you sure you want to redistribute teams by DUPR rating? This will move all teams from their current pools.')) {
      distributeTeamsMutation.mutate({ divisionId })
    }
  }

  const handleDeleteDivision = (divisionId: string) => {
    if (window.confirm('Are you sure you want to delete this division? All players in this division will become free agents and can be added to any other division.')) {
      deleteDivisionMutation.mutate({ id: divisionId })
    }
  }

  const handleTeamMove = async (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => {
    try {
      await moveTeamToDivisionMutation.mutateAsync({
        teamId,
        divisionId: targetDivisionId,
      })
      
      // If targetPoolId is specified, also move to that pool
      if (targetPoolId !== undefined) {
        await moveTeamToPoolMutation.mutateAsync({
          teamId,
          poolId: targetPoolId,
        })
      }
    } catch (error) {
      console.error('Error moving team:', error)
    }
  }

  const handleTeamMoveToPool = (teamId: string, targetPoolId: string | null) => {
    moveTeamToPoolMutation.mutate({
      teamId,
      poolId: targetPoolId,
    })
  }

  const handleEditTeam = (team: Team) => {
    setSelectedTeam(team)
    setShowEditTeamModal(true)
  }

  const handleDeleteTeam = (team: Team) => {
    // Find division to get teamKind
    const division = localDivisions.find(d => d.teams.some(t => t.id === team.id))
    const teamKind = division?.teamKind
    
    // Get display name (player name for SINGLES_1v1, team name for others)
    const displayName = teamKind === 'SINGLES_1v1' && team.teamPlayers && team.teamPlayers.length > 0
      ? `${team.teamPlayers[0].player.firstName} ${team.teamPlayers[0].player.lastName}`
      : team.name
    
    const confirmMessage = teamKind === 'SINGLES_1v1'
      ? `Are you sure you want to delete "${displayName}"?`
      : `Are you sure you want to delete "${displayName}"? This will remove all players from the team and cannot be undone.`
    
    if (window.confirm(confirmMessage)) {
      // Use the existing deleteTeamMutation
      deleteTeamMutation.mutate({ id: team.id })
    }
  }

  const toggleTeamExpansion = (teamId: string) => {
    const newExpanded = new Set(expandedTeams)
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId)
    } else {
      newExpanded.add(teamId)
    }
    setExpandedTeams(newExpanded)
  }

  const handleAddPlayerToSlot = (teamId: string, slotIndex: number, playerId: string) => {
    addPlayerToSlotMutation.mutate({
      teamId,
      playerId,
      slotIndex
    })
  }

  const handleRemovePlayerFromSlot = (teamPlayerId: string, slotIndex: number) => {
    removePlayerFromSlotMutation.mutate({
      teamPlayerId,
      slotIndex
    })
  }

  const handleMovePlayerBetweenSlots = (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => {
    console.log('[handleMovePlayerBetweenSlots] Called:', { fromTeamId, toTeamId, fromSlotIndex, toSlotIndex })
    
    // Find the teams
    const fromTeam = localDivisions
      .flatMap(d => d.teams)
      .find(t => t.id === fromTeamId)
    
    const toTeam = localDivisions
      .flatMap(d => d.teams)
      .find(t => t.id === toTeamId)
    
    if (fromTeam && toTeam) {
      const fromTeamPlayer = fromTeam.teamPlayers[fromSlotIndex]
      
      if (fromTeamPlayer) {
        console.log('[handleMovePlayerBetweenSlots] Moving player:', fromTeamPlayer.player.firstName, fromTeamPlayer.player.lastName)
        
        // Call mutation with team IDs
        movePlayerBetweenSlotsMutation.mutate({
          fromTeamId,
          toTeamId,
          fromSlotIndex,
          toSlotIndex
        })
      } else {
        console.log('[handleMovePlayerBetweenSlots] No player in source slot')
      }
    } else {
      console.log('[handleMovePlayerBetweenSlots] Teams not found')
    }
  }

  const handleSaveDivision = (data: {
    name: string
    teamKind: string
    pairingMode: string
    poolCount: number
    maxTeams?: number
    minDupr?: number
    maxDupr?: number
    minAge?: number
    maxAge?: number
  }) => {
    if (!selectedDivision) return

    updateDivisionMutation.mutate({
      id: selectedDivision.id,
      name: data.name,
      teamKind: data.teamKind as any,
      pairingMode: data.pairingMode as any,
      poolCount: data.poolCount,
      maxTeams: data.maxTeams,
      minDupr: data.minDupr,
      maxDupr: data.maxDupr,
      minAge: data.minAge,
      maxAge: data.maxAge,
    })
  }

  if (!tournament) {
    return <div>Loading...</div>
  }

  // Check if user has admin access (owner or ADMIN access level)
  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  const isOwner = tournament?.userAccessInfo?.isOwner

  // Get pending access requests count (only for owner)
  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0

  // Check if user has access to any divisions
  // Check if user has admin access to manage divisions
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TournamentNavBar
          tournamentTitle={tournament?.title}
          isAdmin={false}
          isOwner={false}
          pendingRequestsCount={0}
        />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Insufficient Permissions</h2>
            <p className="text-gray-600 mb-6">
              Division management is only available to tournament administrators.
              Please contact the tournament owner to request administrative access.
            </p>
            <Link
              href={`/admin/${tournamentId}`}
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Back to Tournament
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (tournament.divisions.length === 0) {
    return (
      <>
        <div className="min-h-screen bg-gray-50">
          <TournamentNavBar
            tournamentTitle={tournament.title}
            isAdmin={isAdmin}
            isOwner={isOwner}
            pendingRequestsCount={pendingRequestsCount}
          />
          <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
            <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">No divisions yet</h2>
              <p className="text-gray-600 mb-6">
                This tournament doesn&apos;t have any divisions yet. Create the first one to start adding teams and matches.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => setShowAddDivisionModal(true)} className="flex-1">
                  Create division
                </Button>
                <Link
                  href={`/admin/${tournamentId}`}
                  className="flex-1 inline-flex items-center justify-center border border-gray-300 text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-50"
                >
                  Back to tournament
                </Link>
              </div>
            </div>
          </div>
        </div>

        <AddDivisionModal
          isOpen={showAddDivisionModal}
          onClose={() => setShowAddDivisionModal(false)}
          tournamentId={tournamentId}
          onSuccess={() => {
            setShowAddDivisionModal(false)
            refetch()
          }}
        />
      </>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <TournamentNavBar
        tournamentTitle={tournament.title}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
      />
      
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Divisions</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button
                variant={viewMode === 'overview' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('overview')}
                className="flex items-center space-x-2"
              >
                <List className="h-4 w-4" />
                <span>Overview</span>
              </Button>
              
              <Button
                variant={viewMode === 'board' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('board')}
                className="flex items-center space-x-2"
              >
                <Grid3X3 className="h-4 w-4" />
                <span>Board</span>
              </Button>
              
              <Button 
                className="flex items-center space-x-2"
                onClick={() => setShowAddDivisionModal(true)}
              >
                <Plus className="h-4 w-4" />
                <span>Create Division</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {viewMode === 'overview' ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Search and filters</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search divisions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-4">
                  {filteredDivisions.map((division) => (
                    <DivisionCard
                      key={division.id}
                      division={division}
                      isExpanded={expandedDivisions.has(division.id)}
                      onToggleExpansion={() => toggleDivisionExpansion(division.id)}
                      onEditDivision={() => handleEditDivision(division)}
                      onAddTeam={() => handleAddTeam(division)}
                      onDistributeTeams={handleDistributeTeams}
                      onMergeDivisions={handleMergeDivisions}
                    onUnmergeDivisions={handleUnmergeDivisions}
                      onDeleteDivision={handleDeleteDivision}
                      onTeamMove={handleTeamMove}
                      onEditTeam={handleEditTeam}
                      onDeleteTeam={handleDeleteTeam}
                      expandedTeams={expandedTeams}
                      availablePlayers={availablePlayers}
                      tournamentId={tournamentId}
                      onToggleTeamExpansion={toggleTeamExpansion}
                      onAddPlayerToSlot={handleAddPlayerToSlot}
                      onRemovePlayerFromSlot={handleRemovePlayerFromSlot}
                      onMovePlayerBetweenSlots={handleMovePlayerBetweenSlots}
                    />
                  ))}
                </div>
                
                <DragOverlay>
                  {activeTeam ? (
                    <div className="bg-white border rounded-lg shadow-lg p-2">
                      Moving team...
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        ) : (
          <BoardMode
            tournamentId={tournamentId}
            divisions={localDivisions}
            onTeamMove={handleTeamMove}
            onTeamMoveToPool={handleTeamMoveToPool}
            onEditDivision={handleEditDivision}
            onAddTeam={handleAddTeam}
            onDeleteDivision={handleDeleteDivision}
            availablePlayers={availablePlayers}
            onAddPlayerToSlot={handleAddPlayerToSlot}
            onRemovePlayerFromSlot={handleRemovePlayerFromSlot}
            onMovePlayerBetweenSlots={handleMovePlayerBetweenSlots}
          />
        )}
      </div>
      
      {/* Edit Division Drawer */}
      <EditDivisionDrawer
        division={selectedDivision}
        isOpen={showEditDrawer}
        onClose={() => {
          setShowEditDrawer(false)
          setSelectedDivision(null)
        }}
        onSave={handleSaveDivision}
      />

      {/* Add Team Modal */}
      <AddTeamModal
        divisions={divisions}
        selectedDivisionId={selectedDivisionForTeam?.id}
        isOpen={showAddTeamModal}
        onClose={() => {
          setShowAddTeamModal(false)
          setSelectedDivisionForTeam(null)
        }}
        onSuccess={() => {
          refetch()
        }}
      />

      {/* Add Player Modal (for SINGLES_1v1) */}
      {selectedDivisionForPlayer && (
        <AddPlayerModal
          division={selectedDivisionForPlayer}
          availablePlayers={availablePlayers}
          tournamentId={tournamentId}
          isOpen={showAddPlayerModal}
          onClose={() => {
            setShowAddPlayerModal(false)
            setSelectedDivisionForPlayer(null)
          }}
          onSuccess={() => {
            refetch()
          }}
        />
      )}

      {/* Add Division Modal */}
      <AddDivisionModal
        isOpen={showAddDivisionModal}
        onClose={() => setShowAddDivisionModal(false)}
        tournamentId={tournamentId}
        onSuccess={() => {
          refetch()
        }}
      />
      
      {selectedDivisionForMerge && (
        <MergeDivisionModal
          isOpen={showMergeDivisionModal}
          onClose={() => {
            setShowMergeDivisionModal(false)
            setSelectedDivisionForMerge(null)
          }}
          tournamentId={tournamentId}
          sourceDivision={selectedDivisionForMerge as any}
          availableDivisions={localDivisions as any}
          onSuccess={() => {
            refetch()
          }}
        />
      )}

      {selectedDivisionForUnmerge && (
        <UnmergeDivisionModal
          isOpen={showUnmergeDivisionModal}
          onClose={() => {
            setShowUnmergeDivisionModal(false)
            setSelectedDivisionForUnmerge(null)
          }}
          mergedDivision={selectedDivisionForUnmerge as any}
          onSuccess={() => {
            refetch()
          }}
        />
      )}

      {/* Edit Team Modal */}
      <EditTeamModal
        team={selectedTeam}
        divisions={divisions}
        isOpen={showEditTeamModal}
        onClose={() => {
          setShowEditTeamModal(false)
          setSelectedTeam(null)
        }}
        onSuccess={() => {
          refetch()
        }}
      />
    </div>
  )
}
