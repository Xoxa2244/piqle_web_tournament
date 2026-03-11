import {
  MemberData, UserPlayPreferenceData, BookingHistory,
  MemberHealthResult, MemberHealthData, MemberHealthSummary,
  HealthScoreComponent, LifecycleStage, RiskLevel,
  DayOfWeek,
} from '../../types/intelligence';
import { clamp, getDayName, getTimeSlot } from './scoring';

// ── Input Types ──

interface MemberHealthInput {
  member: MemberData;
  preference: UserPlayPreferenceData | null;
  history: BookingHistory;
  joinedAt: Date;
  // Detailed booking dates for pattern analysis
  bookingDates: { date: Date; status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' }[];
  // Bookings in the 30-60 day window (for trend comparison)
  previousPeriodBookings: number;
}

// ── Main Entry Point ──

export function generateMemberHealth(
  members: MemberHealthInput[],
  avgSubscriptionPrice: number = 99, // default $99/month
): MemberHealthData {
  const results = members
    .map(m => calculateHealthScore(m))
    .sort((a, b) => a.healthScore - b.healthScore); // critical first

  const summary = buildSummary(results, avgSubscriptionPrice);

  return { members: results, summary };
}

// ── Health Score Calculation ──

function calculateHealthScore(input: MemberHealthInput): MemberHealthResult {
  const { member, history, joinedAt, bookingDates, previousPeriodBookings } = input;
  const now = new Date();
  const joinedDaysAgo = Math.floor((now.getTime() - joinedAt.getTime()) / 86400000);

  // 1. Frequency Trend (35%)
  const frequencyTrend = scoreFrequencyTrend(history.bookingsLastMonth, previousPeriodBookings);

  // 2. Recency (25%)
  const recency = scoreRecency(history.daysSinceLastConfirmedBooking);

  // 3. Consistency (20%)
  const consistency = scoreConsistency(bookingDates.filter(b => b.status === 'CONFIRMED'));

  // 4. Pattern Break (15%)
  const patternBreak = scorePatternBreak(input.preference, bookingDates, now);

  // 5. No-Show Trend (5%)
  const noShowTrend = scoreNoShowTrend(history);

  // Weighted total
  const healthScore = Math.round(clamp(
    (frequencyTrend.score * frequencyTrend.weight +
     recency.score * recency.weight +
     consistency.score * consistency.weight +
     patternBreak.score * patternBreak.weight +
     noShowTrend.score * noShowTrend.weight) / 100,
    0, 100
  ));

  const riskLevel = getRiskLevel(healthScore);
  const lifecycleStage = getLifecycleStage(healthScore, joinedDaysAgo, history.daysSinceLastConfirmedBooking);

  // Trend: compare current score conceptually to last week
  // Simple heuristic: if recent bookings > previous → improving
  const trend = history.bookingsLastMonth > previousPeriodBookings
    ? 'improving' as const
    : history.bookingsLastMonth < previousPeriodBookings
      ? 'declining' as const
      : 'stable' as const;

  // Top risks
  const topRisks: string[] = [];
  if (frequencyTrend.score < 50) topRisks.push(frequencyTrend.label);
  if (recency.score < 50) topRisks.push(recency.label);
  if (patternBreak.score < 50) topRisks.push(patternBreak.label);
  if (consistency.score < 40) topRisks.push(consistency.label);
  if (noShowTrend.score < 50) topRisks.push(noShowTrend.label);

  // Suggested action
  const suggestedAction = getSuggestedAction(riskLevel, lifecycleStage, topRisks);

  return {
    memberId: member.id,
    member,
    healthScore,
    riskLevel,
    lifecycleStage,
    components: { frequencyTrend, recency, consistency, patternBreak, noShowTrend },
    topRisks: topRisks.slice(0, 3),
    suggestedAction,
    trend,
    daysSinceLastBooking: history.daysSinceLastConfirmedBooking,
    totalBookings: history.totalBookings,
    joinedDaysAgo,
  };
}

// ── Component Scorers ──

function scoreFrequencyTrend(recentBookings: number, previousBookings: number): HealthScoreComponent {
  if (previousBookings === 0 && recentBookings === 0) {
    return { score: 20, weight: 35, label: 'No bookings in the last 60 days' };
  }
  if (previousBookings === 0) {
    return { score: 90, weight: 35, label: `New activity: ${recentBookings} bookings this month` };
  }

  const changePercent = ((recentBookings - previousBookings) / previousBookings) * 100;

  if (changePercent >= 0) {
    return { score: recentBookings >= previousBookings ? 100 : 75, weight: 35, label: `Visit frequency stable or growing (+${Math.round(changePercent)}%)` };
  }
  if (changePercent > -25) {
    return { score: 60, weight: 35, label: `Slight frequency decline (${Math.round(changePercent)}%)` };
  }
  if (changePercent > -50) {
    return { score: 40, weight: 35, label: `Visit frequency down ${Math.abs(Math.round(changePercent))}%` };
  }
  return { score: 15, weight: 35, label: `Significant frequency drop (${Math.round(changePercent)}%)` };
}

function scoreRecency(daysSinceLast: number | null): HealthScoreComponent {
  if (daysSinceLast === null) {
    return { score: 10, weight: 25, label: 'No confirmed bookings on record' };
  }
  if (daysSinceLast <= 3) {
    return { score: 100, weight: 25, label: `Played ${daysSinceLast} day${daysSinceLast === 1 ? '' : 's'} ago` };
  }
  if (daysSinceLast <= 7) {
    return { score: 80, weight: 25, label: `Last played ${daysSinceLast} days ago` };
  }
  if (daysSinceLast <= 14) {
    return { score: 50, weight: 25, label: `${daysSinceLast} days since last session` };
  }
  if (daysSinceLast <= 21) {
    return { score: 25, weight: 25, label: `${daysSinceLast} days inactive — approaching churn` };
  }
  return { score: 0, weight: 25, label: `Inactive for ${daysSinceLast}+ days` };
}

function scoreConsistency(confirmedBookings: { date: Date }[]): HealthScoreComponent {
  if (confirmedBookings.length < 3) {
    return { score: 50, weight: 20, label: 'Not enough history to assess consistency' };
  }

  // Sort by date
  const sorted = [...confirmedBookings].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate intervals between consecutive visits (in days)
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86400000;
    intervals.push(diff);
  }

