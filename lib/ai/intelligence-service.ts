/**
 * Intelligence tRPC Router
 * AI-powered recommendations for clubs and players
 */

import { z } from 'zod';
import { generateSlotFillerRecommendations } from './slot-filler';
import { generateWeeklyPlan } from './weekly-planner';
import { generateReactivationCandidates } from './reactivation';
import { generateEventRecommendations, type CsvSessionMeta as EventCsvMeta } from './event-recommendations';
import { classifyArchetype } from './reactivation-messages';
import { detectPersona, persistPersona, generatePersonalizedInvite, type BehaviorSignals, type PlayerPersona } from './persona';
import { selectBestVariant } from './variant-optimizer';
import { sendReactivationEmail, sendEventInviteEmail, sendSlotFillerInviteEmail } from '../email';
import { sendSms, buildReactivationSms, buildSlotFillerSms } from '../sms';
import { checkAntiSpam } from './anti-spam';
import { resolvePreferences } from './inferred-preferences';
import type { BookingHistory, UserPlayPreferenceData, MemberData, BookingWithSession } from '../../types/intelligence';

// ── Persona Detection & Persistence ──

/**
 * Detect personas for a batch of members and persist to DB.
 * Called during slot filler / reactivation scoring.
 * Non-blocking — errors don't affect main flow.
 */
async function detectAndPersistPersonas(
  prisma: any,
  clubId: string,
  membersWithData: Array<{ member: MemberData; history: BookingHistory; preference?: UserPlayPreferenceData | null }>
): Promise<void> {
  try {
    const updates = membersWithData
      .filter(m => m.history.totalBookings >= 3) // Need enough data
      .map(m => {
        const h = m.history;
        // Build signals from available BookingHistory fields
        // Fields not in BookingHistory default to 0/false — persona detection
        // will still work with partial data (lower confidence)
        const signals: BehaviorSignals = {
          formatCounts: {},
          totalBookings: h.totalBookings,
          cancelRate: h.cancelledCount / Math.max(h.totalBookings, 1),
          noShowRate: h.noShowCount / Math.max(h.totalBookings, 1),
          averageBookingsPerWeek: h.bookingsLastMonth / 4,
          clinicCount: 0,
          drillCount: 0,
          openPlayCount: h.totalBookings, // assume open play if no format breakdown
          leaguePlayCount: 0,
          socialCount: 0,
          tournamentCount: 0,
          hasDuprLinked: !!m.member.duprRatingDoubles,
          duprRating: m.member.duprRatingDoubles ?? null,
          weeklyConsistencyScore: 0,
          prefersSameTimeSlots: false,
          booksWithSamePeople: false,
          joinedViaInvite: Math.round(h.inviteAcceptanceRate * h.totalBookings),
        };
        const profile = detectPersona(signals);
        return { userId: m.member.id, profile };
      });

    // Batch persist (fire-and-forget, don't await all)
    await Promise.allSettled(
      updates.map(u => persistPersona(prisma, u.userId, clubId, u.profile))
    );

    if (updates.length > 0) {
      console.log(`[Persona] Detected & persisted ${updates.length} personas for club ${clubId}`);
    }
  } catch (err) {
    console.error('[Persona] Failed to detect/persist personas:', err);
  }
}

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
  sessionId: z.string().min(1),
  clubId: z.string().uuid(),
  candidates: z.array(z.object({
    memberId: z.string(),
    channel: z.enum(['email', 'sms', 'both']),
    customMessage: z.string().max(1000).optional(),
  })),
});

const eventRecommendationInput = z.object({
  clubId: z.string().uuid(),
  limit: z.number().int().min(1).max(10).default(5),
});

const sendReactivationInput = z.object({
  clubId: z.string().uuid(),
  candidates: z.array(z.object({
    memberId: z.string().uuid(),
    channel: z.enum(['email', 'sms', 'both']),
  })),
  customMessage: z.string().max(500).optional(),
});

