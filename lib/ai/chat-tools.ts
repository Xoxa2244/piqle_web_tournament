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
        'Get key club metrics aligned with the Dashboard: total followers, active players (booked in last 30d), bookings this week / this month, sessions, average court occupancy. Use when the user asks about club performance, overview, numbers, or how the club is doing. Note: "active players" here means people who actually played, not subscription status — for membership-status counts the user should look at the Members page.',
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
              select: { id: true, maxPlayers: true, registeredCount: true },
            }),
          ])

          // Get booking counts for these sessions (used as fallback when
          // CSV-imported sessions don't have a registeredCount).
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

          // Average per-session occupancy ratio — must match the formula
          // in `getDashboardV2` (server/routers/intelligence.ts) so admins
          // don't see "9% occupancy" in the Advisor and "67% occupancy" on
          // the Dashboard for the same period. Each session contributes
          // one ratio; ratios are averaged. This way a 16-spot Open Play
          // and a 4-spot ball-machine slot get equal weight (the natural
          // pickleball-club intuition), instead of capacity-weighted total.
          const occRatios = sessions30d
            .map((s) => {
              const max = s.maxPlayers ?? 0
              const reg = s.registeredCount ?? countMap.get(s.id) ?? 0
              return max > 0 ? (reg / max) * 100 : null
            })
            .filter((v): v is number => v !== null)
          const avgOccupancy = occRatios.length === 0
            ? 0
            : Math.round(occRatios.reduce((a, b) => a + b, 0) / occRatios.length)

          // Active player = made at least one CONFIRMED booking in last 30
          // days. Same definition the Dashboard's "Active Players" card
          // uses, NOT the same as membership status='active' on the
          // Members page (which is a categorical subscription field).
          const activePlayers = await prisma.playSessionBooking.groupBy({
            by: ['userId'],
            where: {
              playSession: { clubId },
              status: 'CONFIRMED',
              bookedAt: { gte: d30 },
            },
          })

          return {
            totalFollowers: totalMembers,
            activePlayers30d: activePlayers.length,
            inactiveFollowers30d: totalMembers - activePlayers.length,
            bookingsLast30Days: totalBookings30d,
            bookingsLast7Days: totalBookings7d,
            sessionsLast30Days: sessions30d.length,
            averageOccupancy: `${avgOccupancy}%`,
            occupancyDefinition: 'mean of per-session (registered / maxPlayers) — matches Dashboard',
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
        'Get COURT-HOUR UTILIZATION breakdown by day of week and time slot — i.e. what % of available court-hours actually have a session scheduled. Use when the user asks about utilization, scheduling density, busy/quiet times, when courts are empty, Tuesday morning, peak hours, or court usage patterns. NOTE: this is "are courts being used at all" (scheduling supply), NOT "how full are sessions when they run" (per-session player occupancy). For player occupancy use getClubMetrics. The two metrics will diverge — a club can have low court-hour utilization (only a few sessions scheduled) but high per-session occupancy (those sessions are full).',
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

          // Build occupancy by day × hour slot with format tracking
          const slots: Record<string, { courtHours: Set<string>; daysSet: Set<string>; totalPlayers: number; formats: Record<string, number> }> = {}
          const dayDatesAll = new Map<string, Set<string>>()

          sessions.forEach((s: any) => {
            const dayName = dayNames[s.date.getDay()]
            const dateStr = s.date.toISOString().slice(0, 10)
            if (!dayDatesAll.has(dayName)) dayDatesAll.set(dayName, new Set())
            dayDatesAll.get(dayName)!.add(dateStr)

            const startH = parseInt(s.startTime?.split(':')[0] || '0')
            const endH = parseInt(s.endTime?.split(':')[0] || '0') || startH + 1
            const fmt = (s.format || 'OTHER').replace(/_/g, ' ')

            for (let h = Math.max(startH, OPEN); h < Math.min(endH, CLOSE); h++) {
              const slotLabel = `${dayName} ${h}:00-${h + 1}:00`
              if (!slots[slotLabel]) slots[slotLabel] = { courtHours: new Set(), daysSet: new Set(), totalPlayers: 0, formats: {} }
              slots[slotLabel].courtHours.add(`${s.courtId}|${dateStr}|${h}`)
              slots[slotLabel].daysSet.add(dateStr)
              slots[slotLabel].totalPlayers += s.registeredCount || 0
              slots[slotLabel].formats[fmt] = (slots[slotLabel].formats[fmt] || 0) + 1
            }
          })

          // Build summary
          const slotSummary = Object.entries(slots)
            .map(([label, data]) => {
              const numDays = data.daysSet.size || 1
              const available = numDays * totalCourts
              const occupancy = Math.round((data.courtHours.size / available) * 100)
              // Top formats for this slot
              const topFormats = Object.entries(data.formats).sort(([,a],[,b]) => b - a).slice(0, 3).map(([f, c]) => `${f} (${c})`).join(', ')
              return { slot: label, occupancy: `${occupancy}%`, courtsUsed: data.courtHours.size, available, totalPlayers: data.totalPlayers, formats: topFormats }
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
            overallCourtHourUtilization: `${overallOccupancy}%`,
            metricDefinition: 'court-hour utilization = (court-hours with any session) / (operating court-hours). Different from per-session player occupancy — see getClubMetrics for that.',
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
        'Get membership SUBSCRIPTION status breakdown: how many members have active / trial / expired / suspended / cancelled / guest / none. These are categorical subscription states (what the club_management software tracks), NOT booking activity — for "who actually played in the last 30 days" use getClubMetrics. The normalized buckets here mirror what the Members page shows so the numbers match.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const { normalizeMembership, resolveMembershipMappings } = await import('@/lib/ai/membership-intelligence')
          const club = await prisma.club.findUnique({ where: { id: clubId }, select: { automationSettings: true } })
          const membershipMappings = resolveMembershipMappings(club?.automationSettings)

          // Pull every member embedding so we can normalize through the same
          // pipeline the Members page uses (getMemberHealth → mapRealMembers
          // → m.normalizedMembershipStatus). Without this the breakdown was
          // grouping on the raw CSV string ("Currently Active" vs "Active"
          // vs "ACTIVE") and didn't match what admins saw on the Members
          // page — see "metric drift" follow-up from the 2026-04-25 audit.
          const rows = await prisma.$queryRaw<Array<{ metadata: any }>>`
            SELECT metadata FROM document_embeddings
            WHERE club_id = ${clubId} AND content_type = 'member' AND source_table = 'csv_import'
          `

          const normalizedBreakdown: Record<string, number> = {
            active: 0, trial: 0, expired: 0, cancelled: 0, suspended: 0, guest: 0, none: 0, unknown: 0,
          }
          const rawBreakdown: Record<string, number> = {}
          const typeCounts: Record<string, number> = {}

          for (const r of rows) {
            let m: any
            try {
              m = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata
            } catch {
              continue
            }
            const rawStatus = m?.membershipStatus || 'Unknown'
            rawBreakdown[rawStatus] = (rawBreakdown[rawStatus] || 0) + 1

            const normalized = normalizeMembership({
              membershipType: m?.membership,
              membershipStatus: m?.membershipStatus,
              membershipMappings,
            })
            const bucket = normalized.normalizedStatus in normalizedBreakdown ? normalized.normalizedStatus : 'unknown'
            normalizedBreakdown[bucket]++

            // Track type only for normalized-active members
            if (normalized.normalizedStatus === 'active' && m?.membership) {
              typeCounts[m.membership] = (typeCounts[m.membership] || 0) + 1
            }
          }

          const membershipTypes = Object.entries(typeCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([type, count]) => ({ type, count }))

          const totalScanned = rows.length
          return {
            totalMembersScanned: totalScanned,
            byNormalizedStatus: normalizedBreakdown,
            activeMemberships: normalizedBreakdown.active,
            byRawStatus: rawBreakdown,
            membershipTypesAmongActive: membershipTypes,
            statusDefinition: 'Subscription category from CSV import (matches the Members page "Active Memberships" tile). Different from booking activity — use getClubMetrics.activePlayers30d for "people who actually played recently".',
          }
        } catch (err) {
          console.error('[ChatTool] getMembershipBreakdown failed:', err)
          return { error: 'Failed to load membership data.' }
        }
      },
    }),
  }
}
