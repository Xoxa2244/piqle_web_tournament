import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

function isMissingDbRelation(err: unknown, relationName: string): boolean {
  const msg = String((err as Error)?.message ?? '').toLowerCase()
  return msg.includes(relationName.toLowerCase()) && msg.includes('does not exist')
}

function getReminderAt(metadata: unknown): Date | null {
  if (!metadata || typeof metadata !== 'object') return null
  const remindAt = (metadata as Record<string, unknown>).remindAt
  if (typeof remindAt !== 'string') return null
  const parsed = new Date(remindAt)
  return Number.isNaN(parsed.getTime()) ? null : parsed
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
      let adminReminderItems: Array<{
        id: string
        type: 'AGENT_ADMIN_REMINDER'
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
          const [requestsByClub, clubs] = await Promise.all([
            ctx.prisma.clubJoinRequest.groupBy({
              by: ['clubId'],
              where: { clubId: { in: clubIds } },
              _count: { id: true },
              _max: { createdAt: true },
            }),
            ctx.prisma.club.findMany({
              where: { id: { in: clubIds } },
              select: { id: true, name: true },
            }),
          ])
          let seenMap = new Map<string, Date>()
          try {
            const seenByClub = await ctx.prisma.clubJoinRequestSeen.findMany({
              where: { userId, clubId: { in: clubIds } },
              select: { clubId: true, seenAt: true },
            })
            seenMap = new Map(seenByClub.map((s) => [s.clubId, s.seenAt]))
          } catch (errSeen) {
            if (!isMissingDbRelation(errSeen, 'club_join_request_seen')) throw errSeen
          }
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
          if (!isMissingDbRelation(err, 'club_join_requests')) throw err
        }

        try {
          const clubs = await ctx.prisma.club.findMany({
            where: { id: { in: clubIds } },
            select: { id: true, name: true },
          })
          const clubByNameId = new Map(clubs.map((c) => [c.id, c]))
          const dueAdminTodoDecisions = await ctx.prisma.agentAdminTodoDecision.findMany({
            where: {
              clubId: { in: clubIds },
              userId,
              decision: 'not_now',
              updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
            select: {
              clubId: true,
              dateKey: true,
              itemId: true,
              title: true,
              href: true,
              metadata: true,
              updatedAt: true,
            },
          })
          const now = Date.now()
          for (const item of dueAdminTodoDecisions) {
            const remindAt = getReminderAt(item.metadata)
            if (!remindAt || remindAt.getTime() > now) continue
            const club = clubByNameId.get(item.clubId)
            if (!club) continue
            const metadata = item.metadata as Record<string, unknown> | null
            const description = typeof metadata?.description === 'string' ? metadata.description : null
            adminReminderItems.push({
              id: `agent-admin-reminder-${item.clubId}-${item.dateKey}-${item.itemId}`,
              type: 'AGENT_ADMIN_REMINDER',
              title: item.title,
              body: description || `A snoozed agent task for "${club.name}" is ready again.`,
              createdAt: remindAt.toISOString(),
              readAt: null,
              clubId: item.clubId,
              clubName: club.name,
              targetUrl: item.href,
            })
          }
        } catch (err) {
          if (!isMissingDbRelation(err, 'agent_admin_todo_decisions')) throw err
        }
      }

      const allItems = [
        ...invitationItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...clubJoinItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...adminReminderItems.map((i) => ({ ...i, _sort: i.createdAt })),
      ].sort((a, b) => (b._sort > a._sort ? 1 : -1))
      const items = allItems.slice(0, limit).map(({ _sort, ...rest }) => rest)

      return {
        unreadCount: invitationCount + clubJoinItems.length + adminReminderItems.length,
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