const sendEventInviteInput = z.object({
  clubId: z.string().uuid(),
  eventTitle: z.string(),
  eventDate: z.string(),
  eventTime: z.string(),
  eventPrice: z.number().optional(),
  candidates: z.array(z.object({
    memberId: z.string(),
    channel: z.enum(['email', 'sms', 'both']),
    customMessage: z.string().max(1000),
  })),
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

export async function buildBookingHistory(prisma: any, userId: string): Promise<BookingHistory> {
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

  // Batch-load preferences and bookings to avoid N+1 queries
  const memberUserIds = clubMembers.map((cf: any) => cf.user.id)

  const [allPreferences, allBookingsRaw] = await Promise.all([
    prisma.userPlayPreference.findMany({
      where: { userId: { in: memberUserIds }, clubId: session.clubId },
    }),
    prisma.playSessionBooking.findMany({
      where: { userId: { in: memberUserIds } },
      select: {
        userId: true, status: true, bookedAt: true,
        playSession: { select: { date: true, startTime: true, format: true, category: true } },
      },
      orderBy: { bookedAt: 'desc' },
    }),
  ])

  const prefMap = new Map(allPreferences.map((p: any) => [p.userId, p]))

  // Group bookings by userId
  const bookingsByUser = new Map<string, typeof allBookingsRaw>()
  for (const b of allBookingsRaw) {
    if (!bookingsByUser.has(b.userId)) bookingsByUser.set(b.userId, [])
    bookingsByUser.get(b.userId)!.push(b)
  }

  // Build member data with batch-loaded preferences and histories
  const membersWithData = await Promise.all(
    clubMembers.map(async (cf: any) => {
      const preference = prefMap.get(cf.user.id) || null
      const history = await buildBookingHistory(prisma, cf.user.id)
      const userBookings = (bookingsByUser.get(cf.user.id) || []).slice(0, 50)
      const bookingsForInference: BookingWithSession[] = userBookings
        .filter((b: any) => b.playSession)
        .map((b: any) => ({ status: b.status, session: { date: b.playSession.date, startTime: b.playSession.startTime, format: b.playSession.format, category: b.playSession.category } }))
      return {
        member: toMemberData(cf.user),
        preference: resolvePreferences(toPreferenceData(preference), bookingsForInference),
        history,
      }
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

  // Detect & persist personas (non-blocking)
  detectAndPersistPersonas(prisma, session.clubId, membersWithData);

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
 * intelligence.getSlotFillerRecommendationsCsv
 * CSV fallback for slot filler — uses document_embeddings instead of PlaySession tables
 */
export async function getSlotFillerRecommendationsCsv(
  prisma: any,
  input: { sessionId: string; clubId: string; limit: number }
) {
  const { sessionId, clubId, limit } = input

  // 1. Load CSV sessions from document_embeddings
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
  } catch (err) {
    console.warn('[SlotFiller CSV] query failed for club', clubId, err)
    throw new Error('Failed to load CSV sessions')
  }

  if (csvSessions.length === 0) {
    throw new Error('No CSV sessions found')
  }

  // 2. Find the target session by csv-{index}
  const csvIndex = parseInt(sessionId.replace('csv-', ''), 10)
  // Sort the same way as V2 dashboard to ensure stable indices
  const sorted = [...csvSessions].sort((a, b) => {
    const occDiff = a.occupancy - b.occupancy
    if (occDiff !== 0) return occDiff
    return a.date.localeCompare(b.date)
  })
  const targetSession = sorted[csvIndex]
  if (!targetSession) {
    throw new Error(`CSV session at index ${csvIndex} not found`)
  }

  // 3. Build virtual PlaySession-like object
  const virtualSession = {
    id: sessionId,
    clubId,
    clubCourtId: null,
    title: `${targetSession.format.replace(/_/g, ' ')} — ${targetSession.court}`,
    description: null,
    format: targetSession.format,
    skillLevel: targetSession.skillLevel || 'ALL_LEVELS',
    date: new Date(targetSession.date + 'T00:00:00'),
    startTime: targetSession.startTime,
    endTime: targetSession.endTime,
    maxPlayers: targetSession.capacity,
    priceInCents: targetSession.pricePerPlayer ? Math.round(targetSession.pricePerPlayer * 100) : null,
    hostUserId: null,
    status: 'SCHEDULED',
    confirmedCount: targetSession.registered,
  }

  // 4. Load club members
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
  })

  // 5. Build player activity map from CSV data
  const allPlayerNames = new Set<string>()
  const playerActivity = new Map<string, { lastDate: string; totalSessions: number; sessionsLast7d: number; sessionsLast30d: number }>()

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

  // 6. Build already-booked set from CSV player names for this session
  const alreadyBookedUserIds = new Set<string>()
  for (const cf of members) {
    const matchedName = matchPlayerName(cf.user.name, targetSession.playerNames || [])
    if (matchedName) alreadyBookedUserIds.add(cf.user.id)
  }

  // 7. Batch-load preferences
  const memberUserIds = members.map((cf: any) => cf.user.id)
  let allPreferences: any[] = []
  try {
    allPreferences = await prisma.userPlayPreference.findMany({
      where: { userId: { in: memberUserIds }, clubId },
    })
  } catch { /* not critical */ }
  const prefMap = new Map(allPreferences.map((p: any) => [p.userId, p]))

  // 8. Build member data with CSV-based history
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

  // 9. Add virtual members for CSV-only players
  const virtualMembers = buildVirtualCsvMembers(members, allCsvNames, playerActivity, latestDate)
  const allMembers = [...membersWithData, ...virtualMembers]

  // 10. Run scoring
  const recommendations = generateSlotFillerRecommendations({
    session: virtualSession as any,
    members: allMembers,
    alreadyBookedUserIds,
  })

  return {
    session: {
      id: sessionId,
      title: virtualSession.title,
      date: virtualSession.date,
      startTime: virtualSession.startTime,
      endTime: virtualSession.endTime,
      format: virtualSession.format,
      skillLevel: virtualSession.skillLevel,
      maxPlayers: virtualSession.maxPlayers,
      confirmedCount: virtualSession.confirmedCount,
      spotsRemaining: virtualSession.maxPlayers - virtualSession.confirmedCount,
    },
    recommendations: recommendations.slice(0, limit),
    totalCandidatesScored: allMembers.length,
  }
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

  // Get preference (DB or inferred from bookings)
  const preference = await prisma.userPlayPreference.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });

  // Load bookings for inference fallback
  const bookingsRaw = await prisma.playSessionBooking.findMany({
    where: { userId },
    select: { status: true, playSession: { select: { date: true, startTime: true, format: true, category: true } } },
    orderBy: { bookedAt: 'desc' },
    take: 50,
  });
  const bookingsForInference: BookingWithSession[] = bookingsRaw
    .filter((b: any) => b.playSession)
    .map((b: any) => ({ status: b.status, session: { date: b.playSession.date, startTime: b.playSession.startTime, format: b.playSession.format, category: b.playSession.category } }));

  const resolvedPref = resolvePreferences(toPreferenceData(preference), bookingsForInference);

  if (!resolvedPref) {
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
    preference: resolvedPref,
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

function normalizeForMatch(s: string): string {
  return s.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]/g, '') // remove non-alphanumeric (keep spaces)
    .replace(/\s+/g, ' ')
}

function matchPlayerName(userName: string | null, csvNames: string[]): string | null {
  if (!userName) return null
  const norm = normalizeForMatch(userName)
  if (!norm) return null
  // Pass 1: Exact normalized match
  for (const csv of csvNames) {
    if (normalizeForMatch(csv) === norm) return csv
  }
  // Pass 2: Substring match (for "John" vs "John Smith")
  for (const csv of csvNames) {
    const csvNorm = normalizeForMatch(csv)
    if (csvNorm.includes(norm) || norm.includes(csvNorm)) return csv
  }
  // Pass 3: First name + last initial ("John S" ↔ "John Smith")
  const parts = norm.split(' ')
  if (parts.length >= 2) {
    const firstName = parts[0]
    const lastInitial = parts[parts.length - 1][0]
    for (const csv of csvNames) {
      const csvParts = normalizeForMatch(csv).split(' ')
      if (csvParts.length >= 2) {
        const csvFirst = csvParts[0]
        const csvLastInitial = csvParts[csvParts.length - 1][0]
        if (firstName === csvFirst && lastInitial === csvLastInitial) return csv
        if (csvFirst === firstName && csvParts[csvParts.length - 1] === parts[parts.length - 1].slice(0, 1)) return csv
      }
    }
  }
  return null
}

function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

function buildVirtualCsvMembers(
  existingMembers: Array<{ user: any }>,
  allCsvNames: string[],
  playerActivity: Map<string, { lastDate: string; totalSessions: number; sessionsLast7d: number; sessionsLast30d: number }>,
  latestDate: Date,
): Array<{ member: MemberData; preference: UserPlayPreferenceData | null; history: BookingHistory }> {
  // Find which CSV names are already matched to existing members
  const matchedCsvNames = new Set<string>()
  for (const cf of existingMembers) {
    const matched = matchPlayerName(cf.user.name, allCsvNames)
    if (matched) matchedCsvNames.add(matched)
  }

  // Create virtual members for unmatched CSV names
  const virtualMembers: Array<{ member: MemberData; preference: UserPlayPreferenceData | null; history: BookingHistory }> = []
  for (const csvName of allCsvNames) {
    if (matchedCsvNames.has(csvName)) continue

    const activity = playerActivity.get(csvName)
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

    virtualMembers.push({
      member: {
        id: `csv-${hashStr(csvName)}`,
        email: '',
        name: csvName,
        image: null,
        gender: null,
        city: null,
        duprRatingDoubles: null,
        duprRatingSingles: null,
      },
      preference: null,
      history,
    })
  }
  return virtualMembers
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
      priceInCents: s.pricePerPlayer ? Math.round(s.pricePerPlayer * 100) : null,
      confirmedCount: s.registered,
      status: 'SCHEDULED',
      spotsRemaining: s.capacity - s.registered,
    }))

  // Add virtual members for CSV-only players (not matched to any clubFollower)
  const virtualMembers = buildVirtualCsvMembers(members, allCsvNames, playerActivity, latestDate)

  return { membersWithData: [...membersWithData, ...virtualMembers], upcomingSessions, totalPlayersFromCsv: allPlayerNames.size }
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
    // ── Real DB path: bulk fetch all data, then map per-member ──
    // Replaces N×3 individual queries with 2 bulk queries
    const [allPreferences, allBookingsRaw] = await Promise.all([
      prisma.userPlayPreference.findMany({
        where: { userId: { in: memberUserIds }, clubId },
      }),
      prisma.playSessionBooking.findMany({
        where: { userId: { in: memberUserIds } },
        select: {
          userId: true,
          status: true,
          bookedAt: true,
          playSession: { select: { date: true, startTime: true, format: true, category: true, clubId: true } },
        },
        orderBy: { bookedAt: 'desc' },
      }),
    ]);

    const preferenceMap = new Map(allPreferences.map((p: any) => [p.userId, p]));
    const bookingsByUser = new Map<string, any[]>();
    for (const b of allBookingsRaw) {
      if (!b.playSession || b.playSession.clubId !== clubId) continue;
      if (!bookingsByUser.has(b.userId)) bookingsByUser.set(b.userId, []);
      bookingsByUser.get(b.userId)!.push(b);
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    membersWithData = members.map((cf: any) => {
      const userBookings = bookingsByUser.get(cf.user.id) ?? [];
      const confirmed = userBookings.filter((b: any) => b.status === 'CONFIRMED');
      const lastConfirmed = confirmed[0];
      const daysSinceLast = lastConfirmed
        ? Math.floor((now.getTime() - new Date(lastConfirmed.bookedAt).getTime()) / 86400000)
        : null;

      const history: BookingHistory = {
        totalBookings: userBookings.length,
        bookingsLastWeek: confirmed.filter((b: any) => new Date(b.bookedAt) >= sevenDaysAgo).length,
        bookingsLastMonth: confirmed.filter((b: any) => new Date(b.bookedAt) >= thirtyDaysAgo).length,
        daysSinceLastConfirmedBooking: daysSinceLast,
        cancelledCount: userBookings.filter((b: any) => b.status === 'CANCELLED').length,
        noShowCount: userBookings.filter((b: any) => b.status === 'NO_SHOW').length,
        inviteAcceptanceRate: userBookings.length > 0 ? confirmed.length / userBookings.length : 0.5,
      };

      const bookingsForInference: BookingWithSession[] = userBookings
        .slice(0, 50)
        .filter((b: any) => b.playSession)
        .map((b: any) => ({ status: b.status, session: { date: b.playSession.date, startTime: b.playSession.startTime, format: b.playSession.format, category: b.playSession.category } }));

      const preference = preferenceMap.get(cf.user.id) ?? null;
      return {
        member: toMemberData(cf.user),
        preference: resolvePreferences(toPreferenceData(preference), bookingsForInference),
        history,
        bookings: bookingsForInference,
      };
    });
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

  // Classify player archetypes for hyper-personalized messaging
  for (const c of candidates) {
    c.archetype = classifyArchetype({
      totalBookings: c.totalHistoricalBookings,
      daysSinceLastActivity: c.daysSinceLastActivity,
      noShowRate: c.bookingHistory
        ? c.bookingHistory.noShowCount / Math.max(c.bookingHistory.totalBookings, 1)
        : 0,
      duprRating: c.member.duprRatingDoubles,
      preferredDays: c.preference?.preferredDays,
      preferredFormats: c.preference?.preferredFormats,
    })
  }

  // Detect & persist personas (non-blocking)
  detectAndPersistPersonas(prisma, clubId, membersWithData);

  // Enrich with last outreach tracking from AIRecommendationLog
  try {
    const candidateIds = candidates.map(c => c.member.id)
    if (candidateIds.length > 0) {
      const logs = await prisma.aIRecommendationLog.findMany({
        where: { clubId, userId: { in: candidateIds }, type: 'REACTIVATION' },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, createdAt: true, reasoning: true, status: true },
      })
      // Group by userId (first = most recent due to orderBy desc)
      const lastContactMap = new Map<string, typeof logs[0]>()
      for (const log of logs) {
        if (!lastContactMap.has(log.userId)) {
          lastContactMap.set(log.userId, log)
        }
      }
      for (const c of candidates) {
        const log = lastContactMap.get(c.member.id)
        if (log) {
          c.lastContactedAt = log.createdAt.toISOString()
          // Extract channel from reasoning JSON if available
          const r = log.reasoning as Record<string, any> | null
          c.lastContactChannel = r?.channel || 'email'
          c.lastContactStatus = log.status === 'sent' ? 'sent' : log.status === 'failed' ? 'failed' : 'sent'
        }
      }
    }
  } catch (err) {
    console.warn('[Reactivation] Failed to load last contact data', err)
  }

  console.log(`[Reactivation] clubId=${clubId} members=${members.length} hasRealBookings=${hasRealBookings} candidates=${candidates.length} threshold=${inactivityDays}`)

  return {
    candidates: candidates.slice(0, limit),
    totalInactiveMembers: candidates.length,
    totalClubMembers: totalMembers,
    inactivityThresholdDays: inactivityDays,
    clubName: club.name,
    _debug: { memberCount: members.length, hasRealBookings, candidateCount: candidates.length },
  };
}

