import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { getTeamSlotCount } from '../utils/teamSlots'
import { pushToUsers } from '@/lib/realtime'

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000'
const POLL_TITLE_MAX_LENGTH = 120
const POLL_OPTION_MAX_LENGTH = 120
const POLL_OPTION_MIN_COUNT = 2
const POLL_OPTION_MAX_COUNT = 10

const isMissingDbRelation = (err: any, relationName: string) => {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes(relationName.toLowerCase()) && msg.includes('does not exist')
}

const isMissingDbColumn = (err: any, columnName: string) => {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes(`"${columnName.toLowerCase()}"`) && msg.includes('does not exist')
}

const maskEmail = (email: string | null | undefined) => {
  try {
    const [localRaw, domainRaw] = String(email ?? '').split('@')
    const local = (localRaw ?? '').trim()
    const domain = (domainRaw ?? '').trim()
    if (!local || !domain) return null

    const localMasked = local.length <= 1 ? '*' : `${local[0]}***`
    const domainParts = domain.split('.').filter(Boolean)
    const tld = domainParts.length ? domainParts[domainParts.length - 1] : '***'
    const domainMain = domainParts.length > 1 ? domainParts.slice(0, -1).join('.') : domainParts[0] ?? ''
    const domainMasked = domainMain ? `${domainMain[0]}***` : '***'
    return `${localMasked}@${domainMasked}.${tld}`
  } catch {
    return null
  }
}

type AnnouncementPollOptionInput = {
  id?: string | null
  text: string
}

type AnnouncementPollInput = {
  title: string
  options: AnnouncementPollOptionInput[]
}

const normalizePollOptions = (options: AnnouncementPollOptionInput[]) =>
  options
    .map((option, index) => ({
      id: String(option.id ?? '').trim() || null,
      text: String(option.text ?? '').trim(),
      sortOrder: index,
    }))
    .filter((option) => Boolean(option.text))

const validatePollInput = (title: string | null | undefined, options: AnnouncementPollOptionInput[] | null | undefined) => {
  const normalizedTitle = String(title ?? '').trim()
  const normalizedOptions = normalizePollOptions(options ?? [])
  if (!normalizedTitle) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Poll title is required' })
  }
  if (normalizedOptions.length < POLL_OPTION_MIN_COUNT) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least two answers' })
  }
  if (normalizedOptions.length > POLL_OPTION_MAX_COUNT) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A poll can have at most ten answers' })
  }
  return {
    title: normalizedTitle.slice(0, POLL_TITLE_MAX_LENGTH),
    options: normalizedOptions.map((option) => ({
      ...option,
      text: option.text.slice(0, POLL_OPTION_MAX_LENGTH),
    })),
  }
}

const parsePollInput = (poll: AnnouncementPollInput | null | undefined) => {
  if (!poll) return null
  return validatePollInput(poll.title, poll.options)
}

const reconcileAnnouncementPoll = async (
  tx: any,
  announcementId: string,
  pollInput: AnnouncementPollInput | null | undefined,
  removePoll = false,
) => {
  if (removePoll) {
    const existingPoll = await tx.clubAnnouncementPoll.findUnique({
      where: { announcementId },
      select: { id: true },
    })
    if (existingPoll) {
      await tx.clubAnnouncementPoll.delete({ where: { id: existingPoll.id } })
    }
    return
  }

  const normalized = parsePollInput(pollInput)
  if (!normalized) return

  const existingPoll = await tx.clubAnnouncementPoll.findUnique({
    where: { announcementId },
    select: { id: true },
  })

  if (!existingPoll) {
    await tx.clubAnnouncementPoll.create({
      data: {
        announcementId,
        title: normalized.title,
        options: {
          create: normalized.options.map((option) => ({
            text: option.text,
            sortOrder: option.sortOrder,
          })),
        },
      },
    })
    return
  }

  await tx.clubAnnouncementPoll.update({
    where: { id: existingPoll.id },
    data: { title: normalized.title },
  })

  const existingOptions: { id: string }[] = await tx.clubAnnouncementPollOption.findMany({
    where: { pollId: existingPoll.id },
    select: { id: true },
  })
  const existingOptionIds = new Set<string>(existingOptions.map((option) => option.id))
  const keptOptionIds = new Set<string>()

  for (const option of normalized.options) {
    if (option.id && existingOptionIds.has(option.id)) {
      keptOptionIds.add(option.id)
      await tx.clubAnnouncementPollOption.update({
        where: { id: option.id },
        data: {
          text: option.text,
          sortOrder: option.sortOrder,
        },
      })
    } else {
      const created = await tx.clubAnnouncementPollOption.create({
        data: {
          pollId: existingPoll.id,
          text: option.text,
          sortOrder: option.sortOrder,
        },
        select: { id: true },
      })
      keptOptionIds.add(created.id)
    }
  }

  const removedOptionIds = Array.from(existingOptionIds).filter((id) => !keptOptionIds.has(id))
  if (removedOptionIds.length > 0) {
    await tx.clubAnnouncementPollOption.deleteMany({
      where: { id: { in: removedOptionIds } },
    })
  }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const resolveAppBaseUrl = (baseUrlFromClient?: string | null) => {
  const fromClient = String(baseUrlFromClient ?? '').trim()
  if (fromClient) {
    try {
      const parsed = new URL(fromClient)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.protocol}//${parsed.host}`
      }
    } catch {
      // Fall through to env.
    }
  }

  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (env) {
    const normalized = env.startsWith('http') ? env : `https://${env}`
    return normalized.replace(/\/$/, '')
  }

  return 'http://localhost:3000'
}