  // Standard deviation of intervals
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (normalized)
  const cv = mean > 0 ? stdDev / mean : 1;

  if (cv < 0.3) {
    return { score: 100, weight: 20, label: 'Very consistent visit pattern' };
  }
  if (cv < 0.6) {
    return { score: 70, weight: 20, label: 'Moderately consistent visits' };
  }
  if (cv < 1.0) {
    return { score: 40, weight: 20, label: 'Irregular visit pattern' };
  }
  return { score: 20, weight: 20, label: 'Highly irregular visits — no clear pattern' };
}

function scorePatternBreak(
  preference: UserPlayPreferenceData | null,
  bookingDates: { date: Date; status: string }[],
  now: Date,
): HealthScoreComponent {
  if (!preference || preference.preferredDays.length === 0) {
    return { score: 70, weight: 15, label: 'No preferred schedule set — cannot detect pattern breaks' };
  }

  // Look at last 14 days: how many preferred days were missed?
  const last14d = new Date(now.getTime() - 14 * 86400000);
  const recentConfirmed = bookingDates
    .filter(b => b.status === 'CONFIRMED' && b.date >= last14d)
    .map(b => getDayName(b.date));

  const preferredDays = preference.preferredDays as DayOfWeek[];

  // Count how many of the last 2 weeks' preferred days had bookings
  let expectedSlots = 0;
  let missedSlots = 0;
  const missedDayNames: string[] = [];

  for (let d = 0; d < 14; d++) {
    const checkDate = new Date(now.getTime() - d * 86400000);
    const dayName = getDayName(checkDate);
    if (preferredDays.includes(dayName)) {
      expectedSlots++;
      if (!recentConfirmed.includes(dayName)) {
        missedSlots++;
        if (!missedDayNames.includes(dayName)) missedDayNames.push(dayName);
      }
    }
  }

  if (expectedSlots === 0) {
    return { score: 70, weight: 15, label: 'No expected sessions in the last 2 weeks' };
  }

  const missRate = missedSlots / expectedSlots;

  if (missRate === 0) {
    return { score: 100, weight: 15, label: 'Attended all expected sessions' };
  }
  if (missRate <= 0.25) {
    return { score: 75, weight: 15, label: `Missed 1 usual session (${missedDayNames[0]})` };
  }
  if (missRate <= 0.5) {
    return { score: 45, weight: 15, label: `Missed usual ${missedDayNames.slice(0, 2).join(' & ')} sessions` };
  }
  return { score: 15, weight: 15, label: `Missed most expected sessions (${missedDayNames.join(', ')})` };
}

