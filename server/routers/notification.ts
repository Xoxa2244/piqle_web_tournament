import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

function isMissingDbRelation(err: unknown, relationName: string): boolean {
  const msg = String((err as Error)?.message ?? '').toLowerCase()
  return msg.includes(relationName.toLowerCase()) && msg.includes('does not exist')
}

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

      const [pendingInvitations, invitationCount, adminClubs] = await Promise.all([
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
        ctx.prisma.clubAdmin.findMany({
          where: { userId },
          select: { clubId: true },
        }),
      ])

      const invitationItems = pendingInvitations.map((inv) => ({
        id: `tournament-invitation-${inv.id}`,
        type: 'TOURNAMENT_INVITATION' as const,
        title: 'Tournament invitation',
        body: `You were invited to "${inv.tournament.title}".`,
        createdAt: inv.createdAt.toISOString(),
        readAt: null as string | null,
        invitationId: inv.id,
        tournamentId: inv.tournament.id,
        targetUrl: `/?open=${inv.tournament.id}`,
        clubId: null as string | null,
      }))

      let clubJoinItems: Array<{
        id: string
        type: 'CLUB_JOIN_REQUEST'
        title: string
        body: string
        createdAt: string
        readAt: string | null
        clubId: string
        clubName: string
        targetUrl: string
      }> = []
      const clubIds = adminClubs.map((a) => a.clubId)
      if (clubIds.length > 0) {
        try {
          const [requestsByClub, seenByClub] = await Promise.all([
            ctx.prisma.clubJoinRequest.groupBy({
              by: ['clubId'],
              where: { clubId: { in: clubIds } },
              _count: { id: true },
              _max: { createdAt: true },
            }),
            ctx.prisma.clubJoinRequestSeen.findMany({
              where: { userId, clubId: { in: clubIds } },
              select: { clubId: true, seenAt: true },
            }),
          ])
          const seenMap = new Map(seenByClub.map((s) => [s.clubId, s.seenAt]))
          const clubs = await ctx.prisma.club.findMany({
            where: { id: { in: clubIds } },
            select: { id: true, name: true },
          })
          const clubByNameId = new Map(clubs.map((c) => [c.id, c]))
          for (const r of requestsByClub) {
            if (r._count.id === 0 || !r._max.createdAt) continue
            const seenAt = seenMap.get(r.clubId)
            if (seenAt && r._max.createdAt <= seenAt) continue
            const club = clubByNameId.get(r.clubId)
            if (!club) continue
            clubJoinItems.push({
              id: `club-join-request-${r.clubId}`,
              type: 'CLUB_JOIN_REQUEST',
              title: 'Club join request',
              body: `${r._count.id} pending request${r._count.id === 1 ? '' : 's'} in "${club.name}".`,
              createdAt: r._max.createdAt.toISOString(),
              readAt: null,
              clubId: r.clubId,
              clubName: club.name,
              targetUrl: `/clubs/${r.clubId}?tab=members`,
            })
          }
        } catch (err) {
          if (!isMissingDbRelation(err, 'club_join_request_seen')) throw err
        }
      }

      const allItems = [
        ...invitationItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...clubJoinItems.map((i) => ({ ...i, _sort: i.createdAt })),
      ].sort((a, b) => (b._sort > a._sort ? 1 : -1))
      const items = allItems.slice(0, limit).map(({ _sort, ...rest }) => rest)

      return {
        unreadCount: invitationCount + clubJoinItems.length,
        items,
      }
    }),

  markClubJoinRequestSeen: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      try {
        await ctx.prisma.clubJoinRequestSeen.upsert({
          where: {
            userId_clubId: { userId, clubId: input.clubId },
          },
          create: { userId, clubId: input.clubId },
          update: { seenAt: new Date() },
        })
      } catch (err) {
        if (isMissingDbRelation(err, 'club_join_request_seen')) return { success: true }
        throw err
      }
      return { success: true }
    }),

  markAllRead: protectedProcedure.mutation(async () => {
    return { success: true }
  }),
})
