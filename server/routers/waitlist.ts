import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, tdProcedure } from '../trpc'
import { getTeamSlotCount, normalizeTeamSlots } from '../utils/teamSlots'
import { sendWaitlistPromotionNotification } from '../utils/notifications'

export const waitlistRouter = createTRPCRouter({
  listByTournament: tdProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.waitlistEntry.findMany({
        where: {
          tournamentId: input.tournamentId,
          status: 'ACTIVE',
        },
        include: {
          player: true,
          division: true,
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  moveToSlot: tdProcedure
    .input(z.object({
      waitlistEntryId: z.string(),
      teamId: z.string(),
      slotIndex: z.number().min(0).max(7),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const entry = await tx.waitlistEntry.findUnique({
          where: { id: input.waitlistEntryId },
          include: {
            player: true,
            division: true,
            tournament: true,
          },
        })

        if (!entry) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Waitlist entry not found' })
        }

        const team = await tx.team.findUnique({
          where: { id: input.teamId },
          include: {
            division: {
              include: {
                tournament: {
                  select: { format: true },
                },
              },
            },
          },
        })

        if (!team) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' })
        }

        if (team.division.tournamentId !== entry.tournamentId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Team is not in the same tournament' })
        }

        const slotCount = getTeamSlotCount(
          team.division.teamKind,
          team.division.tournament?.format
        )
        if (input.slotIndex >= slotCount) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid slot index' })
        }

        await normalizeTeamSlots(tx, team.id, slotCount)

        const existingSlot = await tx.teamPlayer.findFirst({
          where: {
            teamId: team.id,
            slotIndex: input.slotIndex,
          },
        })
        if (existingSlot) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Slot already taken' })
        }

        const existingTeamPlayer = await tx.teamPlayer.findFirst({
          where: {
            playerId: entry.playerId,
            team: {
              division: {
                tournamentId: entry.tournamentId,
              },
            },
          },
        })
        if (existingTeamPlayer) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Player already assigned' })
        }

        const teamPlayer = await tx.teamPlayer.create({
          data: {
            teamId: team.id,
            playerId: entry.playerId,
            slotIndex: input.slotIndex,
          },
        })

        await tx.waitlistEntry.delete({ where: { id: entry.id } })
        await tx.player.update({
          where: { id: entry.playerId },
          data: { isWaitlist: false },
        })

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: entry.tournamentId,
            action: 'WAITLIST_MOVE_TO_SLOT',
            entityType: 'WaitlistEntry',
            entityId: entry.id,
            payload: {
              teamId: team.id,
              divisionId: team.divisionId,
              slotIndex: input.slotIndex,
            },
          },
        })

        await sendWaitlistPromotionNotification({
          userId: entry.player.userId ?? null,
          tournamentId: entry.tournamentId,
          divisionName: team.division.name,
          teamName: team.name,
        })

        return { success: true, teamPlayerId: teamPlayer.id }
      })
    }),
})
