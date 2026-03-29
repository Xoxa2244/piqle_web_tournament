import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { checkFeatureAccess } from '@/lib/subscription'
import type { DayOfWeek, PlaySessionFormat } from '@/types/intelligence'
import {
  getSlotFillerRecommendations,
  getWeeklyPlan,
  getReactivationCandidates,
  getEventRecommendations,
  sendInvites,
  sendReactivationMessages,
  sendEventInviteMessages,
  sendOutreachMessage,
  upsertPreferences,
  getPreferences,
} from '@/lib/ai/intelligence-service'
import { checkCampaignAlerts } from '@/lib/ai/scoring-optimizer'
import { generateMemberProfilesForClub, generateSingleMemberProfile } from '@/lib/ai/member-profile-generator'

// ── In-memory caches (per serverless instance, 5 min TTL) ──
const calendarCache = new Map<string, { data: any; ts: number }>()

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
  // ── Subscription: Get current club subscription ──
  getSubscription: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const subscription = await ctx.prisma.subscription.findUnique({
        where: { clubId: input.clubId },
      })
      return subscription
    }),

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
      sessionId: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(5),
      enhance: z.boolean().default(false),
      clubId: z.string().uuid().optional(), // Required for CSV session IDs
    }))
    .query(async ({ ctx, input }) => {
      // CSV fallback path: session IDs like "csv-0", "csv-1"
      if (input.sessionId.startsWith('csv-')) {
        if (!input.clubId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'clubId required for CSV sessions' })
        }
        await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
        await checkFeatureAccess(input.clubId, 'slot-filler')
        const { getSlotFillerRecommendationsCsv } = await import('@/lib/ai/intelligence-service')
        const result = await getSlotFillerRecommendationsCsv(ctx.prisma, {
          sessionId: input.sessionId,
          clubId: input.clubId,
          limit: input.limit,
        })
        return { ...result, aiEnhancements: [] }
      }

      // Standard PlaySession UUID path
      const session = await ctx.prisma.playSession.findUnique({
        where: { id: input.sessionId },
        select: { clubId: true },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
      }
      await requireClubAdmin(ctx.prisma, session.clubId, ctx.session.user.id)
      await checkFeatureAccess(session.clubId, 'slot-filler')
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
      limit: z.number().int().min(1).max(5000).default(500),
      enhance: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      await checkFeatureAccess(input.clubId, 'reactivation')
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

  // ── Event Recommendations: AI-generated event suggestions ──
  getEventRecommendations: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(10).default(5),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      await checkFeatureAccess(input.clubId, 'slot-filler')
      return getEventRecommendations(ctx.prisma, input)
    }),

  // ── Send Invites: Invite recommended users to a session ──
  sendInvites: protectedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      clubId: z.string().uuid(),
      candidates: z.array(z.object({
        memberId: z.string(),
        channel: z.enum(['email', 'sms', 'both']),
        customMessage: z.string().max(1000).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      await checkFeatureAccess(input.clubId, 'slot-filler')
      return sendInvites(ctx.prisma, input)
    }),

  // ── Reactivation: Send re-engagement email/SMS to inactive members ──
  sendReactivationMessages: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      candidates: z.array(z.object({
        memberId: z.string().uuid(),
        channel: z.enum(['email', 'sms', 'both']),
      })),
      customMessage: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      await checkFeatureAccess(input.clubId, 'reactivation')
      return sendReactivationMessages(ctx.prisma, input)
    }),

  // ── Event Invites: Send personalized invites to matched players ──
  sendEventInvites: protectedProcedure
    .input(z.object({
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
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      await checkFeatureAccess(input.clubId, 'slot-filler')
      return sendEventInviteMessages(ctx.prisma, input)
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
    .input(z.object({
      clubId: z.string().uuid(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const now = new Date()
      const currentEnd = input.dateTo ? new Date(input.dateTo + 'T23:59:59') : now
      const currentStart = input.dateFrom ? new Date(input.dateFrom + 'T00:00:00')
        : new Date(currentEnd.getTime() - 30 * 86400000)
      const periodMs = currentEnd.getTime() - currentStart.getTime()
      const previousStart = new Date(currentStart.getTime() - periodMs)

      // Aliases for backward compatibility with existing DB queries
      let d30 = currentStart
      let d60 = previousStart
      let d7 = new Date(currentEnd.getTime() - 7 * 86400000)
      let d14 = new Date(currentEnd.getTime() - 14 * 86400000)
      const monthStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth(), 1)

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

      const emptyTrend = computeTrend(0, 0)

      // ── Member + CSV player queries ──
      const [followersCount, membersAt30dAgo, newMembersThisMonth, allMembersWithUser, csvPlayerCountRows] =
        await Promise.all([
          ctx.prisma.clubFollower.count({ where: { clubId: input.clubId } }),
          ctx.prisma.clubFollower.count({
            where: { clubId: input.clubId, createdAt: { lte: d30 } },
          }),
          ctx.prisma.clubFollower.count({
            where: { clubId: input.clubId, createdAt: { gte: monthStart } },
          }),
          ctx.prisma.clubFollower.findMany({
            where: { clubId: input.clubId },
            include: { user: { select: { id: true, duprRatingDoubles: true } } },
          }),
          // Count unique player names from CSV embeddings
          ctx.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(DISTINCT value) as count
            FROM document_embeddings,
              LATERAL jsonb_array_elements_text(metadata->'playerNames') as value
            WHERE club_id = ${input.clubId}::uuid
              AND content_type = 'session'
              AND source_table = 'csv_import'
          `.catch(() => [{ count: BigInt(0) }]),
        ])

      // Use the larger of: followers vs unique CSV players
      const csvPlayerCount = Number(csvPlayerCountRows[0]?.count ?? 0)
      const membersNow = Math.max(followersCount, csvPlayerCount)

      // Member sparkline (always safe)
      const membersBase = Math.max(membersAt30dAgo, csvPlayerCount)
      const memberGrowth = membersNow - membersBase
      const memberSparkline: number[] = []
      for (let i = 0; i < 7; i++) {
        memberSparkline.push(Math.round(membersBase + (memberGrowth * (i + 1)) / 7))
      }

      // Skill level distribution (always safe)
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

      // ── Auto-detect date range if CSV data is older than 30 days ──
      if (!input.dateFrom && !input.dateTo) {
        const latestSession = await ctx.prisma.playSession.findFirst({
          where: { clubId: input.clubId, status: 'COMPLETED' },
          orderBy: { date: 'desc' },
          select: { date: true },
        }).catch(() => null)

        if (latestSession && new Date(latestSession.date) < d30) {
          // Shift the window to cover actual data
          const latestDate = new Date(latestSession.date)
          latestDate.setHours(23, 59, 59, 999)
          d30 = new Date(latestDate.getTime() - 30 * 86400000)
          d60 = new Date(latestDate.getTime() - 60 * 86400000)
          d7 = new Date(latestDate.getTime() - 7 * 86400000)
          d14 = new Date(latestDate.getTime() - 14 * 86400000)
        }
      }

      // ── Session + Booking queries (may fail if booking table missing) ──
      try {
        const [
          completedSessions30d,
          completedSessionsPrev30d,
          bookings30d,
          bookingsPrev30d,
          upcomingSessions,
          recentBookers,
        ] = await Promise.all([
          ctx.prisma.playSession.findMany({
            where: { clubId: input.clubId, status: 'COMPLETED', date: { gte: d30, lte: currentEnd } },
            include: {
              clubCourt: true,
              _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
            },
          }),
          ctx.prisma.playSession.findMany({
            where: { clubId: input.clubId, status: 'COMPLETED', date: { gte: d60, lt: d30 } },
            include: {
              _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
            },
          }),
          ctx.prisma.playSessionBooking.count({
            where: { status: 'CONFIRMED', playSession: { clubId: input.clubId }, bookedAt: { gte: d30, lte: currentEnd } },
          }),
          ctx.prisma.playSessionBooking.count({
            where: { status: 'CONFIRMED', playSession: { clubId: input.clubId }, bookedAt: { gte: d60, lt: d30 } },
          }),
          ctx.prisma.playSession.findMany({
            where: { clubId: input.clubId, status: 'SCHEDULED', date: { gte: now } },
            include: {
              clubCourt: true,
              _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
            },
            orderBy: { date: 'asc' },
            take: 20,
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

        // If tables exist but have no session data, fall through to CSV fallback
        if (completedSessions30d.length === 0 && completedSessionsPrev30d.length === 0
          && upcomingSessions.length === 0 && bookings30d === 0) {
          throw new Error('NO_SESSION_DATA_FOUND')
        }

        // If sessions have registeredCount (CSV import), use that for bookings metric
        const hasRegisteredCount = completedSessions30d.some((s: any) => (s.registeredCount ?? 0) != null)
        const effectiveBookings30d = hasRegisteredCount
          ? completedSessions30d.reduce((sum: number, s: any) => sum + ((s.registeredCount ?? 0) ?? 0), 0)
          : bookings30d
        const effectiveBookingsPrev30d = hasRegisteredCount
          ? completedSessionsPrev30d.reduce((sum: number, s: any) => sum + ((s.registeredCount ?? 0) ?? 0), 0)
          : bookingsPrev30d

        // ── Helper: prefer registeredCount from CSV over booking count ──
        const getRegistered = (s: { registeredCount?: number | null; _count: { bookings: number } }) =>
          (s.registeredCount ?? 0) ?? s._count.bookings

        // ── Compute occupancy metrics ──
        const calcAvgOcc = (sessions: Array<{ maxPlayers: number; registeredCount?: number | null; _count: { bookings: number } }>) => {
          if (sessions.length === 0) return 0
          const total = sessions.reduce((sum, s) => {
            const reg = getRegistered(s)
            return sum + (s.maxPlayers > 0 ? (reg / s.maxPlayers) * 100 : 0)
          }, 0)
          return Math.round(total / sessions.length)
        }
        const avgOcc30d = calcAvgOcc(completedSessions30d)
        const avgOccPrev30d = calcAvgOcc(completedSessionsPrev30d)

        // Sparklines
        const bookingSparkline: number[] = []
        const occSparkline: number[] = []
        for (let i = 6; i >= 0; i--) {
          const dayStart = new Date(now.getTime() - i * 86400000)
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setHours(23, 59, 59, 999)
          const daySessions = completedSessions30d.filter(
            s => new Date(s.date) >= dayStart && new Date(s.date) <= dayEnd
          )
          bookingSparkline.push(daySessions.reduce((sum, s) => sum + getRegistered(s), 0))
          if (daySessions.length > 0) {
            const avg = daySessions.reduce((sum, s) =>
              sum + (s.maxPlayers > 0 ? (getRegistered(s) / s.maxPlayers) * 100 : 0), 0
            ) / daySessions.length
            occSparkline.push(Math.round(avg))
          } else {
            occSparkline.push(0)
          }
        }

        // Lost revenue
        const avgPricePerSlot = 15
        const emptySlots = upcomingSessions.reduce(
          (sum, s) => sum + Math.max(0, s.maxPlayers - getRegistered(s)), 0
        )
        const lostRevenue = emptySlots * avgPricePerSlot
        const prevEmptySlots = completedSessionsPrev30d.reduce(
          (sum, s) => sum + Math.max(0, s.maxPlayers - getRegistered(s)), 0
        )
        const prevLostRevenue = prevEmptySlots * avgPricePerSlot

        // Occupancy breakdowns
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const byDayMap: Record<string, { total: number; count: number }> = {}
        const bySlotMap: Record<string, { total: number; count: number }> = {}
        const byFormatMap: Record<string, { total: number; count: number }> = {}
        for (const s of completedSessions30d) {
          const occ = s.maxPlayers > 0 ? Math.round((getRegistered(s) / s.maxPlayers) * 100) : 0
          const dayName = dayNames[new Date(s.date).getDay()]
          if (!byDayMap[dayName]) byDayMap[dayName] = { total: 0, count: 0 }
          byDayMap[dayName].total += occ
          byDayMap[dayName].count++
          const hour = parseInt(s.startTime.split(':')[0], 10)
          const slot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
          if (!bySlotMap[slot]) bySlotMap[slot] = { total: 0, count: 0 }
          bySlotMap[slot].total += occ
          bySlotMap[slot].count++
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

        // Session rankings
        const allSessionsWithOcc = completedSessions30d.map(s => ({
          id: s.id,
          title: s.title,
          date: s.date.toISOString(),
          startTime: s.startTime,
          endTime: s.endTime,
          format: s.format as any,
          courtName: s.clubCourt?.name || null,
          occupancyPercent: s.maxPlayers > 0 ? Math.round((getRegistered(s) / s.maxPlayers) * 100) : 0,
          confirmedCount: getRegistered(s),
          maxPlayers: s.maxPlayers,
        }))
        const sortedByOcc = [...allSessionsWithOcc].sort((a, b) => b.occupancyPercent - a.occupancyPercent)
        const topSessions = sortedByOcc.slice(0, 5)
        const problematicSessions = [...allSessionsWithOcc]
          .sort((a, b) => a.occupancyPercent - b.occupancyPercent)
          .slice(0, 5)

        // Player activity — use CSV player count if available for better inactive estimate
        const activeUserIds = new Set(recentBookers.map(b => b.userId))
        const activeCount = csvPlayerCount > 0
          ? Math.max(activeUserIds.size, Math.round(csvPlayerCount * 0.6)) // estimate ~60% active from CSV
          : activeUserIds.size
        const inactiveCount = Math.max(0, membersNow - activeCount)

        // Format preference — use registeredCount for accurate distribution
        const formatCounts: Record<string, number> = {}
        for (const s of completedSessions30d) {
          formatCounts[s.format] = (formatCounts[s.format] || 0) + getRegistered(s)
        }
        const fmtLabels: Record<string, string> = {
          OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
          LEAGUE_PLAY: 'League', SOCIAL: 'Social',
        }
        const totalFmtBookings = Object.values(formatCounts).reduce((a, b) => a + b, 0) || 1
        const byFormatDist = Object.entries(formatCounts)
          .map(([fmt, count]) => ({
            label: fmtLabels[fmt] || fmt,
            count,
            percent: Math.round((count / totalFmtBookings) * 100),
          }))
          .sort((a, b) => b.count - a.count)

        return {
          metrics: {
            members: {
              label: 'Players',
              value: membersNow,
              trend: computeTrend(membersNow, membersBase, memberSparkline),
              subtitle: csvPlayerCount > followersCount
                ? `${csvPlayerCount} from imported data`
                : `${newMembersThisMonth} new this month`,
              description: 'Total unique players across all sessions',
            },
            occupancy: {
              label: 'Avg Occupancy',
              value: `${avgOcc30d}%`,
              trend: computeTrend(avgOcc30d, avgOccPrev30d, occSparkline),
              subtitle: `${completedSessions30d.length} sessions (30d)`,
              description: 'Average % of filled spots across all sessions',
            },
            lostRevenue: {
              label: 'Est. Lost Revenue',
              value: `$${lostRevenue.toLocaleString()}`,
              trend: computeTrend(lostRevenue, prevLostRevenue),
              subtitle: `${emptySlots} empty slots`,
              description: 'Revenue lost from unfilled spots based on pricing',
            },
            bookings: {
              label: 'Bookings',
              value: effectiveBookings30d,
              trend: computeTrend(effectiveBookings30d, effectiveBookingsPrev30d, bookingSparkline),
              subtitle: 'last 30 days',
              description: 'Total confirmed bookings across all sessions',
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
            membershipBreakdown: await (async () => {
              try {
                const rows = await ctx.prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
                  SELECT metadata->>'membershipStatus' as status, count(*) as cnt
                  FROM document_embeddings
                  WHERE club_id = ${input.clubId}::uuid AND content_type = 'member' AND source_table = 'csv_import'
                  GROUP BY metadata->>'membershipStatus'
                `
                if (rows.length === 0) return null
                const map: Record<string, number> = {}
                rows.forEach(r => { map[r.status] = Number(r.cnt) })
                return { active: map['Currently Active'] || 0, suspended: map['Suspended'] || 0, noMembership: map['No Membership'] || 0, expired: map['Expired'] || 0 }
              } catch { return null }
            })(),
          },
        }
      } catch (err) {
        // ── Fallback: read from document_embeddings (CSV-imported data) ──
        console.warn('[getDashboardV2] Fallback mode:', (err as Error).message?.slice(0, 120))

        interface CsvSessionMeta {
          date: string; startTime: string; endTime: string; court: string
          format: string; skillLevel: string; registered: number
          capacity: number; occupancy: number; playerNames: string[]
          pricePerPlayer?: number | null
          revenue?: number | null
          lostRevenue?: number | null
        }

        let allCsvSessions: CsvSessionMeta[] = []
        try {
          const rows = await ctx.prisma.$queryRaw<Array<{ metadata: any }>>`
            SELECT metadata FROM document_embeddings
            WHERE club_id = ${input.clubId}::uuid
              AND content_type = 'session'
              AND source_table = 'csv_import'
          `
          allCsvSessions = rows
            .map(r => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as CsvSessionMeta)
            .filter(m => m && m.date && m.capacity > 0)
        } catch (embErr) {
          console.warn('[getDashboardV2] document_embeddings query failed:', (embErr as Error).message?.slice(0, 80))
        }

        if (allCsvSessions.length === 0) {
          // No CSV data — return member-only dashboard
          return {
            metrics: {
              members: {
                label: 'Members', value: membersNow,
                trend: computeTrend(membersNow, membersAt30dAgo, memberSparkline),
                subtitle: `${newMembersThisMonth} new this month`,
                description: 'Total active members following your club',
              },
              occupancy: { label: 'Avg Occupancy', value: 'N/A', trend: emptyTrend, subtitle: 'No session data', description: 'Average % of filled spots across all sessions' },
              lostRevenue: { label: 'Est. Lost Revenue', value: 'N/A', trend: emptyTrend, subtitle: 'No session data', description: 'Revenue lost from unfilled spots based on pricing' },
              bookings: { label: 'Bookings', value: 'N/A', trend: emptyTrend, subtitle: 'Import CSV to see data', description: 'Total confirmed bookings across all sessions' },
            },
            occupancy: {
              byDay: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => ({ day: d, avgOccupancy: 0, sessionCount: 0 })),
              byTimeSlot: (['morning', 'afternoon', 'evening'] as const).map(s => ({ slot: s, avgOccupancy: 0, sessionCount: 0 })),
              byFormat: [],
            },
            sessions: { topSessions: [], problematicSessions: [] },
            players: {
              bySkillLevel, byFormat: [],
              activeCount: 0, inactiveCount: membersNow,
              newThisMonth: newMembersThisMonth,
            },
          }
        }

        // ── Compute dashboard from CSV data ──
        // Use input date range if provided, otherwise default to latest CSV date
        const allDates = allCsvSessions.map(s => s.date).sort()
        const latestDateStr = allDates[allDates.length - 1]
        const latestDate = new Date(latestDateStr + 'T23:59:59')

        const effectiveEndStr = input.dateTo || latestDateStr
        const effectiveEnd = new Date(effectiveEndStr + 'T23:59:59')
        const defaultPeriodMs = 30 * 86400000
        const effectiveStartStr = input.dateFrom
          || new Date(effectiveEnd.getTime() - defaultPeriodMs).toISOString().slice(0, 10)
        const csvPeriodMs = effectiveEnd.getTime() - new Date(effectiveStartStr + 'T00:00:00').getTime()
        const csvPrevStartStr = new Date(new Date(effectiveStartStr + 'T00:00:00').getTime() - csvPeriodMs).toISOString().slice(0, 10)

        const csvD30Str = effectiveStartStr
        const csvD60Str = csvPrevStartStr
        const csvD14Str = new Date(effectiveEnd.getTime() - 14 * 86400000).toISOString().slice(0, 10)

        let currentSessions = allCsvSessions.filter(s => s.date >= csvD30Str && s.date <= effectiveEndStr)
        let previousSessions = allCsvSessions.filter(s => s.date >= csvD60Str && s.date < csvD30Str)

        // If no sessions in the recent 30d window, split all data into halves for trend comparison
        if (currentSessions.length === 0) {
          const sorted = [...allCsvSessions].sort((a, b) => a.date.localeCompare(b.date))
          const mid = Math.floor(sorted.length / 2)
          previousSessions = sorted.slice(0, mid)
          currentSessions = sorted.slice(mid)
        }

        // ── Metrics ──
        const avgOcc = currentSessions.length > 0
          ? Math.round(currentSessions.reduce((sum, s) => sum + s.occupancy, 0) / currentSessions.length)
          : 0
        const prevAvgOcc = previousSessions.length > 0
          ? Math.round(previousSessions.reduce((sum, s) => sum + s.occupancy, 0) / previousSessions.length)
          : 0
        const totalBookings = currentSessions.reduce((sum, s) => sum + s.registered, 0)
        const prevBookings = previousSessions.reduce((sum, s) => sum + s.registered, 0)
        const emptySlots = currentSessions.reduce((sum, s) => sum + Math.max(0, s.capacity - s.registered), 0)
        const prevEmpty = previousSessions.reduce((sum, s) => sum + Math.max(0, s.capacity - s.registered), 0)

        // Use actual prices from CSV when available, fall back to $15 estimate
        const hasRealPrices = currentSessions.some(s => s.pricePerPlayer != null && s.pricePerPlayer > 0)
        const lostRev = hasRealPrices
          ? currentSessions.reduce((sum, s) => sum + Math.max(0, s.capacity - s.registered) * (s.pricePerPlayer || 0), 0)
          : emptySlots * 15
        const prevLostRev = hasRealPrices
          ? previousSessions.reduce((sum, s) => sum + Math.max(0, s.capacity - s.registered) * (s.pricePerPlayer || 0), 0)
          : prevEmpty * 15
        const totalRevenue = hasRealPrices
          ? currentSessions.reduce((sum, s) => sum + s.registered * (s.pricePerPlayer || 0), 0)
          : 0

        // Sparklines (7 data points from the current period)
        const occSpark: number[] = []
        const bookSpark: number[] = []
        for (let i = 6; i >= 0; i--) {
          const dayStr = new Date(effectiveEnd.getTime() - i * 86400000).toISOString().slice(0, 10)
          const ds = currentSessions.filter(s => s.date === dayStr)
          occSpark.push(ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.occupancy, 0) / ds.length) : 0)
          bookSpark.push(ds.reduce((a, s) => a + s.registered, 0))
        }

        // ── Occupancy breakdowns ──
        const dayNamesArr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const byDayMap: Record<string, { total: number; count: number }> = {}
        const bySlotMap: Record<string, { total: number; count: number }> = {}
        const byFmtMap: Record<string, { total: number; count: number }> = {}
        const fmtLabelsMap: Record<string, string> = {
          OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
          LEAGUE_PLAY: 'League', SOCIAL: 'Social',
        }

        for (const s of currentSessions) {
          const occ = s.occupancy
          const dayName = dayNamesArr[new Date(s.date + 'T12:00:00').getDay()]
          if (!byDayMap[dayName]) byDayMap[dayName] = { total: 0, count: 0 }
          byDayMap[dayName].total += occ
          byDayMap[dayName].count++

          const hour = parseInt(s.startTime.split(':')[0], 10)
          const slot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
          if (!bySlotMap[slot]) bySlotMap[slot] = { total: 0, count: 0 }
          bySlotMap[slot].total += occ
          bySlotMap[slot].count++

          if (!byFmtMap[s.format]) byFmtMap[s.format] = { total: 0, count: 0 }
          byFmtMap[s.format].total += occ
          byFmtMap[s.format].count++
        }

        const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        const byDay = orderedDays.map(day => ({
          day,
          avgOccupancy: byDayMap[day] ? Math.round(byDayMap[day].total / byDayMap[day].count) : 0,
          sessionCount: byDayMap[day]?.count || 0,
        }))
        const byTimeSlot = (['morning', 'afternoon', 'evening'] as const).map(slot => ({
          slot,
          avgOccupancy: bySlotMap[slot] ? Math.round(bySlotMap[slot].total / bySlotMap[slot].count) : 0,
          sessionCount: bySlotMap[slot]?.count || 0,
        }))
        const byFormat = Object.entries(byFmtMap).map(([format, data]) => ({
          format: format as any,
          avgOccupancy: Math.round(data.total / data.count),
          sessionCount: data.count,
        })).sort((a, b) => b.sessionCount - a.sessionCount)

        // ── Session rankings ──
        const allMapped = currentSessions.map((s, i) => ({
          id: `csv-${i}`,
          title: `${fmtLabelsMap[s.format] || s.format} @ ${s.court}`,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          format: s.format as any,
          courtName: s.court,
          occupancyPercent: s.occupancy,
          confirmedCount: s.registered,
          maxPlayers: s.capacity,
        }))
        const topSessions = [...allMapped].sort((a, b) => b.occupancyPercent - a.occupancyPercent).slice(0, 5)
        const problematicSessions = [...allMapped].sort((a, b) => a.occupancyPercent - b.occupancyPercent).slice(0, 5)

        // ── Player activity from CSV player names ──
        // "Active" = played in the current period
        const prevPlayers = new Set<string>()
        const recentPlayers = new Set<string>()
        for (const s of previousSessions) {
          for (const name of (s.playerNames || [])) {
            prevPlayers.add(name)
          }
        }
        for (const s of currentSessions) {
          for (const name of (s.playerNames || [])) {
            recentPlayers.add(name)
          }
        }
        const csvActive = recentPlayers.size
        // Inactive = played in previous period but NOT in current period
        let csvInactive = 0
        prevPlayers.forEach(name => { if (!recentPlayers.has(name)) csvInactive++ })

        // Format preference from registrations
        const fmtBookings: Record<string, number> = {}
        for (const s of currentSessions) {
          const label = fmtLabelsMap[s.format] || s.format
          fmtBookings[label] = (fmtBookings[label] || 0) + s.registered
        }
        const totalFmtB = Object.values(fmtBookings).reduce((a, b) => a + b, 0) || 1
        const byFormatDist = Object.entries(fmtBookings)
          .map(([label, count]) => ({ label, count, percent: Math.round((count / totalFmtB) * 100) }))
          .sort((a, b) => b.count - a.count)

        // Player counts from CSV (more meaningful than clubFollower count)
        // csvPlayerCount = unique players in the current period (period-sensitive)
        const csvPlayerCount = recentPlayers.size
        const prevAllPlayers = new Set<string>()
        for (const s of previousSessions) {
          for (const name of (s.playerNames || [])) prevAllPlayers.add(name)
        }
        const prevPlayerCount = prevAllPlayers.size

        // Sparkline for players (unique players per day over last 7 data points)
        const playerSpark: number[] = []
        for (let i = 6; i >= 0; i--) {
          const dayStr = new Date(effectiveEnd.getTime() - i * 86400000).toISOString().slice(0, 10)
          const dayPlayers = new Set<string>()
          for (const s of currentSessions) {
            if (s.date === dayStr) {
              for (const n of (s.playerNames || [])) dayPlayers.add(n)
            }
          }
          playerSpark.push(dayPlayers.size)
        }

        // New players: in current period but not in previous period
        let newPlayers = 0
        recentPlayers.forEach(p => { if (!prevAllPlayers.has(p)) newPlayers++ })

        return {
          metrics: {
            members: {
              label: 'Players', value: csvPlayerCount,
              trend: computeTrend(csvPlayerCount, prevPlayerCount, playerSpark),
              subtitle: `${csvActive} active · ${csvInactive} inactive`,
              description: 'Total unique players from imported session data',
            },
            occupancy: {
              label: 'Avg Occupancy', value: `${avgOcc}%`,
              trend: computeTrend(avgOcc, prevAvgOcc, occSpark),
              subtitle: `${currentSessions.length} sessions`,
              description: 'Average % of filled spots across all sessions',
            },
            lostRevenue: {
              label: hasRealPrices ? 'Lost Revenue' : 'Est. Lost Revenue',
              value: `$${lostRev.toLocaleString()}`,
              trend: computeTrend(lostRev, prevLostRev),
              subtitle: hasRealPrices
                ? `$${totalRevenue.toLocaleString()} earned · ${emptySlots} empty slots`
                : `${emptySlots} empty slots (est. $15/slot)`,
              description: 'Revenue lost from unfilled spots based on pricing',
            },
            bookings: {
              label: 'Registrations', value: totalBookings,
              trend: computeTrend(totalBookings, prevBookings, bookSpark),
              subtitle: `${currentSessions.length} sessions`,
              description: 'Total confirmed registrations across all sessions',
            },
          },
          occupancy: { byDay, byTimeSlot, byFormat },
          sessions: { topSessions, problematicSessions },
          players: {
            bySkillLevel,
            byFormat: byFormatDist,
            activeCount: csvActive,
            inactiveCount: csvInactive,
            newThisMonth: newPlayers,
            // Real membership status from CourtReserve import
            membershipBreakdown: await (async () => {
              try {
                const rows = await ctx.prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
                  SELECT metadata->>'membershipStatus' as status, count(*) as cnt
                  FROM document_embeddings
                  WHERE club_id = ${input.clubId}::uuid AND content_type = 'member' AND source_table = 'csv_import'
                  GROUP BY metadata->>'membershipStatus'
                `
                const map: Record<string, number> = {}
                rows.forEach(r => { map[r.status] = Number(r.cnt) })
                return {
                  active: map['Currently Active'] || 0,
                  suspended: map['Suspended'] || 0,
                  noMembership: map['No Membership'] || 0,
                  expired: map['Expired'] || 0,
                }
              } catch { return null }
            })(),
          },
        }
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

  // ── Sessions Calendar: Per-session view with analysis ──
  getSessionsCalendar: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // In-memory cache: 5 min TTL per club
      const cacheKey = `calendar:${input.clubId}`
      const cached = calendarCache.get(cacheKey)
      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        return cached.data
      }

      let csvSessions: any[] = []

      // Primary: fast Prisma query on play_sessions (indexed, no JSON parsing)
      try {
        const dbSessions = await ctx.prisma.playSession.findMany({
          where: { clubId: input.clubId },
          select: {
            date: true, startTime: true, endTime: true, format: true,
            skillLevel: true, maxPlayers: true, pricePerSlot: true, registeredCount: true,
            clubCourt: { select: { name: true } },
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
        })
        csvSessions = dbSessions.map((s: any) => {
          // Prefer registeredCount (set during Excel/CSV import) over booking join count
          // _count.bookings may be 0 for Excel-imported sessions where members weren't matched
          const registered = (s.registeredCount != null && s.registeredCount > 0)
            ? s.registeredCount
            : s._count.bookings;
          return {
            date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10),
            startTime: s.startTime,
            endTime: s.endTime,
            court: s.clubCourt?.name || '',
            format: s.format,
            skillLevel: s.skillLevel,
            registered,
            capacity: s.maxPlayers,
            occupancy: s.maxPlayers > 0 ? Math.round((registered / s.maxPlayers) * 100) : 0,
            pricePerPlayer: s.pricePerSlot != null ? Number(s.pricePerSlot) : null,
            playerNames: [],
          };
        })
      } catch (err) {
        console.warn('[Intelligence] getSessionsCalendar play_sessions query failed:', (err as Error).message?.slice(0, 80))
      }

      // Fallback: embeddings (only if no play_sessions found)
      if (csvSessions.length === 0) {
        try {
          const rows = await ctx.prisma.$queryRaw<Array<{ metadata: any }>>`
            SELECT metadata FROM document_embeddings
            WHERE club_id = ${input.clubId}::uuid
              AND content_type = 'session'
              AND source_table = 'csv_import'
          `
          csvSessions = rows
            .map(r => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata))
            .filter((m: any) => m && m.date && m.capacity > 0)
        } catch (err) {
          console.warn('[Intelligence] getSessionsCalendar embeddings fallback failed:', (err as Error).message?.slice(0, 80))
        }
      }

      const { buildSessionCalendarData } = await import('@/lib/ai/session-analysis')
      const result = buildSessionCalendarData(csvSessions, input.clubId)

      // Cache result
      calendarCache.set(cacheKey, { data: result, ts: Date.now() })

      return result
    }),

  // ── Member Health: AI-powered churn prediction ──
  getMemberHealth: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      try {
        // Get all club members with booking history and preferences
        const followers = await ctx.prisma.clubFollower.findMany({
          where: { clubId: input.clubId },
          include: {
            user: {
              select: {
                id: true, email: true, name: true, image: true,
                gender: true, city: true,
                duprRatingDoubles: true, duprRatingSingles: true,
              },
            },
          },
        })

        // Load membership data from embeddings — match by email (source_id may not match userId due to duplicate users)
        const memberEmbeddings = await ctx.prisma.$queryRaw<Array<{ source_id: string; metadata: any }>>`
          SELECT source_id, metadata FROM document_embeddings
          WHERE club_id = ${input.clubId}::uuid AND content_type = 'member' AND source_table = 'csv_import'
        `
        const membershipByEmail = new Map<string, { membership: string | null; membershipStatus: string | null; lastVisit: string | null; firstVisit: string | null }>()
        const membershipBySourceId = new Map<string, { membership: string | null; membershipStatus: string | null; lastVisit: string | null; firstVisit: string | null }>()
        for (const e of memberEmbeddings) {
          const m = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata
          const info = {
            membership: m?.membership || null,
            membershipStatus: m?.membershipStatus || null,
            lastVisit: m?.lastVisit || null,
            firstVisit: m?.firstVisit || null,
          }
          membershipBySourceId.set(e.source_id, info)
          if (m?.email) membershipByEmail.set(String(m.email).toLowerCase().trim(), info)
        }
        // Build lookup: try userId first, then email
        const getMembershipInfo = (userId: string, email: string | null) => {
          return membershipBySourceId.get(userId)
            || (email ? membershipByEmail.get(email.toLowerCase().trim()) : null)
            || null
        }

        // Get all bookings for these users at this club
        const userIds = followers.map(f => f.userId)
        const bookings = await ctx.prisma.playSessionBooking.findMany({
          where: {
            userId: { in: userIds },
            playSession: { clubId: input.clubId },
          },
          select: {
            userId: true, status: true, bookedAt: true,
            playSession: {
              select: { date: true, startTime: true, format: true, pricePerSlot: true },
            },
          },
          orderBy: { bookedAt: 'desc' },
        })

        // Get preferences
        const preferences = await ctx.prisma.userPlayPreference.findMany({
          where: { clubId: input.clubId, userId: { in: userIds } },
        })

        // Build input for health scoring
        const now = new Date()
        const d30 = new Date(now.getTime() - 30 * 86400000)
        const d60 = new Date(now.getTime() - 60 * 86400000)

        const prefMap = new Map(preferences.map(p => [p.userId, p]))
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

          const bookingsLast30 = confirmed.filter(b => b.bookedAt >= d30).length
          const bookings30to60 = confirmed.filter(b => b.bookedAt >= d60 && b.bookedAt < d30).length

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
            preference: (() => {
              const pref = prefMap.get(f.userId)
              if (!pref) return null
              return {
                id: pref.id,
                userId: pref.userId,
                clubId: pref.clubId,
                preferredDays: pref.preferredDays as DayOfWeek[],
                preferredTimeSlots: {
                  morning: pref.preferredTimeMorning,
                  afternoon: pref.preferredTimeAfternoon,
                  evening: pref.preferredTimeEvening,
                },
                skillLevel: pref.skillLevel,
                preferredFormats: pref.preferredFormats as PlaySessionFormat[],
                targetSessionsPerWeek: pref.targetSessionsPerWeek,
                isActive: true,
              }
            })(),
            history: {
              totalBookings: userBookings.length,
              bookingsLastWeek: confirmed.filter(b => b.bookedAt >= new Date(now.getTime() - 7 * 86400000)).length,
              bookingsLastMonth: bookingsLast30,
              daysSinceLastConfirmedBooking: daysSinceLast,
              cancelledCount: userBookings.filter(b => b.status === 'CANCELLED').length,
              noShowCount: userBookings.filter(b => b.status === 'NO_SHOW').length,
              inviteAcceptanceRate: 0.7, // default
            },
            joinedAt: f.createdAt ?? new Date(),
            bookingDates: userBookings.map(b => ({
              date: b.bookedAt,
              status: b.status as 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
            })),
            previousPeriodBookings: bookings30to60,
            membershipInfo: getMembershipInfo(f.userId, f.user.email),
            bookingsWithSessions: userBookings.map(b => ({
              date: (b as any).playSession?.date ?? b.bookedAt,
              startTime: (b as any).playSession?.startTime ?? '12:00',
              format: (b as any).playSession?.format ?? 'OPEN_PLAY',
              pricePerSlot: (b as any).playSession?.pricePerSlot ?? null,
              status: b.status as 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
            })),
          }
        })

        const { generateMemberHealth } = await import('@/lib/ai/member-health')
        return generateMemberHealth(memberInputs)
      } catch (err) {
        console.warn('[Intelligence] getMemberHealth failed:', (err as Error).message?.slice(0, 120))
        // Return empty data rather than throwing
        return {
          members: [],
          summary: { total: 0, healthy: 0, watch: 0, atRisk: 0, critical: 0, avgHealthScore: 0, revenueAtRisk: 0, trendVsPrevWeek: 0 },
        }
      }
    }),

  // ── Health-Based Outreach: Send CHECK_IN or RETENTION_BOOST ──
  sendOutreachMessage: protectedProcedure
    .input(z.object({
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
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      return sendOutreachMessage(ctx.prisma, input)
    }),

  // ── Delete ALL imported data for a club (clean slate) ──
  deleteAllClubData: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { isAdmin } = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      if (!isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can delete club data' })

      const clubId = input.clubId
      const deleted: Record<string, number> = {}

      // 1. Bookings (depends on sessions)
      const d1 = await ctx.prisma.playSessionBooking.deleteMany({ where: { playSession: { clubId } } })
      deleted.bookings = d1.count

      // 2. Play sessions
      const d2 = await ctx.prisma.playSession.deleteMany({ where: { clubId } })
      deleted.sessions = d2.count

      // 3. Document embeddings (sessions, members, patterns, etc.)
      deleted.embeddings = Number(await ctx.prisma.$executeRaw`DELETE FROM document_embeddings WHERE club_id = ${clubId}::uuid`)

      // 4. AI profiles
      const d4 = await ctx.prisma.memberAiProfile.deleteMany({ where: { clubId } })
      deleted.aiProfiles = d4.count

      // 5. Health snapshots
      const d5 = await ctx.prisma.memberHealthSnapshot.deleteMany({ where: { clubId } })
      deleted.healthSnapshots = d5.count

      // 6. Recommendation logs
      const d6 = await ctx.prisma.aIRecommendationLog.deleteMany({ where: { clubId } })
      deleted.recommendationLogs = d6.count

      // 7. External ID mappings
      deleted.externalMappings = Number(await ctx.prisma.$executeRaw`
        DELETE FROM external_id_mappings WHERE partner_id LIKE ${'courtreserve-excel-' + clubId + '%'}
      `)

      // 8. Club followers (member associations)
      const d8 = await ctx.prisma.clubFollower.deleteMany({ where: { clubId } })
      deleted.followers = d8.count

      // 9. Weekly summaries
      const d9 = await ctx.prisma.weeklySummary.deleteMany({ where: { clubId } })
      deleted.weeklySummaries = d9.count

      // Clear in-memory caches
      calendarCache.delete(`calendar:${clubId}`)

      console.log(`[deleteAllClubData] Club ${clubId} cleaned:`, deleted)
      return { ok: true, deleted }
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

  // ── Intelligence Settings: Get onboarding/config ──
  getIntelligenceSettings: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const settings = club.automationSettings?.intelligence || null
      return { settings }
    }),

  // ── Intelligence Settings: Save onboarding/config ──
  saveIntelligenceSettings: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      settings: z.record(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const { isAdmin } = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update intelligence settings' })
      }
      const { intelligenceSettingsSchema } = await import('@/lib/ai/onboarding-schema')

      // Merge new settings into existing intelligence settings (supports partial updates)
      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const existing = club.automationSettings || {}
      const existingIntelligence = existing.intelligence || {}
      const merged = { ...existingIntelligence, ...input.settings }

      // Try full validation; if it fails (partial update), save raw merge
      let validated: any
      try {
        validated = intelligenceSettingsSchema.parse(merged)
      } catch {
        validated = merged
      }

      await (ctx.prisma.club as any).update({
        where: { id: input.clubId },
        data: {
          automationSettings: {
            ...existing,
            intelligence: validated,
          },
        },
      })
      return { success: true }
    }),

  // ── Automation Settings: Get campaign triggers ──
  getAutomationSettings: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const raw = club.automationSettings || {}
      return {
        settings: {
          enabled: raw.enabled ?? true,
          triggers: {
            healthyToWatch: raw.triggers?.healthyToWatch ?? true,
            watchToAtRisk: raw.triggers?.watchToAtRisk ?? true,
            atRiskToCritical: raw.triggers?.atRiskToCritical ?? true,
            churned: raw.triggers?.churned ?? true,
          },
        },
      }
    }),

  // ── Automation Settings: Save campaign triggers ──
  saveAutomationSettings: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      settings: z.object({
        enabled: z.boolean(),
        triggers: z.object({
          healthyToWatch: z.boolean(),
          watchToAtRisk: z.boolean(),
          atRiskToCritical: z.boolean(),
          churned: z.boolean(),
        }),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { isAdmin } = await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update automation settings' })
      }
      const { automationTriggersSchema } = await import('@/lib/ai/onboarding-schema')
      const validated = automationTriggersSchema.parse(input.settings)

      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
      })
      const existing = club.automationSettings || {}
      await (ctx.prisma.club as any).update({
        where: { id: input.clubId },
        data: {
          automationSettings: {
            ...existing,
            enabled: validated.enabled,
            triggers: validated.triggers,
          },
        },
      })
      return { success: true }
    }),

  // ── Campaign Analytics ──
  getCampaignAnalytics: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      days: z.number().int().min(7).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const since = new Date(Date.now() - input.days * 86400000)

      // Stats by type
      const byType = await ctx.prisma.aIRecommendationLog.groupBy({
        by: ['type'],
        where: { clubId: input.clubId, createdAt: { gte: since } },
        _count: true,
      })

      // Stats by status
      const byStatus = await ctx.prisma.aIRecommendationLog.groupBy({
        by: ['status'],
        where: { clubId: input.clubId, createdAt: { gte: since } },
        _count: true,
      })

      // All logs for by-day aggregation
      const allLogs = await ctx.prisma.aIRecommendationLog.findMany({
        where: { clubId: input.clubId, createdAt: { gte: since } },
        select: { createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      })

      const byDay: Record<string, { sent: number; failed: number; skipped: number }> = {}
      for (const log of allLogs) {
        const day = log.createdAt.toISOString().slice(0, 10)
        if (!byDay[day]) byDay[day] = { sent: 0, failed: 0, skipped: 0 }
        const bucket = log.status === 'sent' ? 'sent' : log.status === 'failed' ? 'failed' : 'skipped'
        byDay[day][bucket]++
      }

      // Recent 20 logs with user info
      const recentLogs = await ctx.prisma.aIRecommendationLog.findMany({
        where: { clubId: input.clubId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })

      // Active triggers count
      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      const triggers = (club.automationSettings as any)?.triggers || {}
      const activeTriggers = Object.values(triggers).filter(Boolean).length

      // This week
      const weekAgo = new Date(Date.now() - 7 * 86400000)
      const thisWeek = allLogs.filter(l => l.createdAt >= weekAgo && l.status === 'sent').length

      // ── Conversion by persona ──
      // Join recommendation logs with user preferences to get persona breakdown
      const logsWithPersona = await ctx.prisma.$queryRaw<Array<{
        persona: string | null
        total: bigint
        sent: bigint
        delivered: bigint
        opened: bigint
        clicked: bigint
        converted: bigint
      }>>`
        SELECT
          upp.detected_persona as persona,
          COUNT(*)::bigint as total,
          COUNT(*) FILTER (WHERE arl.status IN ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'CONVERTED'))::bigint as sent,
          COUNT(*) FILTER (WHERE arl.status IN ('DELIVERED', 'OPENED', 'CLICKED', 'CONVERTED'))::bigint as delivered,
          COUNT(*) FILTER (WHERE arl.status IN ('OPENED', 'CLICKED', 'CONVERTED'))::bigint as opened,
          COUNT(*) FILTER (WHERE arl.status IN ('CLICKED', 'CONVERTED'))::bigint as clicked,
          COUNT(*) FILTER (WHERE arl.status = 'CONVERTED')::bigint as converted
        FROM ai_recommendation_logs arl
        LEFT JOIN user_play_preferences upp
          ON arl.user_id = upp.user_id AND arl.club_id = upp.club_id
        WHERE arl.club_id = ${input.clubId}
          AND arl.created_at >= ${since}
        GROUP BY upp.detected_persona
        ORDER BY total DESC
      `

      const byPersona = logsWithPersona.map(row => ({
        persona: row.persona || 'UNKNOWN',
        total: Number(row.total),
        sent: Number(row.sent),
        delivered: Number(row.delivered),
        opened: Number(row.opened),
        clicked: Number(row.clicked),
        converted: Number(row.converted),
        conversionRate: Number(row.sent) > 0
          ? Math.round((Number(row.converted) / Number(row.sent)) * 100)
          : 0,
        openRate: Number(row.delivered) > 0
          ? Math.round((Number(row.opened) / Number(row.delivered)) * 100)
          : 0,
        clickRate: Number(row.opened) > 0
          ? Math.round((Number(row.clicked) / Number(row.opened)) * 100)
          : 0,
      }))

      // ── Campaign Alerts ──
      const totalSentNum = byStatus.find((s: any) => s.status === 'sent')?._count || 0
      const totalConvertedNum = byPersona.reduce((s, p) => s + p.converted, 0)
      const totalBouncedNum = byStatus.find((s: any) => s.status === 'bounced')?._count || 0
      const totalUnsubscribedNum = byStatus.find((s: any) => s.status === 'unsubscribed')?._count || 0

      const alerts = checkCampaignAlerts({
        totalSent: totalSentNum,
        totalConverted: totalConvertedNum,
        totalBounced: totalBouncedNum,
        totalUnsubscribed: totalUnsubscribedNum,
        byPersona: byPersona.map(p => ({ persona: p.persona, sent: p.sent, converted: p.converted })),
      })

      return {
        summary: {
          totalSent: totalSentNum,
          totalFailed: byStatus.find((s: any) => s.status === 'failed')?._count || 0,
          totalPending: byStatus.find((s: any) => s.status === 'pending')?._count || 0,
          totalConverted: totalConvertedNum,
          thisWeek,
          activeTriggers,
        },
        byType: byType.map(t => ({ type: t.type, count: t._count })),
        byDay: Object.entries(byDay).map(([date, counts]) => ({ date, ...counts })),
        byPersona,
        alerts,
        recentLogs: recentLogs.map(l => ({
          id: l.id,
          type: l.type,
          status: l.status,
          channel: l.channel,
          reasoning: l.reasoning,
          createdAt: l.createdAt,
          userName: l.user?.name || l.user?.email || 'Unknown',
        })),
      }
    }),

  // ── Member Outreach History ──
  getMemberOutreachHistory: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userId: z.string(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: { clubId: input.clubId, userId: input.userId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          type: true,
          channel: true,
          status: true,
          reasoning: true,
          createdAt: true,
        },
      })

      return { logs }
    }),

  // ── Variant Performance Analytics ──
  getVariantAnalytics: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      days: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const { getVariantAnalytics } = await import('@/lib/ai/variant-optimizer')
      return await getVariantAnalytics(ctx.prisma, input.clubId, undefined, input.days)
    }),

  // ── Sequence Chain Analytics ──
  getSequenceAnalytics: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // All logs with sequence data
      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: {
          clubId: input.clubId,
          sequenceStep: { not: null },
        },
        select: {
          id: true,
          userId: true,
          type: true,
          status: true,
          sequenceStep: true,
          parentLogId: true,
          openedAt: true,
          clickedAt: true,
          bouncedAt: true,
          reasoning: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Find root logs (step 0) and build chains
      const rootLogs = logs.filter(l => l.sequenceStep === 0)
      const childrenByParent = new Map<string, typeof logs>()
      for (const l of logs) {
        if (l.parentLogId) {
          const children = childrenByParent.get(l.parentLogId) || []
          children.push(l)
          childrenByParent.set(l.parentLogId, children)
        }
      }

      // Trace chains to find max step and status
      type ChainInfo = { userId: string; userName: string; type: string; maxStep: number; startedAt: Date; lastStepAt: Date; exited: boolean; exitReason?: string }
      const chains: ChainInfo[] = []

      for (const root of rootLogs) {
        let current = root
        let maxStep = 0
        let lastStepAt = root.createdAt
        let exited = false
        let exitReason: string | undefined

        // Walk the chain
        const visited = new Set<string>([root.id])
        let next = childrenByParent.get(current.id)?.[0]
        while (next && !visited.has(next.id)) {
          visited.add(next.id)
          maxStep = next.sequenceStep || 0
          lastStepAt = next.createdAt
          current = next
          next = childrenByParent.get(current.id)?.[0]
        }

        // Check if chain ended early
        const reasoning = (current.reasoning as any) || {}
        if (reasoning.sequenceExit) {
          exited = true
          exitReason = reasoning.sequenceExit
        } else if (current.bouncedAt) {
          exited = true
          exitReason = 'bounced'
        }

        const seqType = (root.reasoning as any)?.sequenceType || root.type
        chains.push({
          userId: root.userId,
          userName: root.user?.name || root.user?.email || 'Unknown',
          type: seqType,
          maxStep,
          startedAt: root.createdAt,
          lastStepAt,
          exited,
          exitReason,
        })
      }

      // Summary
      const activeChains = chains.filter(c => !c.exited && c.maxStep < 3)
      const completedChains = chains.filter(c => c.maxStep >= 3 || (c.exited && c.exitReason === 'max_steps'))
      const exitedChains = chains.filter(c => c.exited && c.exitReason !== 'max_steps')
      const avgSteps = chains.length > 0
        ? Math.round((chains.reduce((s, c) => s + c.maxStep, 0) / chains.length) * 10) / 10
        : 0

      // By type
      const typeGroups = ['WATCH', 'AT_RISK', 'CRITICAL']
      const byType = typeGroups.map(t => ({
        type: t,
        active: chains.filter(c => c.type === t && !c.exited && c.maxStep < 3).length,
        completed: chains.filter(c => c.type === t && (c.maxStep >= 3 || (c.exited && c.exitReason === 'max_steps'))).length,
        exited: chains.filter(c => c.type === t && c.exited && c.exitReason !== 'max_steps').length,
      }))

      // By step
      const byStep = [0, 1, 2, 3].map(step => {
        const stepLogs = logs.filter(l => l.sequenceStep === step)
        const opened = stepLogs.filter(l => l.openedAt).length
        return {
          step,
          count: stepLogs.length,
          openRate: stepLogs.length > 0 ? Math.round((opened / stepLogs.length) * 100) / 100 : 0,
        }
      })

      // Exit reasons
      const exitCounts = new Map<string, number>()
      for (const c of chains) {
        if (c.exited && c.exitReason) {
          exitCounts.set(c.exitReason, (exitCounts.get(c.exitReason) || 0) + 1)
        }
      }
      const EXIT_LABELS: Record<string, string> = {
        booked: 'Booked Session',
        health_improved: 'Health Improved',
        max_steps: 'Sequence Complete',
        opted_out: 'Opted Out',
        bounced: 'Bounced/Spam',
      }
      const exitReasons = Array.from(exitCounts.entries()).map(([reason, count]) => ({
        reason,
        count,
        label: EXIT_LABELS[reason] || reason,
      })).sort((a, b) => b.count - a.count)

      // Recent sequences (last 10 unique users)
      const seen = new Set<string>()
      const recentSequences = chains
        .sort((a, b) => b.lastStepAt.getTime() - a.lastStepAt.getTime())
        .filter(c => {
          if (seen.has(c.userId)) return false
          seen.add(c.userId)
          return true
        })
        .slice(0, 10)
        .map(c => ({
          userId: c.userId,
          userName: c.userName,
          type: c.type,
          currentStep: c.maxStep,
          startedAt: c.startedAt.toISOString(),
          lastStepAt: c.lastStepAt.toISOString(),
          status: c.exited ? (c.exitReason === 'max_steps' ? 'completed' : 'exited')
            : c.maxStep >= 3 ? 'completed' : 'active',
        }))

      return {
        summary: {
          activeSequences: activeChains.length,
          completedSequences: completedChains.length,
          exitedSequences: exitedChains.length,
          avgStepsCompleted: avgSteps,
        },
        byType,
        byStep,
        exitReasons,
        recentSequences,
      }
    }),

  // ── Weekly AI Summary ──
  getWeeklySummary: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const summary = await ctx.prisma.weeklySummary.findFirst({
        where: { clubId: input.clubId },
        orderBy: { weekStart: 'desc' },
      })

      if (!summary) {
        return { summary: null, weekStart: null, weekEnd: null, generatedAt: null, modelUsed: null }
      }

      return {
        summary: summary.summary,
        weekStart: summary.weekStart?.toISOString() ?? null,
        weekEnd: summary.weekEnd?.toISOString() ?? null,
        generatedAt: summary.generatedAt?.toISOString() ?? null,
        modelUsed: summary.modelUsed ?? null,
      }
    }),

  generateWeeklySummary: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      force: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const { generateAndStoreWeeklySummary } = await import('@/lib/ai/weekly-summary')
      const content = await generateAndStoreWeeklySummary(ctx.prisma, input.clubId, input.force)
      return { summary: content }
    }),

  // ── Member CSV Import ──
  importMembers: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      members: z.array(z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      })).min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const { randomUUID } = await import('crypto')
      let created = 0
      let alreadyExisted = 0
      let followersCreated = 0

      const userIds: string[] = []

      for (const member of input.members) {
        const email = member.email?.trim().toLowerCase()

        if (email) {
          // Upsert by email
          const user = await ctx.prisma.user.upsert({
            where: { email },
            create: {
              email,
              name: member.name.trim(),
              phone: member.phone?.trim() || null,
            },
            update: {
              name: member.name.trim(),
              ...(member.phone?.trim() ? { phone: member.phone.trim() } : {}),
            },
          })
          userIds.push(user.id)
          // Check if user was just created (no updatedAt would be close to createdAt)
          const isNew = Math.abs(user.createdAt.getTime() - user.updatedAt.getTime()) < 1000
          if (isNew) created++
          else alreadyExisted++
        } else {
          // No email — create with placeholder
          const placeholderEmail = `${randomUUID()}@imported.iqsport.ai`
          const user = await ctx.prisma.user.create({
            data: {
              email: placeholderEmail,
              name: member.name.trim(),
              phone: member.phone?.trim() || null,
            },
          })
          userIds.push(user.id)
          created++
        }
      }

      // Batch create ClubFollower records (skip duplicates)
      if (userIds.length > 0) {
        const result = await ctx.prisma.clubFollower.createMany({
          data: userIds.map(userId => ({
            clubId: input.clubId,
            userId,
          })),
          skipDuplicates: true,
        })
        followersCreated = result.count
      }

      // Re-match: link newly created users to existing PlaySession bookings by name
      const { rematchSessionBookings } = await import('@/lib/ai/session-importer')
      const rematchResult = await rematchSessionBookings(ctx.prisma, input.clubId)

      return {
        created,
        alreadyExisted,
        followersCreated,
        bookingsMatched: rematchResult.matched,
        totalProcessed: input.members.length,
      }
    }),

  // ══════════════════════════════════════════════════
  // ══════ NEW ANALYTICS ENDPOINTS (Tier 1) ═════════
  // ══════════════════════════════════════════════════

  // 1.1 Revenue Analytics
  getRevenueAnalytics: protectedProcedure
    .input(z.object({ clubId: z.string(), days: z.number().optional().default(30) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const now = new Date()
      const startDate = new Date(now)
      startDate.setDate(startDate.getDate() - input.days)
      const prevStart = new Date(startDate)
      prevStart.setDate(prevStart.getDate() - input.days)

      const sessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: startDate } },
        include: { bookings: true },
      })
      const prevSessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: prevStart, lt: startDate } },
        include: { bookings: true },
      })

      // Revenue by format
      const formatBuckets: Record<string, { revenue: number; sessions: number }> = {}
      sessions.forEach(s => {
        const rev = (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0)
        if (!formatBuckets[s.format]) formatBuckets[s.format] = { revenue: 0, sessions: 0 }
        formatBuckets[s.format].revenue += rev
        formatBuckets[s.format].sessions++
      })
      const totalRevenue = Object.values(formatBuckets).reduce((s, b) => s + b.revenue, 0)
      const revenueByFormat = Object.entries(formatBuckets)
        .sort(([, a], [, b]) => b.revenue - a.revenue)
        .map(([format, data]) => ({
          format,
          revenue: Math.round(data.revenue),
          sessions: data.sessions,
          pct: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
        }))

      // Daily revenue (last N days)
      const dailyRevenue: Array<{ date: string; revenue: number }> = []
      for (let d = 0; d < input.days; d++) {
        const dt = new Date(startDate)
        dt.setDate(dt.getDate() + d)
        const dateStr = dt.toISOString().slice(0, 10)
        const dayRev = sessions
          .filter(s => s.date.toISOString().slice(0, 10) === dateStr)
          .reduce((sum, s) => sum + (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0), 0)
        dailyRevenue.push({ date: dateStr, revenue: Math.round(dayRev) })
      }

      // Lost revenue
      const lostFromEmpty = sessions.reduce((sum, s) => {
        const empty = Math.max(0, s.maxPlayers - (s.registeredCount ?? 0))
        return sum + empty * (s.pricePerSlot ?? 0)
      }, 0)
      const cancelledBookings = sessions.reduce((sum, s) => {
        const cancelled = s.bookings.filter((b: any) => b.status === 'CANCELLED').length
        return sum + cancelled * (s.pricePerSlot ?? 0)
      }, 0)
      const noShows = sessions.reduce((sum, s) => {
        const ns = s.bookings.filter((b: any) => b.status === 'NO_SHOW').length
        return sum + ns * (s.pricePerSlot ?? 0)
      }, 0)

      // Period comparison
      const prevRevenue = prevSessions.reduce((sum, s) => sum + (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0), 0)
      const prevActiveMembers = new Set(prevSessions.flatMap(s => s.bookings.filter((b: any) => b.status === 'CONFIRMED').map((b: any) => b.userId))).size
      const activeMembers = new Set(sessions.flatMap(s => s.bookings.filter((b: any) => b.status === 'CONFIRMED').map((b: any) => b.userId))).size

      return {
        totalRevenue: Math.round(totalRevenue),
        prevTotalRevenue: Math.round(prevRevenue),
        revenueByFormat,
        dailyRevenue,
        lostRevenue: {
          emptySlots: Math.round(lostFromEmpty),
          cancelled: Math.round(cancelledBookings),
          noShows: Math.round(noShows),
          total: Math.round(lostFromEmpty + cancelledBookings + noShows),
        },
        activeMembers,
        prevActiveMembers,
        totalSessions: sessions.length,
        prevTotalSessions: prevSessions.length,
        avgOccupancy: sessions.length > 0
          ? Math.round(sessions.reduce((s, sess) => s + ((sess.registeredCount ?? 0) / Math.max(1, sess.maxPlayers)) * 100, 0) / sessions.length)
          : 0,
      }
    }),

  // 1.2 Campaign List (from AIRecommendationLog)
  getCampaignList: protectedProcedure
    .input(z.object({ clubId: z.string(), days: z.number().optional().default(90) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const logs = await ctx.prisma.aIRecommendationLog.findMany({
        where: { clubId: input.clubId, createdAt: { gte: since }, sequenceStep: 0 },
        orderBy: { createdAt: 'desc' },
      })

      // Group by type + date (day granularity) to form "campaigns"
      const campaignMap = new Map<string, any[]>()
      logs.forEach((log: any) => {
        const dateKey = log.createdAt.toISOString().slice(0, 10)
        const key = `${log.type}-${dateKey}`
        if (!campaignMap.has(key)) campaignMap.set(key, [])
        campaignMap.get(key)!.push(log)
      })

      const campaigns = Array.from(campaignMap.entries()).map(([key, entries]) => {
        const [type, date] = key.split('-', 2)
        const sent = entries.length
        const opened = entries.filter((e: any) => e.openedAt).length
        const clicked = entries.filter((e: any) => e.clickedAt).length
        const converted = entries.filter((e: any) => e.respondedAt).length
        const channels = Array.from(new Set(entries.map((e: any) => e.channel)))
        return {
          id: key,
          type,
          date,
          name: `${type === 'CHECK_IN' ? 'Friendly Check-in' : type === 'RETENTION_BOOST' ? 'Retention Boost' : type} — ${date}`,
          sent,
          opened,
          clicked,
          converted,
          openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          convRate: sent > 0 ? Math.round((converted / sent) * 100) : 0,
          channels,
          status: 'completed' as const,
        }
      })

      return { campaigns, totalCampaigns: campaigns.length }
    }),

  // 1.3 Occupancy Heatmap
  getOccupancyHeatmap: protectedProcedure
    .input(z.object({ clubId: z.string(), days: z.number().optional().default(90) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const sessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, startTime: true, registeredCount: true, maxPlayers: true },
      })

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const timeSlots = ['6AM', '8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM']

      // Build heatmap: day × timeSlot → avg occupancy
      const buckets: Record<string, { sum: number; count: number }> = {}
      days.forEach(d => timeSlots.forEach(t => { buckets[`${d}-${t}`] = { sum: 0, count: 0 } }))

      sessions.forEach((s: any) => {
        const dayIdx = s.date.getDay() // 0=Sun, 1=Mon...
        const dayName = days[(dayIdx + 6) % 7] // shift so Mon=0
        const hour = parseInt(s.startTime?.split(':')[0] || '0')
        const slotIdx = Math.max(0, Math.min(timeSlots.length - 1, Math.floor((hour - 6) / 2)))
        const slot = timeSlots[slotIdx]
        const key = `${dayName}-${slot}`
        if (buckets[key]) {
          const occ = s.maxPlayers > 0 ? ((s.registeredCount ?? 0) / s.maxPlayers) * 100 : 0
          buckets[key].sum += occ
          buckets[key].count++
        }
      })

      const heatmap = days.map(day => ({
        day,
        slots: timeSlots.map(time => ({
          time,
          value: buckets[`${day}-${time}`]?.count > 0
            ? Math.round(buckets[`${day}-${time}`].sum / buckets[`${day}-${time}`].count)
            : 0,
        })),
      }))

      return { heatmap, timeSlots, days }
    }),

  // 1.4 Member Growth
  getMemberGrowth: protectedProcedure
    .input(z.object({ clubId: z.string(), months: z.number().optional().default(6) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // Get snapshots grouped by month
      const since = new Date()
      since.setMonth(since.getMonth() - input.months)

      const snapshots = await ctx.prisma.memberHealthSnapshot.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, userId: true, riskLevel: true, lifecycleStage: true },
        orderBy: { date: 'asc' },
      })

      // Group by month
      const monthBuckets = new Map<string, { total: Set<string>; new: Set<string>; churned: Set<string> }>()
      snapshots.forEach((s: any) => {
        const month = s.date.toISOString().slice(0, 7) // YYYY-MM
        if (!monthBuckets.has(month)) monthBuckets.set(month, { total: new Set(), new: new Set(), churned: new Set() })
        const b = monthBuckets.get(month)!
        b.total.add(s.userId)
        if (s.lifecycleStage === 'onboarding') b.new.add(s.userId)
        if (s.riskLevel === 'critical' || s.lifecycleStage === 'churned') b.churned.add(s.userId)
      })

      const growth = Array.from(monthBuckets.entries()).map(([month, data]) => ({
        month,
        total: data.total.size,
        new: data.new.size,
        churned: data.churned.size,
      }))

      return { growth }
    }),

  // 1.5 Churn Trend
  getChurnTrend: protectedProcedure
    .input(z.object({ clubId: z.string(), months: z.number().optional().default(6) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setMonth(since.getMonth() - input.months)

      const snapshots = await ctx.prisma.memberHealthSnapshot.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, userId: true, riskLevel: true },
        orderBy: { date: 'asc' },
      })

      const monthBuckets = new Map<string, { atRisk: Set<string>; churned: Set<string>; reactivated: Set<string> }>()
      snapshots.forEach((s: any) => {
        const month = s.date.toISOString().slice(0, 7)
        if (!monthBuckets.has(month)) monthBuckets.set(month, { atRisk: new Set(), churned: new Set(), reactivated: new Set() })
        const b = monthBuckets.get(month)!
        if (s.riskLevel === 'at_risk') b.atRisk.add(s.userId)
        if (s.riskLevel === 'critical') b.churned.add(s.userId)
        if (s.riskLevel === 'healthy') b.reactivated.add(s.userId) // simplified: healthy after being tracked
      })

      const trend = Array.from(monthBuckets.entries()).map(([month, data]) => ({
        month,
        atRisk: data.atRisk.size,
        churned: data.churned.size,
        reactivated: data.reactivated.size,
      }))

      return { trend }
    }),

  // 1.6 Events List
  getEventsList: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // Events = sessions with specific formats (SOCIAL, LEAGUE_PLAY) or one-off sessions
      const sessions = await ctx.prisma.playSession.findMany({
        where: {
          clubId: input.clubId,
          format: { in: ['SOCIAL', 'LEAGUE_PLAY'] },
        },
        include: { bookings: true },
        orderBy: { date: 'desc' },
        take: 50,
      })

      const events = sessions.map((s: any) => ({
        id: s.id,
        name: s.title || `${s.format} — ${s.date.toISOString().slice(0, 10)}`,
        type: s.format,
        date: s.date.toISOString().slice(0, 10),
        startTime: s.startTime,
        endTime: s.endTime,
        court: s.courtId || 'TBD',
        registered: (s.registeredCount ?? 0),
        capacity: s.maxPlayers,
        revenue: (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0),
        status: s.status,
      }))

      // Revenue by month
      const monthRevenue = new Map<string, { revenue: number; events: number }>()
      sessions.forEach((s: any) => {
        const month = s.date.toISOString().slice(0, 7)
        if (!monthRevenue.has(month)) monthRevenue.set(month, { revenue: 0, events: 0 })
        const b = monthRevenue.get(month)!
        b.revenue += (s.pricePerSlot ?? 0) * (s.registeredCount ?? 0)
        b.events++
      })
      const eventRevenue = Array.from(monthRevenue.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, revenue: Math.round(data.revenue), events: data.events }))

      return { events, eventRevenue, totalEvents: events.length }
    }),

  // 1.7 Upload History
  getUploadHistory: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const embeddings = await ctx.prisma.documentEmbedding.findMany({
        where: { clubId: input.clubId, contentType: { notIn: ['member', 'member_pattern', 'booking_trend', 'club_info'] } },
        select: { id: true, contentType: true, createdAt: true, sourceId: true, sourceTable: true, metadata: true },
        orderBy: { createdAt: 'desc' },
      })

      // Group by importBatchId (reliable) with fallback to time-based grouping (legacy)
      const batchMap = new Map<string, typeof embeddings>()
      const orphans: typeof embeddings = []

      for (const e of embeddings) {
        const meta = (e.metadata && typeof e.metadata === 'object') ? (e.metadata as Record<string, unknown>) : {}
        const batchId = meta.importBatchId as string | undefined
        if (batchId) {
          if (!batchMap.has(batchId)) batchMap.set(batchId, [])
          batchMap.get(batchId)!.push(e)
        } else {
          orphans.push(e)
        }
      }

      // Group orphans (legacy imports without batchId) by 5-min windows
      const sortedOrphans = [...orphans].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      for (const e of sortedOrphans) {
        let added = false
        const keys = Array.from(batchMap.keys())
        for (const key of keys) {
          if (key.startsWith('legacy-')) {
            const entries = batchMap.get(key)!
            const lastEntry = entries[entries.length - 1]
            if (Math.abs(e.createdAt.getTime() - lastEntry.createdAt.getTime()) < 5 * 60 * 1000) {
              entries.push(e)
              added = true
              break
            }
          }
        }
        if (!added) {
          const legacyKey = `legacy-${e.createdAt.getTime()}`
          batchMap.set(legacyKey, [e])
        }
      }

      const batchEntries: Array<[string, typeof embeddings]> = []
      batchMap.forEach((v, k) => batchEntries.push([k, v]))

      const uploads = batchEntries
        .map(([batchId, entries]) => {
          const sourceIds = entries.filter(e => e.sourceId).map(e => e.sourceId!)
          const dates = entries.map(e => e.createdAt.getTime())
          // Use marker metadata for accurate counts (Excel imports store membersImported + sessionsImported)
          const markerEntry = entries.find(e => e.contentType === 'import_marker') || entries[0]
          const meta = markerEntry.metadata as Record<string, unknown> | null
          const fileName = (meta?.sourceFileName as string) || null
          const membersImported = typeof meta?.membersImported === 'number' ? meta.membersImported : null
          const sessionsImported = typeof meta?.sessionsImported === 'number' ? meta.sessionsImported : null
          const membersAttempted = typeof meta?.membersAttempted === 'number' ? meta.membersAttempted : null
          const sessionsAttempted = typeof meta?.sessionsAttempted === 'number' ? meta.sessionsAttempted : null
          // Fallback: count non-marker session embeddings
          const sessionEntries = entries.filter(e => e.sourceTable === 'play_sessions' && e.contentType !== 'import_marker')
          const recordsFallback = sessionEntries.length || entries.filter(e => e.contentType !== 'import_marker').length || entries.length

          return {
            id: batchId,
            date: new Date(Math.min(...dates)).toISOString(),
            dateEnd: new Date(Math.max(...dates)).toISOString(),
            records: sessionsImported ?? recordsFallback,
            membersImported,
            sessionsImported,
            membersAttempted,
            sessionsAttempted,
            contentType: markerEntry.contentType,
            source: fileName || 'CSV Import',
            embeddingIds: entries.map(e => e.id),
            sessionSourceIds: Array.from(new Set(sourceIds)),
            importBatchId: batchId.startsWith('legacy-') ? null : batchId,
          }
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      return { uploads, totalUploads: uploads.length }
    }),

  deleteImport: protectedProcedure
    .input(z.object({
      clubId: z.string(),
      embeddingIds: z.array(z.string()),
      sessionSourceIds: z.array(z.string()),
      importBatchId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      let sessionsDeleted = 0
      let bookingsDeleted = 0
      let embeddingsDeleted = 0
      let healthDeleted = 0
      let followersDeleted = 0
      let aiRecsDeleted = 0

      // 1. Delete AI recommendation logs
      try {
        const arResult = await ctx.prisma.$executeRaw`
          DELETE FROM ai_recommendation_logs WHERE "clubId" = ${input.clubId}::uuid
        `
        aiRecsDeleted = typeof arResult === 'number' ? arResult : 0
      } catch (err) {
        console.warn('[Delete Import] ai_recommendation_logs cleanup failed:', err)
      }

      // 2. Delete health snapshots
      const hResult = await ctx.prisma.$executeRaw`
        DELETE FROM member_health_snapshots WHERE club_id = ${input.clubId}::uuid
      `
      healthDeleted = typeof hResult === 'number' ? hResult : 0

      // 3. Delete bookings for all sessions of this club
      const bResult = await ctx.prisma.$executeRaw`
        DELETE FROM play_session_bookings WHERE "sessionId" IN (
          SELECT id FROM play_sessions WHERE "clubId" = ${input.clubId}::uuid
        )
      `
      bookingsDeleted = typeof bResult === 'number' ? bResult : 0

      // 4. Delete all play sessions for this club
      const sResult = await ctx.prisma.$executeRaw`
        DELETE FROM play_sessions WHERE "clubId" = ${input.clubId}::uuid
      `
      sessionsDeleted = typeof sResult === 'number' ? sResult : 0

      // 5. Delete ALL document_embeddings for this club (not just one batch)
      const eResult = await ctx.prisma.$executeRaw`
        DELETE FROM document_embeddings WHERE club_id = ${input.clubId}::uuid
      `
      embeddingsDeleted = typeof eResult === 'number' ? eResult : 0

      // 6. Delete placeholder users created during import (email like %@placeholder.iqsport.ai)
      try {
        const fResult = await ctx.prisma.$executeRaw`
          DELETE FROM club_followers
          WHERE club_id = ${input.clubId}::uuid
            AND user_id IN (SELECT id FROM users WHERE email LIKE '%@placeholder.iqsport.ai')
        `
        followersDeleted = typeof fResult === 'number' ? fResult : 0
      } catch (err) {
        console.warn('[Delete Import] placeholder followers cleanup failed:', err)
      }

      // 7. Delete AI conversations and messages (reset AI advisor history)
      try {
        await ctx.prisma.$executeRaw`
          DELETE FROM ai_messages WHERE conversation_id IN (
            SELECT id FROM ai_conversations WHERE club_id = ${input.clubId}::uuid
          )
        `
        await ctx.prisma.$executeRaw`
          DELETE FROM ai_conversations WHERE club_id = ${input.clubId}::uuid
        `
      } catch (err) {
        console.warn('[Delete Import] AI conversations cleanup failed:', err)
      }

      console.log(`[Delete Import] Club ${input.clubId}: ${embeddingsDeleted} embeddings, ${sessionsDeleted} sessions, ${bookingsDeleted} bookings, ${healthDeleted} health, ${followersDeleted} placeholder users, ${aiRecsDeleted} ai recs deleted`)

      return { sessionsDeleted, bookingsDeleted, embeddingsDeleted, healthDeleted, followersDeleted, remainingEmbeddings: 0 }
    }),

  // 2.1 Pricing Opportunities (demand-based price suggestions)
  getPricingOpportunities: protectedProcedure
    .input(z.object({ clubId: z.string(), days: z.number().optional().default(90) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const sessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, startTime: true, maxPlayers: true, registeredCount: true, pricePerSlot: true },
      })

      // Group by day × time slot
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const slots: Record<string, { occSum: number; priceSum: number; regSum: number; count: number }> = {}

      sessions.forEach((s: any) => {
        const dayIdx = s.date.getDay()
        const dayName = days[(dayIdx + 6) % 7]
        const hour = parseInt(s.startTime?.split(':')[0] || '0')
        const timeLabel = hour < 12 ? (hour < 9 ? 'Morning' : 'Late Morning') : (hour < 17 ? 'Afternoon' : 'Evening')
        const key = `${dayName} ${timeLabel}`
        if (!slots[key]) slots[key] = { occSum: 0, priceSum: 0, regSum: 0, count: 0 }
        const occ = s.maxPlayers > 0 ? ((s.registeredCount ?? 0) / s.maxPlayers) * 100 : 0
        slots[key].occSum += occ
        slots[key].priceSum += (s.pricePerSlot ?? 0)
        slots[key].regSum += (s.registeredCount ?? 0)
        slots[key].count++
      })

      const opportunities = Object.entries(slots)
        .map(([slot, data]) => {
          const avgOcc = Math.round(data.occSum / data.count)
          const avgPrice = Math.round(data.priceSum / data.count)
          const avgReg = Math.round(data.regSum / data.count)
          if (avgPrice === 0) return null

          // Price elasticity formula
          const priceMultiplier = 1 + (avgOcc - 60) / 100
          const suggested = Math.max(5, Math.round(avgPrice * priceMultiplier))
          const diff = suggested - avgPrice
          if (Math.abs(diff) < 2) return null // not worth suggesting

          const impact = diff * avgReg * 4 // monthly estimate
          const demand = avgOcc > 80 ? 'Very High' : avgOcc > 60 ? 'High' : avgOcc > 40 ? 'Medium' : 'Low'
          const confidence = Math.min(95, avgOcc + 10)

          return { slot, current: avgPrice, suggested, demand, impact: `${impact > 0 ? '+' : ''}$${Math.abs(impact)}/mo`, confidence }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => Math.abs(parseInt(b.impact.replace(/[^0-9-]/g, ''))) - Math.abs(parseInt(a.impact.replace(/[^0-9-]/g, ''))))
        .slice(0, 4)

      return { opportunities }
    }),

  // 2.2 Revenue Forecast (weighted moving average)
  getRevenueForecast: protectedProcedure
    .input(z.object({ clubId: z.string(), monthsBack: z.number().optional().default(6), monthsForward: z.number().optional().default(3) }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const since = new Date()
      since.setMonth(since.getMonth() - input.monthsBack)

      const sessions = await ctx.prisma.playSession.findMany({
        where: { clubId: input.clubId, date: { gte: since } },
        select: { date: true, pricePerSlot: true, registeredCount: true },
      })

      if (sessions.length === 0) {
        return { actual: [], forecast: [], summary: null }
      }

      // Calculate fallback price from non-null sessions
      const nonNullPrices = sessions
        .filter((s: any) => s.pricePerSlot != null && s.pricePerSlot > 0)
        .map((s: any) => s.pricePerSlot as number)
      const avgPriceFromSessions = nonNullPrices.length > 0
        ? nonNullPrices.reduce((sum, p) => sum + p, 0) / nonNullPrices.length
        : null

      // If no session has a price, try club settings (automationSettings.intelligence.avgSessionPriceCents)
      let fallbackPrice = avgPriceFromSessions
      if (fallbackPrice == null) {
        const club: any = await ctx.prisma.club.findUnique({ where: { id: input.clubId } })
        const avgCents = club?.automationSettings?.intelligence?.avgSessionPriceCents
        fallbackPrice = avgCents != null ? avgCents / 100 : 15 // default $15 as last resort
      }

      // Aggregate monthly revenue using fallback for null pricePerSlot
      const monthlyRevenue = new Map<string, number>()
      const monthlySessionCount = new Map<string, number>()
      sessions.forEach((s: any) => {
        const month = s.date.toISOString().slice(0, 7)
        const price = (s.pricePerSlot != null && s.pricePerSlot > 0) ? s.pricePerSlot : fallbackPrice!
        const registered = s.registeredCount ?? 0
        monthlyRevenue.set(month, (monthlyRevenue.get(month) || 0) + price * registered)
        monthlySessionCount.set(month, (monthlySessionCount.get(month) || 0) + 1)
      })

      const sortedMonths = Array.from(monthlyRevenue.entries()).sort(([a], [b]) => a.localeCompare(b))
      if (sortedMonths.length < 1) {
        return { actual: [], forecast: [], summary: null }
      }

      const ys = sortedMonths.map(([, rev]) => rev)

      // Actual months
      const actual = sortedMonths.map(([month, rev]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        actual: Math.round(rev),
      }))

      // If only 1 month of data, return actuals with flat forecast
      if (sortedMonths.length < 2) {
        const lastRev = ys[0]
        const lastDate = new Date(sortedMonths[0][0] + '-01')
        const forecast: Array<{ month: string; forecast: number; low: number; high: number }> = []
        for (let m = 1; m <= input.monthsForward; m++) {
          const futureDate = new Date(lastDate)
          futureDate.setMonth(futureDate.getMonth() + m)
          forecast.push({
            month: futureDate.toLocaleDateString('en-US', { month: 'short' }),
            forecast: Math.round(lastRev),
            low: Math.round(lastRev * 0.75),
            high: Math.round(lastRev * 1.25),
          })
        }
        return {
          actual,
          forecast,
          summary: `Based on 1 month of data, forecast is estimated at $${Math.round(lastRev).toLocaleString()}/mo. More data will improve accuracy.`,
        }
      }

      // Calculate month-over-month growth rates
      const momGrowth: number[] = []
      for (let i = 1; i < ys.length; i++) {
        if (ys[i - 1] > 0) {
          momGrowth.push((ys[i] - ys[i - 1]) / ys[i - 1])
        }
      }

      // Weighted growth rate: recent months weighted more heavily (exponential)
      let weightedGrowthRate = 0
      if (momGrowth.length > 0) {
        const recentCount = Math.min(3, momGrowth.length)
        const recentGrowth = momGrowth.slice(-recentCount)
        let totalWeight = 0
        let weightedSum = 0
        recentGrowth.forEach((g, i) => {
          const weight = Math.pow(2, i) // exponential: 1, 2, 4
          weightedSum += g * weight
          totalWeight += weight
        })
        weightedGrowthRate = weightedSum / totalWeight
      }

      // Clamp growth rate to prevent wild forecasts
      weightedGrowthRate = Math.max(-0.3, Math.min(0.5, weightedGrowthRate))

      // Calculate standard deviation of monthly revenue for confidence bands
      const mean = ys.reduce((s, y) => s + y, 0) / ys.length
      const variance = ys.reduce((s, y) => s + Math.pow(y - mean, 2), 0) / ys.length
      const stddev = Math.sqrt(variance)

      // Forecast months using weighted moving average growth
      const forecast: Array<{ month: string; forecast: number; low: number; high: number }> = []
      const lastDate = new Date(sortedMonths[sortedMonths.length - 1][0] + '-01')
      let lastRev = ys[ys.length - 1]

      for (let m = 1; m <= input.monthsForward; m++) {
        const futureDate = new Date(lastDate)
        futureDate.setMonth(futureDate.getMonth() + m)
        const predicted = Math.max(0, Math.round(lastRev * (1 + weightedGrowthRate)))

        // Confidence bands: stddev * multiplier that grows with forecast horizon
        const bandMultiplier = m === 1 ? 1.5 : m === 2 ? 2.0 : 2.5
        const band = stddev * bandMultiplier

        forecast.push({
          month: futureDate.toLocaleDateString('en-US', { month: 'short' }),
          forecast: predicted,
          low: Math.max(0, Math.round(predicted - band)),
          high: Math.round(predicted + band),
        })
        lastRev = predicted
      }

      // Build summary text
      const lastActual = ys[ys.length - 1]
      const finalForecast = forecast[forecast.length - 1]
      const finalMonth = finalForecast.month
      const growthPct = Math.round(weightedGrowthRate * 100)
      const growthDir = growthPct >= 0 ? 'growth' : 'decline'
      const pricingUplift = Math.round(lastActual * 0.12) // estimate 12% uplift from pricing optimization
      const optimizedForecast = finalForecast.forecast + pricingUplift * input.monthsForward

      let summary: string
      if (Math.abs(growthPct) < 2) {
        summary = `Revenue is holding steady at ~$${Math.round(lastActual).toLocaleString()}/mo. You're projected to stay around $${finalForecast.forecast.toLocaleString()} by ${finalMonth}. Implementing pricing suggestions could push this to $${optimizedForecast.toLocaleString()}.`
      } else {
        summary = `Based on ${Math.abs(growthPct)}% monthly ${growthDir}, you're projected to hit $${finalForecast.forecast.toLocaleString()} by ${finalMonth}. Implementing pricing suggestions could push this to $${optimizedForecast.toLocaleString()}.`
      }

      return { actual, forecast, summary }
    }),

  // ── Member AI Profiles ──

  getMemberAiProfiles: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userIds: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where: any = { clubId: input.clubId }
      if (input.userIds?.length) where.userId = { in: input.userIds }
      const profiles = await ctx.prisma.memberAiProfile.findMany({
        where,
        orderBy: { riskScore: 'asc' },
      })
      return profiles
    }),

  getMemberAiProfile: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.memberAiProfile.findUnique({
        where: { userId_clubId: { userId: input.userId, clubId: input.clubId } },
      })
    }),

  regenerateMemberProfiles: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      forceRegenerate: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await checkFeatureAccess(input.clubId, 'reactivation')
      // Fire-and-forget in background
      generateMemberProfilesForClub(ctx.prisma, input.clubId, {
        forceRegenerate: input.forceRegenerate,
        batchSize: 10,
        delayMs: 300,
      }).catch(err => console.error('[tRPC] regenerateMemberProfiles failed:', err))
      return { status: 'started' }
    }),

  regenerateSingleMemberProfile: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { name: true },
      })
      const profile = await generateSingleMemberProfile(
        ctx.prisma, input.userId, input.clubId, club?.name || 'Your Club'
      )
      return profile
    }),

  // ── Session Interest Requests ──

  submitInterestRequest: publicProcedure
    .input(z.object({
      token: z.string(),
      preferredDays: z.array(z.string()),
      preferredFormats: z.array(z.string()),
      preferredTimeSlots: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { verifyInterestToken } = await import('@/lib/utils/interest-token')
      const decoded = verifyInterestToken(input.token)
      if (!decoded) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired link' })
      const { userId, clubId } = decoded
      await ctx.prisma.sessionInterestRequest.upsert({
        where: { userId_clubId: { userId, clubId } },
        create: {
          userId, clubId,
          preferredDays: input.preferredDays,
          preferredFormats: input.preferredFormats,
          preferredTimeSlots: input.preferredTimeSlots,
          token: input.token,
          status: 'pending',
        },
        update: {
          preferredDays: input.preferredDays,
          preferredFormats: input.preferredFormats,
          preferredTimeSlots: input.preferredTimeSlots,
          token: input.token,
          status: 'pending',
          notifiedAt: null,
        },
      })
      return { success: true }
    }),

  getInterestRequests: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const where: any = { clubId: input.clubId }
      if (input.status) where.status = input.status
      const requests = await ctx.prisma.sessionInterestRequest.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return requests
    }),

  notifyInterestedMembers: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      userIds: z.array(z.string()),
      sessionId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const result = await ctx.prisma.sessionInterestRequest.updateMany({
        where: { clubId: input.clubId, userId: { in: input.userIds } },
        data: {
          status: 'notified',
          notifiedAt: new Date(),
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        },
      })
      return { updated: result.count }
    }),

  // ── Generate a Notify-Me link for a specific member ──
  generateNotifyMeLink: protectedProcedure
    .input(z.object({
      userId: z.string(),
      clubId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)
      const { generateInterestToken } = await import('@/lib/utils/interest-token')
      const token = generateInterestToken(input.userId, input.clubId)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://iqsport.ai'
      return { url: `${baseUrl}/notify-me?t=${token}` }
    }),
})
