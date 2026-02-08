import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { getTeamSlotCount } from '../utils/teamSlots'

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000'

const decimalToNumber = (val: any): number | null => {
  if (val === null || val === undefined) return null
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  if (typeof val === 'string') {
    const n = Number(val)
    return Number.isFinite(n) ? n : null
  }
  if (typeof val.toNumber === 'function') {
    const n = val.toNumber()
    return Number.isFinite(n) ? n : null
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

const formatGenderLabel = (genders: Set<string>) => {
  const parts: string[] = []
  if (genders.has('MEN')) parts.push('Men')
  if (genders.has('WOMEN')) parts.push('Women')
  if (genders.has('MIXED')) parts.push('Mixed')
  if (parts.length === 0) return 'Any'
  return parts.join('/')
}

const computeDuprSummary = (mins: number[], maxs: number[]) => {
  const min = mins.length ? Math.min(...mins) : null
  const max = maxs.length ? Math.max(...maxs) : null
  const fmt = (n: number) => n.toFixed(2).replace(/\.?0+$/, '')

  if (min === null && max === null) {
    return { duprMin: null as number | null, duprMax: null as number | null, duprLabel: null as string | null }
  }

  if (min !== null && max !== null) {
    return { duprMin: min, duprMax: max, duprLabel: `DUPR ${fmt(min)}-${fmt(max)}` }
  }

  if (min !== null) {
    return { duprMin: min, duprMax: null, duprLabel: `DUPR ${fmt(min)}+` }
  }

  return { duprMin: null, duprMax: max, duprLabel: `DUPR ≤${fmt(max!)}` }
}

const optionalHttpUrl = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val
    const trimmed = val.trim()
    if (!trimmed) return undefined

    // Allow users to paste "example.com" without scheme; normalize to https.
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    return hasScheme ? trimmed : `https://${trimmed}`
  },
  z
    .string()
    .url()
    .optional()
    .refine((url) => !url || url.startsWith('http://') || url.startsWith('https://'), {
      message: 'Invalid url',
    })
)

const clubCreateInput = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum(['VENUE', 'COMMUNITY']).default('VENUE'),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  courtReserveUrl: optionalHttpUrl,
  bookingRequestEmail: z.string().email().optional(),
})

export const clubRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          query: z.string().max(120).optional(),
          kind: z.enum(['VENUE', 'COMMUNITY']).optional(),
          city: z.string().max(120).optional(),
          state: z.string().max(120).optional(),
          verifiedOnly: z.boolean().optional(),
          hasBooking: z.boolean().optional(),
          hasUpcomingEvents: z.boolean().optional(),
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
      if (input?.city?.trim()) {
        where.city = { contains: input.city.trim(), mode: 'insensitive' as const }
      }
      if (input?.state?.trim()) {
        where.state = { equals: input.state.trim().toUpperCase(), mode: 'insensitive' as const }
      }
      if (input?.verifiedOnly) {
        where.isVerified = true
      }
      if (input?.hasBooking) {
        where.courtReserveUrl = { not: null }
      }
      if (input?.hasUpcomingEvents) {
        where.tournaments = { some: { endDate: { gte: now } } }
      }

      const clubs = await ctx.prisma.club.findMany({
        where,
        orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          kind: true,
          logoUrl: true,
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
            // Include both upcoming and currently running tournaments.
            where: { endDate: { gte: now } },
            orderBy: { startDate: 'asc' },
            take: 1,
            select: {
              id: true,
              title: true,
              startDate: true,
              publicSlug: true,
              entryFeeCents: true,
            },
          },
        },
      })

      return clubs.map((club) => ({
        id: club.id,
        name: club.name,
        kind: club.kind,
        logoUrl: club.logoUrl,
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
          logoUrl: true,
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
            // Include both upcoming and currently running tournaments.
            where: { endDate: { gte: now } },
            orderBy: { startDate: 'asc' },
            take: 20,
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              entryFeeCents: true,
              publicSlug: true,
              format: true,
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

      const tournamentIds = club.tournaments.map((t) => t.id)
      const tournamentStatsById = new Map<
        string,
        {
          totalSlots: number
          filledSlots: number
          genders: Set<string>
          duprMins: number[]
          duprMaxs: number[]
        }
      >()

      if (tournamentIds.length > 0) {
        const divisions = await ctx.prisma.division.findMany({
          where: { tournamentId: { in: tournamentIds } },
          select: {
            tournamentId: true,
            teamKind: true,
            maxTeams: true,
            constraints: {
              select: {
                genders: true,
                minDupr: true,
                maxDupr: true,
                minTeamDupr: true,
                maxTeamDupr: true,
              },
            },
            teams: {
              select: {
                id: true,
                _count: { select: { teamPlayers: true } },
              },
            },
          },
        })

        for (const division of divisions) {
          const agg =
            tournamentStatsById.get(division.tournamentId) ??
            {
              totalSlots: 0,
              filledSlots: 0,
              genders: new Set<string>(),
              duprMins: [],
              duprMaxs: [],
            }

          const slotCount = getTeamSlotCount(
            (division.teamKind ?? 'DOUBLES_2v2') as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
          )
          const teamsCount = division.teams.length || division.maxTeams || 0
          const totalSlots = teamsCount * slotCount
          const filledSlots = division.teams.reduce((sum, team) => {
            const teamPlayers = team._count.teamPlayers
            return sum + Math.min(teamPlayers, slotCount)
          }, 0)

          agg.totalSlots += totalSlots
          agg.filledSlots += filledSlots

          const g = division.constraints?.genders ?? 'ANY'
          agg.genders.add(g)

          const pushMin = (v: any) => {
            const n = decimalToNumber(v)
            if (n === null) return
            agg.duprMins.push(n)
          }
          const pushMax = (v: any) => {
            const n = decimalToNumber(v)
            if (n === null) return
            agg.duprMaxs.push(n)
          }

          pushMin(division.constraints?.minDupr)
          pushMin(division.constraints?.minTeamDupr)
          pushMax(division.constraints?.maxDupr)
          pushMax(division.constraints?.maxTeamDupr)

          tournamentStatsById.set(division.tournamentId, agg)
        }
      }

      const tournaments = club.tournaments.map((t) => {
        const stats = tournamentStatsById.get(t.id) ?? null
        const genderLabel = stats ? formatGenderLabel(stats.genders) : null
        const dupr = stats ? computeDuprSummary(stats.duprMins, stats.duprMaxs) : { duprMin: null, duprMax: null, duprLabel: null }
        return {
          ...t,
          totals: stats ? { totalSlots: stats.totalSlots, filledSlots: stats.filledSlots } : null,
          genderLabel,
          ...dupr,
        }
      })

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
        tournaments,
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
        logoUrl: input.logoUrl?.trim() || null,
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
