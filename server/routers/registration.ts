import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { getTeamSlotCount, normalizeTeamSlots } from '../utils/teamSlots'

const getRegistrationWindow = (tournament: {
  registrationStartDate: Date | null
  registrationEndDate: Date | null
  startDate: Date
}) => {
  const start = tournament.registrationStartDate ?? tournament.startDate
  const end = tournament.registrationEndDate ?? tournament.startDate
  return { start, end }
}

const isRegistrationOpen = (tournament: {
  registrationStartDate: Date | null
  registrationEndDate: Date | null
  startDate: Date
}) => {
  const { start, end } = getRegistrationWindow(tournament)
  const now = new Date()
  return now >= start && now <= end
}

const parseName = (name?: string | null) => {
  if (!name) return { firstName: 'Player', lastName: '' }
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export const registrationRouter = createTRPCRouter({
  getSeatMap: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        include: {
          divisions: {
            include: {
              pools: true,
              teams: {
                include: {
                  teamPlayers: {
                    include: {
                      player: true,
                    },
                  },
                },
              },
            },
          },
        },
      })

      if (!tournament) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      return {
        id: tournament.id,
        title: tournament.title,
        startDate: tournament.startDate,
        registrationStartDate: tournament.registrationStartDate,
        registrationEndDate: tournament.registrationEndDate,
        divisions: tournament.divisions,
      }
    }),

  getMyStatus: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: {
            userId: ctx.session.user.id,
            tournamentId: input.tournamentId,
          },
        },
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: true,
                },
              },
            },
          },
          waitlistEntries: true,
        },
      })

      if (!player) {
        return { status: 'none' as const }
      }

      const activeTeamPlayer = player.teamPlayers.find(tp => tp.team.division.tournamentId === input.tournamentId)
      if (activeTeamPlayer) {
        return {
          status: 'active' as const,
          playerId: player.id,
          teamId: activeTeamPlayer.teamId,
          divisionId: activeTeamPlayer.team.divisionId,
          slotIndex: activeTeamPlayer.slotIndex,
          teamName: activeTeamPlayer.team.name,
          divisionName: activeTeamPlayer.team.division.name,
        }
      }

      const waitlistEntry = player.waitlistEntries.find(entry => entry.tournamentId === input.tournamentId && entry.status === 'ACTIVE')
      if (waitlistEntry) {
        return {
          status: 'waitlisted' as const,
          playerId: player.id,
          divisionId: waitlistEntry.divisionId,
          waitlistEntryId: waitlistEntry.id,
        }
      }

      return { status: 'none' as const }
    }),

  getMyStatuses: protectedProcedure
    .input(z.object({ tournamentIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const players = await ctx.prisma.player.findMany({
        where: {
          userId: ctx.session.user.id,
          tournamentId: { in: input.tournamentIds },
        },
        include: {
          teamPlayers: {
            include: {
              team: {
                include: {
                  division: true,
                },
              },
            },
          },
          waitlistEntries: true,
        },
      })

      const statusByTournament: Record<string, any> = {}
      input.tournamentIds.forEach(id => {
        statusByTournament[id] = { status: 'none' as const }
      })

      for (const player of players) {
        if (!player.tournamentId) continue
        const activeTeamPlayer = player.teamPlayers.find(tp => tp.team.division.tournamentId === player.tournamentId)
        if (activeTeamPlayer) {
          statusByTournament[player.tournamentId] = {
            status: 'active' as const,
            playerId: player.id,
            teamId: activeTeamPlayer.teamId,
            divisionId: activeTeamPlayer.team.divisionId,
            slotIndex: activeTeamPlayer.slotIndex,
            teamName: activeTeamPlayer.team.name,
            divisionName: activeTeamPlayer.team.division.name,
          }
          continue
        }

        const waitlistEntry = player.waitlistEntries.find(entry => entry.tournamentId === player.tournamentId && entry.status === 'ACTIVE')
        if (waitlistEntry) {
          statusByTournament[player.tournamentId] = {
            status: 'waitlisted' as const,
            playerId: player.id,
            divisionId: waitlistEntry.divisionId,
            waitlistEntryId: waitlistEntry.id,
          }
        }
      }

      return statusByTournament
    }),

  getWaitlist: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.waitlistEntry.findMany({
        where: {
          divisionId: input.divisionId,
          status: 'ACTIVE',
        },
        include: {
          player: true,
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  claimSlot: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      slotIndex: z.number().min(0).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const team = await tx.team.findUnique({
          where: { id: input.teamId },
          include: {
            division: {
              include: {
                tournament: true,
              },
            },
            teamPlayers: true,
          },
        })

        if (!team) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' })
        }

        if (!isRegistrationOpen(team.division.tournament)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration closed' })
        }

        const slotCount = getTeamSlotCount(team.division.teamKind)
        if (input.slotIndex >= slotCount) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid slot index' })
        }

        await normalizeTeamSlots(tx, team.id, slotCount)

        const existingSlot = await tx.teamPlayer.findFirst({
          where: { teamId: team.id, slotIndex: input.slotIndex },
        })
        if (existingSlot) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Slot already taken' })
        }

        let player = await tx.player.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: team.division.tournamentId,
            },
          },
        })

        if (!player) {
          const { firstName, lastName } = parseName(ctx.session.user.name)
          player = await tx.player.create({
            data: {
              tournamentId: team.division.tournamentId,
              userId: ctx.session.user.id,
              firstName,
              lastName,
              email: ctx.session.user.email ?? undefined,
              isWaitlist: false,
            },
          })
        }

        const existingTeamPlayer = await tx.teamPlayer.findFirst({
          where: {
            playerId: player.id,
            team: {
              division: {
                tournamentId: team.division.tournamentId,
              },
            },
          },
        })
        if (existingTeamPlayer) {
          throw new TRPCError({ code: 'CONFLICT', message: 'You already joined this tournament' })
        }

        await tx.waitlistEntry.deleteMany({
          where: {
            playerId: player.id,
            tournamentId: team.division.tournamentId,
          },
        })

        await tx.player.update({
          where: { id: player.id },
          data: { isWaitlist: false },
        })

        const teamPlayer = await tx.teamPlayer.create({
          data: {
            teamId: team.id,
            playerId: player.id,
            slotIndex: input.slotIndex,
          },
        })

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: team.division.tournamentId,
            action: 'PLAYER_CLAIM_SLOT',
            entityType: 'TeamPlayer',
            entityId: teamPlayer.id,
            payload: {
              teamId: team.id,
              divisionId: team.divisionId,
              slotIndex: input.slotIndex,
            },
          },
        })

        return { success: true }
      })
    }),

  cancelRegistration: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: {
            userId: ctx.session.user.id,
            tournamentId: input.tournamentId,
          },
        },
      })

      if (!player) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      const teamPlayer = await ctx.prisma.teamPlayer.findFirst({
        where: {
          playerId: player.id,
          team: {
            division: {
              tournamentId: input.tournamentId,
            },
          },
        },
        include: {
          team: {
            include: {
              division: true,
            },
          },
        },
      })

      if (!teamPlayer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Registration not found' })
      }

      await ctx.prisma.teamPlayer.delete({ where: { id: teamPlayer.id } })

      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.tournamentId,
          action: 'PLAYER_CANCEL_REGISTRATION',
          entityType: 'TeamPlayer',
          entityId: teamPlayer.id,
          payload: {
            teamId: teamPlayer.teamId,
            divisionId: teamPlayer.team.divisionId,
          },
        },
      })

      return { success: true }
    }),

  joinWaitlist: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const division = await tx.division.findUnique({
          where: { id: input.divisionId },
          include: { tournament: true },
        })

        if (!division) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
        }

        if (!isRegistrationOpen(division.tournament)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration closed' })
        }

        let player = await tx.player.findUnique({
          where: {
            userId_tournamentId: {
              userId: ctx.session.user.id,
              tournamentId: division.tournamentId,
            },
          },
        })

        if (!player) {
          const { firstName, lastName } = parseName(ctx.session.user.name)
          player = await tx.player.create({
            data: {
              tournamentId: division.tournamentId,
              userId: ctx.session.user.id,
              firstName,
              lastName,
              email: ctx.session.user.email ?? undefined,
              isWaitlist: true,
            },
          })
        }

        const existingTeamPlayer = await tx.teamPlayer.findFirst({
          where: {
            playerId: player.id,
            team: {
              division: {
                tournamentId: division.tournamentId,
              },
            },
          },
        })
        if (existingTeamPlayer) {
          throw new TRPCError({ code: 'CONFLICT', message: 'You already joined this tournament' })
        }

        const existingEntry = await tx.waitlistEntry.findFirst({
          where: {
            playerId: player.id,
            tournamentId: division.tournamentId,
            status: 'ACTIVE',
          },
        })
        if (existingEntry) {
          return { success: true }
        }

        await tx.waitlistEntry.create({
          data: {
            tournamentId: division.tournamentId,
            divisionId: division.id,
            playerId: player.id,
            status: 'ACTIVE',
          },
        })

        await tx.player.update({
          where: { id: player.id },
          data: { isWaitlist: true },
        })

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: division.tournamentId,
            action: 'PLAYER_JOIN_WAITLIST',
            entityType: 'WaitlistEntry',
            entityId: player.id,
            payload: {
              divisionId: division.id,
            },
          },
        })

        return { success: true }
      })
    }),

  leaveWaitlist: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        select: { tournamentId: true },
      })

      if (!division) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
      }

      const player = await ctx.prisma.player.findUnique({
        where: {
          userId_tournamentId: {
            userId: ctx.session.user.id,
            tournamentId: division.tournamentId,
          },
        },
      })

      if (!player) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      await ctx.prisma.waitlistEntry.deleteMany({
        where: {
          playerId: player.id,
          tournamentId: division.tournamentId,
        },
      })

      await ctx.prisma.player.update({
        where: { id: player.id },
        data: { isWaitlist: false },
      })

      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'PLAYER_LEAVE_WAITLIST',
          entityType: 'WaitlistEntry',
          entityId: player.id,
          payload: {
            divisionId: input.divisionId,
          },
        },
      })

      return { success: true }
    }),
})