/**
 * intelligence.sendInvites - Send invites to recommended users for a session
 */
export async function sendInvites(prisma: any, input: z.infer<typeof sendInviteInput>) {
  const { sessionId, clubId, candidates: candidateInputs } = input

  // Load club
  const club = await prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { id: true, name: true, slug: true },
  })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  const appUrl = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`
  const bookingUrl = `${appUrl}/clubs/${club.slug || club.id}/play`

  // Load session data (handle CSV vs real)
  let sessionData: { title: string; date: string; time: string; spotsLeft: number }
  if (sessionId.startsWith('csv-')) {
    // CSV fallback: read session metadata from document_embeddings
    try {
      const csvRows = await prisma.$queryRaw<Array<{ metadata: any }>>`
        SELECT metadata FROM document_embeddings
        WHERE club_id = ${clubId}
          AND content_type = 'session'
          AND source_table = 'csv_import'
        ORDER BY (metadata->>'occupancy_percent')::float ASC,
                 metadata->>'date' ASC
      `
      const idx = parseInt(sessionId.replace('csv-', ''), 10)
      const meta = csvRows[idx]?.metadata
      if (!meta) throw new Error(`CSV session ${sessionId} not found`)
      sessionData = {
        title: meta.title || meta.format || 'Open Play',
        date: meta.date || '',
        time: meta.start_time ? `${meta.start_time}–${meta.end_time || ''}` : '',
        spotsLeft: Math.max(0, (meta.max_players || 8) - (meta.confirmed_count || 0)),
      }
    } catch (err: any) {
      throw new Error(`Failed to load CSV session: ${err.message}`)
    }
  } else {
    const session = await prisma.playSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
    })
    sessionData = {
      title: session.title || 'Open Play',
      date: session.date instanceof Date ? session.date.toLocaleDateString() : String(session.date),
      time: session.startTime ? `${session.startTime}–${session.endTime || ''}` : '',
      spotsLeft: Math.max(0, (session.maxPlayers || 8) - session._count.bookings),
    }
  }

  // Filter out csv- members (virtual, no real user in DB)
  const realCandidates = candidateInputs.filter(c => !c.memberId.startsWith('csv-'))
  const csvSkipped = candidateInputs.length - realCandidates.length

  // Load users
  const memberIds = realCandidates.map(c => c.memberId)
  const users: Array<{ id: string; email: string; name: string | null; phone: string | null; smsOptIn: boolean }> = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, email: true, name: true, phone: true, smsOptIn: true },
  })
  const usersById = new Map(users.map(u => [u.id, u]))

  // Load personas for personalized messaging
  const preferences = await prisma.userPlayPreference.findMany({
    where: { userId: { in: memberIds }, clubId },
    select: { userId: true, detectedPersona: true },
  })
  const personaByUserId = new Map<string, PlayerPersona>(
    preferences
      .filter((p: any) => p.detectedPersona)
      .map((p: any) => [p.userId, p.detectedPersona as PlayerPersona])
  )

  const results: Array<{ memberId: string; channel: string; status: string; error?: string }> = []

  for (const candidate of realCandidates) {
    const user = usersById.get(candidate.memberId)
    if (!user) {
      results.push({ memberId: candidate.memberId, channel: candidate.channel, status: 'failed', error: 'User not found' })
      continue
    }

    // Anti-spam check
    const spamCheck = await checkAntiSpam({
      prisma,
      userId: user.id,
      clubId,
      type: 'SLOT_FILLER',
      sessionId: sessionId.startsWith('csv-') ? null : sessionId,
    })
    if (!spamCheck.allowed) {
      results.push({ memberId: user.id, channel: candidate.channel, status: 'skipped', error: spamCheck.reason })
      continue
    }

    // Generate persona-aware message (falls back to default if no persona)
    const persona = personaByUserId.get(user.id)
    let personalizedSubject: string | undefined
    let personalizedBody: string | undefined

    if (persona && !candidate.customMessage) {
      const invite = generatePersonalizedInvite({
        playerName: user.name || 'there',
        persona,
        sessionTitle: sessionData.title,
        sessionDate: sessionData.date,
        sessionTime: sessionData.time,
        sessionFormat: 'OPEN_PLAY',
        skillLevel: 'ALL_LEVELS',
        confirmedCount: 0,
        maxPlayers: 8,
        spotsRemaining: sessionData.spotsLeft,
        duprRating: null,
      })
      personalizedSubject = invite.subject
      personalizedBody = invite.body
    }

    // Send email
    if (candidate.channel === 'email' || candidate.channel === 'both') {
      try {
        if (!user.email) throw new Error('No email address')
        await sendSlotFillerInviteEmail({
          to: user.email,
          memberName: user.name || 'there',
          clubName: club.name,
          sessionTitle: sessionData.title,
          sessionDate: sessionData.date,
          sessionTime: sessionData.time,
          spotsLeft: sessionData.spotsLeft,
          bookingUrl,
          customMessage: candidate.customMessage || personalizedBody,
          customSubject: personalizedSubject,
        })
        results.push({ memberId: user.id, channel: 'email', status: 'sent' })
      } catch (err: any) {
        results.push({ memberId: user.id, channel: 'email', status: 'failed', error: err.message })
      }
    }

    // Send SMS (only if user opted in)
    if (candidate.channel === 'sms' || candidate.channel === 'both') {
      try {
        const phone = user.phone
        if (!phone) throw new Error('Phone number not available')
        const smsOptIn = user.smsOptIn
        if (!smsOptIn) throw new Error('User has not opted in to SMS')
        const body = buildSlotFillerSms({
          memberName: user.name || 'there',
          clubName: club.name,
          sessionTitle: sessionData.title,
          sessionDate: sessionData.date,
          sessionTime: sessionData.time,
          spotsLeft: sessionData.spotsLeft,
          bookingUrl,
          customMessage: candidate.customMessage || personalizedBody,
        })
        await sendSms({ to: phone, body })
        results.push({ memberId: user.id, channel: 'sms', status: 'sent' })
      } catch (err: any) {
        results.push({ memberId: user.id, channel: 'sms', status: 'failed', error: err.message })
      }
    }

    // Log to DB
    try {
      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: user.id,
          type: 'SLOT_FILLER',
          sessionId: sessionId.startsWith('csv-') ? null : sessionId,
          channel: candidate.channel,
          reasoning: {
            sessionTitle: sessionData.title,
            sessionDate: sessionData.date,
            persona: persona || null,
            customMessage: candidate.customMessage || null,
          },
          status: results.filter(r => r.memberId === user.id && r.status === 'sent').length > 0 ? 'sent' : 'failed',
        },
      })
    } catch (logErr) {
      console.error('[SlotFiller] Failed to log recommendation:', logErr)
    }
  }

  const sent = results.filter(r => r.status === 'sent').length
  const failed = results.filter(r => r.status === 'failed').length

  return { sent, failed, csvSkipped, results }
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
  const users: Array<{ id: string; email: string; name: string | null; phone: string | null; smsOptIn: boolean }> = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, email: true, name: true, phone: true, smsOptIn: true },
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
      const bookingsRaw = await prisma.playSessionBooking.findMany({
        where: { userId: cf.user.id },
        select: { status: true, playSession: { select: { date: true, startTime: true, format: true, category: true } } },
        orderBy: { bookedAt: 'desc' },
        take: 50,
      })
      const bookingsForInference: BookingWithSession[] = bookingsRaw
        .filter((b: any) => b.playSession)
        .map((b: any) => ({ status: b.status, session: { date: b.playSession.date, startTime: b.playSession.startTime, format: b.playSession.format, category: b.playSession.category } }))
      return {
        member: toMemberData(cf.user),
        preference: resolvePreferences(toPreferenceData(preference), bookingsForInference),
        history,
        bookings: bookingsForInference,
      }
    })
  )

  // Get upcoming sessions for suggestions (with booking data for social proof)
  const upcomingSessions = await prisma.playSession.findMany({
    where: { clubId, status: 'SCHEDULED', date: { gte: new Date() } },
    include: {
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
      bookings: {
        where: { status: 'CONFIRMED' },
        select: { user: { select: { duprRatingDoubles: true } } },
      },
    },
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

    // Anti-spam check
    const spamCheck = await checkAntiSpam({
      prisma, userId: user.id, clubId, type: 'REACTIVATION',
    })
    if (!spamCheck.allowed) {
      results.push({ memberId: user.id, channel: candidateInput.channel, status: 'skipped', error: spamCheck.reason })
      continue
    }

    const reactivation = candidateDataById.get(candidateInput.memberId)
    const suggestedSessions = (reactivation?.suggestedSessions || []).slice(0, 3).map((s: any) => {
      const confirmedCount = s.confirmedCount || s._count?.bookings || 0
      const spotsLeft = Math.max(0, (s.maxPlayers || 8) - confirmedCount)
      return {
        title: s.title || 'Open Play',
        date: s.date instanceof Date ? s.date.toLocaleDateString() : String(s.date),
        startTime: s.startTime || '',
        endTime: s.endTime || '',
        format: s.format || 'OPEN_PLAY',
        spotsLeft,
        confirmedCount,
        deepLinkUrl: `${appUrl}/clubs/${club.slug || club.id}/play?session=${s.id}`,
      }
    })
    const daysSince = reactivation?.daysSinceLastActivity || 0
    const firstSessionDeepLink = suggestedSessions[0]?.deepLinkUrl || bookingUrl

    // Generate Notify Me link for this member (fire-and-forget if it fails)
    let notifyMeUrl: string | undefined
    try {
      const { generateInterestToken } = await import('@/lib/utils/interest-token')
      const token = generateInterestToken(user.id, clubId)
      notifyMeUrl = `${appUrl}/notify-me?t=${token}`
    } catch {
      // Non-critical — email sends without CTA
    }

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
          bookingUrl: firstSessionDeepLink,
          customMessage,
          notifyMeUrl,
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
          channel: candidateInput.channel,
          reasoning: {
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
 * intelligence.sendEventInviteMessages
 * Send personalized event invite emails/SMS to matched players
 */
export async function sendEventInviteMessages(
  prisma: any,
  input: z.infer<typeof sendEventInviteInput>
) {
  const { clubId, eventTitle, eventDate, eventTime, eventPrice, candidates: candidateInputs } = input

  const club = await prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { id: true, name: true, slug: true },
  })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  const appUrl = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`
  const bookingUrl = `${appUrl}/clubs/${club.slug || club.id}/play`

  // Filter out csv- members (no real user in DB)
  const realCandidates = candidateInputs.filter(c => !c.memberId.startsWith('csv-'))
  const csvSkipped = candidateInputs.length - realCandidates.length

  // Load users
  const memberIds = realCandidates.map(c => c.memberId)
  const users: Array<{ id: string; email: string; name: string | null; phone: string | null; smsOptIn: boolean }> = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, email: true, name: true, phone: true, smsOptIn: true },
  })
  const usersById = new Map(users.map(u => [u.id, u]))

  const results: Array<{ memberId: string; channel: string; status: string; error?: string }> = []

  for (const candidate of realCandidates) {
    const user = usersById.get(candidate.memberId)
    if (!user) {
      results.push({ memberId: candidate.memberId, channel: candidate.channel, status: 'failed', error: 'User not found' })
      continue
    }

    // Anti-spam check
    const spamCheck = await checkAntiSpam({
      prisma, userId: user.id, clubId, type: 'EVENT_INVITE',
    })
    if (!spamCheck.allowed) {
      results.push({ memberId: user.id, channel: candidate.channel, status: 'skipped', error: spamCheck.reason })
      continue
    }

    // Send email
    if (candidate.channel === 'email' || candidate.channel === 'both') {
      try {
        if (!user.email) throw new Error('No email address')
        await sendEventInviteEmail({
          to: user.email,
          memberName: user.name || 'there',
          clubName: club.name,
          eventTitle,
          eventDate,
          eventTime,
          eventPrice: eventPrice || 0,
          bookingUrl,
          customMessage: candidate.customMessage,
        })
        results.push({ memberId: user.id, channel: 'email', status: 'sent' })
      } catch (err: any) {
        results.push({ memberId: user.id, channel: 'email', status: 'failed', error: err.message })
      }
    }

    // Send SMS (only if user opted in)
    if (candidate.channel === 'sms' || candidate.channel === 'both') {
      try {
        const phone = user.phone
        if (!phone) throw new Error('Phone number not available')
        const smsOptIn = user.smsOptIn
        if (!smsOptIn) throw new Error('User has not opted in to SMS')
        await sendSms({ to: phone, body: candidate.customMessage })
        results.push({ memberId: user.id, channel: 'sms', status: 'sent' })
      } catch (err: any) {
        results.push({ memberId: user.id, channel: 'sms', status: 'failed', error: err.message })
      }
    }

    // Log to DB
    try {
      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: user.id,
          type: 'EVENT_INVITE',
          channel: candidate.channel,
          reasoning: {
            eventTitle,
            eventDate,
            customMessage: candidate.customMessage,
          },
          status: results.filter(r => r.memberId === user.id && r.status === 'sent').length > 0 ? 'sent' : 'failed',
        },
      })
    } catch (logErr) {
      console.error('[EventInvite] Failed to log recommendation:', logErr)
    }
  }

  const sent = results.filter(r => r.status === 'sent').length
  const failed = results.filter(r => r.status === 'failed').length

  return { sent, failed, csvSkipped, results }
}

