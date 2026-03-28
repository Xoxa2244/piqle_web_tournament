import {
  MemberData, UserPlayPreferenceData, PlaySessionData, BookingHistory,
  ReactivationCandidate, RecommendationScore, ScoreComponent, ScoredSession,
  BookingWithSession, ChurnReason, BookingStatus, TimeSlot, DayOfWeek,
} from '../../types/intelligence';
import { inferSkillLevel, isAdjacentSkillLevel, getDayName, getTimeSlot, getFormatLabel, getTimeSlotLabel, clamp } from './scoring';

interface ReactivationInput {
  members: Array<{
    member: MemberData;
    preference: UserPlayPreferenceData | null;
    history: BookingHistory;
    bookings?: BookingWithSession[];
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
    .map(({ member, preference, history, bookings }) => {
      const scoring = scoreReactivation(member, preference, history, input.upcomingSessions);
      const scoredSessions = scoreSessionsByPreference(member, preference, input.upcomingSessions);
      const topMatch = scoredSessions[0] ?? null;
      const suggestedSessions = scoredSessions.map(s => s.session).slice(0, 3);
      const suggestedAction = topMatch
        ? topMatch.explanation
        : 'Send personalized win-back message';

      const churnReasons = analyzeChurnReasons(history, bookings ?? []);

      return {
        member,
        daysSinceLastActivity: history.daysSinceLastConfirmedBooking ?? 999,
        totalHistoricalBookings: history.totalBookings,
        score: scoring.score,
        reasoning: scoring,
        suggestedSessions,
        scoredSessions: scoredSessions.slice(0, 3),
        suggestedAction,
        churnReasons,
        preference: preference ?? null,
        bookingHistory: history,
      };
    })
    .sort((a, b) => {
      // Sort by risk first (high < 30, medium 30-59, low 60+), then by days inactive desc
      const riskA = a.score < 30 ? 0 : a.score < 60 ? 1 : 2;
      const riskB = b.score < 30 ? 0 : b.score < 60 ? 1 : 2;
      if (riskA !== riskB) return riskA - riskB;
      return b.daysSinceLastActivity - a.daysSinceLastActivity;
    });

  return candidates;
}

// ── Churn Reason Analysis ──
// Analyzes booking history patterns to produce 1-2 specific reasons why a player may be churning.

function analyzeChurnReasons(history: BookingHistory, bookings: BookingWithSession[]): ChurnReason[] {
  const reasons: ChurnReason[] = [];
  const now = new Date();

  // Sort bookings chronologically (oldest first)
  const sorted = [...bookings]
    .filter(b => b.session?.date)
    .sort((a, b) => new Date(a.session.date).getTime() - new Date(b.session.date).getTime());

  const confirmed = sorted.filter(b => b.status === 'CONFIRMED');

  // ── 1. New member dropout: joined recently, played 1-2 times, stopped ──
  if (history.totalBookings <= 3 && confirmed.length <= 2 && confirmed.length > 0) {
    const firstDate = new Date(confirmed[0].session.date);
    const weeksAgo = Math.round((now.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAgo <= 8) {
      reasons.push({
        pattern: 'new_member_dropout',
        summary: `New member dropout — first played ${weeksAgo} week${weeksAgo !== 1 ? 's' : ''} ago, attended only ${confirmed.length} session${confirmed.length !== 1 ? 's' : ''}, didn't form a regular habit`,
      });
    }
  }

  // ── 2. Cancel spike: high cancellation rate in recent bookings ──
  if (sorted.length >= 4) {
    const recentChunk = sorted.slice(-6);
    const cancelledInRecent = recentChunk.filter(b => b.status === 'CANCELLED').length;
    if (cancelledInRecent >= 3) {
      reasons.push({
        pattern: 'cancel_spike',
        summary: `Cancellation pattern detected — cancelled ${cancelledInRecent} of last ${recentChunk.length} bookings before going inactive, suggesting declining commitment`,
      });
    }
  }

  // ── 3. Schedule change: used to play at one time slot, stopped attending that slot ──
  if (confirmed.length >= 4) {
    const midpoint = Math.floor(confirmed.length * 0.6);
    const olderHalf = confirmed.slice(0, midpoint);
    const newerHalf = confirmed.slice(midpoint);

    // Analyze time slots
    const olderSlots = countBy(olderHalf, b => getTimeSlot(b.session.startTime));
    const newerSlots = countBy(newerHalf, b => getTimeSlot(b.session.startTime));
    const dominantOldSlot = maxEntry(olderSlots);

    if (dominantOldSlot && dominantOldSlot[1] >= olderHalf.length * 0.5) {
      const slotLabel = getTimeSlotLabel(dominantOldSlot[0] as TimeSlot);
      const newerCount = newerSlots.get(dominantOldSlot[0]) ?? 0;
      if (newerCount === 0 && newerHalf.length >= 2) {
        // Build a summary of the old days/times they played
        const oldDays = countBy(
          olderHalf.filter(b => getTimeSlot(b.session.startTime) === dominantOldSlot[0]),
          b => getDayName(new Date(b.session.date))
        );
        const topDays = Array.from(oldDays.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d]) => d.slice(0, 3));
        const typicalTime = olderHalf.find(b => getTimeSlot(b.session.startTime) === dominantOldSlot[0])?.session.startTime ?? '';
        const dayStr = topDays.length > 0 ? ` (${topDays.join('/')} ${typicalTime})` : '';

        reasons.push({
          pattern: 'schedule_change',
          summary: `Possible schedule change — previously played ${slotLabel.toLowerCase()}s${dayStr} but hasn't attended ${slotLabel.toLowerCase()} sessions recently`,
        });
      }
    }
  }

