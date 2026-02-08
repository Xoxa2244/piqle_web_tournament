import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import profanity from 'leo-profanity'

// Load dictionaries once at module init.
profanity.loadDictionary('en')
profanity.add(profanity.getDictionary('ru'))

const extraBlocked = (process.env.CHAT_BLOCKED_WORDS || '')
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean)
if (extraBlocked.length) {
  profanity.add(extraBlocked)
}

const normalizeText = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

export const clubChatRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        clubId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 50

      const raw = await ctx.prisma.clubChatMessage.findMany({
        where: { clubId: input.clubId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      })

      // Return chronologically (oldest -> newest) for chat UI.
      const ordered = raw.slice().reverse()

      return ordered.map((m) => ({
        id: m.id,
        clubId: m.clubId,
        userId: m.userId,
        text: m.deletedAt ? null : m.text,
        isDeleted: Boolean(m.deletedAt),
        deletedAt: m.deletedAt,
        deletedByUserId: m.deletedByUserId,
        createdAt: m.createdAt,
        user: m.user,
      }))
    }),

  send: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        text: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const trimmed = input.text.trim()
      if (!trimmed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Message cannot be empty' })
      }

      const clubId = input.clubId
      const now = new Date()
      const minuteAgo = new Date(now.getTime() - 60 * 1000)

      const [club, follower, admin, lastMessage, messagesLastMinute] = await Promise.all([
        ctx.prisma.club.findUnique({
          where: { id: clubId },
          select: { id: true },
        }),
        ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId, userId } },
          select: { id: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId, userId } },
          select: { id: true },
        }),
        ctx.prisma.clubChatMessage.findFirst({
          where: { clubId, userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, text: true },
        }),
        ctx.prisma.clubChatMessage.count({
          where: { clubId, userId, createdAt: { gte: minuteAgo } },
        }),
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to post messages' })
      }

      const isAdmin = Boolean(admin)
      const cooldownMs = isAdmin ? 1000 : 2500
      const maxPerMinute = isAdmin ? 30 : 10

      if (lastMessage) {
        const delta = now.getTime() - new Date(lastMessage.createdAt).getTime()
        if (delta < cooldownMs) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Slow down a bit.' })
        }

        if (normalizeText(lastMessage.text) === normalizeText(trimmed)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Duplicate message.' })
        }
      }

      if (messagesLastMinute >= maxPerMinute) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many messages. Please wait.' })
      }

      const links = trimmed.match(/https?:\/\/\S+|www\.\S+/gi) ?? []
      const maxLinksPerMessage = isAdmin ? 5 : 1
      if (links.length > maxLinksPerMessage) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Too many links (max ${maxLinksPerMessage}).` })
      }

      let sanitized = trimmed
      let wasFiltered = false
      if (profanity.check(sanitized)) {
        sanitized = profanity.clean(sanitized)
        wasFiltered = sanitized !== trimmed
      }

      const message = await ctx.prisma.clubChatMessage.create({
        data: {
          clubId: input.clubId,
          userId,
          text: sanitized,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      })

      return {
        id: message.id,
        clubId: message.clubId,
        userId: message.userId,
        text: message.text,
        wasFiltered,
        isDeleted: false,
        deletedAt: null,
        deletedByUserId: null,
        createdAt: message.createdAt,
        user: message.user,
      }
    }),

  delete: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const message = await ctx.prisma.clubChatMessage.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          clubId: true,
          userId: true,
          deletedAt: true,
        },
      })

      if (!message) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
      }

      if (message.deletedAt) {
        return { success: true }
      }

      if (message.userId !== userId) {
        const admin = await ctx.prisma.clubAdmin.findUnique({
          where: {
            clubId_userId: {
              clubId: message.clubId,
              userId,
            },
          },
          select: { id: true },
        })
        if (!admin) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed to delete this message' })
        }
      }

      await ctx.prisma.clubChatMessage.update({
        where: { id: input.messageId },
        data: {
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      })

      return { success: true }
    }),
})
