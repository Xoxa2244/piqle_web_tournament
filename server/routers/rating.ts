import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const ratingRouter = createTRPCRouter({
  // Get rating for a tournament (public, but includes user's rating if authenticated)
  getTournamentRating: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const likes = await ctx.prisma.tournamentRating.count({
        where: {
          tournamentId: input.tournamentId,
          rating: 'LIKE',
        },
      })

      const dislikes = await ctx.prisma.tournamentRating.count({
        where: {
          tournamentId: input.tournamentId,
          rating: 'DISLIKE',
        },
      })

      const karma = likes - dislikes

      let userRating: 'LIKE' | 'DISLIKE' | null = null
      if (ctx.session?.user?.id) {
        const rating = await ctx.prisma.tournamentRating.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: input.tournamentId,
            },
          },
        })
        userRating = rating?.rating || null
      }

      return {
        likes,
        dislikes,
        karma,
        userRating,
      }
    }),

  // Get ratings for multiple tournaments
  getTournamentRatings: publicProcedure
    .input(z.object({ tournamentIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      if (input.tournamentIds.length === 0) {
        return {}
      }

      const ratings = await ctx.prisma.tournamentRating.groupBy({
        by: ['tournamentId', 'rating'],
        where: {
          tournamentId: { in: input.tournamentIds },
        },
        _count: true,
      })

      const userRatings = ctx.session?.user?.id
        ? await ctx.prisma.tournamentRating.findMany({
            where: {
              tournamentId: { in: input.tournamentIds },
              userId: ctx.session.user.id,
            },
          })
        : []

      const result: Record<
        string,
        { likes: number; dislikes: number; karma: number; userRating: 'LIKE' | 'DISLIKE' | null }
      > = {}

      input.tournamentIds.forEach((tournamentId) => {
        const likes =
          ratings.find((r) => r.tournamentId === tournamentId && r.rating === 'LIKE')?._count || 0
        const dislikes =
          ratings.find((r) => r.tournamentId === tournamentId && r.rating === 'DISLIKE')?._count ||
          0
        const userRating =
          userRatings.find((r) => r.tournamentId === tournamentId)?.rating || null

        result[tournamentId] = {
          likes,
          dislikes,
          karma: likes - dislikes,
          userRating,
        }
      })

      return result
    }),

  // Toggle rating (like/dislike/remove)
  toggleRating: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        rating: z.enum(['LIKE', 'DISLIKE']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const existingRating = await ctx.prisma.tournamentRating.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: input.tournamentId,
            },
          },
        })

        if (existingRating) {
          if (existingRating.rating === input.rating) {
            // Remove rating if clicking the same one
            await ctx.prisma.tournamentRating.delete({
              where: {
                userId_tournamentId: {
                  userId: ctx.session.user.id,
                  tournamentId: input.tournamentId,
                },
              },
            })
            return { action: 'removed' as const, rating: null }
          } else {
            // Update rating if clicking different one
            const updated = await ctx.prisma.tournamentRating.update({
              where: {
                userId_tournamentId: {
                  userId: ctx.session.user.id,
                  tournamentId: input.tournamentId,
                },
              },
              data: {
                rating: input.rating,
              },
            })
            return { action: 'updated' as const, rating: updated.rating }
          }
        } else {
          // Create new rating
          const created = await ctx.prisma.tournamentRating.create({
            data: {
              tournamentId: input.tournamentId,
              userId: ctx.session.user.id,
              rating: input.rating,
            },
          })
          return { action: 'created' as const, rating: created.rating }
        }
      } catch (error: any) {
        console.error('Error in toggleRating:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to toggle rating',
        })
      }
    }),
})

