/**
 * Intelligence tRPC Router
 * AI-powered recommendations for clubs and players
 */

import { z } from 'zod';
import { generateSlotFillerRecommendations } from './slot-filler';
import { generateWeeklyPlan } from './weekly-planner';
import { generateReactivationCandidates } from './reactivation';
import type { BookingHistory, UserPlayPreferenceData, MemberData } from '../../types/intelligence';

// ── Input Schemas ──

const slotFillerInput = z.object({
  sessionId: z.string().uuid(),
  limit: z.number().int().min(1).max(20).default(5),
});

const weeklyPlanInput = z.object({
  userId: z.string().uuid(),
  clubId: z.string().uuid(),
});

const reactivationInput = z.object({
  clubId: z.string().uuid(),
  inactivityDays: z.number().int().min(7).default(21),
  limit: z.number().int().min(1).max(20).default(10),
});

const sendInviteInput = z.object({
  sessionId: z.string().uuid(),
  userIds: z.array(z.string().uuid()),
  message: z.string().max(500).optional(),
});

const preferencesInput = z.object({
  userId: z.string().uuid(),
  clubId: z.string().uuid(),
  preferredDays: z.array(z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])),
  preferredTimeSlots: z.object({
    morning: z.boolean(),
    afternoon: z.boolean(),
    evening: z.boolean(),
  }),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']),
  preferredFormats: z.array(z.enum(['OPEN_PLAY', 'CLINIC', 'DRILL', 'LEAGUE_PLAY', 'SOCIAL'])),
  targetSessionsPerWeek: z.number().int().min(1).max(7),
});

// ── Helper: Build booking history for a user ──

