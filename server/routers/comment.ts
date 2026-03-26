import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const commentRouter = createTRPCRouter({
  // Get comments for a tournament (public)
  getTournamentComments: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const comments = await ctx.prisma.tournamentComment.findMany({
        where: {
          tournamentId: input.tournamentId,
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
        orderBy: {
          createdAt: 'desc',
        },
      })

      return comments
    }),

  // Get comment count for a tournament (public)
  getTournamentCommentCount: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const count = await ctx.prisma.tournamentComment.count({
        where: {
          tournamentId: input.tournamentId,
        },
      })

      return count
    }),

  // Get comment counts for multiple tournaments (public)
  getTournamentCommentCounts: publicProcedure
    .input(z.object({ tournamentIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      if (input.tournamentIds.length === 0) {
        return {}
      }

      const counts = await ctx.prisma.tournamentComment.groupBy({
        by: ['tournamentId'],
        where: {
          tournamentId: { in: input.tournamentIds },
        },
        _count: true,
      })

      const result: Record<string, number> = {}
      input.tournamentIds.forEach((tournamentId) => {
        result[tournamentId] = 0
      })
      counts.forEach((count) => {
        result[count.tournamentId] = count._count
      })

      return result
    }),

  // Create a comment (protected - only logged in users)
  createComment: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        text: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify tournament exists and user can comment:
        // - public tournaments: anyone logged in
        // - private tournaments: only registered (active) participants
        const tournament = await ctx.prisma.tournament.findUnique({
          where: { id: input.tournamentId },
          select: { id: true, isPublicBoardEnabled: true },
        })

        if (!tournament) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Tournament not found',
          })
        }

        if (!tournament.isPublicBoardEnabled) {
          const player = await ctx.prisma.player.findUnique({
            where: {
              userId_tournamentId: {
                userId: ctx.session.user.id,
                tournamentId: input.tournamentId,
              },
            },
            include: {
              teamPlayers: {
                select: {
                  team: { select: { division: { select: { tournamentId: true } } } },
                },
              },
            },
          })

          const isActive =
            Boolean(player) &&
            Boolean(player?.teamPlayers?.some((tp: any) => tp.team?.division?.tournamentId === input.tournamentId))

          if (!isActive) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Only registered players can comment on this tournament',
            })
          }
        }

        const comment = await ctx.prisma.tournamentComment.create({
          data: {
            tournamentId: input.tournamentId,
            userId: ctx.session.user.id,
            text: input.text,
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

        return comment
      } catch (error: any) {
        console.error('Error in createComment:', error)
        throw new TRPCError({
          code: error.code || 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to create comment',
        })
      }
    }),

  // Delete a comment (protected - only comment author)
  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const comment = await ctx.prisma.tournamentComment.findUnique({
          where: { id: input.commentId },
        })

        if (!comment) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Comment not found',
          })
        }

        if (comment.userId !== ctx.session.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only delete your own comments',
          })
        }

        await ctx.prisma.tournamentComment.delete({
          where: { id: input.commentId },
        })

        return { success: true }
      } catch (error: any) {
        console.error('Error in deleteComment:', error)
        throw new TRPCError({
          code: error.code || 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to delete comment',
        })
      }
    }),
})

