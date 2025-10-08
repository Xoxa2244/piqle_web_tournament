'use client'

import { useState, useMemo } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  GripVertical, 
  Users, 
  Edit, 
  MoreVertical,
  Plus,
  Search,
  Undo,
  Save,
  X,
  AlertTriangle,
  Clock,
  Target
} from 'lucide-react'

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
  teams?: Team[]
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
    minDupr: string | null
    maxDupr: string | null
    minAge: number | null
    maxAge: number | null
  } | null
}

interface BoardModeProps {
  tournamentId: string
  divisions: Division[]
  onTeamMove: (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => void
  onTeamMoveToPool: (teamId: string, targetPoolId: string | null) => void
  divisionStages?: Record<string, string> // divisionId -> stage
  onEditDivision?: (division: Division) => void
}

interface ActionHistory {
  id: string
  type: 'move' | 'moveToPool'
  teamId: string
  teamName: string
  fromDivisionId: string
  fromPoolId: string | null
  toDivisionId: string
  toPoolId: string | null
  timestamp: Date
}

export default function BoardMode({ tournamentId, divisions, onTeamMove, onTeamMoveToPool, divisionStages = {}, onEditDivision }: BoardModeProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTeam, setActiveTeam] = useState<string | null>(null)
  const [actionHistory, setActionHistory] = useState<ActionHistory[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [divisionOrder, setDivisionOrder] = useState<string[]>(divisions.map(d => d.id))
  const [showWarning, setShowWarning] = useState<{
    isOpen: boolean
    message: string
    onConfirm: () => void
    onCancel: () => void
  }>({ isOpen: false, message: '', onConfirm: () => {}, onCancel: () => {} })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Check if division has matches created
  const hasMatchesCreated = (divisionId: string) => {
    const stage = divisionStages[divisionId]
    return stage && !stage.includes('RR_IN_PROGRESS') && stage !== 'RR_NOT_STARTED'
  }

  // Get warning message for division stage
  const getStageWarningMessage = (divisionId: string) => {
    const stage = divisionStages[divisionId]
    if (!stage) return ''
    
    if (stage.includes('RR_COMPLETE')) {
      return 'Round Robin уже завершен. Перемещение команды потребует перегенерации RR.'
    } else if (stage.includes('PLAY_IN')) {
      return 'Play-In уже создан. Перемещение команды потребует перегенерации Play-In и Play-Off.'
    } else if (stage.includes('PO_') || stage.includes('FINAL')) {
      return 'Play-Off уже создан. Перемещение команды потребует полной перегенерации турнира.'
    }
    
    return ''
  }

  // Filter teams based on search query
  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return []
    
    const query = searchQuery.toLowerCase()
    const results: Array<{ team: Team; division: Division; pool: Pool | null }> = []
    
    divisions.forEach(division => {
      division.teams.forEach(team => {
        if (team.name.toLowerCase().includes(query)) {
          const pool = division.pools.find(p => p.id === team.poolId) || null
          results.push({ team, division, pool })
        }
      })
    })
    
    return results
  }, [searchQuery, divisions])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTeam(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTeam(null)

    if (!over) return

    const teamId = active.id as string
    const overId = over.id as string

    // Find the team being moved
    const team = divisions
      .flatMap(d => d.teams)
      .find(t => t.id === teamId)

    if (!team) return

    // Check if moving to a division with existing matches
    const getTargetDivisionId = (overId: string) => {
      if (overId.startsWith('waitlist-')) {
        return overId.replace('waitlist-', '')
      } else if (overId.startsWith('pool-')) {
        const [_, divisionId] = overId.split('-')
        return divisionId
      } else if (overId.startsWith('division-')) {
        return overId.replace('division-', '')
      }
      return null
    }

    const targetDivisionId = getTargetDivisionId(overId)
    if (targetDivisionId && hasMatchesCreated(targetDivisionId)) {
      const warningMessage = getStageWarningMessage(targetDivisionId)
      if (warningMessage) {
        setShowWarning({
          isOpen: true,
          message: warningMessage,
          onConfirm: () => {
            performMove(teamId, overId, team)
            setShowWarning({ isOpen: false, message: '', onConfirm: () => {}, onCancel: () => {} })
          },
          onCancel: () => {
            setShowWarning({ isOpen: false, message: '', onConfirm: () => {}, onCancel: () => {} })
          }
        })
        return
      }
    }

    // No warning needed, perform move directly
    performMove(teamId, overId, team)
  }

  const performMove = (teamId: string, overId: string, team: Team) => {
    // Parse drop zone ID
    if (overId.startsWith('waitlist-')) {
      const divisionId = overId.replace('waitlist-', '')
      if (divisionId !== team.divisionId) {
        // Move to different division's waitlist
        addToHistory({
          type: 'move',
          teamId,
          teamName: team.name,
          fromDivisionId: team.divisionId,
          fromPoolId: team.poolId,
          toDivisionId: divisionId,
          toPoolId: null,
        })
        onTeamMove(teamId, divisionId, null)
        setHasUnsavedChanges(true)
      } else if (team.poolId !== null) {
        // Move to same division's waitlist
        addToHistory({
          type: 'moveToPool',
          teamId,
          teamName: team.name,
          fromDivisionId: team.divisionId,
          fromPoolId: team.poolId,
          toDivisionId: team.divisionId,
          toPoolId: null,
        })
        onTeamMoveToPool(teamId, null)
        setHasUnsavedChanges(true)
      }
    } else if (overId.startsWith('pool-')) {
      const [_, divisionId, poolId] = overId.split('-')
      if (divisionId !== team.divisionId) {
        // Move to different division's pool
        addToHistory({
          type: 'move',
          teamId,
          teamName: team.name,
          fromDivisionId: team.divisionId,
          fromPoolId: team.poolId,
          toDivisionId: divisionId,
          toPoolId: poolId,
        })
        onTeamMove(teamId, divisionId, poolId)
        setHasUnsavedChanges(true)
      } else if (poolId !== team.poolId) {
        // Move to different pool in same division
        addToHistory({
          type: 'moveToPool',
          teamId,
          teamName: team.name,
          fromDivisionId: team.divisionId,
          fromPoolId: team.poolId,
          toDivisionId: team.divisionId,
          toPoolId: poolId,
        })
        onTeamMoveToPool(teamId, poolId)
        setHasUnsavedChanges(true)
      }
    } else if (overId.startsWith('division-')) {
      const divisionId = overId.replace('division-', '')
      if (divisionId !== team.divisionId) {
        // Move to different division (to first pool or waitlist)
        const targetDivision = divisions.find(d => d.id === divisionId)
        const targetPoolId = targetDivision?.pools.length ? targetDivision.pools[0].id : null
        
        addToHistory({
          type: 'move',
          teamId,
          teamName: team.name,
          fromDivisionId: team.divisionId,
          fromPoolId: team.poolId,
          toDivisionId: divisionId,
          toPoolId: targetPoolId,
        })
        onTeamMove(teamId, divisionId, targetPoolId)
        setHasUnsavedChanges(true)
      }
    }
  }

  const addToHistory = (action: Omit<ActionHistory, 'id' | 'timestamp'>) => {
    const newAction: ActionHistory = {
      ...action,
      id: Date.now().toString(),
      timestamp: new Date(),
    }
    setActionHistory(prev => [newAction, ...prev].slice(0, 10)) // Keep last 10 actions
  }

  const undoLastAction = () => {
    if (actionHistory.length === 0) return
    
    const lastAction = actionHistory[0]
    
    if (lastAction.type === 'move') {
      onTeamMove(lastAction.teamId, lastAction.fromDivisionId, lastAction.fromPoolId)
    } else if (lastAction.type === 'moveToPool') {
      onTeamMoveToPool(lastAction.teamId, lastAction.fromPoolId)
    }
    
    setActionHistory(prev => prev.slice(1))
    setHasUnsavedChanges(true)
  }

  const saveChanges = () => {
    // This would trigger a save mutation
    setHasUnsavedChanges(false)
    setActionHistory([])
  }

  const cancelChanges = () => {
    // This would revert all changes
    setHasUnsavedChanges(false)
    setActionHistory([])
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with search and controls */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Поиск команды..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          
          {filteredTeams.length > 0 && (
            <div className="text-sm text-gray-600">
              Найдено: {filteredTeams.length} команд
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {actionHistory.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={undoLastAction}
              className="flex items-center space-x-1"
            >
              <Undo className="h-4 w-4" />
              <span>Отменить</span>
            </Button>
          )}
          
          {hasUnsavedChanges && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelChanges}
                className="flex items-center space-x-1"
              >
                <X className="h-4 w-4" />
                <span>Отменить изменения</span>
              </Button>
              
              <Button
                size="sm"
                onClick={saveChanges}
                className="flex items-center space-x-1"
              >
                <Save className="h-4 w-4" />
                <span>Сохранить</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Board Content */}
      <div className="flex-1 overflow-hidden">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="h-full overflow-x-auto overflow-y-hidden">
            <div className="flex space-x-4 p-4 min-w-max h-full">
              {divisionOrder.map((divisionId) => {
                const division = divisions.find(d => d.id === divisionId)
                if (!division) return null
                
                return (
                  <DivisionColumn
                    key={division.id}
                    division={division}
                    searchQuery={searchQuery}
                    filteredTeams={filteredTeams}
                    onEditDivision={onEditDivision}
                  />
                )
              })}
            </div>
          </div>

          <DragOverlay>
            {activeTeam ? (
              <TeamCard team={divisions.flatMap(d => d.teams).find(t => t.id === activeTeam)!} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Action History Dock */}
      {actionHistory.length > 0 && (
        <div className="border-t bg-gray-50 p-3">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
            <span>Последние действия:</span>
            {actionHistory.slice(0, 3).map((action, index) => (
              <Badge key={action.id} variant="outline" className="text-xs">
                {action.teamName} → {action.toDivisionId === action.fromDivisionId ? 'Pool' : 'Division'}
              </Badge>
            ))}
            {actionHistory.length > 3 && (
              <span className="text-gray-400">+{actionHistory.length - 3} еще</span>
            )}
          </div>
        </div>
      )}

      {/* Warning Modal */}
      {showWarning.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-gray-900">Предупреждение</h3>
            </div>
            
            <p className="text-gray-600 mb-6">{showWarning.message}</p>
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={showWarning.onCancel}
              >
                Отменить
              </Button>
              <Button
                onClick={showWarning.onConfirm}
                className="bg-yellow-500 hover:bg-yellow-600"
              >
                Продолжить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Division Column Component
function DivisionColumn({ division, searchQuery, filteredTeams, onEditDivision }: {
  division: Division
  searchQuery: string
  filteredTeams: Array<{ team: Team; division: Division; pool: Pool | null }>
  onEditDivision?: (division: Division) => void
}) {
  const { setNodeRef: setWaitListRef } = useDroppable({
    id: `waitlist-${division.id}`,
  })

  const { setNodeRef: setDivisionRef } = useDroppable({
    id: `division-${division.id}`,
  })

  const waitListTeams = division.teams.filter(team => team.poolId === null)
  const poolTeams = division.pools.map(pool => ({
    pool,
    teams: division.teams.filter(team => team.poolId === pool.id)
  }))

  const isTeamHighlighted = (teamId: string) => {
    return filteredTeams.some(ft => ft.team.id === teamId)
  }

  return (
    <div className="w-80 flex-shrink-0">
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{division.name}</CardTitle>
            <div className="flex items-center space-x-1">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onEditDivision?.(division)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Users className="h-4 w-4" />
            <span>{division.teams.length} команд</span>
            {division.maxTeams && (
              <>
                <span>/</span>
                <span>{division.maxTeams}</span>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* WaitList */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">WaitList</h4>
              <Badge variant="secondary">{waitListTeams.length}</Badge>
            </div>
            
            <div
              ref={setWaitListRef}
              className="min-h-[100px] p-2 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50"
            >
              <SortableContext items={waitListTeams.map(t => t.id)} strategy={verticalListSortingStrategy}>
                {waitListTeams.map((team) => (
                  <SortableTeamCard
                    key={team.id}
                    team={team}
                    highlighted={isTeamHighlighted(team.id)}
                  />
                ))}
              </SortableContext>
            </div>
          </div>

          {/* Pools */}
          {poolTeams.map(({ pool, teams }) => (
            <PoolDropZone
              key={pool.id}
              pool={pool}
              teams={teams}
              divisionId={division.id}
              isTeamHighlighted={isTeamHighlighted}
            />
          ))}

          {/* Division Drop Zone */}
          <div
            ref={setDivisionRef}
            className="min-h-[60px] p-2 border-2 border-dashed border-green-300 rounded-lg bg-green-50 flex items-center justify-center"
          >
            <span className="text-sm text-gray-600">Перетащите команду сюда</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Pool Drop Zone Component
function PoolDropZone({ 
  pool, 
  teams, 
  divisionId, 
  isTeamHighlighted 
}: { 
  pool: Pool
  teams: Team[]
  divisionId: string
  isTeamHighlighted: (teamId: string) => boolean
}) {
  const { setNodeRef } = useDroppable({
    id: `pool-${divisionId}-${pool.id}`,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900">{pool.name}</h4>
        <Badge variant="outline">{teams.length}</Badge>
      </div>
      
      <div
        ref={setNodeRef}
        className="min-h-[100px] p-2 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50"
      >
        <SortableContext items={teams.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {teams.map((team) => (
            <SortableTeamCard
              key={team.id}
              team={team}
              highlighted={isTeamHighlighted(team.id)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

// Sortable Team Card Component
function SortableTeamCard({ team, highlighted }: { team: Team; highlighted: boolean }) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-2 p-2 bg-white border rounded-lg shadow-sm cursor-grab ${
        highlighted ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{team.name}</div>
          {team.seed && (
            <div className="text-xs text-gray-500">Seed: {team.seed}</div>
          )}
        </div>
        <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </div>
    </div>
  )
}

// Team Card for Drag Overlay
function TeamCard({ team }: { team: Team }) {
  return (
    <div className="p-2 bg-white border rounded-lg shadow-lg">
      <div className="font-medium text-sm">{team.name}</div>
      {team.seed && (
        <div className="text-xs text-gray-500">Seed: {team.seed}</div>
      )}
    </div>
  )
}
