/**
 * Player Persona System
 *
 * Personas are player archetypes that help personalize AI communications.
 * They can be set manually by club admin or auto-detected from behavior.
 *
 * 5 Personas:
 * - COMPETITIVE: Motivated by challenge, results, rankings
 * - SOCIAL: Comes for community, fun, meeting people
 * - IMPROVER: Wants to grow skills, attends clinics, drills
 * - CASUAL: Plays for health/relaxation, flexible schedule
 * - TEAM_PLAYER: Loves team formats, committed to groups
 */

export type PlayerPersona = 'COMPETITIVE' | 'SOCIAL' | 'IMPROVER' | 'CASUAL' | 'TEAM_PLAYER';

export interface PersonaProfile {
  persona: PlayerPersona;
  confidence: number; // 0-100, how confident is the auto-detection
  signals: string[];  // what behavioral signals led to this
  label: string;
  emoji: string;
  description: string;
  messagingStyle: string;
}

// ── Persona Definitions ──

export const PERSONA_PROFILES: Record<PlayerPersona, Omit<PersonaProfile, 'confidence' | 'signals'>> = {
  COMPETITIVE: {
    persona: 'COMPETITIVE',
    label: 'Competitor',
    emoji: '🏆',
    description: 'Motivated by challenge and results. Loves tough matchups and tracking progress.',
    messagingStyle: 'Emphasize competition level, opponent quality, DUPR ratings, and performance opportunity',
  },
  SOCIAL: {
    persona: 'SOCIAL',
    label: 'Social Player',
    emoji: '🤝',
    description: 'Plays for community and fun. Values the social aspect of pickleball.',
    messagingStyle: 'Emphasize who else is coming, group vibe, community, and fun factor',
  },
  IMPROVER: {
    persona: 'IMPROVER',
    label: 'Skill Builder',
    emoji: '📈',
    description: 'Focused on getting better. Attends clinics and drills. Tracks their DUPR.',
    messagingStyle: 'Emphasize learning opportunity, skill development, coaching quality, and DUPR improvement',
  },
  CASUAL: {
    persona: 'CASUAL',
    label: 'Casual Player',
    emoji: '☀️',
    description: 'Plays for enjoyment and health. Flexible and easy-going about formats.',
    messagingStyle: 'Keep it light and easy. Emphasize convenience, good weather, relaxation, and no pressure',
  },
  TEAM_PLAYER: {
    persona: 'TEAM_PLAYER',
    label: 'Team Player',
    emoji: '👥',
    description: 'Thrives in team settings. Committed to their group and consistent attendance.',
    messagingStyle: 'Emphasize team needs, group commitment, being part of something, and reliability',
  },
};

// ── Auto-Detection from Behavior ──

export interface BehaviorSignals {
  // Format preferences (count of bookings by format)
  formatCounts: Record<string, number>;
  // Booking patterns
  totalBookings: number;
  cancelRate: number;         // 0-1
  noShowRate: number;         // 0-1
  averageBookingsPerWeek: number;
  // Session type patterns
  clinicCount: number;
  drillCount: number;
  openPlayCount: number;
  leaguePlayCount: number;
  socialCount: number;
  // Tournament data (from existing Piqle)
  tournamentCount: number;
  hasDuprLinked: boolean;
  duprRating: number | null;
  // Consistency
  weeklyConsistencyScore: number;  // 0-1, how consistent is weekly attendance
  prefersSameTimeSlots: boolean;
  // Social signals
  booksWithSamePeople: boolean;   // tends to book sessions where friends are
  joinedViaInvite: number;        // how many times joined from an invite
}

