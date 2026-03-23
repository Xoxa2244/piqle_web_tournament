import {
  MemberData, UserPlayPreferenceData, PlaySessionData, BookingHistory,
  ReactivationCandidate, RecommendationScore, ScoreComponent
} from '../../types/intelligence';
import { inferSkillLevel, isAdjacentSkillLevel, getDayName, getTimeSlot, clamp } from './scoring';

interface ReactivationInput {
  members: Array<{
    member: MemberData;
    preference: UserPlayPreferenceData | null;
    history: BookingHistory;
  }>;
  upcomingSessions: PlaySessionData[];
  inactivityThresholdDays?: number; // default 21
}

export function generateReactivationCandidates(input: ReactivationInput): ReactivationCandidate[] {
  const threshold = input.inactivityThresholdDays ?? 21;

  const candidates = input.members
    .filter(({ history }) => {
      const days = history.daysSinceLastConfirmedBooking;
      return days === null || days >= threshold;
    })
    .map(({ member, preference, history }) => {
      const scoring = scoreReactivation(member, preference, history, input.upcomingSessions);
      const suggestedSessions = findMatchingSessions(member, preference, input.upcomingSessions).slice(0, 3);
      return {
        member,
        daysSinceLastActivity: history.daysSinceLastConfirmedBooking ?? 999,
        totalHistoricalBookings: history.totalBookings,
        score: scoring.score,
        reasoning: scoring,
        suggestedSessions,
        preference: preference ?? null,
        bookingHistory: history,
      };
    })
    .sort((a, b) => b.score - a.score);

  return candidates;
}

