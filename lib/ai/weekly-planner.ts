import {
  MemberData, UserPlayPreferenceData, PlaySessionData, BookingHistory,
  WeeklyPlanResult, WeeklyPlanSession, RecommendationScore, ScoreComponent
} from '../../types/intelligence';
import { getDayName, getTimeSlot, getTimeSlotLabel, inferSkillLevel, isAdjacentSkillLevel, getFormatLabel, getOccupancyPercent, clamp } from './scoring';

interface WeeklyPlannerInput {
  user: MemberData;
  preference: UserPlayPreferenceData;
  upcomingSessions: PlaySessionData[];
  history: BookingHistory;
  existingBookingSessionIds: Set<string>;
}

export function generateWeeklyPlan(input: WeeklyPlannerInput): WeeklyPlanResult {
  const { user, preference, upcomingSessions, history, existingBookingSessionIds } = input;

  // Score all available sessions (exclude already booked, cancelled, full)
  const scoredSessions = upcomingSessions
    .filter(s => s.status === 'SCHEDULED' && !existingBookingSessionIds.has(s.id))
    .map(session => {
      const confirmedCount = session.confirmedCount ?? session._count?.bookings ?? 0;
      const spotsRemaining = session.maxPlayers - confirmedCount;
      if (spotsRemaining <= 0) return null;

      const scoring = scoreSessionForPlayer(user, preference, session, history);
      return {
        session,
        score: scoring.score,
        reasoning: scoring,
        occupancyPercent: getOccupancyPercent(confirmedCount, session.maxPlayers),
        spotsRemaining,
      };
    })
    .filter((s): s is WeeklyPlanSession => s !== null)
    .sort((a, b) => b.score - a.score);

  // Select top N, spreading across different days when possible
  const targetCount = preference.targetSessionsPerWeek;
  const selected = selectDiverseSessions(scoredSessions, targetCount);

  // Generate plan summary
  const name = user.name || 'you';
  const daysStr = selected.map(s => getDayName(s.session.date)).join(', ');
  const planSummary = selected.length > 0
    ? `Based on your preferences, here are ${selected.length} recommended sessions for this week (${daysStr}). ${
        selected.length < targetCount
          ? `We found ${selected.length} of your target ${targetCount} — more sessions may open up soon.`
          : `This meets your goal of ${targetCount} sessions per week.`
      }`
    : 'No matching sessions found this week. Try adjusting your preferences or check back later.';

  return {
    userId: user.id,
    clubId: preference.clubId,
    targetSessions: targetCount,
    recommendedSessions: selected,
    generatedAt: new Date(),
    planSummary,
  };
}

function selectDiverseSessions(scored: WeeklyPlanSession[], targetCount: number): WeeklyPlanSession[] {
  if (scored.length <= targetCount) return scored;

  const selected: WeeklyPlanSession[] = [];
  const usedDays = new Set<string>();

  // First pass: pick top session per unique day
  for (const s of scored) {
    if (selected.length >= targetCount) break;
    const day = getDayName(s.session.date);
    if (!usedDays.has(day)) {
      selected.push(s);
      usedDays.add(day);
    }
  }

  // Second pass: fill remaining slots with highest scores
  if (selected.length < targetCount) {
    for (const s of scored) {
      if (selected.length >= targetCount) break;
      if (!selected.includes(s)) {
        selected.push(s);
      }
    }
  }

  return selected.sort((a, b) => new Date(a.session.date).getTime() - new Date(b.session.date).getTime());
}

