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

  // ── Reactivation Potential (30%) — more historical activity = higher potential ──
  let potentialScore: number;
  let potentialExpl: string;
  if (history.totalBookings >= 10) { potentialScore = 100; potentialExpl = `${history.totalBookings} total bookings — was a very active member`; }
  else if (history.totalBookings >= 5) { potentialScore = 80; potentialExpl = `${history.totalBookings} past bookings — moderately active member`; }
  else if (history.totalBookings >= 1) { potentialScore = 50; potentialExpl = `Only ${history.totalBookings} past booking(s) — light engagement`; }
  else { potentialScore = 20; potentialExpl = 'No booking history — may need special outreach'; }
  components.reactivation_potential = { score: potentialScore, weight: 30, explanation: potentialExpl };

  // ── Inactivity Window (25%) — sweet spot is 3-6 weeks, too long = harder ──
  const daysSince = history.daysSinceLastConfirmedBooking ?? 365;
  let inactScore: number;
  let inactExpl: string;
  if (daysSince <= 30) { inactScore = 100; inactExpl = `Inactive for ${daysSince} days — still in the window to re-engage easily`; }
  else if (daysSince <= 60) { inactScore = 75; inactExpl = `Inactive for ${daysSince} days — getting further away, act soon`; }
  else if (daysSince <= 90) { inactScore = 50; inactExpl = `Inactive for ${daysSince} days — will need a compelling offer`; }
  else { inactScore = 25; inactExpl = `Inactive for ${daysSince}+ days — significant re-engagement effort needed`; }
  components.inactivity_window = { score: inactScore, weight: 25, explanation: inactExpl };

  // ── Session Availability Match (25%) — are there upcoming sessions that fit? ──
  const matchingSessions = findMatchingSessions(member, preference, upcomingSessions);
  let matchScore: number;
  let matchExpl: string;
  if (matchingSessions.length >= 3) { matchScore = 100; matchExpl = `${matchingSessions.length} matching sessions this week — great options to suggest`; }
  else if (matchingSessions.length >= 1) { matchScore = 60; matchExpl = `${matchingSessions.length} matching session(s) available — some options to offer`; }
  else { matchScore = 15; matchExpl = 'No strongly matching sessions — may need to create one'; }
  components.session_availability = { score: matchScore, weight: 25, explanation: matchExpl };

  // ── Profile Completeness (10%) — members with preferences are easier to target ──
  let profileScore: number;
  let profileExpl: string;
  if (preference && preference.preferredDays.length > 0 && preference.preferredFormats.length > 0) {
    profileScore = 100; profileExpl = 'Full preference profile — can make personalized suggestions';
  } else if (preference) {
    profileScore = 60; profileExpl = 'Partial preferences on file';
  } else {
    profileScore = 20; profileExpl = 'No preferences set — harder to personalize outreach';
  }
  components.profile_completeness = { score: profileScore, weight: 10, explanation: profileExpl };

  // ── Reliability (10%) — low no-show rate = worth re-engaging ──
  const noShowRate = history.totalBookings > 0 ? history.noShowCount / history.totalBookings : 0;
  let reliabScore: number;
  let reliabExpl: string;
  if (noShowRate <= 0.05) { reliabScore = 100; reliabExpl = 'Very reliable — rarely misses sessions'; }
  else if (noShowRate <= 0.15) { reliabScore = 70; reliabExpl = 'Generally reliable member'; }
  else { reliabScore = 30; reliabExpl = 'History of no-shows — may need follow-up confirmation'; }
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