async function buildBookingHistory(prisma: any, userId: string): Promise<BookingHistory> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [allBookings, lastWeek, lastMonth, lastConfirmed] = await Promise.all([
    prisma.playSessionBooking.count({ where: { userId } }),
    prisma.playSessionBooking.count({ where: { userId, status: 'CONFIRMED', bookedAt: { gte: oneWeekAgo } } }),
    prisma.playSessionBooking.count({ where: { userId, status: 'CONFIRMED', bookedAt: { gte: oneMonthAgo } } }),
    prisma.playSessionBooking.findFirst({
      where: { userId, status: 'CONFIRMED' },
      orderBy: { bookedAt: 'desc' },
      select: { bookedAt: true },
    }),
  ]);

  const cancelled = await prisma.playSessionBooking.count({ where: { userId, status: 'CANCELLED' } });
  const noShow = await prisma.playSessionBooking.count({ where: { userId, status: 'NO_SHOW' } });

  const daysSince = lastConfirmed
    ? Math.floor((now.getTime() - new Date(lastConfirmed.bookedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const total = allBookings || 1;
  const acceptRate = total > 0 ? Math.max(0, (total - cancelled - noShow) / total) : 0.5;

  return {
    totalBookings: allBookings,
    bookingsLastWeek: lastWeek,
    bookingsLastMonth: lastMonth,
    daysSinceLastConfirmedBooking: daysSince,
    cancelledCount: cancelled,
    noShowCount: noShow,
    inviteAcceptanceRate: acceptRate,
  };
}

// ── Helper: Convert Prisma user to MemberData ──

function toMemberData(user: any): MemberData {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    gender: user.gender,
    city: user.city,
    duprRatingDoubles: user.duprRatingDoubles ? Number(user.duprRatingDoubles) : null,
    duprRatingSingles: user.duprRatingSingles ? Number(user.duprRatingSingles) : null,
  };
}

// ── Helper: Convert Prisma preference to UserPlayPreferenceData ──

function toPreferenceData(pref: any): UserPlayPreferenceData | null {
  if (!pref) return null;
  return {
    id: pref.id,
    userId: pref.userId,
    clubId: pref.clubId,
    preferredDays: pref.preferredDays || [],
    preferredTimeSlots: pref.preferredTimeSlots || { morning: true, afternoon: true, evening: true },
    skillLevel: pref.skillLevel,
    preferredFormats: pref.preferredFormats || [],
    targetSessionsPerWeek: pref.targetSessionsPerWeek,
    isActive: pref.isActive,
  };
}

/**
 * intelligence.getSlotFillerRecommendations
 * For a given underfilled session, recommend which members to invite
 */
export async function getSlotFillerRecommendations(
  prisma: any,
  input: z.infer<typeof slotFillerInput>
) {
  // Get the session
  const session = await prisma.playSession.findUniqueOrThrow({
    where: { id: input.sessionId },
    include: {
      clubCourt: true,
      bookings: { where: { status: 'CONFIRMED' }, select: { userId: true } },
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
  });

  const alreadyBookedUserIds = new Set(session.bookings.map((b: any) => b.userId));

  // Get all club members with preferences
  const clubMembers = await prisma.clubFollower.findMany({
    where: { clubId: session.clubId },
    include: {
      user: {
        select: {
          id: true, email: true, name: true, image: true, gender: true, city: true,
          duprRatingDoubles: true, duprRatingSingles: true,
        },
      },
    },
  });

  // Build member data with preferences and histories
  const membersWithData = await Promise.all(
    clubMembers.map(async (cf: any) => {
      const preference = await prisma.userPlayPreference.findUnique({
        where: { userId_clubId: { userId: cf.user.id, clubId: session.clubId } },
      });
      const history = await buildBookingHistory(prisma, cf.user.id);
      return {
        member: toMemberData(cf.user),
        preference: toPreferenceData(preference),
        history,
      };
    })
  );

  const recommendations = generateSlotFillerRecommendations({
    session: {
      ...session,
      confirmedCount: session._count.bookings,
    },
    members: membersWithData,
    alreadyBookedUserIds,
  });

  // Log the recommendation
  await prisma.aIRecommendationLog.create({
    data: {
      clubId: session.clubId,
      playSessionId: session.id,
      type: 'SLOT_FILLER',
      inputData: { sessionId: session.id, memberCount: membersWithData.length },
      recommendations: recommendations.slice(0, input.limit).map(r => ({
        userId: r.member.id, score: r.score, likelihood: r.estimatedLikelihood,
      })),
    },
  });

  return {
    session: {
      id: session.id,
      title: session.title,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      format: session.format,
      skillLevel: session.skillLevel,
      maxPlayers: session.maxPlayers,
      confirmedCount: session._count.bookings,
      spotsRemaining: session.maxPlayers - session._count.bookings,
    },
    recommendations: recommendations.slice(0, input.limit),
    totalCandidatesScored: membersWithData.length,
  };
}

/**
 * intelligence.getWeeklyPlan
 * Generate a personalized weekly session plan for a player
 */
export async function getWeeklyPlan(prisma: any, input: z.infer<typeof weeklyPlanInput>) {
  const { userId, clubId } = input;

  // Get user
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, image: true, gender: true, city: true,
      duprRatingDoubles: true, duprRatingSingles: true,
    },
  });

  // Get preference
  const preference = await prisma.userPlayPreference.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });

  if (!preference) {
    return {
      plan: null,
      needsPreferences: true,
      message: 'Set your play preferences first to get personalized recommendations.',
    };
  }

  // Get upcoming sessions for next 14 days
  const now = new Date();
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const upcomingSessions = await prisma.playSession.findMany({
    where: {
      clubId,
      status: 'SCHEDULED',
      date: { gte: now, lte: twoWeeksLater },
    },
    include: {
      clubCourt: true,
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
    orderBy: { date: 'asc' },
  });

  // Get user's existing bookings
  const existingBookings = await prisma.playSessionBooking.findMany({
    where: { userId, status: 'CONFIRMED', playSession: { clubId, date: { gte: now } } },
    select: { playSessionId: true },
  });

  const existingBookingSessionIds = new Set(existingBookings.map((b: any) => b.playSessionId));

  // Get booking history
  const history = await buildBookingHistory(prisma, userId);

  // Generate plan
  const plan = generateWeeklyPlan({
    user: toMemberData(user),
    preference: toPreferenceData(preference)!,
    upcomingSessions: upcomingSessions.map((s: any) => ({
      ...s,
      confirmedCount: s._count.bookings,
    })),
    history,
    existingBookingSessionIds,
  });

  // Log
  await prisma.aIRecommendationLog.create({
    data: {
      clubId,
      userId,
      type: 'WEEKLY_PLAN',
      inputData: { userId, clubId, targetSessions: preference.targetSessionsPerWeek },
      recommendations: plan.recommendedSessions.map(r => ({
        sessionId: r.session.id, score: r.score,
      })),
    },
  });

  return { plan, needsPreferences: false, message: null };
}

