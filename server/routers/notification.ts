import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20
      const userId = ctx.session.user.id

      const [pendingInvitations, unreadCount] = await Promise.all([
        ctx.prisma.tournamentInvitation.findMany({
          where: {
            invitedUserId: userId,
            status: 'PENDING',
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            createdAt: true,
            tournament: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        }),
        ctx.prisma.tournamentInvitation.count({
          where: {
            invitedUserId: userId,
            status: 'PENDING',
          },
        }),
      ])

      return {
        unreadCount,
        items: pendingInvitations.map((inv) => ({
          id: `tournament-invitation-${inv.id}`,
          type: 'TOURNAMENT_INVITATION' as const,
          title: 'Tournament invitation',
          body: `You were invited to "${inv.tournament.title}".`,
          createdAt: inv.createdAt.toISOString(),
          readAt: null as string | null,
          invitationId: inv.id,
          tournamentId: inv.tournament.id,
          targetUrl: `/?open=${inv.tournament.id}`,
        })),
      }
    }),

  markAllRead: protectedProcedure.mutation(async () => {
    // Base scaffold: no-op until notification storage is introduced.
    return { success: true }
  }),
})
