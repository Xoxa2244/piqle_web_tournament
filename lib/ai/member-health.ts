import {
  MemberData, UserPlayPreferenceData, BookingHistory,
  MemberHealthResult, MemberHealthData, MemberHealthSummary,
  HealthScoreComponent, LifecycleStage, RiskLevel,
  DayOfWeek,
  ActivityLevel, EngagementTrend, ValueTier, MemberSegment, SegmentLabel, NormalizedMembership,
  TimePref, DayPattern, FormatPref,
} from '../../types/intelligence';
import { clamp, getDayName, getTimeSlot } from './scoring';
import { normalizeMembership } from './membership-intelligence';

// ── Configurable Weights ──

export interface HealthWeights {
  frequencyTrend: number      // default 25 — relative to personal baseline
  recency: number             // default 20
  consistency: number         // default 10
  patternBreak: number        // default 10
  noShowTrend: number         // default 5
  cancelAcceleration: number  // default 15 — strong churn predictor
  sessionDiversity: number    // default 5  — format/time narrowing
  coPlayerLoss: number        // default 10 — social signal
}

export const DEFAULT_WEIGHTS: HealthWeights = {
  frequencyTrend: 25,
  recency: 20,
  consistency: 10,
  patternBreak: 10,
  noShowTrend: 5,
  cancelAcceleration: 15,
  sessionDiversity: 5,
  coPlayerLoss: 10,
}

/** Get weights for a club — reads calibrated weights from settings, falls back to defaults */
export async function getWeights(prisma: any, clubId: string): Promise<HealthWeights> {
  try {
    const settings = await prisma.intelligenceSetting.findFirst({
      where: { clubId },
      select: { goals: true },
    })
    // Calibrated weights stored in goals JSON (e.g. { ..., calibratedWeights: {...} })
    const stored = (settings as any)?.calibratedWeights
    if (stored && typeof stored === 'object') {
      return {
        frequencyTrend: stored.frequencyTrend ?? DEFAULT_WEIGHTS.frequencyTrend,
        recency: stored.recency ?? DEFAULT_WEIGHTS.recency,
        consistency: stored.consistency ?? DEFAULT_WEIGHTS.consistency,
        patternBreak: stored.patternBreak ?? DEFAULT_WEIGHTS.patternBreak,
        noShowTrend: stored.noShowTrend ?? DEFAULT_WEIGHTS.noShowTrend,
        cancelAcceleration: stored.cancelAcceleration ?? DEFAULT_WEIGHTS.cancelAcceleration,
        sessionDiversity: stored.sessionDiversity ?? DEFAULT_WEIGHTS.sessionDiversity,
        coPlayerLoss: stored.coPlayerLoss ?? DEFAULT_WEIGHTS.coPlayerLoss,
      }
    }
  } catch {
    // Settings table may not exist or no settings for this club
  }
  return { ...DEFAULT_WEIGHTS }
}

// ── Input Types ──

export interface BookingWithSession {
  date: Date;
  startTime: string;
  format: string;
  pricePerSlot: number | null;
  status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW';
}

