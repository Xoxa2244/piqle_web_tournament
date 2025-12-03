import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'

export const userRouter = createTRPCRouter({
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
          role: true,
        },
      })

      if (!user) {
        throw new Error('User not found')
      }

      return user
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

