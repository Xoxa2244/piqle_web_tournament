import { z } from 'zod'
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
  const logoUrl = `${baseUrl}/iqsport-email-logo.png`
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
  const logoUrl = `${baseUrl}/iqsport-email-logo.png`
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

      // Check for duplicate invite in last 24h
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recentInvite = await ctx.prisma.clubInvite.findFirst({
        where: {
          clubId: input.clubId,
          inviteeEmail: input.email,
          role: { not: null },
          createdAt: { gte: dayAgo },
        },
      })
      if (recentInvite) {
        return { success: true, delivered: false, reason: 'already_invited' as const }
      }

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

      // All-or-nothing: create admin + follower + mark accepted in transaction
      const role = invite.role!
      await ctx.prisma.$transaction(async (tx) => {
        // Create ClubAdmin
        await tx.clubAdmin.upsert({
          where: { clubId_userId: { clubId: invite.clubId, userId } },
          update: { role },
          create: { clubId: invite.clubId, userId, role },
        })

        // Also make them a club follower
        await tx.clubFollower.upsert({
          where: { clubId_userId: { clubId: invite.clubId, userId } },
          update: {},
          create: { clubId: invite.clubId, userId },
        })

        // Mark invite as accepted LAST (so retry works if above fails)
        await tx.clubInvite.update({
          where: { token: input.token },
          data: { acceptedAt: new Date(), inviteeUserId: userId },
        })
      })

      return {
        success: true,
        clubId: invite.clubId,
        clubName: invite.club.name,
        role: invite.role,
      }
    }),
})
