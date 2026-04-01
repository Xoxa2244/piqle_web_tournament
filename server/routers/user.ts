import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'

const notificationSettingsInput = z.object({
  tournamentUpdates: z.boolean().optional(),
  matchReminders: z.boolean().optional(),
  chatMessages: z.boolean().optional(),
  clubAnnouncements: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
})

const maskEmail = (email: string) => {
  try {
    const [localRaw, domainRaw] = email.split('@')
    const local = (localRaw ?? '').trim()
    const domain = (domainRaw ?? '').trim()
    if (!local || !domain) return '***'

    const localMasked = local.length <= 1 ? '*' : `${local[0]}***`
    const domainParts = domain.split('.').filter(Boolean)
    const tld = domainParts.length ? domainParts[domainParts.length - 1] : '***'
    const domainMain = domainParts.length > 1 ? domainParts.slice(0, -1).join('.') : domainParts[0] ?? ''
    const domainMasked = domainMain ? `${domainMain[0]}***` : '***'
    return `${localMasked}@${domainMasked}.${tld}`
  } catch {
    return '***'
  }
}

const decimalToNumber = (value: any): number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value?.toNumber === 'function') {
    const parsed = value.toNumber()
    return Number.isFinite(parsed) ? parsed : null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Public DUPR dashboard profile URL (numeric id from OAuth) or fallback search by DUPR code. */
const buildDuprWebProfileUrl = (opts: {
  duprLink: string | null | undefined
  duprId: string | null | undefined
  duprNumericId: bigint | null | undefined
}): string | null => {
  const manual = opts.duprLink?.trim()
  if (manual && /^https?:\/\//i.test(manual)) return manual

  const numeric =
    opts.duprNumericId != null && opts.duprNumericId !== undefined
      ? String(opts.duprNumericId)
      : null
  if (numeric && /^\d+$/.test(numeric)) {
    return `https://dashboard.dupr.com/dashboard/player/${numeric}/profile`
  }

  const code = opts.duprId?.trim()
  if (code && /^\d{6,}$/.test(code)) {
    return `https://dashboard.dupr.com/dashboard/player/${code}/profile`
  }
  if (code) {
    return `https://dashboard.dupr.com/dashboard/browse/players?search=${encodeURIComponent(code)}`
  }
  return null
}

export const userRouter = createTRPCRouter({
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(120),
      })
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim()
      if (!q) return []

      const users = await ctx.prisma.user.findMany({
        where: {
          isActive: true,
          id: { not: ctx.session.user.id },
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 8,
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          image: true,
          email: true, // Used to compute masked value; never return raw email.
        },
      })

      return users.map((u) => ({
        id: u.id,
        name: u.name,
        image: u.image,
        emailMasked: u.email ? maskEmail(u.email) : null,
      }))
    }),

  directory: protectedProcedure
    .input(
      z
        .object({
          query: z.string().max(120).optional(),
          city: z.string().max(120).optional(),
          hasDupr: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const query = input?.query?.trim()
      const city = input?.city?.trim()
      const limit = input?.limit ?? 100

      const andWhere: any[] = [{ isActive: true }]

      if (query) {
        andWhere.push({
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { email: { contains: query, mode: 'insensitive' as const } },
            { city: { contains: query, mode: 'insensitive' as const } },
          ],
        })
      }

      if (city) {
        andWhere.push({ city: { contains: city, mode: 'insensitive' as const } })
      }

      if (input?.hasDupr) {
        andWhere.push({
          OR: [
            { duprId: { not: null } },
            { duprRatingSingles: { not: null } },
            { duprRatingDoubles: { not: null } },
          ],
        })
      }

      const where = andWhere.length === 1 ? andWhere[0] : { AND: andWhere }

      const users = await ctx.prisma.user.findMany({
        where,
        take: limit,
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          image: true,
          city: true,
          gender: true,
          duprId: true,
          duprRatingSingles: true,
          duprRatingDoubles: true,
          _count: {
            select: {
              clubFollows: true,
              players: true,
              tournaments: true,
            },
          },
        },
      })

      return users.map((u) => {
        const singles = decimalToNumber(u.duprRatingSingles)
        const doubles = decimalToNumber(u.duprRatingDoubles)
        return {
          id: u.id,
          name: u.name,
          image: u.image,
          city: u.city,
          gender: u.gender,
          duprRatingSingles: singles,
          duprRatingDoubles: doubles,
          hasDupr: Boolean(u.duprId || singles !== null || doubles !== null),
          clubsJoinedCount: u._count.clubFollows,
          tournamentsPlayedCount: u._count.players,
          tournamentsCreatedCount: u._count.tournaments,
        }
      })
    }),

  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.prisma.user.findUnique({
        where: {
          id: ctx.session.user.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
          gender: true,
          city: true,
          duprLink: true,
          duprId: true,
          duprNumericId: true,
          duprRatingSingles: true,
          duprRatingDoubles: true,
          role: true,
          organizerTier: true,
          _count: {
            select: {
              clubFollows: true,
              players: true,
              tournaments: true,
            },
          },
        },
      })

      if (!user) {
        throw new Error('User not found')
      }

      const { _count, duprNumericId: _duprNum, ...rest } = user
      const duprWebProfileUrl = buildDuprWebProfileUrl({
        duprLink: user.duprLink,
        duprId: user.duprId,
        duprNumericId: user.duprNumericId,
      })
      return {
        ...rest,
        duprLinked: !!user.duprId || user.duprNumericId != null,
        duprWebProfileUrl,
        clubsJoinedCount: _count.clubFollows,
        tournamentsPlayedCount: _count.players,
        tournamentsCreatedCount: _count.tournaments,
      }
    }),

  getProfileById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: {
          id: input.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
          gender: true,
          city: true,
          duprLink: true,
          role: true,
          duprRatingSingles: true,
          duprRatingDoubles: true,
          _count: {
            select: {
              clubFollows: true,
              players: true,
              tournaments: true,
            },
          },
        },
      })

      if (!user) {
        throw new Error('User not found')
      }

      const { _count, ...rest } = user
      return {
        ...rest,
        duprRatingSingles: decimalToNumber(rest.duprRatingSingles),
        duprRatingDoubles: decimalToNumber(rest.duprRatingDoubles),
        clubsJoinedCount: _count.clubFollows,
        tournamentsPlayedCount: _count.players,
        tournamentsCreatedCount: _count.tournaments,
      }
    }),

  linkDupr: protectedProcedure
    .input(
      z.object({
        duprId: z.string().optional(),
        numericId: z.number().int().optional(),
        accessToken: z.string().min(10),
        refreshToken: z.string().min(10),
        stats: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Parse ratings if included in DUPR postMessage payload.
      const parseRating = (value: any): number | null => {
        if (value === undefined || value === null) return null
        const str = String(value).trim()
        if (!str || str === 'NR' || str.toLowerCase() === 'not rated') return null
        const parsed = parseFloat(str)
        return Number.isFinite(parsed) ? parsed : null
      }

      let duprRatingSingles: number | null = null
      let duprRatingDoubles: number | null = null
      const stats = input.stats
      if (stats && typeof stats === 'object') {
        duprRatingSingles =
          parseRating((stats as any).singlesRating) ??
          parseRating((stats as any).singles) ??
          parseRating((stats as any).ratings?.singles) ??
          parseRating((stats as any).stats?.singlesRating) ??
          parseRating((stats as any).stats?.singles) ??
          null

        duprRatingDoubles =
          parseRating((stats as any).doublesRating) ??
          parseRating((stats as any).doubles) ??
          parseRating((stats as any).ratings?.doubles) ??
          parseRating((stats as any).stats?.doublesRating) ??
          parseRating((stats as any).stats?.doubles) ??
          null
      }

      const updated = await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          duprId: input.duprId || undefined,
          duprNumericId: input.numericId != null ? BigInt(input.numericId) : undefined,
          duprAccessToken: input.accessToken,
          duprRefreshToken: input.refreshToken,
          duprRatingSingles,
          duprRatingDoubles,
        },
        select: {
          id: true,
          duprId: true,
          duprNumericId: true,
          duprLink: true,
          duprRatingSingles: true,
          duprRatingDoubles: true,
        },
      })

      return {
        success: true,
        duprId: updated.duprId,
        duprLinked: Boolean(updated.duprId) || updated.duprNumericId != null,
        duprWebProfileUrl: buildDuprWebProfileUrl({
          duprLink: updated.duprLink,
          duprId: updated.duprId,
          duprNumericId: updated.duprNumericId,
        }),
        duprRatingSingles: decimalToNumber(updated.duprRatingSingles),
        duprRatingDoubles: decimalToNumber(updated.duprRatingDoubles),
      }
    }),

  unlinkDupr: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id
      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          duprId: null,
          duprNumericId: null,
          duprAccessToken: null,
          duprRefreshToken: null,
          duprRatingSingles: null,
          duprRatingDoubles: null,
        },
        select: { id: true },
      })
      return { success: true }
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      city: z.string().optional(),
      duprLink: z.string().url().optional().or(z.literal('')),
      image: z.string().url().optional().or(z.literal('')),
    }))
    .mutation(async ({ ctx, input }) => {
      const updatedUser = await ctx.prisma.user.update({
        where: {
          id: ctx.session.user.id,
        },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.gender !== undefined && { gender: input.gender }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.duprLink !== undefined && { 
            duprLink: input.duprLink === '' ? null : input.duprLink 
          }),
          ...(input.image !== undefined && {
            image: input.image === '' ? null : input.image,
          }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          gender: true,
          city: true,
          duprLink: true,
          role: true,
        },
      })

      return updatedUser
    }),

  getNotificationSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          notifyTournamentUpdates: true,
          notifyMatchReminders: true,
          notifyChatMessages: true,
          notifyClubAnnouncements: true,
          notifyEmailNotifications: true,
          notifyPushNotifications: true,
        },
      })
      if (!user) throw new Error('User not found')
      return {
        tournamentUpdates: user.notifyTournamentUpdates,
        matchReminders: user.notifyMatchReminders,
        chatMessages: user.notifyChatMessages,
        clubAnnouncements: user.notifyClubAnnouncements,
        emailNotifications: user.notifyEmailNotifications,
        pushNotifications: user.notifyPushNotifications,
      }
    }),

  updateNotificationSettings: protectedProcedure
    .input(notificationSettingsInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...(input.tournamentUpdates !== undefined
            ? { notifyTournamentUpdates: input.tournamentUpdates }
            : {}),
          ...(input.matchReminders !== undefined
            ? { notifyMatchReminders: input.matchReminders }
            : {}),
          ...(input.chatMessages !== undefined
            ? { notifyChatMessages: input.chatMessages }
            : {}),
          ...(input.clubAnnouncements !== undefined
            ? { notifyClubAnnouncements: input.clubAnnouncements }
            : {}),
          ...(input.emailNotifications !== undefined
            ? { notifyEmailNotifications: input.emailNotifications }
            : {}),
          ...(input.pushNotifications !== undefined
            ? { notifyPushNotifications: input.pushNotifications }
            : {}),
        },
        select: {
          notifyTournamentUpdates: true,
          notifyMatchReminders: true,
          notifyChatMessages: true,
          notifyClubAnnouncements: true,
          notifyEmailNotifications: true,
          notifyPushNotifications: true,
        },
      })
      return {
        tournamentUpdates: updated.notifyTournamentUpdates,
        matchReminders: updated.notifyMatchReminders,
        chatMessages: updated.notifyChatMessages,
        clubAnnouncements: updated.notifyClubAnnouncements,
        emailNotifications: updated.notifyEmailNotifications,
        pushNotifications: updated.notifyPushNotifications,
      }
    }),
})
