import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { getTeamSlotCount } from '../utils/teamSlots'

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000'

const isMissingDbRelation = (err: any, relationName: string) => {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes(relationName.toLowerCase()) && msg.includes('does not exist')
}

const isMissingDbColumn = (err: any, columnName: string) => {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes(`"${columnName.toLowerCase()}"`) && msg.includes('does not exist')
}

const maskEmail = (email: string | null | undefined) => {
  try {
    const [localRaw, domainRaw] = String(email ?? '').split('@')
    const local = (localRaw ?? '').trim()
    const domain = (domainRaw ?? '').trim()
    if (!local || !domain) return null

    const localMasked = local.length <= 1 ? '*' : `${local[0]}***`
    const domainParts = domain.split('.').filter(Boolean)
    const tld = domainParts.length ? domainParts[domainParts.length - 1] : '***'
    const domainMain = domainParts.length > 1 ? domainParts.slice(0, -1).join('.') : domainParts[0] ?? ''
    const domainMasked = domainMain ? `${domainMain[0]}***` : '***'
    return `${localMasked}@${domainMasked}.${tld}`
  } catch {
    return null
  }
}

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
    return { duprMin: null as number | null, duprMax: null as number | null, duprLabel: 'DUPR Open' as string | null }
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
  joinPolicy: z.enum(['OPEN', 'APPROVAL']).default('OPEN'),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  courtReserveUrl: optionalHttpUrl,
  bookingRequestEmail: z.string().email().optional(),
})