interface MembershipInfo {
  membership: string | null;
  membershipStatus: string | null;
  lastVisit: string | null;
  firstVisit: string | null;
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
  // Membership data from CourtReserve import
  membershipInfo?: MembershipInfo | null;
  // Co-player social graph data (built by getMemberHealth SQL)
  coPlayerActivity?: { activeCoPlayers: number; totalCoPlayers: number };
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
  weights: HealthWeights = DEFAULT_WEIGHTS,
): MemberHealthData {
  // Pass 1: compute health scores + segments (valueTier = placeholder)
  const results = members.map(m => calculateHealthScore(m, weights));

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

function calculateHealthScore(input: MemberHealthInput, weights: HealthWeights = DEFAULT_WEIGHTS): MemberHealthResult {
  const { member, history, joinedAt, bookingDates, previousPeriodBookings } = input;
  const now = new Date();
  const joinedDaysAgo = Math.floor((now.getTime() - joinedAt.getTime()) / 86400000);

  // ── Core Components ──
  const tenureWeeks = Math.max(1, joinedDaysAgo / 7);
  const frequencyTrend = scoreFrequencyTrend(history.bookingsLastMonth, previousPeriodBookings, history.totalBookings, tenureWeeks);
  frequencyTrend.weight = weights.frequencyTrend;

  const recency = scoreRecency(history.daysSinceLastConfirmedBooking);
  recency.weight = weights.recency;

  const consistency = scoreConsistency(bookingDates.filter(b => b.status === 'CONFIRMED'));
  consistency.weight = weights.consistency;

  const patternBreak = scorePatternBreak(input.preference, bookingDates, now);
  patternBreak.weight = weights.patternBreak;

  const noShowTrend = scoreNoShowTrend(history);
  noShowTrend.weight = weights.noShowTrend;

  // ── Level 2 Behavioral Components ──
  const cancelAcceleration = scoreCancelAcceleration(bookingDates);
  cancelAcceleration.weight = weights.cancelAcceleration;

  const sessionDiversity = scoreSessionDiversity(input.bookingsWithSessions);
  sessionDiversity.weight = weights.sessionDiversity;

  const coPlayerLoss = scoreCoPlayerLoss(input.coPlayerActivity);
  coPlayerLoss.weight = weights.coPlayerLoss;

  // Weighted total (7 components, weights sum to 100)
  const allComponents = [frequencyTrend, recency, consistency, patternBreak, noShowTrend, cancelAcceleration, sessionDiversity, coPlayerLoss];
  const totalWeight = allComponents.reduce((s, c) => s + c.weight, 0);
  const healthScore = Math.round(clamp(
    allComponents.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight,
    0, 100
  ));

  const normalizedMembership = normalizeMembership({
    membershipType: input.membershipInfo?.membership || null,
    membershipStatus: input.membershipInfo?.membershipStatus || null,
  });

  // Apply membership tier adjustment — guest/trial/drop-in members churn faster
  const tierWeight = getMembershipTierWeight(normalizedMembership);
  const adjustedScore = Math.round(clamp(healthScore * tierWeight, 0, 100));

  const riskLevel = getRiskLevel(adjustedScore);
  const lifecycleStage = getLifecycleStage(adjustedScore, joinedDaysAgo, history.daysSinceLastConfirmedBooking);

  // Trend: compare current score conceptually to last week
  // Simple heuristic: if recent bookings > previous → improving
  const trend = history.bookingsLastMonth > previousPeriodBookings
    ? 'improving' as const
    : history.bookingsLastMonth < previousPeriodBookings
      ? 'declining' as const
      : 'stable' as const;

  // Top risks — sorted by severity (lowest score first)
  const topRisks: string[] = [];
  const riskComponents = allComponents
    .filter(c => c.score < 50)
    .sort((a, b) => a.score - b.score);
  for (const c of riskComponents) topRisks.push(c.label);

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

  // Add membership tier risk to topRisks if applicable
  if (tierWeight < 1.0 && adjustedScore < healthScore) {
    const tierName = normalizedMembership.rawType || normalizedMembership.normalizedType || 'Guest';
    const shortTier = tierName.length > 30 ? tierName.slice(0, 30) + '…' : tierName;
    topRisks.push(`${shortTier} — higher churn risk tier`);
  }

  // Membership-aware suggested action
  const membershipAction = getMembershipSuggestedAction(normalizedMembership, riskLevel);

  return {
    memberId: member.id,
    member,
    healthScore: adjustedScore,
    rawHealthScore: healthScore,
    riskLevel,
    lifecycleStage,
    components: { frequencyTrend, recency, consistency, patternBreak, noShowTrend, cancelAcceleration, sessionDiversity, coPlayerLoss },
    topRisks: topRisks.slice(0, 3),
    suggestedAction: membershipAction || suggestedAction,
    trend,
    daysSinceLastBooking: history.daysSinceLastConfirmedBooking,
    totalBookings: history.totalBookings,
    joinedDaysAgo,
    segment,
    segmentLabel: buildSegmentLabel(segment),
    avgSessionsPerWeek: Math.round(avgSessionsPerWeek * 10) / 10,
    totalRevenue,
    membershipType: input.membershipInfo?.membership || null,
    membershipStatus: input.membershipInfo?.membershipStatus || null,
    normalizedMembershipType: normalizedMembership.normalizedType,
    normalizedMembershipStatus: normalizedMembership.normalizedStatus,
    membershipConfidence: normalizedMembership.confidence,
    membershipSignal: normalizedMembership.signal,
  };
}

// ── Component Scorers ──

/**
 * Relative frequency: compares recent activity to PERSONAL baseline,
 * not just absolute last-30 vs prev-30. A player who normally plays 1x/month
 * missing 3 weeks is fine; a 5x/week player missing 1 week is a red flag.
 */
function scoreFrequencyTrend(
  recentBookings: number,
  previousBookings: number,
  totalBookings?: number,
  tenureWeeks?: number,
): HealthScoreComponent {
  const w = DEFAULT_WEIGHTS.frequencyTrend; // will be overridden by caller

  if (previousBookings === 0 && recentBookings === 0) {
    return { score: 20, weight: w, label: 'Inactive — no bookings in the last 60 days' };
  }
  if (previousBookings === 0 && recentBookings > 0) {
    return { score: 90, weight: w, label: `New activity: ${recentBookings} session${recentBookings > 1 ? 's' : ''} this month` };
  }

  // Calculate personal baseline: avg sessions per week over tenure
  const baseline = (totalBookings && tenureWeeks && tenureWeeks > 2)
    ? totalBookings / tenureWeeks
    : previousBookings / 4; // fallback: prev month as weekly proxy

  const recentWeekly = recentBookings / 4;
  const ratio = baseline > 0 ? recentWeekly / baseline : 0;

  // Also look at month-over-month change
  const momChange = previousBookings > 0
    ? ((recentBookings - previousBookings) / previousBookings) * 100
    : 0;

  if (ratio >= 0.9) {
    return { score: 100, weight: w, label: `On track — playing at ${Math.round(ratio * 100)}% of usual rate` };
  }
  if (ratio >= 0.7) {
    return { score: 75, weight: w, label: `Slight dip — ${Math.round(ratio * 100)}% of usual rate (${Math.round(momChange)}% MoM)` };
  }
  if (ratio >= 0.5) {
    return { score: 50, weight: w, label: `Declining — ${Math.round(ratio * 100)}% of usual rate (${Math.round(momChange)}% MoM)` };
  }
  if (ratio >= 0.25) {
    return { score: 30, weight: w, label: `Significant drop — ${Math.round(ratio * 100)}% of usual rate` };
  }
  return { score: 10, weight: w, label: `Near inactive — playing at ${Math.round(ratio * 100)}% of usual rate` };
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

// ── Level 2 Behavioral Scorers ──

/**
 * Cancel Acceleration — detects escalating cancellation pattern.
 * A member who goes from 0 cancels → 1 → 3 per month is a stronger
 * churn signal than someone with steady 10% cancel rate.
 */
function scoreCancelAcceleration(
  bookingDates: { date: Date; status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' }[],
): HealthScoreComponent {
  const w = DEFAULT_WEIGHTS.cancelAcceleration;
  if (bookingDates.length < 4) {
    return { score: 75, weight: w, label: 'Not enough booking history to assess' };
  }

  const now = new Date();
  const d14 = new Date(now.getTime() - 14 * 86400000);
  const d28 = new Date(now.getTime() - 28 * 86400000);

  const recent14 = bookingDates.filter(b => b.date >= d14);
  const prev14 = bookingDates.filter(b => b.date >= d28 && b.date < d14);

  const recentCancels = recent14.filter(b => b.status === 'CANCELLED' || b.status === 'NO_SHOW').length;
  const prevCancels = prev14.filter(b => b.status === 'CANCELLED' || b.status === 'NO_SHOW').length;
  const recentTotal = recent14.length;
  const prevTotal = prev14.length;

  const recentRate = recentTotal > 0 ? recentCancels / recentTotal : 0;
  const prevRate = prevTotal > 0 ? prevCancels / prevTotal : 0;

  // No cancels at all → great
  if (recentCancels === 0 && prevCancels === 0) {
    return { score: 100, weight: w, label: '100% reliable — rarely cancels or no-shows' };
  }

  // Cancel rate accelerating → bad sign
  if (recentRate > prevRate && recentCancels >= 2) {
    return { score: 15, weight: w, label: `Cancel rate accelerating — ${Math.round(recentRate * 100)}% (was ${Math.round(prevRate * 100)}%)` };
  }
  if (recentRate > 0.3) {
    return { score: 25, weight: w, label: `High recent cancel rate: ${Math.round(recentRate * 100)}%` };
  }
  if (recentRate > 0.15) {
    return { score: 50, weight: w, label: `Moderate cancel rate: ${Math.round(recentRate * 100)}%` };
  }
  if (recentCancels > 0) {
    return { score: 70, weight: w, label: `Low cancel rate: ${recentCancels} cancel${recentCancels > 1 ? 's' : ''} in 2 weeks` };
  }
  return { score: 85, weight: w, label: 'Cancellation pattern stable' };
}

/**
 * Session Diversity — detects format/time narrowing.
 * A member who used to play Open Play + Drills + Clinics and now only does
 * Open Play is showing reduced engagement breadth = pre-churn signal.
 */
function scoreSessionDiversity(
  bookingsWithSessions?: BookingWithSession[],
): HealthScoreComponent {
  const w = DEFAULT_WEIGHTS.sessionDiversity;
  if (!bookingsWithSessions || bookingsWithSessions.length < 5) {
    return { score: 60, weight: w, label: 'Not enough sessions to assess diversity' };
  }

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);

  const confirmed = bookingsWithSessions.filter(b => b.status === 'CONFIRMED');
  const recent = confirmed.filter(b => b.date >= d30);
  const prev = confirmed.filter(b => b.date >= d60 && b.date < d30);

  // Count unique formats and time slots
  const recentFormats = new Set(recent.map(b => b.format)).size;
  const prevFormats = new Set(prev.map(b => b.format)).size;
  const recentTimes = new Set(recent.map(b => getTimeSlot(b.startTime))).size;
  const prevTimes = new Set(prev.map(b => getTimeSlot(b.startTime))).size;

  // If no recent activity, can't assess diversity
  if (recent.length === 0) {
    return { score: 30, weight: w, label: 'No recent sessions — cannot assess diversity' };
  }
  if (prev.length === 0) {
    // New member, can't compare
    return { score: 70, weight: w, label: `Playing ${recentFormats} format${recentFormats > 1 ? 's' : ''} across ${recentTimes} time slot${recentTimes > 1 ? 's' : ''}` };
  }

  // Diversity narrowing check
  const formatDrop = prevFormats > 0 && recentFormats < prevFormats;
  const timeDrop = prevTimes > 0 && recentTimes < prevTimes;

  if (formatDrop && timeDrop) {
    return { score: 25, weight: w, label: `Narrowing — dropped from ${prevFormats} formats to ${recentFormats}, ${prevTimes} time slots to ${recentTimes}` };
  }
  if (formatDrop) {
    return { score: 45, weight: w, label: `Format narrowing — ${prevFormats} formats → ${recentFormats}` };
  }
  if (timeDrop) {
    return { score: 50, weight: w, label: `Time narrowing — ${prevTimes} time slots → ${recentTimes}` };
  }
  if (recentFormats >= prevFormats && recentTimes >= prevTimes) {
    return { score: 100, weight: w, label: `Engaged across ${recentFormats} format${recentFormats > 1 ? 's' : ''} and ${recentTimes} time slot${recentTimes > 1 ? 's' : ''}` };
  }
  return { score: 75, weight: w, label: 'Session diversity stable' };
}

/**
 * Co-Player Network Loss — social signal.
 * If a member's regular playing partners stop showing up,
 * the member is much more likely to churn too.
 */
function scoreCoPlayerLoss(
  coPlayerActivity?: { activeCoPlayers: number; totalCoPlayers: number },
): HealthScoreComponent {
  const w = DEFAULT_WEIGHTS.coPlayerLoss;
  if (!coPlayerActivity || coPlayerActivity.totalCoPlayers === 0) {
    return { score: 50, weight: w, label: 'No co-player data available' };
  }

  const { activeCoPlayers, totalCoPlayers } = coPlayerActivity;
  const activeRate = activeCoPlayers / totalCoPlayers;

  if (activeRate >= 0.8) {
    return { score: 100, weight: w, label: `${activeCoPlayers}/${totalCoPlayers} regular partners still active` };
  }
  if (activeRate >= 0.6) {
    return { score: 70, weight: w, label: `${totalCoPlayers - activeCoPlayers} of ${totalCoPlayers} partners becoming inactive` };
  }
  if (activeRate >= 0.3) {
    return { score: 40, weight: w, label: `Most partners inactive — only ${activeCoPlayers} of ${totalCoPlayers} still playing` };
  }
  return { score: 15, weight: w, label: `Social circle gone — ${totalCoPlayers - activeCoPlayers} of ${totalCoPlayers} partners churned` };
}

// ── Membership Tier Helpers ──

function getMembershipTierWeight(membership: NormalizedMembership): number {
  if (membership.signal === 'missing') return 0.7;
  if (membership.normalizedStatus === 'none' || membership.normalizedStatus === 'guest') return 0.7;
  if (membership.normalizedStatus === 'trial') return 0.75;

  switch (membership.normalizedType) {
    case 'guest':
    case 'drop_in':
      return 0.7;
    case 'trial':
      return 0.75;
    case 'package':
      return 0.85;
    case 'monthly':
    case 'discounted':
      return 0.9;
    case 'unlimited':
    case 'insurance':
    case 'staff':
      return 1.0;
    default:
      return membership.signal === 'strong' ? 0.9 : 0.8;
  }
}

function getMembershipSuggestedAction(
  membership: NormalizedMembership,
  riskLevel: RiskLevel,
): string | null {
  if (membership.signal === 'missing') return null;

  if (membership.normalizedStatus === 'suspended') return 'Membership frozen — send "Welcome back" unfreeze campaign';
  if (membership.normalizedStatus === 'expired' || membership.normalizedStatus === 'cancelled') {
    return 'Membership expired — send renewal offer with discount';
  }
  if (membership.normalizedStatus === 'none' || membership.normalizedStatus === 'guest') {
    return 'No membership — send trial/first-month-free offer';
  }

  // Active members: tier-specific suggestions
  if (riskLevel === 'at_risk' || riskLevel === 'critical') {
    if (membership.normalizedType === 'guest' || membership.normalizedType === 'drop_in') {
      return 'Guest Pass member disengaging — suggest upgrade to monthly pass';
    }
    if (membership.normalizedType === 'monthly' || membership.normalizedType === 'discounted') {
      return 'Monthly member at risk — send personal check-in + invite to upcoming event';
    }
    if (membership.normalizedType === 'unlimited' || membership.normalizedType === 'insurance' || membership.normalizedType === 'staff') {
      return 'High-value VIP disengaging — manager should call personally';
    }
  }
  return null;
}

// ── Classification Helpers ──

function getRiskLevel(healthScore: number): RiskLevel {
  if (healthScore >= 60) return 'healthy';
  if (healthScore >= 35) return 'watch';
  if (healthScore >= 15) return 'at_risk';
  return 'critical';
}

function getLifecycleStage(
  healthScore: number,
  joinedDaysAgo: number,
  daysSinceLast: number | null,
): LifecycleStage {
  // Churned overrides everything — 45 days without play signals true churn
  if (daysSinceLast !== null && daysSinceLast >= 45) return 'churned';

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

  // Separate churned (45+ days inactive) from at-risk/critical
  // These are members who already left — not "at risk of leaving"
  const churned = members.filter(m => m.lifecycleStage === 'churned').length;
  const activeMembers = members.filter(m => m.lifecycleStage !== 'churned');

  const healthy = activeMembers.filter(m => m.riskLevel === 'healthy').length;
  const watch = activeMembers.filter(m => m.riskLevel === 'watch').length;
  const atRisk = activeMembers.filter(m => m.riskLevel === 'at_risk').length;
  const critical = activeMembers.filter(m => m.riskLevel === 'critical').length;

  const avgHealthScore = total > 0
    ? Math.round(members.reduce((s, m) => s + m.healthScore, 0) / total)
    : 0;

  // Revenue at risk = only active members who might churn, not already churned
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
    churned,
    avgHealthScore,
    revenueAtRisk,
    trendVsPrevWeek: 0,
    byActivity,
    byTrend,
    byValue,
  };
}
