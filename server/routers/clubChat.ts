import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { sanitizeChatText } from '../utils/chatModeration'
import { pushToUsers } from '@/lib/realtime'

const isMissingDbRelation = (err: any, relationName: string) => {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes(relationName.toLowerCase()) && msg.includes('does not exist')
}

const clubChatUserSelect = {
  id: true,
  name: true,
  image: true,
} as const

const clubChatReplyPreviewSelect = {
  id: true,
  userId: true,
  text: true,
  deletedAt: true,
  createdAt: true,
  user: {
    select: clubChatUserSelect,
  },
} as const

const mapClubChatMessage = (m: any, currentUserId?: string, latestReadAt?: Date | null) => ({
  id: m.id,
  clubId: m.clubId,
  userId: m.userId,
  text: m.deletedAt ? null : m.text,
  isDeleted: Boolean(m.deletedAt),
  parentMessageId: m.parentMessageId ?? null,
  replyToMessageId: m.replyToMessageId ?? null,
  replyToMessage: m.replyToMessage
    ? {
        id: m.replyToMessage.id,
        userId: m.replyToMessage.userId,
        text: m.replyToMessage.deletedAt ? null : m.replyToMessage.text,
        isDeleted: Boolean(m.replyToMessage.deletedAt),
        createdAt: m.replyToMessage.createdAt,
        user: m.replyToMessage.user,
      }
    : null,
  deletedAt: m.deletedAt,
  deletedByUserId: m.deletedByUserId,
  createdAt: m.createdAt,
  deliveryStatus:
    currentUserId && m.userId === currentUserId
      ? latestReadAt && new Date(m.createdAt) <= latestReadAt
        ? 'read'
        : 'delivered'
      : undefined,
  likeCount: m._count?.likes ?? 0,
  viewerHasLiked: Boolean(m.likes?.length),
  user: m.user,
})