/**
 * intelligence.getReactivationCandidates
 * Identify inactive members and suggest who to re-engage
 */
export async function getReactivationCandidates(
  prisma: any,
  input: z.infer<typeof reactivationInput>
) {
  const { clubId, inactivityDays, limit } = input;

  // Get club members
  const members = await prisma.clubFollower.findMany({
    where: { clubId },
    include: {
      user: {
        select: {
          id: true, email: true, name: true, image: true, gender: true, city: true,
          duprRatingDoubles: true, duprRatingSingles: true,
        },
      },
    },
  });

  // Build data for each member
  const membersWithData = await Promise.all(
    members.map(async (cf: any) => {
      const preference = await prisma.userPlayPreference.findUnique({
        where: { userId_clubId: { userId: cf.user.id, clubId } },
      });
      const history = await buildBookingHistory(prisma, cf.user.id);
      return {
        member: toMemberData(cf.user),
        preference: toPreferenceData(preference),
        history,
      };
    })
  );

  // Get upcoming sessions
  const upcomingSessions = await prisma.playSession.findMany({
    where: { clubId, status: 'SCHEDULED', date: { gte: new Date() } },
    include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
  });

  const candidates = generateReactivationCandidates({
    members: membersWithData,
    upcomingSessions: upcomingSessions.map((s: any) => ({ ...s, confirmedCount: s._count.bookings })),
    inactivityThresholdDays: inactivityDays,
  });

  return {
    candidates: candidates.slice(0, limit),
    totalInactiveMembers: candidates.length,
    totalClubMembers: members.length,
    inactivityThresholdDays: inactivityDays,
  };
}

/**
 * intelligence.sendInvites - Send invites to recommended users (MOCK)
 */
export async function sendInvites(prisma: any, input: z.infer<typeof sendInviteInput>) {
  const session = await prisma.playSession.findUniqueOrThrow({
    where: { id: input.sessionId },
    select: { id: true, title: true, date: true, startTime: true },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: input.userIds } },
    select: { id: true, name: true, email: true },
  });

  // MOCK: In production, send email/SMS via Resend/Twilio
  console.log(`\n[MOCK INVITE] Session: ${session.title} on ${session.date}`);
  users.forEach((u: any) => {
    console.log(`  → Would send invite to ${u.name} (${u.email})`);
  });
  if (input.message) {
    console.log(`  Message: ${input.message}`);
  }

  return {
    sessionId: session.id,
    invitedCount: users.length,
    invitedUsers: users,
    status: 'mock_sent',
  };
}

/**
 * play.preferences.upsert - Set or update user play preferences
 */
export async function upsertPreferences(prisma: any, input: z.infer<typeof preferencesInput>) {
  return prisma.userPlayPreference.upsert({
    where: { userId_clubId: { userId: input.userId, clubId: input.clubId } },
    create: { ...input, isActive: true },
    update: { ...input },
  });
}

/**
 * play.preferences.get - Get user preferences for a club
 */
export async function getPreferences(prisma: any, userId: string, clubId: string) {
  return prisma.userPlayPreference.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
}

// Export input schemas for use in tRPC router definition
export const intelligenceSchemas = {
  slotFillerInput,
  weeklyPlanInput,
  reactivationInput,
  sendInviteInput,
  preferencesInput,
};
