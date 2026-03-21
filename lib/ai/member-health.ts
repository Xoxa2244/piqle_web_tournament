import {
  MemberData, UserPlayPreferenceData, BookingHistory,
  MemberHealthResult, MemberHealthData, MemberHealthSummary,
  HealthScoreComponent, LifecycleStage, RiskLevel,
  DayOfWeek,
  ActivityLevel, EngagementTrend, ValueTier, MemberSegment, SegmentLabel,
  TimePref, DayPattern, FormatPref,
} from '../../types/intelligence';
import { clamp, getDayName, getTimeSlot } from './scoring';

// ── Input Types ──

export interface BookingWithSession {
  date: Date;
  startTime: string;
  format: string;
  pricePerSlot: number | null;
  status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW';
}

interface MemberHealthInput {
  member: MemberData;
  preference: UserPlayPreferenceData | null;
  history: BookingHistory;
  joinedAt: Date;
  bookingDates: { date: Date; status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' }[];
  previousPeriodBookings: number;
  // Extended: session-level data for segmentation
  bookingsWithSessions?: BookingWithSession[];
}

// ── Segmentation Classifiers ──

function classifyActivityLevel(confirmedLast30: number, daySpan: number = 30): ActivityLevel {
  const sessionsPerWeek = daySpan < 7
    ? confirmedLast30
    : confirmedLast30 / (daySpan / 7)
  if (sessionsPerWeek >= 4) return 'power'
  if (sessionsPerWeek >= 2) return 'regular'
  if (sessionsPerWeek >= 0.5) return 'casual'
  return 'occasional'
}

function classifyEngagementTrend(last30: number, prev30: number, daysSinceLast: number | null): EngagementTrend {
  if (daysSinceLast != null && daysSinceLast >= 21) return 'churning'
  if (prev30 === 0 && last30 > 0) return 'growing'
  if (prev30 === 0 && last30 === 0) return 'churning'
  const changePct = ((last30 - prev30) / Math.max(prev30, 1)) * 100
  if (changePct > 15) return 'growing'
  if (changePct < -15) return 'declining'
  return 'stable'
}

function classifyValueTier(revenue: number, allRevenues: number[]): ValueTier {
  if (allRevenues.length === 0 || allRevenues.every(r => r === 0)) return 'low'
  const sorted = [...allRevenues].sort((a, b) => b - a) // descending
  const rank = sorted.findIndex(r => r <= revenue)
  const percentile = (rank >= 0 ? rank : sorted.length) / sorted.length
  // percentile 0 = top, 1 = bottom (descending sort)
  if (percentile < 0.2) return 'high'    // top 20%
  if (percentile >= 0.8) return 'low'     // bottom 20%
  return 'medium'                          // middle 60%
}

function classifyBehavioral(bookings: BookingWithSession[]): MemberSegment['behavioral'] {
  const confirmed = bookings.filter(b => b.status === 'CONFIRMED')
  if (confirmed.length < 3) return { timePreference: 'mixed', dayPattern: 'both', formatPreference: 'mixed' }

  // Time preference
  const timeCounts: Record<string, number> = { morning: 0, afternoon: 0, evening: 0 }
  for (const b of confirmed) {
    const slot = getTimeSlot(b.startTime)
    timeCounts[slot] = (timeCounts[slot] || 0) + 1
  }
  const topTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0]
  const timePreference: TimePref = topTime && topTime[1] / confirmed.length >= 0.5
    ? topTime[0] as TimePref : 'mixed'

  // Day pattern
  let weekday = 0, weekend = 0
  for (const b of confirmed) {
    const day = b.date.getDay()
    if (day === 0 || day === 6) weekend++; else weekday++
  }
  const dayPattern: DayPattern = weekday / confirmed.length >= 0.7 ? 'weekday'
    : weekend / confirmed.length >= 0.5 ? 'weekend' : 'both'

  // Format preference
  const fmtCounts: Record<string, number> = {}
  for (const b of confirmed) {
    const fmt = normalizeFormat(b.format)
    fmtCounts[fmt] = (fmtCounts[fmt] || 0) + 1
  }
  const topFmt = Object.entries(fmtCounts).sort((a, b) => b[1] - a[1])[0]
  const formatPreference: FormatPref = topFmt && topFmt[1] / confirmed.length >= 0.5
    ? topFmt[0] as FormatPref : 'mixed'

