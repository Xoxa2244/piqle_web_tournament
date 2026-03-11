/**
 * Inferred Preferences
 *
 * When a member hasn't filled out their UserPlayPreference,
 * we infer preferences from their booking history.
 *
 * Algorithm:
 * 1. Filter to CONFIRMED bookings only
 * 2. Require ≥ 5 bookings (below = too noisy)
 * 3. Count frequency of each day/time-slot/format
 * 4. Include in "preferred" if ≥ 30% of bookings
 * 5. Confidence scales from 30 (5 bookings) to 95 (20+)
 */

import { getDayName, getTimeSlot, clamp } from './scoring'
import type {
  DayOfWeek, TimeSlot, BookingWithSession,
  InferredPreferences, UserPlayPreferenceData, PlaySessionFormat,
} from '../../types/intelligence'

// ── Constants ──

const MIN_BOOKINGS = 5
const FREQUENCY_THRESHOLD = 0.3  // 30% of bookings

// ── Main inference function ──

export function inferPreferencesFromBookings(
  bookings: BookingWithSession[],
): InferredPreferences | null {
  const confirmed = bookings.filter(b => b.status === 'CONFIRMED')

  if (confirmed.length < MIN_BOOKINGS) return null

  // Count frequencies
  const dayCounts = new Map<DayOfWeek, number>()
  const timeCounts = new Map<TimeSlot, number>()
  const formatCounts = new Map<string, number>()

  for (const b of confirmed) {
    const day = getDayName(new Date(b.session.date))
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1)

    const time = getTimeSlot(b.session.startTime)
    timeCounts.set(time, (timeCounts.get(time) || 0) + 1)

    const fmt = b.session.format
    formatCounts.set(fmt, (formatCounts.get(fmt) || 0) + 1)
  }

  const total = confirmed.length
  const threshold = total * FREQUENCY_THRESHOLD

  // Days that appear in ≥ 30% of bookings
  const preferredDays: DayOfWeek[] = []
  dayCounts.forEach((count, day) => {
    if (count >= threshold) preferredDays.push(day)
  })

  // Time slots that appear in ≥ 30% of bookings
  const preferredTimeSlots: Record<TimeSlot, boolean> = {
    morning: (timeCounts.get('morning') || 0) >= threshold,
    afternoon: (timeCounts.get('afternoon') || 0) >= threshold,
    evening: (timeCounts.get('evening') || 0) >= threshold,
  }

  // Formats that appear in ≥ 30% of bookings
  const preferredFormats: string[] = []
  formatCounts.forEach((count, fmt) => {
    if (count >= threshold) preferredFormats.push(fmt)
  })

  // Confidence: scales from 30 (5 bookings) to 95 (20+ bookings)
  const confidence = clamp(Math.round((total / 20) * 100), 30, 95)

  return {
    preferredDays,
    preferredTimeSlots,
    preferredFormats,
    confidence,
    bookingsAnalyzed: total,
  }
}

// ── Convenience: resolve DB preference OR infer from history ──
//
// Returns a full UserPlayPreferenceData so it's directly consumable
// by scoring functions (slot-filler, reactivation, weekly-planner).
// When inferring, we fill in sensible defaults for fields we can't derive
// (targetSessionsPerWeek defaults to 3, skillLevel to ALL_LEVELS).

export function resolvePreferences(
  dbPreference: UserPlayPreferenceData | null,
  bookingsWithSessions: BookingWithSession[],
): UserPlayPreferenceData | null {
  // DB preference takes priority
  if (dbPreference && dbPreference.isActive) {
    return dbPreference
  }

  // Try to infer from booking history
  const inferred = inferPreferencesFromBookings(bookingsWithSessions)
  if (!inferred) return null

  return {
    id: 'inferred',
    userId: dbPreference?.userId || '',
    clubId: dbPreference?.clubId || '',
    preferredDays: inferred.preferredDays,
    preferredTimeSlots: inferred.preferredTimeSlots,
    preferredFormats: inferred.preferredFormats as PlaySessionFormat[],
    skillLevel: 'ALL_LEVELS',
    targetSessionsPerWeek: 3,
    isActive: true,
  }
}
