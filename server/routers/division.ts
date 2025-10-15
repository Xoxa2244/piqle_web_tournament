import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const divisionRouter = createTRPCRouter({
  create: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      name: z.string().min(1),
      teamKind: z.enum(['SINGLES_1v1', 'DOUBLES_2v2', 'SQUAD_4v4']),
      pairingMode: z.enum(['FIXED', 'MIX_AND_MATCH']),
      poolCount: z.number().int().min(0).default(1),  // Number of pools (0 = waitlist only, 1 = single pool)
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
          // Create pools if poolCount >= 1
          pools: poolCount >= 1 ? {
            create: Array.from({ length: poolCount }, (_, i) => ({
              name: poolCount === 1 ? 'Pool 1' : `Pool ${i + 1}`,
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
      poolCount: z.number().int().min(0).optional(),
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
        
        if (poolCount === 0) {
          // Remove all pools (move teams to waitlist)
          console.log('Removing all pools - moving teams to waitlist')
          
          for (const pool of currentDivision.pools) {
            // Move teams from pool to waitlist (poolId = null)
            await ctx.prisma.team.updateMany({
              where: { poolId: pool.id },
              data: { poolId: null }
            })
            
            // Delete the pool
            await ctx.prisma.pool.delete({
              where: { id: pool.id }
            })
          }
        } else if (poolCount > currentDivision.poolCount) {
          // Add new pools
          const newPools = Array.from({ length: poolCount - currentDivision.poolCount }, (_, i) => ({
            divisionId: id,
            name: poolCount === 1 ? 'Pool 1' : `Pool ${currentDivision.poolCount + i + 1}`,
            order: currentDivision.poolCount + i + 1,
          }))
          
          console.log('Creating new pools:', newPools)
          
          await ctx.prisma.pool.createMany({
            data: newPools
          })
        } else if (poolCount < currentDivision.poolCount && poolCount > 0) {
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

  distributeTeamsByDupr: tdProcedure
    .input(z.object({
      divisionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get division with teams and players
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          teams: {
            include: {
              teamPlayers: {
                include: {
                  player: true
                }
              }
            }
          },
          pools: {
            orderBy: { order: 'asc' }
          }
        }
      })

      if (!division) {
        throw new Error('Division not found')
      }

      if (division.pools.length === 0) {
        throw new Error('No pools available for distribution')
      }

      // Calculate team DUPR ratings
      const teamsWithRatings = division.teams.map(team => {
        const playersWithRatings = team.teamPlayers
          .map(tp => tp.player)
          .filter(player => player.duprRating !== null)
        
        const totalRating = playersWithRatings.reduce((sum, player) => {
          return sum + (player.duprRating?.toNumber() || 0)
        }, 0)
        
        const averageRating = playersWithRatings.length > 0 
          ? totalRating / playersWithRatings.length 
          : null

        return {
          team,
          averageRating,
          hasRating: playersWithRatings.length > 0
        }
      })

      // Separate teams with and without ratings
      const teamsWithRatingsSorted = teamsWithRatings
        .filter(t => t.hasRating)
        .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))

      const teamsWithoutRatings = teamsWithRatings
        .filter(t => !t.hasRating)
        .sort(() => Math.random() - 0.5) // Random order

      // Distribute teams by DUPR rating
      const distribution: Array<{ teamId: string; poolId: string }> = []
      
      // First distribute teams with ratings (snake draft)
      teamsWithRatingsSorted.forEach((teamData, index) => {
        const poolIndex = index % division.pools.length
        const pool = division.pools[poolIndex]
        distribution.push({
          teamId: teamData.team.id,
          poolId: pool.id
        })
      })

      // Then distribute teams without ratings randomly
      teamsWithoutRatings.forEach((teamData, index) => {
        const poolIndex = (teamsWithRatingsSorted.length + index) % division.pools.length
        const pool = division.pools[poolIndex]
        distribution.push({
          teamId: teamData.team.id,
          poolId: pool.id
        })
      })

      // Update teams in database
      for (const { teamId, poolId } of distribution) {
        await ctx.prisma.team.update({
          where: { id: teamId },
          data: { poolId }
        })
      }

      // Log the distribution
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division.tournamentId,
          action: 'DISTRIBUTE_TEAMS',
          entityType: 'Division',
          entityId: input.divisionId,
          payload: {
            teamsWithRatings: teamsWithRatingsSorted.length,
            teamsWithoutRatings: teamsWithoutRatings.length,
            distribution: distribution.map(d => ({
              teamId: d.teamId,
              poolId: d.poolId
            }))
          },
        },
      })

      return {
        success: true,
        message: `Distributed ${distribution.length} teams across ${division.pools.length} pools`,
        teamsWithRatings: teamsWithRatingsSorted.length,
        teamsWithoutRatings: teamsWithoutRatings.length
      }
    }),
})