  // ── 4. Frequency decline: was playing N/week → less → stopped ──
  if (confirmed.length >= 5) {
    const threeWeeksMs = 21 * 24 * 60 * 60 * 1000;
    const sixWeeksMs = 42 * 24 * 60 * 60 * 1000;
    const recentCutoff = new Date(now.getTime() - threeWeeksMs);
    const midCutoff = new Date(now.getTime() - sixWeeksMs);

    const recent = confirmed.filter(b => new Date(b.session.date) >= recentCutoff);
    const mid = confirmed.filter(b => {
      const d = new Date(b.session.date);
      return d >= midCutoff && d < recentCutoff;
    });
    const older = confirmed.filter(b => new Date(b.session.date) < midCutoff);

    // Sessions per week in each period
    const recentPerWeek = recent.length / 3;
    const midPerWeek = mid.length / 3;
    const olderPerWeek = older.length > 0
      ? older.length / Math.max(1, (recentCutoff.getTime() - new Date(older[0].session.date).getTime()) / (7 * 24 * 60 * 60 * 1000) - 3)
      : 0;

    const peakPerWeek = Math.max(midPerWeek, olderPerWeek);

    if (peakPerWeek >= 1.5 && recentPerWeek < peakPerWeek * 0.4 && !reasons.some(r => r.pattern === 'new_member_dropout')) {
      reasons.push({
        pattern: 'frequency_decline',
        summary: `Gradual disengagement — frequency dropped from ~${Math.round(peakPerWeek)} sessions/week to ${recentPerWeek < 0.5 ? 'inactive' : `~${Math.round(recentPerWeek)}/week`} over the past weeks`,
      });
    }
  }

  // ── 5. Format abandonment: stopped attending their top format ──
  if (confirmed.length >= 5) {
    const formatCounts = countBy(confirmed, b => b.session.format);
    const topFormat = maxEntry(formatCounts);
    if (topFormat && topFormat[1] >= confirmed.length * 0.4) {
      // Check if recent bookings still include this format
      const recentN = Math.min(confirmed.length, 5);
      const recentConfirmed = confirmed.slice(-recentN);
      const recentFormatCount = recentConfirmed.filter(b => b.session.format === topFormat[0]).length;
      if (recentFormatCount === 0) {
        const pct = Math.round((topFormat[1] / confirmed.length) * 100);
        const label = getFormatLabel(topFormat[0]);
        reasons.push({
          pattern: 'format_abandonment',
          summary: `Stopped attending ${label} sessions (was their #1 format at ${pct}% of bookings) — may have lost interest or found an alternative`,
        });
      }
    }
  }

