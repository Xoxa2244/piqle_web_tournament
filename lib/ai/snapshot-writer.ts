/**
 * Daily MemberHealthSnapshot writer — P5-T1 follow-up fix.
 *
 * Standalone snapshot path that runs regardless of `automationSettings.enabled`.
 *
 * Why a separate module:
 *   - `lib/ai/campaign-engine.ts` has a per-club early-return when automation
 *     is disabled (line ~596). That makes sense for sending campaigns; it's
 *     wrong for snapshots, which are the data source for KPI deltas, cohort
 *     generators, attribution, etc. — features that must work even when a
 *     club hasn't turned on outreach yet.
 *   - This function gathers a minimal set of inputs (followers + last 60d
 *     bookings), computes health via the shared `generateMemberHealth`, then
 *     idempotently writes today's snapshot per active member.
 *
 * Idempotency: skips members who already have a snapshot dated TODAY.
 */

import { generateMemberHealth, getWeights } from './member-health'
import type { DayOfWeek, PlaySessionFormat } from '../../types/intelligence'

export interface SnapshotResult {
  clubId: string
  followersConsidered: number
  snapshotsCreated: number
  snapshotsSkipped: number
  errors: number
}

export async function snapshotAllActiveMembersForClub(
  prisma: any,
  clubId: string,
  now: Date = new Date(),
): Promise<SnapshotResult> {
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart.getTime() + 86400000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  // 1. Followers + minimal user fields needed by generateMemberHealth.
  const followers = await prisma.clubFollower.findMany({
    where: { clubId },
    select: {
      userId: true,
      createdAt: true,
      user: {
        select: {
          id: true, email: true, name: true, image: true,
          gender: true, city: true,
          duprRatingDoubles: true, duprRatingSingles: true,
          membershipType: true, membershipStatus: true,
        },
      },
    },
  })
  if (followers.length === 0) {
    return { clubId, followersConsidered: 0, snapshotsCreated: 0, snapshotsSkipped: 0, errors: 0 }
  }
  const userIds = followers
    .map((f: any) => f.userId)
    .filter((id: string | null): id is string => !!id)

  // 2. Last 60 days of bookings — one query, then bucket per user.
  const bookings = await prisma.playSessionBooking.findMany({
    where: {
      userId: { in: userIds },
      bookedAt: { gte: sixtyDaysAgo },
      playSession: { clubId },
    },
    select: {
      userId: true,
      status: true,
      bookedAt: true,
      playSession: { select: { date: true, startTime: true, format: true } },
    },
    orderBy: { bookedAt: 'desc' },
  })
  const bookingMap = new Map<string, any[]>()
  for (const b of bookings) {
    if (!b.userId) continue
    const list = bookingMap.get(b.userId) ?? []
    list.push(b)
    bookingMap.set(b.userId, list)
  }

  // 3. Existing-snapshot lookup so we can short-circuit duplicates.
  const todaySnapshots = await prisma.memberHealthSnapshot.findMany({
    where: {
      clubId,
      userId: { in: userIds },
      date: { gte: todayStart, lt: tomorrowStart },
    },
    select: { userId: true },
  })
  const alreadyHasToday = new Set<string>(
    todaySnapshots.map((s: any) => s.userId).filter((id: string | null): id is string => !!id),
  )

  // 4. Build minimal MemberHealthInput per follower; missing fields default
  //    inside generateMemberHealth.
  const memberInputs = followers.map((f: any) => {
    const userBookings = bookingMap.get(f.userId) ?? []
    const confirmed = userBookings.filter((b: any) => b.status === 'CONFIRMED')
    const lastConfirmedAt = confirmed[0]?.bookedAt ?? null
    const daysSinceLast = lastConfirmedAt
      ? Math.floor((now.getTime() - lastConfirmedAt.getTime()) / 86400000)
      : null
    const bookingsLast30 = confirmed.filter((b: any) => b.bookedAt >= thirtyDaysAgo).length
    const bookings30to60 = confirmed.filter(
      (b: any) => b.bookedAt >= sixtyDaysAgo && b.bookedAt < thirtyDaysAgo,
    ).length

    return {
      member: {
        id: f.user.id,
        email: f.user.email,
        name: f.user.name,
        image: f.user.image,
        gender: (f.user.gender as 'M' | 'F' | 'X') ?? null,
        city: f.user.city,
        duprRatingDoubles: f.user.duprRatingDoubles ? Number(f.user.duprRatingDoubles) : null,
        duprRatingSingles: f.user.duprRatingSingles ? Number(f.user.duprRatingSingles) : null,
      },
      preference: null, // snapshot doesn't need preference-tuned weights
      history: {
        totalBookings: userBookings.length,
        bookingsLastWeek: confirmed.filter(
          (b: any) => b.bookedAt >= new Date(now.getTime() - 7 * 86400000),
        ).length,
        bookingsLastMonth: bookingsLast30,
        daysSinceLastConfirmedBooking: daysSinceLast,
        cancelledCount: userBookings.filter((b: any) => b.status === 'CANCELLED').length,
        noShowCount: userBookings.filter((b: any) => b.status === 'NO_SHOW').length,
        inviteAcceptanceRate: 0.7,
      },
      joinedAt: f.createdAt ?? new Date(),
      bookingDates: userBookings.map((b: any) => ({
        date: b.bookedAt,
        status: b.status as 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
      })),
      previousPeriodBookings: bookings30to60,
      membershipInfo: {
        membership: f.user.membershipType || null,
        membershipStatus: f.user.membershipStatus || null,
        lastVisit: null,
        firstVisit: null,
        membershipMappings: undefined,
      },
    } as any
  })

  // 5. Compute health (uses club-tuned weights when available; falls back to defaults).
  let weights
  try {
    weights = await getWeights(prisma, clubId)
  } catch {
    weights = undefined
  }
  const healthData = generateMemberHealth(memberInputs, 99, weights)

  // 6. Persist — one row per member that doesn't already have a today-row.
  let created = 0
  let skipped = 0
  let errors = 0
  for (const member of healthData.members) {
    if (alreadyHasToday.has(member.memberId)) {
      skipped++
      continue
    }
    try {
      await prisma.memberHealthSnapshot.create({
        data: {
          clubId,
          userId: member.memberId,
          date: now,
          healthScore: member.healthScore,
          riskLevel: member.riskLevel,
          lifecycleStage: member.lifecycleStage,
          features: {},
        },
      })
      created++
    } catch {
      errors++
    }
  }

  return {
    clubId,
    followersConsidered: followers.length,
    snapshotsCreated: created,
    snapshotsSkipped: skipped,
    errors,
  }
}

/**
 * Loop variant — iterates every club. Used by the daily cron.
 */
export async function snapshotAllClubs(prisma: any): Promise<SnapshotResult[]> {
  const clubs = await prisma.club.findMany({ select: { id: true } })
  const results: SnapshotResult[] = []
  for (const club of clubs) {
    try {
      results.push(await snapshotAllActiveMembersForClub(prisma, club.id))
    } catch (err) {
      results.push({
        clubId: club.id,
        followersConsidered: 0,
        snapshotsCreated: 0,
        snapshotsSkipped: 0,
        errors: 1,
      })
    }
  }
  return results
}
