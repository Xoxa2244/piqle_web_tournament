import { NextRequest } from 'next/server'

// Target schema
interface ParsedSession {
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
}

export async function POST(req: NextRequest) {
  try {
    const { csvContent, fileName } = await req.json()

    if (!csvContent || typeof csvContent !== 'string') {
      return Response.json({ error: 'csvContent is required' }, { status: 400 })
    }

    const lines = csvContent.trim().split('\n')
    if (lines.length < 2) {
      return Response.json({ error: 'CSV must have at least a header row and one data row' }, { status: 400 })
    }

    const headerLine = lines[0]
    const sampleRows = lines.slice(1, Math.min(6, lines.length))

    // Step 1: Ask LLM to figure out column mapping
    const mappingPrompt = `You are a CSV column mapper for a sports club session management system.

Given these CSV headers and sample data, map each CSV column to our target fields.

TARGET FIELDS (all required):
- date: Session date (YYYY-MM-DD format)
- startTime: Start time (HH:MM 24h format)
- endTime: End time (HH:MM 24h format)
- court: Court name/number
- format: Session format. Must be one of: OPEN_PLAY, CLINIC, DRILL, LEAGUE_PLAY, SOCIAL
- skillLevel: Must be one of: ALL_LEVELS, BEGINNER, INTERMEDIATE, ADVANCED
- registered: Number of registered players (integer)
- capacity: Max players allowed (integer)
- pricePerPlayer: Price per player in dollars (number or null)
- playerNames: Semicolon-separated list of player names

CSV HEADERS: ${headerLine}

SAMPLE ROWS:
${sampleRows.join('\n')}

FILE NAME: ${fileName || 'unknown.csv'}

Return a JSON object mapping each target field to the CSV column index (0-based) or a transformation rule.
Format:
{
  "mapping": {
    "date": { "column": 0, "transform": "none" | "parse_date" | "combine" },
    "startTime": { "column": 1, "transform": "none" | "parse_time" | "extract_from_datetime" },
    "endTime": { "column": 2, "transform": "none" | "parse_time" | "calculate_duration" },
    "court": { "column": 3, "transform": "none" },
    "format": { "column": 4, "transform": "none" | "map_format" },
    "skillLevel": { "column": 5, "transform": "none" | "map_skill" | "default_all_levels" },
    "registered": { "column": 6, "transform": "none" | "count_names" },
    "capacity": { "column": 7, "transform": "none" | "default_8" },
    "pricePerPlayer": { "column": 8, "transform": "none" | "parse_currency" | "null" },
    "playerNames": { "column": 9, "transform": "none" | "split_names" }
  },
  "delimiter": "," | "\\t" | ";",
  "skipRows": 0,
  "notes": "any issues or assumptions"
}

If a field has no matching column, set column to -1 and provide a reasonable default via transform.
For format mapping, map common terms: "open play"/"drop-in"/"pickup" → OPEN_PLAY, "clinic"/"lesson"/"class" → CLINIC, "drill"/"practice" → DRILL, "league"/"match"/"competitive" → LEAGUE_PLAY, "social"/"mixer"/"round robin" → SOCIAL.
For skill mapping: "beginner"/"intro"/"1.0-2.5" → BEGINNER, "intermediate"/"int"/"2.5-3.5" → INTERMEDIATE, "advanced"/"adv"/"3.5+" → ADVANCED, otherwise → ALL_LEVELS.

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`

    const llmResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: mappingPrompt }],
        temperature: 0,
        max_tokens: 1000,
      }),
    })

    if (!llmResponse.ok) {
      const err = await llmResponse.text()
      return Response.json({ error: 'LLM API failed', details: err }, { status: 500 })
    }

    const llmResult = await llmResponse.json()
    const mappingText = llmResult.choices?.[0]?.message?.content?.trim() || ''
    let mapping: any
    try {
      // Strip markdown code fences if present
      const clean = mappingText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      mapping = JSON.parse(clean)
    } catch (e) {
      return Response.json({ error: 'Failed to parse LLM mapping response', raw: mappingText }, { status: 500 })
    }

    // Step 2: Apply mapping to all rows
    const delimiter = mapping.delimiter === '\\t' || mapping.delimiter === '\t' ? '\t' : mapping.delimiter || ','
    const skipRows = mapping.skipRows || 0
    const dataLines = lines.slice(1 + skipRows)
    const m = mapping.mapping

    const sessions: ParsedSession[] = []
    const errors: string[] = []

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim()
      if (!line) continue

      // Smart CSV split (handles quoted fields)
      const cols = smartSplit(line, delimiter)

      try {
        const getCol = (idx: number) => idx >= 0 && idx < cols.length ? cols[idx].trim().replace(/^["']|["']$/g, '') : ''

        // Date
        let date = getCol(m.date?.column ?? -1)
        if (m.date?.transform === 'parse_date' && date) {
          date = parseFlexibleDate(date)
        }
        if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Try to parse anyway
          const parsed = parseFlexibleDate(date)
          if (parsed) date = parsed
          else { errors.push(`Row ${i + 1}: invalid date "${date}"`); continue }
        }

        // Times
        let startTime = getCol(m.startTime?.column ?? -1)
        let endTime = getCol(m.endTime?.column ?? -1)
        if (m.startTime?.transform === 'parse_time') startTime = parseFlexibleTime(startTime)
        if (m.endTime?.transform === 'parse_time') endTime = parseFlexibleTime(endTime)
        if (m.endTime?.transform === 'calculate_duration' || !endTime) {
          // Default: 90 minutes after start
          const [h, min] = (startTime || '09:00').split(':').map(Number)
          const endMin = h * 60 + min + 90
          endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`
        }
        startTime = parseFlexibleTime(startTime) || '09:00'
        endTime = parseFlexibleTime(endTime) || '10:30'

        // Court
        let court = getCol(m.court?.column ?? -1) || 'Court 1'

        // Format
        let format = getCol(m.format?.column ?? -1)
        format = mapFormat(format)

        // Skill
        let skillLevel = getCol(m.skillLevel?.column ?? -1)
        skillLevel = mapSkill(skillLevel)

        // Registered & Capacity
        let registered = parseInt(getCol(m.registered?.column ?? -1)) || 0
        let capacity = parseInt(getCol(m.capacity?.column ?? -1)) || 8

        // If registered comes from counting player names
        const playerNamesRaw = getCol(m.playerNames?.column ?? -1)
        let playerNames: string[] = []
        if (playerNamesRaw) {
          playerNames = playerNamesRaw
            .split(/[;|]/) // split by semicolon or pipe (NOT comma — names like "O'Brien, Jr." exist)
            .map(n => n.trim())
            .filter(Boolean)
            .filter(name => {
              // Filter out values that are clearly not player names
              const lower = name.toLowerCase()
              if (/^\d+(\.\d+)?$/.test(name)) return false // pure numbers like "4.0", "15"
              if (/^\$?\d/.test(name)) return false // prices like "$15"
              if (['confirmed', 'cancelled', 'canceled', 'no-show', 'noshow', 'no show',
                   'pending', 'waitlisted', 'active', 'inactive', 'yes', 'no', 'true', 'false',
                   'beginner', 'intermediate', 'advanced', 'all levels', 'all_levels',
                   'open play', 'open_play', 'clinic', 'drill', 'league', 'social',
                  ].includes(lower)) return false
              if (name.length < 2) return false // single chars
              if (name.length > 50) return false // too long to be a name
              return true
            })
          if (m.registered?.transform === 'count_names' || registered === 0) {
            registered = playerNames.length
          }
        }

        if (registered === 0 && playerNames.length > 0) registered = playerNames.length
        // Don't inflate capacity to match registered — keep original CSV value
        // This preserves real occupancy rates (e.g., 6/8 = 75%, not 6/6 = 100%)

        // Price
        let pricePerPlayer: number | null = null
        const priceRaw = getCol(m.pricePerPlayer?.column ?? -1)
        if (priceRaw && m.pricePerPlayer?.transform !== 'null') {
          const parsed = parseFloat(priceRaw.replace(/[$,]/g, ''))
          if (!isNaN(parsed)) pricePerPlayer = parsed
        }

        sessions.push({
          date, startTime, endTime, court, format, skillLevel,
          registered, capacity, pricePerPlayer, playerNames,
        })
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : 'parse error'}`)
      }
    }

    // ── Group rows by session (same date + startTime + court = one session) ──
    // CSV may have one row per player-per-session, so we merge them
    const sessionMap = new Map<string, typeof sessions[0]>()
    for (const s of sessions) {
      const key = `${s.date}|${s.startTime}|${s.court}`
      const existing = sessionMap.get(key)
      if (existing) {
        // Merge player names (deduplicate)
        for (const name of s.playerNames) {
          if (name && !existing.playerNames.includes(name)) {
            existing.playerNames.push(name)
          }
        }
        existing.registered = existing.playerNames.length
        // Keep the higher capacity
        if (s.capacity > existing.capacity) existing.capacity = s.capacity
        // Keep price if set
        if (s.pricePerPlayer != null && existing.pricePerPlayer == null) {
          existing.pricePerPlayer = s.pricePerPlayer
        }
      } else {
        sessionMap.set(key, { ...s, playerNames: [...s.playerNames] })
      }
    }

    const groupedSessions = Array.from(sessionMap.values())

    return Response.json({
      sessions: groupedSessions,
      totalParsed: groupedSessions.length,
      totalRows: sessions.length,
      totalErrors: errors.length,
      errors: errors.slice(0, 10),
      mapping: mapping.mapping,
      notes: mapping.notes,
    })

  } catch (error) {
    console.error('[Parse CSV] Error:', error)
    return Response.json({ error: 'Failed to parse CSV' }, { status: 500 })
  }
}

