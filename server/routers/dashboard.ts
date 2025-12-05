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
        status: true,
        isPaid: true,
        entryFee: true,
        currency: true,
        _count: {
          select: {
            players: true,
          },
        },
      },
    })

    // Count by status
    const activeTournaments = tournaments.filter(
      (t) => t.status === 'IN_PROGRESS'
    ).length
    const upcomingTournaments = tournaments.filter(
      (t) => t.status === 'REGISTRATION' || t.status === 'DRAFT'
    ).length
    const completedTournaments = tournaments.filter(
      (t) => t.status === 'COMPLETED'
    ).length

    // Total players across all tournaments
    const totalPlayers = tournaments.reduce((sum, t) => sum + t._count.players, 0)

    // Get payments stats
    const payments = await ctx.prisma.payment.findMany({
      where: {
        tournament: {
          userId,
        },
        status: 'SUCCEEDED',
      },
      select: {
        amount: true,
        applicationFeeAmount: true,
        payoutAmount: true,
        createdAt: true,
      },
    })

    // Calculate revenue
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0)
    const platformFees = payments.reduce((sum, p) => sum + p.applicationFeeAmount, 0)
    const netRevenue = payments.reduce((sum, p) => sum + p.payoutAmount, 0)

    // Revenue this month
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthRevenue = payments
      .filter((p) => p.createdAt >= startOfMonth)
      .reduce((sum, p) => sum + p.payoutAmount, 0)

    // Get pending payouts (payments for active/upcoming tournaments)
    const pendingPayouts = await ctx.prisma.payment.aggregate({
      where: {
        tournament: {
          userId,
          status: {
            in: ['REGISTRATION', 'IN_PROGRESS'],
          },
        },
        status: 'SUCCEEDED',
      },
      _sum: {
        payoutAmount: true,
      },
    })

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
        thisMonth: monthRevenue,
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

      // Get recent payments
      const recentPayments = await ctx.prisma.payment.findMany({
        where: {
          tournament: {
            userId,
          },
        },
        select: {
          id: true,
          amount: true,
          payoutAmount: true,
          status: true,
          createdAt: true,
          tournament: {
            select: {
              id: true,
              title: true,
            },
          },
          player: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: input.limit,
      })

      // Combine and sort by date
      const activities: Array<{
        id: string
        type: 'registration' | 'payment'
        timestamp: Date
        data: any
      }> = [
        ...recentPlayers.map((p) => ({
          id: p.id,
          type: 'registration' as const,
          timestamp: p.createdAt,
          data: {
            playerName: `${p.firstName} ${p.lastName}`,
            playerEmail: p.email,
            tournamentId: p.tournament.id,
            tournamentTitle: p.tournament.title,
            isPaid: p.isPaid,
          },
        })),
        ...recentPayments.map((p) => ({
          id: p.id,
          type: 'payment' as const,
          timestamp: p.createdAt,
          data: {
            amount: p.amount,
            payoutAmount: p.payoutAmount,
            status: p.status,
            tournamentId: p.tournament.id,
            tournamentTitle: p.tournament.title,
            playerName: p.player
              ? `${p.player.firstName} ${p.player.lastName}`
              : 'Unknown',
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
          status: true,
          location: true,
          isPaid: true,
          entryFee: true,
          registrationDeadline: true,
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

      // Format for calendar
      const events = tournaments.flatMap((tournament) => {
        const baseEvent = {
          id: tournament.id,
          title: tournament.title,
          tournamentId: tournament.id,
          location: tournament.location,
          status: tournament.status,
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

        // Registration deadline event
        if (tournament.registrationDeadline) {
          events.push({
            ...baseEvent,
            type: 'registration_deadline',
            title: `🔒 ${tournament.title} - Reg Closes`,
            start: tournament.registrationDeadline,
            end: tournament.registrationDeadline,
            allDay: true,
          })
        }

        return events
      })

      return events
    }),

  // Get Revenue Chart Data (monthly)
  getRevenueChart: tdProcedure
    .input(
      z.object({
        months: z.number().min(1).max(12).default(6),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const now = new Date()
      const startDate = new Date(now.getFullYear(), now.getMonth() - input.months + 1, 1)

      const payments = await ctx.prisma.payment.findMany({
        where: {
          tournament: {
            userId,
          },
          status: 'SUCCEEDED',
          createdAt: {
            gte: startDate,
          },
        },
        select: {
          amount: true,
          applicationFeeAmount: true,
          payoutAmount: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      })

      // Group by month
      const monthlyData: Record<
        string,
        { total: number; platformFee: number; net: number }
      > = {}

      payments.forEach((payment) => {
        const monthKey = `${payment.createdAt.getFullYear()}-${String(
          payment.createdAt.getMonth() + 1
        ).padStart(2, '0')}`

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { total: 0, platformFee: 0, net: 0 }
        }

        monthlyData[monthKey].total += payment.amount
        monthlyData[monthKey].platformFee += payment.applicationFeeAmount
        monthlyData[monthKey].net += payment.payoutAmount
      })

      // Format for chart
      const chartData = Object.entries(monthlyData).map(([month, data]) => ({
        month,
        total: data.total,
        platformFee: data.platformFee,
        net: data.net,
      }))

      return chartData
    }),
})

