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
      let feedbackPromptItems: Array<{
        id: string
        type: 'FEEDBACK_PROMPT'
        title: string
        body: string
        createdAt: string
        readAt: string | null
        targetUrl: string
        entityType: 'TOURNAMENT' | 'CLUB' | 'TD' | 'APP'
        entityId: string
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
      }

      try {
        const now = new Date()
        const tournamentCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000)
        const clubCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        const appCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        const [ratings, played, follows, me] = await Promise.all([
          ctx.prisma.feedback.findMany({
            where: { userId },
            select: { entityType: true, entityId: true },
          }),
          ctx.prisma.player.findMany({
            where: { userId },
            select: {
              tournament: {
                select: {
                  id: true,
                  title: true,
                  endDate: true,
                  clubId: true,
                  userId: true,
                },
              },
            },
          }),
          ctx.prisma.clubFollower.findMany({
            where: { userId },
            select: { clubId: true, createdAt: true },
          }),
          ctx.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
        ])
        const rated = new Set(ratings.map((r) => `${r.entityType}:${r.entityId}`))
        const seenTournament = new Set<string>()
        const seenClub = new Set<string>()
        for (const row of played) {
          const tournament = row.tournament
          if (!tournament) continue
          if (tournament.endDate <= tournamentCutoff) {
            if (!rated.has(`TOURNAMENT:${tournament.id}`) && !seenTournament.has(`TOURNAMENT:${tournament.id}`)) {
              seenTournament.add(`TOURNAMENT:${tournament.id}`)
              feedbackPromptItems.push({
                id: `feedback-prompt-tournament-${tournament.id}`,
                type: 'FEEDBACK_PROMPT',
                title: 'Rate tournament',
                body: `How was "${tournament.title}"?`,
                createdAt: tournament.endDate.toISOString(),
                readAt: null,
                targetUrl: `/tournaments/${tournament.id}`,
                entityType: 'TOURNAMENT',
                entityId: tournament.id,
              })
            }
            if (!rated.has(`TD:${tournament.userId}`) && !seenTournament.has(`TD:${tournament.userId}`)) {
              seenTournament.add(`TD:${tournament.userId}`)
              feedbackPromptItems.push({
                id: `feedback-prompt-td-${tournament.userId}-${tournament.id}`,
                type: 'FEEDBACK_PROMPT',
                title: 'Rate tournament director',
                body: `How did the director perform at "${tournament.title}"?`,
                createdAt: tournament.endDate.toISOString(),
                readAt: null,
                targetUrl: `/tournaments/${tournament.id}`,
                entityType: 'TD',
                entityId: tournament.userId,
              })
            }
          }
          if (tournament.clubId && !rated.has(`CLUB:${tournament.clubId}`) && !seenClub.has(tournament.clubId)) {
            seenClub.add(tournament.clubId)
            feedbackPromptItems.push({
              id: `feedback-prompt-club-event-${tournament.clubId}`,
              type: 'FEEDBACK_PROMPT',
              title: 'Rate club',
              body: 'You attended a club event. Share your feedback.',
              createdAt: tournament.endDate.toISOString(),
              readAt: null,
              targetUrl: `/clubs/${tournament.clubId}`,
              entityType: 'CLUB',
              entityId: tournament.clubId,
            })
          }
        }
        for (const follow of follows) {
          if (follow.createdAt > clubCutoff) continue
          if (rated.has(`CLUB:${follow.clubId}`) || seenClub.has(follow.clubId)) continue
          seenClub.add(follow.clubId)
          feedbackPromptItems.push({
            id: `feedback-prompt-club-joined-${follow.clubId}`,
            type: 'FEEDBACK_PROMPT',
            title: 'Rate club',
            body: 'You have been in this club for a few days. Share your feedback.',
            createdAt: follow.createdAt.toISOString(),
            readAt: null,
            targetUrl: `/clubs/${follow.clubId}`,
            entityType: 'CLUB',
            entityId: follow.clubId,
          })
        }
        if (me?.createdAt && me.createdAt <= appCutoff && !rated.has('APP:GLOBAL')) {
          feedbackPromptItems.push({
            id: 'feedback-prompt-app-global',
            type: 'FEEDBACK_PROMPT',
            title: 'Rate app experience',
            body: 'Tell us how your app experience is going.',
            createdAt: me.createdAt.toISOString(),
            readAt: null,
            targetUrl: '/profile',
            entityType: 'APP',
            entityId: 'GLOBAL',
          })
        }
      } catch (err) {
        if (!isMissingDbRelation(err, 'feedback')) throw err
      }

      const allItems = [
        ...invitationItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...clubJoinItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...feedbackPromptItems.map((i) => ({ ...i, _sort: i.createdAt })),
      ].sort((a, b) => (b._sort > a._sort ? 1 : -1))
      const items = allItems.slice(0, limit).map(({ _sort, ...rest }) => rest)

      return {
        unreadCount: invitationCount + clubJoinItems.length + feedbackPromptItems.length,
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
