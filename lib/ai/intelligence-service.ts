/**
 * Intelligence tRPC Router
 * AI-powered recommendations for clubs and players
 */

import { z } from 'zod';
import { generateSlotFillerRecommendations } from './slot-filler';
import { generateWeeklyPlan } from './weekly-planner';
import { generateReactivationCandidates } from './reactivation';
import { sendReactivationEmail } from '../email';
import { sendSms, buildReactivationSms } from '../sms';
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

const sendReactivationInput = z.object({
  clubId: z.string().uuid(),
  candidates: z.array(z.object({
    memberId: z.string().uuid(),
    channel: z.enum(['email', 'sms', 'both']),
  })),
  customMessage: z.string().max(500).optional(),
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

  const alreadyBookedUserIds: Set<string> = new Set(session.bookings.map((b: any) => b.userId));

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
      userId: membersWithData[0]?.member?.id || 'system',
      sessionId: session.id,
      type: 'SLOT_FILLER',
      reasoning: {
        inputSessionId: session.id,
        memberCount: membersWithData.length,
        topRecommendations: recommendations.slice(0, input.limit).map(r => ({
          userId: r.member.id, score: r.score, likelihood: r.estimatedLikelihood,
        })),
      },
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
    select: { sessionId: true },
  });

  const existingBookingSessionIds: Set<string> = new Set(existingBookings.map((b: any) => b.sessionId));

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
      reasoning: {
        targetSessions: preference.targetSessionsPerWeek,
        recommendedSessions: plan.recommendedSessions.map(r => ({
          sessionId: r.session.id, score: r.score,
        })),
      },
    },
  });

  return { plan, needsPreferences: false, message: null };
}

// ── CSV fallback: build reactivation data from document_embeddings ──

interface CsvSessionMeta {
  date: string; startTime: string; endTime: string; court: string
  format: string; skillLevel: string; registered: number
  capacity: number; occupancy: number; playerNames: string[]
  pricePerPlayer?: number | null
}

function matchPlayerName(userName: string | null, csvNames: string[]): string | null {
  if (!userName) return null
  const lower = userName.toLowerCase().trim()
  // Exact match (case-insensitive)
  for (const csv of csvNames) {
    if (csv.toLowerCase().trim() === lower) return csv
  }
  // Partial: CSV name contains user name or vice versa (for "John" vs "John Smith")
  for (const csv of csvNames) {
    const csvLower = csv.toLowerCase().trim()
    if (csvLower.includes(lower) || lower.includes(csvLower)) return csv
  }
  return null
}

