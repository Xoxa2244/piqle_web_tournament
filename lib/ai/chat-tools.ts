/**
 * AI Chat Tools — give the Advisor access to real club data
 *
 * These tools are called by the LLM via tool_use, not by the user directly.
 * Each tool queries the database and returns structured data that the LLM
 * formats into a human-readable response.
 */

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

// AI SDK tool() has strict overload types that reject union return types from try/catch.
// Cast to bypass TS while keeping runtime behavior correct.
const t = tool as (...args: any[]) => any

export function createChatTools(clubId: string): ToolSet {
  return {
    getMemberHealth: t({
      description:
        'Get member health scores and churn risk for all club members. Returns summary (total, healthy, watch, at_risk, critical counts) and top at-risk members with their scores. Use when the user asks about member health, churn risk, at-risk members, engagement, or who hasn\'t been coming.',
      parameters: z.object({
        filter: z.enum(['all', 'at_risk', 'critical', 'watch', 'healthy']).describe('Filter by risk level. Default: all'),
        limit: z.number().describe('Max members to return. Default: 10'),
      }).partial(),
      execute: async ({ filter, limit }: { filter?: string; limit?: number }) => {
        const f = filter ?? 'all'
        const l = limit ?? 10
        try {
          const followers = await prisma.clubFollower.findMany({
            where: { clubId },
            include: {
              user: {
                select: {
                  id: true, email: true, name: true,
                  duprRatingDoubles: true,
                },
              },
            },
          })

          const userIds = followers.map(f => f.userId)
          const now = new Date()
          const d30 = new Date(now.getTime() - 30 * 86400000)
          const d60 = new Date(now.getTime() - 60 * 86400000)

          const bookings = await prisma.playSessionBooking.findMany({
            where: {
              userId: { in: userIds },
              playSession: { clubId },
            },
            select: { userId: true, status: true, bookedAt: true },
            orderBy: { bookedAt: 'desc' },
          })

          const bookingMap = new Map<string, typeof bookings>()
          for (const b of bookings) {
            if (!bookingMap.has(b.userId)) bookingMap.set(b.userId, [])
            bookingMap.get(b.userId)!.push(b)
          }

          const memberInputs = followers.map(f => {
            const userBookings = bookingMap.get(f.userId) || []
            const confirmed = userBookings.filter(b => b.status === 'CONFIRMED')
            const lastConfirmed = confirmed[0]?.bookedAt ?? null
            const daysSinceLast = lastConfirmed
              ? Math.floor((now.getTime() - lastConfirmed.getTime()) / 86400000)
              : null

            return {
              member: {
                id: f.user.id,
                email: f.user.email,
                name: f.user.name,
                image: null,
                gender: null as 'M' | 'F' | 'X' | null,
                city: null,
                duprRatingDoubles: f.user.duprRatingDoubles ? Number(f.user.duprRatingDoubles) : null,
                duprRatingSingles: null,
              },
              preference: null,
              history: {
                totalBookings: userBookings.length,
                bookingsLastWeek: confirmed.filter(b => b.bookedAt >= new Date(now.getTime() - 7 * 86400000)).length,
                bookingsLastMonth: confirmed.filter(b => b.bookedAt >= d30).length,
                daysSinceLastConfirmedBooking: daysSinceLast,
                cancelledCount: userBookings.filter(b => b.status === 'CANCELLED').length,
                noShowCount: userBookings.filter(b => b.status === 'NO_SHOW').length,
                inviteAcceptanceRate: 0.7,
              },
              joinedAt: f.createdAt ?? new Date(),
              bookingDates: userBookings.map(b => ({
                date: b.bookedAt,
                status: b.status as 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
              })),
              previousPeriodBookings: confirmed.filter(b => b.bookedAt >= d60 && b.bookedAt < d30).length,
            }
          })

          const { generateMemberHealth } = await import('@/lib/ai/member-health')
          const result = generateMemberHealth(memberInputs)

          let members = result.members
          if (f !== 'all') {
            members = members.filter((m: any) => m.riskLevel === f)
          }
          members = members
            .sort((a: any, b: any) => a.healthScore - b.healthScore)
            .slice(0, l)

          return {
            summary: result.summary,
            members: members.map((m: any) => ({
              name: m.member?.name || m.member?.email || 'Unknown',
              healthScore: m.healthScore,
              riskLevel: m.riskLevel,
              lifecycleStage: m.lifecycleStage,
              trend: m.trend,
              daysSinceLastVisit: m.daysSinceLastBooking,
              totalBookings: m.totalBookings,
            })),
          }
        } catch (err) {
          console.error('[ChatTool] getMemberHealth failed:', err)
          return { error: 'Failed to load member health data. The club may not have enough booking data yet.' }
        }
      },
    }),

    getUpcomingSessions: t({
      description:
        'Get upcoming sessions with occupancy info. Shows which sessions are underfilled and need attention. Use when the user asks about sessions, schedule, occupancy, or what needs filling.',
      parameters: z.object({
        onlyUnderfilled: z.boolean().describe('Only return sessions below 50% capacity. Default: false'),
        limit: z.number().describe('Max sessions to return. Default: 10'),
      }).partial(),
      execute: async ({ onlyUnderfilled, limit }: { onlyUnderfilled?: boolean; limit?: number }) => {
        const uf = onlyUnderfilled ?? false
        const l = limit ?? 10
        try {
          const sessions = await prisma.playSession.findMany({
            where: {
              clubId,
              date: { gte: new Date() },
            },
            orderBy: { date: 'asc' },
            take: 30,
          })

          // Get booking counts separately
          const sessionIds = sessions.map(s => s.id)
          const bookingCounts = await prisma.playSessionBooking.groupBy({
            by: ['sessionId'],
            where: {
              sessionId: { in: sessionIds },
              status: 'CONFIRMED',
            },
            _count: { _all: true },
          })
          const countMap = new Map(bookingCounts.map((b: any) => [b.sessionId, b._count._all as number]))

          let result = sessions.map(s => {
            const confirmed: number = countMap.get(s.id) || 0
            const occupancy = s.maxPlayers > 0 ? Math.round((confirmed / s.maxPlayers) * 100) : 0
            return {
              title: s.title,
              date: s.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
              time: `${s.startTime}–${s.endTime}`,
              format: s.format.replace(/_/g, ' '),
              confirmed,
              maxPlayers: s.maxPlayers,
              occupancy: `${occupancy}%`,
              spotsRemaining: s.maxPlayers - confirmed,
            }
          })

          if (uf) {
            result = result.filter(s => parseInt(s.occupancy) < 50)
          }

          return { sessions: result.slice(0, l), total: result.length }
        } catch (err) {
          console.error('[ChatTool] getUpcomingSessions failed:', err)
          return { error: 'Failed to load sessions.' }
        }
      },
    }),

    getClubMetrics: t({
      description:
        'Get key club metrics: total members, active members, bookings this month, average occupancy, revenue estimates. Use when the user asks about club performance, overview, numbers, or how the club is doing.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const now = new Date()
          const d30 = new Date(now.getTime() - 30 * 86400000)
          const d7 = new Date(now.getTime() - 7 * 86400000)

          const [totalMembers, totalBookings30d, totalBookings7d, sessions30d] = await Promise.all([
            prisma.clubFollower.count({ where: { clubId } }),
            prisma.playSessionBooking.count({
              where: {
                playSession: { clubId },
                status: 'CONFIRMED',
                bookedAt: { gte: d30 },
              },
            }),
            prisma.playSessionBooking.count({
              where: {
                playSession: { clubId },
                status: 'CONFIRMED',
                bookedAt: { gte: d7 },
              },
            }),
            prisma.playSession.findMany({
              where: { clubId, date: { gte: d30, lte: now } },
            }),
          ])

          // Get booking counts for these sessions
          const sessionIds = sessions30d.map(s => s.id)
          const bookingCounts = sessionIds.length > 0
            ? await prisma.playSessionBooking.groupBy({
                by: ['sessionId'],
                where: {
                  sessionId: { in: sessionIds },
                  status: 'CONFIRMED',
                },
                _count: { _all: true },
              })
            : []
          const countMap = new Map(bookingCounts.map((b: any) => [b.sessionId, b._count._all as number]))

          const totalCapacity = sessions30d.reduce((sum, s) => sum + s.maxPlayers, 0)
          const totalFilled = sessions30d.reduce((sum, s) => sum + (countMap.get(s.id) || 0), 0)
          const avgOccupancy = totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0

          // Active = booked at least once in last 30 days
          const activeUsers = await prisma.playSessionBooking.groupBy({
            by: ['userId'],
            where: {
              playSession: { clubId },
              status: 'CONFIRMED',
              bookedAt: { gte: d30 },
            },
          })

          return {
            totalMembers,
            activeMembers: activeUsers.length,
            inactiveMembers: totalMembers - activeUsers.length,
            bookingsLast30Days: totalBookings30d,
            bookingsLast7Days: totalBookings7d,
            sessionsLast30Days: sessions30d.length,
            averageOccupancy: `${avgOccupancy}%`,
          }
        } catch (err) {
          console.error('[ChatTool] getClubMetrics failed:', err)
          return { error: 'Failed to load club metrics.' }
        }
      },
    }),

    getReactivationCandidates: t({
      description:
        'Get members who have been inactive and are candidates for re-engagement outreach. Use when the user asks about inactive members, who to re-engage, reactivation, or members who stopped coming.',
      parameters: z.object({
        limit: z.number().describe('Max candidates to return. Default: 10'),
      }).partial(),
      execute: async ({ limit }: { limit?: number }) => {
        const l = limit ?? 10
        try {
          const now = new Date()
          const d14 = new Date(now.getTime() - 14 * 86400000)

          const followers = await prisma.clubFollower.findMany({
            where: { clubId },
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          })

          const userIds = followers.map(f => f.userId)
          const bookings = await prisma.playSessionBooking.findMany({
            where: {
              userId: { in: userIds },
              playSession: { clubId },
              status: 'CONFIRMED',
            },
            select: { userId: true, bookedAt: true },
            orderBy: { bookedAt: 'desc' },
          })

          const lastBookingMap = new Map<string, Date>()
          for (const b of bookings) {
            if (!lastBookingMap.has(b.userId)) lastBookingMap.set(b.userId, b.bookedAt)
          }

          const inactive = followers
            .map(f => {
              const lastBooking = lastBookingMap.get(f.userId)
              if (!lastBooking || lastBooking >= d14) return null
              const daysSince = Math.floor((now.getTime() - lastBooking.getTime()) / 86400000)
              return {
                name: f.user.name || f.user.email,
                daysSinceLastVisit: daysSince,
                lastVisitDate: lastBooking.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit)
            .slice(0, l)

          return {
            totalInactive: inactive.length,
            candidates: inactive,
          }
        } catch (err) {
          console.error('[ChatTool] getReactivationCandidates failed:', err)
          return { error: 'Failed to load reactivation candidates.' }
        }
      },
    }),
  }
}
