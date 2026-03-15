/**
 * ML Data Collection Layer
 *
 * Collects feature vectors for future ML churn prediction model.
 * Phase 1: Extract features from existing data.
 * Phase 2 (future): Train Logistic Regression → Random Forest on labeled snapshots.
 */

import { BookingHistory, UserPlayPreferenceData, MLFeatureVector } from '../../types/intelligence';

interface MLInput {
  joinedAt: Date;
  history: BookingHistory;
  preference: UserPlayPreferenceData | null;
  bookingDates: { date: Date; status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' }[];
}

/**
 * Extract ML feature vector from member data.
 * These features will be stored in MemberHealthSnapshot.features for future model training.
 */
export function extractMLFeatures(input: MLInput): MLFeatureVector {
  const now = new Date();
  const { joinedAt, history, preference, bookingDates } = input;

  const tenureMonths = (now.getTime() - joinedAt.getTime()) / (30 * 86400000);
  const daysSinceLastBooking = history.daysSinceLastConfirmedBooking ?? 999;

  // Booking counts by period
  const confirmed = bookingDates.filter(b => b.status === 'CONFIRMED');
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);

  const bookingsLast30d = confirmed.filter(b => b.date >= d30).length;
  const bookingsLast60d = confirmed.filter(b => b.date >= d60).length;
  const bookingsLast90d = confirmed.filter(b => b.date >= d90).length;

  // Average bookings per week (over last 90 days or tenure, whichever is shorter)
  const activeWeeks = Math.max(1, Math.min(tenureMonths * 4.33, 13)); // up to 13 weeks
  const avgBookingsPerWeek = bookingsLast90d / activeWeeks;

  // Frequency change: last 30d vs previous 30d
  const bookings30to60 = confirmed.filter(b => b.date >= d60 && b.date < d30).length;
  const frequencyChangePercent = bookings30to60 > 0
    ? ((bookingsLast30d - bookings30to60) / bookings30to60) * 100
    : bookingsLast30d > 0 ? 100 : 0;

  // Behavioral
  const noShowRate = history.totalBookings > 0 ? history.noShowCount / history.totalBookings : 0;
  const cancellationRate = history.totalBookings > 0 ? history.cancelledCount / history.totalBookings : 0;
  const hasPreferencesSet = !!(preference && preference.preferredDays.length > 0);

  // Consistency (std dev of intervals)
  const sorted = [...confirmed].sort((a, b) => a.date.getTime() - b.date.getTime());
  let consistencyScore = 50;
  if (sorted.length >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push((sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86400000);
    }
    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    consistencyScore = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
  }

  // Pattern breaks: missed preferred days in last 14 days
  let patternBreakCount = 0;
  if (preference && preference.preferredDays.length > 0) {
    const last14d = new Date(now.getTime() - 14 * 86400000);
    const recentDays = new Set(confirmed.filter(b => b.date >= last14d).map(b => b.date.getDay()));
    const dayMap: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    for (const day of preference.preferredDays) {
      const dayNum = dayMap[day];
      if (dayNum !== undefined && !recentDays.has(dayNum)) {
        patternBreakCount++;
      }
    }
  }

  return {
    tenureMonths: Math.round(tenureMonths * 10) / 10,
    daysSinceLastBooking,
    bookingsLast30d,
    bookingsLast60d,
    bookingsLast90d,
    avgBookingsPerWeek: Math.round(avgBookingsPerWeek * 100) / 100,
    frequencyChangePercent: Math.round(frequencyChangePercent),
    noShowRate: Math.round(noShowRate * 1000) / 1000,
    cancellationRate: Math.round(cancellationRate * 1000) / 1000,
    hasPreferencesSet,
    consistencyScore,
    patternBreakCount,
  };
}
