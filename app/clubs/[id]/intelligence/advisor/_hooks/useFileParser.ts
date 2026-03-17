'use client'

import { useState, useCallback } from 'react'

// ── Types ──

export type ParsedSession = {
  id: string
  date: string
  startTime: string
  endTime: string
  court: string
  format: string
  skillLevel: string
  registered: number
  capacity: number
  pricePerPlayer: number | null
  playerNames: string[]
  emptySlots: number
  occupancyPercent: number
}

export type SheetInfo = {
  name: string
  index: number
}

export type FileParserResult = {
  sessions: ParsedSession[]
  fileName: string
  sheets: SheetInfo[]
  selectedSheet: number
  parseError: string
  isLoading: boolean
  processFile: (file: File) => void
  selectSheet: (index: number) => void
  reset: () => void
}

// ── CSV Parser ──

export function parseCSV(text: string): ParsedSession[] {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length < 2) return []

  const headerLine = lines[0]
  const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))

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
    price: ['price', 'cost', 'fee', 'price_per_player', 'rate', 'price_per_slot', 'amount'],
  }

  for (const [key, names] of Object.entries(aliases)) {
    const idx = headers.findIndex(h => names.includes(h))
    if (idx >= 0) colMap[key] = idx
  }

  const playerColumns: number[] = []
  headers.forEach((h, i) => {
    if (/^player_?\d+$/.test(h) || /^slot_?\d+$/.test(h)) {
      playerColumns.push(i)
    }
  })

  const sessions: ParsedSession[] = []

  for (let i = 1; i < lines.length; i++) {
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

    const priceRaw = parseFloat(getVal('price'))
    const pricePerPlayer = isNaN(priceRaw) ? null : priceRaw

    if (!date || !startTime) continue

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
      pricePerPlayer,
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

export function normalizeFormat(raw: string): string {
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

export function normalizeSkillLevel(raw: string): string {
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

// ── XLSX Support ──

export async function parseXLSX(buffer: ArrayBuffer, sheetIndex: number): Promise<{ csvText: string; sheets: SheetInfo[] }> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheets: SheetInfo[] = workbook.SheetNames.map((name, index) => ({ name, index }))
  const sheetName = workbook.SheetNames[sheetIndex] || workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const csvText = XLSX.utils.sheet_to_csv(sheet)

  return { csvText, sheets }
}

// ── Sample CSV ──

export const SAMPLE_CSV = `date,start_time,end_time,court,format,skill_level,registered,capacity,price,players
2025-03-05,09:00,11:00,Court 1,Open Play,Intermediate,3,8,15,John Smith;Jane Doe;Mike Brown
2025-03-05,09:00,11:00,Court 2,Drill,Advanced,2,6,25,Sarah Lee;Tom Wilson
2025-03-05,17:00,19:00,Court 1,Social,All Levels,4,12,10,Amy Chen;Bob Jones;Lisa Park;Dave Kim
2025-03-06,08:00,10:00,Court 3,Clinic,Beginner,1,8,30,New Player
2025-03-06,18:00,20:00,Court 1,Open Play,Intermediate,5,8,15,John Smith;Jane Doe;Mike Brown;Sarah Lee;Tom Wilson
2025-03-07,17:00,19:00,Court 2,Round Robin,Advanced,2,8,20,Top Player;Pro Guy
2025-03-08,09:00,12:00,Court 1,Open Play,All Levels,0,16,12,
2025-03-08,09:00,12:00,Court 2,League Play,Advanced,3,4,25,Sarah Lee;Tom Wilson;Pro Guy`

export function downloadSampleCSV() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'courtreserve_schedule_sample.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Hook ──

export function useFileParser(): FileParserResult {
  const [sessions, setSessions] = useState<ParsedSession[]>([])
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [parseError, setParseError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // Store raw XLSX buffer for sheet switching
  const [xlsxBuffer, setXlsxBuffer] = useState<ArrayBuffer | null>(null)

  const parseAndSet = useCallback((csvText: string) => {
    const parsed = parseCSV(csvText)
    if (parsed.length === 0) {
      setParseError('No valid sessions found. Check the format — we need at least date and start_time columns.')
      return
    }
    setSessions(parsed)
    setParseError('')
  }, [])

  const processFile = useCallback((file: File) => {
    setParseError('')
    setIsLoading(true)
    setFileName(file.name)
    setSheets([])
    setSelectedSheet(0)
    setXlsxBuffer(null)

    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer
          setXlsxBuffer(buffer)
          const { csvText, sheets: sheetList } = await parseXLSX(buffer, 0)
          setSheets(sheetList)
          parseAndSet(csvText)
        } catch {
          setParseError('Error reading XLSX file. Please check the format.')
        } finally {
          setIsLoading(false)
        }
      }
      reader.readAsArrayBuffer(file)
    } else if (ext === 'csv' || ext === 'tsv') {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string
          parseAndSet(text)
        } catch {
          setParseError('Error parsing CSV file. Please check the format.')
        } finally {
          setIsLoading(false)
        }
      }
      reader.readAsText(file)
    } else {
      setParseError('Unsupported file type. Please upload .csv, .tsv, .xlsx or .xls files.')
      setIsLoading(false)
    }
  }, [parseAndSet])

  const selectSheet = useCallback(async (index: number) => {
    if (!xlsxBuffer) return
    setSelectedSheet(index)
    setIsLoading(true)
    try {
      const { csvText } = await parseXLSX(xlsxBuffer, index)
      parseAndSet(csvText)
    } catch {
      setParseError('Error reading sheet. Please try another one.')
    } finally {
      setIsLoading(false)
    }
  }, [xlsxBuffer, parseAndSet])

  const reset = useCallback(() => {
    setSessions([])
    setFileName('')
    setSheets([])
    setSelectedSheet(0)
    setParseError('')
    setIsLoading(false)
    setXlsxBuffer(null)
  }, [])

  return {
    sessions,
    fileName,
    sheets,
    selectedSheet,
    parseError,
    isLoading,
    processFile,
    selectSheet,
    reset,
  }
}
