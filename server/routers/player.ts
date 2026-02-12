import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { normalizeEmail } from '@/lib/emailOtp'
import { assertTournamentAdmin } from '../utils/access'
import { sendHtmlEmail } from '@/lib/sendTransactionEmail'
import { formatUsDateShort } from '@/lib/dateFormat'

function getAppBaseUrl(baseUrlFromClient?: string | null): string {
  if (baseUrlFromClient && baseUrlFromClient.startsWith('http')) return baseUrlFromClient.replace(/\/$/, '')
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (env) return env.startsWith('http') ? env : `https://${env}`
  return 'http://localhost:3000'
}

function formatEmailDate(d: Date | null | undefined): string {
  if (d == null) return '—'
  return formatUsDateShort(d)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildParticipantAddedEmailHtml(args: {
  baseUrl: string
  signupLink: string
  playerName: string
  playerEmail: string
  tournament: {
    id: string
    title: string
    image: string | null
    startDate: Date
    endDate: Date
    registrationStartDate: Date | null
    registrationEndDate: Date | null
    venueName: string | null
    entryFee: number | null
    divisions: Array<{ id: string; name: string }>
    user: { id: string; name: string | null; image: string | null; email: string | null } | null
  } | null
}) {
  const { baseUrl, signupLink, playerName, playerEmail, tournament } = args
  const title = tournament?.title ?? 'Tournament'
  const tournamentLink = tournament?.id ? `${baseUrl}/?open=${tournament.id}` : baseUrl
  const logoUrl = `${baseUrl}/Logo.png`
  const imageUrl = tournament?.image ?? `${baseUrl}/tournament-placeholder.png`
  const entryFee =
    tournament?.entryFee != null && Number(tournament.entryFee) > 0
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
  <title>Added to ${escapeHtml(title)} on Piqle</title>
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
                    <p style="margin: 0 0 8px; font-size: 15px; color: #6b7280;">Hi ${escapeHtml(playerName)},</p>
                    <p style="margin: 0 0 20px; font-size: 15px; color: #6b7280;">You were added as a participant in this tournament</p>
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
                    <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280;">Create your account using this email (${escapeHtml(playerEmail)}) to claim your profile and manage your registrations.</p>
                    <a href="${signupLink}" style="display: inline-block; padding: 12px 24px; background: #22c55e; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Create your account</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 0; text-align: center; font-size: 12px; color: #9ca3af;">If you already have an account, sign in with this email address.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

export const playerRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      dupr: z.string().optional(), // Changed to string for DUPR ID
      duprRating: z.number().min(0).max(5).optional(),
      isPaid: z.boolean().default(false),
      isWaitlist: z.boolean().default(false),
      birthDate: z.date().optional(),
      externalId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tournamentId, ...playerData } = input
      
      // Check if tournament is MLP and validate gender
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { format: true },
      })

      if (tournament?.format === 'MLP') {
        if (!input.gender || input.gender === 'X') {
          throw new Error('Gender (M or F) is required for players in MLP tournaments')
        }
      }
      
      const player = await ctx.prisma.player.create({
        data: {
          ...playerData,
          email: playerData.email ? normalizeEmail(playerData.email) : undefined,
          tournamentId,
        },
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId,
          action: 'CREATE',
          entityType: 'Player',
          entityId: player.id,
          payload: input,
        },
      })

      return player
    }),

  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.player.findMany({
        where: {
          tournamentId: input.tournamentId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              gender: true,
              duprId: true,
              duprRatingSingles: true,
              duprRatingDoubles: true,
            },
          },
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: true,
                },
              },
            },
          },
        } as any,
        orderBy: { createdAt: 'desc' },
      })
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.player.findUnique({
        where: { id: input.id },
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: {
                    include: {
                      tournament: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    }),

  update: tdProcedure
    .input(z.object({
      id: z.string(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      dupr: z.string().optional(),
      duprRating: z.number().min(0).max(5).optional(),
      isPaid: z.boolean().optional(),
      isWaitlist: z.boolean().optional(),
      birthDate: z.date().optional(),
      externalId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      const player = await ctx.prisma.player.findUnique({
        where: { id },
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: {
                    select: { tournamentId: true },
                  },
                },
              },
            },
          },
        },
      })

      if (!player) {
        throw new Error('Player not found')
      }

      // Check if player is in any MLP tournament teams and validate gender
      if (data.gender !== undefined) {
        const playerTeams = await ctx.prisma.teamPlayer.findMany({
          where: { playerId: id },
          include: {
            team: {
              include: {
                division: {
                  include: {
                    tournament: {
                      select: { format: true },
                    },
                  },
                },
              },
            },
          },
        })

        const isInMLPTournament = playerTeams.some(
          tp => tp.team.division.tournament.format === 'MLP'
        )

        if (isInMLPTournament && (!data.gender || data.gender === 'X')) {
          throw new Error('Cannot set gender to X or empty. Gender (M or F) is required for players in MLP tournaments')
        }
      }

      const updatedPlayer = await ctx.prisma.player.update({
        where: { id },
        data: {
          ...data,
          email: data.email ? normalizeEmail(data.email) : data.email,
        },
      })

      // Log the update for each tournament the player is in
      for (const teamPlayer of player.teamPlayers) {
        await ctx.prisma.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: teamPlayer.team.division.tournamentId,
            action: 'UPDATE',
            entityType: 'Player',
            entityId: player.id,
            payload: data,
          },
        })
      }

      return updatedPlayer
    }),

  delete: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.prisma.player.findUnique({
        where: { id: input.id },
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: {
                    select: { tournamentId: true },
                  },
                },
              },
            },
          },
        },
      })

      if (!player) {
        throw new Error('Player not found')
      }

      // Log the deletion for each tournament the player is in
      for (const teamPlayer of player.teamPlayers) {
        await ctx.prisma.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: teamPlayer.team.division.tournamentId,
            action: 'DELETE',
            entityType: 'Player',
            entityId: input.id,
          },
        })
      }

      return ctx.prisma.player.delete({
        where: { id: input.id },
      })
    }),

  addToTeam: tdProcedure
    .input(z.object({
      playerId: z.string(),
      teamId: z.string(),
      role: z.enum(['CAPTAIN', 'PLAYER', 'SUB']).default('PLAYER'),
    }))
    .mutation(async ({ ctx, input }) => {
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        include: {
          division: {
            select: { tournamentId: true },
          },
        },
      })

      if (!team) {
        throw new Error('Team not found')
      }

      // Get tournament format
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: team.division.tournamentId },
        select: { format: true },
      })

      // Get player
      const player = await ctx.prisma.player.findUnique({
        where: { id: input.playerId },
      })

      if (!player) {
        throw new Error('Player not found')
      }

      // Validate gender for MLP tournaments
      if (tournament?.format === 'MLP') {
        if (!player.gender || player.gender === 'X') {
          throw new Error('Player must have gender (M or F) set before adding to MLP team. Please update player profile first.')
        }
      }

      const teamPlayer = await ctx.prisma.teamPlayer.create({
        data: input,
        include: {
          player: true,
          team: true,
        },
      })

      // Log the addition
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'ADD_TO_TEAM',
          entityType: 'TeamPlayer',
          entityId: teamPlayer.id,
          payload: input,
        },
      })

      return teamPlayer
    }),

  removeFromTeam: tdProcedure
    .input(z.object({
      teamPlayerId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const teamPlayer = await ctx.prisma.teamPlayer.findUnique({
        where: { id: input.teamPlayerId },
        include: {
          team: {
            include: {
              division: {
                select: { tournamentId: true },
              },
            },
          },
        },
      })

      if (!teamPlayer) {
        throw new Error('TeamPlayer not found')
      }

      // Log the removal
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: teamPlayer.team.division.tournamentId,
          action: 'REMOVE_FROM_TEAM',
          entityType: 'TeamPlayer',
          entityId: teamPlayer.id,
          payload: { playerId: teamPlayer.playerId, teamId: teamPlayer.teamId },
        },
      })

      return ctx.prisma.teamPlayer.delete({
        where: { id: input.teamPlayerId },
      })
    }),

  inviteByEmail: tdProcedure
    .input(z.object({
      playerId: z.string(),
      baseUrl: z.string().url().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const player = (await ctx.prisma.player.findUnique({
        where: { id: input.playerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userId: true,
          tournamentId: true,
          tournament: {
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
              user: { select: { id: true, name: true, image: true, email: true } },
            },
          },
        } as any,
      })) as any

      if (!player) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found.' })
      }

      if (!player.tournamentId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Player is not linked to a tournament.' })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, player.tournamentId)

      if (!player.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Player does not have an email.' })
      }

      if (player.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Player is already registered.' })
      }

      const baseUrl = getAppBaseUrl(input.baseUrl)
      const email = normalizeEmail(player.email)
      const signupLink = `${baseUrl}/auth/signin?mode=signup&email=${encodeURIComponent(email)}`
      const tournamentTitle = player.tournament?.title ?? 'Tournament'
      const playerName = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || 'there'

      const html = buildParticipantAddedEmailHtml({
        baseUrl,
        signupLink,
        playerName,
        playerEmail: email,
        tournament: player.tournament ?? null,
      })

      await sendHtmlEmail(email, `You're invited to ${tournamentTitle} on Piqle`, html)

      return { ok: true }
    }),
})