// ── Helpers ──

function smartSplit(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' || ch === "'") {
      inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseFlexibleDate(raw: string): string {
  if (!raw) return ''
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // MM/DD/YYYY or M/D/YYYY
  const mdy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  // DD/MM/YYYY (European) — ambiguous, assume M/D/Y
  // ISO datetime
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})T/)
  if (iso) return iso[1]
  // Try Date constructor
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return raw
}

function parseFlexibleTime(raw: string): string {
  if (!raw) return ''
  // Already HH:MM
  if (/^\d{2}:\d{2}$/.test(raw)) return raw
  // H:MM or HH:MM:SS
  const hm = raw.match(/^(\d{1,2}):(\d{2})/)
  if (hm) {
    let h = parseInt(hm[1])
    const m = hm[2]
    // AM/PM
    if (/pm/i.test(raw) && h < 12) h += 12
    if (/am/i.test(raw) && h === 12) h = 0
    return `${h.toString().padStart(2, '0')}:${m}`
  }
  // Just hour number
  const hourOnly = raw.match(/^(\d{1,2})\s*(am|pm)?$/i)
  if (hourOnly) {
    let h = parseInt(hourOnly[1])
    if (hourOnly[2] && /pm/i.test(hourOnly[2]) && h < 12) h += 12
    if (hourOnly[2] && /am/i.test(hourOnly[2]) && h === 12) h = 0
    return `${h.toString().padStart(2, '0')}:00`
  }
  return raw
}

