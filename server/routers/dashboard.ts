import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, tdProcedure } from '../trpc'

export const dashboardRouter = createTRPCRouter({
  // Get TD Overview Stats
  getOverview: tdProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    // Get tournaments stats
    const tournaments = await ctx.prisma.tournament.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        entryFee: true,
        _count: {
          select: {
            players: true,
          },
        },
      },
    })

    // Determine status based on dates
    const now = new Date()
    const getTournamentStatus = (tournament: { startDate: Date; endDate: Date }) => {
      if (now > tournament.endDate) return 'COMPLETED'
      if (now >= tournament.startDate && now <= tournament.endDate) return 'IN_PROGRESS'
      return 'UPCOMING'
    }

    // Count by status
    const activeTournaments = tournaments.filter(
      (t) => getTournamentStatus(t) === 'IN_PROGRESS'
    ).length
    const upcomingTournaments = tournaments.filter(
      (t) => getTournamentStatus(t) === 'UPCOMING'
    ).length
    const completedTournaments = tournaments.filter(
      (t) => getTournamentStatus(t) === 'COMPLETED'
    ).length

    // Total players across all tournaments
    const totalPlayers = tournaments.reduce((sum, t) => sum + t._count.players, 0)

    // TODO: Uncomment when Payment model is added
    // Payment stats temporarily disabled (Payment model doesn't exist in Dev)
    const totalRevenue = 0
    const platformFees = 0
    const stripeProcessingFees = 0
    const netRevenue = 0
    const finalPayout = 0
    const monthRevenue = 0
    const monthStripeFees = 0
    const monthFinalPayout = 0
    const pendingPayouts = { _sum: { payoutAmount: 0 } }

    return {
      tournaments: {
        total: tournaments.length,
        active: activeTournaments,
        upcoming: upcomingTournaments,
        completed: completedTournaments,
      },
      players: {
        total: totalPlayers,
      },
      revenue: {
        total: totalRevenue,
        net: netRevenue,
        platformFees,
        stripeProcessingFees,
        finalPayout,
        thisMonth: monthRevenue,
        thisMonthStripeFees: monthStripeFees,
        thisMonthFinalPayout: monthFinalPayout,
        pendingPayouts: pendingPayouts._sum.payoutAmount || 0,
      },
    }
  }),

  // Get Recent Activity
  getRecentActivity: tdProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Get recent registrations
      const recentPlayers = await ctx.prisma.player.findMany({
        where: {
          tournament: {
            userId,
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isPaid: true,
          createdAt: true,
          tournament: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: input.limit,
      })

      // TODO: Payment activities disabled (Payment model doesn't exist in Dev)
      // Get recent payments - temporarily disabled
      const recentPayments: any[] = []

      // Combine and sort by date
      const activities: Array<{
        id: string
        type: 'registration' | 'payment'
        timestamp: Date
        data: any
      }> = [
        ...recentPlayers
          .filter((p) => p.tournament)
          .map((p) => ({
            id: p.id,
            type: 'registration' as const,
            timestamp: p.createdAt,
            data: {
              playerName: `${p.firstName} ${p.lastName}`,
              playerEmail: p.email,
              tournamentId: p.tournament!.id,
              tournamentTitle: p.tournament!.title,
              isPaid: p.isPaid,
            },
          })),
      ]

      // Sort by timestamp and limit
      activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return activities.slice(0, input.limit)
    }),

  // Get Calendar Events (tournaments with dates)
  getCalendarEvents: tdProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const where = {
        userId,
        ...(input.startDate &&
          input.endDate && {
            OR: [
              {
                startDate: {
                  gte: input.startDate,
                  lte: input.endDate,
                },
              },
              {
                endDate: {
                  gte: input.startDate,
                  lte: input.endDate,
                },
              },
            ],
          }),
      }

      const tournaments = await ctx.prisma.tournament.findMany({
        where,
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          venueName: true,
          venueAddress: true,
          entryFee: true,
          _count: {
            select: {
              players: true,
            },
          },
        },
        orderBy: {
          startDate: 'asc',
        },
      })

      // Determine status based on dates
      const now = new Date()
      const getTournamentStatus = (tournament: { startDate: Date; endDate: Date }) => {
        if (now > tournament.endDate) return 'COMPLETED'
        if (now >= tournament.startDate && now <= tournament.endDate) return 'IN_PROGRESS'
        return 'REGISTRATION'
      }

      // Format for calendar
      const events = tournaments.flatMap((tournament) => {
        const baseEvent = {
          id: tournament.id,
          title: tournament.title,
          tournamentId: tournament.id,
          location: tournament.venueName || tournament.venueAddress || undefined,
          status: getTournamentStatus(tournament),
          playersCount: tournament._count.players,
        }

        const events = []

        // Main tournament event
        events.push({
          ...baseEvent,
          type: 'tournament',
          start: tournament.startDate,
          end: tournament.endDate || tournament.startDate,
          allDay: true,
        })

        return events
      })

      return events
    }),

  // Get Revenue Chart Data (monthly)
  // TODO: Uncomment when Payment model is added
  getRevenueChart: tdProcedure
    .input(
      z.object({
        months: z.number().min(1).max(12).default(6),
      })
    )
    .query(async ({ ctx, input }) => {
      // Payment model doesn't exist in Dev - return empty array
      return []
    }),
})

