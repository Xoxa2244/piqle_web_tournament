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
          duprLink: true,
          duprId: true,
          duprRatingSingles: true,
          duprRatingDoubles: true,
          role: true,
        },
      })

      if (!user) {
        throw new Error('User not found')
      }

      return {
        ...user,
        duprLinked: !!user.duprId,
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
        },
      })

      if (!user) {
        throw new Error('User not found')
      }

      return user
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
