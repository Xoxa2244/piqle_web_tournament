import {
  MemberData, UserPlayPreferenceData, PlaySessionData, BookingHistory,
  SlotFillerRecommendation, RecommendationScore, ScoreComponent
} from '../../types/intelligence';
import { getDayName, getTimeSlot, getTimeSlotLabel, inferSkillLevel, isAdjacentSkillLevel, getFormatLabel, clamp } from './scoring';

interface SlotFillerInput {
  session: PlaySessionData;
  members: Array<{
    member: MemberData;
    preference: UserPlayPreferenceData | null;
    history: BookingHistory;
  }>;
  alreadyBookedUserIds: Set<string>;
}

export function generateSlotFillerRecommendations(input: SlotFillerInput): SlotFillerRecommendation[] {
  const { session, members, alreadyBookedUserIds } = input;

  const recommendations = members
    .filter(m => !alreadyBookedUserIds.has(m.member.id))
    .map(({ member, preference, history }) => {
      const scoring = scoreMemberForSession(member, preference, session, history);
      return {
        member,
        preference,
        score: scoring.score,
        reasoning: scoring,
        estimatedLikelihood: scoring.score >= 75 ? 'high' as const : scoring.score >= 50 ? 'medium' as const : 'low' as const,
      };
    })
    .sort((a, b) => b.score - a.score);

  return recommendations;
}

function scoreMemberForSession(
  member: MemberData,
  preference: UserPlayPreferenceData | null,
  session: PlaySessionData,
  history: BookingHistory
): RecommendationScore {
  const components: Record<string, ScoreComponent> = {};

  // ── Schedule Fit (30%) ──
  let scheduleFitScore = 50; // default if no preference
  let scheduleExplanation = 'No preference data available';
  if (preference) {
    const sessionDay = getDayName(session.date);
    const sessionTime = getTimeSlot(session.startTime);
    const dayMatch = preference.preferredDays.includes(sessionDay);
    const timeMatch = preference.preferredTimeSlots?.[sessionTime] ?? false;

    if (dayMatch && timeMatch) {
      scheduleFitScore = 100;
      scheduleExplanation = `Prefers ${sessionDay}s in the ${sessionTime} — perfect match`;
    } else if (dayMatch) {
      scheduleFitScore = 70;
      scheduleExplanation = `Prefers ${sessionDay}s but not typically ${sessionTime} sessions`;
    } else if (timeMatch) {
      scheduleFitScore = 60;
      scheduleExplanation = `Enjoys ${sessionTime} sessions but ${sessionDay} isn't a preferred day`;
    } else {
      scheduleFitScore = 25;
      scheduleExplanation = `${sessionDay} ${sessionTime} doesn't match their usual schedule`;
    }
  }
  components.schedule_fit = { score: scheduleFitScore, weight: 30, explanation: scheduleExplanation };

  // ── Skill Fit (25%) ──
  const memberSkill = inferSkillLevel(member.duprRatingDoubles ? Number(member.duprRatingDoubles) : null);
  let skillScore = 50;
  let skillExplanation = '';
  if (session.skillLevel === 'ALL_LEVELS') {
    skillScore = 90;
    skillExplanation = 'Session is open to all levels';
  } else if (memberSkill === session.skillLevel) {
    skillScore = 100;
    skillExplanation = `${memberSkill} player — exact match for this ${session.skillLevel} session`;
  } else if (isAdjacentSkillLevel(memberSkill, session.skillLevel)) {
    skillScore = 65;
    skillExplanation = `${memberSkill} player — close to the ${session.skillLevel} level`;
  } else {
    skillScore = 20;
    skillExplanation = `${memberSkill} player — skill gap with this ${session.skillLevel} session`;
  }
  components.skill_fit = { score: skillScore, weight: 25, explanation: skillExplanation };

  // ── Format Fit (15%) ──
  let formatScore = 50;
  let formatExplanation = '';
  if (preference && preference.preferredFormats.length > 0) {
    if (preference.preferredFormats.includes(session.format)) {
      formatScore = 100;
      formatExplanation = `Enjoys ${getFormatLabel(session.format)}`;
    } else {
      formatScore = 35;
      formatExplanation = `Prefers ${preference.preferredFormats.map(getFormatLabel).join(', ')} — not ${getFormatLabel(session.format)}`;
    }
  } else {
    formatExplanation = 'No format preference set';
  }
  components.format_fit = { score: formatScore, weight: 15, explanation: formatExplanation };

  // ── Recency (15%) ──
  let recencyScore = 50;
  let recencyExplanation = '';
  const daysSince = history.daysSinceLastConfirmedBooking;
  if (daysSince === null) {
    recencyScore = 40;
    recencyExplanation = 'No previous bookings on record';
  } else if (daysSince <= 7) {
    recencyScore = 100;
    recencyExplanation = `Played ${daysSince} day${daysSince === 1 ? '' : 's'} ago — very active`;
  } else if (daysSince <= 14) {
    recencyScore = 80;
    recencyExplanation = `Last played ${daysSince} days ago — regularly active`;
  } else if (daysSince <= 30) {
    recencyScore = 60;
    recencyExplanation = `Last played ${daysSince} days ago — moderately active`;
  } else {
    recencyScore = 30;
    recencyExplanation = `Last played ${daysSince} days ago — becoming inactive`;
  }
  components.recency = { score: recencyScore, weight: 15, explanation: recencyExplanation };

  // ── Frequency Gap (10%) ──
  let freqScore = 50;
  let freqExplanation = '';
  if (preference) {
    const target = preference.targetSessionsPerWeek;
    const actual = history.bookingsLastWeek;
    if (actual >= target) {
      freqScore = 40;
      freqExplanation = `Already hit their target of ${target} sessions this week`;
    } else {
      const gap = target - actual;
      freqScore = clamp(Math.round((gap / Math.max(target, 1)) * 100), 50, 100);
      freqExplanation = `${actual}/${target} sessions this week — ${gap} more to reach goal`;
    }
  } else {
    freqExplanation = 'No weekly target set';
  }
  components.frequency_gap = { score: freqScore, weight: 10, explanation: freqExplanation };

  // ── Responsiveness (5%) ──
  const respRate = history.inviteAcceptanceRate;
  const respScore = clamp(Math.round(respRate * 100), 0, 100);
  const respExplanation = respRate >= 0.7 ? 'Highly responsive to invites' : respRate >= 0.4 ? 'Moderately responsive' : 'Low responsiveness to invites';
  components.responsiveness = { score: respScore, weight: 5, explanation: respExplanation };

  // ── Calculate Weighted Total ──
  let totalScore = 0;
  for (const comp of Object.values(components)) {
    totalScore += (comp.score * comp.weight) / 100;
  }
  totalScore = Math.round(clamp(totalScore, 0, 100));

  // ── Generate Summary ──
  const topFactors = Object.entries(components)
    .map(([name, c]) => ({ name, weightedScore: (c.score * c.weight) / 100, explanation: c.explanation }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 2);

  const name = member.name || member.email;
  const summary = `${name} scores ${totalScore}/100. ${topFactors.map(f => f.explanation).join('. ')}.`;

  return { score: totalScore, components, summary };
}
