import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { sanitizeChatText } from '../utils/chatModeration'
import { pushToUsers } from '@/lib/realtime'

type ChatMembership = {
  canView: boolean
  canPost: boolean
  canModerate: boolean
  isOwner: boolean
  isTournamentAdmin: boolean
  isClubAdmin: boolean
  isParticipant: boolean
  reason?: string
}

const chatUserSelect = {
  id: true,
  name: true,
  image: true,
} as const

const chatReplyPreviewSelect = {
  id: true,
  userId: true,
  text: true,
  deletedAt: true,
  createdAt: true,
  user: {
    select: chatUserSelect,
  },
} as const

const mapMentionCandidates = (users: Array<{ id: string; name: string | null; image: string | null }>) =>
  Array.from(
    new Map(
      users
        .filter((user) => user?.id)
        .map((user) => [user.id, { id: user.id, name: user.name, image: user.image }])
    ).values()
  ).sort((left, right) => String(left.name ?? '').localeCompare(String(right.name ?? ''), undefined, { sensitivity: 'base' }))

const isMentionUser = (user: { id: string; name: string | null; image: string | null } | null | undefined): user is {
  id: string
  name: string | null
  image: string | null
} => Boolean(user?.id)

const mapMessage = (m: {
  id: string
  userId: string
  text: string
  parentMessageId?: string | null
  replyToMessageId?: string | null
  replyToMessage?: {
    id: string
    userId: string
    text: string
    deletedAt: Date | null
    createdAt: Date
    user: { id: string; name: string | null; image: string | null }
  } | null
  deletedAt: Date | null
  deletedByUserId: string | null
  createdAt: Date
  user: { id: string; name: string | null; image: string | null }
  likes?: { id: string }[]
  _count?: { likes?: number }
}, currentUserId?: string, latestReadAt?: Date | null) => ({
  id: m.id,
  userId: m.userId,
  text: m.deletedAt ? null : m.text,
  isDeleted: Boolean(m.deletedAt),
  parentMessageId: m.parentMessageId ?? null,
  replyToMessageId: m.replyToMessageId ?? null,
  replyToMessage: m.replyToMessage
    ? {
        id: m.replyToMessage.id,
        userId: m.replyToMessage.userId,
        text: m.replyToMessage.deletedAt ? null : m.replyToMessage.text,
        isDeleted: Boolean(m.replyToMessage.deletedAt),
        createdAt: m.replyToMessage.createdAt,
        user: m.replyToMessage.user,
      }
    : null,
  deletedAt: m.deletedAt,
  deletedByUserId: m.deletedByUserId,
  createdAt: m.createdAt,
  deliveryStatus:
    currentUserId && m.userId === currentUserId
      ? latestReadAt && new Date(m.createdAt) <= latestReadAt
        ? 'read'
        : 'delivered'
      : undefined,
  likeCount: m._count?.likes ?? 0,
  viewerHasLiked: Boolean(m.likes?.length),
  user: m.user,
})

const isMissingDbRelation = (err: any, relationName: string) => {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes(relationName.toLowerCase()) && msg.includes('does not exist')
}

async function getTournamentMembership(
  prisma: any,
  userId: string,
  tournamentId: string
): Promise<ChatMembership> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, userId: true, clubId: true },
  })

  if (!tournament) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
  }

  const adminAccess = await prisma.tournamentAccess.findFirst({
    where: {
      userId,
      tournamentId,
      accessLevel: 'ADMIN',
    },
    select: { id: true },
  })

  const clubAdmin = tournament.clubId
    ? await prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: tournament.clubId, userId } },
        select: { id: true },
      })
    : null

  const playerRecord = await prisma.player.findFirst({
    where: {
      userId,
      tournamentId,
    },
    select: {
      id: true,
      teamPlayers: {
        where: {
          team: {
            division: {
              tournamentId,
            },
          },
        },
        select: { id: true },
        take: 1,
      },
      waitlistEntries: {
        where: {
          tournamentId,
          status: 'ACTIVE',
        },
        select: { id: true },
        take: 1,
      },
    },
  })

  const isOwner = tournament.userId === userId
  const isTournamentAdmin = Boolean(adminAccess)
  const isClubAdmin = Boolean(clubAdmin)
  const isParticipant = Boolean(
    (playerRecord?.teamPlayers?.length ?? 0) > 0 || (playerRecord?.waitlistEntries?.length ?? 0) > 0
  )
  const canView = isOwner || isTournamentAdmin || isClubAdmin || isParticipant

  return {
    canView,
    canPost: canView,
    canModerate: isOwner || isTournamentAdmin || isClubAdmin,
    isOwner,
    isTournamentAdmin,
    isClubAdmin,
    isParticipant,
    reason: canView ? undefined : 'Only tournament participants and admins can use this chat.',
  }
}