function scoreNoShowTrend(history: BookingHistory): HealthScoreComponent {
  if (history.totalBookings === 0) {
    return { score: 50, weight: 5, label: 'No booking history' };
  }

  const noShowRate = history.noShowCount / history.totalBookings;

  if (noShowRate <= 0.05) {
    return { score: 100, weight: 5, label: 'Excellent reliability — rarely misses' };
  }
  if (noShowRate <= 0.15) {
    return { score: 60, weight: 5, label: `No-show rate ${Math.round(noShowRate * 100)}% — slightly elevated` };
  }
  return { score: 20, weight: 5, label: `High no-show rate (${Math.round(noShowRate * 100)}%) — disengagement signal` };
}

// ── Classification Helpers ──

function getRiskLevel(healthScore: number): RiskLevel {
  if (healthScore >= 75) return 'healthy';
  if (healthScore >= 50) return 'watch';
  if (healthScore >= 25) return 'at_risk';
  return 'critical';
}

function getLifecycleStage(
  healthScore: number,
  joinedDaysAgo: number,
  daysSinceLast: number | null,
): LifecycleStage {
  // Churned overrides everything
  if (daysSinceLast !== null && daysSinceLast >= 21) return 'churned';

  // Tenure-based stages for early members
  if (joinedDaysAgo < 14) return 'onboarding';
  if (joinedDaysAgo < 60) return 'ramping';

  // Health-based for established members
  if (healthScore < 25) return 'critical';
  if (healthScore < 50) return 'at_risk';
  return 'active';
}

function getSuggestedAction(
  riskLevel: RiskLevel,
  stage: LifecycleStage,
  topRisks: string[],
): string {
  if (stage === 'churned') return 'Use Reactivation to send a win-back message';
  if (stage === 'onboarding') return 'Send welcome message with recommended first sessions';
  if (riskLevel === 'critical') return 'Urgent: Send personalized invite before they churn';
  if (riskLevel === 'at_risk') return 'Send targeted invite for their preferred session type';
  if (riskLevel === 'watch') return 'Monitor — consider a check-in message next week';
  return 'No action needed — member is engaged';
}

// ── Summary Builder ──

function buildSummary(
  members: MemberHealthResult[],
  avgSubscriptionPrice: number,
): MemberHealthSummary {
  const total = members.length;
  const healthy = members.filter(m => m.riskLevel === 'healthy').length;
  const watch = members.filter(m => m.riskLevel === 'watch').length;
  const atRisk = members.filter(m => m.riskLevel === 'at_risk').length;
  const critical = members.filter(m => m.riskLevel === 'critical').length;

  const avgHealthScore = total > 0
    ? Math.round(members.reduce((s, m) => s + m.healthScore, 0) / total)
    : 0;

  const revenueAtRisk = (atRisk + critical) * avgSubscriptionPrice;

  return {
    total,
    healthy,
    watch,
    atRisk,
    critical,
    avgHealthScore,
    revenueAtRisk,
    trendVsPrevWeek: 0, // computed externally if needed
  };
}
