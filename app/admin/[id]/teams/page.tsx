'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
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
  arrayMove,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical, Users, Edit, Trash2, MoreVertical } from 'lucide-react'

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
      externalId: string | null
    }
    teamId: string
    playerId: string
  }>
}

interface Pool {
  id: string
  name: string
  divisionId: string
}

interface Division {
  id: string
  name: string
  teamKind: string
  pairingMode: string
  poolsEnabled: boolean
  maxTeams: number | null
  teams: Team[]
  pools: Pool[]
}

interface Tournament {
  id: string
  title: string
  divisions: Division[]
}

// Droppable Division Component
function DroppableDivision({ division, children, onTeamMove }: {
  division: Division
  children: React.ReactNode
  onTeamMove: (teamId: string, divisionId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: division.id,
  })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[100px] p-2 border-2 border-dashed rounded-lg transition-colors ${
        isOver 
          ? 'border-blue-400 bg-blue-50' 
          : 'border-gray-200'
      }`}
    >
      {children}
    </div>
  )
}

// Sortable Player Component
function SortablePlayer({ teamPlayer, onEdit, onDelete, onContextMenu }: {
  teamPlayer: {
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
      externalId: string | null
    }
    teamId: string
    playerId: string
  }
  onEdit: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent, type: 'player', id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: teamPlayer.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-2 bg-gray-50 rounded"
    >
      <div className="flex items-center space-x-2">
        <button
          {...attributes}
          {...listeners}
          className="p-1 hover:bg-gray-200 rounded cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3 text-gray-400" />
        </button>
        <span className="text-sm">
          {teamPlayer.player.firstName} {teamPlayer.player.lastName}
        </span>
        {teamPlayer.player.gender && (
          <span className="text-xs text-gray-500">({teamPlayer.player.gender})</span>
        )}
        {teamPlayer.player.dupr && (
          <span className="text-xs text-gray-500">DUPR: {teamPlayer.player.dupr}</span>
        )}
      </div>
      <div className="flex space-x-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Edit className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
        <Button 
          size="sm" 
          variant="ghost" 
          onContextMenu={(e) => onContextMenu(e, 'player', teamPlayer.id)}
        >
          <MoreVertical className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// Sortable Team Component
function SortableTeam({ team, onEdit, onDelete, onExpand, isExpanded, onContextMenu, onDeletePlayer, onPlayerContextMenu }: {
  team: Team
  onEdit: () => void
  onDelete: () => void
  onExpand: () => void
  isExpanded: boolean
  onContextMenu: (e: React.MouseEvent, type: 'team', id: string) => void
  onDeletePlayer: (teamPlayerId: string, playerName: string) => void
  onPlayerContextMenu: (e: React.MouseEvent, type: 'player', id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id })

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: team.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setDroppableRef(node)
      }}
      style={style}
      className={`bg-white border rounded-lg p-3 mb-2 shadow-sm hover:shadow-md transition-shadow ${
        isOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            {...attributes}
            {...listeners}
            className="p-1 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-gray-400" />
          </button>
          
          <button
            onClick={onExpand}
            className="p-1 hover:bg-gray-100 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
          </button>

          <div>
            <span className="font-medium text-gray-900">{team.name}</span>
            {team.seed && (
              <span className="ml-2 text-sm text-gray-500">(#{team.seed})</span>
            )}
            {team.note && (
              <span className="ml-2 text-sm text-gray-500">- {team.note}</span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center text-sm text-gray-500">
            <Users className="h-4 w-4 mr-1" />
            {team.teamPlayers.length}
          </div>
          
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onContextMenu={(e) => onContextMenu(e, 'team', team.id)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 ml-6 space-y-2">
          {team.teamPlayers.length > 0 ? (
            <SortableContext
              items={team.teamPlayers.map(tp => tp.id)}
              strategy={verticalListSortingStrategy}
            >
              {team.teamPlayers.map((teamPlayer) => (
                <SortablePlayer
                  key={teamPlayer.id}
                  teamPlayer={teamPlayer}
                  onEdit={() => {
                    // TODO: Implement player editing
                    console.log('Edit player:', teamPlayer.player.id)
                  }}
                  onDelete={() => {
                    onDeletePlayer(teamPlayer.id, `${teamPlayer.player.firstName} ${teamPlayer.player.lastName}`)
                  }}
                  onContextMenu={onPlayerContextMenu}
                />
              ))}
            </SortableContext>
          ) : (
            <p className="text-sm text-gray-500">Игроки не добавлены</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function TeamsPage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showEditTeam, setShowEditTeam] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    type: 'team' | 'player' | null
    id: string | null
    x: number
    y: number
  }>({ type: null, id: null, x: 0, y: 0 })
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [activeTeam, setActiveTeam] = useState<Team | null>(null)
  const [activePlayer, setActivePlayer] = useState<{
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
      externalId: string | null
    }
    teamId: string
    playerId: string
  } | null>(null)
  const [teamForm, setTeamForm] = useState({
    name: '',
    divisionId: '',
    seed: undefined as number | undefined,
    note: '',
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const { data: tournament, isLoading, refetch } = trpc.tournament.get.useQuery({ id: tournamentId })
  const createTeam = trpc.team.create.useMutation({
    onSuccess: () => {
      setShowCreateTeam(false)
      setTeamForm({
        name: '',
        divisionId: '',
        seed: undefined,
        note: '',
      })
      refetch()
    },
  })

  const updateTeam = trpc.team.update.useMutation({
    onSuccess: () => {
      setShowEditTeam(false)
      refetch()
    },
    onError: (error) => {
      alert(`Ошибка при обновлении команды: ${error.message}`)
    }
  })

  const deleteTeam = trpc.team.delete.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      alert(`Ошибка при удалении команды: ${error.message}`)
    }
  })

  const movePlayerMutation = trpc.teamPlayer.movePlayer.useMutation({
    onSuccess: (data) => {
      console.log('Player move success:', data)
      refetch()
    },
    onError: (error) => {
      console.error('Player move error:', error)
      alert(`Ошибка при перемещении игрока: ${error.message}`)
    }
  })

  const removePlayerMutation = trpc.teamPlayer.removePlayer.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      alert(`Ошибка при удалении игрока: ${error.message}`)
    }
  })

  const handleCreateTeam = () => {
    if (!teamForm.name.trim()) {
      alert('Пожалуйста, введите название команды')
      return
    }
    if (!teamForm.divisionId) {
      alert('Пожалуйста, выберите дивизион')
      return
    }

    createTeam.mutate({
      divisionId: teamForm.divisionId,
      name: teamForm.name,
      seed: teamForm.seed,
      note: teamForm.note || undefined,
    })
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    
    // Check if it's a team or player being dragged
    const team = findTeamById(active.id as string)
    if (team) {
      setActiveTeam(team)
      return
    }

    // Check if it's a player being dragged
    const player = findPlayerById(active.id as string)
    if (player) {
      setActivePlayer(player)
      return
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTeam(null)
    setActivePlayer(null)

    if (!over) return

    // Handle team movement
    const activeTeam = findTeamById(active.id as string)
    const overDivision = findDivisionById(over.id as string)

    if (activeTeam && overDivision) {
      // Check if team is being moved to a different division
      const currentDivision = findDivisionByTeamId(active.id as string)
      if (currentDivision?.id === overDivision.id) return

      // Move the dragged team to target division
      moveTeamToDivision(active.id as string, overDivision.id)
      return
    }

    // Handle player movement
    const activePlayer = findPlayerById(active.id as string)
    const overTeam = findTeamById(over.id as string)

    console.log('Player drag end:', { activePlayer, overTeam, activeId: active.id, overId: over.id })

    if (activePlayer && overTeam) {
      // Check if player is being moved to a different team
      const currentTeam = findTeamByPlayerId(active.id as string)
      console.log('Current team:', currentTeam, 'Target team:', overTeam)
      
      if (currentTeam?.id === overTeam.id) {
        console.log('Player already in target team, skipping')
        return
      }

      console.log('Moving player:', activePlayer.player.firstName, 'to team:', overTeam.name)
      // Move the player to target team
      movePlayerMutation.mutate({
        teamPlayerId: active.id as string,
        targetTeamId: overTeam.id,
      })
    } else {
      console.log('No active player or over team found')
    }
  }

  const findTeamById = (teamId: string): Team | null => {
    if (!tournament) {
      console.log('No tournament data for team lookup')
      return null
    }
    
    console.log('Looking for team with ID:', teamId)
    console.log('Available teams:', tournament.divisions.flatMap(d => d.teams.map(t => ({ id: t.id, name: t.name }))))
    
    for (const division of tournament.divisions) {
      const team = division.teams.find(t => t.id === teamId)
      if (team) {
        console.log('Found team:', team.name)
        return team
      }
    }
    console.log('Team not found with ID:', teamId)
    return null
  }

  const findDivisionById = (divisionId: string): Division | null => {
    if (!tournament) return null
    return tournament.divisions.find(d => d.id === divisionId) || null
  }

  const findDivisionByTeamId = (teamId: string): Division | null => {
    if (!tournament) return null
    for (const division of tournament.divisions) {
      if (division.teams.some(t => t.id === teamId)) {
        return division
      }
    }
    return null
  }

  const findPlayerById = (playerId: string): {
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
      externalId: string | null
    }
    teamId: string
    playerId: string
  } | null => {
    if (!tournament) {
      console.log('No tournament data')
      return null
    }
    
    console.log('Looking for player with ID:', playerId)
    console.log('Available teamPlayers:', tournament.divisions.flatMap(d => d.teams.flatMap(t => t.teamPlayers.map(tp => ({ id: tp.id, name: `${tp.player.firstName} ${tp.player.lastName}` })))))
    
    for (const division of tournament.divisions) {
      for (const team of division.teams) {
        const teamPlayer = team.teamPlayers.find(tp => tp.id === playerId)
        if (teamPlayer) {
          console.log('Found player:', teamPlayer.player.firstName, teamPlayer.player.lastName)
          return teamPlayer
        }
      }
    }
    console.log('Player not found with ID:', playerId)
    return null
  }

  const findTeamByPlayerId = (playerId: string): Team | null => {
    if (!tournament) return null
    for (const division of tournament.divisions) {
      for (const team of division.teams) {
        if (team.teamPlayers.some(tp => tp.id === playerId)) {
          return team
        }
      }
    }
    return null
  }

  const moveTeamToDivisionMutation = trpc.team.moveToDivision.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      alert(`Ошибка при перемещении команды: ${error.message}`)
    }
  })

  const moveTeamToDivision = (teamId: string, divisionId: string) => {
    moveTeamToDivisionMutation.mutate({
      teamId,
      divisionId,
    })
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

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team)
    setTeamForm({
      name: team.name,
      divisionId: findDivisionByTeamId(team.id)?.id || '',
      seed: team.seed || undefined,
      note: team.note || '',
    })
    setShowEditTeam(true)
  }

  const handleDeleteTeam = (team: Team) => {
    if (confirm(`Вы уверены, что хотите удалить команду "${team.name}"?`)) {
      deleteTeam.mutate({ id: team.id })
    }
  }

  const handleContextMenu = (e: React.MouseEvent, type: 'team' | 'player', id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      type,
      id,
      x: e.clientX,
      y: e.clientY,
    })
  }

  const closeContextMenu = () => {
    setContextMenu({ type: null, id: null, x: 0, y: 0 })
  }

  const handleDeletePlayer = (teamPlayerId: string, playerName: string) => {
    if (confirm(`Вы уверены, что хотите удалить игрока "${playerName}" из команды?`)) {
      removePlayerMutation.mutate({ id: teamPlayerId })
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Загрузка турнира...</div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Турнир не найден</h1>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Вернуться к списку турниров
        </Link>
      </div>
    )
  }

  return (
    <div onClick={closeContextMenu}>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Команды</h1>
          <p className="text-gray-600 mt-2">{tournament.title}</p>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={() => setShowCreateTeam(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Добавить команду
          </Button>
          <Link
            href={`/admin/${tournamentId}`}
            className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            ← Назад
          </Link>
        </div>
      </div>

      {tournament.divisions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Нет дивизионов</h3>
            <p className="text-gray-600 mb-4">Сначала создайте дивизион для добавления команд</p>
            <Link
              href={`/admin/${tournamentId}`}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Создать дивизион
            </Link>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-6">
            {tournament.divisions.map((division) => (
              <Card key={division.id}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <span>Дивизион: {division.name}</span>
                    {division.maxTeams && (
                      <span className="text-sm font-normal text-gray-500">
                        (лимит: {division.maxTeams})
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {division.teams.length} команд • {division.teamKind} • {division.pairingMode}
                    {division.poolsEnabled && ' • Пулы включены'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {division.poolsEnabled && division.pools && division.pools.length > 0 ? (
                    // Show teams grouped by pools
                    <div className="space-y-4">
                      {division.pools.map((pool) => (
                        <div key={pool.id} className="border border-gray-200 rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-3">Pool: {pool.name}</h4>
                          <SortableContext
                            items={division.teams.filter(t => t.poolId === pool.id).map(t => t.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <DroppableDivision
                              division={division}
                              onTeamMove={moveTeamToDivision}
                            >
                              {division.teams.filter(t => t.poolId === pool.id).length > 0 ? (
                                division.teams.filter(t => t.poolId === pool.id).map((team) => (
                                  <SortableTeam
                                    key={team.id}
                                    team={team}
                                    onEdit={() => handleEditTeam(team)}
                                    onDelete={() => handleDeleteTeam(team)}
                                    onExpand={() => toggleTeamExpansion(team.id)}
                                    isExpanded={expandedTeams.has(team.id)}
                                    onContextMenu={handleContextMenu}
                                    onDeletePlayer={handleDeletePlayer}
                                    onPlayerContextMenu={handleContextMenu}
                                  />
                                ))
                              ) : (
                                <div className="text-center text-gray-500 py-4">
                                  Перетащите команды в этот пул
                                </div>
                              )}
                            </DroppableDivision>
                          </SortableContext>
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Show all teams without pools
                    <SortableContext
                      items={division.teams.map(t => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <DroppableDivision
                        division={division}
                        onTeamMove={moveTeamToDivision}
                      >
                        {division.teams.length > 0 ? (
                          division.teams.map((team) => (
                            <SortableTeam
                              key={team.id}
                              team={team}
                              onEdit={() => handleEditTeam(team)}
                              onDelete={() => handleDeleteTeam(team)}
                              onExpand={() => toggleTeamExpansion(team.id)}
                              isExpanded={expandedTeams.has(team.id)}
                              onContextMenu={handleContextMenu}
                              onDeletePlayer={handleDeletePlayer}
                              onPlayerContextMenu={handleContextMenu}
                            />
                          ))
                        ) : (
                          <div className="text-center text-gray-500 py-8">
                            Перетащите команды сюда или создайте новую
                          </div>
                        )}
                      </DroppableDivision>
                    </SortableContext>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <DragOverlay>
            {activeTeam ? (
              <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
                <div className="flex items-center space-x-2">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">{activeTeam.name}</span>
                  {activeTeam.seed && (
                    <span className="text-sm text-gray-500">(#{activeTeam.seed})</span>
                  )}
                </div>
              </div>
            ) : activePlayer ? (
              <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-lg">
                <div className="flex items-center space-x-2">
                  <GripVertical className="h-3 w-3 text-gray-400" />
                  <span className="text-sm">
                    {activePlayer.player.firstName} {activePlayer.player.lastName}
                  </span>
                  {activePlayer.player.gender && (
                    <span className="text-xs text-gray-500">({activePlayer.player.gender})</span>
                  )}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Team Modal */}
      {showCreateTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Добавить команду</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название команды *
                </label>
                <input
                  type="text"
                  value={teamForm.name}
                  onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: Команда А"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дивизион *
                </label>
                <select
                  value={teamForm.divisionId}
                  onChange={(e) => setTeamForm({ ...teamForm, divisionId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Выберите дивизион</option>
                  {tournament.divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Посев (необязательно)
                </label>
                <input
                  type="number"
                  value={teamForm.seed || ''}
                  onChange={(e) => setTeamForm({ ...teamForm, seed: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: 1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Примечание (необязательно)
                </label>
                <input
                  type="text"
                  value={teamForm.note}
                  onChange={(e) => setTeamForm({ ...teamForm, note: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: Капитан - Иван Иванов"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateTeam(false)}
                disabled={createTeam.isPending}
              >
                Отмена
              </Button>
              <Button
                onClick={handleCreateTeam}
                disabled={createTeam.isPending}
              >
                {createTeam.isPending ? 'Создание...' : 'Создать'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Team Modal */}
      {showEditTeam && editingTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Редактировать команду</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название команды *
                </label>
                <input
                  type="text"
                  value={teamForm.name}
                  onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дивизион *
                </label>
                <select
                  value={teamForm.divisionId}
                  onChange={(e) => setTeamForm({ ...teamForm, divisionId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Выберите дивизион</option>
                  {tournament.divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Посев (необязательно)
                </label>
                <input
                  type="number"
                  value={teamForm.seed || ''}
                  onChange={(e) => setTeamForm({ ...teamForm, seed: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Примечание (необязательно)
                </label>
                <input
                  type="text"
                  value={teamForm.note}
                  onChange={(e) => setTeamForm({ ...teamForm, note: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowEditTeam(false)}
              >
                Отмена
              </Button>
              <Button
                onClick={() => {
                  if (!teamForm.name.trim()) {
                    alert('Пожалуйста, введите название команды')
                    return
                  }
                  if (!teamForm.divisionId) {
                    alert('Пожалуйста, выберите дивизион')
                    return
                  }

                  updateTeam.mutate({
                    id: editingTeam.id,
                    name: teamForm.name,
                    divisionId: teamForm.divisionId,
                    seed: teamForm.seed,
                    note: teamForm.note || undefined,
                  })
                }}
                disabled={updateTeam.isPending}
              >
                {updateTeam.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.type && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={closeContextMenu}
        >
          {contextMenu.type === 'team' && (
            <>
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm"
                onClick={() => {
                  const team = findTeamById(contextMenu.id!)
                  if (team) {
                    handleEditTeam(team)
                  }
                  closeContextMenu()
                }}
              >
                Редактировать команду
              </button>
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-red-600"
                onClick={() => {
                  const team = findTeamById(contextMenu.id!)
                  if (team) {
                    handleDeleteTeam(team)
                  }
                  closeContextMenu()
                }}
              >
                Удалить команду
              </button>
            </>
          )}
          {contextMenu.type === 'player' && (
            <>
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm"
                onClick={() => {
                  // TODO: Implement player editing
                  closeContextMenu()
                }}
              >
                Редактировать игрока
              </button>
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-red-600"
                onClick={() => {
                  const player = findPlayerById(contextMenu.id!)
                  if (player) {
                    if (confirm(`Вы уверены, что хотите удалить игрока "${player.player.firstName} ${player.player.lastName}" из команды?`)) {
                      removePlayerMutation.mutate({ id: player.id })
                    }
                  }
                  closeContextMenu()
                }}
              >
                Удалить из команды
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}