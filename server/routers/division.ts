import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const divisionRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      name: z.string().min(1),
      teamKind: z.enum(['SINGLES_1v1', 'DOUBLES_2v2', 'SQUAD_4v4']),
      pairingMode: z.enum(['FIXED', 'MIX_AND_MATCH']),
      poolCount: z.number().int().min(1).default(1),  // Количество пулов (1 = без пулов)
      maxTeams: z.number().optional(),
      // Constraints
      minDupr: z.number().optional(),
      maxDupr: z.number().optional(),
      minAge: z.number().optional(),
      maxAge: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { minDupr, maxDupr, minAge, maxAge, poolCount, ...divisionData } = input
      
      const division = await ctx.prisma.division.create({
        data: {
          ...divisionData,
          poolCount,
          constraints: {
            create: {
              minDupr: minDupr ? minDupr : null,
              maxDupr: maxDupr ? maxDupr : null,
              minAge: minAge ? minAge : null,
              maxAge: maxAge ? maxAge : null,
            }
          },
          // Создаем пулы если poolCount >= 1
          pools: poolCount >= 1 ? {
            create: Array.from({ length: poolCount }, (_, i) => ({
              name: `Pool ${i + 1}`,
              order: i + 1,
            }))
          } : undefined
        },
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.tournamentId,
          action: 'CREATE',
          entityType: 'Division',
          entityId: division.id,
          payload: input,
        },
      })

      return division
    }),

  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.division.findMany({
        where: { tournamentId: input.tournamentId },
        include: {
          constraints: true,
          teams: true,
          pools: true,
          _count: {
            select: {
              teams: true,
              pools: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.division.findUnique({
        where: { id: input.id },
        include: {
          tournament: true,
          constraints: true,
          teams: {
            include: {
              teamPlayers: {
                include: {
                  player: true,
                },
              },
            },
          },
          pools: true,
        },
      })
    }),

  update: tdProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      teamKind: z.enum(['SINGLES_1v1', 'DOUBLES_2v2', 'SQUAD_4v4']).optional(),
      pairingMode: z.enum(['FIXED', 'MIX_AND_MATCH']).optional(),
      poolCount: z.number().int().min(1).optional(),
      maxTeams: z.number().optional(),
      // Constraints
      minDupr: z.number().optional(),
      maxDupr: z.number().optional(),
      minAge: z.number().optional(),
      maxAge: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, minDupr, maxDupr, minAge, maxAge, poolCount, ...divisionData } = input
      
      console.log('Division update input:', { id, poolCount, divisionData })
      
      // Get current division to check if poolCount is changing
      const currentDivision = await ctx.prisma.division.findUnique({
        where: { id },
        include: { pools: true }
      })

      if (!currentDivision) {
        throw new Error('Division not found')
      }

      console.log('Current division:', { 
        id: currentDivision.id, 
        name: currentDivision.name, 
        poolCount: currentDivision.poolCount,
        poolsCount: currentDivision.pools.length 
      })

      // Update division basic data
      const division = await ctx.prisma.division.update({
        where: { id },
        data: {
          ...divisionData,
          poolCount: poolCount ?? currentDivision.poolCount,
        },
      })

      console.log('Updated division poolCount:', division.poolCount)

      // Handle pool count changes
      if (poolCount !== undefined && poolCount !== currentDivision.poolCount) {
        console.log('Pool count is changing:', { from: currentDivision.poolCount, to: poolCount })
        
        if (poolCount > currentDivision.poolCount) {
          // Add new pools
          const newPools = Array.from({ length: poolCount - currentDivision.poolCount }, (_, i) => ({
            divisionId: id,
            name: `Pool ${currentDivision.poolCount + i + 1}`,
            order: currentDivision.poolCount + i + 1,
          }))
          
          console.log('Creating new pools:', newPools)
          
          await ctx.prisma.pool.createMany({
            data: newPools
          })
        } else if (poolCount < currentDivision.poolCount) {
          // Remove excess pools (move teams to first pool)
          const poolsToRemove = currentDivision.pools
            .filter(pool => pool.order > poolCount)
            .sort((a, b) => b.order - a.order) // Remove from highest order first

          console.log('Removing pools:', poolsToRemove.map(p => ({ id: p.id, name: p.name, order: p.order })))

          for (const pool of poolsToRemove) {
            // Move teams from removed pool to first pool
            const firstPool = currentDivision.pools.find(p => p.order === 1)
            if (firstPool) {
              await ctx.prisma.team.updateMany({
                where: { poolId: pool.id },
                data: { poolId: firstPool.id }
              })
            }
            
            // Delete the pool
            await ctx.prisma.pool.delete({
              where: { id: pool.id }
            })
          }
        }
      } else {
        console.log('Pool count is not changing or undefined')
      }

      // Update constraints if provided
      if (minDupr !== undefined || maxDupr !== undefined || minAge !== undefined || maxAge !== undefined) {
        const constraintsData: any = {}
        if (minDupr !== undefined) constraintsData.minDupr = minDupr
        if (maxDupr !== undefined) constraintsData.maxDupr = maxDupr
        if (minAge !== undefined) constraintsData.minAge = minAge
        if (maxAge !== undefined) constraintsData.maxAge = maxAge

        await ctx.prisma.divisionConstraints.upsert({
          where: { divisionId: id },
          create: {
            divisionId: id,
            ...constraintsData,
          },
          update: constraintsData,
        })
      }

      // Log the update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'UPDATE',
          entityType: 'Division',
          entityId: id,
          payload: input,
        },
      })

      return division
    }),

  delete: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.id },
        select: { tournamentId: true },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      // Log the deletion
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'DELETE',
          entityType: 'Division',
          entityId: input.id,
        },
      })

      return ctx.prisma.division.delete({
        where: { id: input.id },
      })
    }),

  setConstraints: tdProcedure
    .input(z.object({
      divisionId: z.string(),
      minDupr: z.number().optional(),
      maxDupr: z.number().optional(),
      minAge: z.number().optional(),
      maxAge: z.number().optional(),
      genders: z.enum(['ANY', 'MEN', 'WOMEN', 'MIXED']).default('ANY'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { divisionId, ...constraintsData } = input

      const division = await ctx.prisma.division.findUnique({
        where: { id: divisionId },
        select: { tournamentId: true },
      })

      if (!division) {
        throw new Error('Division not found')
      }

      const constraints = await ctx.prisma.divisionConstraints.upsert({
        where: { divisionId },
        create: {
          divisionId,
          ...constraintsData,
        },
        update: constraintsData,
      })

      // Log the update
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'UPDATE_CONSTRAINTS',
          entityType: 'DivisionConstraints',
          entityId: constraints.id,
          payload: constraintsData,
        },
      })

      return constraints
    }),
})
