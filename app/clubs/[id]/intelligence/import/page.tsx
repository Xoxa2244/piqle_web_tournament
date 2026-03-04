'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2,
  X, Download, Sparkles, Calendar, Clock, Users, ArrowRight, Info
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type ParsedSession = {
  id: string
  date: string
  startTime: string
  endTime: string
  court: string
  format: string
  skillLevel: string
  registered: number
  capacity: number
  playerNames: string[]
  emptySlots: number
  occupancyPercent: number
}

type ImportState = 'idle' | 'preview' | 'importing' | 'done'

// ── CSV Parser ─────────────────────────────────────────────────────────────

function parseCSV(text: string): ParsedSession[] {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length < 2) return []

  // Parse header (case-insensitive, flexible naming)
  const headerLine = lines[0]
  const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))

  // Map known column names
  const colMap: Record<string, number> = {}
  const aliases: Record<string, string[]> = {
    date: ['date', 'session_date', 'day'],
    start_time: ['start_time', 'start', 'time_start', 'from', 'begin'],
    end_time: ['end_time', 'end', 'time_end', 'to', 'finish'],
    court: ['court', 'court_name', 'location', 'venue'],
    format: ['format', 'type', 'session_type', 'activity', 'program'],
    skill_level: ['skill_level', 'level', 'skill', 'difficulty'],
    registered: ['registered', 'signed_up', 'booked', 'current', 'players_count', 'confirmed'],
    capacity: ['capacity', 'max', 'max_players', 'max_capacity', 'spots', 'total_spots'],
    players: ['players', 'player_names', 'participants', 'names', 'roster'],
  }

  for (const [key, names] of Object.entries(aliases)) {
    const idx = headers.findIndex(h => names.includes(h))
    if (idx >= 0) colMap[key] = idx
  }

  // Also check for Player 1, Player 2, etc. columns
  const playerColumns: number[] = []
  headers.forEach((h, i) => {
    if (/^player_?\d+$/.test(h) || /^slot_?\d+$/.test(h)) {
      playerColumns.push(i)
    }
  })

  const sessions: ParsedSession[] = []

  for (let i = 1; i < lines.length; i++) {
    // Smart CSV split (handle quoted fields)
    const values = splitCSVLine(lines[i])

    const getVal = (key: string): string => {
      const idx = colMap[key]
      return idx !== undefined && idx < values.length ? values[idx].trim() : ''
    }

    const date = getVal('date')
    const startTime = getVal('start_time')
    const endTime = getVal('end_time')
    const court = getVal('court') || `Court ${i}`
    const format = normalizeFormat(getVal('format'))
    const skillLevel = normalizeSkillLevel(getVal('skill_level'))

    // Get players — either from a single "players" column or from Player 1, Player 2 columns
    let playerNames: string[] = []
    const playersCell = getVal('players')
    if (playersCell) {
      playerNames = playersCell.split(';').map(n => n.trim()).filter(Boolean)
    } else if (playerColumns.length > 0) {
      playerNames = playerColumns
        .map(ci => ci < values.length ? values[ci].trim() : '')
        .filter(Boolean)
    }

    const capacity = parseInt(getVal('capacity')) || 8
    let registered = parseInt(getVal('registered'))
    if (isNaN(registered)) {
      registered = playerNames.length
    }

    if (!date || !startTime) continue // skip rows without essential data

    const emptySlots = Math.max(0, capacity - registered)
    const occupancyPercent = capacity > 0 ? Math.round((registered / capacity) * 100) : 0

    sessions.push({
      id: `import-${i}`,
      date,
      startTime,
      endTime: endTime || addHours(startTime, 1.5),
      court,
      format,
      skillLevel,
      registered,
      capacity,
      playerNames,
      emptySlots,
      occupancyPercent,
    })
  }

  return sessions
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function normalizeFormat(raw: string): string {
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (lower.includes('open')) return 'OPEN_PLAY'
  if (lower.includes('drill')) return 'DRILL'
  if (lower.includes('clinic')) return 'CLINIC'
  if (lower.includes('league')) return 'LEAGUE_PLAY'
  if (lower.includes('social')) return 'SOCIAL'
  if (lower.includes('round') || lower.includes('robin')) return 'ROUND_ROBIN'
  if (lower.includes('private')) return 'PRIVATE'
  return 'OPEN_PLAY'
}

