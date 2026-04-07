import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { pushToUsers } from '@/lib/realtime'

import { normalizeTextForSpam, sanitizeChatText } from '../utils/chatModeration'
import { createTRPCRouter, protectedProcedure } from '../trpc'

const isMissingDbRelation = (err: any, relationName: string) => {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes(relationName.toLowerCase()) && msg.includes('does not exist')
}

const sortParticipantIds = (left: string, right: string) => {
  return left < right ? [left, right] : [right, left]
}

async function getThreadForUser(prisma: any, threadId: string, userId: string) {
  const thread = await prisma.directChatThread.findUnique({
    where: { id: threadId },
    include: {
      participantA: {
        select: {
          id: true,
          name: true,
          image: true,
          city: true,
          isActive: true,
        },
      },
      participantB: {
        select: {
          id: true,
          name: true,
          image: true,
          city: true,
          isActive: true,
        },
      },
    },
  })

  if (!thread) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Chat not found' })
  }

  if (thread.participantAId !== userId && thread.participantBId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this chat' })
  }

  return thread
}

async function getDirectBlockState(prisma: any, userId: string, otherUserId: string) {
  try {
    const rows = await prisma.directChatBlock.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedUserId: otherUserId },
          { blockerId: otherUserId, blockedUserId: userId },
        ],
      },
      select: {
        blockerId: true,
        blockedUserId: true,
      },
    })

    return {
      blockedByMe: rows.some((row: any) => row.blockerId === userId && row.blockedUserId === otherUserId),
      blockedByOther: rows.some((row: any) => row.blockerId === otherUserId && row.blockedUserId === userId),
    }
  } catch (err: any) {
    if (isMissingDbRelation(err, 'direct_chat_blocks')) {
      return { blockedByMe: false, blockedByOther: false }
    }
    throw err
  }
}

