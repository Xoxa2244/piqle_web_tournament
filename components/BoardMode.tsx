'use client'

import { useState, useMemo, useEffect } from 'react'
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
  DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
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
  Target,
  ChevronDown,
  ChevronRight
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
      duprRating: string | null
      birthDate: string | null
      isWaitlist: boolean
      teamId?: string | null
      teamName?: string | null
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
  onTeamMove: (teamId: string, targetDivisionId: string, targetPoolId?: string | null) => Promise<void>
  onTeamMoveToPool: (teamId: string, targetPoolId: string | null) => void
  divisionStages?: Record<string, string> // divisionId -> stage
  onEditDivision?: (division: Division) => void
  onAddTeam?: (division: Division) => void
  availablePlayers?: any[]
  onAddPlayerToSlot?: (teamId: string, slotIndex: number, playerId: string) => void
  onRemovePlayerFromSlot?: (teamPlayerId: string, slotIndex: number) => void
  onMovePlayerBetweenSlots?: (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => void
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

export default function BoardMode({ 
  tournamentId, 
  divisions, 
  onTeamMove, 
  onTeamMoveToPool, 
  divisionStages = {}, 
  onEditDivision, 
  onAddTeam,
  availablePlayers = [],
  onAddPlayerToSlot,
  onRemovePlayerFromSlot,
  onMovePlayerBetweenSlots
}: BoardModeProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTeam, setActiveTeam] = useState<string | null>(null)
  const [activePlayer, setActivePlayer] = useState<string | null>(null)
  const [actionHistory, setActionHistory] = useState<ActionHistory[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [divisionOrder, setDivisionOrder] = useState<string[]>(divisions.map(d => d.id))
  
  // Local state for optimistic updates
  const [localDivisions, setLocalDivisions] = useState(divisions)
  
  const [showWarning, setShowWarning] = useState<{
    isOpen: boolean
    message: string
    onConfirm: () => void
    onCancel: () => void
  }>({ isOpen: false, message: '', onConfirm: () => {}, onCancel: () => {} })

  // Update local state when divisions prop changes
  useEffect(() => {
    setLocalDivisions(divisions)
  }, [divisions])

  // Helper function to find division ID for a team
  const getTeamDivisionId = (teamId: string): string | null => {
    for (const division of localDivisions) {
      if (division.teams.some(team => team.id === teamId)) {
        return division.id
      }
    }
    return null
  }

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

  // Optimistic update function for team moves
  const optimisticMoveTeam = (teamId: string, targetDivisionId: string, targetPoolId: string | null) => {
    setLocalDivisions(prevDivisions => {
      return prevDivisions.map(division => {
        // Remove team from current division
        const updatedTeams = division.teams.filter(team => team.id !== teamId)
        
        // If this is the target division, add the team
        if (division.id === targetDivisionId) {
          const team = divisions.flatMap(d => d.teams).find(t => t.id === teamId)
          if (team) {
            const updatedTeam = { ...team, poolId: targetPoolId }
            updatedTeams.push(updatedTeam)
          }
        }
        
        return {
          ...division,
          teams: updatedTeams
        }
      })
    })
  }

  // Rollback function for failed moves
  const rollbackTeamMove = () => {
    setLocalDivisions(divisions) // Reset to original state
  }

  // Get warning message for division stage
  const getStageWarningMessage = (divisionId: string) => {
    const stage = divisionStages[divisionId]
    if (!stage) return ''
    
    if (stage.includes('RR_COMPLETE')) {
      return 'Round Robin already completed. Moving team will require RR regeneration.'
    } else if (stage.includes('PLAY_IN')) {
      return 'Play-In already created. Moving team will require Play-In and Play-Off regeneration.'
    } else if (stage.includes('PO_') || stage.includes('FINAL')) {
      return 'Play-Off already created. Moving team will require full tournament regeneration.'
    }
    
    return ''
  }

  // Filter teams based on search query
  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return []
    
    const query = searchQuery.toLowerCase()
    const results: Array<{ team: Team; division: Division; pool: Pool | null }> = []
    
    localDivisions.forEach(division => {
      if (!division || !division.teams) return
      
      division.teams.forEach(team => {
        if (!team || !team.name) return
        
        if (team.name.toLowerCase().includes(query)) {
          const pool = division.pools.find(p => p.id === team.poolId) || null
          results.push({ team, division, pool })
        }
      })
    })
    
    return results
  }, [searchQuery, localDivisions])

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id as string
    
    // Check if it's a player drag (starts with 'player-')
    if (activeId.startsWith('player-')) {
      setActivePlayer(activeId)
    } else {
      setActiveTeam(activeId)
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    // Handle drag over for players
    const { active, over } = event
    
    if (!over) return
    
    const activeId = active.id as string
    const overId = over.id as string
    
    // Check if we're dragging a player
    if (activeId.startsWith('player-') && overId.startsWith('player-')) {
      // Player to player drag - could be used for reordering within team
      // For now, we'll handle this in drag end
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    // Don't set activeTeam to null immediately to prevent return animation
    // setActiveTeam(null)

    if (!over) {
      setActiveTeam(null)
      setActivePlayer(null)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string

    // Check if we're dragging a player
    if (activeId.startsWith('player-') && overId.startsWith('player-')) {
      // Player to player drag
      const playerPattern = /^player-(.+)-slot-(\d+)$/
      const activePlayerMatch = activeId.match(playerPattern)
      const overPlayerMatch = overId.match(playerPattern)
      
      if (activePlayerMatch && overPlayerMatch && onMovePlayerBetweenSlots) {
        const fromTeamId = activePlayerMatch[1]
        const fromSlotIndex = parseInt(activePlayerMatch[2])
        const toTeamId = overPlayerMatch[1]
        const toSlotIndex = parseInt(overPlayerMatch[2])
        
        onMovePlayerBetweenSlots(fromTeamId, toTeamId, fromSlotIndex, toSlotIndex)
      }
      
      setActivePlayer(null)
      return
    }

    // Check if we're dragging a division (starts with 'division-header-')
    if (activeId.startsWith('division-header-')) {
      const divisionId = activeId.replace('division-header-', '')
      const overDivisionId = overId.startsWith('division-header-') 
        ? overId.replace('division-header-', '')
        : null

      if (overDivisionId && divisionId !== overDivisionId) {
        // Reorder divisions
        const newOrder = [...divisionOrder]
        const fromIndex = newOrder.indexOf(divisionId)
        const toIndex = newOrder.indexOf(overDivisionId)
        
        if (fromIndex !== -1 && toIndex !== -1) {
          newOrder.splice(fromIndex, 1)
          newOrder.splice(toIndex, 0, divisionId)
          setDivisionOrder(newOrder)
          setHasUnsavedChanges(true)
        }
      }
      return
    }

    // Handle team dragging
    const teamId = activeId
    const team = localDivisions
      .flatMap(d => d.teams)
      .find(t => t.id === teamId)

    if (!team) {
      console.error('Team not found:', teamId)
      return
    }

    console.log('Dragging team:', team.name, 'from division:', getTeamDivisionId(teamId))

    // Parse drop zone ID and determine target
    let targetDivisionId: string
    let targetPoolId: string | null

    console.log('Drop target:', overId)

    if (overId.startsWith('waitlist-')) {
      targetDivisionId = overId.replace('waitlist-', '')
      targetPoolId = null
      console.log('Dropped on waitlist')
    } else if (overId.startsWith('pool-')) {
      // Format: pool-{divisionId}-{poolId}
      // Remove 'pool-' prefix and split by first occurrence of '-'
      const withoutPrefix = overId.replace('pool-', '')
      const firstDashIndex = withoutPrefix.indexOf('-')
      if (firstDashIndex > 0) {
        targetDivisionId = withoutPrefix.substring(0, firstDashIndex)
        targetPoolId = withoutPrefix.substring(firstDashIndex + 1)
        console.log('Dropped on pool:', targetPoolId)
      } else {
        console.error('Invalid pool ID format:', overId)
        return
      }
    } else if (overId.startsWith('division-')) {
      targetDivisionId = overId.replace('division-', '')
      // For division drops, use first pool or waitlist
      const targetDivision = localDivisions.find(d => d.id === targetDivisionId)
      targetPoolId = targetDivision?.pools.length ? targetDivision.pools[0].id : null
      console.log('Dropped on division, using first pool:', targetPoolId)
    } else {
      // Handle case where team drops on division header or other element
      // Check if overId is a division ID
      const targetDivision = localDivisions.find(d => d.id === overId)
      if (targetDivision) {
        targetDivisionId = overId
        targetPoolId = targetDivision.pools.length ? targetDivision.pools[0].id : null
        console.log('Team dropped on division header, using first pool:', targetPoolId)
      } else {
        console.error('Unknown drop target:', overId)
        return
      }
    }

    console.log('Target division:', targetDivisionId, 'Target pool:', targetPoolId)

    const teamDivisionId = getTeamDivisionId(teamId)
    if (!teamDivisionId) return

    // Check if moving to a division with existing matches
    if (hasMatchesCreated(targetDivisionId)) {
      const warningMessage = getStageWarningMessage(targetDivisionId)
      if (warningMessage) {
        setShowWarning({
          isOpen: true,
          message: warningMessage,
          onConfirm: () => {
            // Apply optimistic update and make server request
            performMoveWithOptimisticUpdate(teamId, targetDivisionId, targetPoolId, team)
            setActiveTeam(null)
            setShowWarning({ isOpen: false, message: '', onConfirm: () => {}, onCancel: () => {} })
          },
          onCancel: () => {
            setActiveTeam(null)
            setShowWarning({ isOpen: false, message: '', onConfirm: () => {}, onCancel: () => {} })
          }
        })
        return
      }
    }

    // No warning needed, perform move directly with optimistic update
    performMoveWithOptimisticUpdate(teamId, targetDivisionId, targetPoolId, team)
    setActiveTeam(null)
  }

  const performMoveWithOptimisticUpdate = async (teamId: string, targetDivisionId: string, targetPoolId: string | null, team: Team) => {
    const teamDivisionId = getTeamDivisionId(teamId)
    if (!teamDivisionId) return

    // Apply optimistic update immediately
    optimisticMoveTeam(teamId, targetDivisionId, targetPoolId)
    setHasUnsavedChanges(true)

    // Add to history
    addToHistory({
      type: 'move',
      teamId,
      teamName: team.name,
      fromDivisionId: teamDivisionId,
      fromPoolId: team.poolId,
      toDivisionId: targetDivisionId,
      toPoolId: targetPoolId,
    })

    try {
      // Make server request
      if (targetDivisionId !== teamDivisionId) {
        await onTeamMove(teamId, targetDivisionId, targetPoolId)
      } else {
        await onTeamMoveToPool(teamId, targetPoolId)
      }
    } catch (error) {
      console.error('Failed to move team:', error)
      // Rollback on error
      rollbackTeamMove()
      // Remove from history
      setActionHistory(prev => prev.slice(0, -1))
    }
  }

  const performMove = async (teamId: string, overId: string, team: Team) => {
    const teamDivisionId = getTeamDivisionId(teamId)
    if (!teamDivisionId) return

    // Parse drop zone ID and determine target
    let targetDivisionId: string
    let targetPoolId: string | null

    if (overId.startsWith('waitlist-')) {
      targetDivisionId = overId.replace('waitlist-', '')
      targetPoolId = null
      console.log('Dropped on waitlist')
    } else if (overId.startsWith('pool-')) {
      // Format: pool-{divisionId}-{poolId}
      // Remove 'pool-' prefix and split by first occurrence of '-'
      const withoutPrefix = overId.replace('pool-', '')
      const firstDashIndex = withoutPrefix.indexOf('-')
      if (firstDashIndex > 0) {
        targetDivisionId = withoutPrefix.substring(0, firstDashIndex)
        targetPoolId = withoutPrefix.substring(firstDashIndex + 1)
        console.log('Dropped on pool:', targetPoolId)
      } else {
        console.error('Invalid pool ID format:', overId)
        return
      }
    } else if (overId.startsWith('division-')) {
      targetDivisionId = overId.replace('division-', '')
      // For division drops, use first pool or waitlist
      const targetDivision = localDivisions.find(d => d.id === targetDivisionId)
      targetPoolId = targetDivision?.pools.length ? targetDivision.pools[0].id : null
      console.log('Dropped on division, using first pool:', targetPoolId)
    } else {
      // Handle case where team drops on division header or other element
      // Check if overId is a division ID
      const targetDivision = localDivisions.find(d => d.id === overId)
      if (targetDivision) {
        targetDivisionId = overId
        targetPoolId = targetDivision.pools.length ? targetDivision.pools[0].id : null
        console.log('Team dropped on division header, using first pool:', targetPoolId)
      } else {
        console.error('Unknown drop target:', overId)
        return
      }
    }

    // Apply optimistic update immediately
    optimisticMoveTeam(teamId, targetDivisionId, targetPoolId)
    setHasUnsavedChanges(true)

    // Add to history
    addToHistory({
      type: 'move',
      teamId,
      teamName: team.name,
      fromDivisionId: teamDivisionId,
      fromPoolId: team.poolId,
      toDivisionId: targetDivisionId,
      toPoolId: targetPoolId,
    })

    try {
      // Make server request
      if (targetDivisionId !== teamDivisionId) {
        await onTeamMove(teamId, targetDivisionId, targetPoolId)
      } else {
        await onTeamMoveToPool(teamId, targetPoolId)
      }
    } catch (error) {
      console.error('Failed to move team:', error)
      // Rollback on error
      rollbackTeamMove()
      // Remove from history
      setActionHistory(prev => prev.slice(0, -1))
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
              placeholder="Search team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          
          {filteredTeams.length > 0 && (
            <div className="text-sm text-gray-600">
              Found: {filteredTeams.length} teams
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
              <span>Undo</span>
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
                <span>Cancel Changes</span>
              </Button>
              
              <Button
                size="sm"
                onClick={saveChanges}
                className="flex items-center space-x-1"
              >
                <Save className="h-4 w-4" />
                <span>Save</span>
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
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-x-auto overflow-y-hidden">
              <div className="flex space-x-4 p-4 min-w-max h-full">
                <SortableContext items={divisionOrder.map(id => `division-header-${id}`)} strategy={rectSortingStrategy}>
                  {divisionOrder.map((divisionId) => {
                    const division = localDivisions.find(d => d.id === divisionId)
                    if (!division) return null
                    
                    return (
                      <DivisionColumn
                        key={division.id}
                        division={division}
                        searchQuery={searchQuery}
                        filteredTeams={filteredTeams}
                        onEditDivision={onEditDivision}
                        onAddTeam={onAddTeam}
                        availablePlayers={availablePlayers}
                        onAddPlayerToSlot={onAddPlayerToSlot}
                        onRemovePlayerFromSlot={onRemovePlayerFromSlot}
                        onMovePlayerBetweenSlots={onMovePlayerBetweenSlots}
                      />
                    )
                  })}
                </SortableContext>
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeTeam ? (
              (() => {
                const team = localDivisions.flatMap(d => d.teams).find(t => t.id === activeTeam)
                return team ? <TeamCard team={team} /> : null
              })()
            ) : activePlayer ? (
              <div className="p-2 bg-white border rounded-lg shadow-lg">
                <div className="text-sm font-medium">Moving player...</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Action History Dock */}
      {actionHistory.length > 0 && (
        <div className="border-t bg-gray-50 p-3">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
            <span>Recent actions:</span>
            {actionHistory.slice(0, 3).map((action, index) => (
              <Badge key={action.id} variant="outline" className="text-xs">
                {action.teamName} → {action.toDivisionId === action.fromDivisionId ? 'Pool' : 'Division'}
              </Badge>
            ))}
            {actionHistory.length > 3 && (
              <span className="text-gray-400">+{actionHistory.length - 3} more</span>
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
              <h3 className="text-lg font-semibold text-gray-900">Warning</h3>
            </div>
            
            <p className="text-gray-600 mb-6">{showWarning.message}</p>
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={showWarning.onCancel}
              >
                Cancel
              </Button>
              <Button
                onClick={showWarning.onConfirm}
                className="bg-yellow-500 hover:bg-yellow-600"
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Division Column Component
function DivisionColumn({ 
  division, 
  searchQuery, 
  filteredTeams, 
  onEditDivision, 
  onAddTeam,
  availablePlayers,
  onAddPlayerToSlot,
  onRemovePlayerFromSlot,
  onMovePlayerBetweenSlots
}: {
  division: Division
  searchQuery: string
  filteredTeams: Array<{ team: Team; division: Division; pool: Pool | null }>
  onEditDivision?: (division: Division) => void
  onAddTeam?: (division: Division) => void
  availablePlayers: any[]
  onAddPlayerToSlot?: (teamId: string, slotIndex: number, playerId: string) => void
  onRemovePlayerFromSlot?: (teamPlayerId: string, slotIndex: number) => void
  onMovePlayerBetweenSlots?: (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => void
}) {
  const { setNodeRef: setWaitListRef } = useDroppable({
    id: `waitlist-${division?.id || 'unknown'}`,
  })

  const { setNodeRef: setDivisionRef } = useDroppable({
    id: `division-${division?.id || 'unknown'}`,
  })

  const { setNodeRef: setHeaderRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `division-header-${division?.id || 'unknown'}`,
  })

  if (!division) {
    console.warn('DivisionColumn: division is undefined')
    return null
  }

  const waitListTeams = division.teams.filter(team => team.poolId === null)
  const poolTeams = division.pools
    .filter(pool => pool != null) // Filter out null/undefined pools
    .map(pool => ({
      pool,
      teams: division.teams.filter(team => team.poolId === pool.id)
    }))

  const isTeamHighlighted = (teamId: string) => {
    return filteredTeams.some(ft => ft.team.id === teamId)
  }

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div className="w-80 flex-shrink-0" style={style}>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div 
            ref={setHeaderRef}
            {...attributes}
            {...listeners}
            className="flex items-center justify-between cursor-move hover:bg-gray-50 p-2 -m-2 rounded"
          >
            <CardTitle className="text-lg">{division.name}</CardTitle>
            <div className="flex items-center space-x-1">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onEditDivision?.(division)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onAddTeam?.(division)}
                title="Add team to division"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Users className="h-4 w-4" />
            <span>{division.teams.length} teams</span>
            {division.maxTeams && (
              <>
                <span>/</span>
                <span>{division.maxTeams}</span>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Pools */}
          {poolTeams.map(({ pool, teams }) => {
            if (!pool) {
              console.warn('Skipping pool due to undefined pool object')
              return null
            }
            return (
              <PoolDropZone
                key={pool.id}
                pool={pool}
                teams={teams}
                divisionId={division.id}
                isTeamHighlighted={isTeamHighlighted}
                availablePlayers={availablePlayers}
                onAddPlayerToSlot={onAddPlayerToSlot}
                onRemovePlayerFromSlot={onRemovePlayerFromSlot}
                onMovePlayerBetweenSlots={onMovePlayerBetweenSlots}
                teamKind={division.teamKind}
              />
            )
          })}

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
                    availablePlayers={availablePlayers}
                    onAddPlayerToSlot={onAddPlayerToSlot}
                    onRemovePlayerFromSlot={onRemovePlayerFromSlot}
                    onMovePlayerBetweenSlots={onMovePlayerBetweenSlots}
                    teamKind={division.teamKind}
                  />
                ))}
              </SortableContext>
            </div>
          </div>

          {/* Division Drop Zone - Hidden */}
          {/* <div
            ref={setDivisionRef}
            className="min-h-[60px] p-2 border-2 border-dashed border-green-300 rounded-lg bg-green-50 flex items-center justify-center"
          >
            <span className="text-sm text-gray-600">Drag team here</span>
          </div> */}
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
  isTeamHighlighted,
  availablePlayers,
  onAddPlayerToSlot,
  onRemovePlayerFromSlot,
  onMovePlayerBetweenSlots,
  teamKind
}: { 
  pool: Pool
  teams: Team[]
  divisionId: string
  isTeamHighlighted: (teamId: string) => boolean
  availablePlayers: any[]
  onAddPlayerToSlot?: (teamId: string, slotIndex: number, playerId: string) => void
  onRemovePlayerFromSlot?: (teamPlayerId: string, slotIndex: number) => void
  onMovePlayerBetweenSlots?: (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => void
  teamKind?: string
}) {
  const { setNodeRef } = useDroppable({
    id: `pool-${divisionId}-${pool?.id || 'unknown'}`,
  })

  if (!pool) {
    console.warn('PoolDropZone: pool is undefined')
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900">Pool {pool.name}</h4>
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
              availablePlayers={availablePlayers}
              onAddPlayerToSlot={onAddPlayerToSlot}
              onRemovePlayerFromSlot={onRemovePlayerFromSlot}
              onMovePlayerBetweenSlots={onMovePlayerBetweenSlots}
              teamKind={teamKind}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

// Sortable Team Card Component
function SortableTeamCard({ 
  team, 
  highlighted,
  availablePlayers,
  onAddPlayerToSlot,
  onRemovePlayerFromSlot,
  onMovePlayerBetweenSlots,
  teamKind
}: { 
  team: Team
  highlighted: boolean
  availablePlayers: any[]
  onAddPlayerToSlot?: (teamId: string, slotIndex: number, playerId: string) => void
  onRemovePlayerFromSlot?: (teamPlayerId: string, slotIndex: number) => void
  onMovePlayerBetweenSlots?: (fromTeamId: string, toTeamId: string, fromSlotIndex: number, toSlotIndex: number) => void
  teamKind?: string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team?.id || 'unknown' })

  const [isExpanded, setIsExpanded] = useState(false)

  if (!team) {
    console.warn('SortableTeamCard: team is undefined')
    return null
  }

  // Determine max players based on team kind
  const getMaxPlayers = (teamKind?: string) => {
    switch (teamKind) {
      case 'SINGLES_1v1': return 1
      case 'DOUBLES_2v2': return 2
      case 'SQUAD_4v4': return 4
      default: return 2 // Default to doubles
    }
  }

  const maxPlayers = getMaxPlayers(teamKind)
  const isTeamFull = team.teamPlayers.length >= maxPlayers
  const canAddPlayer = !isTeamFull && availablePlayers.length > 0

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-2 p-2 bg-white border rounded-lg shadow-sm ${
        highlighted ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{team.name}</div>
          {team.seed && (
            <div className="text-xs text-gray-500">Seed: {team.seed}</div>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            className="h-6 w-6 p-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
          <div {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0 cursor-grab" />
          </div>
        </div>
      </div>
      
      {/* Players - only show when expanded */}
      {isExpanded && (
        <div className="space-y-1">
          <SortableContext items={team.teamPlayers.map((_, index) => `player-${team.id}-slot-${index}`)} strategy={verticalListSortingStrategy}>
            {team.teamPlayers.map((teamPlayer, index) => (
              <SortablePlayerCard
                key={teamPlayer.id}
                teamPlayer={teamPlayer}
                teamId={team.id}
                slotIndex={index}
                onRemovePlayerFromSlot={onRemovePlayerFromSlot}
              />
            ))}
          </SortableContext>
          
          {/* Add Player Button - only show if team is not full */}
          {canAddPlayer && onAddPlayerToSlot && (
            <div className="text-xs">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    onAddPlayerToSlot(team.id, team.teamPlayers.length, e.target.value)
                    e.target.value = ''
                  }
                }}
                className="w-full text-xs border rounded p-1"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">Add player...</option>
                {availablePlayers.map(player => (
                  <option key={player.id} value={player.id}>
                    {player.firstName} {player.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Sortable Player Card Component
function SortablePlayerCard({ 
  teamPlayer, 
  teamId, 
  slotIndex, 
  onRemovePlayerFromSlot 
}: { 
  teamPlayer: any
  teamId: string
  slotIndex: number
  onRemovePlayerFromSlot?: (teamPlayerId: string, slotIndex: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `player-${teamId}-slot-${slotIndex}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between text-xs bg-gray-50 rounded p-1 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center space-x-1 flex-1 min-w-0">
        <div {...attributes} {...listeners}>
          <GripVertical className="h-3 w-3 text-gray-400 cursor-grab" />
        </div>
        <span className="truncate">
          {teamPlayer.player.firstName} {teamPlayer.player.lastName}
        </span>
      </div>
      
      <div className="flex items-center space-x-1">
        {teamPlayer.player.duprRating && (
          <Badge variant="outline" className="text-xs">
            {teamPlayer.player.duprRating}
          </Badge>
        )}
        {onRemovePlayerFromSlot && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onRemovePlayerFromSlot(teamPlayer.id, slotIndex)
            }}
            className="h-4 w-4 p-0 text-red-500 hover:text-red-700"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

// Team Card for Drag Overlay
function TeamCard({ team }: { team: Team }) {
  if (!team) {
    console.warn('TeamCard: team is undefined')
    return null
  }

  return (
    <div className="p-2 bg-white border rounded-lg shadow-lg">
      <div className="font-medium text-sm">{team.name}</div>
      {team.seed && (
        <div className="text-xs text-gray-500">Seed: {team.seed}</div>
      )}
    </div>
  )
}