async function getDivisionMembership(
  prisma: any,
  userId: string,
  divisionId: string
): Promise<ChatMembership> {
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: {
      id: true,
      tournamentId: true,
      tournament: {
        select: {
          userId: true,
          clubId: true,
        },
      },
    },
  })

  if (!division) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
  }

  const adminAccess = await prisma.tournamentAccess.findFirst({
    where: {
      userId,
      tournamentId: division.tournamentId,
      accessLevel: 'ADMIN',
      OR: [{ divisionId: null }, { divisionId }],
    },
    select: { id: true },
  })

  const clubAdmin = division.tournament.clubId
    ? await prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: division.tournament.clubId, userId } },
        select: { id: true },
      })
    : null

  const playerRecord = await prisma.player.findFirst({
    where: {
      userId,
      tournamentId: division.tournamentId,
    },
    select: {
      id: true,
      teamPlayers: {
        where: {
          team: { divisionId },
        },
        select: { id: true },
        take: 1,
      },
      waitlistEntries: {
        where: {
          divisionId,
          status: 'ACTIVE',
        },
        select: { id: true },
        take: 1,
      },
    },
  })

  const isOwner = division.tournament.userId === userId
  const isTournamentAdmin = Boolean(adminAccess)
  const isClubAdmin = Boolean(clubAdmin)
  const isParticipant = Boolean(
    (playerRecord?.teamPlayers?.length ?? 0) > 0 || (playerRecord?.waitlistEntries?.length ?? 0) > 0
  )
  const canView = isOwner || isTournamentAdmin || isClubAdmin || isParticipant

  return {
    canView,
    canPost: canView,
    canModerate: isOwner || isTournamentAdmin || isClubAdmin,
    isOwner,
    isTournamentAdmin,
    isClubAdmin,
    isParticipant,
    reason: canView ? undefined : 'Only division participants and admins can use this chat.',
  }
}