const buildClubInviteEmailHtml = (args: {
  baseUrl: string
  inviteUrl: string
  inviterName: string
  clubName: string
  clubLogoUrl?: string | null
  inviteeName?: string | null
  inviteeEmail: string
  city?: string | null
  state?: string | null
}) => {
  const {
    baseUrl,
    inviteUrl,
    inviterName,
    clubName,
    clubLogoUrl,
    inviteeName,
    inviteeEmail,
    city,
    state,
  } = args
  const safeClubName = escapeHtml(clubName)
  const safeInviterName = escapeHtml(inviterName)
  const safeInviteeName = inviteeName ? escapeHtml(inviteeName) : null
  const safeInviteeEmail = escapeHtml(inviteeEmail)
  const safeInviteUrl = escapeHtml(inviteUrl)
  const safeLocation = [city, state]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ')
  const logoUrl = `${baseUrl}/Logo.png`
  const clubImageUrl = clubLogoUrl || `${baseUrl}/tournament-placeholder.png`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation: ${safeClubName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="Logo" width="120" height="40" style="display: block; max-width: 120px; height: auto;" />
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 28px 24px 20px; text-align: center;">
                    <p style="margin: 0 0 8px; font-size: 15px; color: #6b7280;">${safeInviteeName ? `Hi ${safeInviteeName},` : 'Hi,'}</p>
                    <p style="margin: 0 0 20px; font-size: 15px; color: #6b7280;">${safeInviterName} invited you to join this club</p>
                    <img src="${clubImageUrl}" alt="" width="80" height="80" style="display: block; width: 80px; height: 80px; object-fit: cover; border-radius: 8px; margin: 0 auto 12px;" />
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827;">${safeClubName}</h1>
                    ${safeLocation ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">${escapeHtml(safeLocation)}</p>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 24px 28px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280;">Use this button to open the club page and join.</p>
                    <a href="${safeInviteUrl}" style="display: inline-block; padding: 12px 24px; background: #22c55e; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Join club</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 0; text-align: center; font-size: 12px; color: #9ca3af;">
              This invitation was sent to ${safeInviteeEmail}. If you were not expecting this email, you can ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

const decimalToNumber = (val: any): number | null => {
  if (val === null || val === undefined) return null
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  if (typeof val === 'string') {
    const n = Number(val)
    return Number.isFinite(n) ? n : null
  }
  if (typeof val.toNumber === 'function') {
    const n = val.toNumber()
    return Number.isFinite(n) ? n : null
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

const formatGenderLabel = (genders: Set<string>) => {
  const parts: string[] = []
  if (genders.has('MEN')) parts.push('Men')
  if (genders.has('WOMEN')) parts.push('Women')
  if (genders.has('MIXED')) parts.push('Mixed')
  if (parts.length === 0) return 'Any'
  return parts.join('/')
}

const computeDuprSummary = (mins: number[], maxs: number[]) => {
  const min = mins.length ? Math.min(...mins) : null
  const max = maxs.length ? Math.max(...maxs) : null
  const fmt = (n: number) => n.toFixed(2).replace(/\.?0+$/, '')

  if (min === null && max === null) {
    return { duprMin: null as number | null, duprMax: null as number | null, duprLabel: 'DUPR Open' as string | null }
  }

  if (min !== null && max !== null) {
    return { duprMin: min, duprMax: max, duprLabel: `DUPR ${fmt(min)}-${fmt(max)}` }
  }

  if (min !== null) {
    return { duprMin: min, duprMax: null, duprLabel: `DUPR ${fmt(min)}+` }
  }

  return { duprMin: null, duprMax: max, duprLabel: `DUPR ≤${fmt(max!)}` }
}

const optionalHttpUrl = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val
    const trimmed = val.trim()
    if (!trimmed) return undefined

    // Allow users to paste "example.com" without scheme; normalize to https.
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    return hasScheme ? trimmed : `https://${trimmed}`
  },
  z
    .string()
    .url()
    .optional()
    .refine((url) => !url || url.startsWith('http://') || url.startsWith('https://'), {
      message: 'Invalid url',
    })
)

const clubCreateInput = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum(['VENUE', 'COMMUNITY']).default('VENUE'),
  joinPolicy: z.enum(['OPEN', 'APPROVAL']).default('OPEN'),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  courtReserveUrl: optionalHttpUrl,
  bookingRequestEmail: z.string().email().optional(),
})

const clubUpdateInput = clubCreateInput.extend({
  id: z.string(),
})

export const clubRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          query: z.string().max(120).optional(),
          kind: z.enum(['VENUE', 'COMMUNITY']).optional(),
          city: z.string().max(120).optional(),
          state: z.string().max(120).optional(),
          verifiedOnly: z.boolean().optional(),
          hasBooking: z.boolean().optional(),
          hasUpcomingEvents: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const userId = ctx.session?.user?.id ?? DUMMY_USER_ID
      const upcomingWindow = {
        OR: [{ endDate: { gte: now } }, { startDate: { gte: now } }],
      }

      let bannedClubIds = new Set<string>()
      if (userId !== DUMMY_USER_ID) {
        try {
          const bans = await ctx.prisma.clubBan.findMany({
            where: { userId },
            select: { clubId: true },
          })
          bannedClubIds = new Set(bans.map((b) => b.clubId))
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_bans')) throw err
          bannedClubIds = new Set<string>()
        }
      }

      const where: any = {}
      if (input?.query?.trim()) {
        where.name = { contains: input.query.trim(), mode: 'insensitive' as const }
      }
      if (input?.kind) {
        where.kind = input.kind
      }
      if (input?.city?.trim()) {
        where.city = { contains: input.city.trim(), mode: 'insensitive' as const }
      }
      if (input?.state?.trim()) {
        where.state = { equals: input.state.trim().toUpperCase(), mode: 'insensitive' as const }
      }
      if (input?.verifiedOnly) {
        where.isVerified = true
      }
      if (input?.hasBooking) {
        where.courtReserveUrl = { not: null }
      }
      if (input?.hasUpcomingEvents) {
        // Only count public/published events as "upcoming" for discovery.
        where.tournaments = {
          some: {
            isPublicBoardEnabled: true,
            ...upcomingWindow,
          },
        }
      }

      const clubs = await ctx.prisma.club.findMany({
        where,
        orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          kind: true,
          joinPolicy: true,
          logoUrl: true,
          address: true,
          city: true,
          state: true,
          isVerified: true,
          courtReserveUrl: true,
          _count: {
            select: {
              followers: true,
              tournaments: true,
            },
          },
          followers: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          admins: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          joinRequests: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          tournaments: {
            // Include both upcoming and currently running tournaments.
            where: { isPublicBoardEnabled: true, ...upcomingWindow },
            orderBy: { startDate: 'asc' },
            take: 1,
            select: {
              id: true,
              clubId: true,
              title: true,
              startDate: true,
              endDate: true,
              timezone: true,
              publicSlug: true,
              entryFeeCents: true,
            },
          },
        },
      })

      const visibleClubs =
        bannedClubIds.size > 0 ? clubs.filter((club) => !bannedClubIds.has(club.id)) : clubs

      const clubIds = visibleClubs.map((c) => c.id)
      const creatorsByClubId = new Map<string, string>()
      if (clubIds.length > 0) {
        const admins = await ctx.prisma.clubAdmin.findMany({
          where: { clubId: { in: clubIds } },
          orderBy: { createdAt: 'asc' },
          select: { clubId: true, userId: true },
        })
        for (const a of admins) {
          if (!creatorsByClubId.has(a.clubId)) creatorsByClubId.set(a.clubId, a.userId)
        }
      }
      const creatorInFollowers = new Set<string>()
      if (creatorsByClubId.size > 0) {
        const pairs = Array.from(creatorsByClubId.entries()).map(([clubId, userId]) => ({ clubId, userId }))
        const rows = await ctx.prisma.clubFollower.findMany({
          where: { OR: pairs.map(({ clubId, userId }) => ({ clubId, userId })) },
          select: { clubId: true },
        })
        for (const r of rows) creatorInFollowers.add(r.clubId)
      }

      return visibleClubs.map((club) => {
        const creatorId = creatorsByClubId.get(club.id)
        const includeCreator = creatorId != null && !creatorInFollowers.has(club.id)
        const membersCount = club._count.followers + (includeCreator ? 1 : 0)
        return {
          id: club.id,
          name: club.name,
          kind: club.kind,
          joinPolicy: club.joinPolicy ?? 'OPEN',
          logoUrl: club.logoUrl,
          address: club.address,
          city: club.city,
          state: club.state,
          isVerified: club.isVerified,
          hasBooking: Boolean(club.courtReserveUrl),
          followersCount: membersCount,
          tournamentsCount: club._count.tournaments,
          isFollowing: club.followers.length > 0 && userId !== DUMMY_USER_ID,
          isAdmin: club.admins.length > 0 && userId !== DUMMY_USER_ID,
          isJoinPending: (club.joinRequests?.length ?? 0) > 0 && userId !== DUMMY_USER_ID,
          nextTournament: club.tournaments[0] ?? null,
        }
      })
    }),

  listMyChatClubs: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const clubs = await ctx.prisma.club.findMany({
      where: {
        OR: [
          { followers: { some: { userId } } },
          { admins: { some: { userId } } },
        ],
        bans: {
          none: {
            userId,
          },
        },
      },
      orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        kind: true,
        joinPolicy: true,
        logoUrl: true,
        city: true,
        state: true,
        isVerified: true,
        followers: {
          where: { userId },
          select: { id: true },
          take: 1,
        },
        admins: {
          where: { userId },
          select: { id: true },
          take: 1,
        },
      },
    })

    const clubIds = clubs.map((club) => club.id)
    let hasReadStates = true
    const readStateByClubId = new Map<string, Date>()

    if (clubIds.length > 0) {
      try {
        const readStates = await ctx.prisma.clubChatReadState.findMany({
          where: {
            userId,
            clubId: { in: clubIds },
          },
          select: {
            clubId: true,
            lastReadAt: true,
          },
        })
        for (const state of readStates) {
          readStateByClubId.set(state.clubId, state.lastReadAt)
        }
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_chat_read_states')) {
          hasReadStates = false
        } else {
          throw err
        }
      }
    }

    const unreadCountByClubId = new Map<string, number>()
    const lastMessageAtByClubId = new Map<string, Date | null>()
    if (hasReadStates && clubIds.length > 0) {
      await Promise.all(
        clubIds.map(async (clubId) => {
          const lastReadAt = readStateByClubId.get(clubId)
          const [unreadCount, lastMessage] = await Promise.all([
            ctx.prisma.clubChatMessage.count({
              where: {
                clubId,
                deletedAt: null,
                userId: { not: userId },
                ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
              },
            }),
            ctx.prisma.clubChatMessage.findFirst({
              where: {
                clubId,
                deletedAt: null,
              },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
          ])
          unreadCountByClubId.set(clubId, unreadCount)
          lastMessageAtByClubId.set(clubId, lastMessage?.createdAt ?? null)
        })
      )
    } else if (clubIds.length > 0) {
      await Promise.all(
        clubIds.map(async (clubId) => {
          const lastMessage = await ctx.prisma.clubChatMessage.findFirst({
            where: {
              clubId,
              deletedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          })
          lastMessageAtByClubId.set(clubId, lastMessage?.createdAt ?? null)
        })
      )
    }

    return clubs.map((club) => ({
      id: club.id,
      name: club.name,
      kind: club.kind,
      joinPolicy: club.joinPolicy ?? 'OPEN',
      logoUrl: club.logoUrl,
      city: club.city,
      state: club.state,
      isVerified: club.isVerified,
      isFollowing: club.followers.length > 0,
      isAdmin: club.admins.length > 0,
      unreadCount: hasReadStates ? unreadCountByClubId.get(club.id) ?? 0 : 0,
      lastMessageAt: lastMessageAtByClubId.get(club.id) ?? null,
    }))
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const userId = ctx.session?.user?.id ?? DUMMY_USER_ID
      const upcomingWindow = {
        OR: [{ endDate: { gte: now } }, { startDate: { gte: now } }],
      }

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          kind: true,
          joinPolicy: true,
          description: true,
          logoUrl: true,
          address: true,
          city: true,
          state: true,
          country: true,
          isVerified: true,
          courtReserveUrl: true,
          bookingRequestEmail: true,
          createdAt: true,
          _count: { select: { followers: true } },
          followers: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          admins: {
            where: { userId },
            select: { id: true, role: true },
            take: 1,
          },
          tournaments: {
            // Club page should show all upcoming/running club tournaments, including private ones.
            where: upcomingWindow,
            orderBy: { startDate: 'asc' },
            take: 20,
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              timezone: true,
              entryFeeCents: true,
              publicSlug: true,
              format: true,
              image: true,
              venueName: true,
              venueAddress: true,
            },
          },
          announcements: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              title: true,
              body: true,
              imageUrl: true,
              imageWidth: true,
              imageHeight: true,
              locationLatitude: true,
              locationLongitude: true,
              locationTitle: true,
              locationAddress: true,
              fileUrl: true,
              fileName: true,
              fileMimeType: true,
              fileSize: true,
              poll: {
                select: {
                  id: true,
                  title: true,
                  votes:
                    userId === DUMMY_USER_ID
                      ? false
                      : {
                          where: { userId },
                          select: { optionId: true },
                          take: 1,
                        },
                  options: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      id: true,
                      text: true,
                      sortOrder: true,
                      _count: {
                        select: { votes: true },
                      },
                    },
                  },
                },
              },
              createdAt: true,
              updatedAt: true,
              createdByUser: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
              likes:
                userId === DUMMY_USER_ID
                  ? false
                  : {
                      where: { userId },
                      select: { id: true },
                      take: 1,
                    },
              _count: {
                select: {
                  likes: true,
                },
              },
            },
          },
        },
      })

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      const isAdmin = club.admins.length > 0 && userId !== DUMMY_USER_ID
      let isBanned = false
      if (userId !== DUMMY_USER_ID) {
        try {
          const ban = await ctx.prisma.clubBan.findUnique({
            where: { clubId_userId: { clubId: input.id, userId } },
            select: { id: true },
          })
          isBanned = Boolean(ban)
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_bans')) throw err
        }
      }

      if (isBanned) {
        // Hide existence for banned users.
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      let isJoinPending = false
      if (!isBanned && userId !== DUMMY_USER_ID && club.joinPolicy === 'APPROVAL') {
        try {
          const req = await ctx.prisma.clubJoinRequest.findUnique({
            where: { clubId_userId: { clubId: input.id, userId } },
            select: { id: true },
          })
          isJoinPending = Boolean(req)
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_join_requests')) throw err
        }
      }

      const tournamentIds = club.tournaments.map((t) => t.id)
      const tournamentStatsById = new Map<
        string,
        {
          totalSlots: number
          filledSlots: number
          genders: Set<string>
          duprMins: number[]
          duprMaxs: number[]
        }
      >()

      if (tournamentIds.length > 0) {
        const divisions = await ctx.prisma.division.findMany({
          where: { tournamentId: { in: tournamentIds } },
          select: {
            tournamentId: true,
            teamKind: true,
            maxTeams: true,
            constraints: {
              select: {
                genders: true,
                minDupr: true,
                maxDupr: true,
                minTeamDupr: true,
                maxTeamDupr: true,
              },
            },
            teams: {
              select: {
                id: true,
                _count: { select: { teamPlayers: true } },
              },
            },
          },
        })

        for (const division of divisions) {
          const agg =
            tournamentStatsById.get(division.tournamentId) ??
            {
              totalSlots: 0,
              filledSlots: 0,
              genders: new Set<string>(),
              duprMins: [],
              duprMaxs: [],
            }

          const slotCount = getTeamSlotCount(
            (division.teamKind ?? 'DOUBLES_2v2') as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
          )
          const teamsCount = division.teams.length || division.maxTeams || 0
          const totalSlots = teamsCount * slotCount
          const filledSlots = division.teams.reduce((sum, team) => {
            const teamPlayers = team._count.teamPlayers
            return sum + Math.min(teamPlayers, slotCount)
          }, 0)

          agg.totalSlots += totalSlots
          agg.filledSlots += filledSlots

          const g = division.constraints?.genders ?? 'ANY'
          agg.genders.add(g)

          const pushMin = (v: any) => {
            const n = decimalToNumber(v)
            if (n === null) return
            agg.duprMins.push(n)
          }
          const pushMax = (v: any) => {
            const n = decimalToNumber(v)
            if (n === null) return
            agg.duprMaxs.push(n)
          }

          pushMin(division.constraints?.minDupr)
          pushMin(division.constraints?.minTeamDupr)
          pushMax(division.constraints?.maxDupr)
          pushMax(division.constraints?.maxTeamDupr)

          tournamentStatsById.set(division.tournamentId, agg)
        }
      }

      const tournaments = club.tournaments.map((t) => {
        const stats = tournamentStatsById.get(t.id) ?? null
        const genderLabel = stats ? formatGenderLabel(stats.genders) : null
        const dupr = stats ? computeDuprSummary(stats.duprMins, stats.duprMaxs) : { duprMin: null, duprMax: null, duprLabel: null }
        return {
          ...t,
          totals: stats ? { totalSlots: stats.totalSlots, filledSlots: stats.filledSlots } : null,
          genderLabel,
          ...dupr,
        }
      })

      const [bookingRequests, pendingJoinRequestCount, creatorInFollowers] = await Promise.all([
        isAdmin
          ? ctx.prisma.clubBookingRequest.findMany({
              where: { clubId: input.id },
              orderBy: { createdAt: 'desc' },
              take: 30,
              select: {
                id: true,
                requesterName: true,
                requesterEmail: true,
                requesterPhone: true,
                desiredStart: true,
                durationMinutes: true,
                playersCount: true,
                message: true,
                status: true,
                createdAt: true,
              },
            })
          : [],
        isAdmin
          ? ctx.prisma.clubJoinRequest.count({ where: { clubId: input.id } }).catch(() => 0)
          : 0,
        (async () => {
          const firstAdmin = await ctx.prisma.clubAdmin.findFirst({
            where: { clubId: input.id },
            orderBy: { createdAt: 'asc' },
            select: { userId: true },
          })
          if (!firstAdmin) return true
          const follow = await ctx.prisma.clubFollower.findUnique({
            where: { clubId_userId: { clubId: input.id, userId: firstAdmin.userId } },
            select: { id: true },
          })
          return Boolean(follow)
        })(),
      ])

      const membersCount = club._count.followers + (creatorInFollowers ? 0 : 1)
      const announcements = club.announcements.map((announcement) => ({
        ...announcement,
        likeCount: announcement._count?.likes ?? 0,
        viewerHasLiked: Boolean(announcement.likes?.length),
        poll: announcement.poll
          ? {
              id: announcement.poll.id,
              title: announcement.poll.title,
              viewerOptionId: announcement.poll.votes?.[0]?.optionId ?? null,
              totalVotes: announcement.poll.options.reduce(
                (sum, option) => sum + Number(option._count?.votes ?? 0),
                0
              ),
              options: announcement.poll.options.map((option) => ({
                id: option.id,
                text: option.text,
                sortOrder: option.sortOrder,
                voteCount: Number(option._count?.votes ?? 0),
              })),
            }
          : null,
      }))

      return {
        ...club,
        announcements,
        tournaments,
        followersCount: membersCount,
        isFollowing: !isBanned && club.followers.length > 0 && userId !== DUMMY_USER_ID,
        isJoinPending:
          !isBanned && club.followers.length === 0 && userId !== DUMMY_USER_ID ? isJoinPending : false,
        isAdmin,
        bookingRequests,
        isBanned,
        pendingJoinRequestCount: isAdmin ? pendingJoinRequestCount : 0,
      }
    }),

  toggleFollow: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { id: true, joinPolicy: true },
      })

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      const [existing, adminRole] = await Promise.all([
        ctx.prisma.clubFollower.findUnique({
          where: {
            clubId_userId: {
              clubId: input.clubId,
              userId,
            },
          },
          select: { id: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: {
            clubId_userId: {
              clubId: input.clubId,
              userId,
            },
          },
          select: { id: true },
        }),
      ])

      // Club admins are implicit members; don't allow join/leave toggle for them.
      if (adminRole) {
        return { isFollowing: true, isJoinPending: false, status: 'admin' as const }
      }

      if (existing) {
        await ctx.prisma.clubFollower.delete({ where: { id: existing.id } })
        // Best-effort cleanup in case a join request exists.
        try {
          await ctx.prisma.clubJoinRequest.deleteMany({
            where: { clubId: input.clubId, userId },
          })
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_join_requests')) throw err
        }
        try {
          await ctx.prisma.clubMemberLeaveLog.create({
            data: { clubId: input.clubId, leaverUserId: userId },
          })
          const admins = await ctx.prisma.clubAdmin.findMany({
            where: { clubId: input.clubId },
            select: { userId: true },
          })
          const adminIds = admins.map((a) => a.userId).filter((id) => id !== userId)
          pushToUsers(adminIds, { type: 'invalidate', keys: ['notification.list'] })
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_member_leave_logs')) throw err
        }
        return { isFollowing: false, isJoinPending: false, status: 'left' as const }
      }

      // If banned, block joining/requesting.
      try {
        const ban = await ctx.prisma.clubBan.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId } },
          select: { id: true },
        })
        if (ban) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You are banned from this club' })
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (!isMissingDbRelation(err, 'club_bans')) throw err
      }

      if (club.joinPolicy === 'APPROVAL') {
        try {
          await ctx.prisma.clubJoinRequest.upsert({
            where: { clubId_userId: { clubId: input.clubId, userId } },
            create: { clubId: input.clubId, userId },
            update: {},
          })
        } catch (err: any) {
          if (isMissingDbRelation(err, 'club_join_requests')) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'club_join_requests table is missing. Apply DB migration first.',
            })
          }
          throw err
        }

        const admins = await ctx.prisma.clubAdmin.findMany({
          where: { clubId: input.clubId },
          select: { userId: true },
        })
        const adminIds = admins.map((a) => a.userId).filter((id) => id !== userId)
        pushToUsers(adminIds, { type: 'invalidate', keys: ['notification.list'] })

        return { isFollowing: false, isJoinPending: true, status: 'pending' as const }
      }

      await ctx.prisma.clubFollower.create({
        data: {
          clubId: input.clubId,
          userId,
        },
      })

      try {
        await ctx.prisma.clubMemberJoinLog.create({
          data: { clubId: input.clubId, joinerUserId: userId },
        })
        const admins = await ctx.prisma.clubAdmin.findMany({
          where: { clubId: input.clubId },
          select: { userId: true },
        })
        const adminIds = admins.map((a) => a.userId).filter((id) => id !== userId)
        pushToUsers(adminIds, { type: 'invalidate', keys: ['notification.list'] })
      } catch (err: any) {
        if (!isMissingDbRelation(err, 'club_member_join_logs')) throw err
      }

      // Best-effort cleanup: open clubs should not have join requests.
      try {
        await ctx.prisma.clubJoinRequest.deleteMany({
          where: { clubId: input.clubId, userId },
        })
      } catch (err: any) {
        if (!isMissingDbRelation(err, 'club_join_requests')) throw err
      }

      return { isFollowing: true, isJoinPending: false, status: 'joined' as const }
    }),

  cancelJoinRequest: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { id: true },
      })
      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      try {
        await ctx.prisma.clubJoinRequest.deleteMany({
          where: { clubId: input.clubId, userId },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_join_requests')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_join_requests table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      return { success: true }
    }),

  create: protectedProcedure.input(clubCreateInput).mutation(async ({ ctx, input }) => {
    try {
      const club = await ctx.prisma.club.create({
        data: {
          name: input.name.trim(),
          kind: input.kind,
          joinPolicy: input.joinPolicy,
          description: input.description?.trim() || null,
          logoUrl: input.logoUrl?.trim() || null,
          address: input.address?.trim() || null,
          city: input.city?.trim() || null,
          state: input.state?.trim() || null,
          country: input.country?.trim() || null,
          courtReserveUrl: input.courtReserveUrl?.trim() || null,
          bookingRequestEmail: input.bookingRequestEmail?.trim() || null,
          isVerified: false,
          admins: {
            create: {
              userId: ctx.session.user.id,
              role: 'ADMIN',
            },
          },
        },
        select: {
          id: true,
        },
      })

      return club
    } catch (err: any) {
      if (isMissingDbColumn(err, 'join_policy')) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'clubs.join_policy column is missing. Apply DB migration first.',
        })
      }
      throw err
    }
  }),

  update: protectedProcedure.input(clubUpdateInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id

    const isAdmin = await ctx.prisma.clubAdmin.findUnique({
      where: { clubId_userId: { clubId: input.id, userId } },
      select: { id: true },
    })
    if (!isAdmin) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can edit this club' })
    }

    try {
      const nextClubName = input.name.trim()
      const club = await ctx.prisma.$transaction(async (tx) => {
        const currentClub = await tx.club.findUnique({
          where: { id: input.id },
          select: { name: true },
        })
        if (!currentClub) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
        }

        const updatedClub = await tx.club.update({
          where: { id: input.id },
          data: {
            name: nextClubName,
            kind: input.kind,
            joinPolicy: input.joinPolicy,
            description: input.description?.trim() || null,
            logoUrl: input.logoUrl?.trim() || null,
            address: input.address?.trim() || null,
            city: input.city?.trim() || null,
            state: input.state?.trim() || null,
            country: input.country?.trim() || null,
            courtReserveUrl: input.courtReserveUrl?.trim() || null,
            bookingRequestEmail: input.bookingRequestEmail?.trim() || null,
          },
          select: { id: true },
        })

        // Keep club tournament cards in sync when they display the club name from venueName.
        // We only touch records that still have the previous club name (or empty value),
        // so custom tournament venue names are preserved.
        await tx.tournament.updateMany({
          where: {
            clubId: input.id,
            OR: [{ venueName: currentClub.name }, { venueName: null }, { venueName: '' }],
          },
          data: {
            venueName: nextClubName,
          },
        })

        return updatedClub
      })

      return club
    } catch (err: any) {
      if (isMissingDbColumn(err, 'join_policy')) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'clubs.join_policy column is missing. Apply DB migration first.',
        })
      }
      throw err
    }
  }),

  delete: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can delete this club' })
      }

      await ctx.prisma.club.delete({
        where: { id: input.clubId },
      })

      return { success: true }
    }),

  createAnnouncement: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        title: z.string().max(120).optional(),
        body: z.string().min(1).max(2000),
        imageUrl: z.string().url().optional(),
        imageWidth: z.number().int().positive().max(10000).nullable().optional(),
        imageHeight: z.number().int().positive().max(10000).nullable().optional(),
        locationLatitude: z.number().finite().nullable().optional(),
        locationLongitude: z.number().finite().nullable().optional(),
        locationTitle: z.string().max(200).nullable().optional(),
        locationAddress: z.string().max(400).nullable().optional(),
        fileUrl: z.string().url().optional(),
        fileName: z.string().max(240).nullable().optional(),
        fileMimeType: z.string().max(120).nullable().optional(),
        fileSize: z.number().int().nonnegative().nullable().optional(),
        poll: z
          .object({
            title: z.string().max(POLL_TITLE_MAX_LENGTH),
            options: z
              .array(
                z.object({
                  id: z.string().optional(),
                  text: z.string().max(POLL_OPTION_MAX_LENGTH),
                })
              )
              .min(POLL_OPTION_MIN_COUNT)
              .max(POLL_OPTION_MAX_COUNT),
          })
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: {
          clubId_userId: {
            clubId: input.clubId,
            userId,
          },
        },
        select: { id: true },
      })

      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can post announcements' })
      }

      const announcement = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.clubAnnouncement.create({
          data: {
            clubId: input.clubId,
            title: input.title?.trim() || null,
            body: input.body.trim(),
            imageUrl: input.imageUrl?.trim() || null,
            imageWidth: input.imageWidth ?? null,
            imageHeight: input.imageHeight ?? null,
            locationLatitude: input.locationLatitude ?? null,
            locationLongitude: input.locationLongitude ?? null,
            locationTitle: input.locationTitle?.trim() || null,
            locationAddress: input.locationAddress?.trim() || null,
            fileUrl: input.fileUrl?.trim() || null,
            fileName: input.fileName?.trim() || null,
            fileMimeType: input.fileMimeType?.trim() || null,
            fileSize: input.fileSize ?? null,
            createdByUserId: userId,
          },
          select: { id: true },
        })

        await reconcileAnnouncementPoll(tx, created.id, input.poll)

        return tx.clubAnnouncement.findUnique({
          where: { id: created.id },
          include: {
            createdByUser: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        })
      })

      return announcement
    }),

  updateAnnouncement: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        announcementId: z.string(),
        title: z.string().max(120).optional(),
        body: z.string().min(1).max(2000),
        imageUrl: z.string().url().optional(),
        imageWidth: z.number().int().positive().max(10000).nullable().optional(),
        imageHeight: z.number().int().positive().max(10000).nullable().optional(),
        locationLatitude: z.number().finite().nullable().optional(),
        locationLongitude: z.number().finite().nullable().optional(),
        locationTitle: z.string().max(200).nullable().optional(),
        locationAddress: z.string().max(400).nullable().optional(),
        fileUrl: z.string().url().optional(),
        fileName: z.string().max(240).nullable().optional(),
        fileMimeType: z.string().max(120).nullable().optional(),
        fileSize: z.number().int().nonnegative().nullable().optional(),
        removeImage: z.boolean().optional(),
        removeLocation: z.boolean().optional(),
        removeFile: z.boolean().optional(),
        removePoll: z.boolean().optional(),
        poll: z
          .object({
            title: z.string().max(POLL_TITLE_MAX_LENGTH),
            options: z
              .array(
                z.object({
                  id: z.string().optional(),
                  text: z.string().max(POLL_OPTION_MAX_LENGTH),
                })
              )
              .min(POLL_OPTION_MIN_COUNT)
              .max(POLL_OPTION_MAX_COUNT),
          })
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can edit announcements' })
      }

      const existing = await ctx.prisma.clubAnnouncement.findUnique({
        where: { id: input.announcementId },
        select: { id: true, clubId: true },
      })
      if (!existing || existing.clubId !== input.clubId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' })
      }

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const result = await tx.clubAnnouncement.update({
          where: { id: input.announcementId },
          data: {
            title: input.title?.trim() || null,
            body: input.body.trim(),
            imageUrl: input.removeImage ? null : input.imageUrl?.trim() || null,
            imageWidth: input.removeImage ? null : input.imageWidth ?? null,
            imageHeight: input.removeImage ? null : input.imageHeight ?? null,
            locationLatitude: input.removeLocation ? null : input.locationLatitude ?? null,
            locationLongitude: input.removeLocation ? null : input.locationLongitude ?? null,
            locationTitle: input.removeLocation ? null : input.locationTitle?.trim() || null,
            locationAddress: input.removeLocation ? null : input.locationAddress?.trim() || null,
            fileUrl: input.removeFile ? null : input.fileUrl?.trim() || null,
            fileName: input.removeFile ? null : input.fileName?.trim() || null,
            fileMimeType: input.removeFile ? null : input.fileMimeType?.trim() || null,
            fileSize: input.removeFile ? null : input.fileSize ?? null,
          },
          select: { id: true },
        })

        await reconcileAnnouncementPoll(tx, result.id, input.poll, input.removePoll)

        return tx.clubAnnouncement.findUnique({
          where: { id: result.id },
          include: {
            createdByUser: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        })
      })

      return updated
    }),

  deleteAnnouncement: protectedProcedure
    .input(z.object({ clubId: z.string(), announcementId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can delete announcements' })
      }

      const existing = await ctx.prisma.clubAnnouncement.findUnique({
        where: { id: input.announcementId },
        select: { id: true, clubId: true },
      })
      if (!existing || existing.clubId !== input.clubId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' })
      }

      await ctx.prisma.clubAnnouncement.delete({ where: { id: input.announcementId } })
      return { success: true }
    }),

  likeAnnouncement: protectedProcedure
    .input(z.object({ clubId: z.string(), announcementId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const [club, announcement, follower, admin] = await Promise.all([
        ctx.prisma.club.findUnique({
          where: { id: input.clubId },
          select: { id: true },
        }),
        ctx.prisma.clubAnnouncement.findUnique({
          where: { id: input.announcementId },
          select: { id: true, clubId: true },
        }),
        ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId } },
          select: { id: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId } },
          select: { id: true },
        }),
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }
      if (!announcement || announcement.clubId !== input.clubId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' })
      }
      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to like posts' })
      }

      const existingLike = await ctx.prisma.clubAnnouncementLike.findUnique({
        where: {
          announcementId_userId: {
            announcementId: input.announcementId,
            userId,
          },
        },
        select: { id: true },
      })

      if (existingLike) {
        await ctx.prisma.clubAnnouncementLike.delete({
          where: { id: existingLike.id },
        })
      } else {
        await ctx.prisma.clubAnnouncementLike.create({
          data: {
            announcementId: input.announcementId,
            userId,
          },
        })
      }

      const likeCount = await ctx.prisma.clubAnnouncementLike.count({
        where: { announcementId: input.announcementId },
      })

      return {
        announcementId: input.announcementId,
        likeCount,
        viewerHasLiked: !existingLike,
      }
    }),

  voteAnnouncementPoll: protectedProcedure
    .input(z.object({ clubId: z.string(), announcementId: z.string(), optionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const [club, announcement, follower, admin] = await Promise.all([
        ctx.prisma.club.findUnique({
          where: { id: input.clubId },
          select: { id: true },
        }),
        ctx.prisma.clubAnnouncement.findUnique({
          where: { id: input.announcementId },
          select: { id: true, clubId: true },
        }),
        ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId } },
          select: { id: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId } },
          select: { id: true },
        }),
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }
      if (!announcement || announcement.clubId !== input.clubId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' })
      }
      if (!follower && !admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to vote in polls' })
      }

      const poll = await ctx.prisma.clubAnnouncementPoll.findUnique({
        where: { announcementId: input.announcementId },
        select: {
          id: true,
          announcementId: true,
          options: {
            select: {
              id: true,
              text: true,
              sortOrder: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      })

      if (!poll) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Poll not found' })
      }

      const selectedOption = await ctx.prisma.clubAnnouncementPollOption.findFirst({
        where: { id: input.optionId, pollId: poll.id },
        select: { id: true },
      })

      if (!selectedOption) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Poll option not found' })
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.clubAnnouncementPollVote.upsert({
          where: { pollId_userId: { pollId: poll.id, userId } },
          create: {
            pollId: poll.id,
            optionId: selectedOption.id,
            userId,
          },
          update: {
            optionId: selectedOption.id,
          },
        })
      })

      const refreshed = await ctx.prisma.clubAnnouncementPoll.findUnique({
        where: { announcementId: input.announcementId },
        select: {
          id: true,
          title: true,
          votes: {
            where: { userId },
            select: { optionId: true },
            take: 1,
          },
          options: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              text: true,
              sortOrder: true,
              _count: {
                select: { votes: true },
              },
            },
          },
        },
      })

      return {
        announcementId: input.announcementId,
        pollId: poll.id,
        viewerOptionId: refreshed?.votes?.[0]?.optionId ?? selectedOption.id,
        totalVotes: refreshed?.options.reduce((sum, option) => sum + Number(option._count?.votes ?? 0), 0) ?? 0,
        options:
          refreshed?.options.map((option) => ({
            id: option.id,
            text: option.text,
            sortOrder: option.sortOrder,
            voteCount: Number(option._count?.votes ?? 0),
          })) ?? [],
      }
    }),

  createBookingRequest: publicProcedure
    .input(
      z.object({
        clubId: z.string(),
        requesterName: z.string().min(2).max(120),
        requesterEmail: z.string().email(),
        requesterPhone: z.string().max(60).optional(),
        desiredStart: z.string().optional(), // ISO string
        durationMinutes: z.number().int().min(15).max(8 * 60).optional(),
        playersCount: z.number().int().min(1).max(64).optional(),
        message: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const desiredStartDate = input.desiredStart ? new Date(input.desiredStart) : null
      if (desiredStartDate && Number.isNaN(desiredStartDate.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid desiredStart' })
      }

      await ctx.prisma.clubBookingRequest.create({
        data: {
          clubId: input.clubId,
          requesterUserId: ctx.session?.user?.id ?? null,
          requesterName: input.requesterName.trim(),
          requesterEmail: input.requesterEmail.trim(),
          requesterPhone: input.requesterPhone?.trim() || null,
          desiredStart: desiredStartDate,
          durationMinutes: input.durationMinutes ?? null,
          playersCount: input.playersCount ?? null,
          message: input.message?.trim() || null,
          status: 'NEW',
        },
      })

      return { success: true }
    }),

  sendInvite: protectedProcedure
    .input(
      z
        .object({
          clubId: z.string(),
          inviteeUserId: z.string().optional(),
          inviteeEmail: z.string().email().optional(),
          baseUrl: z.string().optional().nullable(),
        })
        .refine((v) => Boolean(v.inviteeUserId || v.inviteeEmail), {
          message: 'Invitee is required',
        })
    )
    .mutation(async ({ ctx, input }) => {
      const inviterUserId = ctx.session.user.id

      const [club, adminRole] = await Promise.all([
        ctx.prisma.club.findUnique({
          where: { id: input.clubId },
          select: { id: true, name: true, logoUrl: true, city: true, state: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: inviterUserId } },
          select: { id: true, role: true },
        }),
      ])

      if (!club) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      }

      // Email invites are admin/moderator-only to prevent spam.
      if (!adminRole) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can send email invites' })
      }

      if (input.inviteeUserId && input.inviteeUserId === inviterUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot invite yourself' })
      }

      let toEmail = input.inviteeEmail?.trim() || null
      let toName: string | null = null

      if (input.inviteeUserId) {
        const user = await ctx.prisma.user.findUnique({
          where: { id: input.inviteeUserId },
          select: { email: true, name: true },
        })
        if (!user?.email) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'User email not found' })
        }
        toEmail = user.email
        toName = user.name ?? null

        const alreadyJoined = await ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: club.id, userId: input.inviteeUserId } },
          select: { id: true },
        })
        if (alreadyJoined) {
          return { success: true, delivered: false, reason: 'already_joined' as const }
        }
      }

      if (!toEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitee email is required' })
      }

      const baseUrl = resolveAppBaseUrl(input.baseUrl)

      const inviteUrl = `${baseUrl}/clubs/${club.id}?ref=invite`

      // Rate limiting (requires club_invites table; safe to skip if migration isn't applied yet).
      const invitesPerDay = 20
      const invitesPerMinute = 5
      const now = new Date()
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const minuteAgo = new Date(now.getTime() - 60 * 1000)

      try {
        const [countDay, countMin] = await Promise.all([
          ctx.prisma.clubInvite.count({
            where: { clubId: club.id, inviterUserId, createdAt: { gte: dayAgo } },
          }),
          ctx.prisma.clubInvite.count({
            where: { clubId: club.id, inviterUserId, createdAt: { gte: minuteAgo } },
          }),
        ])

        if (countDay >= invitesPerDay || countMin >= invitesPerMinute) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `Invite limit reached (${invitesPerDay}/day, ${invitesPerMinute}/minute).`,
          })
        }

        const recentDuplicate = await ctx.prisma.clubInvite.findFirst({
          where: { clubId: club.id, inviteeEmail: toEmail, createdAt: { gte: dayAgo } },
          select: { id: true },
        })
        if (recentDuplicate) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This email was already invited recently.' })
        }
      } catch (err: any) {
        const msg = String(err?.message ?? '')
        // If the table doesn't exist yet (migration not applied), skip rate limiting for now.
        if (!msg.toLowerCase().includes('club_invites') && !msg.toLowerCase().includes('does not exist')) {
          throw err
        }
      }

      const emailHost = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST
      const emailUser = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER || 'Piqle'
      const emailPassword = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD
      const emailPort = process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || '587'

      // Persist invite attempt (best effort; safe to skip if migration isn't applied yet).
      let inviteId: string | null = null
      try {
        const invite = await ctx.prisma.clubInvite.create({
          data: {
            clubId: club.id,
            inviterUserId,
            inviteeUserId: input.inviteeUserId ?? null,
            inviteeEmail: toEmail,
            delivered: false,
          },
          select: { id: true },
        })
        inviteId = invite.id
      } catch (err: any) {
        const msg = String(err?.message ?? '')
        if (!msg.toLowerCase().includes('club_invites') && !msg.toLowerCase().includes('does not exist')) {
          throw err
        }
      }

      if (!emailHost || !emailPassword) {
        // In development, don't block flows if SMTP isn't configured yet.
        if (process.env.NODE_ENV === 'development') {
          console.log('[club.sendInvite] SMTP not configured. Would send invite:', {
            toEmail,
            clubId: club.id,
            clubName: club.name,
            inviteUrl,
          })
          return { success: true, delivered: false, reason: 'smtp_missing' as const }
        }

        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Email is not configured (SMTP_HOST/SMTP_PASS).',
        })
      }

      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.default.createTransport({
        host: emailHost,
        port: parseInt(emailPort),
        secure: String(emailPort) === '465',
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      })

      const fromEmail = process.env.SMTP_FROM || process.env.EMAIL_FROM || emailUser
      const fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Piqle'
      const fromAddress = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail

      const inviterName = ctx.session.user.name || 'Someone'
      const subject = `${inviterName} invited you to join ${club.name} on Piqle`
      const greeting = toName ? `Hi ${toName},` : 'Hi,'
      const text = `${greeting}

${inviterName} invited you to join the club "${club.name}" on Piqle.

Join here: ${inviteUrl}

If you weren’t expecting this, you can ignore this email.`
      const html = buildClubInviteEmailHtml({
        baseUrl,
        inviteUrl,
        inviterName,
        clubName: club.name,
        clubLogoUrl: club.logoUrl,
        inviteeName: toName,
        inviteeEmail: toEmail,
        city: club.city,
        state: club.state,
      })

      await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject,
        text,
        html,
      })

      if (inviteId) {
        try {
          await ctx.prisma.clubInvite.update({
            where: { id: inviteId },
            data: { delivered: true },
          })
        } catch (err: any) {
          const msg = String(err?.message ?? '')
          if (!msg.toLowerCase().includes('club_invites') && !msg.toLowerCase().includes('does not exist')) {
            throw err
          }
        }
      }

      return { success: true, delivered: true, reason: null as null }
    }),

  listMembers: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const [myAdminRole, myFollow] = await Promise.all([
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
          select: { role: true },
        }),
        ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
          select: { id: true },
        }),
      ])

      const canModerate = Boolean(myAdminRole)
      const canView = canModerate || Boolean(myFollow)
      if (!canView) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this club to view members' })
      }

      const [followers, admins] = await Promise.all([
        ctx.prisma.clubFollower.findMany({
          where: { clubId: input.clubId },
          orderBy: { createdAt: 'desc' },
          take: 500,
          select: {
            userId: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                email: true, // only used to compute masked value
              },
            },
          },
        }),
        ctx.prisma.clubAdmin.findMany({
          where: { clubId: input.clubId },
          select: {
            userId: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                email: true, // only used to compute masked value
              },
            },
          },
        }),
      ])

      const adminRoleByUserId = new Map(admins.map((a) => [a.userId, a.role] as const))
      const memberByUserId = new Map<
        string,
        {
          userId: string
          joinedAt: Date
          role: string | null
          user: {
            id: string
            name: string | null
            image: string | null
            emailMasked: string | null
          }
        }
      >()

      for (const follower of followers) {
        memberByUserId.set(follower.userId, {
          userId: follower.userId,
          joinedAt: follower.createdAt,
          role: adminRoleByUserId.get(follower.userId) ?? null,
          user: {
            id: follower.user.id,
            name: follower.user.name,
            image: follower.user.image,
            emailMasked: maskEmail(follower.user.email),
          },
        })
      }

      for (const admin of admins) {
        if (memberByUserId.has(admin.userId)) continue
        memberByUserId.set(admin.userId, {
          userId: admin.userId,
          joinedAt: admin.createdAt,
          role: admin.role,
          user: {
            id: admin.user.id,
            name: admin.user.name,
            image: admin.user.image,
            emailMasked: maskEmail(admin.user.email),
          },
        })
      }

      const members = Array.from(memberByUserId.values()).sort(
        (a, b) => b.joinedAt.getTime() - a.joinedAt.getTime()
      )

      const memberUserIds = members.map((member) => member.userId)
      let tagRows: Array<{ userId: string; label: string }> = []
      try {
        tagRows =
          memberUserIds.length > 0
            ? await ctx.prisma.clubChatMemberTag.findMany({
                where: { clubId: input.clubId, userId: { in: memberUserIds } },
                select: { userId: true, label: true },
              })
            : []
      } catch (err: any) {
        if (!isMissingDbRelation(err, 'club_chat_member_tags')) throw err
        tagRows = []
      }
      const tagByUserId = new Map(tagRows.map((row) => [row.userId, row.label] as const))

      const [readStates, latestMessages] =
        memberUserIds.length > 0
          ? await Promise.all([
              ctx.prisma.clubChatReadState.findMany({
                where: { clubId: input.clubId, userId: { in: memberUserIds } },
                select: { userId: true, lastReadAt: true },
              }),
              ctx.prisma.clubChatMessage.groupBy({
                by: ['userId'],
                where: { clubId: input.clubId, userId: { in: memberUserIds } },
                _max: { createdAt: true },
              }),
            ])
          : [[], []]

      const lastReadAtByUserId = new Map(readStates.map((row) => [row.userId, row.lastReadAt] as const))
      const lastMessageAtByUserId = new Map(
        latestMessages.map((row: any) => [String(row.userId), row._max?.createdAt ?? null] as const)
      )

      let bans: Array<{
        userId: string
        reason: string | null
        createdAt: Date
        user: { id: string; name: string | null; image: string | null; email: string }
        bannedByUserId: string
        bannedByUser: { id: string; name: string | null; image: string | null }
      }> = []

      if (canModerate) {
        try {
          bans = await ctx.prisma.clubBan.findMany({
            where: { clubId: input.clubId },
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
              userId: true,
              reason: true,
              createdAt: true,
              bannedByUserId: true,
              user: { select: { id: true, name: true, image: true, email: true } },
              bannedByUser: { select: { id: true, name: true, image: true } },
            },
          })
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_bans')) throw err
          bans = []
        }
      }

      let joinRequests: Array<{
        userId: string
        createdAt: Date
        user: { id: string; name: string | null; image: string | null; email: string }
      }> = []

      if (canModerate) {
        try {
          joinRequests = await ctx.prisma.clubJoinRequest.findMany({
            where: { clubId: input.clubId },
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
              userId: true,
              createdAt: true,
              user: { select: { id: true, name: true, image: true, email: true } },
            },
          })
        } catch (err: any) {
          if (!isMissingDbRelation(err, 'club_join_requests')) throw err
          joinRequests = []
        }
      }

      return {
        canModerate,
        myRole: myAdminRole?.role ?? null,
        members: members.map((member) => {
          const readAt = lastReadAtByUserId.get(member.userId) ?? null
          const messageAt = lastMessageAtByUserId.get(member.userId) ?? null
          const lastActiveAt =
            readAt && messageAt
              ? new Date(readAt).getTime() >= new Date(messageAt).getTime()
                ? readAt
                : messageAt
              : readAt ?? messageAt ?? null

          return {
            ...member,
            chatTag: tagByUserId.get(member.userId) ?? null,
            lastActiveAt,
          }
        }),
        bans: bans.map((b) => ({
          userId: b.userId,
          bannedAt: b.createdAt,
          reason: b.reason ?? null,
          user: {
            id: b.user.id,
            name: b.user.name,
            image: b.user.image,
            emailMasked: maskEmail(b.user.email),
          },
          bannedBy: {
            userId: b.bannedByUserId,
            name: b.bannedByUser.name,
            image: b.bannedByUser.image,
          },
        })),
        joinRequests: joinRequests.map((r) => ({
          userId: r.userId,
          requestedAt: r.createdAt,
          user: {
            id: r.user.id,
            name: r.user.name,
            image: r.user.image,
            emailMasked: maskEmail(r.user.email),
          },
        })),
      }
    }),

  setChatMemberTag: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        userId: z.string(),
        label: z.string().trim().min(1).max(24),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const [admin, targetFollower, targetAdmin] = await Promise.all([
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
          select: { id: true },
        }),
        ctx.prisma.clubFollower.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          select: { id: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          select: { id: true },
        }),
      ])

      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can assign chat tags' })
      }
      if (!targetFollower && !targetAdmin) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Club member not found' })
      }

      const label = input.label.trim()

      try {
        await ctx.prisma.clubChatMemberTag.upsert({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          create: {
            clubId: input.clubId,
            userId: input.userId,
            label,
          },
          update: {
            label,
          },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_chat_member_tags')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_chat_member_tags table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      const [followers, admins] = await Promise.all([
        ctx.prisma.clubFollower.findMany({
          where: { clubId: input.clubId },
          select: { userId: true },
        }),
        ctx.prisma.clubAdmin.findMany({
          where: { clubId: input.clubId },
          select: { userId: true },
        }),
      ])
      const recipientIds = Array.from(new Set([...followers.map((f) => f.userId), ...admins.map((a) => a.userId)]))
      pushToUsers(recipientIds, { type: 'invalidate', keys: ['club.listMembers', 'clubChat.listThread'] })

      return { success: true }
    }),

  deleteChatMemberTag: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id
      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })

      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can remove chat tags' })
      }

      try {
        await ctx.prisma.clubChatMemberTag.deleteMany({
          where: { clubId: input.clubId, userId: input.userId },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_chat_member_tags')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_chat_member_tags table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      const [followers, admins] = await Promise.all([
        ctx.prisma.clubFollower.findMany({
          where: { clubId: input.clubId },
          select: { userId: true },
        }),
        ctx.prisma.clubAdmin.findMany({
          where: { clubId: input.clubId },
          select: { userId: true },
        }),
      ])
      const recipientIds = Array.from(new Set([...followers.map((f) => f.userId), ...admins.map((a) => a.userId)]))
      pushToUsers(recipientIds, { type: 'invalidate', keys: ['club.listMembers', 'clubChat.listThread'] })

      return { success: true }
    }),

  kickMember: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can remove members' })
      }

      if (input.userId === currentUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot remove yourself' })
      }

      await ctx.prisma.clubFollower.deleteMany({
        where: { clubId: input.clubId, userId: input.userId },
      })

      return { success: true }
    }),

  approveJoinRequest: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can approve requests' })
      }

      // If the user is banned, don't allow approval.
      try {
        const ban = await ctx.prisma.clubBan.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          select: { id: true },
        })
        if (ban) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This user is banned from the club' })
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (!isMissingDbRelation(err, 'club_bans')) throw err
      }

      let req: { id: string } | null = null
      try {
        req = await ctx.prisma.clubJoinRequest.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          select: { id: true },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_join_requests')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_join_requests table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      if (!req) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Join request not found' })
      }

      await ctx.prisma.$transaction([
        ctx.prisma.clubFollower.upsert({
          where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
          create: { clubId: input.clubId, userId: input.userId },
          update: {},
        }),
        ctx.prisma.clubJoinRequest.delete({ where: { id: req.id } }),
      ])

      return { success: true }
    }),

  rejectJoinRequest: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can reject requests' })
      }

      try {
        await ctx.prisma.clubJoinRequest.deleteMany({
          where: { clubId: input.clubId, userId: input.userId },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_join_requests')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_join_requests table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      return { success: true }
    }),

  banUser: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        userId: z.string(),
        reason: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can ban users' })
      }

      if (input.userId === currentUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot ban yourself' })
      }

      const targetIsAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
        select: { id: true },
      })
      if (targetIsAdmin) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot ban a club admin/moderator. Remove admin role first.',
        })
      }

      const reason = input.reason?.trim() || null

      try {
        await ctx.prisma.$transaction([
          ctx.prisma.clubBan.upsert({
            where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
            create: {
              clubId: input.clubId,
              userId: input.userId,
              bannedByUserId: currentUserId,
              reason,
            },
            update: {
              bannedByUserId: currentUserId,
              reason,
            },
          }),
          ctx.prisma.clubFollower.deleteMany({
            where: { clubId: input.clubId, userId: input.userId },
          }),
        ])
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_bans')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_bans table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      // Best-effort cleanup: banned users shouldn't have pending join requests.
      try {
        await ctx.prisma.clubJoinRequest.deleteMany({
          where: { clubId: input.clubId, userId: input.userId },
        })
      } catch (err: any) {
        if (!isMissingDbRelation(err, 'club_join_requests')) throw err
      }

      return { success: true }
    }),

  unbanUser: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id

      const admin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: currentUserId } },
        select: { id: true },
      })
      if (!admin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can unban users' })
      }

      try {
        await ctx.prisma.clubBan.deleteMany({
          where: { clubId: input.clubId, userId: input.userId },
        })
      } catch (err: any) {
        if (isMissingDbRelation(err, 'club_bans')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'club_bans table is missing. Apply DB migration first.',
          })
        }
        throw err
      }

      return { success: true }
    }),
})