function mapFormat(raw: string): string {
  const lower = (raw || '').toLowerCase().trim()
  if (/open.?play|drop.?in|pickup|pick.?up/.test(lower)) return 'OPEN_PLAY'
  if (/clinic|lesson|class|instruction/.test(lower)) return 'CLINIC'
  if (/drill|practice|training/.test(lower)) return 'DRILL'
  if (/league|match|competitive|tournament/.test(lower)) return 'LEAGUE_PLAY'
  if (/social|mixer|round.?robin|fun|party/.test(lower)) return 'SOCIAL'
  // Check if it's already our format
  if (['OPEN_PLAY', 'CLINIC', 'DRILL', 'LEAGUE_PLAY', 'SOCIAL'].includes(raw)) return raw
  return 'OPEN_PLAY' // default
}

function mapSkill(raw: string): string {
  const lower = (raw || '').toLowerCase().trim()
  if (/beginner|intro|novice|1\.[0-9]|2\.[0-4]/.test(lower)) return 'BEGINNER'
  if (/intermediate|int|2\.[5-9]|3\.[0-4]/.test(lower)) return 'INTERMEDIATE'
  if (/advanced|adv|3\.[5-9]|4\.|5\./.test(lower)) return 'ADVANCED'
  if (['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS'].includes(raw)) return raw
  return 'ALL_LEVELS'
}