export const directChatRouter = createTRPCRouter({
  getOrCreate: protectedProcedure
    .input(
      z.object({
        otherUserId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const otherUserId = input.otherUserId.trim()

      if (!otherUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Recipient is required' })
      }
      if (otherUserId === userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot message yourself' })
      }

      const otherUser = await ctx.prisma.user.findUnique({
        where: { id: otherUserId },
        select: {
          id: true,
          name: true,
          image: true,
          city: true,
          isActive: true,
        },
      })

      if (!otherUser || !otherUser.isActive) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      }

      const [participantAId, participantBId] = sortParticipantIds(userId, otherUserId)
      const blockState = await getDirectBlockState(ctx.prisma, userId, otherUserId)
      if (blockState.blockedByMe || blockState.blockedByOther) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: blockState.blockedByMe
            ? 'You blocked this user and cannot send messages.'
            : 'You cannot send messages to this user.',
        })
      }

      const thread = await ctx.prisma.directChatThread.upsert({
        where: {
          participantAId_participantBId: {
            participantAId,
            participantBId,
          },
        },
        create: {
          participantAId,
          participantBId,
        },
        update: {},
      })

      try {
        await ctx.prisma.directChatHiddenState.delete({
          where: {
            threadId_userId: {
              threadId: thread.id,
              userId,
            },
          },
        })
      } catch (err: any) {
        if (!isMissingDbRelation(err, 'direct_chat_hidden_states')) {
          throw err
        }
      }

      return {
        threadId: thread.id,
        otherUser: {
          id: otherUser.id,
          name: otherUser.name,
          image: otherUser.image,
          city: otherUser.city,
        },
      }
    }),

  getThread: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const thread = await getThreadForUser(ctx.prisma, input.threadId, userId)
      const otherUser = thread.participantAId === userId ? thread.participantB : thread.participantA
      const blockState = await getDirectBlockState(ctx.prisma, userId, otherUser.id)

      return {
        id: thread.id,
        otherUser: {
          id: otherUser.id,
          name: otherUser.name,
          image: otherUser.image,
          city: otherUser.city,
        },
        messagingState: {
          blockedByMe: blockState.blockedByMe,
          blockedByOther: blockState.blockedByOther,
          canMessage: !(blockState.blockedByMe || blockState.blockedByOther),
        },
      }
    }),

  listMyChats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const threads = await ctx.prisma.directChatThread.findMany({
      where: {
        OR: [{ participantAId: userId }, { participantBId: userId }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        participantA: {
          select: {
            id: true,
            name: true,
            image: true,
            city: true,
          },
        },
        participantB: {
          select: {
            id: true,
            name: true,
            image: true,
            city: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        readStates: {
          where: { userId },
          take: 1,
          select: {
            lastReadAt: true,
          },
        },
      },
    })

    let hiddenRows: { threadId: string; hiddenAt: Date }[] = []
    try {
      hiddenRows = await ctx.prisma.directChatHiddenState.findMany({
        where: {
          userId,
          threadId: { in: threads.map((thread) => thread.id) },
        },
        select: {
          threadId: true,
          hiddenAt: true,
        },
      })
    } catch (err: any) {
      if (!isMissingDbRelation(err, 'direct_chat_hidden_states')) {
        throw err
      }
    }

    const hiddenAtByThreadId = new Map(hiddenRows.map((row) => [row.threadId, row.hiddenAt]))

    const unreadCounts = await Promise.all(
      threads.map(async (thread) => {
        const lastReadAt = thread.readStates[0]?.lastReadAt ?? new Date(0)
        const count = await ctx.prisma.directChatMessage.count({
          where: {
            threadId: thread.id,
            userId: { not: userId },
            deletedAt: null,
            createdAt: { gt: lastReadAt },
          },
        })
        return [thread.id, count] as const
      })
    )

    const unreadByThreadId = new Map(unreadCounts)

    return threads
      .filter((thread) => {
        const hiddenAt = hiddenAtByThreadId.get(thread.id)
        if (!hiddenAt) return true
        const visibleUpdatedAt = thread.messages[0]?.createdAt ?? thread.updatedAt
        return visibleUpdatedAt > hiddenAt
      })
      .map((thread) => {
        const otherUser = thread.participantAId === userId ? thread.participantB : thread.participantA
        const lastMessage = thread.messages[0] ?? null
        return {
          id: thread.id,
          otherUser: {
            id: otherUser.id,
            name: otherUser.name,
            image: otherUser.image,
            city: otherUser.city,
          },
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                text: lastMessage.deletedAt ? null : lastMessage.text,
                isDeleted: Boolean(lastMessage.deletedAt),
                createdAt: lastMessage.createdAt,
                userId: lastMessage.userId,
                userName: lastMessage.user?.name ?? null,
              }
            : null,
          unreadCount: unreadByThreadId.get(thread.id) ?? 0,
          updatedAt: lastMessage?.createdAt ?? thread.updatedAt,
        }
      })
  }),

  list: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const limit = input.limit ?? 100

      await getThreadForUser(ctx.prisma, input.threadId, userId)

      const raw = await ctx.prisma.directChatMessage.findMany({
        where: { threadId: input.threadId },
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

      return raw.slice().reverse().map((message) => ({
        id: message.id,
        threadId: message.threadId,
        userId: message.userId,
        text: message.deletedAt ? null : message.text,
        isDeleted: Boolean(message.deletedAt),
        deletedAt: message.deletedAt,
        deletedByUserId: message.deletedByUserId,
        createdAt: message.createdAt,
        user: message.user,
      }))
    }),

  markRead: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await getThreadForUser(ctx.prisma, input.threadId, userId)

      try {
        await ctx.prisma.directChatReadState.upsert({
          where: {
            threadId_userId: {
              threadId: input.threadId,
              userId,
            },
          },
          create: {
            threadId: input.threadId,
            userId,
            lastReadAt: new Date(),
          },
          update: {
            lastReadAt: new Date(),
          },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'direct_chat_read_states')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'direct_chat_read_states table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      return { success: true }
    }),

  send: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        text: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const trimmed = input.text.trim()
      if (!trimmed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Message cannot be empty' })
      }

      const thread = await getThreadForUser(ctx.prisma, input.threadId, userId)
      const otherUserId = thread.participantAId === userId ? thread.participantBId : thread.participantAId
      const blockState = await getDirectBlockState(ctx.prisma, userId, otherUserId)
      if (blockState.blockedByMe || blockState.blockedByOther) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: blockState.blockedByMe
            ? 'You blocked this user and cannot send messages.'
            : 'You cannot send messages to this user.',
        })
      }
      const now = new Date()
      const minuteAgo = new Date(now.getTime() - 60 * 1000)

      const [lastMessage, messagesLastMinute] = await Promise.all([
        ctx.prisma.directChatMessage.findFirst({
          where: { threadId: input.threadId, userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, text: true },
        }),
        ctx.prisma.directChatMessage.count({
          where: { threadId: input.threadId, userId, createdAt: { gte: minuteAgo } },
        }),
      ])

      if (lastMessage) {
        const delta = now.getTime() - new Date(lastMessage.createdAt).getTime()
        if (delta < 350) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Slow down a bit.' })
        }

        if (normalizeTextForSpam(lastMessage.text) === normalizeTextForSpam(trimmed)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Duplicate message.' })
        }
      }

      if (messagesLastMinute >= 20) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many messages. Please wait.' })
      }

      const links = trimmed.match(/https?:\/\/\S+|www\.\S+/gi) ?? []
      if (links.length > 3) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Too many links (max 3).' })
      }

      const moderation = sanitizeChatText(trimmed)
      const sanitized = moderation.text
      const wasFiltered = moderation.wasFiltered

      const message = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.directChatMessage.create({
          data: {
            threadId: input.threadId,
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

        await tx.directChatThread.update({
          where: { id: input.threadId },
          data: { updatedAt: now },
        })

        return created
      })

      const recipientIds = [thread.participantAId, thread.participantBId].filter((id) => id !== userId)
      pushToUsers(recipientIds, { type: 'invalidate', keys: ['directChat.listMyChats'] })

      return {
        id: message.id,
        threadId: message.threadId,
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
      const message = await ctx.prisma.directChatMessage.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          threadId: true,
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
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed to delete this message' })
      }

      await ctx.prisma.directChatMessage.update({
        where: { id: input.messageId },
        data: {
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      })

      return { success: true }
    }),

  deleteThread: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const thread = await getThreadForUser(ctx.prisma, input.threadId, userId)

      try {
        await ctx.prisma.directChatHiddenState.upsert({
          where: {
            threadId_userId: {
              threadId: thread.id,
              userId,
            },
          },
          create: {
            threadId: thread.id,
            userId,
            hiddenAt: new Date(),
          },
          update: {
            hiddenAt: new Date(),
          },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'direct_chat_hidden_states')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'direct_chat_hidden_states table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      pushToUsers([userId], { type: 'invalidate', keys: ['directChat.listMyChats'] })

      return { success: true }
    }),
})
