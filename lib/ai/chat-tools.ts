/**
 * AI Chat Tools — give the Advisor access to real club data
 *
 * These tools are called by the LLM via tool_use, not by the user directly.
 * Each tool queries the database and returns structured data that the LLM
 * formats into a human-readable response.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

// AI SDK v6 renamed "parameters" → "inputSchema" on the Tool type.
// tool() is an identity function, so we must pass { inputSchema } directly.
function defineTool(config: { description: string; parameters: z.ZodObject<any>; execute: (...args: any[]) => Promise<any> }) {
  return tool({ description: config.description, inputSchema: config.parameters, execute: config.execute } as any)
}

export function createChatTools(clubId: string) {
  return {
    getMemberHealth: defineTool({
      description:
        'Get member health scores and churn risk for all club members. Returns summary (total, healthy, watch, at_risk, critical counts) and top at-risk members with their scores. Use when the user asks about member health, churn risk, at-risk members, engagement, or who hasn\'t been coming.',
      parameters: z.object({
        filter: z.enum(['all', 'at_risk', 'critical', 'watch', 'healthy']).optional().describe('Filter by risk level. Default: all'),
        limit: z.number().int().min(1).optional().describe('Max members to return. Default: 10'),
      }),
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

    getUpcomingSessions: defineTool({
      description:
        'Get upcoming sessions with occupancy info. Shows which sessions are underfilled and need attention. Use when the user asks about sessions, schedule, occupancy, or what needs filling.',
      parameters: z.object({
        onlyUnderfilled: z.boolean().optional().describe('Only return sessions below 50% capacity. Default: false'),
        limit: z.number().int().min(1).optional().describe('Max sessions to return. Default: 10'),
      }),
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

    getClubMetrics: defineTool({
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

    getReactivationCandidates: defineTool({
      description:
        'Get members who have been inactive and are candidates for re-engagement outreach. Use when the user asks about inactive members, who to re-engage, reactivation, or members who stopped coming.',
      parameters: z.object({
        limit: z.number().int().min(1).optional().describe('Max candidates to return. Default: 10'),
      }),
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

    getCourtOccupancy: defineTool({
      description:
        'Get court occupancy breakdown by day of week and time slot. Shows which courts and time slots are busy vs empty. Use when the user asks about occupancy, court utilization, busy/quiet times, when courts are empty, Tuesday morning, peak hours, or anything about court usage patterns.',
      parameters: z.object({
        days: z.number().int().optional().describe('Look back period in days. Default: 30'),
      }),
      execute: async ({ days }: { days?: number }) => {
        const lookback = days ?? 30
        try {
          const since = new Date()
          since.setDate(since.getDate() - lookback)

          const sessions = await prisma.playSession.findMany({
            where: { clubId, date: { gte: since }, startTime: { not: '00:00' } },
            select: { date: true, startTime: true, endTime: true, courtId: true, format: true, registeredCount: true },
          })

          const totalCourts = Math.max(await prisma.clubCourt.count({ where: { clubId } }), 1)
          const OPEN = 6, CLOSE = 23
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

          // Build occupancy by day × 2-hour slot
          const slots: Record<string, { courtHours: Set<string>; daysSet: Set<string>; totalPlayers: number }> = {}
          const dayDatesAll = new Map<string, Set<string>>()

          sessions.forEach((s: any) => {
            const dayName = dayNames[s.date.getDay()]
            const dateStr = s.date.toISOString().slice(0, 10)
            if (!dayDatesAll.has(dayName)) dayDatesAll.set(dayName, new Set())
            dayDatesAll.get(dayName)!.add(dateStr)

            const startH = parseInt(s.startTime?.split(':')[0] || '0')
            const endH = parseInt(s.endTime?.split(':')[0] || '0') || startH + 1

            for (let h = Math.max(startH, OPEN); h < Math.min(endH, CLOSE); h++) {
              const slotLabel = `${dayName} ${h}:00-${h + 1}:00`
              if (!slots[slotLabel]) slots[slotLabel] = { courtHours: new Set(), daysSet: new Set(), totalPlayers: 0 }
              slots[slotLabel].courtHours.add(`${s.courtId}|${dateStr}|${h}`)
              slots[slotLabel].daysSet.add(dateStr)
              slots[slotLabel].totalPlayers += s.registeredCount || 0
            }
          })

          // Build summary
          const slotSummary = Object.entries(slots)
            .map(([label, data]) => {
              const numDays = data.daysSet.size || 1
              const available = numDays * totalCourts
              const occupancy = Math.round((data.courtHours.size / available) * 100)
              return { slot: label, occupancy: `${occupancy}%`, courtsUsed: data.courtHours.size, available, totalPlayers: data.totalPlayers }
            })
            .sort((a, b) => parseInt(b.occupancy) - parseInt(a.occupancy))

          // Overall
          let totalBooked = 0, totalAvailable = 0
          dayDatesAll.forEach((dates) => { totalAvailable += dates.size * totalCourts * (CLOSE - OPEN) })
          Object.values(slots).forEach(s => { totalBooked += s.courtHours.size })
          const overallOccupancy = totalAvailable > 0 ? Math.round((totalBooked / totalAvailable) * 100) : 0

          return {
            period: `Last ${lookback} days`,
            totalCourts,
            overallOccupancy: `${overallOccupancy}%`,
            busiestSlots: slotSummary.slice(0, 10),
            quietestSlots: slotSummary.slice(-10).reverse(),
            totalSessions: sessions.length,
          }
        } catch (err) {
          console.error('[ChatTool] getCourtOccupancy failed:', err)
          return { error: 'Failed to load court occupancy data.' }
        }
      },
    }),

    getMembershipBreakdown: defineTool({
      description:
        'Get membership status breakdown: how many active, suspended, expired, no membership. Use when the user asks about membership, churn, who left, subscription status, or member retention.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const rows = await prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
            SELECT metadata->>'membershipStatus' as status, count(*) as cnt
            FROM document_embeddings
            WHERE club_id = ${clubId}::uuid AND content_type = 'member' AND source_table = 'csv_import'
            GROUP BY metadata->>'membershipStatus'
          `
          const breakdown: Record<string, number> = {}
          rows.forEach(r => { breakdown[r.status || 'Unknown'] = Number(r.cnt) })

          // Also get membership types for active members
          const types = await prisma.$queryRaw<Array<{ membership: string; cnt: bigint }>>`
            SELECT metadata->>'membership' as membership, count(*) as cnt
            FROM document_embeddings
            WHERE club_id = ${clubId}::uuid AND content_type = 'member' AND source_table = 'csv_import'
            AND metadata->>'membershipStatus' = 'Currently Active'
            GROUP BY metadata->>'membership'
            ORDER BY cnt DESC
            LIMIT 10
          `
          const membershipTypes = types.map(t => ({ type: t.membership, count: Number(t.cnt) }))

          return { breakdown, membershipTypes }
        } catch (err) {
          console.error('[ChatTool] getMembershipBreakdown failed:', err)
          return { error: 'Failed to load membership data.' }
        }
      },
    }),
  }
}
