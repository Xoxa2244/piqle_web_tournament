/**
 * CSV Parser & Session Importer — unit tests
 *
 * Tests the core logic from:
 *   - app/api/ai/parse-csv/route.ts  (grouping, merging, name filtering, price parsing)
 *   - lib/ai/session-importer.ts      (player name dedup, garbage filtering)
 *
 * Since the grouping/filtering logic lives inside the route handler and is not
 * directly exported, we replicate the pure-logic portions here and test them
 * in isolation.
 */

import { describe, it, expect } from 'vitest'

// ────────────────────────────────────────────────────────────────────────────
// Replicated helpers (mirrors route.ts logic exactly)
// ────────────────────────────────────────────────────────────────────────────

/** Garbage names that should be filtered out (from session-importer.ts) */
const GARBAGE_NAMES = new Set([
  'confirmed', 'cancelled', 'canceled', 'no-show', 'noshow', 'pending',
  'beginner', 'intermediate', 'advanced', 'all levels', 'open play', 'clinic',
  'drill', 'league', 'social', 'waitlisted', 'active', 'inactive', 'yes', 'no',
  'true', 'false', 'no show', 'open_play', 'all_levels', 'league_play',
  'round robin', 'round_robin',
])

/** Filter player names — replicates route.ts lines 181-194 */
function filterPlayerNames(names: string[]): string[] {
  return names
    .map(n => n.trim())
    .filter(Boolean)
    .filter(name => {
      const lower = name.toLowerCase()
      if (/^\d+(\.\d+)?$/.test(name)) return false // pure numbers like "4.0"
      if (/^\$?\d/.test(name)) return false         // prices like "$15"
      if (GARBAGE_NAMES.has(lower)) return false
      if (name.length < 2) return false
      if (name.length > 50) return false
      return true
    })
}

/** Case-insensitive player dedup — replicates session-importer.ts lines 111-123 */
function deduplicatePlayerNames(names: string[]): Map<string, string> {
  const result = new Map<string, string>() // lowercase → first-seen form
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length < 2 || trimmed.length > 50) continue
    const lower = trimmed.toLowerCase()
    if (GARBAGE_NAMES.has(lower)) continue
    if (/^\d+(\.\d+)?$/.test(trimmed)) continue
    if (/^\$?\d/.test(trimmed)) continue
    if (result.has(lower)) continue
    result.set(lower, trimmed)
  }
  return result
}

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