function scoreReactivation(
  member: MemberData,
  preference: UserPlayPreferenceData | null,
  history: BookingHistory,
  upcomingSessions: PlaySessionData[]
): RecommendationScore {
  const components: Record<string, ScoreComponent> = {};

  // ── RFM+ Model ──

  // ── Recency (25%) — days since last session ──
  const daysSince = history.daysSinceLastConfirmedBooking ?? 365;
  let recencyScore: number;
  let recencyExpl: string;
  if (daysSince <= 3) { recencyScore = 100; recencyExpl = `Last session ${daysSince} day(s) ago — very recent`; }
  else if (daysSince <= 7) { recencyScore = 80; recencyExpl = `Last session ${daysSince} days ago — recently active`; }
  else if (daysSince <= 14) { recencyScore = 60; recencyExpl = `Last session ${daysSince} days ago — starting to drift`; }
  else if (daysSince <= 30) { recencyScore = 35; recencyExpl = `Last session ${daysSince} days ago — re-engage soon`; }
  else if (daysSince <= 60) { recencyScore = 15; recencyExpl = `Last session ${daysSince} days ago — significant gap`; }
  else { recencyScore = 5; recencyExpl = `Last session ${daysSince}+ days ago — long-term inactive`; }
  components.recency = { score: recencyScore, weight: 25, explanation: recencyExpl };

  // ── Frequency (25%) — sessions per month ──
  const sessionsPerMonth = history.bookingsLastMonth;
  let frequencyScore: number;
  let frequencyExpl: string;
  if (sessionsPerMonth >= 8) { frequencyScore = 100; frequencyExpl = `${sessionsPerMonth} sessions/mo — power user`; }
  else if (sessionsPerMonth >= 5) { frequencyScore = 80; frequencyExpl = `${sessionsPerMonth} sessions/mo — highly active`; }
  else if (sessionsPerMonth >= 3) { frequencyScore = 60; frequencyExpl = `${sessionsPerMonth} sessions/mo — regular player`; }
  else if (sessionsPerMonth >= 1) { frequencyScore = 35; frequencyExpl = `${sessionsPerMonth} session(s)/mo — occasional player`; }
  else { frequencyScore = 5; frequencyExpl = 'No sessions this month'; }
  components.frequency = { score: frequencyScore, weight: 25, explanation: frequencyExpl };

  // ── Trend (25%) — compare last 14 days vs previous 14 days ──
  // Approximate using bookingsLastWeek (≈last 7d) vs (bookingsLastMonth − bookingsLastWeek) / 2 for the prior 14d average
  const recentPeriod = history.bookingsLastWeek * 2; // extrapolate last week to 14 days
  const priorPeriod = Math.max(history.bookingsLastMonth - history.bookingsLastWeek, 0); // remaining ~3 weeks, scale down
  const priorNormalized = priorPeriod > 0 ? (priorPeriod / 3) * 2 : 0; // normalize to ~14-day equivalent
  const trendRatio = priorNormalized > 0 ? recentPeriod / priorNormalized : (recentPeriod > 0 ? 2.0 : 0);
  let trendScore: number;
  let trendExpl: string;
  if (trendRatio > 1.2) { trendScore = 100; trendExpl = `Activity growing (ratio ${trendRatio.toFixed(1)}×) — momentum building`; }
  else if (trendRatio >= 0.8) { trendScore = 70; trendExpl = `Activity stable (ratio ${trendRatio.toFixed(1)}×)`; }
  else if (trendRatio >= 0.3) { trendScore = 30; trendExpl = `Activity declining (ratio ${trendRatio.toFixed(1)}×) — engagement dropping`; }
  else { trendScore = 5; trendExpl = 'Activity stopped — needs immediate attention'; }
  components.trend = { score: trendScore, weight: 25, explanation: trendExpl };

  // ── Consistency (15%) — regularity of play ──
  // Approximate from available data: if they play frequently and recently, consistency is likely high
  let consistencyScore: number;
  let consistencyExpl: string;
  if (history.totalBookings < 3) {
    consistencyScore = 50; consistencyExpl = 'Not enough data to assess consistency';
  } else {
    // Estimate average gap: total days of membership / totalBookings
    // Use daysSince + rough estimate of active period
    const avgGap = history.totalBookings > 0 ? 30 / Math.max(sessionsPerMonth, 0.5) : 30;
    const variance = Math.abs(avgGap - (daysSince > 0 ? daysSince : avgGap));
    if (variance < 2) { consistencyScore = 100; consistencyExpl = 'Very consistent schedule — plays regularly'; }
    else if (variance < 5) { consistencyScore = 70; consistencyExpl = 'Fairly consistent play pattern'; }
    else if (variance < 10) { consistencyScore = 40; consistencyExpl = 'Irregular play pattern — sporadic visits'; }
    else { consistencyScore = 15; consistencyExpl = 'Highly irregular — unpredictable schedule'; }
  }
  components.consistency = { score: consistencyScore, weight: 15, explanation: consistencyExpl };

  // ── Reliability (10%) — 1 − (cancellations + no-shows) / totalBookings ──
  let reliabScore: number;
  let reliabExpl: string;
  if (history.totalBookings === 0) {
    reliabScore = 50; reliabExpl = 'No booking history to assess reliability';
  } else {
    const reliabilityRate = 1 - (history.cancelledCount + history.noShowCount) / history.totalBookings;
    if (reliabilityRate >= 0.95) { reliabScore = 100; reliabExpl = `${Math.round(reliabilityRate * 100)}% reliable — rarely cancels or no-shows`; }
    else if (reliabilityRate >= 0.80) { reliabScore = 80; reliabExpl = `${Math.round(reliabilityRate * 100)}% reliable — generally dependable`; }
    else if (reliabilityRate >= 0.60) { reliabScore = 50; reliabExpl = `${Math.round(reliabilityRate * 100)}% reliable — frequent cancellations`; }
    else { reliabScore = 20; reliabExpl = `${Math.round(reliabilityRate * 100)}% reliable — high cancellation/no-show rate`; }
  }
  components.reliability = { score: reliabScore, weight: 10, explanation: reliabExpl };

  // ── Weighted Total ──
  let total = 0;
  for (const c of Object.values(components)) { total += (c.score * c.weight) / 100; }
  total = Math.round(clamp(total, 0, 100));

  const name = member.name || member.email;
  const topFactors = Object.entries(components)
    .map(([, c]) => ({ ws: (c.score * c.weight) / 100, explanation: c.explanation }))
    .sort((a, b) => b.ws - a.ws)
    .slice(0, 2);

  const summary = `${name}: Reactivation score ${total}/100. ${topFactors.map(f => f.explanation).join('. ')}.`;

  return { score: total, components, summary };
}

function findMatchingSessions(
  member: MemberData,
  preference: UserPlayPreferenceData | null,
  sessions: PlaySessionData[]
): PlaySessionData[] {
  if (!preference) return sessions.slice(0, 3);

  const memberSkill = inferSkillLevel(member.duprRatingDoubles ? Number(member.duprRatingDoubles) : null);

  return sessions
    .filter(s => s.status === 'SCHEDULED')
    .filter(s => {
      const skillMatch = s.skillLevel === 'ALL_LEVELS' || s.skillLevel === memberSkill || isAdjacentSkillLevel(memberSkill, s.skillLevel);
      const dayMatch = preference.preferredDays.length === 0 || preference.preferredDays.includes(getDayName(s.date));
      return skillMatch && dayMatch;
    })
    .slice(0, 5);
}
