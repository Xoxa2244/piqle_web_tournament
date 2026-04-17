/**
 * Hybrid Slot Filler: SQL pre-filter + JS rich re-rank
 *
 * STATUS: lib available, NOT yet wired into the tRPC router.
 *
 * Why this file exists:
 *   Two implementations of slot-filler scoring drifted apart —
 *   inline SQL in server/routers/intelligence.ts (UI) vs the rich
 *   scorer in lib/ai/slot-filler.ts (cron + advisor). This module
 *   unifies them using an industry-standard hybrid recommender pattern.
 *
 * How to wire it in (when ready — requires committing intelligence.ts
 * WIP first, otherwise CI breaks on untracked lib/ai/* imports):
 *   1. Replace the inline SQL path in router's getSlotFillerRecommendations
 *      with a call to this function.
 *   2. Update intelligence-service.getSlotFillerRecommendations to be a
 *      thin wrapper around this (single source of truth).
 *   3. Update integration tests to assert both pre-filter + rich scorer.
 *
 * Why this pattern (SQL pre-filter → JS re-rank):
 *   1. SQL pre-filter — fast scan of play_session_bookings, returns top 100
 *      candidates by booking-pattern match. Excludes Suspended/Expired.
 *      ~20ms even at 100k bookings.
 *   2. Batch-load rich data for survivors only (O(100) not O(10k)).
 *   3. JS rich re-rank — generateSlotFillerRecommendations scores the 100
 *      with full 6-factor logic (format, skill, time, dow, court, recency)
 *      plus persona, DUPR, social proof.
 *   4. Return top N (5-20) with full reasoning.
 *
 * Same function called from UI, cron, advisor → identical ranking everywhere.
 */

import { generateSlotFillerRecommendations } from './slot-filler'
import {
  buildBookingHistory,
  toMemberData,
  toPreferenceData,
} from './intelligence-service-helpers'
import { resolvePreferences } from './inferred-preferences'
import type {
  BookingHistory,
  MemberData,
  UserPlayPreferenceData,
  BookingWithSession,
  PlaySessionData,
  SlotFillerRecommendation,
} from '../../types/intelligence'

// How many candidates the SQL pre-filter returns before JS re-ranking.
// Larger = more chance to catch hidden-gem members who have low booking_count
// but strong preference match. Smaller = faster re-rank. 100 is the sweet spot
// for clubs up to ~20k members.
const DEFAULT_PREFILTER_SIZE = 100

export interface HybridSlotFillerInput {
  sessionId: string
  limit: number
  /** Override pre-filter pool size (advanced). Default 100. */
  prefilterSize?: number
}

export interface HybridSlotFillerOutput {
  session: {
    id: string
    title: string | null
    date: Date
    startTime: string | null
    endTime: string | null
    format: string | null
    skillLevel: string | null
    maxPlayers: number
    confirmedCount: number
    spotsRemaining: number
  }
  recommendations: SlotFillerRecommendation[]
  totalCandidatesScored: number
  prefilterSize: number
}

interface PrefilterRow {
  user_id: string
  booking_count: number
  days_since_last: number | null
}

/**
 * SQL pre-filter: rank members by booking pattern match, return top N candidate IDs.
 * Stays within Postgres — no N+1, no JSON serialization of rich data.
 */
