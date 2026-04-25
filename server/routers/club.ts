import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc'
import { getTeamSlotCount } from '../utils/teamSlots'
import { pushToUsers } from '@/lib/realtime'

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000'

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
  const logoUrl = `${baseUrl}/iqsport-email-logo.png?v=20260424`
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

const buildAdminInviteEmailHtml = (args: {
  baseUrl: string
  inviteUrl: string
  inviterName: string
  clubName: string
  clubLogoUrl?: string | null
  inviteeEmail: string
  role: string
  city?: string | null
  state?: string | null
}) => {
  const {
    baseUrl,
    inviteUrl,
    inviterName,
    clubName,
    clubLogoUrl,
    inviteeEmail,
    role,
    city,
    state,
  } = args
  const safeClubName = escapeHtml(clubName)
  const safeInviterName = escapeHtml(inviterName)
  const safeInviteeEmail = escapeHtml(inviteeEmail)
  const safeInviteUrl = escapeHtml(inviteUrl)
  const safeRole = escapeHtml(role === 'MODERATOR' ? 'Moderator' : 'Admin')
  const safeLocation = [city, state]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ')
  const logoUrl = `${baseUrl}/iqsport-email-logo.png?v=20260424`
  const clubImageUrl = clubLogoUrl || `${baseUrl}/tournament-placeholder.png`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeRole} Invitation: ${safeClubName}</title>
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
                    <p style="margin: 0 0 8px; font-size: 15px; color: #6b7280;">Hi,</p>
                    <p style="margin: 0 0 20px; font-size: 15px; color: #6b7280;">${safeInviterName} invited you to manage this club as <strong>${safeRole}</strong></p>
                    <img src="${clubImageUrl}" alt="" width="80" height="80" style="display: block; width: 80px; height: 80px; object-fit: cover; border-radius: 8px; margin: 0 auto 12px;" />
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827;">${safeClubName}</h1>
                    ${safeLocation ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">${escapeHtml(safeLocation)}</p>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 24px 8px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280;">As ${safeRole}, you'll be able to manage sessions, view analytics, and configure AI intelligence features.</p>
                    <a href="${safeInviteUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Accept ${safeRole} Invite</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 24px 28px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">This invite expires in 7 days.</p>
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
        where.tournaments = { some: { endDate: { gte: now }, isPublicBoardEnabled: true } }
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
            where: { endDate: { gte: now }, isPublicBoardEnabled: true },
            orderBy: { startDate: 'asc' },
            take: 1,
            select: {
              id: true,
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

      return visibleClubs.map((club) => ({
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
        followersCount: club._count.followers,
        tournamentsCount: club._count.tournaments,
        isFollowing: club.followers.length > 0 && userId !== DUMMY_USER_ID,
        isAdmin: club.admins.length > 0 && userId !== DUMMY_USER_ID,
        isJoinPending: (club.joinRequests?.length ?? 0) > 0 && userId !== DUMMY_USER_ID,
        nextTournament: club.tournaments[0] ?? null,
      }))
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
    if (hasReadStates && clubIds.length > 0) {
      await Promise.all(
        clubIds.map(async (clubId) => {
          const lastReadAt = readStateByClubId.get(clubId)
          const unreadCount = await ctx.prisma.clubChatMessage.count({
            where: {
              clubId,
              deletedAt: null,
              userId: { not: userId },
              ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
            },
          })
          unreadCountByClubId.set(clubId, unreadCount)
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
    }))
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const userId = ctx.session?.user?.id ?? DUMMY_USER_ID

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
            where: { endDate: { gte: now } },
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
            },
          },
          announcements: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              title: true,
              body: true,
              createdAt: true,
              updatedAt: true,
              createdByUser: {
                select: {
                  id: true,
                  name: true,
                  image: true,
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

      const [bookingRequests, pendingJoinRequestCount] = await Promise.all([
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
      ])

      return {
        ...club,
        tournaments,
        followersCount: club._count.followers,
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
        body: z.string().min(1).max(4000),
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

      const announcement = await ctx.prisma.clubAnnouncement.create({
        data: {
          clubId: input.clubId,
          title: input.title?.trim() || null,
          body: input.body.trim(),
          createdByUserId: userId,
        },
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

      return announcement
    }),

  updateAnnouncement: protectedProcedure
    .input(
      z.object({
        clubId: z.string(),
        announcementId: z.string(),
        title: z.string().max(120).optional(),
        body: z.string().min(1).max(4000),
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

      const updated = await ctx.prisma.clubAnnouncement.update({
        where: { id: input.announcementId },
        data: {
          title: input.title?.trim() || null,
          body: input.body.trim(),
        },
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
      const emailUser = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER || 'IQSport'
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

      const inviterName = ctx.session.user.name || 'Someone'
      const subject = `${inviterName} invited you to join ${club.name} on IQSport`
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

      const mandrillKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
      if (mandrillKey) {
        // Use Mandrill API (primary)
        const res = await fetch('https://mandrillapp.com/api/1.0/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: mandrillKey,
            message: {
              from_email: 'noreply@iqsport.ai',
              from_name: 'IQSport',
              to: [{ email: toEmail, type: 'to' }],
              subject,
              html,
            },
          }),
        })
        const data = await res.json()
        if (data[0]?.status === 'rejected') {
          console.error('[sendInvite] Mandrill rejected:', data[0].reject_reason)
        }
      } else if (emailHost && emailPassword) {
        // Fallback: nodemailer SMTP
        const nodemailer = await import('nodemailer')
        const transporter = nodemailer.default.createTransport({
          host: emailHost, port: parseInt(emailPort), secure: String(emailPort) === '465',
          auth: { user: emailUser, pass: emailPassword },
        })
        await transporter.sendMail({ from: 'IQSport <noreply@iqsport.ai>', to: toEmail, subject, html })
      } else {
        console.log('[sendInvite] No email provider configured:', { toEmail, clubId: club.id })
        return { success: true, delivered: false, reason: 'smtp_missing' as const }
      }

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
        members,
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

  addAdmin: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check caller is admin
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
      })
      if (!isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can add other admins' })

      // Create admin record (upsert to handle duplicates)
      await ctx.prisma.clubAdmin.upsert({
        where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
        update: { role: 'ADMIN' },
        create: { clubId: input.clubId, userId: input.userId, role: 'ADMIN' },
      })
      return { success: true }
    }),

  removeAdmin: protectedProcedure
    .input(z.object({ clubId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check caller is admin
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
      })
      if (!isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can remove admins' })

      // Can't remove yourself if you're the last admin
      const adminCount = await ctx.prisma.clubAdmin.count({ where: { clubId: input.clubId } })
      if (adminCount <= 1) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove the last admin' })

      // Can't remove yourself
      if (input.userId === ctx.session.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself. Transfer ownership first.' })

      await ctx.prisma.clubAdmin.delete({
        where: { clubId_userId: { clubId: input.clubId, userId: input.userId } },
      })
      return { success: true }
    }),

  listAdmins: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
      })
      if (!isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can view admin list' })

      const admins = await ctx.prisma.clubAdmin.findMany({
        where: { clubId: input.clubId },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'asc' },
      })
      return admins
    }),

  listPendingInvites: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
      })
      if (!isAdmin) throw new TRPCError({ code: 'FORBIDDEN' })

      // Check if ClubInvite table exists before querying
      try {
        const invites = await ctx.prisma.clubInvite.findMany({
          where: { clubId: input.clubId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { invitee: { select: { id: true, name: true, email: true } } },
        })
        return invites
      } catch {
        return []
      }
    }),

  sendAdminInvite: protectedProcedure
    .input(z.object({
      clubId: z.string(),
      email: z.string().email(),
      role: z.enum(['ADMIN', 'MODERATOR']).default('ADMIN'),
      baseUrl: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const callerId = ctx.session.user.id

      const [club, callerAdmin, inviterUser] = await Promise.all([
        ctx.prisma.club.findUnique({
          where: { id: input.clubId },
          select: { id: true, name: true, logoUrl: true, city: true, state: true },
        }),
        ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: callerId } },
          select: { role: true },
        }),
        ctx.prisma.user.findUnique({
          where: { id: callerId },
          select: { name: true, email: true },
        }),
      ])

      if (!club) throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })
      if (!callerAdmin || callerAdmin.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can invite other admins' })
      }

      // Check if email is already an admin
      const existingUser = await ctx.prisma.user.findFirst({
        where: { email: input.email },
        select: { id: true },
      })
      if (existingUser) {
        const existingAdmin = await ctx.prisma.clubAdmin.findUnique({
          where: { clubId_userId: { clubId: input.clubId, userId: existingUser.id } },
        })
        if (existingAdmin) {
          return { success: true, delivered: false, reason: 'already_admin' as const }
        }
      }

      // No rate limiting for admin invites — owner invites specific people

      // Generate secure token
      const { randomUUID } = await import('crypto')
      const token = randomUUID()

      // Create invite record
      await ctx.prisma.clubInvite.create({
        data: {
          clubId: input.clubId,
          inviterUserId: callerId,
          inviteeEmail: input.email,
          inviteeUserId: existingUser?.id ?? null,
          role: input.role,
          token,
          delivered: false,
        },
      })

      // Send email
      const baseUrl = resolveAppBaseUrl(input.baseUrl)
      const inviteUrl = `${baseUrl}/invite/admin?token=${token}`
      const inviterName = inviterUser?.name || 'A club admin'

      try {
        const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
        const subject = `${inviterName} invited you to manage ${club.name} on IQSport`
        const html = buildAdminInviteEmailHtml({
          baseUrl,
          inviteUrl,
          inviterName,
          clubName: club.name,
          clubLogoUrl: club.logoUrl,
          inviteeEmail: input.email,
          role: input.role,
          city: club.city,
          state: club.state,
        })

        if (apiKey) {
          // Use Mandrill API (primary)
          const res = await fetch('https://mandrillapp.com/api/1.0/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: apiKey,
              message: {
                from_email: 'noreply@iqsport.ai',
                from_name: 'IQSport',
                to: [{ email: input.email, type: 'to' }],
                subject,
                html,
              },
            }),
          })
          const data = await res.json()
          if (data[0]?.status === 'rejected') {
            console.error('[AdminInvite] Mandrill rejected:', data[0].reject_reason)
          }
        } else {
          // Fallback: nodemailer SMTP
          const nodemailer = await import('nodemailer')
          const transporter = nodemailer.default.createTransport({
            host: process.env.EMAIL_SERVER_HOST,
            port: Number(process.env.EMAIL_SERVER_PORT || 587),
            auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD },
          })
          await transporter.sendMail({ from: 'IQSport <noreply@iqsport.ai>', to: input.email, subject, html })
        }

        await ctx.prisma.clubInvite.updateMany({
          where: { clubId: input.clubId, inviteeEmail: input.email, token },
          data: { delivered: true },
        })
      } catch (err: any) {
        console.error('[AdminInvite] Email failed:', err.message)
      }

      return { success: true, delivered: true, reason: null }
    }),

  getInviteInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invite = await ctx.prisma.clubInvite.findUnique({
        where: { token: input.token },
        select: { inviteeEmail: true, role: true, acceptedAt: true, club: { select: { name: true } } },
      })
      if (!invite) return null
      return { inviteeEmail: invite.inviteeEmail, role: invite.role, clubName: invite.club.name, accepted: !!invite.acceptedAt }
    }),

  acceptAdminInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const invite = await ctx.prisma.clubInvite.findUnique({
        where: { token: input.token },
        include: {
          club: { select: { id: true, name: true } },
        },
      })

      if (!invite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found or invalid token' })
      }

      if (invite.acceptedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been accepted' })
      }

      // Check expiration (7 days)
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - invite.createdAt.getTime() > sevenDaysMs) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired' })
      }

      if (!invite.role) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This is not an admin invite' })
      }

      // Verify user exists in DB (NextAuth session may have stale ID)
      const userExists = await ctx.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!userExists) {
        // Try to find user by invite email instead
        const userByEmail = invite.inviteeEmail
          ? await ctx.prisma.user.findUnique({ where: { email: invite.inviteeEmail }, select: { id: true } })
          : null
        if (userByEmail) {
          // Use the existing user matched by email
          console.log(`[Invite] Session userId ${userId} not in DB, falling back to email-matched userId ${userByEmail.id}`)
          // @ts-ignore - reassign to correct userId
          var effectiveUserId = userByEmail.id
        } else {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'User account not found. Please sign in again and retry.' })
        }
      } else {
        var effectiveUserId = userId
      }

      // All-or-nothing: create admin + follower + mark accepted in transaction
      const role = invite.role!
      await ctx.prisma.$transaction(async (tx) => {
        // Create ClubAdmin
        await tx.clubAdmin.upsert({
          where: { clubId_userId: { clubId: invite.clubId, userId: effectiveUserId } },
          update: { role },
          create: { clubId: invite.clubId, userId: effectiveUserId, role },
        })

        // Also make them a club follower
        await tx.clubFollower.upsert({
          where: { clubId_userId: { clubId: invite.clubId, userId: effectiveUserId } },
          update: {},
          create: { clubId: invite.clubId, userId: effectiveUserId },
        })

        // Mark invite as accepted LAST (so retry works if above fails)
        await tx.clubInvite.update({
          where: { token: input.token },
          data: { acceptedAt: new Date(), inviteeUserId: effectiveUserId },
        })
      })

      return {
        success: true,
        clubId: invite.clubId,
        clubName: invite.club.name,
        role: invite.role,
      }
    }),

  // ── White-label Sending Domain ──────────────────────────────────────
  //
  // Per-club custom From: domain for AI outreach. Admin flow:
  //   1. getSendingDomainStatus — hydrate the settings page
  //   2. setupSendingDomain — register with Mandrill, store DNS records
  //   3. admin adds the DNS records in their provider
  //   4. verifySendingDomain — Mandrill re-probes DNS, we flip verifiedAt
  //   5. enableSendingDomain — turn on; sendMail() picks up the custom From
  //
  // Lifecycle: disable (temporary turn-off) and remove (full reset)
  // are both supported so admins can iterate without manual cleanup.

  getSendingDomainStatus: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can view email domain settings' })
      }

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: {
          name: true,
          sendingDomain: true,
          sendingDomainDnsRecords: true,
          sendingDomainVerifiedAt: true,
          sendingDomainEnabled: true,
          sendingDomainFromName: true,
          sendingDomainLocalPart: true,
        },
      })
      if (!club) throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })

      return {
        domain: club.sendingDomain,
        dnsRecords: club.sendingDomainDnsRecords,
        verifiedAt: club.sendingDomainVerifiedAt,
        enabled: club.sendingDomainEnabled,
        fromName: club.sendingDomainFromName || club.name,
        localPart: club.sendingDomainLocalPart,
        previewFromAddress: club.sendingDomain
          ? `${club.sendingDomainLocalPart || 'campaigns'}@${club.sendingDomain}`
          : null,
      }
    }),

  setupSendingDomain: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      domain: z.string().min(3).max(253),
      fromName: z.string().min(1).max(100).optional(),
      localPart: z.string().regex(/^[a-z0-9._-]+$/i).min(1).max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can edit email domain settings' })
      }

      const { validateSendingDomain, isLikelyRootDomain, addSendingDomain, buildAdminDnsRecords } =
        await import('@/lib/email-sending-domain')

      const validation = validateSendingDomain(input.domain)
      if (!validation.ok || !validation.normalized) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.reason || 'Invalid domain' })
      }
      const normalized = validation.normalized

      // Soft warning (not error) — surfaced to UI so admins can confirm.
      const rootWarning = isLikelyRootDomain(normalized)
        ? `Heads up: "${normalized}" looks like a root domain. We recommend using a subdomain like "mail.${normalized}" to avoid conflicts with your regular email (Google Workspace, Office 365, etc). You can proceed anyway, but existing SPF records on the root may need manual merging.`
        : null

      // Register with Mandrill — idempotent, safe to call multiple times.
      // Any API/network failure surfaces as a 503 so the UI can retry.
      try {
        await addSendingDomain(normalized)
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to register domain with email provider: ${(err as Error).message}`,
        })
      }

      const dnsRecords = buildAdminDnsRecords(normalized)

      // Store — resets verifiedAt because the domain changed.
      const updated = await ctx.prisma.club.update({
        where: { id: input.clubId },
        data: {
          sendingDomain: normalized,
          sendingDomainDnsRecords: dnsRecords as any,
          sendingDomainVerifiedAt: null,
          sendingDomainEnabled: false,
          ...(input.fromName ? { sendingDomainFromName: input.fromName } : {}),
          ...(input.localPart ? { sendingDomainLocalPart: input.localPart.toLowerCase() } : {}),
        },
        select: {
          sendingDomain: true,
          sendingDomainDnsRecords: true,
          sendingDomainFromName: true,
          sendingDomainLocalPart: true,
        },
      })

      return {
        domain: updated.sendingDomain,
        dnsRecords: updated.sendingDomainDnsRecords,
        fromName: updated.sendingDomainFromName,
        localPart: updated.sendingDomainLocalPart,
        rootWarning,
      }
    }),

  verifySendingDomain: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can verify email domains' })
      }

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { sendingDomain: true },
      })
      if (!club?.sendingDomain) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No domain configured yet — run setup first' })
      }

      const { checkSendingDomain } = await import('@/lib/email-sending-domain')
      let status
      try {
        status = await checkSendingDomain(club.sendingDomain)
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Email provider check failed: ${(err as Error).message}`,
        })
      }

      // valid_signing = SPF + DKIM both resolve correctly. That's the
      // gate we care about — email ownership verification (sending to
      // admin@domain) is a separate, optional step we don't require.
      const ready = !!status.valid_signing

      await ctx.prisma.club.update({
        where: { id: input.clubId },
        data: {
          sendingDomainVerifiedAt: ready ? new Date() : null,
        },
      })

      return {
        domain: status.domain,
        ready,
        spfValid: !!status.spf?.valid,
        spfError: status.spf?.error || null,
        dkimValid: !!status.dkim?.valid,
        dkimError: status.dkim?.error || null,
        lastTestedAt: status.last_tested_at,
      }
    }),

  enableSendingDomain: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can enable email domains' })
      }

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { sendingDomain: true, sendingDomainVerifiedAt: true },
      })
      if (!club?.sendingDomain) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No domain configured' })
      }
      if (!club.sendingDomainVerifiedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Domain not verified yet — verify DNS first',
        })
      }

      await ctx.prisma.club.update({
        where: { id: input.clubId },
        data: { sendingDomainEnabled: true },
      })
      return { enabled: true }
    }),

  disableSendingDomain: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can disable email domains' })
      }

      // Always allowed — temporarily reverts to platform default (noreply@iqsport.ai)
      // without wiping the domain configuration.
      await ctx.prisma.club.update({
        where: { id: input.clubId },
        data: { sendingDomainEnabled: false },
      })
      return { enabled: false }
    }),

  removeSendingDomain: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can remove email domains' })
      }

      // Full reset — admin can start fresh with a different domain.
      // We don't tell Mandrill to delete the domain from their side
      // because another club (or the admin themselves, later) might
      // want to reuse it. Mandrill deduplicates by domain name anyway.
      await ctx.prisma.club.update({
        where: { id: input.clubId },
        data: {
          sendingDomain: null,
          sendingDomainDnsRecords: Prisma.JsonNull as any,
          sendingDomainVerifiedAt: null,
          sendingDomainEnabled: false,
          sendingDomainFromName: null,
          // Keep localPart at whatever it was (default "campaigns") —
          // it's a preference, not tied to any specific domain.
        },
      })
      return { removed: true }
    }),

  updateSendingDomainMeta: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      fromName: z.string().min(1).max(100).optional(),
      localPart: z.string().regex(/^[a-z0-9._-]+$/i).min(1).max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can update email settings' })
      }

      const data: Record<string, unknown> = {}
      if (input.fromName !== undefined) data.sendingDomainFromName = input.fromName
      if (input.localPart !== undefined) data.sendingDomainLocalPart = input.localPart.toLowerCase()
      if (Object.keys(data).length === 0) {
        return { updated: false }
      }

      await ctx.prisma.club.update({
        where: { id: input.clubId },
        data,
      })
      return { updated: true }
    }),

  // ── Voice / Tone Profile ───────────────────────────────────────────
  //
  // Admin sets the club's writing style once; every AI outreach generator
  // picks it up via the voice-profile helper. Combined with the preview
  // + regenerate endpoints below, admins can iterate on tone interactively
  // before turning live mode on.

  getVoiceSettings: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can view voice settings' })
      }

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { voiceSettings: true },
      })
      const { parseVoiceSettings, DEFAULT_VOICE_SETTINGS } = await import('@/lib/ai/voice-profile')
      const stored = parseVoiceSettings(club?.voiceSettings)

      return {
        // Explicit merge so the UI always has concrete values, even for
        // a club that never touched settings (shows the defaults in place).
        tone: stored.tone ?? DEFAULT_VOICE_SETTINGS.tone,
        length: stored.length ?? DEFAULT_VOICE_SETTINGS.length,
        useEmoji: stored.useEmoji ?? DEFAULT_VOICE_SETTINGS.useEmoji,
        formality: stored.formality ?? DEFAULT_VOICE_SETTINGS.formality,
        customInstructions: stored.customInstructions ?? '',
        hasStoredSettings: club?.voiceSettings != null,
      }
    }),

  updateVoiceSettings: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      tone: z.enum(['friendly', 'professional', 'energetic', 'warm']).optional(),
      length: z.enum(['short', 'medium', 'long']).optional(),
      useEmoji: z.boolean().optional(),
      formality: z.enum(['casual', 'neutral', 'formal']).optional(),
      customInstructions: z.string().max(1500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can update voice settings' })
      }

      // Merge over existing so partial updates are non-destructive.
      const existing = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { voiceSettings: true },
      })
      const { parseVoiceSettings } = await import('@/lib/ai/voice-profile')
      const prev = parseVoiceSettings(existing?.voiceSettings)

      const next = {
        tone: input.tone ?? prev.tone,
        length: input.length ?? prev.length,
        useEmoji: input.useEmoji ?? prev.useEmoji,
        formality: input.formality ?? prev.formality,
        customInstructions: input.customInstructions ?? prev.customInstructions,
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.session.user.id,
      }

      await ctx.prisma.club.update({
        where: { id: input.clubId },
        data: { voiceSettings: next as any },
      })
      return { updated: true, settings: next }
    }),

  // ── Preview a generated message (no send) ──────────────────────────
  //
  // LLM call with the real club's voice + context, so admins can read
  // exactly what a real send would look like before turning on live mode.
  // Separate from the actual send path so we never accidentally surface
  // a preview to a member — this mutation stays strictly local.

  previewAiMessage: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      type: z.enum(['slot_filler', 'reactivation', 'check_in', 'event_invite']),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can preview messages' })
      }

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { name: true, voiceSettings: true },
      })
      if (!club) throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })

      const { generateWithFallback } = await import('@/lib/ai/llm/provider')
      const { composeSystem, parseVoiceSettings } = await import('@/lib/ai/voice-profile')
      const voice = parseVoiceSettings(club.voiceSettings)

      const typeConfig: Record<string, { description: string; contextHint: string }> = {
        slot_filler: {
          description: 'Fill empty spots in an upcoming session. Create gentle urgency around limited availability without being pushy.',
          contextHint: 'Typical context: "Evening Open Play tomorrow at 6pm, 2 spots left. Member has played 8 sessions in the last month with a similar group."',
        },
        reactivation: {
          description: 'Win-back message for a member who has not played in 30+ days. Warm check-in, acknowledge their history, soft invite back.',
          contextHint: 'Typical context: "Member joined 6 months ago, played 12 sessions, last visit 42 days ago. Used to come on Tuesday evenings."',
        },
        check_in: {
          description: 'Light check-in for a member whose weekly frequency dropped. Friendly, not alarmist.',
          contextHint: 'Typical context: "Member plays 2x/week usually, last 2 weeks only 1x. No obvious life event."',
        },
        event_invite: {
          description: 'Invite to a specific special event (clinic, league, tournament). Exciting but informative.',
          contextHint: 'Typical context: "Saturday 3.5+ mixer clinic, 30 spots, member is 3.5 rated and has attended 2 clinics before."',
        },
      }

      const cfg = typeConfig[input.type]
      const baseSystem = `You are a messaging specialist for a racquet sports club (pickleball/tennis/padel). Generate an outreach email for the club's AI system to send to a real member. Use {{name}} for the member's first name.

PURPOSE: ${cfg.description}

RULES:
- Output ONLY valid JSON, no markdown
- subject: max 60 chars
- body: max 600 chars, warm conversational email
- Never ALL CAPS
- Sign off naturally (e.g. "See you on the court," then the club name)

OUTPUT FORMAT:
{"subject": "...", "body": "..."}`

      const userPrompt = `Club: "${club.name}"
Message type: ${input.type}

${cfg.contextHint}

Generate a realistic preview that a club admin can read to decide if the tone feels right for their club. Use the VOICE & TONE guidance above.`

      const result = await generateWithFallback({
        system: composeSystem(baseSystem, voice),
        prompt: userPrompt,
        tier: 'fast',
        maxTokens: 400,
        clubId: input.clubId,
        operation: `previewAiMessage:${input.type}`,
      })

      // Parse JSON robustly — sometimes models wrap in fences.
      let text = result.text.trim()
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) text = match[1].trim()
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1)

      let parsed: { subject?: string; body?: string } = {}
      try {
        parsed = JSON.parse(text)
      } catch {
        // If parsing fails, return the raw text as body so the admin
        // still sees *something* to judge tone on — better than an error.
        parsed = { subject: `[Preview: ${input.type}]`, body: result.text.slice(0, 600) }
      }

      return {
        type: input.type,
        subject: (parsed.subject || '').slice(0, 120),
        body: (parsed.body || '').slice(0, 2000),
        model: result.model,
        voice,
      }
    }),

  // Regenerate a preview with user feedback ("too formal", "shorter", or
  // a free-form note). The prior attempt is passed back so the LLM can
  // see what to change — not just a blank re-roll.
  regenerateAiPreview: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      type: z.enum(['slot_filler', 'reactivation', 'check_in', 'event_invite']),
      previousSubject: z.string().max(200).optional(),
      previousBody: z.string().max(3000),
      feedback: z.union([
        z.enum(['too_formal', 'too_casual', 'too_long', 'too_short', 'too_generic', 'too_pushy']),
        z.object({ custom: z.string().min(1).max(500) }),
      ]),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can regenerate previews' })
      }

      const club = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { name: true, voiceSettings: true },
      })
      if (!club) throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' })

      const { generateWithFallback } = await import('@/lib/ai/llm/provider')
      const { composeSystem, parseVoiceSettings, buildFeedbackInstruction } =
        await import('@/lib/ai/voice-profile')
      const voice = parseVoiceSettings(club.voiceSettings)

      const baseSystem = `You are a messaging specialist for a racquet sports club. Regenerate an outreach message addressing specific feedback from the club admin while preserving the original intent. Use {{name}} for member's first name.

RULES:
- Output ONLY valid JSON, no markdown
- subject: max 60 chars
- body: max 600 chars
- Never ALL CAPS

OUTPUT: {"subject": "...", "body": "..."}`

      const nudge = buildFeedbackInstruction(input.feedback)
      const userPrompt = `Club: "${club.name}"
Message type: ${input.type}

PREVIOUS ATTEMPT:
Subject: ${input.previousSubject || '(none)'}
Body: ${input.previousBody}

REVISION INSTRUCTION:
${nudge}

Generate a fresh version that addresses the revision instruction while fulfilling the same purpose.`

      const result = await generateWithFallback({
        system: composeSystem(baseSystem, voice),
        prompt: userPrompt,
        tier: 'fast',
        maxTokens: 400,
        clubId: input.clubId,
        operation: `regenerateAiPreview:${input.type}`,
      })

      let text = result.text.trim()
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) text = match[1].trim()
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1)

      let parsed: { subject?: string; body?: string } = {}
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { subject: input.previousSubject || `[Preview: ${input.type}]`, body: result.text.slice(0, 600) }
      }

      return {
        type: input.type,
        subject: (parsed.subject || '').slice(0, 120),
        body: (parsed.body || '').slice(0, 2000),
        model: result.model,
      }
    }),

  // ── Live-mode Launch Runbook ───────────────────────────────────────
  //
  // Preflight is the gate: it runs ~10 deterministic checks against the
  // club's real data + platform config, returns pass/warn/error for each.
  // goLive requires zero errors + all manual confirmations. killSwitch
  // is always available (no gates), and logs a required reason so we
  // can review why live mode was turned off.

  getLaunchPreflight: protectedProcedure
    .input(z.object({ clubId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can view the launch checklist' })
      }

      const { runLaunchPreflight } = await import('@/lib/ai/launch-preflight')
      return runLaunchPreflight(ctx.prisma, input.clubId)
    }),

  goLive: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      manualConfirmations: z.object({
        previewSlotFiller: z.boolean(),
        previewReactivation: z.boolean(),
        fromNameConfirmed: z.boolean(),
        killSwitchKnown: z.boolean(),
        teamNotified: z.boolean(),
        willMonitor48h: z.boolean(),
      }),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can go live' })
      }

      const allConfirmed = Object.values(input.manualConfirmations).every(Boolean)
      if (!allConfirmed) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'All manual confirmations are required before going live',
        })
      }

      const { runLaunchPreflight } = await import('@/lib/ai/launch-preflight')
      const preflight = await runLaunchPreflight(ctx.prisma, input.clubId)
      const hasErrors = preflight.checks.some((c) => c.status === 'error')

      if (hasErrors) {
        // Audit the failed attempt too — that's valuable for ops.
        await ctx.prisma.clubLaunchAudit.create({
          data: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'preflight_failed',
            preflightSnapshot: preflight as any,
            manualConfirmations: input.manualConfirmations as any,
            reason: input.reason || null,
          },
        }).catch(() => { /* audit is advisory — don't fail the UX over it */ })

        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Preflight has ${preflight.checks.filter((c) => c.status === 'error').length} blocker(s). Fix them first.`,
        })
      }

      // Flip the flag — merge into existing automationSettings so we
      // don't wipe other keys (notificationEmail, autonomy policies, etc).
      const existing = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      const current = (existing?.automationSettings as any) || {}
      const nextSettings = {
        ...current,
        intelligence: { ...(current.intelligence || {}), agentLive: true },
      }

      await ctx.prisma.$transaction([
        ctx.prisma.club.update({
          where: { id: input.clubId },
          data: { automationSettings: nextSettings as any },
        }),
        ctx.prisma.clubLaunchAudit.create({
          data: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'go_live',
            preflightSnapshot: preflight as any,
            manualConfirmations: input.manualConfirmations as any,
            reason: input.reason || null,
          },
        }),
      ])

      return { live: true, wentLiveAt: new Date().toISOString() }
    }),

  killSwitch: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      reason: z.string().min(3).max(500), // required — we want to know why
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can use the kill switch' })
      }

      const existing = await ctx.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { automationSettings: true },
      })
      const current = (existing?.automationSettings as any) || {}
      const nextSettings = {
        ...current,
        intelligence: { ...(current.intelligence || {}), agentLive: false },
      }

      await ctx.prisma.$transaction([
        ctx.prisma.club.update({
          where: { id: input.clubId },
          data: { automationSettings: nextSettings as any },
        }),
        ctx.prisma.clubLaunchAudit.create({
          data: {
            clubId: input.clubId,
            userId: ctx.session.user.id,
            action: 'kill_switch',
            reason: input.reason,
          },
        }),
      ])
      return { live: false, killedAt: new Date().toISOString() }
    }),

  getLaunchAuditLog: protectedProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const isAdmin = await ctx.prisma.clubAdmin.findUnique({
        where: { clubId_userId: { clubId: input.clubId, userId: ctx.session.user.id } },
        select: { id: true },
      })
      if (!isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only club admins can view the audit log' })
      }

      const audits = await ctx.prisma.clubLaunchAudit.findMany({
        where: { clubId: input.clubId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: { user: { select: { name: true, email: true } } },
      })
      return audits.map((a) => ({
        id: a.id,
        action: a.action,
        reason: a.reason,
        actor: a.user?.name || a.user?.email || 'Unknown',
        createdAt: a.createdAt,
      }))
    }),
})