  // ── 6. Seasonal/gap pattern: had an inactivity gap before and returned ──
  if (confirmed.length >= 4) {
    let longestGapDays = 0;
    let gapAfterDate: Date | null = null;
    for (let i = 1; i < confirmed.length; i++) {
      const gap = (new Date(confirmed[i].session.date).getTime() - new Date(confirmed[i - 1].session.date).getTime()) / (24 * 60 * 60 * 1000);
      if (gap > longestGapDays && gap >= 10) {
        longestGapDays = Math.round(gap);
        gapAfterDate = new Date(confirmed[i - 1].session.date);
      }
    }
    // Only include if there was a significant prior gap AND they came back after it
    if (longestGapDays >= 10 && gapAfterDate) {
      const gapMonthName = gapAfterDate.toLocaleString('en-US', { month: 'long' });
      const returnedAfterGap = confirmed.some(b => new Date(b.session.date).getTime() > gapAfterDate!.getTime() + longestGapDays * 24 * 60 * 60 * 1000);
      if (returnedAfterGap) {
        reasons.push({
          pattern: 'seasonal_gap',
          summary: `Has gone inactive before (${longestGapDays}-day gap in ${gapMonthName}) and returned — likely to re-engage with a nudge`,
        });
      }
    }
  }

  // Return top 2 most relevant reasons
  // Priority: cancel_spike > new_member_dropout > frequency_decline > schedule_change > format_abandonment > seasonal_gap
  const priority: Record<ChurnReason['pattern'], number> = {
    cancel_spike: 1,
    new_member_dropout: 2,
    frequency_decline: 3,
    schedule_change: 4,
    format_abandonment: 5,
    seasonal_gap: 6,
  };
  reasons.sort((a, b) => priority[a.pattern] - priority[b.pattern]);
  return reasons.slice(0, 2);
}

/** Count occurrences of a key derived from each item */
function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** Get entry with highest count from a Map */
function maxEntry(map: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const entry of Array.from(map.entries())) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best;
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

// ── Preference-based session scoring ──
// Weights: format 40%, time 30%, day 20%, availability 10%

const WEIGHT_FORMAT = 40;
const WEIGHT_TIME = 30;
const WEIGHT_DAY = 20;
const WEIGHT_AVAILABILITY = 10;

/**
 * Score each upcoming underfilled session by how well it matches the
 * player's historical preferences (format, time-of-day, day-of-week)
 * plus how many open spots remain.
 */
