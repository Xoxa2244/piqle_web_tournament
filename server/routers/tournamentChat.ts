import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import profanity from 'leo-profanity'

profanity.loadDictionary('en')
profanity.add(profanity.getDictionary('ru'))
profanity.add(profanity.getDictionary('es'))

const extraBlocked = (process.env.CHAT_BLOCKED_WORDS || '')
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean)
if (extraBlocked.length) {
  profanity.add(extraBlocked)
}

const normalizeText = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

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

const mapMessage = (m: {
  id: string
  userId: string
  text: string
  deletedAt: Date | null
  deletedByUserId: string | null
  createdAt: Date
  user: { id: string; name: string | null; image: string | null }
}) => ({
  id: m.id,
  userId: m.userId,
  text: m.deletedAt ? null : m.text,
  isDeleted: Boolean(m.deletedAt),
  deletedAt: m.deletedAt,
  deletedByUserId: m.deletedByUserId,
  createdAt: m.createdAt,
  user: m.user,
})

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

  const [adminAccess, clubAdmin, teamParticipant, waitlistParticipant] = await Promise.all([
    prisma.tournamentAccess.findFirst({
      where: {
        userId,
        tournamentId,
        accessLevel: 'ADMIN',
      },
      select: { id: true },
    }),
    tournament.clubId
      ? prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: tournament.clubId, userId } },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.teamPlayer.findFirst({
      where: {
        player: { userId },
        team: {
          division: {
            tournamentId,
          },
        },
      },
      select: { id: true },
    }),
    prisma.waitlistEntry.findFirst({
      where: {
        tournamentId,
        status: 'ACTIVE',
        player: { userId },
      },
      select: { id: true },
    }),
  ])

  const isOwner = tournament.userId === userId
  const isTournamentAdmin = Boolean(adminAccess)
  const isClubAdmin = Boolean(clubAdmin)
  const isParticipant = Boolean(teamParticipant || waitlistParticipant)
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

  const [adminAccess, clubAdmin, teamParticipant, waitlistParticipant] = await Promise.all([
    prisma.tournamentAccess.findFirst({
      where: {
        userId,
        tournamentId: division.tournamentId,
        accessLevel: 'ADMIN',
        OR: [{ divisionId: null }, { divisionId }],
      },
      select: { id: true },
    }),
    division.tournament.clubId
      ? prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: division.tournament.clubId, userId } },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.teamPlayer.findFirst({
      where: {
        player: { userId },
        team: { divisionId },
      },
      select: { id: true },
    }),
    prisma.waitlistEntry.findFirst({
      where: {
        divisionId,
        status: 'ACTIVE',
        player: { userId },
      },
      select: { id: true },
    }),
  ])

  const isOwner = division.tournament.userId === userId
  const isTournamentAdmin = Boolean(adminAccess)
  const isClubAdmin = Boolean(clubAdmin)
  const isParticipant = Boolean(teamParticipant || waitlistParticipant)
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
  const cooldownMs = input.isModerator ? 1000 : 2500
  const maxPerMinute = input.isModerator ? 30 : 10

  if (input.lastMessage) {
    const delta = now.getTime() - new Date(input.lastMessage.createdAt).getTime()
    if (delta < cooldownMs) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Slow down a bit.' })
    }
    if (normalizeText(input.lastMessage.text) === normalizeText(trimmed)) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Duplicate message.' })
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

  let sanitized = trimmed
  let wasFiltered = false
  if (profanity.check(sanitized)) {
    sanitized = profanity.clean(sanitized)
    wasFiltered = sanitized !== trimmed
  }

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

  listTournament: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const membership = await getTournamentMembership(ctx.prisma, ctx.session.user.id, input.tournamentId)
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
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      })

      return raw.slice().reverse().map(mapMessage)
    }),

  sendTournament: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        text: z.string().min(1).max(1000),
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
      const [lastMessage, messagesLastMinute] = await Promise.all([
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
      ])

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
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      })

      return {
        ...mapMessage(message),
        text: message.text,
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
      const membership = await getDivisionMembership(ctx.prisma, ctx.session.user.id, input.divisionId)
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
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      })

      return raw.slice().reverse().map(mapMessage)
    }),

  sendDivision: protectedProcedure
    .input(
      z.object({
        divisionId: z.string(),
        text: z.string().min(1).max(1000),
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
      const [lastMessage, messagesLastMinute] = await Promise.all([
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
      ])

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
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      })

      return {
        ...mapMessage(message),
        text: message.text,
        wasFiltered,
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
