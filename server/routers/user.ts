import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

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
      city: z.string().optional(),
      duprLink: z.string().url().optional().or(z.literal('')),
    }))
    .mutation(async ({ ctx, input }) => {
      const updatedUser = await ctx.prisma.user.update({
        where: {
          id: ctx.session.user.id,
        },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.duprLink !== undefined && { 
            duprLink: input.duprLink === '' ? null : input.duprLink 
          }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          city: true,
          duprLink: true,
          role: true,
        },
      })

      return updatedUser
    }),
})

