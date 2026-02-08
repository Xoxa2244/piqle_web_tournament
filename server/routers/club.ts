import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000'

const clubCreateInput = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum(['VENUE', 'COMMUNITY']).default('VENUE'),
  description: z.string().max(2000).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  courtReserveUrl: z.string().url().optional(),
  bookingRequestEmail: z.string().email().optional(),
})

export const clubRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          query: z.string().max(120).optional(),
          kind: z.enum(['VENUE', 'COMMUNITY']).optional(),
          verifiedOnly: z.boolean().optional(),
          hasBooking: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const userId = ctx.session?.user?.id ?? DUMMY_USER_ID

      const where: any = {}
      if (input?.query?.trim()) {
        where.name = { contains: input.query.trim(), mode: 'insensitive' as const }
      }
      if (input?.kind) {
        where.kind = input.kind
      }
      if (input?.verifiedOnly) {
        where.isVerified = true
      }
      if (input?.hasBooking) {
        where.courtReserveUrl = { not: null }
      }

      const clubs = await ctx.prisma.club.findMany({
        where,
        orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          kind: true,
          address: true,
          city: true,
          state: true,
          isVerified: true,
          courtReserveUrl: true,
          _count: {
            select: {
              followers: true,
              tournaments: true,
            },
          },
          followers: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          tournaments: {
            where: { startDate: { gte: now } },
            orderBy: { startDate: 'asc' },
            take: 1,
            select: {
              id: true,
              title: true,
              startDate: true,
              publicSlug: true,
            },
          },
        },
      })

      return clubs.map((club) => ({
        id: club.id,
        name: club.name,
        kind: club.kind,
        address: club.address,
        city: club.city,
        state: club.state,
        isVerified: club.isVerified,
        hasBooking: Boolean(club.courtReserveUrl),
        followersCount: club._count.followers,
        tournamentsCount: club._count.tournaments,
        isFollowing: club.followers.length > 0 && userId !== DUMMY_USER_ID,
        nextTournament: club.tournaments[0] ?? null,
      }))
    }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const userId = ctx.session?.user?.id ?? DUMMY_USER_ID

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          kind: true,
          description: true,
          address: true,
          city: true,
          state: true,
          country: true,
          isVerified: true,
          courtReserveUrl: true,
          createdAt: true,
          _count: { select: { followers: true } },
          followers: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          admins: {
            where: { userId },
            select: { id: true, role: true },
            take: 1,
          },
          tournaments: {
            where: { startDate: { gte: now } },
            orderBy: { startDate: 'asc' },
            take: 20,
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              entryFeeCents: true,
              publicSlug: true,
            },
          },
          announcements: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              title: true,
              body: true,
              createdAt: true,
              createdByUser: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
      })

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      const isAdmin = club.admins.length > 0 && userId !== DUMMY_USER_ID

      const bookingRequests = isAdmin
        ? await ctx.prisma.clubBookingRequest.findMany({
            where: { clubId: input.id },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: {
              id: true,
              requesterName: true,
              requesterEmail: true,
              requesterPhone: true,
              desiredStart: true,
              durationMinutes: true,
              playersCount: true,
              message: true,
              status: true,
              createdAt: true,
            },
          })
        : []

      return {
        ...club,
        followersCount: club._count.followers,
        isFollowing: club.followers.length > 0 && userId !== DUMMY_USER_ID,
        isAdmin,
        bookingRequests,
      }
    }),

  toggleFollow: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.prisma.clubFollower.findUnique({
        where: {
          clubId_userId: {
            clubId: input.clubId,
            userId,
          },
        },
        select: { id: true },
      })

      if (existing) {
        await ctx.prisma.clubFollower.delete({ where: { id: existing.id } })
        return { isFollowing: false }
      }

      await ctx.prisma.clubFollower.create({
        data: {
          clubId: input.clubId,
          userId,
        },
      })

      return { isFollowing: true }
    }),

  create: protectedProcedure.input(clubCreateInput).mutation(async ({ ctx, input }) => {
    const club = await ctx.prisma.club.create({
      data: {
        name: input.name.trim(),
        kind: input.kind,
        description: input.description?.trim() || null,
        address: input.address?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim() || null,
        country: input.country?.trim() || null,
        courtReserveUrl: input.courtReserveUrl?.trim() || null,
        bookingRequestEmail: input.bookingRequestEmail?.trim() || null,
        isVerified: false,
        admins: {
          create: {
            userId: ctx.session.user.id,
            role: 'ADMIN',
          },
        },
      },
    })

    return club
  }),

  createAnnouncement: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        title: z.string().max(120).optional(),
        body: z.string().min(1).max(4000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: {
          clubId_userId: {
            clubId: input.clubId,
            userId,
          },
        },
        select: { id: true },
      })

      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can post announcements' })
      }

      const announcement = await ctx.prisma.clubAnnouncement.create({
        data: {
          clubId: input.clubId,
          title: input.title?.trim() || null,
          body: input.body.trim(),
          createdByUserId: userId,
        },
        include: {
          createdByUser: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      })

      return announcement
    }),

  createBookingRequest: publicProcedure
    .input(
      z.object({
        clubId: z.string(),
        requesterName: z.string().min(2).max(120),
        requesterEmail: z.string().email(),
        requesterPhone: z.string().max(60).optional(),
        desiredStart: z.string().optional(), // ISO string
        durationMinutes: z.number().int().min(15).max(8 * 60).optional(),
        playersCount: z.number().int().min(1).max(64).optional(),
        message: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const desiredStartDate = input.desiredStart ? new Date(input.desiredStart) : null
      if (desiredStartDate && Number.isNaN(desiredStartDate.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid desiredStart' })
      }

      await ctx.prisma.clubBookingRequest.create({
        data: {
          clubId: input.clubId,
          requesterUserId: ctx.session?.user?.id ?? null,
          requesterName: input.requesterName.trim(),
          requesterEmail: input.requesterEmail.trim(),
          requesterPhone: input.requesterPhone?.trim() || null,
          desiredStart: desiredStartDate,
          durationMinutes: input.durationMinutes ?? null,
          playersCount: input.playersCount ?? null,
          message: input.message?.trim() || null,
          status: 'NEW',
        },
      })

      return { success: true }
    }),
})
