'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileSpreadsheet, AlertTriangle, CheckCircle2, X,
  Upload, Calendar, Clock, Users, DollarSign
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SheetSelector } from './SheetSelector'
import type { ParsedSession, SheetInfo } from '../_hooks/useFileParser'
import type { ClubDataStatus } from '../_hooks/useAdvisorState'

// ── Badge Helpers ──

const getFormatColor = (f: string) => {
  const m: Record<string, string> = {
    OPEN_PLAY: 'bg-blue-100 text-blue-800',
    DRILL: 'bg-orange-100 text-orange-800',
    CLINIC: 'bg-purple-100 text-purple-800',
    SOCIAL: 'bg-green-100 text-green-800',
    LEAGUE_PLAY: 'bg-red-100 text-red-800',
    ROUND_ROBIN: 'bg-indigo-100 text-indigo-800',
    PRIVATE: 'bg-gray-100 text-gray-800',
  }
  return m[f] || 'bg-gray-100 text-gray-800'
}

const getOccupancyColor = (pct: number) => {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-yellow-500'
  if (pct >= 25) return 'bg-orange-500'
  return 'bg-red-500'
}

const formatLabel = (f: string) => f.replace(/_/g, ' ')

export type ImportProgress = {
  phase: string
  current: number
  total: number
  message: string
}

type FilePreviewViewProps = {
  sessions: ParsedSession[]
  fileName: string
  sheets: SheetInfo[]
  selectedSheet: number
  onSelectSheet: (index: number) => void
  onImport: (selectedSessions: ParsedSession[], fileName: string) => void
  onCancel: () => void
  importError: string
  isImporting: boolean
  importProgress: ImportProgress | null
  previousStatus: ClubDataStatus | null
}

const phaseLabels: Record<string, string> = {
  deleting: 'Cleaning up old data...',
  preparing: 'Preparing data...',
  embedding: 'Generating AI embeddings...',
  saving: 'Saving to database...',
}

