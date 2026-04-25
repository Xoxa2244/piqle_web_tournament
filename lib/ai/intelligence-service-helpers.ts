/**
 * Shared helpers used by intelligence-service and hybrid slot filler.
 * Split out to avoid circular imports when slot-filler-hybrid needs them too.
 */

import type {
  BookingHistory,
  MemberData,
  UserPlayPreferenceData,
} from '../../types/intelligence'

/** Compute booking history for a single user (week/month/lifetime counts). */
export async function buildBookingHistory(
  prisma: any,
  userId: string,
): Promise<BookingHistory> {
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [allBookings, lastWeek, lastMonth, lastConfirmed] = await Promise.all([
    prisma.playSessionBooking.count({ where: { userId } }),
    prisma.playSessionBooking.count({
      where: { userId, status: 'CONFIRMED', bookedAt: { gte: oneWeekAgo } },
    }),
    prisma.playSessionBooking.count({
      where: { userId, status: 'CONFIRMED', bookedAt: { gte: oneMonthAgo } },
    }),
    prisma.playSessionBooking.findFirst({
      where: { userId, status: 'CONFIRMED' },
      orderBy: { bookedAt: 'desc' },
      select: { bookedAt: true },
    }),
  ])

  const cancelled = await prisma.playSessionBooking.count({
    where: { userId, status: 'CANCELLED' },
  })
  const noShow = await prisma.playSessionBooking.count({
    where: { userId, status: 'NO_SHOW' },
  })

  const daysSince = lastConfirmed
    ? Math.floor(
        (now.getTime() - new Date(lastConfirmed.bookedAt).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null

  const total = allBookings || 1
  const acceptRate =
    total > 0 ? Math.max(0, (total - cancelled - noShow) / total) : 0.5

  return {
    totalBookings: allBookings,
    bookingsLastWeek: lastWeek,
    bookingsLastMonth: lastMonth,
    daysSinceLastConfirmedBooking: daysSince,
    cancelledCount: cancelled,
    noShowCount: noShow,
    inviteAcceptanceRate: acceptRate,
  }
}

/** Convert Prisma user row → MemberData (type used by scoring). */
export function toMemberData(user: any): MemberData {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    gender: user.gender,
    city: user.city,
    duprRatingDoubles: user.duprRatingDoubles
      ? Number(user.duprRatingDoubles)
      : null,
    duprRatingSingles: user.duprRatingSingles
      ? Number(user.duprRatingSingles)
      : null,
  }
}

/** Convert Prisma preference row → UserPlayPreferenceData (or null if missing). */
export function toPreferenceData(pref: any): UserPlayPreferenceData | null {
  if (!pref) return null
  return {
    id: pref.id,
    userId: pref.userId,
    clubId: pref.clubId,
    preferredDays: pref.preferredDays || [],
    preferredTimeSlots: pref.preferredTimeSlots || {
      morning: true,
      afternoon: true,
      evening: true,
    },
    skillLevel: pref.skillLevel,
    preferredFormats: pref.preferredFormats || [],
    targetSessionsPerWeek: pref.targetSessionsPerWeek,
    isActive: pref.isActive,
  }
}
