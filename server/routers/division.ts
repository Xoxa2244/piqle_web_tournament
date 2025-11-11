import { z } from 'zod'
import { Prisma } from '@prisma/client'
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

      // Check if the user is an admin (not owner) and add division to their access
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.tournamentId },
        select: { userId: true },
      })

      if (tournament && tournament.userId !== ctx.session.user.id) {
        // User is not the owner, check if they have admin access
        const adminAccess = await ctx.prisma.tournamentAccess.findFirst({
          where: {
            userId: ctx.session.user.id,
            tournamentId: input.tournamentId,
            accessLevel: 'ADMIN',
          },
        })

        if (adminAccess) {
          // Admin is creating a division
          // Check if admin has access to all divisions (divisionId = null)
          const hasAllDivisionsAccess = await ctx.prisma.tournamentAccess.findFirst({
            where: {
              userId: ctx.session.user.id,
              tournamentId: input.tournamentId,
              divisionId: null,
            },
          })

          // If admin doesn't have "all divisions" access, add this specific division to their access
          if (!hasAllDivisionsAccess) {
            // Check if access to this specific division already exists
            const existingAccess = await ctx.prisma.tournamentAccess.findUnique({
              where: {
                userId_tournamentId_divisionId: {
                  userId: ctx.session.user.id,
                  tournamentId: input.tournamentId,
                  divisionId: division.id,
                },
              },
            })

            // Create access only if it doesn't exist
            if (!existingAccess) {
              await ctx.prisma.tournamentAccess.create({
                data: {
                  userId: ctx.session.user.id,
                  tournamentId: input.tournamentId,
                  divisionId: division.id,
                  accessLevel: 'ADMIN',
                },
              })
            }
          }
        }
      }

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

  mergeDivisions: tdProcedure
    .input(z.object({
      divisionId1: z.string(),
      divisionId2: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get both divisions with all related data
      const [division1, division2] = await Promise.all([
        ctx.prisma.division.findUnique({
          where: { id: input.divisionId1 },
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
            },
            constraints: true,
            tournament: { select: { id: true } }
          }
        }),
        ctx.prisma.division.findUnique({
          where: { id: input.divisionId2 },
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
            },
            constraints: true,
            tournament: { select: { id: true } }
          }
        })
      ])

      if (!division1 || !division2) {
        throw new Error('One or both divisions not found')
      }

      if (division1.tournamentId !== division2.tournamentId) {
        throw new Error('Cannot merge divisions from different tournaments')
      }

      if (division1.isMerged || division2.isMerged) {
        throw new Error('Cannot merge already merged divisions')
      }

      if (division1.teamKind !== division2.teamKind) {
        throw new Error('Cannot merge divisions with different team kinds')
      }

      if (division1.pairingMode !== division2.pairingMode) {
        throw new Error('Cannot merge divisions with different pairing modes')
      }

      // Determine merged division settings (use division1 as base)
      const mergedName = `Merged Division: ${division1.name} + ${division2.name}`
      const mergedPoolCount = Math.max(division1.poolCount, division2.poolCount)
      const mergedMaxTeams = division1.maxTeams && division2.maxTeams 
        ? division1.maxTeams + division2.maxTeams 
        : division1.maxTeams || division2.maxTeams || null

      // Create merged division
      const mergedDivision = await ctx.prisma.division.create({
        data: {
          tournamentId: division1.tournamentId,
          name: mergedName,
          teamKind: division1.teamKind,
          pairingMode: division1.pairingMode,
          maxTeams: mergedMaxTeams,
          poolCount: mergedPoolCount,
          stage: 'RR_IN_PROGRESS',
          isMerged: true,
          mergedFromDivisionIds: [division1.id, division2.id],
          // Copy constraints from division1 (or merge if needed)
          constraints: division1.constraints ? {
            create: {
              minDupr: division1.constraints.minDupr,
              maxDupr: division1.constraints.maxDupr,
              minAge: division1.constraints.minAge,
              maxAge: division1.constraints.maxAge,
              genders: division1.constraints.genders,
            }
          } : undefined,
          // Create pools
          pools: {
            create: Array.from({ length: mergedPoolCount }, (_, i) => ({
              name: mergedPoolCount === 1 ? 'Pool 1' : `Pool ${i + 1}`,
              order: i + 1,
            }))
          }
        },
        include: {
          pools: true
        }
      })

      // Get all pools from both divisions
      const allPools = [
        ...division1.pools.map(p => ({ ...p, sourceDivisionId: division1.id })),
        ...division2.pools.map(p => ({ ...p, sourceDivisionId: division2.id }))
      ]

      // Collect all teams from both divisions with source tracking
      // Store source division ID in team note field for tracking
      const allTeams = [
        ...division1.teams.map(t => ({ ...t, sourceDivisionId: division1.id, sourceDivisionName: division1.name })),
        ...division2.teams.map(t => ({ ...t, sourceDivisionId: division2.id, sourceDivisionName: division2.name }))
      ]

      // Map teams to new pools (distribute evenly)
      const teamsPerPool = Math.ceil(allTeams.length / mergedDivision.pools.length)
      const mergedPools = mergedDivision.pools.sort((a, b) => a.order - b.order)

      // Move teams to merged division
      for (let i = 0; i < allTeams.length; i++) {
        const team = allTeams[i]
        const targetPoolIndex = Math.floor(i / teamsPerPool)
        const targetPool = mergedPools[targetPoolIndex] || mergedPools[0]

        // Store source division info in note field (append to existing note if any)
        const sourceInfo = `[MERGED_FROM:${team.sourceDivisionId}]`
        const updatedNote = team.note 
          ? `${team.note} ${sourceInfo}`
          : sourceInfo

        // Update team's division and pool
        await ctx.prisma.team.update({
          where: { id: team.id },
          data: {
            divisionId: mergedDivision.id,
            poolId: targetPool.id,
            note: updatedNote,
          }
        })
      }

      // Move all Round Robin matches from source divisions to merged division
      // This preserves all match results (games) that were already entered
      const [matches1, matches2] = await Promise.all([
        ctx.prisma.match.findMany({
          where: {
            divisionId: division1.id,
            stage: 'ROUND_ROBIN'
          },
          include: {
            games: true
          }
        }),
        ctx.prisma.match.findMany({
          where: {
            divisionId: division2.id,
            stage: 'ROUND_ROBIN'
          },
          include: {
            games: true
          }
        })
      ])

      const allRRMatches = [...matches1, ...matches2]

      // Update divisionId for all Round Robin matches to point to merged division
      // This preserves all games (results) that were already entered
      for (const match of allRRMatches) {
        await ctx.prisma.match.update({
          where: { id: match.id },
          data: {
            divisionId: mergedDivision.id,
            // Keep poolId if it exists, otherwise set to null (matches might be pool-based)
            // If match was pool-based, we need to map it to the new pool structure
            // For now, we'll keep the original poolId if it exists, or set to null
            poolId: match.poolId || null,
          }
        })
      }

      // Log the merge
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: division1.tournamentId,
          action: 'MERGE_DIVISIONS',
          entityType: 'Division',
          entityId: mergedDivision.id,
          payload: {
            mergedFrom: [division1.id, division2.id],
            mergedDivisionId: mergedDivision.id,
            teamsCount: allTeams.length,
          },
        },
      })

      return {
        success: true,
        mergedDivision,
        message: `Successfully merged ${division1.name} and ${division2.name}`,
      }
    }),

  unmergeDivision: tdProcedure
    .input(z.object({
      mergedDivisionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get merged division with all related data
      const mergedDivision = await ctx.prisma.division.findUnique({
        where: { id: input.mergedDivisionId },
        include: {
          teams: {
            include: {
              teamPlayers: {
                include: {
                  player: true
                }
              },
              standings: true,
            }
          },
          pools: {
            orderBy: { order: 'asc' }
          },
          constraints: true,
          matches: {
            include: {
              games: true,
            }
          },
          standings: true,
          tournament: { select: { id: true } }
        }
      })

      if (!mergedDivision) {
        throw new Error('Merged division not found')
      }

      if (!mergedDivision.isMerged || !mergedDivision.mergedFromDivisionIds) {
        throw new Error('Division is not a merged division')
      }

      const originalDivisionIds = mergedDivision.mergedFromDivisionIds as string[]
      if (originalDivisionIds.length !== 2) {
        throw new Error('Invalid merged division: must have exactly 2 original divisions')
      }

      // Get original divisions data from audit logs or recreate from merged data
      // For now, we'll need to store original division metadata or recreate divisions
      // Since we can't fully restore, we'll create new divisions with original names
      // In production, you might want to soft-delete original divisions instead

      // For this implementation, we'll need to track original division names
      // Let's assume we can extract names from the merged division name
      const nameMatch = mergedDivision.name.match(/^Merged Division: (.+) \+ (.+)$/)
      if (!nameMatch) {
        throw new Error('Cannot extract original division names from merged division name')
      }

      const [, name1, name2] = nameMatch

      // Check if original divisions still exist
      const [existingDivision1, existingDivision2] = await Promise.all([
        ctx.prisma.division.findUnique({
          where: { id: originalDivisionIds[0] },
          include: { pools: { orderBy: { order: 'asc' } } }
        }),
        ctx.prisma.division.findUnique({
          where: { id: originalDivisionIds[1] },
          include: { pools: { orderBy: { order: 'asc' } } }
        })
      ])

      // Split teams back to original divisions based on source division tracking
      // Teams have source division ID stored in their note field as [MERGED_FROM:divisionId]
      const teams1: typeof mergedDivision.teams = []
      const teams2: typeof mergedDivision.teams = []
      
      mergedDivision.teams.forEach(team => {
        // Extract source division ID from note field
        const sourceMatch = team.note?.match(/\[MERGED_FROM:([^\]]+)\]/)
        const sourceDivisionId = sourceMatch ? sourceMatch[1] : null
        
        // Remove the merge tracking info from note
        const cleanedNote = team.note?.replace(/\[MERGED_FROM:[^\]]+\]\s?/, '').trim() || null
        
        if (sourceDivisionId === originalDivisionIds[0]) {
          teams1.push({ ...team, note: cleanedNote })
        } else if (sourceDivisionId === originalDivisionIds[1]) {
          teams2.push({ ...team, note: cleanedNote })
        } else {
          // If we can't determine source, split evenly (fallback)
          if (teams1.length <= teams2.length) {
            teams1.push({ ...team, note: cleanedNote })
          } else {
            teams2.push({ ...team, note: cleanedNote })
          }
        }
      })

      // Restore or recreate original divisions
      type DivisionWithPools = {
        id: string
        tournamentId: string
        name: string
        teamKind: string
        pairingMode: string
        maxTeams: number | null
        poolCount: number
        stage: string | null
        isMerged: boolean
        pools: Array<{ id: string; name: string; order: number; divisionId: string }>
      }
      let division1: DivisionWithPools
      let division2: DivisionWithPools

      if (existingDivision1) {
        // Restore existing division1
        division1 = await ctx.prisma.division.update({
          where: { id: existingDivision1.id },
          data: {
            stage: 'RR_COMPLETE',
            isMerged: false,
            mergedFromDivisionIds: Prisma.JsonNull,
          },
          include: { pools: { orderBy: { order: 'asc' } } }
        }) as DivisionWithPools
        // Ensure pools exist
        if (division1.pools.length === 0) {
          await ctx.prisma.pool.createMany({
            data: Array.from({ length: mergedDivision.poolCount }, (_, i) => ({
              divisionId: division1.id,
              name: mergedDivision.poolCount === 1 ? 'Pool 1' : `Pool ${i + 1}`,
              order: i + 1,
            }))
          })
          division1 = (await ctx.prisma.division.findUnique({
            where: { id: division1.id },
            include: { pools: { orderBy: { order: 'asc' } } }
          })) as DivisionWithPools
        }
      } else {
        // Create new division1
        division1 = await ctx.prisma.division.create({
          data: {
            tournamentId: mergedDivision.tournamentId,
            name: name1.trim(),
            teamKind: mergedDivision.teamKind,
            pairingMode: mergedDivision.pairingMode,
            maxTeams: mergedDivision.maxTeams ? Math.ceil(mergedDivision.maxTeams / 2) : null,
            poolCount: mergedDivision.poolCount,
            stage: 'RR_COMPLETE',
            isMerged: false,
            mergedFromDivisionIds: Prisma.JsonNull,
            constraints: mergedDivision.constraints ? {
              create: {
                minDupr: mergedDivision.constraints.minDupr,
                maxDupr: mergedDivision.constraints.maxDupr,
                minAge: mergedDivision.constraints.minAge,
                maxAge: mergedDivision.constraints.maxAge,
                genders: mergedDivision.constraints.genders,
              }
            } : undefined,
            pools: {
              create: Array.from({ length: mergedDivision.poolCount }, (_, i) => ({
                name: mergedDivision.poolCount === 1 ? 'Pool 1' : `Pool ${i + 1}`,
                order: i + 1,
              }))
            }
          },
          include: {
            pools: { orderBy: { order: 'asc' } }
          }
        }) as DivisionWithPools
      }

      if (existingDivision2) {
        // Restore existing division2
        division2 = await ctx.prisma.division.update({
          where: { id: existingDivision2.id },
          data: {
            stage: 'RR_COMPLETE',
            isMerged: false,
            mergedFromDivisionIds: Prisma.JsonNull,
          },
          include: { pools: { orderBy: { order: 'asc' } } }
        }) as DivisionWithPools
        // Ensure pools exist
        if (division2.pools.length === 0) {
          await ctx.prisma.pool.createMany({
            data: Array.from({ length: mergedDivision.poolCount }, (_, i) => ({
              divisionId: division2.id,
              name: mergedDivision.poolCount === 1 ? 'Pool 1' : `Pool ${i + 1}`,
              order: i + 1,
            }))
          })
          division2 = (await ctx.prisma.division.findUnique({
            where: { id: division2.id },
            include: { pools: { orderBy: { order: 'asc' } } }
          })) as DivisionWithPools
        }
      } else {
        // Create new division2
        division2 = await ctx.prisma.division.create({
          data: {
            tournamentId: mergedDivision.tournamentId,
            name: name2.trim(),
            teamKind: mergedDivision.teamKind,
            pairingMode: mergedDivision.pairingMode,
            maxTeams: mergedDivision.maxTeams ? Math.floor(mergedDivision.maxTeams / 2) : null,
            poolCount: mergedDivision.poolCount,
            stage: 'RR_COMPLETE',
            isMerged: false,
            mergedFromDivisionIds: Prisma.JsonNull,
            constraints: mergedDivision.constraints ? {
              create: {
                minDupr: mergedDivision.constraints.minDupr,
                maxDupr: mergedDivision.constraints.maxDupr,
                minAge: mergedDivision.constraints.minAge,
                maxAge: mergedDivision.constraints.maxAge,
                genders: mergedDivision.constraints.genders,
              }
            } : undefined,
            pools: {
              create: Array.from({ length: mergedDivision.poolCount }, (_, i) => ({
                name: mergedDivision.poolCount === 1 ? 'Pool 1' : `Pool ${i + 1}`,
                order: i + 1,
              }))
            }
          },
          include: {
            pools: { orderBy: { order: 'asc' } }
          }
        }) as DivisionWithPools
      }

      // Move teams back to original divisions
      const division1Pools = division1.pools.sort((a, b) => a.order - b.order)
      const division2Pools = division2.pools.sort((a, b) => a.order - b.order)
      const teamPoolAssignments = new Map<string, string | null>()
      const teamDivisionAssignments = new Map<string, string>()

      // Distribute teams1 to division1 pools
      for (let i = 0; i < teams1.length; i++) {
        const team = teams1[i]
        const targetPool = division1Pools[i % division1Pools.length]

        teamPoolAssignments.set(team.id, targetPool?.id ?? null)
        teamDivisionAssignments.set(team.id, division1.id)

        await ctx.prisma.team.update({
          where: { id: team.id },
          data: {
            divisionId: division1.id,
            poolId: targetPool.id,
            note: team.note, // Restore cleaned note
          }
        })

        // Copy standings if they exist
        const standing = team.standings.find(s => s.divisionId === mergedDivision.id)
        if (standing) {
          await ctx.prisma.standing.upsert({
            where: {
              divisionId_teamId: {
                divisionId: division1.id,
                teamId: team.id,
              }
            },
            create: {
              divisionId: division1.id,
              teamId: team.id,
              wins: standing.wins,
              losses: standing.losses,
              pointsFor: standing.pointsFor,
              pointsAgainst: standing.pointsAgainst,
              pointDiff: standing.pointDiff,
            },
            update: {
              wins: standing.wins,
              losses: standing.losses,
              pointsFor: standing.pointsFor,
              pointsAgainst: standing.pointsAgainst,
              pointDiff: standing.pointDiff,
            }
          })
        }
      }

      // Distribute teams2 to division2 pools
      for (let i = 0; i < teams2.length; i++) {
        const team = teams2[i]
        const targetPool = division2Pools[i % division2Pools.length]

        teamPoolAssignments.set(team.id, targetPool?.id ?? null)
        teamDivisionAssignments.set(team.id, division2.id)

        await ctx.prisma.team.update({
          where: { id: team.id },
          data: {
            divisionId: division2.id,
            poolId: targetPool.id,
            note: team.note, // Restore cleaned note
          }
        })

        // Copy standings if they exist
        const standing = team.standings.find(s => s.divisionId === mergedDivision.id)
        if (standing) {
          await ctx.prisma.standing.upsert({
            where: {
              divisionId_teamId: {
                divisionId: division2.id,
                teamId: team.id,
              }
            },
            create: {
              divisionId: division2.id,
              teamId: team.id,
              wins: standing.wins,
              losses: standing.losses,
              pointsFor: standing.pointsFor,
              pointsAgainst: standing.pointsAgainst,
              pointDiff: standing.pointDiff,
            },
            update: {
              wins: standing.wins,
              losses: standing.losses,
              pointsFor: standing.pointsFor,
              pointsAgainst: standing.pointsAgainst,
              pointDiff: standing.pointDiff,
            }
          })
        }
      }

      // Move Round Robin matches back to original divisions based on team composition
      // Matches where both teams belong to division1 go to division1
      // Matches where both teams belong to division2 go to division2
      // Matches with teams from both divisions should be split (but this shouldn't happen in RR)
      const rrMatches = mergedDivision.matches.filter(m => m.stage === 'ROUND_ROBIN')

      const getPoolAssignmentForDivision = (match: typeof rrMatches[number], divisionId: string) => {
        const teamAPool = teamPoolAssignments.get(match.teamAId)
        const teamBPool = teamPoolAssignments.get(match.teamBId)
        const teamsShareDivision =
          teamDivisionAssignments.get(match.teamAId) === divisionId &&
          teamDivisionAssignments.get(match.teamBId) === divisionId

        if (teamsShareDivision && teamAPool && teamAPool === teamBPool) {
          return teamAPool
        }

        return null
      }

      for (const match of rrMatches) {
        const teamADivisionId = teamDivisionAssignments.get(match.teamAId)
        const teamBDivisionId = teamDivisionAssignments.get(match.teamBId)

        const targetDivisionIds =
          teamADivisionId && teamBDivisionId && teamADivisionId === teamBDivisionId
            ? [teamADivisionId]
            : [division1.id, division2.id]

        for (const targetDivisionId of Array.from(new Set(targetDivisionIds))) {
          const clonedMatch = await ctx.prisma.match.create({
            data: {
              divisionId: targetDivisionId,
              teamAId: match.teamAId,
              teamBId: match.teamBId,
              roundIndex: match.roundIndex,
              stage: match.stage,
              note: match.note,
              poolId: getPoolAssignmentForDivision(match, targetDivisionId),
              bestOfMode: match.bestOfMode,
              gamesCount: match.gamesCount,
              targetPoints: match.targetPoints,
              winBy: match.winBy,
              winnerTeamId: match.winnerTeamId,
              locked: true,
            }
          })

          for (const game of match.games) {
            await ctx.prisma.game.create({
              data: {
                matchId: clonedMatch.id,
                index: game.index,
                scoreA: game.scoreA,
                scoreB: game.scoreB,
                winner: game.winner,
              }
            })
          }
        }
      }

      // Delete merged division (this will cascade delete any remaining matches if there are any)
      // But we've already moved all RR matches, so this should only delete the division itself
      await ctx.prisma.division.delete({
        where: { id: input.mergedDivisionId }
      })

      // Log the unmerge
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: mergedDivision.tournamentId,
          action: 'UNMERGE_DIVISIONS',
          entityType: 'Division',
          entityId: division1.id,
          payload: {
            mergedDivisionId: input.mergedDivisionId,
            unmergedTo: [division1.id, division2.id],
          },
        },
      })

      return {
        success: true,
        divisions: [division1, division2],
        message: `Successfully unmerged division back to ${division1.name} and ${division2.name}`,
      }
    }),
})