// ── CSV fallback: build event data from document_embeddings ──

async function buildCsvEventData(
  prisma: any,
  clubId: string,
  members: Array<{ user: any }>,
): Promise<{
  membersWithData: Array<{ member: MemberData; preference: UserPlayPreferenceData | null; history: BookingHistory }>
  csvSessions: EventCsvMeta[]
} | null> {
  // Load CSV sessions (same query as reactivation)
  let csvSessions: EventCsvMeta[] = []
  try {
    const rows = await prisma.$queryRaw<Array<{ metadata: any }>>`
      SELECT metadata FROM document_embeddings
      WHERE club_id = ${clubId}::uuid
        AND content_type = 'session'
        AND source_table = 'csv_import'
    `
    csvSessions = rows
      .map((r: any) => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as EventCsvMeta)
      .filter((m: EventCsvMeta) => m && m.date && m.capacity > 0)
  } catch (err) {
    console.warn('[Events] buildCsvEventData CSV query failed for club', clubId, err)
    return null
  }

  // Fallback: if no embeddings, check play_sessions table directly
  if (csvSessions.length === 0) {
    try {
      const dbSessions = await prisma.playSession.findMany({
        where: { clubId },
        include: {
          _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          clubCourt: { select: { name: true } },
        },
      })
      if (dbSessions.length > 0) {
        csvSessions = dbSessions.map((s: any) => ({
          date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10),
          startTime: s.startTime,
          endTime: s.endTime,
          court: s.clubCourt?.name || '',
          format: s.format,
          skillLevel: s.skillLevel,
          registered: s._count.bookings,
          capacity: s.maxPlayers,
          occupancy: s.maxPlayers > 0 ? Math.round((s._count.bookings / s.maxPlayers) * 100) : 0,
          playerNames: [],
        }))
      }
    } catch (err) {
      console.warn('[Events] buildCsvEventData play_sessions fallback failed for club', clubId, err)
    }
  }

  if (csvSessions.length === 0) return null

  // Build player activity map from CSV (same logic as buildCsvReactivationData)
  const allPlayerNames = new Set<string>()
  const playerActivity = new Map<string, { lastDate: string; totalSessions: number; sessionsLast7d: number; sessionsLast30d: number }>()

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

  // Batch-load preferences
  const memberUserIds = members.map((cf: any) => cf.user.id)
  let allPreferences: any[] = []
  try {
    allPreferences = await prisma.userPlayPreference.findMany({
      where: { userId: { in: memberUserIds }, clubId },
    })
  } catch { /* not critical */ }
  const prefMap = new Map(allPreferences.map((p: any) => [p.userId, p]))

  // Build member data with CSV-based history
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

  // Add virtual members for CSV-only players (not matched to any clubFollower)
  const virtualMembers = buildVirtualCsvMembers(members, allCsvNames, playerActivity, latestDate)

  return { membersWithData: [...membersWithData, ...virtualMembers], csvSessions }
}