async function runPrefilter(
  prisma: any,
  args: {
    clubId: string
    format: string | null
    startTime: string | null
    courtId: string | null
    skillLevel: string | null
    date: Date | null
    alreadyBookedUserIds: Set<string>
    limit: number
  },
): Promise<PrefilterRow[]> {
  const { clubId, format, startTime, courtId, skillLevel, date, limit } = args

  const since = new Date()
  since.setDate(since.getDate() - 90)
  const sessionHour = startTime ? parseInt(startTime.split(':')[0] || '0', 10) : -1
  const fmt = format || ''
  const crtId = courtId || ''
  const skill = skillLevel || 'ALL_LEVELS'
  const sessionDow = date ? date.getDay() : -1

  // Fast scan over booking history with weighted scoring. Excludes Suspended
  // and Expired members via document_embeddings membership metadata.
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      b."userId" AS user_id,
      COUNT(*)::int AS booking_count,
      (CURRENT_DATE - MAX(ps.date)::date)::int AS days_since_last
    FROM play_session_bookings b
    JOIN play_sessions ps ON ps.id = b."sessionId"
    WHERE ps."clubId" = $1
      AND ps.date >= $5
      AND b.status::text = 'CONFIRMED'
      AND NOT EXISTS (
        SELECT 1 FROM document_embeddings de
        WHERE de.source_id = b."userId"
          AND de.content_type = 'member'
          AND de.source_table = 'csv_import'
          AND de.club_id = $1
          AND de.metadata->>'membershipStatus' IN ('Suspended', 'Expired')
      )
    GROUP BY b."userId"
    HAVING (CURRENT_DATE - MAX(ps.date)::date) <= 60
    ORDER BY (
      COUNT(*)
      + COUNT(*) FILTER (WHERE ps.format::text = $2) * 3
      + COUNT(*) FILTER (WHERE ps."skillLevel"::text = $7) * 4
      + CASE WHEN $3 >= 0 THEN COUNT(*) FILTER (WHERE ABS(EXTRACT(HOUR FROM ps."startTime"::time) - $3) <= 1) * 2 ELSE 0 END
      + CASE WHEN $8 >= 0 THEN COUNT(*) FILTER (WHERE EXTRACT(DOW FROM ps.date) = $8) * 2 ELSE 0 END
      + COUNT(*) FILTER (WHERE ps."courtId"::text = $4)
      - (CURRENT_DATE - MAX(ps.date)::date)
    ) DESC
    LIMIT $6
    `,
    clubId,
    fmt,
    sessionHour,
    crtId,
    since,
    limit,
    skill,
    sessionDow,
  )

  // Filter out already-booked users
  return (rows as any[])
    .map((r: any) => ({
      user_id: r.user_id,
      booking_count: Number(r.booking_count) || 0,
      days_since_last: r.days_since_last != null ? Number(r.days_since_last) : null,
    }))
    .filter((r) => !args.alreadyBookedUserIds.has(r.user_id))
}

/**
 * Load rich per-candidate data in batch (no N+1).
 * Returns the shape that generateSlotFillerRecommendations expects.
 */
async function loadRichCandidateData(
  prisma: any,
  candidateIds: string[],
  clubId: string,
): Promise<
  Array<{
    member: MemberData
    preference: UserPlayPreferenceData | null
    history: BookingHistory
  }>
> {
  if (candidateIds.length === 0) return []

  const [users, preferences, bookings] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        gender: true,
        city: true,
        duprRatingDoubles: true,
        duprRatingSingles: true,
      },
    }),
    prisma.userPlayPreference.findMany({
      where: { userId: { in: candidateIds }, clubId },
    }),
    prisma.playSessionBooking.findMany({
      where: { userId: { in: candidateIds } },
      select: {
        userId: true,
        status: true,
        bookedAt: true,
        playSession: {
          select: { date: true, startTime: true, format: true, category: true },
        },
      },
      orderBy: { bookedAt: 'desc' },
      take: candidateIds.length * 50,
    }),
  ])

  const prefMap = new Map(preferences.map((p: any) => [p.userId, p]))
  const bookingsByUser = new Map<string, any[]>()
  for (const b of bookings as any[]) {
    if (!bookingsByUser.has(b.userId)) bookingsByUser.set(b.userId, [])
    bookingsByUser.get(b.userId)!.push(b)
  }

  const results = await Promise.all(
    (users as any[]).map(async (user: any) => {
      const history = await buildBookingHistory(prisma, user.id)
      const userBookings = (bookingsByUser.get(user.id) || []).slice(0, 50)
      const bookingsForInference: BookingWithSession[] = userBookings
        .filter((b: any) => b.playSession)
        .map((b: any) => ({
          status: b.status,
          session: {
            date: b.playSession.date,
            startTime: b.playSession.startTime,
            format: b.playSession.format,
            category: b.playSession.category,
          },
        }))

      const preference = prefMap.get(user.id) || null
      return {
        member: toMemberData(user),
        preference: resolvePreferences(
          toPreferenceData(preference),
          bookingsForInference,
        ),
        history,
      }
    }),
  )

  return results
}

/**
 * MAIN ENTRY POINT — hybrid slot filler recommendations.
 *
 * Future wiring:
 *   - tRPC `intelligence.getSlotFillerRecommendations` (UI)
 *   - Advisor flow (when proposing slot fill drafts)
 *   - Cron `slot-filler-automation.ts` (agent auto-invite)
 *
 * Consistency guarantee: same input → same output across all callers.
 */
export async function getHybridSlotFillerRecommendations(
  prisma: any,
  input: HybridSlotFillerInput,
): Promise<HybridSlotFillerOutput> {
  const prefilterSize = input.prefilterSize ?? DEFAULT_PREFILTER_SIZE

  const session = await prisma.playSession.findUniqueOrThrow({
    where: { id: input.sessionId },
    include: {
      clubCourt: true,
      bookings: {
        where: { status: 'CONFIRMED' },
        select: { userId: true },
      },
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
  })

  const alreadyBookedUserIds = new Set<string>(
    session.bookings.map((b: any) => b.userId),
  )

  const prefiltered = await runPrefilter(prisma, {
    clubId: session.clubId,
    format: session.format as string | null,
    startTime: session.startTime,
    courtId: session.clubCourt?.id || null,
    skillLevel: session.skillLevel as string | null,
    date: session.date,
    alreadyBookedUserIds,
    limit: prefilterSize,
  })

  if (prefiltered.length === 0) {
    return {
      session: sessionSummary(session),
      recommendations: [],
      totalCandidatesScored: 0,
      prefilterSize,
    }
  }

  const candidateIds = prefiltered.map((r) => r.user_id)
  const membersWithData = await loadRichCandidateData(
    prisma,
    candidateIds,
    session.clubId,
  )

  const sessionData: PlaySessionData & { confirmedCount: number } = {
    ...session,
    confirmedCount: session._count.bookings,
  } as any

  const recommendations = generateSlotFillerRecommendations({
    session: sessionData,
    members: membersWithData,
    alreadyBookedUserIds,
  })

  await prisma.aIRecommendationLog
    .create({
      data: {
        clubId: session.clubId,
        userId: membersWithData[0]?.member?.id || 'system',
        sessionId: session.id,
        type: 'SLOT_FILLER',
        reasoning: {
          inputSessionId: session.id,
          prefilterSize,
          prefilterCandidates: prefiltered.length,
          richScoredCandidates: membersWithData.length,
          topRecommendations: recommendations.slice(0, input.limit).map((r) => ({
            userId: r.member.id,
            score: r.score,
            likelihood: r.estimatedLikelihood,
          })),
        },
      },
    })
    .catch(() => {
      /* tracking-only, don't fail request */
    })

  return {
    session: sessionSummary(session),
    recommendations: recommendations.slice(0, input.limit),
    totalCandidatesScored: membersWithData.length,
    prefilterSize,
  }
}

function sessionSummary(session: any) {
  return {
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
  }
}
