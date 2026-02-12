import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { normalizeEmail } from '@/lib/emailOtp'
import { assertTournamentAdmin } from '../utils/access'
import { sendHtmlEmail } from '@/lib/sendTransactionEmail'

function getAppBaseUrl(baseUrlFromClient?: string | null): string {
  if (baseUrlFromClient && baseUrlFromClient.startsWith('http')) return baseUrlFromClient.replace(/\/$/, '')
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (env) return env.startsWith('http') ? env : `https://${env}`
  return 'http://localhost:3000'
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
            select: { id: true, title: true },
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

      const html = `
        <div style="font-family: Arial, sans-serif; color: #111827;">
          <p>Hi ${playerName},</p>
          <p>You were added as a participant in <strong>${tournamentTitle}</strong> on Piqle.</p>
          <p>Create your account using this email (${email}) to claim your profile and manage your registrations.</p>
          <p style="margin: 24px 0;">
            <a href="${signupLink}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
              Create your account
            </a>
          </p>
          <p>If you already have an account, just sign in with this email.</p>
        </div>
      `

      await sendHtmlEmail(email, `You're invited to ${tournamentTitle} on Piqle`, html)

      return { ok: true }
    }),
})