async function buildCsvReactivationData(
  prisma: any,
  clubId: string,
  members: Array<{ user: any }>,
): Promise<{
  membersWithData: Array<{ member: MemberData; preference: UserPlayPreferenceData | null; history: BookingHistory }>
  upcomingSessions: any[]
  totalPlayersFromCsv: number
} | null> {
  // Load CSV sessions from document_embeddings (same query as Dashboard V2)
  let csvSessions: CsvSessionMeta[] = []
  try {
    const rows = await prisma.$queryRaw<Array<{ metadata: any }>>`
      SELECT metadata FROM document_embeddings
      WHERE club_id = ${clubId}::uuid
        AND content_type = 'session'
        AND source_table = 'csv_import'
    `
    csvSessions = rows
      .map((r: any) => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as CsvSessionMeta)
      .filter((m: CsvSessionMeta) => m && m.date && m.capacity > 0)
  } catch {
    return null
  }

  if (csvSessions.length === 0) return null

  // Build player activity map from CSV
  const now = new Date()
  const allPlayerNames = new Set<string>()
  const playerActivity = new Map<string, { lastDate: string; totalSessions: number; sessionsLast7d: number; sessionsLast30d: number }>()

  // Use CSV's latest date as reference (data may be historical)
  const allDates = csvSessions.map(s => s.date).sort()
  const latestDateStr = allDates[allDates.length - 1]
  const latestDate = new Date(latestDateStr + 'T23:59:59')
  const d7Str = new Date(latestDate.getTime() - 7 * 86400000).toISOString().slice(0, 10)
  const d30Str = new Date(latestDate.getTime() - 30 * 86400000).toISOString().slice(0, 10)

  for (const s of csvSessions) {
    for (const name of (s.playerNames || [])) {
      allPlayerNames.add(name)
      const existing = playerActivity.get(name) || { lastDate: '', totalSessions: 0, sessionsLast7d: 0, sessionsLast30d: 0 }
      existing.totalSessions++
      if (s.date > existing.lastDate) existing.lastDate = s.date
      if (s.date >= d7Str) existing.sessionsLast7d++
      if (s.date >= d30Str) existing.sessionsLast30d++
      playerActivity.set(name, existing)
    }
  }

  const allCsvNames = Array.from(allPlayerNames)

  // Batch-load all preferences in one query (instead of N individual findUnique calls)
  const memberUserIds = members.map((cf: any) => cf.user.id)
  let allPreferences: any[] = []
  try {
    allPreferences = await prisma.userPlayPreference.findMany({
      where: { userId: { in: memberUserIds }, clubId },
    })
  } catch {
    // Preferences table might be empty or missing — not critical
  }
  const prefMap = new Map(allPreferences.map((p: any) => [p.userId, p]))

  // Build member data with CSV-based history (no more DB queries in loop)
  const membersWithData = members.map((cf: any) => {
    const preference = prefMap.get(cf.user.id) || null
    const matchedName = matchPlayerName(cf.user.name, allCsvNames)
    const activity = matchedName ? playerActivity.get(matchedName) : null

    let history: BookingHistory
    if (activity) {
      const lastActivityDate = new Date(activity.lastDate + 'T23:59:59')
      const daysSince = Math.floor((latestDate.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
      history = {
        totalBookings: activity.totalSessions,
        bookingsLastWeek: activity.sessionsLast7d,
        bookingsLastMonth: activity.sessionsLast30d,
        daysSinceLastConfirmedBooking: daysSince,
        cancelledCount: 0,
        noShowCount: 0,
        inviteAcceptanceRate: 1.0,
      }
    } else {
      history = {
        totalBookings: 0, bookingsLastWeek: 0, bookingsLastMonth: 0,
        daysSinceLastConfirmedBooking: null, cancelledCount: 0,
        noShowCount: 0, inviteAcceptanceRate: 0.5,
      }
    }

    return {
      member: toMemberData(cf.user),
      preference: toPreferenceData(preference),
      history,
    }
  })

  // Build "virtual" upcoming sessions from CSV (sessions with spots available)
  const fmtLabels: Record<string, string> = {
    OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
    LEAGUE_PLAY: 'League', SOCIAL: 'Social',
  }
  const upcomingSessions = csvSessions
    .filter(s => s.registered < s.capacity)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map((s, i) => ({
      id: `csv-react-${i}`,
      title: `${fmtLabels[s.format] || s.format} @ ${s.court}`,
      date: new Date(s.date),
      startTime: s.startTime,
      endTime: s.endTime,
      format: s.format,
      skillLevel: s.skillLevel || 'ALL_LEVELS',
      maxPlayers: s.capacity,
      confirmedCount: s.registered,
      status: 'SCHEDULED',
      spotsRemaining: s.capacity - s.registered,
    }))

  return { membersWithData, upcomingSessions, totalPlayersFromCsv: allPlayerNames.size }
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

  // Get club name for message generation
  const club = await prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { name: true },
  });

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

  let membersWithData: Array<{ member: MemberData; preference: UserPlayPreferenceData | null; history: BookingHistory }>
  let upcomingSessions: any[]
  let totalMembers = members.length

  // ── Fast check: does PlaySessionBooking have ANY data for these members? ──
  const memberUserIds = members.map((cf: any) => cf.user.id)
  let hasRealBookings = false
  if (memberUserIds.length > 0) {
    try {
      const firstBooking = await prisma.playSessionBooking.findFirst({
        where: { userId: { in: memberUserIds } },
        select: { id: true },
      })
      hasRealBookings = !!firstBooking
    } catch {
      // Table might not exist — treat as empty
      hasRealBookings = false
    }
  }

  if (hasRealBookings) {
    // ── Real DB path: build from PlaySessionBooking ──
    membersWithData = await Promise.all(
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
    upcomingSessions = await prisma.playSession.findMany({
      where: { clubId, status: 'SCHEDULED', date: { gte: new Date() } },
      include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
    });
  } else {
    // ── CSV Fallback: build from document_embeddings ──
    const csvData = members.length > 0
      ? await buildCsvReactivationData(prisma, clubId, members)
      : null;

    if (csvData) {
      membersWithData = csvData.membersWithData;
      upcomingSessions = csvData.upcomingSessions;
      totalMembers = Math.max(members.length, csvData.totalPlayersFromCsv)
    } else {
      // No CSV data either — return empty histories
      membersWithData = members.map((cf: any) => ({
        member: toMemberData(cf.user),
        preference: null,
        history: {
          totalBookings: 0, bookingsLastWeek: 0, bookingsLastMonth: 0,
          daysSinceLastConfirmedBooking: null, cancelledCount: 0,
          noShowCount: 0, inviteAcceptanceRate: 0.5,
        },
      }));
      upcomingSessions = [];
    }
  }

  const candidates = generateReactivationCandidates({
    members: membersWithData,
    upcomingSessions: (upcomingSessions as any[]).map((s: any) => ({
      ...s,
      confirmedCount: s.confirmedCount ?? s._count?.bookings ?? 0,
    })),
    inactivityThresholdDays: inactivityDays,
  });

  return {
    candidates: candidates.slice(0, limit),
    totalInactiveMembers: candidates.length,
    totalClubMembers: totalMembers,
    inactivityThresholdDays: inactivityDays,
    clubName: club.name,
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
 * intelligence.sendReactivationMessages
 * Send email and/or SMS to inactive members to bring them back
 */
export async function sendReactivationMessages(
  prisma: any,
  input: z.infer<typeof sendReactivationInput>
) {
  const { clubId, candidates: candidateInputs, customMessage } = input

  // Load club info
  const club = await prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { id: true, name: true, slug: true },
  })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  const appUrl = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`

  // Load users
  const memberIds = candidateInputs.map(c => c.memberId)
  const users: Array<{ id: string; email: string; name: string | null }> = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, email: true, name: true },
  })
  const usersById = new Map(users.map(u => [u.id, u]))

  // Get reactivation data (candidates with suggested sessions)
  const members = await prisma.clubFollower.findMany({
    where: { clubId, userId: { in: memberIds } },
    include: {
      user: {
        select: {
          id: true, email: true, name: true, image: true, gender: true, city: true,
          duprRatingDoubles: true, duprRatingSingles: true,
        },
      },
    },
  })

  const membersWithData = await Promise.all(
    members.map(async (cf: any) => {
      const preference = await prisma.userPlayPreference.findUnique({
        where: { userId_clubId: { userId: cf.user.id, clubId } },
      })
      const history = await buildBookingHistory(prisma, cf.user.id)
      return {
        member: toMemberData(cf.user),
        preference: toPreferenceData(preference),
        history,
      }
    })
  )

  // Get upcoming sessions for suggestions
  const upcomingSessions = await prisma.playSession.findMany({
    where: { clubId, status: 'SCHEDULED', date: { gte: new Date() } },
    include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
  })

  const reactivationData = generateReactivationCandidates({
    members: membersWithData,
    upcomingSessions: upcomingSessions.map((s: any) => ({ ...s, confirmedCount: s._count.bookings })),
    inactivityThresholdDays: 7, // get all so we can match by memberId
  })

  const candidateDataById = new Map(reactivationData.map(c => [c.member.id, c]))
  const bookingUrl = `${appUrl}/clubs/${club.slug || club.id}/play`

  const results: Array<{ memberId: string; channel: string; status: string; error?: string }> = []

  for (const candidateInput of candidateInputs) {
    const user = usersById.get(candidateInput.memberId)
    if (!user) {
      results.push({ memberId: candidateInput.memberId, channel: candidateInput.channel, status: 'failed', error: 'User not found' })
      continue
    }

    const reactivation = candidateDataById.get(candidateInput.memberId)
    const suggestedSessions = (reactivation?.suggestedSessions || []).slice(0, 3).map((s: any) => ({
      title: s.title || 'Open Play',
      date: s.date instanceof Date ? s.date.toLocaleDateString() : String(s.date),
      startTime: s.startTime || '',
      endTime: s.endTime || '',
      format: s.format || 'OPEN_PLAY',
      spotsLeft: Math.max(0, (s.maxPlayers || 8) - (s.confirmedCount || 0)),
    }))
    const daysSince = reactivation?.daysSinceLastActivity || 0

    // ── Send Email ──
    if (candidateInput.channel === 'email' || candidateInput.channel === 'both') {
      try {
        if (!user.email) throw new Error('No email address')
        await sendReactivationEmail({
          to: user.email,
          memberName: user.name || 'there',
          clubName: club.name,
          daysSinceLastActivity: daysSince,
          suggestedSessions,
          bookingUrl,
          customMessage,
        })
        results.push({ memberId: user.id, channel: 'email', status: 'sent' })
      } catch (err: any) {
        results.push({ memberId: user.id, channel: 'email', status: 'failed', error: err.message })
      }
    }

    // ── Send SMS ──
    if (candidateInput.channel === 'sms' || candidateInput.channel === 'both') {
      // Note: User model doesn't have a phone field yet — SMS will fail gracefully
      results.push({
        memberId: user.id,
        channel: 'sms',
        status: 'failed',
        error: 'Phone number not available (field not yet in User model)',
      })
    }

    // Log to DB
    try {
      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: user.id,
          type: 'REACTIVATION',
          reasoning: {
            channel: candidateInput.channel,
            daysSinceLastActivity: daysSince,
            suggestedSessionCount: suggestedSessions.length,
            customMessage: customMessage || null,
          },
          status: results.filter(r => r.memberId === user.id && r.status === 'sent').length > 0 ? 'sent' : 'failed',
        },
      })
    } catch (logErr) {
      console.error('[Reactivation] Failed to log recommendation:', logErr)
    }
  }

  const sent = results.filter(r => r.status === 'sent').length
  const failed = results.filter(r => r.status === 'failed').length

  return { sent, failed, results }
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
  sendReactivationInput,
  preferencesInput,
};