/** Session grouping — replicates route.ts lines 223-247 */
function groupSessions(sessions: ParsedSession[]): ParsedSession[] {
  const sessionMap = new Map<string, ParsedSession>()
  for (const s of sessions) {
    const key = `${s.date}|${s.startTime}|${s.court}`
    const existing = sessionMap.get(key)
    if (existing) {
      // Merge player names (deduplicate case-insensitively)
      const existingLower = new Set(existing.playerNames.map(n => n.toLowerCase().trim()))
      for (const name of s.playerNames) {
        const nameLower = name.toLowerCase().trim()
        if (name && !existingLower.has(nameLower)) {
          existing.playerNames.push(name)
          existingLower.add(nameLower)
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
  return Array.from(sessionMap.values())
}

/** Parse price string — replicates route.ts lines 205-210 */
function parsePrice(raw: string | null): number | null {
  if (!raw) return null
  const parsed = parseFloat(raw.replace(/[$,]/g, ''))
  if (isNaN(parsed)) return null
  return parsed
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

// ── Player Name Dedup ──

describe('CSV парсер > Дедупликация имён игроков', () => {
  it('"Ryan OBrien" и "Ryan Obrien" → один игрок (case-insensitive)', () => {
    const names = ['Ryan OBrien', 'Ryan Obrien']
    const deduped = deduplicatePlayerNames(names)
    expect(deduped.size).toBe(1)
    // First-seen form is preserved
    expect(deduped.get('ryan obrien')).toBe('Ryan OBrien')
  })

  it('не создаёт дублирующих записей при разном регистре', () => {
    const names = ['Brian Cooper', 'brian cooper', 'BRIAN COOPER', 'Brian cooper']
    const deduped = deduplicatePlayerNames(names)
    expect(deduped.size).toBe(1)
    expect(deduped.get('brian cooper')).toBe('Brian Cooper')
  })

  it('правильно считает уникальных игроков', () => {
    const names = [
      'Ryan OBrien', 'Ryan Obrien',    // same
      'Brian Cooper', 'Brian cooper',    // same
      'Sarah Johnson',                   // unique
      'Mike Williams', 'mike williams',  // same
    ]
    const deduped = deduplicatePlayerNames(names)
    expect(deduped.size).toBe(4) // Ryan, Brian, Sarah, Mike
  })

  it('дедупликация при группировке сессий (merge two rows)', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Ryan OBrien'],
      },
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Ryan Obrien'], // same player, different case
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped).toHaveLength(1)
    // Should NOT have both — case-insensitive dedup during merge
    expect(grouped[0].playerNames).toHaveLength(1)
    expect(grouped[0].playerNames[0]).toBe('Ryan OBrien')
  })
})

// ── Garbage Name Filtering ──

describe('CSV парсер > Фильтрация мусорных имён', () => {
  it('"Confirmed" → отфильтровано', () => {
    expect(filterPlayerNames(['Confirmed'])).toEqual([])
  })

  it('"Cancelled" → отфильтровано', () => {
    expect(filterPlayerNames(['Cancelled'])).toEqual([])
  })

  it('"4.0" (рейтинг) → отфильтровано', () => {
    expect(filterPlayerNames(['4.0'])).toEqual([])
  })

  it('"$15" (цена) → отфильтровано', () => {
    expect(filterPlayerNames(['$15'])).toEqual([])
  })

  it('"$15.00" (цена с центами) → отфильтровано', () => {
    expect(filterPlayerNames(['$15.00'])).toEqual([])
  })

  it('"waitlisted" → отфильтровано', () => {
    expect(filterPlayerNames(['waitlisted'])).toEqual([])
  })

  it('"active" → отфильтровано', () => {
    expect(filterPlayerNames(['active'])).toEqual([])
  })

  it('"inactive" → отфильтровано', () => {
    expect(filterPlayerNames(['inactive'])).toEqual([])
  })

  it('"3.5" (рейтинг) → отфильтровано', () => {
    expect(filterPlayerNames(['3.5'])).toEqual([])
  })

  it('"15" (чистое число) → отфильтровано', () => {
    expect(filterPlayerNames(['15'])).toEqual([])
  })

  it('"no-show" → отфильтровано', () => {
    expect(filterPlayerNames(['no-show'])).toEqual([])
  })

  it('"pending" → отфильтровано', () => {
    expect(filterPlayerNames(['pending'])).toEqual([])
  })

  it('настоящее имя "Brian Cooper" → проходит', () => {
    expect(filterPlayerNames(['Brian Cooper'])).toEqual(['Brian Cooper'])
  })

  it('настоящее имя "Sarah Johnson" → проходит', () => {
    expect(filterPlayerNames(['Sarah Johnson'])).toEqual(['Sarah Johnson'])
  })

  it('смешанный список — фильтруются только мусорные', () => {
    const input = [
      'Brian Cooper', 'Confirmed', '4.0', '$15', 'waitlisted',
      'Sarah Johnson', 'active', 'inactive', 'Mike Williams',
    ]
    const result = filterPlayerNames(input)
    expect(result).toEqual(['Brian Cooper', 'Sarah Johnson', 'Mike Williams'])
  })

  it('короткие строки (< 2 символов) → отфильтрованы', () => {
    expect(filterPlayerNames(['A', '', ' '])).toEqual([])
  })

  it('длинные строки (> 50 символов) → отфильтрованы', () => {
    const longName = 'A'.repeat(51)
    expect(filterPlayerNames([longName])).toEqual([])
  })
})

// ── Session Grouping ──

describe('CSV парсер > Группировка сессий', () => {
  it('две строки с одинаковыми дата+время+корт → 1 сессия', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Alice Smith'],
      },
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 6, pricePerPlayer: null,
        playerNames: ['Bob Jones'],
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped).toHaveLength(1)
  })

  it('игроки из обеих строк объединяются', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Alice Smith'],
      },
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Bob Jones'],
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped[0].playerNames).toContain('Alice Smith')
    expect(grouped[0].playerNames).toContain('Bob Jones')
    expect(grouped[0].playerNames).toHaveLength(2)
  })

  it('capacity = max из строк (не сумма)', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 6, pricePerPlayer: null,
        playerNames: ['Alice Smith'],
      },
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 10, pricePerPlayer: null,
        playerNames: ['Bob Jones'],
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped[0].capacity).toBe(10)  // max(6, 10) = 10
    expect(grouped[0].capacity).not.toBe(16) // NOT 6 + 10
  })

  it('registered_count = фактическое количество уникальных игроков', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Alice Smith', 'Carol Lee'],
      },
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Bob Jones'],
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped[0].registered).toBe(3) // Alice + Carol + Bob
    expect(grouped[0].playerNames).toHaveLength(3)
  })

  it('разные корты → разные сессии', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Alice Smith'],
      },
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 2', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Bob Jones'],
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped).toHaveLength(2)
  })

  it('разные даты → разные сессии', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Alice Smith'],
      },
      {
        date: '2024-03-16', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Alice Smith'],
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped).toHaveLength(2)
  })

  it('множественное объединение (3 строки → 1 сессия)', () => {
    const base = {
      date: '2024-03-15', startTime: '09:00', endTime: '10:30',
      court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
      registered: 1, capacity: 8, pricePerPlayer: null,
    }
    const sessions: ParsedSession[] = [
      { ...base, playerNames: ['Alice Smith'] },
      { ...base, playerNames: ['Bob Jones'] },
      { ...base, playerNames: ['Carol Lee'] },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped).toHaveLength(1)
    expect(grouped[0].playerNames).toHaveLength(3)
    expect(grouped[0].registered).toBe(3)
  })
})