export function scoreSessionsByPreference(
  member: MemberData,
  preference: UserPlayPreferenceData | null,
  sessions: PlaySessionData[],
): ScoredSession[] {
  const memberSkill = inferSkillLevel(
    member.duprRatingDoubles ? Number(member.duprRatingDoubles) : null,
  );

  // Pre-filter to scheduled sessions the member is eligible for
  const eligible = sessions.filter(s => {
    if (s.status !== 'SCHEDULED') return false;
    const skillOk =
      s.skillLevel === 'ALL_LEVELS' ||
      s.skillLevel === memberSkill ||
      isAdjacentSkillLevel(memberSkill, s.skillLevel);
    return skillOk;
  });

  if (eligible.length === 0) return [];

  // If no preference data at all, score purely on availability
  if (!preference) {
    return eligible
      .map(s => {
        const availScore = availabilityScore(s);
        const total = Math.round(availScore * (WEIGHT_AVAILABILITY / 100));
        return {
          session: s,
          totalScore: total,
          formatScore: 0,
          timeScore: 0,
          dayScore: 0,
          availabilityScore: availScore,
          explanation: buildExplanation(s, null, 0, 0, 0, availScore),
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  // ── Format preference ──
  // preferredFormats is an array like ["OPEN_PLAY", "DRILL"]
  const prefFormats = preference.preferredFormats ?? [];
  const hasPrefFormats = prefFormats.length > 0;

  // ── Time preference ──
  // preferredTimeSlots: { morning: bool, afternoon: bool, evening: bool }
  const prefSlots = preference.preferredTimeSlots ?? { morning: false, afternoon: false, evening: false };
  const anyTimeSlotPreferred = prefSlots.morning || prefSlots.afternoon || prefSlots.evening;

  // ── Day preference ──
  const prefDays = preference.preferredDays ?? [];
  const hasPrefDays = prefDays.length > 0;

  // Compute format distribution percentages for explanation
  const formatPctMap = new Map<string, number>();
  if (hasPrefFormats) {
    // All preferred formats are equally weighted from the preference object
    const pct = Math.round(100 / prefFormats.length);
    for (const f of prefFormats) formatPctMap.set(f, pct);
  }

  const scored: ScoredSession[] = eligible.map(s => {
    // ── Format score (0-100) ──
    let fmtScore = 0;
    if (!hasPrefFormats) {
      fmtScore = 50; // no preference → neutral
    } else if (prefFormats.includes(s.format)) {
      fmtScore = 100;
    } else {
      fmtScore = 0;
    }

    // ── Time score (0-100) ──
    let tmScore = 0;
    if (!anyTimeSlotPreferred) {
      tmScore = 50; // no preference → neutral
    } else {
      const sessionSlot = getTimeSlot(s.startTime);
      tmScore = prefSlots[sessionSlot] ? 100 : 0;
    }

    // ── Day score (0-100) ──
    let dyScore = 0;
    if (!hasPrefDays) {
      dyScore = 50; // no preference → neutral
    } else {
      const sessionDay = getDayName(new Date(s.date));
      dyScore = prefDays.includes(sessionDay) ? 100 : 0;
    }

    // ── Availability score (0-100) ──
    const avScore = availabilityScore(s);

    // ── Weighted total ──
    const total = Math.round(
      (fmtScore * WEIGHT_FORMAT +
        tmScore * WEIGHT_TIME +
        dyScore * WEIGHT_DAY +
        avScore * WEIGHT_AVAILABILITY) / 100,
    );

    return {
      session: s,
      totalScore: total,
      formatScore: fmtScore,
      timeScore: tmScore,
      dayScore: dyScore,
      availabilityScore: avScore,
      explanation: buildExplanation(s, preference, fmtScore, tmScore, dyScore, avScore),
    };
  });

  return scored.sort((a, b) => b.totalScore - a.totalScore);
}

/** Compute 0-100 availability score based on open spots */
function availabilityScore(s: PlaySessionData): number {
  const confirmed = s.confirmedCount ?? s._count?.bookings ?? 0;
  const max = s.maxPlayers || 1;
  const spotsLeft = Math.max(max - confirmed, 0);
  const openPct = spotsLeft / max;
  // More open spots → higher score (fully open = 100, full = 0)
  return Math.round(openPct * 100);
}

/** Build a human-readable explanation for the top session match */
function buildExplanation(
  session: PlaySessionData,
  pref: UserPlayPreferenceData | null,
  fmtScore: number,
  tmScore: number,
  dyScore: number,
  avScore: number,
): string {
  const title = session.title || getFormatLabel(session.format);
  const courtName = session.clubCourt?.name ? ` @ ${session.clubCourt.name}` : '';
  const parts: string[] = [];

  if (fmtScore === 100 && pref) {
    parts.push(`preferred format (${getFormatLabel(session.format)})`);
  }
  const slot = getTimeSlot(session.startTime);
  if (tmScore === 100 && pref) {
    parts.push(`preferred time (${getTimeSlotLabel(slot)})`);
  }
  if (dyScore === 100 && pref) {
    const dayLabel = getDayName(new Date(session.date));
    parts.push(`preferred day (${dayLabel})`);
  }

  if (parts.length > 0) {
    return `Invite to ${title}${courtName} — matches their ${parts.join(' and ')}`;
  }

  if (avScore > 60) {
    return `Invite to ${title}${courtName} — session has plenty of open spots`;
  }

  return `Invite to ${title}${courtName}`;
}