function scoreSessionForPlayer(
  user: MemberData,
  preference: UserPlayPreferenceData,
  session: PlaySessionData,
  history: BookingHistory
): RecommendationScore {
  const components: Record<string, ScoreComponent> = {};

  // ── Schedule Fit (35%) ──
  const sessionDay = getDayName(session.date);
  const sessionTime = getTimeSlot(session.startTime);
  const dayMatch = preference.preferredDays.includes(sessionDay);
  const timeMatch = preference.preferredTimeSlots?.[sessionTime] ?? false;
  let schedScore = 30;
  let schedExpl = '';
  if (dayMatch && timeMatch) { schedScore = 100; schedExpl = `${sessionDay} ${getTimeSlotLabel(sessionTime)} — perfect fit for your schedule`; }
  else if (dayMatch) { schedScore = 70; schedExpl = `${sessionDay} works for you, though ${getTimeSlotLabel(sessionTime).toLowerCase()} isn't your usual time`; }
  else if (timeMatch) { schedScore = 55; schedExpl = `${getTimeSlotLabel(sessionTime)} time works but ${sessionDay} isn't a preferred day`; }
  else { schedExpl = `${sessionDay} ${getTimeSlotLabel(sessionTime).toLowerCase()} doesn't match your usual schedule`; }
  components.schedule_fit = { score: schedScore, weight: 35, explanation: schedExpl };

  // ── Skill Fit (25%) ──
  const userSkill = inferSkillLevel(user.duprRatingDoubles ? Number(user.duprRatingDoubles) : null);
  let skillScore = 50;
  let skillExpl = '';
  if (session.skillLevel === 'ALL_LEVELS') { skillScore = 85; skillExpl = 'Open to all levels'; }
  else if (userSkill === session.skillLevel) { skillScore = 100; skillExpl = `Matches your ${userSkill.toLowerCase()} skill level`; }
  else if (isAdjacentSkillLevel(userSkill, session.skillLevel)) { skillScore = 60; skillExpl = `Close to your level — good stretch opportunity`; }
  else { skillScore = 15; skillExpl = `Skill gap — this session is for ${session.skillLevel.toLowerCase()} players`; }
  components.skill_fit = { score: skillScore, weight: 25, explanation: skillExpl };

  // ── Format Fit (20%) ──
  let fmtScore = 50;
  let fmtExpl = '';
  if (preference.preferredFormats.includes(session.format)) { fmtScore = 100; fmtExpl = `${getFormatLabel(session.format)} — one of your preferred formats`; }
  else { fmtScore = 40; fmtExpl = `${getFormatLabel(session.format)} isn't in your preferred formats`; }
  components.format_fit = { score: fmtScore, weight: 20, explanation: fmtExpl };

  // ── Availability/Occupancy (15%) ──
  const confirmedCount = session.confirmedCount ?? session._count?.bookings ?? 0;
  const occupancy = getOccupancyPercent(confirmedCount, session.maxPlayers);
  let occScore: number;
  let occExpl: string;
  if (occupancy >= 90) { occScore = 30; occExpl = 'Almost full — limited spots'; }
  else if (occupancy >= 70) { occScore = 80; occExpl = 'Good group forming — popular session'; }
  else if (occupancy >= 40) { occScore = 100; occExpl = 'Plenty of spots — good energy building'; }
  else { occScore = 60; occExpl = 'Still early — be among the first to join'; }
  components.occupancy = { score: occScore, weight: 15, explanation: occExpl };

  // ── Freshness bonus (5%) ──
  const daysSince = history.daysSinceLastConfirmedBooking;
  let freshScore = 70;
  let freshExpl = '';
  if (daysSince === null || daysSince > 14) { freshScore = 100; freshExpl = 'Great time to get back on the court!'; }
  else if (daysSince > 7) { freshScore = 80; freshExpl = 'Keep the momentum going'; }
  else { freshScore = 60; freshExpl = 'Recently active — staying consistent'; }
  components.freshness = { score: freshScore, weight: 5, explanation: freshExpl };

  // ── Weighted Total ──
  let total = 0;
  for (const c of Object.values(components)) { total += (c.score * c.weight) / 100; }
  total = Math.round(clamp(total, 0, 100));

  const topFactor = Object.entries(components)
    .map(([, c]) => ({ score: (c.score * c.weight) / 100, explanation: c.explanation }))
    .sort((a, b) => b.score - a.score)[0];

  const summary = `Score: ${total}/100. ${topFactor?.explanation || ''}`;

  return { score: total, components, summary };
}