// ── Price Handling ──

describe('CSV парсер > Обработка цен', () => {
  it('"$15.00" → pricePerSlot = 15', () => {
    expect(parsePrice('$15.00')).toBe(15)
  })

  it('"$25" → pricePerSlot = 25', () => {
    expect(parsePrice('$25')).toBe(25)
  })

  it('"15.00" (без знака $) → pricePerSlot = 15', () => {
    expect(parsePrice('15.00')).toBe(15)
  })

  it('"$1,250.00" (с запятой) → pricePerSlot = 1250', () => {
    expect(parsePrice('$1,250.00')).toBe(1250)
  })

  it('пустая строка → null (не 0)', () => {
    expect(parsePrice('')).toBeNull()
  })

  it('null → null (не 0)', () => {
    expect(parsePrice(null)).toBeNull()
  })

  it('"abc" (не число) → null', () => {
    expect(parsePrice('abc')).toBeNull()
  })

  it('цена сохраняется при группировке, если установлена', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: 15,
        playerNames: ['Alice Smith'],
      },
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Bob Jones'],
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped[0].pricePerPlayer).toBe(15)
  })

  it('null не перезаписывает установленную цену при группировке', () => {
    const sessions: ParsedSession[] = [
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: 20,
        playerNames: ['Alice Smith'],
      },
      {
        date: '2024-03-15', startTime: '09:00', endTime: '10:30',
        court: 'Court 1', format: 'OPEN_PLAY', skillLevel: 'ALL_LEVELS',
        registered: 1, capacity: 8, pricePerPlayer: null,
        playerNames: ['Bob Jones'],
      },
    ]
    const grouped = groupSessions(sessions)
    expect(grouped[0].pricePerPlayer).toBe(20)
  })
})
