'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo } from 'react'
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
  AlertTriangle
} from 'lucide-react'
import EditDivisionDrawer from '@/components/EditDivisionDrawer'

interface Team {
  id: string
  name: string
  seed: number | null
  note: string | null
  poolId: string | null
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
      birthDate: string | null
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
  stage: string
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
  onDeleteTeam 
}: {
  division: Division
  onTeamMove: (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => void
  onEditTeam: (team: Team) => void
  onDeleteTeam: (team: Team) => void
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
            Перетащите команды сюда для ожидания
          </div>
        ) : (
          <div className="space-y-2">
            {waitListTeams.map((team) => (
              <SortableTeam
                key={team.id}
                team={team}
                onEdit={() => onEditTeam(team)}
                onDelete={() => onDeleteTeam(team)}
                onExpand={() => {}}
                isExpanded={false}
                onContextMenu={() => {}}
                onDeletePlayer={() => {}}
                onPlayerContextMenu={() => {}}
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
  onDeleteTeam 
}: {
  pool: Pool
  division: Division
  onTeamMove: (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => void
  onEditTeam: (team: Team) => void
  onDeleteTeam: (team: Team) => void
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
          {pool.name} ({poolTeams.length})
        </h4>
      </div>
      
      <div
        ref={setNodeRef}
        className="min-h-[80px] border-2 border-dashed border-blue-400 rounded-lg p-4 bg-blue-100 hover:bg-blue-200 transition-colors"
      >
        {poolTeams.length === 0 ? (
          <div className="text-center text-blue-400 text-sm py-4">
            Перетащите команды сюда
          </div>
        ) : (
          <div className="space-y-2">
            {poolTeams.map((team) => (
              <SortableTeam
                key={team.id}
                team={team}
                onEdit={() => onEditTeam(team)}
                onDelete={() => onDeleteTeam(team)}
                onExpand={() => {}}
                isExpanded={false}
                onContextMenu={() => {}}
                onDeletePlayer={() => {}}
                onPlayerContextMenu={() => {}}
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
  onTeamMove, 
  onEditTeam, 
  onDeleteTeam 
}: {
  division: Division
  isExpanded: boolean
  onToggleExpansion: () => void
  onEditDivision: () => void
  onAddTeam: () => void
  onTeamMove: (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => void
  onEditTeam: (team: Team) => void
  onDeleteTeam: (team: Team) => void
}) {
  const activeTeams = division.teams.filter(team => team.poolId !== null)
  const waitListTeams = division.teams.filter(team => team.poolId === null)
  const totalTeams = division.teams.length

  // Add drop zone for division
  const { setNodeRef: setDivisionNodeRef } = useDroppable({
    id: `division-${division.id}`,
  })

  const getStageBadge = (stage: string) => {
    const stageMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      'RR_IN_PROGRESS': { label: 'RR', variant: 'default' },
      'RR_COMPLETE': { label: 'RR ✓', variant: 'secondary' },
      'PLAY_IN_SCHEDULED': { label: 'Play-In', variant: 'outline' },
      'PLAY_IN_IN_PROGRESS': { label: 'Play-In', variant: 'default' },
      'PLAY_IN_COMPLETE': { label: 'Play-In ✓', variant: 'secondary' },
      'PO_R1_SCHEDULED': { label: 'R1', variant: 'outline' },
      'PO_R1_IN_PROGRESS': { label: 'R1', variant: 'default' },
      'PO_R1_COMPLETE': { label: 'R1 ✓', variant: 'secondary' },
      'FINAL_COMPLETE': { label: 'Final ✓', variant: 'secondary' },
      'DIVISION_COMPLETE': { label: 'Complete', variant: 'secondary' },
    }
    return stageMap[stage] || { label: stage, variant: 'outline' }
  }

  const stageInfo = getStageBadge(division.stage)

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
              <CardTitle className="text-lg">{division.name}</CardTitle>
              <CardDescription className="flex items-center space-x-2 mt-1">
                <span>{totalTeams} команд</span>
                <span>•</span>
                <span>{division.teamKind}</span>
                <span>•</span>
                <span>{division.pairingMode}</span>
                {division.poolCount >= 1 && (
                  <>
                    <span>•</span>
                    <span>{division.poolCount} пулов</span>
                  </>
                )}
                {division.maxTeams && (
                  <>
                    <span>•</span>
                    <span>лимит: {division.maxTeams}</span>
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Badge variant={stageInfo.variant}>{stageInfo.label}</Badge>
            
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
              >
                <Plus className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <MoreVertical className="h-4 w-4" />
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
                  />
                ))}
              </div>
            ) : (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm text-green-600 flex items-center">
                    <Trophy className="h-4 w-4 mr-1" />
                    Активные команды ({activeTeams.length})
                  </h4>
                </div>
                
                <div className="space-y-2">
                  {activeTeams.map((team) => (
                    <SortableTeam
                      key={team.id}
                      team={team}
                      onEdit={() => onEditTeam(team)}
                      onDelete={() => onDeleteTeam(team)}
                      onExpand={() => {}}
                      isExpanded={false}
                      onContextMenu={() => {}}
                      onDeletePlayer={() => {}}
                      onPlayerContextMenu={() => {}}
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
  const [activeTeam, setActiveTeam] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'overview' | 'board'>('overview')
  const [showEditDrawer, setShowEditDrawer] = useState(false)
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null)

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

  const moveTeamToDivisionMutation = trpc.team.moveToDivision.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      alert(`Ошибка при перемещении команды: ${error.message}`)
    }
  })

  const moveTeamToPoolMutation = trpc.team.moveToPool.useMutation({
    onSuccess: () => {
      console.log('moveToPool success')
      refetch()
    },
    onError: (error) => {
      console.error('moveToPool error:', error)
      alert(`Ошибка при перемещении команды: ${error.message}`)
    }
  })

  const updateDivisionMutation = trpc.division.update.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      alert(`Ошибка при обновлении дивизиона: ${error.message}`)
    }
  })

  const filteredDivisions = useMemo(() => {
    if (!tournament?.divisions) return []
    
    return tournament.divisions.filter(division =>
      division.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [tournament?.divisions, searchQuery])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTeam(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTeam(null)

    if (!over) return

    const teamId = active.id as string
    const overId = over.id as string

    console.log('Drag end:', { teamId, overId, activeId: active.id })
    console.log('Available drop zones:', ['waitlist-', 'pool-', 'division-'])

    // Check if overId is a valid drop zone (not another team)
    if (overId.startsWith('waitlist-')) {
      const divisionId = overId.replace('waitlist-', '')
      console.log('Moving to WaitList:', { teamId, divisionId })
      moveTeamToPoolMutation.mutate({
        teamId,
        poolId: null, // Move to WaitList
      })
    } else if (overId.startsWith('pool-')) {
      const poolId = overId.replace('pool-', '')
      console.log('Moving to Pool:', { teamId, poolId })
      moveTeamToPoolMutation.mutate({
        teamId,
        poolId,
      })
    } else if (overId.startsWith('division-')) {
      const divisionId = overId.replace('division-', '')
      console.log('Moving to Division:', { teamId, divisionId })
      moveTeamToDivisionMutation.mutate({
        teamId,
        divisionId,
      })
    } else {
      // overId is not a drop zone - it's probably another team or invalid target
      console.log('Invalid drop target:', overId)
      console.log('This is likely another team ID, not a drop zone')
      console.log('Make sure to drop on the colored drop zones (WaitList, Pool, or Division areas)')
      
      // Don't perform any mutation - just ignore the drop
      return
    }
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
    // TODO: Implement add team modal
    console.log('Add team to division:', division.name)
  }

  const handleTeamMove = (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => {
    if (targetPoolId === undefined) {
      // Moving between divisions
      moveTeamToDivisionMutation.mutate({
        teamId,
        divisionId: targetDivisionId,
      })
    } else {
      // Moving between pools or to/from WaitList
      moveTeamToPoolMutation.mutate({
        teamId,
        poolId: targetPoolId,
      })
    }
  }

  const handleEditTeam = (team: Team) => {
    // TODO: Implement edit team modal
    console.log('Edit team:', team.name)
  }

  const handleDeleteTeam = (team: Team) => {
    // TODO: Implement delete team confirmation
    console.log('Delete team:', team.name)
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link href={`/admin/${tournamentId}`}>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Назад</span>
                </Button>
              </Link>
              
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Дивизионы</h1>
                <p className="text-sm text-gray-500">{tournament.title}</p>
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
              
              <Button className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Создать дивизион</span>
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
                  <h3 className="font-medium text-gray-900 mb-2">Поиск и фильтры</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Поиск дивизионов..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Быстрые действия</h4>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Settings className="h-4 w-4 mr-2" />
                      Настройки
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Copy className="h-4 w-4 mr-2" />
                      Дублировать
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Download className="h-4 w-4 mr-2" />
                      Экспорт
                    </Button>
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
                      onTeamMove={handleTeamMove}
                      onEditTeam={handleEditTeam}
                      onDeleteTeam={handleDeleteTeam}
                    />
                  ))}
                </div>
                
                <DragOverlay>
                  {activeTeam ? (
                    <div className="bg-white border rounded-lg shadow-lg p-2">
                      Перемещение команды...
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Grid3X3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Board Mode</h3>
            <p className="text-gray-500">Канбан-доска для массового распределения команд</p>
            <p className="text-sm text-gray-400 mt-2">В разработке...</p>
          </div>
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
    </div>
  )
}
