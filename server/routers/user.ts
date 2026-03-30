import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'

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
          gender: true,
          city: true,
          phone: true,
          smsOptIn: true,
          duprLink: true,
          duprId: true,
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

      const { _count, ...rest } = user
      return {
        ...rest,
        duprLinked: !!user.duprId,
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

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      city: z.string().optional(),
      duprLink: z.string().url().optional().or(z.literal('')),
      image: z.string().url().optional(),
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
          ...(input.image !== undefined && { image: input.image }),
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
})