/**
 * intelligence.getEventRecommendations
 * AI-generated event suggestions based on player clusters and occupancy
 */
export async function getEventRecommendations(
  prisma: any,
  input: z.infer<typeof eventRecommendationInput>
) {
  const { clubId, limit } = input

  // 1. Load club members
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
  })

  // 2. Count available courts
  let courtCount = 4
  try {
    const count = await prisma.clubCourt.count({
      where: { clubId, isActive: true },
    })
    if (count > 0) courtCount = count
  } catch { /* default */ }

  // 3. Check for real bookings
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
      hasRealBookings = false
    }
  }

  // 4. Build member data + session data
  let membersWithData: Array<{ member: MemberData; preference: UserPlayPreferenceData | null; history: BookingHistory }>
  let csvSessions: EventCsvMeta[] = []

  if (!hasRealBookings) {
    // CSV fallback (primary path for prod)
    const csvData = await buildCsvEventData(prisma, clubId, members)
    if (csvData) {
      membersWithData = csvData.membersWithData
      csvSessions = csvData.csvSessions
    } else {
      // No data — build minimal members
      membersWithData = members.map((cf: any) => ({
        member: toMemberData(cf.user),
        preference: null,
        history: {
          totalBookings: 0, bookingsLastWeek: 0, bookingsLastMonth: 0,
          daysSinceLastConfirmedBooking: null, cancelledCount: 0,
          noShowCount: 0, inviteAcceptanceRate: 0.5,
        },
      }))
    }
  } else {
    // Real DB path
    membersWithData = await Promise.all(
      members.map(async (cf: any) => {
        const preference = await prisma.userPlayPreference.findUnique({
          where: { userId_clubId: { userId: cf.user.id, clubId } },
        })
        const history = await buildBookingHistory(prisma, cf.user.id)
        const bookingsRaw = await prisma.playSessionBooking.findMany({
          where: { userId: cf.user.id },
          select: { status: true, playSession: { select: { date: true, startTime: true, format: true, category: true } } },
          orderBy: { bookedAt: 'desc' },
          take: 50,
        })
        const bookingsForInference: BookingWithSession[] = bookingsRaw
          .filter((b: any) => b.playSession)
          .map((b: any) => ({ status: b.status, session: { date: b.playSession.date, startTime: b.playSession.startTime, format: b.playSession.format, category: b.playSession.category } }))
        return { member: toMemberData(cf.user), preference: resolvePreferences(toPreferenceData(preference), bookingsForInference), history }
      })
    )
    // Load real sessions as CSV-like format for scoring
    const sessions = await prisma.playSession.findMany({
      where: { clubId },
      include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
    })
    csvSessions = sessions.map((s: any) => ({
      date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      court: '',
      format: s.format,
      skillLevel: s.skillLevel,
      registered: s._count.bookings,
      capacity: s.maxPlayers,
      occupancy: s.maxPlayers > 0 ? Math.round((s._count.bookings / s.maxPlayers) * 100) : 0,
      playerNames: [],
    }))
  }

  // 5. Generate recommendations
  const events = generateEventRecommendations({
    members: membersWithData,
    csvSessions,
    courtCount,
  })

  return {
    events: events.slice(0, limit),
    totalPlayersAnalyzed: membersWithData.length,
    totalSessionsAnalyzed: csvSessions.length,
    generatedAt: new Date().toISOString(),
    needsCsvImport: csvSessions.length === 0 && !hasRealBookings && !(await prisma.playSession.findFirst({ where: { clubId }, select: { id: true } })),
  }
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

