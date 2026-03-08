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
        aiLogs,
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
        // Recent AI recommendations
        ctx.prisma.aIRecommendationLog.count({
          where: {
            clubId: input.clubId,
            createdAt: { gte: sevenDaysAgo },
          },
        }),
      ])

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
      return ctx.prisma.aIConversation.findMany({
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
    }),

  getConversation: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
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
    }),

  createConversation: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      title: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.aIConversation.create({
        data: {
          clubId: input.clubId,
          userId: ctx.session.user.id,
          title: input.title || 'New conversation',
        },
      })
    }),

  deleteConversation: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
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
