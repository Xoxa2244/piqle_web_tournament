import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'

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
              email: true,
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

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { id: true },
      })
      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      const [follower, admin] = await Promise.all([
        ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId } },
          select: { id: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId } },
          select: { id: true },
        }),
      ])

      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to post messages' })
      }

      const message = await ctx.prisma.clubChatMessage.create({
        data: {
          clubId: input.clubId,
          userId,
          text: trimmed,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
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

