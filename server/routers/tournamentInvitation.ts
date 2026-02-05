import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'
import { sendHtmlEmail } from '@/lib/sendTransactionEmail'

function getAppBaseUrl(baseUrlFromClient?: string | null): string {
  if (baseUrlFromClient && baseUrlFromClient.startsWith('http')) return baseUrlFromClient.replace(/\/$/, '')
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (env) return env.startsWith('http') ? env : `https://${env}`
  return 'http://localhost:3000'
}

export const tournamentInvitationRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      email: z.string().email(),
      baseUrl: z.string().url().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, input.tournamentId)

      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
        select: { id: true, email: true, name: true },
      })
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No registered user with this email on the platform.',
        })
      }

      const existingPlayer = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: { userId: user.id, tournamentId: input.tournamentId },
        },
      })
      if (existingPlayer) {
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
        // DECLINED or ACCEPTED: we allow creating a new invitation (will replace or create new row - actually unique is tournamentId + invitedUserId so we need to delete the old one or update. For "invite again after decline" we can update status to PENDING and resend. So: if DECLINED, update to PENDING and resend. If ACCEPTED, they're already a player so we already threw above. So only DECLINED can be "re-invited". So delete the declined row and create a new one, or just update status to PENDING and set updatedAt. I'll update status to PENDING and resend email.
        if (existingInvitation.status === 'DECLINED') {
          await ctx.prisma.tournamentInvitation.update({
            where: { id: existingInvitation.id },
            data: { status: 'PENDING', updatedAt: new Date() },
          })
          const tournament = await ctx.prisma.tournament.findUnique({
            where: { id: input.tournamentId },
            select: { title: true },
          })
          const baseUrl = getAppBaseUrl(input.baseUrl)
          const acceptLink = `${baseUrl}/invitation/${existingInvitation.id}/respond?action=accept`
          const declineLink = `${baseUrl}/invitation/${existingInvitation.id}/respond?action=decline`
          const html = buildInvitationEmailHtml(tournament?.title ?? 'Tournament', acceptLink, declineLink)
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

      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: { title: true },
      })
      const baseUrl = getAppBaseUrl(input.baseUrl)
      const acceptLink = `${baseUrl}/invitation/${invitation.id}/respond?action=accept`
      const declineLink = `${baseUrl}/invitation/${invitation.id}/respond?action=decline`
      const html = buildInvitationEmailHtml(tournament?.title ?? 'Tournament', acceptLink, declineLink)
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
          tournament: { select: { id: true, title: true } },
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

      const [firstName, ...lastParts] = (invitation.invitedUser.name || '').trim().split(/\s+/)
      const lastName = lastParts.join(' ') || firstName || 'Player'

      await ctx.prisma.$transaction([
        ctx.prisma.tournamentInvitation.update({
          where: { id: input.invitationId },
          data: { status: 'ACCEPTED' },
        }),
        ctx.prisma.player.create({
          data: {
            tournamentId: invitation.tournamentId,
            userId: invitation.invitedUserId,
            firstName: firstName || 'Player',
            lastName,
            email: invitation.invitedUser.email,
          },
        }),
      ])

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

function buildInvitationEmailHtml(tournamentTitle: string, acceptLink: string, declineLink: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Tournament invitation</h2>
        <p>You have been invited to participate in <strong>${tournamentTitle}</strong>.</p>
        <p>If you accept, you will be added to the tournament as a player (without a team or division yet).</p>
        <p>
          <a href="${acceptLink}" style="display: inline-block; margin-right: 12px; padding: 10px 20px; background: #22c55e; color: white; text-decoration: none; border-radius: 6px;">Accept</a>
          <a href="${declineLink}" style="display: inline-block; padding: 10px 20px; background: #6b7280; color: white; text-decoration: none; border-radius: 6px;">Decline</a>
        </p>
        <p style="color: #6b7280; font-size: 12px;">If you did not expect this invitation, you can ignore this email or decline.</p>
      </body>
    </html>
  `
}