async function sanitizeAndRateLimit(input: {
  text: string
  isModerator: boolean
  lastMessage: { createdAt: Date; text: string } | null
  messagesLastMinute: number
}) {
  const trimmed = input.text.trim()
  if (!trimmed) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Message cannot be empty' })
  }

  const now = new Date()
  const cooldownMs = input.isModerator ? 250 : 350
  const maxPerMinute = input.isModerator ? 30 : 10

  if (input.lastMessage) {
    const delta = now.getTime() - new Date(input.lastMessage.createdAt).getTime()
    if (delta < cooldownMs) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Slow down a bit.' })
    }
  }

  if (input.messagesLastMinute >= maxPerMinute) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many messages. Please wait.' })
  }

  const links = trimmed.match(/https?:\/\/\S+|www\.\S+/gi) ?? []
  const maxLinksPerMessage = input.isModerator ? 5 : 1
  if (links.length > maxLinksPerMessage) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Too many links (max ${maxLinksPerMessage}).` })
  }

  const moderation = sanitizeChatText(trimmed)
  const sanitized = moderation.text
  const wasFiltered = moderation.wasFiltered

  return { sanitized, wasFiltered }
}

export const tournamentChatRouter = createTRPCRouter({
  getPermissions: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        divisionIds: z.array(z.string()).max(64).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const tournament = await getTournamentMembership(ctx.prisma, userId, input.tournamentId)

      const requestedDivisionIds = Array.from(new Set(input.divisionIds ?? []))
      if (!requestedDivisionIds.length) {
        return { tournament, divisions: [] as Array<{ divisionId: string } & ChatMembership> }
      }

      const validDivisions = await ctx.prisma.division.findMany({
        where: {
          id: { in: requestedDivisionIds },
          tournamentId: input.tournamentId,
        },
        select: { id: true },
      })
      const validSet = new Set(validDivisions.map((d) => d.id))

      const divisions = await Promise.all(
        requestedDivisionIds.map(async (divisionId) => {
          if (!validSet.has(divisionId)) {
            return {
              divisionId,
              canView: false,
              canPost: false,
              canModerate: false,
              isOwner: false,
              isTournamentAdmin: false,
              isClubAdmin: false,
              isParticipant: false,
              reason: 'Division not found in this tournament.',
            } satisfies { divisionId: string } & ChatMembership
          }
          const membership = await getDivisionMembership(ctx.prisma, userId, divisionId)
          return {
            divisionId,
            ...membership,
          }
        })
      )

      return {
        tournament,
        divisions,
      }
    }),

  listMentionCandidates: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        divisionId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (input.divisionId) {
        const membership = await getDivisionMembership(ctx.prisma, userId, input.divisionId)
        if (!membership.canView) {
          throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
        }

        const division = await ctx.prisma.division.findUnique({
          where: { id: input.divisionId },
          select: { tournamentId: true },
        })
        if (!division || division.tournamentId !== input.tournamentId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
        }

        const [owner, accessAdmins, clubAdmins, players] = await Promise.all([
          ctx.prisma.tournament.findUnique({
            where: { id: input.tournamentId },
            select: { user: { select: chatUserSelect } },
          }),
          ctx.prisma.tournamentAccess.findMany({
            where: {
              tournamentId: input.tournamentId,
              accessLevel: 'ADMIN',
              OR: [{ divisionId: null }, { divisionId: input.divisionId }],
            },
            select: { userId: true, user: { select: chatUserSelect } },
            distinct: ['userId'],
          }),
          ctx.prisma.clubAdmin.findMany({
            where: {
              club: {
                tournaments: {
                  some: { id: input.tournamentId },
                },
              },
            },
            select: { userId: true, user: { select: chatUserSelect } },
            distinct: ['userId'],
          }),
          ctx.prisma.teamPlayer.findMany({
            where: { team: { divisionId: input.divisionId } },
            select: { player: { select: { user: { select: chatUserSelect } } } },
            distinct: ['playerId'],
          }),
        ])

        return mapMentionCandidates([
          ...(owner?.user ? [owner.user] : []),
          ...accessAdmins.map((row) => row.user).filter(isMentionUser),
          ...clubAdmins.map((row) => row.user).filter(isMentionUser),
          ...players.map((row) => row.player?.user).filter(isMentionUser),
        ])
      }

      const membership = await getTournamentMembership(ctx.prisma, userId, input.tournamentId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const [owner, accessAdmins, clubAdmins, teamPlayers, waitlistUsers] = await Promise.all([
        ctx.prisma.tournament.findUnique({
          where: { id: input.tournamentId },
          select: { user: { select: chatUserSelect } },
        }),
        ctx.prisma.tournamentAccess.findMany({
          where: { tournamentId: input.tournamentId, accessLevel: 'ADMIN' },
          select: { userId: true, user: { select: chatUserSelect } },
          distinct: ['userId'],
        }),
        ctx.prisma.clubAdmin.findMany({
          where: {
            club: {
              tournaments: {
                some: { id: input.tournamentId },
              },
            },
          },
          select: { userId: true, user: { select: chatUserSelect } },
          distinct: ['userId'],
        }),
        ctx.prisma.teamPlayer.findMany({
          where: { team: { division: { tournamentId: input.tournamentId } } },
          select: { player: { select: { user: { select: chatUserSelect } } } },
          distinct: ['playerId'],
        }),
        ctx.prisma.waitlistEntry.findMany({
          where: { tournamentId: input.tournamentId, status: 'ACTIVE' },
          select: { player: { select: { user: { select: chatUserSelect } } } },
          distinct: ['playerId'],
        }),
      ])

      return mapMentionCandidates([
        ...(owner?.user ? [owner.user] : []),
        ...accessAdmins.map((row) => row.user).filter(isMentionUser),
        ...clubAdmins.map((row) => row.user).filter(isMentionUser),
        ...teamPlayers.map((row) => row.player?.user).filter(isMentionUser),
        ...waitlistUsers.map((row) => row.player?.user).filter(isMentionUser),
      ])
    }),

  listMyEventChats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const [owned, adminAccess, clubAdminTournaments, participantDivisions, waitlistEntries] =
      await Promise.all([
        ctx.prisma.tournament.findMany({
          where: { userId },
          select: { id: true },
        }),
        ctx.prisma.tournamentAccess.findMany({
          where: { userId, accessLevel: 'ADMIN' },
          select: { tournamentId: true },
          distinct: ['tournamentId'],
        }),
        ctx.prisma.tournament.findMany({
          where: {
            club: {
              admins: {
                some: { userId },
              },
            },
          },
          select: { id: true },
        }),
        ctx.prisma.division.findMany({
          where: {
            teams: {
              some: {
                teamPlayers: {
                  some: {
                    player: { userId },
                  },
                },
              },
            },
          },
          select: { tournamentId: true },
          distinct: ['tournamentId'],
        }),
        ctx.prisma.waitlistEntry.findMany({
          where: {
            status: 'ACTIVE',
            player: { userId },
          },
          select: { tournamentId: true },
          distinct: ['tournamentId'],
        }),
      ])

    const candidateTournamentIds = Array.from(
      new Set([
        ...owned.map((t) => t.id),
        ...adminAccess.map((t) => t.tournamentId),
        ...clubAdminTournaments.map((t) => t.id),
        ...participantDivisions.map((d) => d.tournamentId),
        ...waitlistEntries.map((w) => w.tournamentId),
      ])
    )

    if (!candidateTournamentIds.length) {
      return []
    }

    let hasReadStates = true
    const tournamentReadStateById = new Map<string, Date>()
    try {
      const readStates = await ctx.prisma.tournamentChatReadState.findMany({
        where: {
          userId,
          tournamentId: { in: candidateTournamentIds },
        },
        select: {
          tournamentId: true,
          lastReadAt: true,
        },
      })
      for (const state of readStates) {
        tournamentReadStateById.set(state.tournamentId, state.lastReadAt)
      }
    } catch (err: any) {
      if (isMissingDbRelation(err, 'tournament_chat_read_states')) {
        hasReadStates = false
      } else {
        throw err
      }
    }

    const tournaments = await ctx.prisma.tournament.findMany({
      where: { id: { in: candidateTournamentIds } },
      select: {
        id: true,
        title: true,
        image: true,
        startDate: true,
        endDate: true,
        timezone: true,
        club: {
          select: {
            id: true,
            name: true,
          },
        },
        divisions: {
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: [{ startDate: 'asc' }, { title: 'asc' }],
    })

    const allDivisionIds = tournaments.flatMap((tournament) => tournament.divisions.map((division) => division.id))
    const divisionReadStateById = new Map<string, Date>()
    if (hasReadStates && allDivisionIds.length > 0) {
      try {
        const divisionReadStates = await ctx.prisma.divisionChatReadState.findMany({
          where: {
            userId,
            divisionId: { in: allDivisionIds },
          },
          select: {
            divisionId: true,
            lastReadAt: true,
          },
        })
        for (const state of divisionReadStates) {
          divisionReadStateById.set(state.divisionId, state.lastReadAt)
        }
      } catch (err: any) {
        if (isMissingDbRelation(err, 'division_chat_read_states')) {
          hasReadStates = false
        } else {
          throw err
        }
      }
    }

    const events = await Promise.all(
      tournaments.map(async (tournament) => {
        const membership = await getTournamentMembership(ctx.prisma, userId, tournament.id)
        if (!membership.canView) return null

        const tournamentUnreadCount = hasReadStates
          ? await ctx.prisma.tournamentChatMessage.count({
              where: {
                tournamentId: tournament.id,
                deletedAt: null,
                userId: { not: userId },
                ...(tournamentReadStateById.get(tournament.id)
                  ? { createdAt: { gt: tournamentReadStateById.get(tournament.id)! } }
                  : {}),
              },
            })
          : 0
        const tournamentLastMessage = await ctx.prisma.tournamentChatMessage.findFirst({
          where: {
            tournamentId: tournament.id,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })

        const divisions = await Promise.all(
          tournament.divisions.map(async (division) => {
            const divisionMembership = await getDivisionMembership(ctx.prisma, userId, division.id)
            if (!divisionMembership.canView) return null

            const divisionUnreadCount = hasReadStates
              ? await ctx.prisma.divisionChatMessage.count({
                  where: {
                    divisionId: division.id,
                    deletedAt: null,
                    userId: { not: userId },
                    ...(divisionReadStateById.get(division.id)
                      ? { createdAt: { gt: divisionReadStateById.get(division.id)! } }
                      : {}),
                  },
                })
              : 0

            return {
              id: division.id,
              name: division.name,
              permission: divisionMembership,
              unreadCount: divisionUnreadCount,
            }
          })
        )

        const visibleDivisions = divisions.filter(
          (division): division is NonNullable<typeof division> => Boolean(division)
        )

        return {
          id: tournament.id,
          title: tournament.title,
          image: tournament.image,
          startDate: tournament.startDate,
          endDate: tournament.endDate,
          timezone: tournament.timezone,
          club: tournament.club,
          permission: membership,
          unreadCount: tournamentUnreadCount,
          lastMessageAt: tournamentLastMessage?.createdAt ?? null,
          divisions: visibleDivisions,
        }
      })
    )

    return events.filter((event): event is NonNullable<typeof event> => Boolean(event))
  }),

  markTournamentRead: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const membership = await getTournamentMembership(ctx.prisma, userId, input.tournamentId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      try {
        await ctx.prisma.tournamentChatReadState.upsert({
          where: {
            tournamentId_userId: {
              tournamentId: input.tournamentId,
              userId,
            },
          },
          create: {
            tournamentId: input.tournamentId,
            userId,
            lastReadAt: new Date(),
          },
          update: {
            lastReadAt: new Date(),
          },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'tournament_chat_read_states')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'tournament_chat_read_states table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      const [owner, accessAdmins, teamPlayerUsers, waitlistUsers] = await Promise.all([
        ctx.prisma.tournament.findUnique({
          where: { id: input.tournamentId },
          select: { userId: true },
        }),
        ctx.prisma.tournamentAccess.findMany({
          where: { tournamentId: input.tournamentId, accessLevel: 'ADMIN' },
          select: { userId: true },
        }),
        ctx.prisma.teamPlayer.findMany({
          where: { team: { division: { tournamentId: input.tournamentId } } },
          select: { player: { select: { userId: true } } },
          distinct: ['playerId'],
        }),
        ctx.prisma.waitlistEntry.findMany({
          where: { tournamentId: input.tournamentId, status: 'ACTIVE' },
          select: { player: { select: { userId: true } } },
          distinct: ['playerId'],
        }),
      ])
      const recipientIds = [
        ...(owner?.userId ? [owner.userId] : []),
        ...(accessAdmins?.map((a) => a.userId) ?? []),
        ...(teamPlayerUsers?.map((tp) => tp.player?.userId).filter(Boolean) ?? []),
        ...(waitlistUsers?.map((w) => w.player?.userId).filter(Boolean) ?? []),
      ].filter((id): id is string => id != null && id !== userId)
      pushToUsers(Array.from(new Set(recipientIds)), {
        type: 'invalidate',
        keys: ['tournamentChat.listMyEventChats', 'tournamentChat.listTournamentThread'],
      })

      return { success: true }
    }),

  markDivisionRead: protectedProcedure
    .input(
      z.object({
        divisionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const membership = await getDivisionMembership(ctx.prisma, userId, input.divisionId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      try {
        await ctx.prisma.divisionChatReadState.upsert({
          where: {
            divisionId_userId: {
              divisionId: input.divisionId,
              userId,
            },
          },
          create: {
            divisionId: input.divisionId,
            userId,
            lastReadAt: new Date(),
          },
          update: {
            lastReadAt: new Date(),
          },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'division_chat_read_states')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'division_chat_read_states table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        select: { tournamentId: true },
      })
      if (division?.tournamentId) {
        const [owner, accessAdmins, teamPlayerUsers, waitlistUsers] = await Promise.all([
          ctx.prisma.tournament.findUnique({
            where: { id: division.tournamentId },
            select: { userId: true },
          }),
          ctx.prisma.tournamentAccess.findMany({
            where: {
              tournamentId: division.tournamentId,
              accessLevel: 'ADMIN',
              OR: [{ divisionId: null }, { divisionId: input.divisionId }],
            },
            select: { userId: true },
          }),
          ctx.prisma.teamPlayer.findMany({
            where: { team: { divisionId: input.divisionId } },
            select: { player: { select: { userId: true } } },
            distinct: ['playerId'],
          }),
          ctx.prisma.waitlistEntry.findMany({
            where: { divisionId: input.divisionId, status: 'ACTIVE' },
            select: { player: { select: { userId: true } } },
            distinct: ['playerId'],
          }),
        ])
        const recipientIds = [
          ...(owner?.userId ? [owner.userId] : []),
          ...(accessAdmins?.map((a) => a.userId) ?? []),
          ...(teamPlayerUsers?.map((tp) => tp.player?.userId).filter(Boolean) ?? []),
          ...(waitlistUsers?.map((w) => w.player?.userId).filter(Boolean) ?? []),
        ].filter((id): id is string => id != null && id !== userId)
        pushToUsers(Array.from(new Set(recipientIds)), {
          type: 'invalidate',
          keys: ['tournamentChat.listMyEventChats', 'tournamentChat.listDivisionThread'],
        })
      }

      return { success: true }
    }),

  listTournament: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const membership = await getTournamentMembership(ctx.prisma, userId, input.tournamentId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const limit = input.limit ?? 100
      const raw = await ctx.prisma.tournamentChatMessage.findMany({
        where: { tournamentId: input.tournamentId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          user: {
            select: chatUserSelect,
          },
          replyToMessage: {
            select: chatReplyPreviewSelect,
          },
          likes: {
            where: { userId },
            select: { id: true },
          },
          _count: {
            select: { likes: true },
          },
        },
      })

      const latestReadByOthers = await ctx.prisma.tournamentChatReadState.findFirst({
        where: {
          tournamentId: input.tournamentId,
          userId: { not: userId },
        },
        orderBy: { lastReadAt: 'desc' },
        select: { lastReadAt: true },
      })
      const latestReadAt = latestReadByOthers?.lastReadAt ? new Date(latestReadByOthers.lastReadAt) : null

      return raw.slice().reverse().map((message) => mapMessage(message, userId, latestReadAt))
    }),

  listTournamentThread: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        rootMessageId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const membership = await getTournamentMembership(ctx.prisma, userId, input.tournamentId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const rootMessage = await ctx.prisma.tournamentChatMessage.findUnique({
        where: { id: input.rootMessageId },
        select: { id: true, tournamentId: true, parentMessageId: true },
      })
      if (!rootMessage || rootMessage.tournamentId !== input.tournamentId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thread not found' })
      }
      const normalizedRootId = rootMessage.parentMessageId ?? rootMessage.id

      const raw = await ctx.prisma.tournamentChatMessage.findMany({
        where: {
          tournamentId: input.tournamentId,
          OR: [{ id: normalizedRootId }, { parentMessageId: normalizedRootId }],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: chatUserSelect,
          },
          replyToMessage: {
            select: chatReplyPreviewSelect,
          },
          likes: {
            where: { userId },
            select: { id: true },
          },
          _count: {
            select: { likes: true },
          },
        },
      })

      const latestReadByOthers = await ctx.prisma.tournamentChatReadState.findFirst({
        where: {
          tournamentId: input.tournamentId,
          userId: { not: userId },
        },
        orderBy: { lastReadAt: 'desc' },
        select: { lastReadAt: true },
      })
      const latestReadAt = latestReadByOthers?.lastReadAt ? new Date(latestReadByOthers.lastReadAt) : null

      return {
        rootMessageId: normalizedRootId,
        messages: raw.map((message) => mapMessage(message, userId, latestReadAt)),
      }
    }),

  sendTournament: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        text: z.string().min(1).max(1000),
        replyToMessageId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const membership = await getTournamentMembership(ctx.prisma, userId, input.tournamentId)
      if (!membership.canPost) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const now = new Date()
      const minuteAgo = new Date(now.getTime() - 60 * 1000)
      const [lastMessage, messagesLastMinute, replyTarget] = await Promise.all([
        ctx.prisma.tournamentChatMessage.findFirst({
          where: {
            tournamentId: input.tournamentId,
            userId,
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, text: true },
        }),
        ctx.prisma.tournamentChatMessage.count({
          where: {
            tournamentId: input.tournamentId,
            userId,
            createdAt: { gte: minuteAgo },
          },
        }),
        input.replyToMessageId
          ? ctx.prisma.tournamentChatMessage.findUnique({
              where: { id: input.replyToMessageId },
              select: {
                id: true,
                tournamentId: true,
                parentMessageId: true,
                deletedAt: true,
                userId: true,
                text: true,
                createdAt: true,
                user: {
                  select: chatUserSelect,
                },
              },
            })
          : Promise.resolve(null),
      ])
      if (input.replyToMessageId) {
        if (!replyTarget || replyTarget.tournamentId !== input.tournamentId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reply target not found' })
        }
      }

      const { sanitized, wasFiltered } = await sanitizeAndRateLimit({
        text: input.text,
        isModerator: membership.canModerate,
        lastMessage,
        messagesLastMinute,
      })

      const message = await ctx.prisma.tournamentChatMessage.create({
        data: {
          tournamentId: input.tournamentId,
          userId,
          text: sanitized,
          parentMessageId: replyTarget ? replyTarget.parentMessageId ?? replyTarget.id : null,
          replyToMessageId: replyTarget ? replyTarget.id : null,
        },
        include: {
          user: {
            select: chatUserSelect,
          },
          replyToMessage: {
            select: chatReplyPreviewSelect,
          },
        },
      })

      const [owner, accessAdmins, teamPlayerUsers, waitlistUsers] = await Promise.all([
        ctx.prisma.tournament.findUnique({
          where: { id: input.tournamentId },
          select: { userId: true },
        }),
        ctx.prisma.tournamentAccess.findMany({
          where: { tournamentId: input.tournamentId, accessLevel: 'ADMIN' },
          select: { userId: true },
        }),
        ctx.prisma.teamPlayer.findMany({
          where: { team: { division: { tournamentId: input.tournamentId } } },
          select: { player: { select: { userId: true } } },
          distinct: ['playerId'],
        }),
        ctx.prisma.waitlistEntry.findMany({
          where: { tournamentId: input.tournamentId, status: 'ACTIVE' },
          select: { player: { select: { userId: true } } },
          distinct: ['playerId'],
        }),
      ])
      const recipientIds = [
        ...(owner?.userId ? [owner.userId] : []),
        ...(accessAdmins?.map((a) => a.userId) ?? []),
        ...(teamPlayerUsers?.map((tp) => tp.player?.userId).filter(Boolean) ?? []),
        ...(waitlistUsers?.map((w) => w.player?.userId).filter(Boolean) ?? []),
      ].filter((id): id is string => id != null && id !== userId)
      pushToUsers(Array.from(new Set(recipientIds)), {
        type: 'invalidate',
        keys: ['tournamentChat.listMyEventChats', 'tournamentChat.listTournamentThread'],
      })

      return {
        ...mapMessage(
          {
            ...message,
            likes: [],
            _count: { likes: 0 },
          },
          userId,
          null,
        ),
        text: message.text,
        deliveryStatus: 'delivered' as const,
        wasFiltered,
      }
    }),

  deleteTournament: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const message = await ctx.prisma.tournamentChatMessage.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          userId: true,
          tournamentId: true,
          deletedAt: true,
        },
      })

      if (!message) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
      }
      if (message.deletedAt) {
        return { success: true }
      }

      if (message.userId !== userId) {
        const membership = await getTournamentMembership(ctx.prisma, userId, message.tournamentId)
        if (!membership.canModerate) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed to delete this message' })
        }
      }

      await ctx.prisma.tournamentChatMessage.update({
        where: { id: input.messageId },
        data: {
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      })

      return { success: true }
    }),

  listDivision: protectedProcedure
    .input(
      z.object({
        divisionId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const membership = await getDivisionMembership(ctx.prisma, userId, input.divisionId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const limit = input.limit ?? 100
      const raw = await ctx.prisma.divisionChatMessage.findMany({
        where: { divisionId: input.divisionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          user: {
            select: chatUserSelect,
          },
          replyToMessage: {
            select: chatReplyPreviewSelect,
          },
          likes: {
            where: { userId },
            select: { id: true },
          },
          _count: {
            select: { likes: true },
          },
        },
      })
      const latestReadByOthers = await ctx.prisma.divisionChatReadState.findFirst({
        where: {
          divisionId: input.divisionId,
          userId: { not: userId },
        },
        orderBy: { lastReadAt: 'desc' },
        select: { lastReadAt: true },
      })
      const latestReadAt = latestReadByOthers?.lastReadAt ? new Date(latestReadByOthers.lastReadAt) : null

      return raw.slice().reverse().map((message) => mapMessage(message, userId, latestReadAt))
    }),

  listDivisionThread: protectedProcedure
    .input(
      z.object({
        divisionId: z.string(),
        rootMessageId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const membership = await getDivisionMembership(ctx.prisma, userId, input.divisionId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const rootMessage = await ctx.prisma.divisionChatMessage.findUnique({
        where: { id: input.rootMessageId },
        select: { id: true, divisionId: true, parentMessageId: true },
      })
      if (!rootMessage || rootMessage.divisionId !== input.divisionId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thread not found' })
      }
      const normalizedRootId = rootMessage.parentMessageId ?? rootMessage.id

      const raw = await ctx.prisma.divisionChatMessage.findMany({
        where: {
          divisionId: input.divisionId,
          OR: [{ id: normalizedRootId }, { parentMessageId: normalizedRootId }],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: chatUserSelect,
          },
          replyToMessage: {
            select: chatReplyPreviewSelect,
          },
          likes: {
            where: { userId },
            select: { id: true },
          },
          _count: {
            select: { likes: true },
          },
        },
      })

      const latestReadByOthers = await ctx.prisma.divisionChatReadState.findFirst({
        where: {
          divisionId: input.divisionId,
          userId: { not: userId },
        },
        orderBy: { lastReadAt: 'desc' },
        select: { lastReadAt: true },
      })
      const latestReadAt = latestReadByOthers?.lastReadAt ? new Date(latestReadByOthers.lastReadAt) : null

      return {
        rootMessageId: normalizedRootId,
        messages: raw.map((message) => mapMessage(message, userId, latestReadAt)),
      }
    }),

  sendDivision: protectedProcedure
    .input(
      z.object({
        divisionId: z.string(),
        text: z.string().min(1).max(1000),
        replyToMessageId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const membership = await getDivisionMembership(ctx.prisma, userId, input.divisionId)
      if (!membership.canPost) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const now = new Date()
      const minuteAgo = new Date(now.getTime() - 60 * 1000)
      const [lastMessage, messagesLastMinute, replyTarget] = await Promise.all([
        ctx.prisma.divisionChatMessage.findFirst({
          where: {
            divisionId: input.divisionId,
            userId,
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, text: true },
        }),
        ctx.prisma.divisionChatMessage.count({
          where: {
            divisionId: input.divisionId,
            userId,
            createdAt: { gte: minuteAgo },
          },
        }),
        input.replyToMessageId
          ? ctx.prisma.divisionChatMessage.findUnique({
              where: { id: input.replyToMessageId },
              select: {
                id: true,
                divisionId: true,
                parentMessageId: true,
                deletedAt: true,
                userId: true,
                text: true,
                createdAt: true,
                user: {
                  select: chatUserSelect,
                },
              },
            })
          : Promise.resolve(null),
      ])
      if (input.replyToMessageId) {
        if (!replyTarget || replyTarget.divisionId !== input.divisionId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reply target not found' })
        }
      }

      const { sanitized, wasFiltered } = await sanitizeAndRateLimit({
        text: input.text,
        isModerator: membership.canModerate,
        lastMessage,
        messagesLastMinute,
      })

      const message = await ctx.prisma.divisionChatMessage.create({
        data: {
          divisionId: input.divisionId,
          userId,
          text: sanitized,
          parentMessageId: replyTarget ? replyTarget.parentMessageId ?? replyTarget.id : null,
          replyToMessageId: replyTarget ? replyTarget.id : null,
        },
        include: {
          user: {
            select: chatUserSelect,
          },
          replyToMessage: {
            select: chatReplyPreviewSelect,
          },
        },
      })

      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        select: { tournamentId: true },
      })
      if (division?.tournamentId) {
        const [owner, accessAdmins, teamPlayerUsers, waitlistUsers] = await Promise.all([
          ctx.prisma.tournament.findUnique({
            where: { id: division.tournamentId },
            select: { userId: true },
          }),
          ctx.prisma.tournamentAccess.findMany({
            where: { tournamentId: division.tournamentId, accessLevel: 'ADMIN' },
            select: { userId: true },
          }),
          ctx.prisma.teamPlayer.findMany({
            where: { team: { divisionId: input.divisionId } },
            select: { player: { select: { userId: true } } },
            distinct: ['playerId'],
          }),
          ctx.prisma.waitlistEntry.findMany({
            where: { tournamentId: division.tournamentId, status: 'ACTIVE' },
            select: { player: { select: { userId: true } } },
            distinct: ['playerId'],
          }),
        ])
        const recipientIds = [
          ...(owner?.userId ? [owner.userId] : []),
          ...(accessAdmins?.map((a) => a.userId) ?? []),
          ...(teamPlayerUsers?.map((tp) => tp.player?.userId).filter(Boolean) ?? []),
          ...(waitlistUsers?.map((w) => w.player?.userId).filter(Boolean) ?? []),
        ].filter((id): id is string => id != null && id !== userId)
        pushToUsers(Array.from(new Set(recipientIds)), {
          type: 'invalidate',
          keys: ['tournamentChat.listMyEventChats', 'tournamentChat.listDivisionThread'],
        })
      }

      return {
        ...mapMessage(
          {
            ...message,
            likes: [],
            _count: { likes: 0 },
          },
          userId,
          null,
        ),
        text: message.text,
        deliveryStatus: 'delivered' as const,
        wasFiltered,
      }
    }),

  likeTournamentMessage: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const message = await ctx.prisma.tournamentChatMessage.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          tournamentId: true,
          deletedAt: true,
        },
      })

      if (!message) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
      }

      const membership = await getTournamentMembership(ctx.prisma, userId, message.tournamentId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const existingLike = await ctx.prisma.tournamentChatLike.findUnique({
        where: {
          messageId_userId: {
            messageId: message.id,
            userId,
          },
        },
        select: { id: true },
      })

      if (existingLike) {
        await ctx.prisma.tournamentChatLike.delete({
          where: { id: existingLike.id },
        })
      } else {
        await ctx.prisma.tournamentChatLike.create({
          data: {
            messageId: message.id,
            userId,
          },
        })
      }

      const likeCount = await ctx.prisma.tournamentChatLike.count({
        where: { messageId: message.id },
      })

      const [owner, accessAdmins, teamPlayerUsers, waitlistUsers] = await Promise.all([
        ctx.prisma.tournament.findUnique({
          where: { id: message.tournamentId },
          select: { userId: true },
        }),
        ctx.prisma.tournamentAccess.findMany({
          where: { tournamentId: message.tournamentId, accessLevel: 'ADMIN' },
          select: { userId: true },
        }),
        ctx.prisma.teamPlayer.findMany({
          where: { team: { division: { tournamentId: message.tournamentId } } },
          select: { player: { select: { userId: true } } },
          distinct: ['playerId'],
        }),
        ctx.prisma.waitlistEntry.findMany({
          where: { tournamentId: message.tournamentId, status: 'ACTIVE' },
          select: { player: { select: { userId: true } } },
          distinct: ['playerId'],
        }),
      ])
      const recipientIds = [
        ...(owner?.userId ? [owner.userId] : []),
        ...(accessAdmins?.map((a) => a.userId) ?? []),
        ...(teamPlayerUsers?.map((tp) => tp.player?.userId).filter(Boolean) ?? []),
        ...(waitlistUsers?.map((w) => w.player?.userId).filter(Boolean) ?? []),
      ].filter((id): id is string => id != null && id !== userId)
      pushToUsers(Array.from(new Set(recipientIds)), {
        type: 'invalidate',
        keys: ['tournamentChat.listMyEventChats', 'tournamentChat.listTournamentThread'],
      })

      return {
        messageId: message.id,
        likeCount,
        viewerHasLiked: !existingLike,
      }
    }),

  likeDivisionMessage: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const message = await ctx.prisma.divisionChatMessage.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          divisionId: true,
          deletedAt: true,
        },
      })

      if (!message) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
      }

      const membership = await getDivisionMembership(ctx.prisma, userId, message.divisionId)
      if (!membership.canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: membership.reason || 'No access' })
      }

      const existingLike = await ctx.prisma.divisionChatLike.findUnique({
        where: {
          messageId_userId: {
            messageId: message.id,
            userId,
          },
        },
        select: { id: true },
      })

      if (existingLike) {
        await ctx.prisma.divisionChatLike.delete({
          where: { id: existingLike.id },
        })
      } else {
        await ctx.prisma.divisionChatLike.create({
          data: {
            messageId: message.id,
            userId,
          },
        })
      }

      const likeCount = await ctx.prisma.divisionChatLike.count({
        where: { messageId: message.id },
      })

      const division = await ctx.prisma.division.findUnique({
        where: { id: message.divisionId },
        select: { tournamentId: true },
      })
      if (division?.tournamentId) {
        const [owner, accessAdmins, teamPlayerUsers, waitlistUsers] = await Promise.all([
          ctx.prisma.tournament.findUnique({
            where: { id: division.tournamentId },
            select: { userId: true },
          }),
          ctx.prisma.tournamentAccess.findMany({
            where: {
              tournamentId: division.tournamentId,
              accessLevel: 'ADMIN',
              OR: [{ divisionId: null }, { divisionId: message.divisionId }],
            },
            select: { userId: true },
          }),
          ctx.prisma.teamPlayer.findMany({
            where: { team: { divisionId: message.divisionId } },
            select: { player: { select: { userId: true } } },
            distinct: ['playerId'],
          }),
          ctx.prisma.waitlistEntry.findMany({
            where: { divisionId: message.divisionId, status: 'ACTIVE' },
            select: { player: { select: { userId: true } } },
            distinct: ['playerId'],
          }),
        ])
        const recipientIds = [
          ...(owner?.userId ? [owner.userId] : []),
          ...(accessAdmins?.map((a) => a.userId) ?? []),
          ...(teamPlayerUsers?.map((tp) => tp.player?.userId).filter(Boolean) ?? []),
          ...(waitlistUsers?.map((w) => w.player?.userId).filter(Boolean) ?? []),
        ].filter((id): id is string => id != null && id !== userId)
        pushToUsers(Array.from(new Set(recipientIds)), {
          type: 'invalidate',
          keys: ['tournamentChat.listMyEventChats', 'tournamentChat.listDivisionThread'],
        })
      }

      return {
        messageId: message.id,
        likeCount,
        viewerHasLiked: !existingLike,
      }
    }),

  deleteDivision: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const message = await ctx.prisma.divisionChatMessage.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          userId: true,
          divisionId: true,
          deletedAt: true,
        },
      })

      if (!message) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
      }
      if (message.deletedAt) {
        return { success: true }
      }

      if (message.userId !== userId) {
        const membership = await getDivisionMembership(ctx.prisma, userId, message.divisionId)
        if (!membership.canModerate) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed to delete this message' })
        }
      }

      await ctx.prisma.divisionChatMessage.update({
        where: { id: input.messageId },
        data: {
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      })

      return { success: true }
    }),
})
