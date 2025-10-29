import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const tournamentAccessRouter = createTRPCRouter({
  // Поиск пользователей по имени или email
  searchUsers: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      const users = await ctx.prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: input.query, mode: 'insensitive' } },
            { name: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
        },
        take: 10,
      })

      return users
    }),

  // Список всех доступов для турнира
  list: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Проверяем что пользователь является владельцем турнира
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
      })

      if (!tournament || tournament.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only tournament owner can view access list',
        })
      }

      const accesses = await ctx.prisma.tournamentAccess.findMany({
        where: { tournamentId: input.tournamentId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
            },
          },
          division: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return accesses
    }),

  // Выдача доступа
  grant: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      userId: z.string(),
      accessLevel: z.enum(['ADMIN', 'SCORE_ONLY']),
      divisionIds: z.array(z.string()).nullable(), // null = all divisions, empty array = no divisions (invalid), array with ids = specific divisions
    }))
    .mutation(async ({ ctx, input }) => {
      // Проверяем что пользователь является владельцем турнира
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
      })

      if (!tournament || tournament.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only tournament owner can grant access',
        })
      }

      // Проверяем что пользователь существует
      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      })

      if (!targetUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        })
      }

      // Если divisionIds === null, создаем одну запись с divisionId = null (доступ ко всем)
      // Если divisionIds массив, создаем записи для каждого дивизиона
      const divisionsToGrant = input.divisionIds === null ? [null] : input.divisionIds

      if (divisionsToGrant.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Must specify at least one division or null for all divisions',
        })
      }

    // Проверяем что все дивизионы принадлежат этому турниру
    if (input.divisionIds !== null && input.divisionIds.length > 0) {
      const divisions = await ctx.prisma.division.findMany({
        where: {
          id: { in: input.divisionIds },
          tournamentId: input.tournamentId,
        },
      })

      if (divisions.length !== input.divisionIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Some divisions do not belong to this tournament',
        })
      }
    }

    // Удаляем старые доступы для этого пользователя и турнира
    await ctx.prisma.tournamentAccess.deleteMany({
      where: {
        userId: input.userId,
        tournamentId: input.tournamentId,
      },
    })

    // Создаем новые доступы
    const accesses = await Promise.all(
      divisionsToGrant.map((divisionId) =>
        ctx.prisma.tournamentAccess.create({
          data: {
            userId: input.userId,
            tournamentId: input.tournamentId,
            divisionId,
            accessLevel: input.accessLevel,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                image: true,
              },
            },
            division: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      )
    )

    // Audit log
    await ctx.prisma.auditLog.create({
      data: {
        actorUserId: ctx.session.user.id,
        tournamentId: input.tournamentId,
        action: 'GRANT_ACCESS',
        entityType: 'TournamentAccess',
        entityId: accesses[0].id,
        payload: {
          userId: input.userId,
          accessLevel: input.accessLevel,
          divisionIds: input.divisionIds,
        },
      },
    })

    return accesses
  }),

  // Изменение уровня доступа
  update: tdProcedure
    .input(z.object({
      accessId: z.string(),
      accessLevel: z.enum(['ADMIN', 'SCORE_ONLY']).optional(),
      divisionIds: z.array(z.string()).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await ctx.prisma.tournamentAccess.findUnique({
        where: { id: input.accessId },
        include: {
          tournament: true,
        },
      })

      if (!access) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access not found',
        })
      }

      // Проверяем что пользователь является владельцем турнира
      if (access.tournament.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only tournament owner can update access',
        })
      }

      const updateData: any = {}
      if (input.accessLevel !== undefined) {
        updateData.accessLevel = input.accessLevel
      }

      const updatedAccess = await ctx.prisma.tournamentAccess.update({
        where: { id: input.accessId },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
            },
          },
          division: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      // Если изменяются дивизионы, нужно удалить старые и создать новые
      if (input.divisionIds !== undefined) {
        const divisionsToGrant = input.divisionIds === null ? [null] : input.divisionIds

        if (divisionsToGrant.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Must specify at least one division or null for all divisions',
          })
        }

        // Проверяем дивизионы если указаны
        if (input.divisionIds !== null && input.divisionIds.length > 0) {
          const divisions = await ctx.prisma.division.findMany({
            where: {
              id: { in: input.divisionIds },
              tournamentId: access.tournamentId,
            },
          })

          if (divisions.length !== input.divisionIds.length) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Some divisions do not belong to this tournament',
            })
          }
        }

        // Удаляем все доступы для этого пользователя и турнира
        await ctx.prisma.tournamentAccess.deleteMany({
          where: {
            userId: access.userId,
            tournamentId: access.tournamentId,
          },
        })

        // Создаем новые
        const newAccesses = await Promise.all(
          divisionsToGrant.map((divisionId) =>
            ctx.prisma.tournamentAccess.create({
              data: {
                userId: access.userId,
                tournamentId: access.tournamentId,
                divisionId,
                accessLevel: input.accessLevel || access.accessLevel,
              },
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    name: true,
                    image: true,
                  },
                },
                division: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            })
          )
        )

        return newAccesses
      }

      // Audit log
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: access.tournamentId,
          action: 'UPDATE_ACCESS',
          entityType: 'TournamentAccess',
          entityId: input.accessId,
          payload: input,
        },
      })

      return updatedAccess
    }),

  // Отзыв доступа
  revoke: tdProcedure
    .input(z.object({
      accessId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await ctx.prisma.tournamentAccess.findUnique({
        where: { id: input.accessId },
        include: {
          tournament: true,
        },
      })

      if (!access) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access not found',
        })
      }

      // Проверяем что пользователь является владельцем турнира
      if (access.tournament.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only tournament owner can revoke access',
        })
      }

      await ctx.prisma.tournamentAccess.delete({
        where: { id: input.accessId },
      })

      // Audit log
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: access.tournamentId,
          action: 'REVOKE_ACCESS',
          entityType: 'TournamentAccess',
          entityId: input.accessId,
          payload: {
            userId: access.userId,
          },
        },
      })

      return { success: true }
    }),
})