export function detectPersona(signals: BehaviorSignals): PersonaProfile {
  const scores: Record<PlayerPersona, { score: number; reasons: string[] }> = {
    COMPETITIVE: { score: 0, reasons: [] },
    SOCIAL: { score: 0, reasons: [] },
    IMPROVER: { score: 0, reasons: [] },
    CASUAL: { score: 0, reasons: [] },
    TEAM_PLAYER: { score: 0, reasons: [] },
  };

  // ── COMPETITIVE signals ──
  if (signals.tournamentCount >= 3) {
    scores.COMPETITIVE.score += 30;
    scores.COMPETITIVE.reasons.push(`Played ${signals.tournamentCount} tournaments`);
  }
  if (signals.hasDuprLinked) {
    scores.COMPETITIVE.score += 15;
    scores.COMPETITIVE.reasons.push('DUPR account linked — tracks rating');
  }
  if (signals.leaguePlayCount > signals.openPlayCount) {
    scores.COMPETITIVE.score += 20;
    scores.COMPETITIVE.reasons.push('Prefers league play over open play');
  }
  if (signals.cancelRate < 0.05) {
    scores.COMPETITIVE.score += 10;
    scores.COMPETITIVE.reasons.push('Very low cancel rate — takes commitments seriously');
  }

  // ── SOCIAL signals ──
  if (signals.socialCount >= 3) {
    scores.SOCIAL.score += 25;
    scores.SOCIAL.reasons.push(`Attended ${signals.socialCount} social sessions`);
  }
  if (signals.openPlayCount > signals.clinicCount + signals.drillCount) {
    scores.SOCIAL.score += 15;
    scores.SOCIAL.reasons.push('Prefers open play over structured sessions');
  }
  if (signals.booksWithSamePeople) {
    scores.SOCIAL.score += 20;
    scores.SOCIAL.reasons.push('Often books sessions with the same group');
  }
  if (signals.joinedViaInvite >= 3) {
    scores.SOCIAL.score += 15;
    scores.SOCIAL.reasons.push(`Joined ${signals.joinedViaInvite} sessions via invite — responsive to social cues`);
  }

  // ── IMPROVER signals ──
  if (signals.clinicCount >= 3) {
    scores.IMPROVER.score += 30;
    scores.IMPROVER.reasons.push(`Attended ${signals.clinicCount} clinics — actively learning`);
  }
  if (signals.drillCount >= 2) {
    scores.IMPROVER.score += 25;
    scores.IMPROVER.reasons.push(`Attended ${signals.drillCount} drill sessions`);
  }
  if (signals.hasDuprLinked && signals.averageBookingsPerWeek >= 2) {
    scores.IMPROVER.score += 15;
    scores.IMPROVER.reasons.push('Frequent player with DUPR tracking — focused on growth');
  }

  // ── CASUAL signals ──
  if (signals.averageBookingsPerWeek < 1 && signals.totalBookings >= 3) {
    scores.CASUAL.score += 20;
    scores.CASUAL.reasons.push('Plays occasionally, not on a fixed schedule');
  }
  if (signals.cancelRate > 0.2) {
    scores.CASUAL.score += 15;
    scores.CASUAL.reasons.push('Higher cancel rate — flexible commitment');
  }
  if (!signals.hasDuprLinked && signals.tournamentCount === 0) {
    scores.CASUAL.score += 20;
    scores.CASUAL.reasons.push('No tournaments or DUPR — plays for fun');
  }
  if (!signals.prefersSameTimeSlots) {
    scores.CASUAL.score += 10;
    scores.CASUAL.reasons.push('Varies play times — goes when convenient');
  }

  // ── TEAM_PLAYER signals ──
  if (signals.leaguePlayCount >= 3) {
    scores.TEAM_PLAYER.score += 25;
    scores.TEAM_PLAYER.reasons.push(`${signals.leaguePlayCount} league sessions — committed to team play`);
  }
  if (signals.weeklyConsistencyScore > 0.7) {
    scores.TEAM_PLAYER.score += 20;
    scores.TEAM_PLAYER.reasons.push('Highly consistent weekly attendance');
  }
  if (signals.cancelRate < 0.1 && signals.noShowRate < 0.05) {
    scores.TEAM_PLAYER.score += 15;
    scores.TEAM_PLAYER.reasons.push('Very reliable — rarely cancels or no-shows');
  }
  if (signals.booksWithSamePeople) {
    scores.TEAM_PLAYER.score += 15;
    scores.TEAM_PLAYER.reasons.push('Plays with consistent group');
  }

  // Find the winner
  const sorted = Object.entries(scores)
    .map(([persona, data]) => ({ persona: persona as PlayerPersona, ...data }))
    .sort((a, b) => b.score - a.score);

  const winner = sorted[0];
  const totalScore = sorted.reduce((sum, s) => sum + s.score, 0) || 1;
  const confidence = Math.min(95, Math.round((winner.score / totalScore) * 100));

  // If no clear winner, default to CASUAL with low confidence
  if (winner.score === 0) {
    return {
      ...PERSONA_PROFILES.CASUAL,
      confidence: 20,
      signals: ['Not enough data yet — defaulting to Casual'],
    };
  }

  return {
    ...PERSONA_PROFILES[winner.persona],
    confidence,
    signals: winner.reasons,
  };
}

// ── Personalized Invite Message Generation ──

export interface InviteContext {
  playerName: string;
  persona: PlayerPersona;
  sessionTitle: string;
  sessionDate: string;
  sessionTime: string;
  sessionFormat: string;
  skillLevel: string;
  confirmedCount: number;
  maxPlayers: number;
  spotsRemaining: number;
  duprRating: number | null;
  // Optional context
  confirmedPlayerNames?: string[];
  averageGroupDupr?: number;
  courtName?: string;
}

