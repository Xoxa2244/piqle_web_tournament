import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'
import { sendHtmlEmail } from '@/lib/sendTransactionEmail'

function isRegistrationOpen(tournament: {
  registrationStartDate: Date | null
  registrationEndDate: Date | null
  startDate: Date
}) {
  const start = tournament.registrationStartDate ?? tournament.startDate
  const end = tournament.registrationEndDate ?? tournament.startDate
  const now = new Date()
  return now >= new Date(start) && now <= new Date(end)
}

function getAppBaseUrl(baseUrlFromClient?: string | null): string {
  if (baseUrlFromClient && baseUrlFromClient.startsWith('http')) return baseUrlFromClient.replace(/\/$/, '')
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (env) return env.startsWith('http') ? env : `https://${env}`
  return 'http://localhost:3000'
}

export const tournamentInvitationRouter = createTRPCRouter({
  listEligibleUsers: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      const participantsInTournament = await ctx.prisma.teamPlayer.findMany({
        where: { team: { division: { tournamentId: input.tournamentId } } },
        select: { player: { select: { userId: true } } },
        distinct: ['playerId'],
      })
      const participantUserIds = participantsInTournament
        .map((tp) => tp.player?.userId)
        .filter((id): id is string => id != null)
      const excludeIds = Array.from(new Set([...participantUserIds, ctx.session.user.id]))

      const users = await ctx.prisma.user.findMany({
        where: {
          isActive: true,
          id: { notIn: excludeIds },
          ...(input.search?.trim()
            ? { name: { contains: input.search.trim(), mode: 'insensitive' as const } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          image: true,
          city: true,
          gender: true,
          duprRatingSingles: true,
          duprRatingDoubles: true,
        },
        take: 200,
        orderBy: { name: 'asc' },
      })

      const invitations = await ctx.prisma.tournamentInvitation.findMany({
        where: {
          tournamentId: input.tournamentId,
          invitedUserId: { in: users.map((u) => u.id) },
        },
        select: { invitedUserId: true, status: true },
      })
      const statusByUserId = new Map(invitations.map((i) => [i.invitedUserId, i.status]))

      return users.map((u) => ({
        id: u.id,
        name: u.name,
        image: u.image,
        city: u.city,
        gender: u.gender,
        duprRatingSingles: u.duprRatingSingles,
        duprRatingDoubles: u.duprRatingDoubles,
        invitationStatus: statusByUserId.get(u.id) ?? null,
      }))
    }),

  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      invitedUserId: z.string(),
      baseUrl: z.string().url().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      const user = await ctx.prisma.user.findUnique({
        where: { id: input.invitedUserId },
        select: { id: true, email: true, name: true },
      })
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found.',
        })
      }

      const alreadyInTournament = await ctx.prisma.teamPlayer.findFirst({
        where: {
          player: { userId: user.id, tournamentId: input.tournamentId },
          team: { division: { tournamentId: input.tournamentId } },
        },
      })
      if (alreadyInTournament) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This user is already a participant in the tournament.',
        })
      }

      const existingInvitation = await ctx.prisma.tournamentInvitation.findUnique({
        where: {
          tournamentId_invitedUserId: { tournamentId: input.tournamentId, invitedUserId: user.id },
        },
      })
      if (existingInvitation) {
        if (existingInvitation.status === 'PENDING') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This user already has a pending invitation. They must respond before you can invite again.',
          })
        }
        // DECLINED or ACCEPTED (e.g. accepted then left tournament): reuse same row, set to PENDING and resend email
        if (existingInvitation.status === 'DECLINED' || existingInvitation.status === 'ACCEPTED') {
          await ctx.prisma.tournamentInvitation.update({
            where: { id: existingInvitation.id },
            data: { status: 'PENDING', updatedAt: new Date() },
          })
          const tournament = await fetchTournamentForEmail(ctx.prisma, input.tournamentId)
          const baseUrl = getAppBaseUrl(input.baseUrl)
          const acceptLink = `${baseUrl}/invitation/${existingInvitation.id}/respond?action=accept`
          const declineLink = `${baseUrl}/invitation/${existingInvitation.id}/respond?action=decline`
          const html = buildInvitationEmailHtml(tournament, baseUrl, acceptLink, declineLink)
          await sendHtmlEmail(user.email, `Invitation: ${tournament?.title ?? 'Tournament'}`, html)
          return { id: existingInvitation.id, status: 'PENDING' as const, email: user.email }
        }
      }

      const invitation = await ctx.prisma.tournamentInvitation.create({
        data: {
          tournamentId: input.tournamentId,
          invitedUserId: user.id,
          email: user.email,
          status: 'PENDING',
        },
      })

      const tournament = await fetchTournamentForEmail(ctx.prisma, input.tournamentId)
      const baseUrl = getAppBaseUrl(input.baseUrl)
      const acceptLink = `${baseUrl}/invitation/${invitation.id}/respond?action=accept`
      const declineLink = `${baseUrl}/invitation/${invitation.id}/respond?action=decline`
      const html = buildInvitationEmailHtml(tournament, baseUrl, acceptLink, declineLink)
      await sendHtmlEmail(user.email, `Invitation: ${tournament?.title ?? 'Tournament'}`, html)

      return { id: invitation.id, status: 'PENDING' as const, email: user.email }
    }),

  list: tdProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)
      return ctx.prisma.tournamentInvitation.findMany({
        where: { tournamentId: input.tournamentId },
        include: {
          invitedUser: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    }),

  accept: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.tournamentInvitation.findUnique({
        where: { id: input.invitationId },
        include: {
          tournament: {
            select: {
              id: true,
              title: true,
              startDate: true,
              registrationStartDate: true,
              registrationEndDate: true,
              entryFeeCents: true,
            },
          },
          invitedUser: { select: { id: true, email: true, name: true } },
        },
      })
      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found.' })
      }
      if (invitation.status !== 'PENDING') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invitation has already been responded to.' })
      }
      if (invitation.invitedUserId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only respond to your own invitation.' })
      }

      const tournament = invitation.tournament
      if (!isRegistrationOpen(tournament)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration is closed for this tournament.' })
      }

      const [firstName, ...lastParts] = (invitation.invitedUser.name || '').trim().split(/\s+/)
      const lastName = lastParts.join(' ') || firstName || 'Player'

      await ctx.prisma.$transaction(async (tx) => {
        await tx.tournamentInvitation.update({
          where: { id: input.invitationId },
          data: { status: 'ACCEPTED' },
        })
        const existing = await tx.player.findUnique({
          where: {
            userId_tournamentId: {
              userId: invitation.invitedUserId,
              tournamentId: invitation.tournamentId,
            },
          },
        })
        if (!existing) {
          await tx.player.create({
            data: {
              tournamentId: invitation.tournamentId,
              userId: invitation.invitedUserId,
              firstName: firstName || 'Player',
              lastName,
              email: invitation.invitedUser.email,
            },
          })
        }
      })

      return { success: true, tournamentId: invitation.tournamentId }
    }),

  decline: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.tournamentInvitation.findUnique({
        where: { id: input.invitationId },
      })
      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found.' })
      }
      if (invitation.status !== 'PENDING') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invitation has already been responded to.' })
      }
      if (invitation.invitedUserId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only respond to your own invitation.' })
      }

      await ctx.prisma.tournamentInvitation.update({
        where: { id: input.invitationId },
        data: { status: 'DECLINED' },
      })
      return { success: true }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const inv = await ctx.prisma.tournamentInvitation.findUnique({
        where: { id: input.id },
        include: {
          tournament: { select: { id: true, title: true } },
          invitedUser: { select: { id: true, email: true, name: true } },
        },
      })
      if (!inv) return null
      if (inv.invitedUserId !== ctx.session.user.id) return null
      return inv
    }),
})

