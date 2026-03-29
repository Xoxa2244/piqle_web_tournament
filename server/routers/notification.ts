import { z } from 'zod'
import { pushToUser } from '@/lib/realtime'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { buildExtraBellItems } from '../utils/bellNotificationItems'

const formatPromptDate = (value: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(value)

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
                image: true,
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
        tournamentImage: inv.tournament.image ?? null,
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
        userAvatarUrl: string | null
        requesterName: string
      }> = []
      let clubLeaveItems: Array<{
        id: string
        type: 'CLUB_MEMBER_LEFT'
        title: string
        body: string
        createdAt: string
        readAt: string | null
        clubId: string
        clubName: string
        targetUrl: string
        userAvatarUrl: string | null
        requesterName: string
      }> = []
      let clubOpenJoinItems: Array<{
        id: string
        type: 'CLUB_MEMBER_JOINED'
        title: string
        body: string
        createdAt: string
        readAt: string | null
        clubId: string
        clubName: string
        targetUrl: string
        userAvatarUrl: string | null
        requesterName: string
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
        avatarUrl: string | null
        context?: Record<string, unknown>
      }> = []
      const clubIds = adminClubs.map((a) => a.clubId)

      /** Pending join: через связь Club.admins (надёжнее, чем groupBy + clubId IN — совпадает с правами на странице клуба). */
      try {
        const joinRows = await ctx.prisma.clubJoinRequest.findMany({
          where: {
            club: {
              admins: { some: { userId } },
            },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            clubId: true,
            createdAt: true,
            user: { select: { image: true, name: true, email: true } },
          },
        })
        if (joinRows.length > 0) {
          const countByClub = new Map<string, number>()
          const maxAtByClub = new Map<string, Date>()
          const leadByClub = new Map<string, { image: string | null; label: string }>()
          for (const row of joinRows) {
            countByClub.set(row.clubId, (countByClub.get(row.clubId) ?? 0) + 1)
            const prevMax = maxAtByClub.get(row.clubId)
            if (!prevMax || row.createdAt > prevMax) maxAtByClub.set(row.clubId, row.createdAt)
            if (!leadByClub.has(row.clubId)) {
              const label = row.user?.name || row.user?.email || 'Member'
              leadByClub.set(row.clubId, {
                image: row.user?.image ?? null,
                label,
              })
            }
          }
          const uniqueClubIds = Array.from(countByClub.keys())
          const clubs = await ctx.prisma.club.findMany({
            where: { id: { in: uniqueClubIds } },
            select: { id: true, name: true },
          })
          const clubById = new Map(clubs.map((c) => [c.id, c]))
          let seenMap = new Map<string, Date>()
          try {
            const seenByClub = await ctx.prisma.clubJoinRequestSeen.findMany({
              where: { userId, clubId: { in: uniqueClubIds } },
              select: { clubId: true, seenAt: true },
            })
            seenMap = new Map(seenByClub.map((s) => [s.clubId, s.seenAt]))
          } catch (errSeen) {
            if (!isMissingDbRelation(errSeen, 'club_join_request_seen')) throw errSeen
          }
          for (const cid of uniqueClubIds) {
            const club = clubById.get(cid)
            const cnt = countByClub.get(cid) ?? 0
            const maxAt = maxAtByClub.get(cid)
            if (!club || !maxAt || cnt === 0) continue
            const seenAt = seenMap.get(cid)
            const readAt =
              seenAt && maxAt <= seenAt ? seenAt.toISOString() : null
            const lead = leadByClub.get(cid)
            clubJoinItems.push({
              id: `club-join-request-${cid}`,
              type: 'CLUB_JOIN_REQUEST',
              title: 'Club join request',
              body: `${cnt} pending request${cnt === 1 ? '' : 's'} in "${club.name}".`,
              createdAt: maxAt.toISOString(),
              readAt,
              clubId: cid,
              clubName: club.name,
              targetUrl: `/clubs/${cid}?tab=members`,
              userAvatarUrl: lead?.image ?? null,
              requesterName: lead?.label ?? club.name,
            })
          }
        }
      } catch (err) {
        if (!isMissingDbRelation(err, 'club_join_requests')) throw err
      }

      if (clubIds.length > 0) {
        try {
          const since = new Date(Date.now() - 90 * 86400000)
          const leaves = await ctx.prisma.clubMemberLeaveLog.findMany({
            where: { clubId: { in: clubIds }, createdAt: { gte: since } },
            orderBy: { createdAt: 'desc' },
            take: 40,
            include: {
              leaver: { select: { name: true, email: true, image: true } },
              club: { select: { name: true } },
            },
          })
          for (const row of leaves) {
            const name = row.leaver?.name || row.leaver?.email || 'Member'
            clubLeaveItems.push({
              id: `club-member-left-${row.id}`,
              type: 'CLUB_MEMBER_LEFT',
              title: 'Member left club',
              body: `${name} left "${row.club.name}".`,
              createdAt: row.createdAt.toISOString(),
              readAt: null,
              clubId: row.clubId,
              clubName: row.club.name,
              targetUrl: `/clubs/${row.clubId}?tab=members`,
              userAvatarUrl: row.leaver?.image ?? null,
              requesterName: name,
            })
          }
        } catch (errLeave) {
          if (!isMissingDbRelation(errLeave, 'club_member_leave_logs')) throw errLeave
        }
        try {
          const sinceJoin = new Date(Date.now() - 90 * 86400000)
          const openJoins = await ctx.prisma.clubMemberJoinLog.findMany({
            where: { clubId: { in: clubIds }, createdAt: { gte: sinceJoin } },
            orderBy: { createdAt: 'desc' },
            take: 40,
            include: {
              joiner: { select: { name: true, email: true, image: true } },
              club: { select: { name: true } },
            },
          })
          for (const row of openJoins) {
            const name = row.joiner?.name || row.joiner?.email || 'Member'
            clubOpenJoinItems.push({
              id: `club-member-joined-${row.id}`,
              type: 'CLUB_MEMBER_JOINED',
              title: 'New club member',
              body: `${name} joined "${row.club.name}".`,
              createdAt: row.createdAt.toISOString(),
              readAt: null,
              clubId: row.clubId,
              clubName: row.club.name,
              targetUrl: `/clubs/${row.clubId}?tab=members`,
              userAvatarUrl: row.joiner?.image ?? null,
              requesterName: name,
            })
          }
        } catch (errOpenJoin) {
          if (!isMissingDbRelation(errOpenJoin, 'club_member_join_logs')) throw errOpenJoin
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
                  image: true,
                  format: true,
                  venueName: true,
                  venueAddress: true,
                  user: {
                    select: {
                      name: true,
                      email: true,
                      image: true,
                      city: true,
                    },
                  },
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
        const followedClubIds = Array.from(new Set(follows.map((f) => f.clubId)))
        const followedClubs = followedClubIds.length
          ? await ctx.prisma.club.findMany({
              where: { id: { in: followedClubIds } },
              select: { id: true, name: true, logoUrl: true, city: true, state: true },
            })
          : []
        const clubNameById = new Map(followedClubs.map((c) => [c.id, c.name]))
        const clubLogoById = new Map(followedClubs.map((c) => [c.id, c.logoUrl ?? null]))
        const clubById = new Map(followedClubs.map((c) => [c.id, c]))
        for (const row of played) {
          const tournament = row.tournament
          if (!tournament) continue
          const tournamentDate = formatPromptDate(tournament.endDate)
          const directorName = tournament.user?.name || tournament.user?.email || 'Tournament director'
          if (tournament.endDate <= tournamentCutoff) {
            if (!rated.has(`TOURNAMENT:${tournament.id}`) && !seenTournament.has(`TOURNAMENT:${tournament.id}`)) {
              seenTournament.add(`TOURNAMENT:${tournament.id}`)
              feedbackPromptItems.push({
                id: `feedback-prompt-tournament-${tournament.id}`,
                type: 'FEEDBACK_PROMPT',
                title: 'Rate tournament',
                body: `"${tournament.title}" (${tournamentDate}).\nHelp us improve tournament quality and player experience.`,
                createdAt: tournament.endDate.toISOString(),
                readAt: null,
                targetUrl: `/tournaments/${tournament.id}`,
                entityType: 'TOURNAMENT',
                entityId: tournament.id,
                avatarUrl: tournament.image ?? null,
                context: {
                  title: tournament.title,
                  date: tournamentDate,
                  format: tournament.format ? String(tournament.format).replace(/_/g, ' ') : null,
                  address: [tournament.venueName, tournament.venueAddress].filter(Boolean).join(', ') || null,
                  imageUrl: tournament.image ?? null,
                },
              })
            }
            if (!rated.has(`TD:${tournament.userId}`) && !seenTournament.has(`TD:${tournament.userId}`)) {
              seenTournament.add(`TD:${tournament.userId}`)
              feedbackPromptItems.push({
                id: `feedback-prompt-td-${tournament.userId}-${tournament.id}`,
                type: 'FEEDBACK_PROMPT',
                title: 'Rate tournament director',
                body: `"${directorName}" (${tournamentDate}, "${tournament.title}").\nHelp us improve director quality, communication, and event experience.`,
                createdAt: tournament.endDate.toISOString(),
                readAt: null,
                targetUrl: `/tournaments/${tournament.id}`,
                entityType: 'TD',
                entityId: tournament.userId,
                avatarUrl: tournament.user?.image ?? null,
                context: {
                  name: directorName,
                  city: tournament.user?.city ?? null,
                  avatarUrl: tournament.user?.image ?? null,
                  tournamentTitle: tournament.title,
                  tournamentDate: tournamentDate,
                },
              })
            }
          }
          if (tournament.clubId && !rated.has(`CLUB:${tournament.clubId}`) && !seenClub.has(tournament.clubId)) {
            seenClub.add(tournament.clubId)
            const club = clubById.get(tournament.clubId)
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
              avatarUrl: clubLogoById.get(tournament.clubId) ?? null,
              context: {
                title: club?.name ?? null,
                address: [club?.city, club?.state].filter(Boolean).join(', ') || null,
                membersCount: null,
                imageUrl: club?.logoUrl ?? null,
              },
            })
          }
        }
        for (const follow of follows) {
          if (follow.createdAt > clubCutoff) continue
          if (rated.has(`CLUB:${follow.clubId}`) || seenClub.has(follow.clubId)) continue
          seenClub.add(follow.clubId)
          const clubName = clubNameById.get(follow.clubId) ?? 'Club'
          const joinedDate = formatPromptDate(follow.createdAt)
          feedbackPromptItems.push({
            id: `feedback-prompt-club-joined-${follow.clubId}`,
            type: 'FEEDBACK_PROMPT',
            title: 'Rate club',
            body: `"${clubName}" (${joinedDate}).\nHelp us improve club quality, events, and member experience.`,
            createdAt: follow.createdAt.toISOString(),
            readAt: null,
            targetUrl: `/clubs/${follow.clubId}`,
            entityType: 'CLUB',
            entityId: follow.clubId,
            avatarUrl: clubLogoById.get(follow.clubId) ?? null,
            context: {
              title: clubName,
              address: [clubById.get(follow.clubId)?.city, clubById.get(follow.clubId)?.state].filter(Boolean).join(', ') || null,
              membersCount: null,
              imageUrl: clubLogoById.get(follow.clubId) ?? null,
            },
          })
        }
        if (me?.createdAt && me.createdAt <= appCutoff && !rated.has('APP:GLOBAL')) {
          feedbackPromptItems.push({
            id: 'feedback-prompt-app-global',
            type: 'FEEDBACK_PROMPT',
            title: 'Rate app experience',
            body: 'Your opinion is very important to us. We are working to improve usability, your overall experience, and the speed and quality of our service.',
            createdAt: me.createdAt.toISOString(),
            readAt: null,
            targetUrl: '/profile',
            entityType: 'APP',
            entityId: 'GLOBAL',
            avatarUrl: null,
          })
        }
      } catch (err) {
        if (!isMissingDbRelation(err, 'feedback')) throw err
      }

      let extraBellItems: Array<Record<string, unknown> & { _sort: string }> = []
      try {
        extraBellItems = await buildExtraBellItems(ctx.prisma, userId)
      } catch {
        extraBellItems = []
      }

      type Merged = Record<string, unknown> & { _sort: string; type?: string }
      const merged: Merged[] = [
        ...invitationItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...clubJoinItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...clubLeaveItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...clubOpenJoinItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...feedbackPromptItems.map((i) => ({ ...i, _sort: i.createdAt })),
        ...extraBellItems.map((i) => ({ ...i })),
      ]
      const sortDesc = (a: Merged, b: Merged) => b._sort.localeCompare(a._sort)
      /** Админские pending (клуб / доступ к турниру) — вверху, чтобы не вытеснялись лимитом списка. */
      const priorityTypes = new Set(['CLUB_JOIN_REQUEST', 'TOURNAMENT_ACCESS_PENDING'])
      const priorityMerged = merged.filter((x) => priorityTypes.has(String(x.type ?? '')))
      const restMerged = merged.filter((x) => !priorityTypes.has(String(x.type ?? '')))
      const ordered = [...priorityMerged.sort(sortDesc), ...restMerged.sort(sortDesc)]
      const sorted = ordered.map(({ _sort, ...rest }) => rest) as Array<
        { createdAt: string } & Record<string, unknown>
      >

      const prefs = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          bellNotificationsReadThrough: true,
          bellNotificationsClearedBefore: true,
          bellDismissedNotificationIds: true,
        },
      })
      const readThrough = prefs?.bellNotificationsReadThrough ?? null
      const clearedBefore = prefs?.bellNotificationsClearedBefore ?? null
      const rawDismissed = prefs?.bellDismissedNotificationIds
      const dismissedIds = new Set(
        Array.isArray(rawDismissed)
          ? (rawDismissed as unknown[]).filter((x): x is string => typeof x === 'string')
          : []
      )

      const visible = sorted
        .filter((i) => {
          if (!clearedBefore) return true
          // «Очистить всё» режет по дате строки; у pending-заявок createdAt = время события,
          // иначе висящие запросы пропадали бы из колокольчика навсегда.
          const tp = (i as { type?: string }).type
          if (tp === 'CLUB_JOIN_REQUEST' || tp === 'TOURNAMENT_ACCESS_PENDING') return true
          return new Date(i.createdAt) > clearedBefore
        })
        .filter((i) => {
          const id = String((i as { id?: string }).id ?? '')
          const tp = (i as { type?: string }).type
          // Свайп «удалить» не должен навсегда прятать pending заявки (id оставался в bellDismissedNotificationIds).
          if (tp === 'CLUB_JOIN_REQUEST' || tp === 'TOURNAMENT_ACCESS_PENDING') return true
          return !dismissedIds.has(id)
        })
      const unreadCount = visible.filter((i) => {
        // Подсказки фидбека в списке остаются, но не раздувают бейдж колокольчика.
        if ((i as { type?: string }).type === 'FEEDBACK_PROMPT') return false
        const t = (i as { type?: string }).type
        if (t === 'CLUB_JOIN_REQUEST') {
          const ra = (i as { readAt?: string | null }).readAt
          return !ra
        }
        if (!readThrough) return true
        return new Date(i.createdAt) > readThrough
      }).length
      const items = visible.slice(0, limit)

      return {
        unreadCount,
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

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const now = new Date()
    await ctx.prisma.user.update({
      where: { id: userId },
      data: { bellNotificationsReadThrough: now },
    })
    const adminClubs = await ctx.prisma.clubAdmin.findMany({
      where: { userId },
      select: { clubId: true },
    })
    for (const { clubId } of adminClubs) {
      try {
        await ctx.prisma.clubJoinRequestSeen.upsert({
          where: { userId_clubId: { userId, clubId } },
          create: { userId, clubId },
          update: { seenAt: now },
        })
      } catch (err) {
        if (!isMissingDbRelation(err, 'club_join_request_seen')) throw err
      }
    }
    pushToUser(userId, { type: 'invalidate', keys: ['notification.list'] })
    return { success: true as const }
  }),

  /** Скрыть все текущие уведомления в списке; новые появятся снова. */
  clearAll: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const now = new Date()
    await ctx.prisma.user.update({
      where: { id: userId },
      data: {
        bellNotificationsClearedBefore: now,
        bellNotificationsReadThrough: now,
        bellDismissedNotificationIds: [],
      },
    })
    pushToUser(userId, { type: 'invalidate', keys: ['notification.list'] })
    return { success: true as const }
  }),

  /** Скрыть одну строку колокольника (свайп «удалить»). */
  dismiss: protectedProcedure
    .input(z.object({ notificationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      // Pending заявки нельзя хранить в bellDismissedNotificationIds — иначе пропадали бы навсегда.
      if (
        input.notificationId.startsWith('club-join-request-') ||
        input.notificationId.startsWith('tournament-access-pending-')
      ) {
        pushToUser(userId, { type: 'invalidate', keys: ['notification.list'] })
        return { success: true as const }
      }
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { bellDismissedNotificationIds: true },
      })
      const raw = user?.bellDismissedNotificationIds
      const existing = Array.isArray(raw)
        ? (raw as unknown[]).filter((x): x is string => typeof x === 'string')
        : []
      if (existing.includes(input.notificationId)) {
        pushToUser(userId, { type: 'invalidate', keys: ['notification.list'] })
        return { success: true as const }
      }
      const next = [...existing, input.notificationId].slice(-500)
      await ctx.prisma.user.update({
        where: { id: userId },
        data: { bellDismissedNotificationIds: next },
      })
      pushToUser(userId, { type: 'invalidate', keys: ['notification.list'] })
      return { success: true as const }
    }),
})