export function generatePersonalizedInvite(ctx: InviteContext): {
  subject: string;
  headline: string;
  body: string;
  cta: string;
  tone: string;
} {
  const firstName = ctx.playerName.split(' ')[0];

  switch (ctx.persona) {
    case 'COMPETITIVE':
      return {
        subject: `${firstName}, competitive spot open — ${ctx.sessionTitle}`,
        headline: `Ready for a challenge, ${firstName}?`,
        body: `There's a spot in ${ctx.sessionTitle} on ${ctx.sessionDate} at ${ctx.sessionTime}. ${
          ctx.averageGroupDupr
            ? `Current group average DUPR: ${ctx.averageGroupDupr.toFixed(1)} — should be a solid matchup for your ${ctx.duprRating?.toFixed(1) || ''} rating.`
            : `${ctx.confirmedCount} players confirmed — ${ctx.skillLevel} level play.`
        } ${ctx.spotsRemaining} spot${ctx.spotsRemaining > 1 ? 's' : ''} left.`,
        cta: 'Claim Your Spot',
        tone: 'competitive',
      };

    case 'SOCIAL':
      return {
        subject: `${firstName}, the crew is playing ${ctx.sessionDate}!`,
        headline: `Great group coming together, ${firstName}!`,
        body: `${ctx.sessionTitle} on ${ctx.sessionDate} at ${ctx.sessionTime} is shaping up nicely — ${ctx.confirmedCount} player${ctx.confirmedCount > 1 ? 's' : ''} already confirmed${
          ctx.confirmedPlayerNames && ctx.confirmedPlayerNames.length > 0
            ? ` including ${ctx.confirmedPlayerNames.slice(0, 2).join(' and ')}`
            : ''
        }. Come join the fun! ${ctx.spotsRemaining} spot${ctx.spotsRemaining > 1 ? 's' : ''} available.`,
        cta: 'Join the Group',
        tone: 'social',
      };

    case 'IMPROVER':
      return {
        subject: `${firstName}, level up at ${ctx.sessionTitle}`,
        headline: `Great opportunity to improve, ${firstName}!`,
        body: `${ctx.sessionTitle} on ${ctx.sessionDate} (${ctx.sessionTime}) — ${
          ctx.sessionFormat === 'CLINIC' || ctx.sessionFormat === 'DRILL'
            ? `perfect for working on your game. ${ctx.skillLevel} level with focused practice.`
            : `a solid session to apply what you've been working on. ${ctx.skillLevel} level play with ${ctx.confirmedCount} players confirmed.`
        }${ctx.duprRating ? ` Every session counts toward your DUPR growth.` : ''} ${ctx.spotsRemaining} spot${ctx.spotsRemaining > 1 ? 's' : ''} left.`,
        cta: 'Book & Improve',
        tone: 'motivational',
      };

    case 'CASUAL':
      return {
        subject: `${firstName}, easy pickup game this ${ctx.sessionDate.split(',')[0]}`,
        headline: `Hey ${firstName}, feel like playing?`,
        body: `${ctx.sessionTitle} on ${ctx.sessionDate} at ${ctx.sessionTime}. No pressure, just good pickleball. ${ctx.spotsRemaining} spot${ctx.spotsRemaining > 1 ? 's' : ''} open${
          ctx.courtName ? ` on ${ctx.courtName}` : ''
        }. Drop in if it works for your schedule!`,
        cta: 'I\'m In',
        tone: 'relaxed',
      };

    case 'TEAM_PLAYER':
      return {
        subject: `${firstName}, the team needs you — ${ctx.sessionDate}`,
        headline: `Your group is counting on you, ${firstName}!`,
        body: `${ctx.sessionTitle} on ${ctx.sessionDate} at ${ctx.sessionTime}. ${ctx.confirmedCount} of ${ctx.maxPlayers} spots filled — ${
          ctx.spotsRemaining <= 2
            ? `almost there, just need ${ctx.spotsRemaining} more to complete the group!`
            : `your spot is waiting. The group plays best when the regulars show up.`
        }`,
        cta: 'Count Me In',
        tone: 'team-oriented',
      };

    default:
      return {
        subject: `${firstName}, session available — ${ctx.sessionTitle}`,
        headline: `Hi ${firstName}!`,
        body: `There's a spot in ${ctx.sessionTitle} on ${ctx.sessionDate} at ${ctx.sessionTime}. ${ctx.spotsRemaining} spots remaining.`,
        cta: 'Book Now',
        tone: 'neutral',
      };
  }
}

// ── Persist Persona to DB ──

export async function persistPersona(
  prisma: any,
  userId: string,
  clubId: string,
  profile: PersonaProfile
): Promise<void> {
  await prisma.userPlayPreference.upsert({
    where: { userId_clubId: { userId, clubId } },
    create: {
      userId,
      clubId,
      detectedPersona: profile.persona,
      personaConfidence: profile.confidence,
      personaUpdatedAt: new Date(),
    },
    update: {
      detectedPersona: profile.persona,
      personaConfidence: profile.confidence,
      personaUpdatedAt: new Date(),
    },
  });
}

// ── Persona Labels for UI ──

export const PERSONA_OPTIONS: Array<{ value: PlayerPersona; label: string; emoji: string; description: string }> = [
  { value: 'COMPETITIVE', label: 'Competitor', emoji: '🏆', description: 'Motivated by challenge and results' },
  { value: 'SOCIAL', label: 'Social Player', emoji: '🤝', description: 'Plays for community and fun' },
  { value: 'IMPROVER', label: 'Skill Builder', emoji: '📈', description: 'Focused on getting better' },
  { value: 'CASUAL', label: 'Casual Player', emoji: '☀️', description: 'Plays for enjoyment and health' },
  { value: 'TEAM_PLAYER', label: 'Team Player', emoji: '👥', description: 'Thrives in team settings' },
];