async function fetchTournamentForEmail(prisma: PrismaClient, tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      title: true,
      image: true,
      startDate: true,
      endDate: true,
      registrationStartDate: true,
      registrationEndDate: true,
      venueName: true,
      entryFee: true,
      divisions: { select: { id: true, name: true } },
      user: {
        select: { id: true, name: true, image: true, email: true },
      },
    },
  })
  return t
}

function formatEmailDate(d: Date | null | undefined): string {
  if (d == null) return '—'
  const x = new Date(d)
  return x.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

// PNG icons from public/email-icons/ (same as tournament card)
type TournamentForEmail = Awaited<ReturnType<typeof fetchTournamentForEmail>>

function buildInvitationEmailHtml(
  tournament: TournamentForEmail,
  baseUrl: string,
  acceptLink: string,
  declineLink: string
): string {
  const title = tournament?.title ?? 'Tournament'
  const tournamentLink = tournament?.id ? `${baseUrl}/?open=${tournament.id}` : baseUrl
  const logoUrl = `${baseUrl}/Logo.png`
  const imageUrl = tournament?.image ?? `${baseUrl}/tournament-placeholder.png`
  const entryFee =
    tournament?.entryFee != null && parseFloat(String(tournament.entryFee)) > 0
      ? `$${Number(tournament.entryFee).toFixed(0)}`
      : null
  const divisions = tournament?.divisions ?? []
  const td = tournament?.user
  const tdName = td?.name || td?.email || 'Tournament Director'
  const tdImage = td?.image

  const divisionPills = divisions
    .map(
      (d) =>
        `<span style="display: inline-block; padding: 4px 10px; margin: 2px 4px 2px 0; background: #f3f4f6; color: #374151; border-radius: 9999px; font-size: 12px;">${escapeHtml(d.name)}</span>`
    )
    .join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation: ${escapeHtml(title)}</title>
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
                    <p style="margin: 0 0 20px; font-size: 15px; color: #6b7280;">You're invited to participate in this tournament</p>
                    <img src="${imageUrl}" alt="" width="80" height="80" style="display: block; width: 80px; height: 80px; object-fit: cover; border-radius: 8px; margin: 0 auto 12px;" />
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827;">${escapeHtml(title)}</h1>
                    <p style="margin: 8px 0 0;"><a href="${tournamentLink}" style="font-size: 13px; color: #22c55e; text-decoration: none;">View tournament details →</a></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 24px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #4b5563;">
                      <tr><td style="padding: 4px 0;"><img src="${baseUrl}/email-icons/calendar.png" width="16" height="16" alt="" style="vertical-align: middle; margin-right: 8px;" />${formatEmailDate(tournament?.startDate)} – ${formatEmailDate(tournament?.endDate)}</td></tr>
                      ${(tournament?.registrationStartDate || tournament?.registrationEndDate) ? `<tr><td style="padding: 4px 0;"><img src="${baseUrl}/email-icons/clipboard-list.png" width="16" height="16" alt="" style="vertical-align: middle; margin-right: 8px;" />Registration: ${formatEmailDate(tournament?.registrationStartDate)} – ${formatEmailDate(tournament?.registrationEndDate)}</td></tr>` : ''}
                      ${tournament?.venueName ? `<tr><td style="padding: 4px 0;"><img src="${baseUrl}/email-icons/mappin.png" width="16" height="16" alt="" style="vertical-align: middle; margin-right: 8px;" />${escapeHtml(tournament.venueName)}</td></tr>` : ''}
                      <tr><td style="padding: 4px 0;"><img src="${baseUrl}/email-icons/users.png" width="16" height="16" alt="" style="vertical-align: middle; margin-right: 8px;" />${divisions.length} division${divisions.length !== 1 ? 's' : ''}</td></tr>
                      ${divisions.length > 0 ? `<tr><td style="padding: 8px 0 4px;">Divisions:</td></tr><tr><td style="padding: 0 0 8px;">${divisionPills}</td></tr>` : ''}
                      ${entryFee ? `<tr><td style="padding: 4px 0;"><img src="${baseUrl}/email-icons/trophy.png" width="16" height="16" alt="" style="vertical-align: middle; margin-right: 8px;" />Entry Fee: ${entryFee}</td></tr>` : ''}
                      ${td ? `<tr><td style="padding: 12px 0 0; border-top: 1px solid #e5e7eb;"><span style="font-size: 12px; color: #6b7280;">Tournament Director:</span><br/><table role="presentation" cellspacing="0" cellpadding="0" style="margin-top: 6px;"><tr><td style="vertical-align: middle; padding-right: 8px;">${tdImage ? `<img src="${tdImage}" alt="" width="24" height="24" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" />` : '<span style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; background: #e5e7eb;"></span>'}</td><td style="vertical-align: middle; font-size: 13px; font-weight: 500;">${escapeHtml(tdName)}</td></tr></table></td></tr>` : ''}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 24px 28px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280;">If you accept, you'll be added as a player (you can be assigned to a team later).</p>
                    <a href="${acceptLink}" style="display: inline-block; margin-right: 12px; padding: 12px 24px; background: #22c55e; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Accept</a>
                    <a href="${declineLink}" style="display: inline-block; padding: 12px 24px; background: #6b7280; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px;">Decline</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 0; text-align: center; font-size: 12px; color: #9ca3af;">If you didn't expect this invitation, you can ignore this email or decline.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