  return { timePreference, dayPattern, formatPreference }
}

function normalizeFormat(format: string): string {
  const map: Record<string, string> = {
    'OPEN_PLAY': 'Open Play', 'LEAGUE_PLAY': 'League', 'LEAGUE': 'League',
    'DRILL': 'Drill', 'CLINIC': 'Clinic', 'SOCIAL': 'Social',
    'TOURNAMENT': 'Tournament', 'LADDER': 'Ladder', 'ROUND_ROBIN': 'Round Robin',
  }
  return map[format.toUpperCase()] || format
}

function buildSegmentLabel(segment: MemberSegment): SegmentLabel {
  const activityLabels: Record<ActivityLevel, string> = { power: 'Power Player', regular: 'Regular', casual: 'Casual', occasional: 'Occasional' }
  const riskLabels: Record<RiskLevel, string> = { healthy: 'Healthy', watch: 'Watch', at_risk: 'At-Risk', critical: 'Critical' }
  const trendIcons: Record<EngagementTrend, SegmentLabel['trendIcon']> = { growing: 'up', stable: 'stable', declining: 'down', churning: 'inactive' }
  const valueLabels: Record<ValueTier, string> = { high: 'High LTV', medium: 'Mid', low: 'Low' }

  return {
    primary: activityLabels[segment.activityLevel],
    riskBadge: riskLabels[segment.risk],
    trendIcon: trendIcons[segment.trend],
    valueBadge: valueLabels[segment.valueTier],
  }
}

// ── Main Entry Point ──

export function generateMemberHealth(
  members: MemberHealthInput[],
  avgSubscriptionPrice: number = 99, // default $99/month
): MemberHealthData {
  // Pass 1: compute health scores + segments (valueTier = placeholder)
  const results = members.map(m => calculateHealthScore(m));

  // Pass 2: classify value tier based on revenue distribution
  const revenues = results.map(r => r.totalRevenue || 0)
  for (const r of results) {
    if (r.segment) {
      r.segment.valueTier = classifyValueTier(r.totalRevenue || 0, revenues)
      r.segmentLabel = buildSegmentLabel(r.segment)
    }
  }

  results.sort((a, b) => a.healthScore - b.healthScore); // critical first

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

  // ── Multi-dimensional segmentation ──
  const bws = input.bookingsWithSessions || []
  const confirmedBws = bws.filter(b => b.status === 'CONFIRMED')
  const totalRevenue = confirmedBws.reduce((sum, b) => sum + (b.pricePerSlot || 0), 0)
  const avgSessionsPerWeek = joinedDaysAgo > 0 ? (history.totalBookings / (joinedDaysAgo / 7)) : 0

  const segment: MemberSegment = {
    activityLevel: classifyActivityLevel(history.bookingsLastMonth),
    risk: riskLevel,
    trend: classifyEngagementTrend(history.bookingsLastMonth, previousPeriodBookings, history.daysSinceLastConfirmedBooking),
    valueTier: 'medium', // placeholder — set in 2nd pass by generateMemberHealth
    behavioral: classifyBehavioral(bws),
  }

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
    segment,
    segmentLabel: buildSegmentLabel(segment),
    avgSessionsPerWeek: Math.round(avgSessionsPerWeek * 10) / 10,
    totalRevenue,
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

  // Segment distribution counts
  const byActivity: Record<ActivityLevel, number> = { power: 0, regular: 0, casual: 0, occasional: 0 }
  const byTrend: Record<EngagementTrend, number> = { growing: 0, stable: 0, declining: 0, churning: 0 }
  const byValue: Record<ValueTier, number> = { high: 0, medium: 0, low: 0 }
  for (const m of members) {
    if (m.segment) {
      byActivity[m.segment.activityLevel]++
      byTrend[m.segment.trend]++
      byValue[m.segment.valueTier]++
    }
  }

  return {
    total,
    healthy,
    watch,
    atRisk,
    critical,
    avgHealthScore,
    revenueAtRisk,
    trendVsPrevWeek: 0,
    byActivity,
    byTrend,
    byValue,
  };
}