const clubUpdateInput = clubCreateInput.extend({
  id: z.string(),
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

      let bannedClubIds = new Set<string>()
      if (userId !== DUMMY_USER_ID) {
        try {
          const bans = await ctx.prisma.clubBan.findMany({
            where: { userId },
            select: { clubId: true },
          })
          bannedClubIds = new Set(bans.map((b) => b.clubId))
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_bans')) throw err
          bannedClubIds = new Set<string>()
        }
      }

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
        // Only count public/published events as "upcoming" for discovery.
        where.tournaments = { some: { endDate: { gte: now }, isPublicBoardEnabled: true } }
      }

      const clubs = await ctx.prisma.club.findMany({
        where,
        orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          kind: true,
          joinPolicy: true,
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
          admins: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          joinRequests: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          tournaments: {
            // Include both upcoming and currently running tournaments.
            where: { endDate: { gte: now }, isPublicBoardEnabled: true },
            orderBy: { startDate: 'asc' },
            take: 1,
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              timezone: true,
              publicSlug: true,
              entryFeeCents: true,
            },
          },
        },
      })

      const visibleClubs =
        bannedClubIds.size > 0 ? clubs.filter((club) => !bannedClubIds.has(club.id)) : clubs

      return visibleClubs.map((club) => ({
        id: club.id,
        name: club.name,
        kind: club.kind,
        joinPolicy: club.joinPolicy ?? 'OPEN',
        logoUrl: club.logoUrl,
        address: club.address,
        city: club.city,
        state: club.state,
        isVerified: club.isVerified,
        hasBooking: Boolean(club.courtReserveUrl),
        followersCount: club._count.followers,
        tournamentsCount: club._count.tournaments,
        isFollowing: club.followers.length > 0 && userId !== DUMMY_USER_ID,
        isAdmin: club.admins.length > 0 && userId !== DUMMY_USER_ID,
        isJoinPending: (club.joinRequests?.length ?? 0) > 0 && userId !== DUMMY_USER_ID,
        nextTournament: club.tournaments[0] ?? null,
      }))
    }),

  listMyChatClubs: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const clubs = await ctx.prisma.club.findMany({
      where: {
        OR: [
          { followers: { some: { userId } } },
          { admins: { some: { userId } } },
        ],
        bans: {
          none: {
            userId,
          },
        },
      },
      orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        kind: true,
        joinPolicy: true,
        logoUrl: true,
        city: true,
        state: true,
        isVerified: true,
        followers: {
          where: { userId },
          select: { id: true },
          take: 1,
        },
        admins: {
          where: { userId },
          select: { id: true },
          take: 1,
        },
      },
    })

    return clubs.map((club) => ({
      id: club.id,
      name: club.name,
      kind: club.kind,
      joinPolicy: club.joinPolicy ?? 'OPEN',
      logoUrl: club.logoUrl,
      city: club.city,
      state: club.state,
      isVerified: club.isVerified,
      isFollowing: club.followers.length > 0,
      isAdmin: club.admins.length > 0,
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
          joinPolicy: true,
          description: true,
          logoUrl: true,
          address: true,
          city: true,
          state: true,
          country: true,
          isVerified: true,
          courtReserveUrl: true,
          bookingRequestEmail: true,
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
            where: { endDate: { gte: now }, isPublicBoardEnabled: true },
            orderBy: { startDate: 'asc' },
            take: 20,
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              timezone: true,
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
              updatedAt: true,
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
      let isBanned = false
      if (userId !== DUMMY_USER_ID) {
        try {
          const ban = await ctx.prisma.clubBan.findUnique({
            where: { clubId_userId: { clubId: input.id, userId } },
            select: { id: true },
          })
          isBanned = Boolean(ban)
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_bans')) throw err
        }
      }

      if (isBanned) {
        // Hide existence for banned users.
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      let isJoinPending = false
      if (!isBanned && userId !== DUMMY_USER_ID && club.joinPolicy === 'APPROVAL') {
        try {
          const req = await ctx.prisma.clubJoinRequest.findUnique({
            where: { clubId_userId: { clubId: input.id, userId } },
            select: { id: true },
          })
          isJoinPending = Boolean(req)
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_join_requests')) throw err
        }
      }

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
        isFollowing: !isBanned && club.followers.length > 0 && userId !== DUMMY_USER_ID,
        isJoinPending:
          !isBanned && club.followers.length === 0 && userId !== DUMMY_USER_ID ? isJoinPending : false,
        isAdmin,
        bookingRequests,
        isBanned,
      }
    }),

  toggleFollow: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { id: true, joinPolicy: true },
      })

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      const [existing, adminRole] = await Promise.all([
        ctx.prisma.clubFollower.findUnique({
          where: {
            clubId_userId: {
              clubId: input.clubId,
              userId,
            },
          },
          select: { id: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: {
            clubId_userId: {
              clubId: input.clubId,
              userId,
            },
          },
          select: { id: true },
        }),
      ])

      // Club admins are implicit members; don't allow join/leave toggle for them.
      if (adminRole) {
        return { isFollowing: true, isJoinPending: false, status: 'admin' as const }
      }

      if (existing) {
        await ctx.prisma.clubFollower.delete({ where: { id: existing.id } })
        // Best-effort cleanup in case a join request exists.
        try {
          await ctx.prisma.clubJoinRequest.deleteMany({
            where: { clubId: input.clubId, userId },
          })
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_join_requests')) throw err
        }
        return { isFollowing: false, isJoinPending: false, status: 'left' as const }
      }

      // If banned, block joining/requesting.
      try {
        const ban = await ctx.prisma.clubBan.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId } },
          select: { id: true },
        })
        if (ban) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You are banned from this club' })
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (!isMissingDbRelation(err, 'club_bans')) throw err
      }

      if (club.joinPolicy === 'APPROVAL') {
        try {
          await ctx.prisma.clubJoinRequest.upsert({
            where: { clubId_userId: { clubId: input.clubId, userId } },
            create: { clubId: input.clubId, userId },
            update: {},
          })
        } catch (err: any) {
          if (isMissingDbRelation(err, 'club_join_requests')) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'club_join_requests table is missing. Apply DB migration first.',
            })
          }
          throw err
        }

        return { isFollowing: false, isJoinPending: true, status: 'pending' as const }
      }

      await ctx.prisma.clubFollower.create({
        data: {
          clubId: input.clubId,
          userId,
        },
      })

      // Best-effort cleanup: open clubs should not have join requests.
      try {
        await ctx.prisma.clubJoinRequest.deleteMany({
          where: { clubId: input.clubId, userId },
        })
      } catch (err: any) {
        if (!isMissingDbRelation(err, 'club_join_requests')) throw err
      }

      return { isFollowing: true, isJoinPending: false, status: 'joined' as const }
    }),

  cancelJoinRequest: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { id: true },
      })
      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      try {
        await ctx.prisma.clubJoinRequest.deleteMany({
          where: { clubId: input.clubId, userId },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_join_requests')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_join_requests table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      return { success: true }
    }),

  create: protectedProcedure.input(clubCreateInput).mutation(async ({ ctx, input }) => {
    try {
      const club = await ctx.prisma.club.create({
        data: {
          name: input.name.trim(),
          kind: input.kind,
          joinPolicy: input.joinPolicy,
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
        select: {
          id: true,
        },
      })

      return club
    } catch (err: any) {
      if (isMissingDbColumn(err, 'join_policy')) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'clubs.join_policy column is missing. Apply DB migration first.',
        })
      }
      throw err
    }
  }),

  update: protectedProcedure.input(clubUpdateInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id

    const isAdmin = await ctx.prisma.clubAdmin.findUnique({
      where: { clubId_userId: { clubId: input.id, userId } },
      select: { id: true },
    })
    if (!isAdmin) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can edit this club' })
    }

    try {
      const club = await ctx.prisma.club.update({
        where: { id: input.id },
        data: {
          name: input.name.trim(),
          kind: input.kind,
          joinPolicy: input.joinPolicy,
          description: input.description?.trim() || null,
          logoUrl: input.logoUrl?.trim() || null,
          address: input.address?.trim() || null,
          city: input.city?.trim() || null,
          state: input.state?.trim() || null,
          country: input.country?.trim() || null,
          courtReserveUrl: input.courtReserveUrl?.trim() || null,
          bookingRequestEmail: input.bookingRequestEmail?.trim() || null,
        },
        select: { id: true },
      })

      return club
    } catch (err: any) {
      if (isMissingDbColumn(err, 'join_policy')) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'clubs.join_policy column is missing. Apply DB migration first.',
        })
      }
      throw err
    }
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

  updateAnnouncement: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        announcementId: z.string(),
        title: z.string().max(120).optional(),
        body: z.string().min(1).max(4000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can edit announcements' })
      }

      const existing = await ctx.prisma.clubAnnouncement.findUnique({
        where: { id: input.announcementId },
        select: { id: true, clubId: true },
      })
      if (!existing || existing.clubId !== input.clubId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' })
      }

      const updated = await ctx.prisma.clubAnnouncement.update({
        where: { id: input.announcementId },
        data: {
          title: input.title?.trim() || null,
          body: input.body.trim(),
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

      return updated
    }),

  deleteAnnouncement: protectedProcedure
    .input(z.object({ clubId: z.string(), announcementId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can delete announcements' })
      }

      const existing = await ctx.prisma.clubAnnouncement.findUnique({
        where: { id: input.announcementId },
        select: { id: true, clubId: true },
      })
      if (!existing || existing.clubId !== input.clubId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' })
      }

      await ctx.prisma.clubAnnouncement.delete({ where: { id: input.announcementId } })
      return { success: true }
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

  sendInvite: protectedProcedure
    .input(
      z
        .object({
          clubId: z.string(),
          inviteeUserId: z.string().optional(),
          inviteeEmail: z.string().email().optional(),
        })
        .refine((v) => Boolean(v.inviteeUserId || v.inviteeEmail), {
          message: 'Invitee is required',
        })
    )
    .mutation(async ({ ctx, input }) => {
      const inviterUserId = ctx.session.user.id

      const [club, adminRole] = await Promise.all([
        ctx.prisma.club.findUnique({
          where: { id: input.clubId },
          select: { id: true, name: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: inviterUserId } },
          select: { id: true, role: true },
        }),
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      // Email invites are admin/moderator-only to prevent spam.
      if (!adminRole) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can send email invites' })
      }

      if (input.inviteeUserId && input.inviteeUserId === inviterUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot invite yourself' })
      }

      let toEmail = input.inviteeEmail?.trim() || null
      let toName: string | null = null

      if (input.inviteeUserId) {
        const user = await ctx.prisma.user.findUnique({
          where: { id: input.inviteeUserId },
          select: { email: true, name: true },
        })
        if (!user?.email) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'User email not found' })
        }
        toEmail = user.email
        toName = user.name ?? null

        const alreadyJoined = await ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: club.id, userId: input.inviteeUserId } },
          select: { id: true },
        })
        if (alreadyJoined) {
          return { success: true, delivered: false, reason: 'already_joined' as const }
        }
      }

      if (!toEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitee email is required' })
      }

      const baseUrlRaw =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
        ''
      const baseUrl = baseUrlRaw.replace(/\/$/, '')
      if (!baseUrl) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'App URL is not configured (NEXT_PUBLIC_APP_URL)',
        })
      }

      const inviteUrl = `${baseUrl}/clubs/${club.id}?ref=invite`

      // Rate limiting (requires club_invites table; safe to skip if migration isn't applied yet).
      const invitesPerDay = 20
      const invitesPerMinute = 5
      const now = new Date()
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const minuteAgo = new Date(now.getTime() - 60 * 1000)

      try {
        const [countDay, countMin] = await Promise.all([
          ctx.prisma.clubInvite.count({
            where: { clubId: club.id, inviterUserId, createdAt: { gte: dayAgo } },
          }),
          ctx.prisma.clubInvite.count({
            where: { clubId: club.id, inviterUserId, createdAt: { gte: minuteAgo } },
          }),
        ])

        if (countDay >= invitesPerDay || countMin >= invitesPerMinute) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `Invite limit reached (${invitesPerDay}/day, ${invitesPerMinute}/minute).`,
          })
        }

        const recentDuplicate = await ctx.prisma.clubInvite.findFirst({
          where: { clubId: club.id, inviteeEmail: toEmail, createdAt: { gte: dayAgo } },
          select: { id: true },
        })
        if (recentDuplicate) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This email was already invited recently.' })
        }
      } catch (err: any) {
        const msg = String(err?.message ?? '')
        // If the table doesn't exist yet (migration not applied), skip rate limiting for now.
        if (!msg.toLowerCase().includes('club_invites') && !msg.toLowerCase().includes('does not exist')) {
          throw err
        }
      }

      const emailHost = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST
      const emailUser = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER || 'Piqle'
      const emailPassword = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD
      const emailPort = process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || '587'

      // Persist invite attempt (best effort; safe to skip if migration isn't applied yet).
      let inviteId: string | null = null
      try {
        const invite = await ctx.prisma.clubInvite.create({
          data: {
            clubId: club.id,
            inviterUserId,
            inviteeUserId: input.inviteeUserId ?? null,
            inviteeEmail: toEmail,
            delivered: false,
          },
          select: { id: true },
        })
        inviteId = invite.id
      } catch (err: any) {
        const msg = String(err?.message ?? '')
        if (!msg.toLowerCase().includes('club_invites') && !msg.toLowerCase().includes('does not exist')) {
          throw err
        }
      }

      if (!emailHost || !emailPassword) {
        // In development, don't block flows if SMTP isn't configured yet.
        if (process.env.NODE_ENV === 'development') {
          console.log('[club.sendInvite] SMTP not configured. Would send invite:', {
            toEmail,
            clubId: club.id,
            clubName: club.name,
            inviteUrl,
          })
          return { success: true, delivered: false, reason: 'smtp_missing' as const }
        }

        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Email is not configured (SMTP_HOST/SMTP_PASS).',
        })
      }

      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.default.createTransport({
        host: emailHost,
        port: parseInt(emailPort),
        secure: String(emailPort) === '465',
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      })

      const fromEmail = process.env.SMTP_FROM || process.env.EMAIL_FROM || emailUser
      const fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Piqle'
      const fromAddress = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail

      const inviterName = ctx.session.user.name || 'Someone'
      const subject = `${inviterName} invited you to join ${club.name} on Piqle`
      const greeting = toName ? `Hi ${toName},` : 'Hi,'
      const text = `${greeting}

${inviterName} invited you to join the club "${club.name}" on Piqle.

Join here: ${inviteUrl}

If you weren’t expecting this, you can ignore this email.`

      await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject,
        text,
      })

      if (inviteId) {
        try {
          await ctx.prisma.clubInvite.update({
            where: { id: inviteId },
            data: { delivered: true },
          })
        } catch (err: any) {
          const msg = String(err?.message ?? '')
          if (!msg.toLowerCase().includes('club_invites') && !msg.toLowerCase().includes('does not exist')) {
            throw err
          }
        }
      }

      return { success: true, delivered: true, reason: null as null }
    }),

  listMembers: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const [myAdminRole, myFollow] = await Promise.all([
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
          select: { role: true },
        }),
        ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
          select: { id: true },
        }),
      ])

      const canModerate = Boolean(myAdminRole)
      const canView = canModerate || Boolean(myFollow)
      if (!canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to view members' })
      }

      const [followers, admins] = await Promise.all([
        ctx.prisma.clubFollower.findMany({
          where: { clubId: input.clubId },
          orderBy: { createdAt: 'desc' },
          take: 500,
          select: {
            userId: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                email: true, // only used to compute masked value
              },
            },
          },
        }),
        ctx.prisma.clubAdmin.findMany({
          where: { clubId: input.clubId },
          select: {
            userId: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                email: true, // only used to compute masked value
              },
            },
          },
        }),
      ])

      const adminRoleByUserId = new Map(admins.map((a) => [a.userId, a.role] as const))
      const memberByUserId = new Map<
        string,
        {
          userId: string
          joinedAt: Date
          role: string | null
          user: {
            id: string
            name: string | null
            image: string | null
            emailMasked: string | null
          }
        }
      >()

      for (const follower of followers) {
        memberByUserId.set(follower.userId, {
          userId: follower.userId,
          joinedAt: follower.createdAt,
          role: adminRoleByUserId.get(follower.userId) ?? null,
          user: {
            id: follower.user.id,
            name: follower.user.name,
            image: follower.user.image,
            emailMasked: maskEmail(follower.user.email),
          },
        })
      }

      for (const admin of admins) {
        if (memberByUserId.has(admin.userId)) continue
        memberByUserId.set(admin.userId, {
          userId: admin.userId,
          joinedAt: admin.createdAt,
          role: admin.role,
          user: {
            id: admin.user.id,
            name: admin.user.name,
            image: admin.user.image,
            emailMasked: maskEmail(admin.user.email),
          },
        })
      }

      const members = Array.from(memberByUserId.values()).sort(
        (a, b) => b.joinedAt.getTime() - a.joinedAt.getTime()
      )

      let bans: Array<{
        userId: string
        reason: string | null
        createdAt: Date
        user: { id: string; name: string | null; image: string | null; email: string }
        bannedByUserId: string
        bannedByUser: { id: string; name: string | null; image: string | null }
      }> = []

      if (canModerate) {
        try {
          bans = await ctx.prisma.clubBan.findMany({
            where: { clubId: input.clubId },
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
              userId: true,
              reason: true,
              createdAt: true,
              bannedByUserId: true,
              user: { select: { id: true, name: true, image: true, email: true } },
              bannedByUser: { select: { id: true, name: true, image: true } },
            },
          })
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_bans')) throw err
          bans = []
        }
      }

      let joinRequests: Array<{
        userId: string
        createdAt: Date
        user: { id: string; name: string | null; image: string | null; email: string }
      }> = []

      if (canModerate) {
        try {
          joinRequests = await ctx.prisma.clubJoinRequest.findMany({
            where: { clubId: input.clubId },
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
              userId: true,
              createdAt: true,
              user: { select: { id: true, name: true, image: true, email: true } },
            },
          })
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_join_requests')) throw err
          joinRequests = []
        }
      }

      return {
        canModerate,
        myRole: myAdminRole?.role ?? null,
        members,
        bans: bans.map((b) => ({
          userId: b.userId,
          bannedAt: b.createdAt,
          reason: b.reason ?? null,
          user: {
            id: b.user.id,
            name: b.user.name,
            image: b.user.image,
            emailMasked: maskEmail(b.user.email),
          },
          bannedBy: {
            userId: b.bannedByUserId,
            name: b.bannedByUser.name,
            image: b.bannedByUser.image,
          },
        })),
        joinRequests: joinRequests.map((r) => ({
          userId: r.userId,
          requestedAt: r.createdAt,
          user: {
            id: r.user.id,
            name: r.user.name,
            image: r.user.image,
            emailMasked: maskEmail(r.user.email),
          },
        })),
      }
    }),

  kickMember: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can remove members' })
      }

      if (input.userId === currentUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot remove yourself' })
      }

      await ctx.prisma.clubFollower.deleteMany({
        where: { clubId: input.clubId, userId: input.userId },
      })

      return { success: true }
    }),

  approveJoinRequest: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can approve requests' })
      }

      // If the user is banned, don't allow approval.
      try {
        const ban = await ctx.prisma.clubBan.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          select: { id: true },
        })
        if (ban) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This user is banned from the club' })
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (!isMissingDbRelation(err, 'club_bans')) throw err
      }

      let req: { id: string } | null = null
      try {
        req = await ctx.prisma.clubJoinRequest.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          select: { id: true },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_join_requests')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_join_requests table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      if (!req) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Join request not found' })
      }

      await ctx.prisma.$transaction([
        ctx.prisma.clubFollower.upsert({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          create: { clubId: input.clubId, userId: input.userId },
          update: {},
        }),
        ctx.prisma.clubJoinRequest.delete({ where: { id: req.id } }),
      ])

      return { success: true }
    }),

  rejectJoinRequest: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can reject requests' })
      }

      try {
        await ctx.prisma.clubJoinRequest.deleteMany({
          where: { clubId: input.clubId, userId: input.userId },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_join_requests')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_join_requests table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      return { success: true }
    }),

  banUser: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        userId: z.string(),
        reason: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can ban users' })
      }

      if (input.userId === currentUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot ban yourself' })
      }

      const targetIsAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
        select: { id: true },
      })
      if (targetIsAdmin) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot ban a club admin/moderator. Remove admin role first.',
        })
      }

      const reason = input.reason?.trim() || null

      try {
        await ctx.prisma.$transaction([
          ctx.prisma.clubBan.upsert({
            where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
            create: {
              clubId: input.clubId,
              userId: input.userId,
              bannedByUserId: currentUserId,
              reason,
            },
            update: {
              bannedByUserId: currentUserId,
              reason,
            },
          }),
          ctx.prisma.clubFollower.deleteMany({
            where: { clubId: input.clubId, userId: input.userId },
          }),
        ])
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_bans')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_bans table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      // Best-effort cleanup: banned users shouldn't have pending join requests.
      try {
        await ctx.prisma.clubJoinRequest.deleteMany({
          where: { clubId: input.clubId, userId: input.userId },
        })
      } catch (err: any) {
        if (!isMissingDbRelation(err, 'club_join_requests')) throw err
      }

      return { success: true }
    }),

  unbanUser: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can unban users' })
      }

      try {
        await ctx.prisma.clubBan.deleteMany({
          where: { clubId: input.clubId, userId: input.userId },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_bans')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_bans table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      return { success: true }
    }),
})