function normalizeSkillLevel(raw: string): string {
  const lower = raw.toLowerCase().replace(/[^a-z0-9.]/g, '')
  if (lower.includes('beginner') || lower.includes('1') || lower.includes('2.0') || lower.includes('2.5')) return 'BEGINNER'
  if (lower.includes('intermediate') || lower.includes('3.0') || lower.includes('3.5')) return 'INTERMEDIATE'
  if (lower.includes('advanced') || lower.includes('4.0') || lower.includes('4.5') || lower.includes('5')) return 'ADVANCED'
  if (lower.includes('all')) return 'ALL_LEVELS'
  return 'ALL_LEVELS'
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + (m || 0) + hours * 60
  const newH = Math.floor(totalMinutes / 60) % 24
  const newM = Math.floor(totalMinutes % 60)
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

// ── Sample CSV Generator ───────────────────────────────────────────────────

const SAMPLE_CSV = `date,start_time,end_time,court,format,skill_level,registered,capacity,players
2025-03-05,09:00,11:00,Court 1,Open Play,Intermediate,3,8,John Smith;Jane Doe;Mike Brown
2025-03-05,09:00,11:00,Court 2,Drill,Advanced,2,6,Sarah Lee;Tom Wilson
2025-03-05,17:00,19:00,Court 1,Social,All Levels,4,12,Amy Chen;Bob Jones;Lisa Park;Dave Kim
2025-03-06,08:00,10:00,Court 3,Clinic,Beginner,1,8,New Player
2025-03-06,18:00,20:00,Court 1,Open Play,Intermediate,5,8,John Smith;Jane Doe;Mike Brown;Sarah Lee;Tom Wilson
2025-03-07,17:00,19:00,Court 2,Round Robin,Advanced,2,8,Top Player;Pro Guy
2025-03-08,09:00,12:00,Court 1,Open Play,All Levels,0,16,
2025-03-08,09:00,12:00,Court 2,League Play,Advanced,3,4,Sarah Lee;Tom Wilson;Pro Guy`

function downloadSampleCSV() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'courtreserve_schedule_sample.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Badge Helpers ──────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────

export default function ImportSchedulePage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const clubId = params.id as string

  const [state, setState] = useState<ImportState>('idle')
  const [fileName, setFileName] = useState('')
  const [sessions, setSessions] = useState<ParsedSession[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dragActive, setDragActive] = useState(false)
  const [parseError, setParseError] = useState('')

  // Stats
  const totalSlots = sessions.reduce((s, x) => s + x.capacity, 0)
  const filledSlots = sessions.reduce((s, x) => s + x.registered, 0)
  const emptySlots = totalSlots - filledSlots
  const underfilledSessions = sessions.filter(s => s.occupancyPercent < 80)
  const selectedSessions = sessions.filter(s => selectedIds.has(s.id))

  // ── File Handling ──

  const processFile = useCallback((file: File) => {
    setParseError('')
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv')) {
      setParseError('Please upload a .csv file')
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          setParseError('No valid sessions found in the CSV. Check the format — we need at least date and start_time columns.')
          return
        }
        setSessions(parsed)
        // Auto-select underfilled sessions
        const autoSelect = new Set(parsed.filter(s => s.occupancyPercent < 80).map(s => s.id))
        setSelectedIds(autoSelect)
        setState('preview')
      } catch (err) {
        setParseError('Error parsing CSV file. Please check the format.')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

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
    setState('importing')
    // Simulate import — in real app this would call tRPC to create PlaySession records
    setTimeout(() => {
      setState('done')
      toast({
        title: 'Schedule imported!',
        description: `${selectedSessions.length} sessions imported. ${selectedSessions.filter(s => s.occupancyPercent < 80).length} underfilled sessions ready for AI recommendations.`,
      })
    }, 1500)
  }

  const handleGoToAI = () => {
    router.push(`/clubs/${clubId}/intelligence`)
  }

  const handleReset = () => {
    setState('idle')
    setFileName('')
    setSessions([])
    setSelectedIds(new Set())
    setParseError('')
  }

  // ── Render ──

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href={`/clubs/${clubId}/intelligence`}
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Back to Intelligence</span>
            </Link>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-lg">
                  <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Import Schedule</h1>
              </div>
              <p className="text-muted-foreground">
                Upload your CourtReserve or court schedule CSV to find empty slots for AI to fill
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── IDLE: Upload Zone ── */}
        {state === 'idle' && (
          <div className="space-y-6">
            {/* Drop Zone */}
            <Card
              className={cn(
                'border-2 border-dashed transition-colors cursor-pointer',
                dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className={cn(
                  'p-4 rounded-full mb-4 transition-colors',
                  dragActive ? 'bg-primary/10' : 'bg-muted'
                )}>
                  <Upload className={cn('w-8 h-8', dragActive ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <h3 className="text-lg font-semibold mb-1">
                  {dragActive ? 'Drop your CSV here' : 'Upload Court Schedule'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Drag & drop a CSV file, or click to browse
                </p>
                <Button variant="outline" size="sm">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </CardContent>
            </Card>

            {parseError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex items-center gap-3 py-4">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{parseError}</p>
                </CardContent>
              </Card>
            )}

            {/* Format Info */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500" />
                  <CardTitle className="text-sm">Supported CSV Format</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We accept CSV exports from CourtReserve, Playbypoint, or any schedule with these columns:
                </p>
                <div className="bg-muted rounded-lg p-4 font-mono text-xs overflow-x-auto">
                  <div className="text-muted-foreground">date, start_time, end_time, court, format, skill_level, registered, capacity, players</div>
                  <div className="mt-1">2025-03-05, 09:00, 11:00, Court 1, Open Play, Intermediate, 3, 8, John;Jane;Mike</div>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={downloadSampleCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    Download Sample CSV
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    8 example sessions with various fill levels
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── PREVIEW: Parsed Sessions ── */}
        {(state === 'preview' || state === 'importing') && (
          <div className="space-y-6">
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
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <X className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                        {/* Checkbox */}
                        <div className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground/30'
                        )}>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-primary-foreground" />}
                        </div>

                        {/* Session Info */}
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
                            {session.playerNames.length > 0 && (
                              <span className="hidden sm:inline text-muted-foreground/70 truncate max-w-[200px]">
                                {session.playerNames.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Occupancy Bar */}
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

            {/* Import Button */}
            <div className="sticky bottom-4 z-10">
              <Card className="shadow-lg border-primary/20">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {selectedIds.size} sessions selected
                        {selectedIds.size > 0 && (
                          <span className="text-muted-foreground ml-1">
                            · {selectedSessions.reduce((s, x) => s + x.emptySlots, 0)} empty slots to fill
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      size="lg"
                      disabled={selectedIds.size === 0 || state === 'importing'}
                      onClick={handleImport}
                    >
                      {state === 'importing' ? (
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
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── DONE: Success ── */}
        {state === 'done' && (
          <div className="space-y-6">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="flex flex-col items-center py-12">
                <div className="p-3 bg-green-100 rounded-full mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold text-green-900 mb-2">Schedule Imported!</h2>
                <p className="text-sm text-green-700 text-center max-w-md mb-6">
                  {selectedSessions.length} sessions imported successfully.
                  {' '}{selectedSessions.filter(s => s.occupancyPercent < 80).length} underfilled sessions
                  are ready for AI slot-filling recommendations.
                </p>
                <div className="flex gap-3">
                  <Button onClick={handleGoToAI} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Fill Empty Slots with AI
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    Import More
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Imported Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Import Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{selectedSessions.length}</p>
                    <p className="text-xs text-muted-foreground">Sessions</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-600">
                      {selectedSessions.reduce((s, x) => s + x.emptySlots, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Empty Slots</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">
                      {selectedSessions.filter(s => s.occupancyPercent < 80).length}
                    </p>
                    <p className="text-xs text-muted-foreground">Ready for AI</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
