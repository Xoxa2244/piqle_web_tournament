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
              duprRating: m.member?.duprRatingDoubles ?? null,
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
        'Get membership SUBSCRIPTION status breakdown: how many followers have active / trial / expired / suspended / cancelled / guest / no-membership subscriptions. These are categorical subscription states from the club_management software (e.g. CourtReserve), NOT booking activity — for "who actually played in the last 30 days" use getClubMetrics.activePlayers30d.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const { normalizeMembership, resolveMembershipMappings } = await import('@/lib/ai/membership-intelligence')
          const club = await prisma.club.findUnique({ where: { id: clubId }, select: { automationSettings: true } })
          const membershipMappings = resolveMembershipMappings(club?.automationSettings)

          // Pull membership_status + membership_type from the users table
          // for every follower of this club. Earlier the tool scanned
          // `document_embeddings (content_type='member', source_table='csv_import')`
          // but on prod that source is empty for most clubs — the actual
          // canonical source is `users.membership_status` populated by the
          // CourtReserve sync. Tested on IPC North: 12,485 follower rows
          // come back this way, matching the Integrations sync count.
          const rows = await prisma.$queryRaw<Array<{
            user_id: string
            membership_status: string | null
            membership_type: string | null
          }>>`
            SELECT cf.user_id, u.membership_status, u.membership_type
            FROM club_followers cf
            JOIN users u ON u.id = cf.user_id
            WHERE cf.club_id = ${clubId}
          `

          const normalizedBreakdown: Record<string, number> = {
            active: 0, trial: 0, expired: 0, cancelled: 0, suspended: 0, guest: 0, none: 0, unknown: 0,
          }
          const rawBreakdown: Record<string, number> = {}
          const typeAmongActive: Record<string, number> = {}

          for (const r of rows) {
            const rawStatus = r.membership_status || 'Unknown'
            rawBreakdown[rawStatus] = (rawBreakdown[rawStatus] || 0) + 1

            const normalized = normalizeMembership({
              membershipType: r.membership_type,
              membershipStatus: r.membership_status,
              membershipMappings,
            })
            const bucket = normalized.normalizedStatus in normalizedBreakdown ? normalized.normalizedStatus : 'unknown'
            normalizedBreakdown[bucket]++

            // Track membership type ONLY for normalized-active rows
            if (normalized.normalizedStatus === 'active' && r.membership_type) {
              typeAmongActive[r.membership_type] = (typeAmongActive[r.membership_type] || 0) + 1
            }
          }

          const membershipTypes = Object.entries(typeAmongActive)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([type, count]) => ({ type, count }))

          // Note: the Members page UI shows "Active Memberships" as the
          // intersection (active-status AND has-booked-at-least-once) — a
          // smaller number than the raw active count returned here. Both
          // numbers are valid; we surface the raw subscription count as
          // primary, and document the discrepancy so the LLM can explain.
          return {
            totalFollowersScanned: rows.length,
            activeSubscriptions: normalizedBreakdown.active,
            byNormalizedStatus: normalizedBreakdown,
            byRawStatus: rawBreakdown,
            membershipTypesAmongActive: membershipTypes,
            statusDefinition: 'Subscription category sourced from users.membership_status. The Members page tile labelled "Active Memberships" further restricts to members who have made at least one booking, so its count will be smaller than activeSubscriptions here. For "people who actually played in the last 30 days" use getClubMetrics.activePlayers30d.',
          }
        } catch (err) {
          console.error('[ChatTool] getMembershipBreakdown failed:', err)
          return { error: 'Failed to load membership data.' }
        }
      },
    }),

    getRatedPlayers: defineTool({
      description:
        "Get players filtered by skill rating (DUPR for pickleball). Use when the user asks about rating brackets like '4.0+', '3.5-3.99', 'beginners', 'advanced players by rating', or 'how many players above X'. IMPORTANT: today we only ingest pickleball DUPR ratings from CourtReserve sync. UTR (tennis), Playtomic (padel), and other sport-specific rating systems are not yet integrated — for clubs whose primary sport is not pickleball, this tool returns an honest 'not yet integrated' notice instead of guessing.",
      parameters: z.object({
        minRating: z.number().optional().describe('Minimum rating, inclusive (e.g. 4.0)'),
        maxRating: z.number().optional().describe('Maximum rating, exclusive (e.g. 4.5 to get 4.0-4.49 bracket)'),
        limit: z.number().int().min(1).max(200).optional().describe('Max players to return. Default: 50'),
      }),
      execute: async ({ minRating, maxRating, limit }: { minRating?: number; maxRating?: number; limit?: number }) => {
        try {
          const club = await prisma.club.findUnique({ where: { id: clubId }, select: { automationSettings: true } })
          const sportTypes: string[] = ((club?.automationSettings as any)?.intelligence?.sportTypes) || []
          const primarySport = sportTypes[0] || 'pickleball'

          // Multi-sport rating systems we know about, but don't ingest yet.
          const SPORT_RATING_SYSTEM: Record<string, { system: string; integrated: boolean }> = {
            pickleball: { system: 'DUPR', integrated: true },
            tennis: { system: 'UTR', integrated: false },
            padel: { system: 'Playtomic', integrated: false },
            squash: { system: 'PSA / SquashLevels', integrated: false },
            badminton: { system: 'BWF World Ranking', integrated: false },
          }
          const ratingMeta = SPORT_RATING_SYSTEM[primarySport.toLowerCase()] || { system: 'unknown', integrated: false }

          if (!ratingMeta.integrated) {
            return {
              primarySport,
              ratingSystem: ratingMeta.system,
              integrated: false,
              message: `Player ratings for ${primarySport} (${ratingMeta.system}) are not yet ingested into IQSport. Today we only sync DUPR for pickleball clubs via CourtReserve. To track ${ratingMeta.system}, an admin can enter ratings manually on each member profile, or we can add a connector — let the user know that's the limitation.`,
            }
          }

          // pickleball / DUPR path
          const where: any = {
            clubFollows: { some: { clubId } },
            duprRatingDoubles: { not: null },
          }
          if (minRating !== undefined || maxRating !== undefined) {
            where.duprRatingDoubles = {}
            if (minRating !== undefined) where.duprRatingDoubles.gte = minRating
            if (maxRating !== undefined) where.duprRatingDoubles.lt = maxRating
          }
          const total = await prisma.user.count({ where })
          const players = await prisma.user.findMany({
            where,
            select: { id: true, name: true, email: true, duprRatingDoubles: true },
            orderBy: { duprRatingDoubles: 'desc' },
            take: limit ?? 50,
          })
          // Also check how many followers HAVE any DUPR set, so we can
          // distinguish "bracket filter returned nothing" from "we just
          // don't have rating data on file at all".
          const totalWithAnyRating = await prisma.user.count({
            where: {
              clubFollows: { some: { clubId } },
              duprRatingDoubles: { not: null },
            },
          })
          const totalFollowers = await prisma.clubFollower.count({ where: { clubId } })
          let note: string
          if (totalWithAnyRating === 0) {
            note = `0 of ${totalFollowers} followers have a DUPR rating on file. CourtReserve sync does not pull DUPR ratings — admins would need to either (a) connect DUPR directly via the DUPR connector if available, (b) enter ratings manually on each member profile, or (c) leave them blank and rely on session skill_level for skill-based programming. Tell the user this honestly instead of guessing.`
          } else if (total === 0) {
            note = `${totalWithAnyRating} of ${totalFollowers} followers have any DUPR rating on file, but none match the requested bracket. The bracket may simply have no players at this club.`
          } else {
            note = `Returned the top ${players.length} of ${total} matching players, sorted by rating descending. ${totalWithAnyRating} of ${totalFollowers} total followers have any DUPR rating on file.`
          }
          return {
            primarySport,
            ratingSystem: 'DUPR',
            integrated: true,
            filter: { minRating, maxRating },
            totalMatching: total,
            totalWithAnyRating,
            totalFollowers,
            samplePlayers: players.map((p) => ({
              name: p.name || p.email || 'Unknown',
              dupr: p.duprRatingDoubles ? Number(p.duprRatingDoubles) : null,
            })),
            note,
          }
        } catch (err) {
          console.error('[ChatTool] getRatedPlayers failed:', err)
          return { error: 'Failed to load rated player data.' }
        }
      },
    }),
  }
}
