import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import {
  getSlotFillerRecommendations,
  getWeeklyPlan,
  getReactivationCandidates,
  sendInvites,
  upsertPreferences,
  getPreferences,
} from '@/lib/ai/intelligence-service'

// ── Helper: Check club admin access ──
async function requireClubAdmin(prisma: any, clubId: string, userId: string) {
  const admin = await prisma.clubAdmin.findFirst({
    where: { clubId, userId },
  })
  if (!admin) {
    // Also allow club followers (members) for some read operations
    const follower = await prisma.clubFollower.findFirst({
      where: { clubId, userId },
    })
    if (!follower) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You must be a club member or admin to access intelligence features.',
      })
    }
    return { isAdmin: false, isMember: true }
  }
  return { isAdmin: true, isMember: true }
}

export const intelligenceRouter = createTRPCRouter({
  // ── Club Data Status: Check if club has AI data ──
  getClubDataStatus: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // Query via raw SQL — Prisma can't model vector columns, PostgREST may cache stale schema
      let embeddings: { id: string; content_type: string; metadata: any; created_at: Date }[] = []
      try {
        embeddings = await ctx.prisma.$queryRaw`
          SELECT id::text, content_type, metadata, created_at
          FROM document_embeddings
          WHERE club_id = ${input.clubId}::uuid
        `
      } catch (err) {
        console.error('[Intelligence] getClubDataStatus failed:', err)
        return {
          hasData: false,
          totalEmbeddings: 0,
          lastImportAt: null,
          sessionCount: 0,
          playerCount: 0,
          sourceFileName: null,
        }
      }
      const totalEmbeddings = embeddings.length

      // Extract import metadata from summary embedding
      let lastImportAt: string | null = null
      let sessionCount = 0
      let playerCount = 0
      let sourceFileName: string | null = null

      // Find the most recent embedding to determine last import time
      if (embeddings.length > 0) {
        const sorted = embeddings.sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        lastImportAt = sorted[0].created_at.toISOString()

        // Look for summary embedding with metadata
        const summaryEmbed = embeddings.find(
          (e: any) => e.content_type === 'club_info' && e.metadata?.sessionCount
        )
        if (summaryEmbed?.metadata) {
          sessionCount = (summaryEmbed.metadata as any).sessionCount || 0
          playerCount = (summaryEmbed.metadata as any).playerCount || 0
          sourceFileName = (summaryEmbed.metadata as any).sourceFileName || null
        }
      }

      return {
        hasData: totalEmbeddings > 0,
        totalEmbeddings,
        lastImportAt,
        sessionCount,
        playerCount,
        sourceFileName,
      }
    }),

  // ── Slot Filler: Recommend members for underfilled sessions ──
  getSlotFillerRecommendations: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      limit: z.number().int().min(1).max(20).default(5),
      enhance: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      // Get session to find clubId
      const session = await ctx.prisma.playSession.findUnique({
        where: { id: input.sessionId },
        select: { clubId: true },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
      }
      await requireClubAdmin(ctx.prisma, session.clubId, ctx.session.user.id)
      const result = await getSlotFillerRecommendations(ctx.prisma, input)

      // Optional: enhance with LLM
      if (input.enhance && result.recommendations.length > 0) {
        try {
          const { enhanceSlotFillerWithLLM } = await import('@/lib/ai/llm/enhancer')
          const enhancements = await enhanceSlotFillerWithLLM(
            result.recommendations,
            result.session as any
          )
          return {
            ...result,
            aiEnhancements: enhancements,
          }
        } catch (err) {
          console.error('[Intelligence] Slot filler LLM enhancement failed:', err)
        }
      }

      return { ...result, aiEnhancements: [] }
    }),

  // ── Weekly Plan: Personalized session plan for a player ──
  getWeeklyPlan: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      enhance: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const result = await getWeeklyPlan(ctx.prisma, {
        userId: ctx.session.user.id,
        clubId: input.clubId,
      })

      // Optional: enhance with LLM
      if (input.enhance && result.plan && result.plan.recommendedSessions.length > 0) {
        try {
          const { enhanceWeeklyPlanWithLLM } = await import('@/lib/ai/llm/enhancer')
          const enhancement = await enhanceWeeklyPlanWithLLM(result.plan)
          return { ...result, aiEnhancement: enhancement }
        } catch (err) {
          console.error('[Intelligence] Weekly plan LLM enhancement failed:', err)
        }
      }

      return { ...result, aiEnhancement: null }
    }),

  // ── Reactivation: Identify inactive members ──
  getReactivationCandidates: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      inactivityDays: z.number().int().min(7).default(21),
      limit: z.number().int().min(1).max(20).default(10),
      enhance: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const result = await getReactivationCandidates(ctx.prisma, input)

      // Optional: enhance with LLM
      if (input.enhance && result.candidates.length > 0) {
        try {
          const { enhanceReactivationWithLLM } = await import('@/lib/ai/llm/enhancer')
          const enhancements = await enhanceReactivationWithLLM(result.candidates)
          return { ...result, aiEnhancements: enhancements }
        } catch (err) {
          console.error('[Intelligence] Reactivation LLM enhancement failed:', err)
        }
      }

      return { ...result, aiEnhancements: [] }
    }),

  // ── Send Invites: Invite recommended users to a session ──
  sendInvites: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      userIds: z.array(z.string().uuid()),
      message: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.playSession.findUnique({
        where: { id: input.sessionId },
        select: { clubId: true },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
      }
      await requireClubAdmin(ctx.prisma, session.clubId, ctx.session.user.id)
      return sendInvites(ctx.prisma, input)
    }),

  // ── Preferences: Get/Set user play preferences ──
  getPreferences: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      return getPreferences(ctx.prisma, ctx.session.user.id, input.clubId)
    }),

  upsertPreferences: protectedProcedure
    .input(z.object({
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
    }))
    .mutation(async ({ ctx, input }) => {
      return upsertPreferences(ctx.prisma, {
        userId: ctx.session.user.id,
        ...input,
      })
    }),

  // ── Dashboard: Club intelligence overview ──
  getDashboard: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const [
        totalMembers,
        totalCourts,
        upcomingSessions,
        recentBookings,
        underfilled,
      ] = await Promise.all([
        ctx.prisma.clubFollower.count({ where: { clubId: input.clubId } }),
        ctx.prisma.clubCourt.count({ where: { clubId: input.clubId, isActive: true } }),
        ctx.prisma.playSession.findMany({
          where: {
            clubId: input.clubId,
            status: 'SCHEDULED',
            date: { gte: now },
          },
          include: {
            clubCourt: true,
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
          orderBy: { date: 'asc' },
          take: 20,
        }),
        ctx.prisma.playSessionBooking.count({
          where: {
            status: 'CONFIRMED',
            playSession: { clubId: input.clubId },
            bookedAt: { gte: thirtyDaysAgo },
          },
        }),
        // Underfilled sessions (less than 50% capacity)
        ctx.prisma.playSession.findMany({
          where: {
            clubId: input.clubId,
            status: 'SCHEDULED',
            date: { gte: now },
          },
          include: {
            clubCourt: true,
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
          orderBy: { date: 'asc' },
        }),
      ])

      // Recent AI recommendations (gracefully handle if table not ready)
      let aiLogs = 0
      try {
        aiLogs = await ctx.prisma.aIRecommendationLog.count({
          where: {
            clubId: input.clubId,
            createdAt: { gte: sevenDaysAgo },
          },
        })
      } catch (err) {
        console.warn('[Intelligence] aIRecommendationLog query failed:', err)
      }

      // Calculate occupancy stats
      const underfilledSessions = underfilled.filter(
        (s: any) => s._count.bookings < s.maxPlayers * 0.5
      )

      const totalCapacity = upcomingSessions.reduce((sum: number, s: any) => sum + s.maxPlayers, 0)
      const totalBooked = upcomingSessions.reduce((sum: number, s: any) => sum + s._count.bookings, 0)
      const avgOccupancy = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0

      // Estimate lost revenue from empty slots
      const avgPricePerSlot = 15 // $15 per player slot default
      const emptySlots = upcomingSessions.reduce(
        (sum: number, s: any) => sum + (s.maxPlayers - s._count.bookings),
        0
      )
      const estimatedLostRevenue = emptySlots * avgPricePerSlot

      return {
        metrics: {
          totalMembers,
          totalCourts,
          avgOccupancy,
          recentBookings,
          underfilledCount: underfilledSessions.length,
          aiRecommendationsThisWeek: aiLogs,
          estimatedLostRevenue,
          emptySlots,
        },
        upcomingSessions: upcomingSessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          format: s.format,
          skillLevel: s.skillLevel,
          maxPlayers: s.maxPlayers,
          confirmedCount: s._count.bookings,
          spotsRemaining: s.maxPlayers - s._count.bookings,
          occupancyPercent: Math.round((s._count.bookings / s.maxPlayers) * 100),
          courtName: s.clubCourt?.name || null,
        })),
        underfilledSessions: underfilledSessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          format: s.format,
          maxPlayers: s.maxPlayers,
          confirmedCount: s._count.bookings,
          spotsRemaining: s.maxPlayers - s._count.bookings,
          courtName: s.clubCourt?.name || null,
        })),
      }
    }),

  // ── Dashboard V2: Full analytics overview ──
  getDashboardV2: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const now = new Date()
      const d7 = new Date(now.getTime() - 7 * 86400000)
      const d14 = new Date(now.getTime() - 14 * 86400000)
      const d30 = new Date(now.getTime() - 30 * 86400000)
      const d60 = new Date(now.getTime() - 60 * 86400000)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      // ── Core queries (tables always exist) ──
      const [
        membersNow,
        membersAt30dAgo,
        completedSessions30d,
        completedSessionsPrev30d,
        upcomingSessions,
        newMembersThisMonth,
        allMembersWithUser,
      ] = await Promise.all([
        // 1. Current member count
        ctx.prisma.clubFollower.count({ where: { clubId: input.clubId } }),
        // 2. Members that existed 30 days ago (for trend)
        ctx.prisma.clubFollower.count({
          where: { clubId: input.clubId, createdAt: { lte: d30 } },
        }),
        // 3. Completed sessions in last 30 days
        ctx.prisma.playSession.findMany({
          where: { clubId: input.clubId, status: 'COMPLETED', date: { gte: d30 } },
          include: {
            clubCourt: true,
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
        }),
        // 4. Completed sessions in prev 30 days (for trend)
        ctx.prisma.playSession.findMany({
          where: { clubId: input.clubId, status: 'COMPLETED', date: { gte: d60, lt: d30 } },
          include: {
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
        }),
        // 5. Upcoming scheduled sessions
        ctx.prisma.playSession.findMany({
          where: { clubId: input.clubId, status: 'SCHEDULED', date: { gte: now } },
          include: {
            clubCourt: true,
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
          orderBy: { date: 'asc' },
          take: 20,
        }),
        // 6. New members this month
        ctx.prisma.clubFollower.count({
          where: { clubId: input.clubId, createdAt: { gte: monthStart } },
        }),
        // 7. All members with DUPR for skill distribution
        ctx.prisma.clubFollower.findMany({
          where: { clubId: input.clubId },
          include: { user: { select: { id: true, duprRatingDoubles: true } } },
        }),
      ])

      // ── Booking queries (table may not exist on some envs) ──
      let bookings30d = 0
      let bookingsPrev30d = 0
      let recentBookers: { userId: string }[] = []
      try {
        ;[bookings30d, bookingsPrev30d, recentBookers] = await Promise.all([
          ctx.prisma.playSessionBooking.count({
            where: { status: 'CONFIRMED', playSession: { clubId: input.clubId }, bookedAt: { gte: d30 } },
          }),
          ctx.prisma.playSessionBooking.count({
            where: { status: 'CONFIRMED', playSession: { clubId: input.clubId }, bookedAt: { gte: d60, lt: d30 } },
          }),
          ctx.prisma.playSessionBooking.findMany({
            where: {
              status: 'CONFIRMED',
              playSession: { clubId: input.clubId },
              bookedAt: { gte: d14 },
            },
            select: { userId: true },
            distinct: ['userId'],
          }),
        ])
      } catch {
        // playSessionBooking table may not exist yet — fall back to deriving from sessions
        bookings30d = completedSessions30d.reduce((sum, s) => sum + s._count.bookings, 0)
        bookingsPrev30d = completedSessionsPrev30d.reduce((sum, s) => sum + s._count.bookings, 0)
        recentBookers = []
      }

      // ── Helper: compute trend ──
      function computeTrend(current: number, previous: number, sparkline: number[] = []): {
        value: number; previousValue: number; changePercent: number;
        direction: 'up' | 'down' | 'neutral'; sparkline: number[];
      } {
        const change = previous > 0
          ? Math.round(((current - previous) / previous) * 1000) / 10
          : current > 0 ? 100 : 0
        return {
          value: current,
          previousValue: previous,
          changePercent: change,
          direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
          sparkline,
        }
      }

      // ── Compute occupancy metrics ──
      const calcAvgOcc = (sessions: Array<{ maxPlayers: number; _count: { bookings: number } }>) => {
        if (sessions.length === 0) return 0
        const total = sessions.reduce((sum, s) => {
          return sum + (s.maxPlayers > 0 ? (s._count.bookings / s.maxPlayers) * 100 : 0)
        }, 0)
        return Math.round(total / sessions.length)
      }
      const avgOcc30d = calcAvgOcc(completedSessions30d)
      const avgOccPrev30d = calcAvgOcc(completedSessionsPrev30d)

      // ── Sparkline data: daily booking counts for last 7 days ──
      const bookingSparkline: number[] = []
      const memberSparkline: number[] = []
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now.getTime() - i * 86400000)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)
        const dayBookings = completedSessions30d
          .filter(s => new Date(s.date) >= dayStart && new Date(s.date) <= dayEnd)
          .reduce((sum, s) => sum + s._count.bookings, 0)
        bookingSparkline.push(dayBookings)
      }
      // Simple member sparkline: approximate with linear growth
      const memberGrowth = membersNow - membersAt30dAgo
      for (let i = 0; i < 7; i++) {
        memberSparkline.push(Math.round(membersAt30dAgo + (memberGrowth * (i + 1)) / 7))
      }

      // ── Lost revenue ──
      const avgPricePerSlot = 15
      const emptySlots = upcomingSessions.reduce(
        (sum, s) => sum + Math.max(0, s.maxPlayers - s._count.bookings), 0
      )
      const lostRevenue = emptySlots * avgPricePerSlot
      // Previous lost revenue estimate
      const prevEmptySlots = completedSessionsPrev30d.reduce(
        (sum, s) => sum + Math.max(0, s.maxPlayers - s._count.bookings), 0
      )
      const prevLostRevenue = prevEmptySlots * avgPricePerSlot

      // ── Occupancy breakdowns ──
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const byDayMap: Record<string, { total: number; count: number }> = {}
      const bySlotMap: Record<string, { total: number; count: number }> = {}
      const byFormatMap: Record<string, { total: number; count: number }> = {}

      for (const s of completedSessions30d) {
        const occ = s.maxPlayers > 0 ? Math.round((s._count.bookings / s.maxPlayers) * 100) : 0
        // By day
        const dayName = dayNames[new Date(s.date).getDay()]
        if (!byDayMap[dayName]) byDayMap[dayName] = { total: 0, count: 0 }
        byDayMap[dayName].total += occ
        byDayMap[dayName].count++

        // By time slot
        const hour = parseInt(s.startTime.split(':')[0], 10)
        const slot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
        if (!bySlotMap[slot]) bySlotMap[slot] = { total: 0, count: 0 }
        bySlotMap[slot].total += occ
        bySlotMap[slot].count++

        // By format
        if (!byFormatMap[s.format]) byFormatMap[s.format] = { total: 0, count: 0 }
        byFormatMap[s.format].total += occ
        byFormatMap[s.format].count++
      }

      const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const byDay = orderedDays.map(day => ({
        day,
        avgOccupancy: byDayMap[day] ? Math.round(byDayMap[day].total / byDayMap[day].count) : 0,
        sessionCount: byDayMap[day]?.count || 0,
      }))

      const slotOrder: Array<'morning' | 'afternoon' | 'evening'> = ['morning', 'afternoon', 'evening']
      const byTimeSlot = slotOrder.map(slot => ({
        slot,
        avgOccupancy: bySlotMap[slot] ? Math.round(bySlotMap[slot].total / bySlotMap[slot].count) : 0,
        sessionCount: bySlotMap[slot]?.count || 0,
      }))

      const byFormat = Object.entries(byFormatMap).map(([format, data]) => ({
        format: format as any,
        avgOccupancy: Math.round(data.total / data.count),
        sessionCount: data.count,
      })).sort((a, b) => b.sessionCount - a.sessionCount)

      // ── Session rankings ──
      const allSessionsWithOcc = completedSessions30d.map(s => ({
        id: s.id,
        title: s.title,
        date: s.date.toISOString(),
        startTime: s.startTime,
        endTime: s.endTime,
        format: s.format as any,
        courtName: s.clubCourt?.name || null,
        occupancyPercent: s.maxPlayers > 0 ? Math.round((s._count.bookings / s.maxPlayers) * 100) : 0,
        confirmedCount: s._count.bookings,
        maxPlayers: s.maxPlayers,
      }))
      const sortedByOcc = [...allSessionsWithOcc].sort((a, b) => b.occupancyPercent - a.occupancyPercent)
      const topSessions = sortedByOcc.slice(0, 5)
      const problematicSessions = [...allSessionsWithOcc]
        .sort((a, b) => a.occupancyPercent - b.occupancyPercent)
        .slice(0, 5)

      // ── Player distributions ──
      const activeUserIds = new Set(recentBookers.map(b => b.userId))
      const activeCount = activeUserIds.size
      const inactiveCount = Math.max(0, membersNow - activeCount)

      // Skill level distribution
      const skillBuckets: Record<string, number> = { Beginner: 0, Intermediate: 0, Advanced: 0, Unrated: 0 }
      for (const f of allMembersWithUser) {
        const rating = f.user?.duprRatingDoubles ? Number(f.user.duprRatingDoubles) : null
        if (!rating) skillBuckets['Unrated']++
        else if (rating < 3.0) skillBuckets['Beginner']++
        else if (rating < 4.5) skillBuckets['Intermediate']++
        else skillBuckets['Advanced']++
      }
      const totalMembers = allMembersWithUser.length || 1
      const bySkillLevel = Object.entries(skillBuckets)
        .filter(([, count]) => count > 0)
        .map(([label, count]) => ({
          label,
          count,
          percent: Math.round((count / totalMembers) * 100),
        }))

      // Format preference: count unique users by format of their bookings in last 30d
      const formatCounts: Record<string, number> = {}
      for (const s of completedSessions30d) {
        const fmt = s.format
        formatCounts[fmt] = (formatCounts[fmt] || 0) + s._count.bookings
      }
      const formatLabels: Record<string, string> = {
        OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
        LEAGUE_PLAY: 'League', SOCIAL: 'Social',
      }
      const totalFormatBookings = Object.values(formatCounts).reduce((a, b) => a + b, 0) || 1
      const byFormatDist = Object.entries(formatCounts)
        .map(([fmt, count]) => ({
          label: formatLabels[fmt] || fmt,
          count,
          percent: Math.round((count / totalFormatBookings) * 100),
        }))
        .sort((a, b) => b.count - a.count)

      // ── Occupancy sparkline ──
      const occSparkline: number[] = []
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now.getTime() - i * 86400000)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)
        const daySessions = completedSessions30d.filter(
          s => new Date(s.date) >= dayStart && new Date(s.date) <= dayEnd
        )
        if (daySessions.length > 0) {
          const avg = daySessions.reduce((sum, s) =>
            sum + (s.maxPlayers > 0 ? (s._count.bookings / s.maxPlayers) * 100 : 0), 0
          ) / daySessions.length
          occSparkline.push(Math.round(avg))
        } else {
          occSparkline.push(0)
        }
      }

      return {
        metrics: {
          members: {
            label: 'Members',
            value: membersNow,
            trend: computeTrend(membersNow, membersAt30dAgo, memberSparkline),
            subtitle: `${newMembersThisMonth} new this month`,
          },
          occupancy: {
            label: 'Avg Occupancy',
            value: `${avgOcc30d}%`,
            trend: computeTrend(avgOcc30d, avgOccPrev30d, occSparkline),
            subtitle: `${completedSessions30d.length} sessions (30d)`,
          },
          lostRevenue: {
            label: 'Est. Lost Revenue',
            value: `$${lostRevenue.toLocaleString()}`,
            trend: computeTrend(lostRevenue, prevLostRevenue),
            subtitle: `${emptySlots} empty slots`,
          },
          bookings: {
            label: 'Bookings',
            value: bookings30d,
            trend: computeTrend(bookings30d, bookingsPrev30d, bookingSparkline),
            subtitle: 'last 30 days',
          },
        },
        occupancy: { byDay, byTimeSlot, byFormat },
        sessions: { topSessions, problematicSessions },
        players: {
          bySkillLevel,
          byFormat: byFormatDist,
          activeCount,
          inactiveCount,
          newThisMonth: newMembersThisMonth,
        },
      }
    }),

  // ── Sessions: List play sessions with filters ──
  listSessions: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const where: any = { clubId: input.clubId }
      if (input.status) where.status = input.status
      if (input.dateFrom || input.dateTo) {
        where.date = {}
        if (input.dateFrom) where.date.gte = input.dateFrom
        if (input.dateTo) where.date.lte = input.dateTo
      }

      return ctx.prisma.playSession.findMany({
        where,
        include: {
          clubCourt: true,
          _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
        },
        orderBy: { date: 'asc' },
      })
    }),

  // ── Courts: Manage club courts ──
  listCourts: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      return ctx.prisma.clubCourt.findMany({
        where: { clubId: input.clubId },
        orderBy: { name: 'asc' },
      })
    }),

  // ── AI Advisor: Conversation management ──
  listConversations: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.aIConversation.findMany({
          where: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
          },
          orderBy: { updatedAt: 'desc' },
          take: input.limit,
          include: {
            _count: { select: { messages: true } },
          },
        })
      } catch (err) {
        console.warn('[Intelligence] listConversations failed:', err)
        return []
      }
    }),

  getConversation: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const conversation = await ctx.prisma.aIConversation.findUnique({
          where: { id: input.conversationId },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        })
        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
        }
        if (conversation.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your conversation' })
        }
        return conversation
      } catch (err) {
        if (err instanceof TRPCError) throw err
        console.warn('[Intelligence] getConversation failed:', err)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load conversation' })
      }
    }),

  createConversation: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      title: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.aIConversation.create({
          data: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            title: input.title || 'New conversation',
          },
        })
      } catch (err) {
        console.warn('[Intelligence] createConversation failed:', err)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create conversation' })
      }
    }),

  deleteConversation: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const conversation = await ctx.prisma.aIConversation.findUnique({
          where: { id: input.conversationId },
        })
        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
        }
        if (conversation.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your conversation' })
        }
        await ctx.prisma.aIConversation.delete({
          where: { id: input.conversationId },
        })
        return { success: true }
      } catch (err) {
        if (err instanceof TRPCError) throw err
        console.warn('[Intelligence] deleteConversation failed:', err)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete conversation' })
      }
    }),

  deleteAllConversations: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Delete all messages first (FK constraint), then conversations
        await ctx.prisma.aIMessage.deleteMany({
          where: { conversation: { clubId: input.clubId, userId: ctx.session.user.id } },
        })
        await ctx.prisma.aIConversation.deleteMany({
          where: { clubId: input.clubId, userId: ctx.session.user.id },
        })
        return { success: true }
      } catch (err) {
        console.warn('[Intelligence] deleteAllConversations failed:', err)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete conversations' })
      }
    }),

  // ── RAG: Trigger embedding index for a club ──
  reindexClub: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { isAdmin } = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can reindex' })
      }
      const { indexAll } = await import('@/lib/ai/rag/indexer')
      return indexAll(input.clubId)
    }),
})