// ── Health-Based Outreach: CHECK_IN + RETENTION_BOOST ──

const sendOutreachInput = z.object({
  clubId: z.string().uuid(),
  memberId: z.string(),
  type: z.enum(['CHECK_IN', 'RETENTION_BOOST']),
  channel: z.enum(['email', 'sms', 'both']).default('email'),
  variantId: z.string().optional(),
  healthScore: z.number().optional(),
  riskLevel: z.string().optional(),
  lowComponents: z.array(z.object({
    key: z.string(),
    label: z.string(),
    score: z.number(),
  })).optional(),
  daysSinceLastActivity: z.number().nullable().optional(),
  preferredDays: z.array(z.string()).optional(),
  suggestedSessionTitle: z.string().optional(),
  totalBookings: z.number().optional(),
})

export async function sendOutreachMessage(
  prisma: any,
  input: z.infer<typeof sendOutreachInput>
) {
  const {
    clubId, memberId, type, channel, variantId,
    healthScore, riskLevel, lowComponents,
    daysSinceLastActivity, preferredDays, suggestedSessionTitle, totalBookings,
  } = input

  // Load club
  const club = await prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { id: true, name: true, slug: true },
  })

  // Load user
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: memberId },
    select: { id: true, email: true, name: true, duprRatingDoubles: true },
  })

  // Anti-spam check
  const spamCheck = await checkAntiSpam({
    prisma, userId: user.id, clubId, type,
  })
  if (!spamCheck.allowed) {
    return { sent: 0, failed: 0, skipped: 1, reason: spamCheck.reason }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  const appUrl = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`
  const genericBookingUrl = `${appUrl}/clubs/${club.slug || club.id}/play`

  // Load upcoming sessions + find best match for this member
  const { findBestSessionForMember, formatSessionDate, formatSessionTime } = await import('./session-matcher')
  const { inferSkillLevel } = await import('./scoring')

  const upcomingSessions = await prisma.playSession.findMany({
    where: { clubId, status: 'SCHEDULED', date: { gte: new Date() } },
    include: {
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
      bookings: {
        where: { status: 'CONFIRMED' },
        select: { user: { select: { duprRatingDoubles: true } } },
      },
    },
    orderBy: { date: 'asc' },
    take: 20,
  })

  const memberPref = await prisma.userPlayPreference.findUnique({
    where: { userId_clubId: { userId: memberId, clubId } },
  })
  // Resolve preferences: use DB preference if set, otherwise infer from booking history
  const memberBookings = await prisma.playSessionBooking.findMany({
    where: { userId: memberId, playSession: { clubId } },
    select: { status: true, playSession: { select: { date: true, startTime: true, format: true, category: true } } },
  })
  const bookingsForInference: BookingWithSession[] = memberBookings
    .filter((b: any) => b.playSession)
    .map((b: any) => ({ status: b.status, session: { date: b.playSession.date, startTime: b.playSession.startTime, format: b.playSession.format, category: b.playSession.category } }))
  const resolvedPref = resolvePreferences(toPreferenceData(memberPref), bookingsForInference)

  const memberSkillLevel = inferSkillLevel(user.duprRatingDoubles ? Number(user.duprRatingDoubles) : null)

  const matched = findBestSessionForMember({
    memberSkillLevel,
    preference: resolvedPref,
    sessions: upcomingSessions,
    clubSlug: club.slug || club.id,
    appBaseUrl: appUrl,
  })

  // Generate messages
  const { generateOutreachMessages } = await import('./outreach-messages')
  const variants = generateOutreachMessages(type, {
    memberName: user.name || 'there',
    clubName: club.name,
    healthScore: healthScore || 50,
    riskLevel: (riskLevel || 'watch') as any,
    lowComponents: lowComponents || [],
    daysSinceLastActivity: daysSinceLastActivity ?? null,
    preferredDays,
    suggestedSessionTitle: matched?.session.title || suggestedSessionTitle,
    suggestedSessionDate: matched ? formatSessionDate(new Date(matched.session.date)) : undefined,
    suggestedSessionTime: matched ? formatSessionTime(matched.session.startTime, matched.session.endTime) : undefined,
    suggestedSessionFormat: matched?.session.format,
    confirmedCount: matched?.confirmedCount,
    sameLevelCount: matched?.sameLevelCount,
    spotsLeft: matched?.spotsLeft,
    totalBookings,
  })

  // Pick variant — use A/B optimizer when no explicit variantId is provided
  let variant: typeof variants[0]
  let optimizationReason: string = 'manual'
  if (variantId) {
    variant = variants.find(v => v.id === variantId) || variants.find(v => v.recommended) || variants[0]
    optimizationReason = 'manual'
  } else {
    try {
      const optimization = await selectBestVariant(prisma, clubId, type as any, variants)
      variant = variants.find(v => v.id === optimization.recommendedVariantId) || variants[0]
      optimizationReason = optimization.reason
    } catch {
      variant = variants.find(v => v.recommended) || variants[0]
      optimizationReason = 'default'
    }
  }

  const bookingUrl = matched?.deepLinkUrl || genericBookingUrl

  const results: Array<{ channel: string; status: string; error?: string }> = []

  // Send email
  if (channel === 'email' || channel === 'both') {
    try {
      if (!user.email) throw new Error('No email address')
      const { sendOutreachEmail } = await import('../email')
      await sendOutreachEmail({
        to: user.email,
        subject: variant.emailSubject,
        body: variant.emailBody,
        clubName: club.name,
        bookingUrl,
        sessionCard: matched ? {
          title: matched.session.title,
          date: formatSessionDate(new Date(matched.session.date)),
          time: formatSessionTime(matched.session.startTime, matched.session.endTime),
          format: matched.session.format,
          spotsLeft: matched.spotsLeft,
          confirmedCount: matched.confirmedCount,
          sameLevelCount: matched.sameLevelCount,
        } : undefined,
      })
      results.push({ channel: 'email', status: 'sent' })
    } catch (err: any) {
      results.push({ channel: 'email', status: 'failed', error: err.message })
    }
  }

  // Send SMS
  if (channel === 'sms' || channel === 'both') {
    results.push({
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
        type,
        channel,
        reasoning: {
          variantId: variant.id,
          optimizationReason,
          healthScore,
          riskLevel,
          lowComponents,
          daysSinceLastActivity,
        },
        status: results.some(r => r.status === 'sent') ? 'sent' : 'failed',
      },
    })
  } catch (logErr) {
    console.error(`[Outreach:${type}] Failed to log:`, logErr)
  }

  const sent = results.filter(r => r.status === 'sent').length
  const failed = results.filter(r => r.status === 'failed').length

  return { sent, failed, skipped: 0, results }
}

// Export input schemas for use in tRPC router definition
export const intelligenceSchemas = {
  slotFillerInput,
  weeklyPlanInput,
  reactivationInput,
  eventRecommendationInput,
  sendInviteInput,
  sendReactivationInput,
  sendEventInviteInput,
  sendOutreachInput,
  preferencesInput,
};