export function FilePreviewView({
  sessions,
  fileName,
  sheets,
  selectedSheet,
  onSelectSheet,
  onImport,
  onCancel,
  importError,
  isImporting,
  importProgress,
  previousStatus,
}: FilePreviewViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(sessions.map(s => s.id))
  })

  // Reset selection when sessions change (e.g. sheet switch)
  useEffect(() => {
    setSelectedIds(new Set(sessions.map(s => s.id)))
  }, [sessions])

  // Recompute when sessions change (e.g. sheet switch)
  const totalSlots = sessions.reduce((s, x) => s + x.capacity, 0)
  const filledSlots = sessions.reduce((s, x) => s + x.registered, 0)
  const emptySlots = totalSlots - filledSlots
  const underfilledSessions = sessions.filter(s => s.occupancyPercent < 80)
  const selectedSessions = sessions.filter(s => selectedIds.has(s.id))

  // Unique player count
  const allPlayers = new Set(sessions.flatMap(s => s.playerNames))
  const playerCount = allPlayers.size

  // Revenue stats (only if any session has price data)
  const hasPrice = sessions.some(s => s.pricePerPlayer != null)
  const totalRevenue = hasPrice
    ? sessions.reduce((sum, s) => sum + (s.pricePerPlayer || 0) * s.registered, 0)
    : 0
  const lostRevenue = hasPrice
    ? sessions.reduce((sum, s) => sum + (s.pricePerPlayer || 0) * Math.max(0, s.capacity - s.registered), 0)
    : 0

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(sessions.map(s => s.id)))
  const selectUnderfilled = () => setSelectedIds(new Set(underfilledSessions.map(s => s.id)))
  const deselectAll = () => setSelectedIds(new Set())

  const handleImport = () => {
    onImport(selectedSessions, fileName)
  }

  return (
    <div className="space-y-6">
      {importError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{importError}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {sessions.length} sessions parsed · {emptySlots} empty slots found
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SheetSelector sheets={sheets} selected={selectedSheet} onSelect={onSelectSheet} />
              <Button variant="ghost" size="sm" onClick={onCancel}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diff: Previous vs. New data */}
      {previousStatus?.hasData && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/10 dark:border-blue-800">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Data Update Preview</p>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Current</p>
                <p className="text-lg font-bold">{previousStatus.sessionCount} sessions</p>
                <p className="text-xs text-muted-foreground">{previousStatus.playerCount} players</p>
              </div>
              <div>
                <p className="text-xs text-green-600 dark:text-green-400 mb-1">After Update</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">{selectedIds.size} sessions</p>
                <p className="text-xs text-muted-foreground">{playerCount} players</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className={cn('grid gap-4', hasPrice ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 md:grid-cols-4')}>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{sessions.length}</p>
            <p className="text-xs text-muted-foreground">Total Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-red-600">{underfilledSessions.length}</p>
            <p className="text-xs text-muted-foreground">Underfilled (&lt;80%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-orange-600">{emptySlots}</p>
            <p className="text-xs text-muted-foreground">Empty Slots</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">
              {totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Avg Occupancy</p>
          </CardContent>
        </Card>
        {hasPrice && (
          <>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-2xl font-bold text-green-600">${totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-2xl font-bold text-red-600">${lostRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Lost Revenue</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Selection Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-2">
          {selectedIds.size} of {sessions.length} selected
        </span>
        <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
        <Button variant="outline" size="sm" onClick={selectUnderfilled}>
          Select Underfilled Only
        </Button>
        <Button variant="ghost" size="sm" onClick={deselectAll}>Deselect All</Button>
      </div>

      {/* Sessions List */}
      <div className="space-y-3">
        {sessions.map((session) => {
          const isSelected = selectedIds.has(session.id)
          const isUnderfilled = session.occupancyPercent < 80

          return (
            <Card
              key={session.id}
              className={cn(
                'cursor-pointer transition-all',
                isSelected
                  ? 'border-primary ring-1 ring-primary/20'
                  : 'hover:border-muted-foreground/30',
                isUnderfilled && !isSelected && 'border-orange-200'
              )}
              onClick={() => toggleSelect(session.id)}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                    isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                  )}>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary-foreground" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{session.court}</span>
                      <Badge className={cn('text-xs', getFormatColor(session.format))}>
                        {formatLabel(session.format)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {formatLabel(session.skillLevel)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {session.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {session.startTime}–{session.endTime}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {session.registered}/{session.capacity}
                      </span>
                      {session.pricePerPlayer != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          ${session.pricePerPlayer}/player
                        </span>
                      )}
                      {session.playerNames.length > 0 && (
                        <span className="hidden sm:inline text-muted-foreground/70 truncate max-w-[200px]">
                          {session.playerNames.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0 w-32">
                    <span className={cn(
                      'text-xs font-medium',
                      session.occupancyPercent < 50 ? 'text-red-600' : session.occupancyPercent < 80 ? 'text-orange-600' : 'text-green-600'
                    )}>
                      {session.emptySlots} empty {session.emptySlots === 1 ? 'slot' : 'slots'}
                    </span>
                    <div className="w-full bg-secondary rounded-full h-1.5">
                      <div
                        className={cn('rounded-full h-1.5 transition-all', getOccupancyColor(session.occupancyPercent))}
                        style={{ width: `${session.occupancyPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Import Button / Progress */}
      <div className="sticky bottom-4 z-10">
        <Card className="shadow-lg border-primary/20">
          <CardContent className="py-4">
            {isImporting && importProgress ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {phaseLabels[importProgress.phase] || importProgress.message}
                  </span>
                  {importProgress.total > 0 && (
                    <span className="text-muted-foreground tabular-nums">
                      {importProgress.current}/{importProgress.total}
                    </span>
                  )}
                </div>
                <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      importProgress.phase === 'embedding'
                        ? 'bg-blue-500'
                        : importProgress.phase === 'saving'
                          ? 'bg-lime-500'
                          : 'bg-blue-400'
                    )}
                    style={{
                      width: importProgress.total > 0
                        ? `${Math.round((importProgress.current / importProgress.total) * 100)}%`
                        : '100%',
                      ...(importProgress.total === 0 ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
                    }}
                  />
                </div>
                {importProgress.total > 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    {Math.round((importProgress.current / importProgress.total) * 100)}% complete
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {selectedIds.size} sessions selected
                    {selectedIds.size > 0 && (
                      <span className="text-muted-foreground ml-1">
                        · {selectedSessions.reduce((s, x) => s + x.emptySlots, 0)} empty slots to fill
                        {hasPrice && (() => {
                          const selLost = selectedSessions.reduce((s, x) => s + (x.pricePerPlayer || 0) * Math.max(0, x.capacity - x.registered), 0)
                          return selLost > 0 ? ` · $${selLost.toLocaleString()} lost revenue` : ''
                        })()}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  size="lg"
                  disabled={selectedIds.size === 0 || isImporting}
                  onClick={handleImport}
                >
                  {isImporting ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Import {selectedIds.size} Sessions
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