export const clubChatRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const clubId = input.clubId
      const limit = input.limit ?? 50

      const [club, follower, admin] = await Promise.all([
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
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      // If banned, block reading chat (best effort if migration isn't applied yet).
      try {
        const ban = await ctx.prisma.clubBan.findUnique({
          where: { clubId_userId: { clubId, userId } },
          select: { id: true },
        })
        if (ban) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You are banned from this club' })
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (!isMissingDbRelation(err, 'club_bans')) throw err
      }

      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to view the chat' })
      }

      const raw = await ctx.prisma.clubChatMessage.findMany({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          user: {
            select: clubChatUserSelect,
          },
          replyToMessage: {
            select: clubChatReplyPreviewSelect,
          },
          likes: {
            where: { userId },
            select: { id: true },
          },
          _count: {
            select: { likes: true },
          },
        },
      })

      const latestReadByOthers = await ctx.prisma.clubChatReadState.findFirst({
        where: {
          clubId,
          userId: { not: userId },
        },
        orderBy: {
          lastReadAt: 'desc',
        },
        select: {
          lastReadAt: true,
        },
      })
      const latestReadAt = latestReadByOthers?.lastReadAt ? new Date(latestReadByOthers.lastReadAt) : null

      // Return chronologically (oldest -> newest) for chat UI.
      const ordered = raw.slice().reverse()

      return ordered.map((m) => mapClubChatMessage(m, userId, latestReadAt))
    }),

  listThread: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        rootMessageId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const clubId = input.clubId

      const [club, follower, admin, rootMessage] = await Promise.all([
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
        ctx.prisma.clubChatMessage.findUnique({
          where: { id: input.rootMessageId },
          select: { id: true, clubId: true, parentMessageId: true },
        }),
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }
      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to view the chat' })
      }
      if (!rootMessage || rootMessage.clubId !== clubId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thread not found' })
      }
      const normalizedRootId = rootMessage.parentMessageId ?? rootMessage.id

      const raw = await ctx.prisma.clubChatMessage.findMany({
        where: {
          clubId,
          OR: [{ id: normalizedRootId }, { parentMessageId: normalizedRootId }],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: clubChatUserSelect,
          },
          replyToMessage: {
            select: clubChatReplyPreviewSelect,
          },
          likes: {
            where: { userId },
            select: { id: true },
          },
          _count: {
            select: { likes: true },
          },
        },
      })

      const latestReadByOthers = await ctx.prisma.clubChatReadState.findFirst({
        where: {
          clubId,
          userId: { not: userId },
        },
        orderBy: {
          lastReadAt: 'desc',
        },
        select: {
          lastReadAt: true,
        },
      })
      const latestReadAt = latestReadByOthers?.lastReadAt ? new Date(latestReadByOthers.lastReadAt) : null

      return {
        rootMessageId: normalizedRootId,
        messages: raw.map((message) => mapClubChatMessage(message, userId, latestReadAt)),
      }
    }),

  markRead: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const clubId = input.clubId

      const [club, follower, admin] = await Promise.all([
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
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      try {
        const ban = await ctx.prisma.clubBan.findUnique({
          where: { clubId_userId: { clubId, userId } },
          select: { id: true },
        })
        if (ban) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You are banned from this club' })
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (!isMissingDbRelation(err, 'club_bans')) throw err
      }

      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to use the chat' })
      }

      try {
        await ctx.prisma.clubChatReadState.upsert({
          where: { clubId_userId: { clubId, userId } },
          create: {
            clubId,
            userId,
            lastReadAt: new Date(),
          },
          update: {
            lastReadAt: new Date(),
          },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_chat_read_states')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_chat_read_states table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      const [followers, admins] = await Promise.all([
        ctx.prisma.clubFollower.findMany({
          where: { clubId },
          select: { userId: true },
        }),
        ctx.prisma.clubAdmin.findMany({
          where: { clubId },
          select: { userId: true },
        }),
      ])
      const recipientIds = Array.from(
        new Set([...followers.map((f) => f.userId), ...admins.map((a) => a.userId)])
      ).filter((id) => id !== userId)
      pushToUsers(recipientIds, { type: 'invalidate', keys: ['club.listMyChatClubs'] })

      return { success: true }
    }),

  send: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        text: z.string().min(1).max(1000),
        replyToMessageId: z.string().optional(),
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

      const [club, follower, admin, lastMessage, messagesLastMinute, replyTarget] = await Promise.all([
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
        input.replyToMessageId
          ? ctx.prisma.clubChatMessage.findUnique({
              where: { id: input.replyToMessageId },
              select: {
                id: true,
                clubId: true,
                parentMessageId: true,
                deletedAt: true,
                userId: true,
                text: true,
                createdAt: true,
                user: {
                  select: clubChatUserSelect,
                },
              },
            })
          : Promise.resolve(null),
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      try {
        const ban = await ctx.prisma.clubBan.findUnique({
          where: { clubId_userId: { clubId, userId } },
          select: { id: true },
        })
        if (ban) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You are banned from this club' })
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (!isMissingDbRelation(err, 'club_bans')) throw err
      }

      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to post messages' })
      }
      if (input.replyToMessageId) {
        if (!replyTarget || replyTarget.clubId !== clubId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reply target not found' })
        }
        if (replyTarget.deletedAt) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot reply to a deleted message' })
        }
      }

      const isAdmin = Boolean(admin)
      const cooldownMs = isAdmin ? 250 : 350
      const maxPerMinute = isAdmin ? 30 : 10

      if (lastMessage) {
        const delta = now.getTime() - new Date(lastMessage.createdAt).getTime()
        if (delta < cooldownMs) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Slow down a bit.' })
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

      const moderation = sanitizeChatText(trimmed)
      const sanitized = moderation.text
      const wasFiltered = moderation.wasFiltered

      const message = await ctx.prisma.clubChatMessage.create({
        data: {
          clubId: input.clubId,
          userId,
          text: sanitized,
          parentMessageId: replyTarget ? replyTarget.parentMessageId ?? replyTarget.id : null,
          replyToMessageId: replyTarget ? replyTarget.id : null,
        },
        include: {
          user: {
            select: clubChatUserSelect,
          },
          replyToMessage: {
            select: clubChatReplyPreviewSelect,
          },
        },
      })

      const [followers, admins] = await Promise.all([
        ctx.prisma.clubFollower.findMany({
          where: { clubId: input.clubId },
          select: { userId: true },
        }),
        ctx.prisma.clubAdmin.findMany({
          where: { clubId: input.clubId },
          select: { userId: true },
        }),
      ])
      const recipientIds = Array.from(
        new Set([...followers.map((f) => f.userId), ...admins.map((a) => a.userId)])
      ).filter((id) => id !== userId)
      pushToUsers(recipientIds, { type: 'invalidate', keys: ['club.listMyChatClubs'] })

      return {
        ...mapClubChatMessage(
          {
            ...message,
            likes: [],
            _count: { likes: 0 },
          },
          userId,
          null,
        ),
        text: message.text,
        deliveryStatus: 'delivered' as const,
        wasFiltered,
      }
    }),

  likeMessage: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const message = await ctx.prisma.clubChatMessage.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          clubId: true,
          deletedAt: true,
        },
      })

      if (!message) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
      }
      if (message.deletedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot like a deleted message' })
      }

      const [club, follower, admin] = await Promise.all([
        ctx.prisma.club.findUnique({
          where: { id: message.clubId },
          select: { id: true },
        }),
        ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: message.clubId, userId } },
          select: { id: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: message.clubId, userId } },
          select: { id: true },
        }),
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      try {
        const ban = await ctx.prisma.clubBan.findUnique({
          where: { clubId_userId: { clubId: message.clubId, userId } },
          select: { id: true },
        })
        if (ban) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You are banned from this club' })
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (!isMissingDbRelation(err, 'club_bans')) throw err
      }

      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to react to messages' })
      }

      const existingLike = await ctx.prisma.clubChatLike.findUnique({
        where: {
          messageId_userId: {
            messageId: message.id,
            userId,
          },
        },
        select: { id: true },
      })

      if (existingLike) {
        await ctx.prisma.clubChatLike.delete({
          where: { id: existingLike.id },
        })
      } else {
        await ctx.prisma.clubChatLike.create({
          data: {
            messageId: message.id,
            userId,
          },
        })
      }

      const likeCount = await ctx.prisma.clubChatLike.count({
        where: { messageId: message.id },
      })

      const [followers, admins] = await Promise.all([
        ctx.prisma.clubFollower.findMany({
          where: { clubId: message.clubId },
          select: { userId: true },
        }),
        ctx.prisma.clubAdmin.findMany({
          where: { clubId: message.clubId },
          select: { userId: true },
        }),
      ])
      const recipientIds = Array.from(
        new Set([...followers.map((f) => f.userId), ...admins.map((a) => a.userId)])
      ).filter((id) => id !== userId)
      pushToUsers(recipientIds, { type: 'invalidate', keys: ['club.listMyChatClubs'] })

      return {
        messageId: message.id,
        likeCount,
        viewerHasLiked: !existingLike,
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
