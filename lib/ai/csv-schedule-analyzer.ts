/**
 * CSV Schedule Analyzer
 *
 * Extracts intelligence parameters from parsed CSV session data:
 *   - operatingDays   — unique days of week with sessions
 *   - operatingHours  — { open: min(startTime), close: max(endTime) }
 *   - peakHours       — 3-hour block with the most sessions
 *   - typicalSessionDurationMinutes — median session duration
 *   - formats         — unique session formats found
 */

import type { DayOfWeek } from '../../types/intelligence'

export interface CsvSessionRow {
  date: string       // "YYYY-MM-DD"
  startTime: string  // "HH:MM"
  endTime: string    // "HH:MM"
  format: string     // "OPEN_PLAY", "CLINIC", etc.
}

export interface ScheduleAnalysis {
  operatingDays: DayOfWeek[]
  operatingHours: { open: string; close: string }
  peakHours: { start: string; end: string }
  typicalSessionDurationMinutes: number
  formats: string[]
  sessionCount: number
}

const DAY_NAMES: DayOfWeek[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

// ── Helpers ──

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Main analyzer ──

export function analyzeSchedule(sessions: CsvSessionRow[]): ScheduleAnalysis | null {
  if (sessions.length === 0) return null

  // 1. Operating days — unique days of week
  const daySet = new Set<DayOfWeek>()
  for (const s of sessions) {
    const d = new Date(s.date + 'T12:00:00')
    if (!isNaN(d.getTime())) {
      daySet.add(DAY_NAMES[d.getDay()])
    }
  }
  const operatingDays = DAY_NAMES.filter(d => daySet.has(d))

  // 2. Operating hours — earliest start, latest end
  let minStart = Infinity
  let maxEnd = -Infinity
  const durations: number[] = []
  const hourBuckets = new Map<number, number>() // hour → session count

  for (const s of sessions) {
    const startMins = timeToMinutes(s.startTime)
    const endMins = timeToMinutes(s.endTime)

    if (startMins < minStart) minStart = startMins
    if (endMins > maxEnd) maxEnd = endMins

    // Duration
    const dur = endMins - startMins
    if (dur > 0 && dur <= 480) durations.push(dur)

    // Count sessions by hour for peak detection
    const startHour = Math.floor(startMins / 60)
    hourBuckets.set(startHour, (hourBuckets.get(startHour) || 0) + 1)
  }

  const operatingHours = {
    open: minStart === Infinity ? '07:00' : minutesToTime(minStart),
    close: maxEnd === -Infinity ? '21:00' : minutesToTime(maxEnd),
  }

  // 3. Peak hours — find 3-hour window with most sessions
  let bestPeakStart = 17 // default 5pm
  let bestPeakCount = 0
  for (let h = 6; h <= 20; h++) {
    const count = (hourBuckets.get(h) || 0) +
                  (hourBuckets.get(h + 1) || 0) +
                  (hourBuckets.get(h + 2) || 0)
    if (count > bestPeakCount) {
      bestPeakCount = count
      bestPeakStart = h
    }
  }
  const peakHours = {
    start: minutesToTime(bestPeakStart * 60),
    end: minutesToTime((bestPeakStart + 3) * 60),
  }

  // 4. Typical session duration — median
  durations.sort((a, b) => a - b)
  const typicalSessionDurationMinutes = durations.length > 0
    ? durations[Math.floor(durations.length / 2)]
    : 90

  // 5. Formats — unique
  const formatSet = new Set<string>()
  for (const s of sessions) {
    if (s.format) formatSet.add(s.format)
  }

  return {
    operatingDays,
    operatingHours,
    peakHours,
    typicalSessionDurationMinutes,
    formats: Array.from(formatSet),
    sessionCount: sessions.length,
  }
}
