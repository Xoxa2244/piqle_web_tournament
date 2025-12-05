import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '@/server/trpc'

export const teamPlayerRouter = createTRPCRouter({
  movePlayer: tdProcedure
    .input(z.object({
      teamPlayerId: z.string(),
      targetTeamId: z.string(),
      targetPlayerId: z.string().optional(), // Player ID being dragged onto
    }))
    .mutation(async ({ ctx, input }) => {
      // Get current team player and target team
      const teamPlayer = await ctx.prisma.teamPlayer.findUnique({
        where: { id: input.teamPlayerId },
        include: { 
          team: { 
            include: { 
              division: {
                include: {
                  tournament: {
                    select: { format: true }
                  }
                }
              },
              teamPlayers: {
                include: { player: true }
              }
            } 
          },
          player: true 
        },
      })

      const targetTeam = await ctx.prisma.team.findUnique({
        where: { id: input.targetTeamId },
        include: { 
          division: {
            include: {
              tournament: {
                select: { format: true }
              }
            }
          },
          teamPlayers: {
            include: { player: true }
          }
        },
      })

      if (!teamPlayer || !targetTeam) {
        throw new Error('Team player or target team not found')
      }

      // Check if teams are in the same division
      if (teamPlayer.team.divisionId !== targetTeam.divisionId) {
        throw new Error('Cannot move player between different divisions')
      }

      // Check target team capacity based on division team kind
      const maxPlayers = teamPlayer.team.division.teamKind === 'SINGLES_1v1' ? 1 :
                        teamPlayer.team.division.teamKind === 'DOUBLES_2v2' ? 2 :
                        teamPlayer.team.division.teamKind === 'SQUAD_4v4' ? 4 : 2

      // If target team is at capacity, do a player swap
      if (targetTeam.teamPlayers.length >= maxPlayers) {
        let playerToSwap: any = null
        
        // If we have a specific target player ID, find that player
        if (input.targetPlayerId) {
          playerToSwap = targetTeam.teamPlayers.find(tp => tp.id === input.targetPlayerId)
        }
        
        // If no specific target or target not found, use the last player
        if (!playerToSwap) {
          playerToSwap = targetTeam.teamPlayers[targetTeam.teamPlayers.length - 1]
        }
        
        if (playerToSwap) {
          // Get player data for logging
          const swapPlayer = await ctx.prisma.player.findUnique({
            where: { id: playerToSwap.playerId },
          })

          // Move the swap player from target team to source team
          await ctx.prisma.teamPlayer.update({
            where: { id: playerToSwap.id },
            data: { teamId: teamPlayer.teamId },
          })

          // Log the auto-move (swap)
          await ctx.prisma.auditLog.create({
            data: {
              actorUserId: ctx.session.user.id,
              tournamentId: teamPlayer.team.division.tournamentId,
              action: 'AUTO_MOVE',
              entityType: 'TeamPlayer',
              entityId: playerToSwap.id,
              payload: {
                playerName: swapPlayer ? `${swapPlayer.firstName} ${swapPlayer.lastName}` : 'Unknown Player',
                fromTeam: targetTeam.name,
                toTeam: teamPlayer.team.name,
                reason: 'Player swap - team at capacity',
              },
            },
          })
        }
      }

      // Validate MLP team composition before moving
      if (targetTeam.division.tournament.format === 'MLP') {
        // Check player gender
        if (!teamPlayer.player.gender || teamPlayer.player.gender === 'X') {
          throw new Error('Player must have gender (M or F) set for MLP tournaments')
        }

        // Check target team composition after move
        const futurePlayerCount = targetTeam.teamPlayers.length + 1 // +1 for the player being moved
        const futureFemaleCount = targetTeam.teamPlayers.filter(tp => tp.player.gender === 'F').length + 
                                   (teamPlayer.player.gender === 'F' ? 1 : 0)
        const futureMaleCount = targetTeam.teamPlayers.filter(tp => tp.player.gender === 'M').length + 
                                (teamPlayer.player.gender === 'M' ? 1 : 0)

        if (futurePlayerCount > 4) {
          throw new Error('MLP teams must have exactly 4 players')
        }

        if (futurePlayerCount === 4) {
          if (futureFemaleCount !== 2 || futureMaleCount !== 2) {
            throw new Error('MLP teams must have exactly 2 female (F) and 2 male (M) players')
          }
        }
      }

      // Move the player to target team
      const updatedTeamPlayer = await ctx.prisma.teamPlayer.update({
        where: { id: input.teamPlayerId },
        data: { teamId: input.targetTeamId },
        include: { player: true },
      })

      // Validate MLP team composition after move (for source team)
      if (teamPlayer.team.division.tournament.format === 'MLP') {
        const sourceTeamAfterMove = await ctx.prisma.team.findUnique({
          where: { id: teamPlayer.teamId },
          include: {
            teamPlayers: {
              include: { player: true },
              orderBy: { createdAt: 'asc' }
            }
          }
        })

        if (sourceTeamAfterMove && sourceTeamAfterMove.teamPlayers.length === 4) {
          const femaleCount = sourceTeamAfterMove.teamPlayers.filter(tp => tp.player.gender === 'F').length
          const maleCount = sourceTeamAfterMove.teamPlayers.filter(tp => tp.player.gender === 'M').length
          
          if (femaleCount !== 2 || maleCount !== 2) {
            // Rollback: move player back
            await ctx.prisma.teamPlayer.update({
              where: { id: input.teamPlayerId },
              data: { teamId: teamPlayer.teamId },
            })
            throw new Error('Moving this player would leave source team with invalid MLP composition (must be 2F + 2M)')
          }
        }
      }

      // Log the move
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: teamPlayer.team.division.tournamentId,
          action: 'MOVE',
          entityType: 'TeamPlayer',
          entityId: input.teamPlayerId,
          payload: {
            playerName: `${teamPlayer.player.firstName} ${teamPlayer.player.lastName}`,
            fromTeam: teamPlayer.team.name,
            toTeam: targetTeam.name,
          },
        },
      })

      return updatedTeamPlayer
    }),

  addPlayer: tdProcedure
    .input(z.object({
      teamId: z.string(),
      playerId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get team and player info
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        include: { 
          division: true,
          teamPlayers: true 
        },
      })

      const player = await ctx.prisma.player.findUnique({
        where: { id: input.playerId },
      })

      if (!team || !player) {
        throw new Error('Team or player not found')
      }

      // Check team capacity
      const maxPlayers = team.division.teamKind === 'SINGLES_1v1' ? 1 :
                        team.division.teamKind === 'DOUBLES_2v2' ? 2 :
                        team.division.teamKind === 'SQUAD_4v4' ? 4 : 2

      if (team.teamPlayers.length >= maxPlayers) {
        throw new Error(`Team is full. Maximum ${maxPlayers} players allowed.`)
      }

      // Check if player is already in this team
      const existingTeamPlayer = await ctx.prisma.teamPlayer.findFirst({
        where: {
          teamId: input.teamId,
          playerId: input.playerId,
        },
      })

      if (existingTeamPlayer) {
        throw new Error('Player is already in this team')
      }

      // Add player to team
      const teamPlayer = await ctx.prisma.teamPlayer.create({
        data: {
          teamId: input.teamId,
          playerId: input.playerId,
        },
        include: { player: true },
      })

      // Log the addition
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'CREATE',
          entityType: 'TeamPlayer',
          entityId: teamPlayer.id,
          payload: {
            playerName: `${player.firstName} ${player.lastName}`,
            teamName: team.name,
          },
        },
      })

      return teamPlayer
    }),

  removePlayer: tdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const teamPlayer = await ctx.prisma.teamPlayer.findUnique({
        where: { id: input.id },
        include: { 
          team: { include: { division: true } },
          player: true 
        },
      })

      if (!teamPlayer) {
        throw new Error('Team player not found')
      }

      // Remove player from team
      await ctx.prisma.teamPlayer.delete({
        where: { id: input.id },
      })

      // Log the removal
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: teamPlayer.team.division.tournamentId,
          action: 'DELETE',
          entityType: 'TeamPlayer',
          entityId: input.id,
          payload: {
            playerName: `${teamPlayer.player.firstName} ${teamPlayer.player.lastName}`,
            teamName: teamPlayer.team.name,
          },
        },
      })

      return { success: true }
    }),

  addPlayerToSlot: tdProcedure
    .input(z.object({
      teamId: z.string(),
      playerId: z.string(),
      slotIndex: z.number().min(0).max(3), // 0-3 for different team kinds
    }))
    .mutation(async ({ ctx, input }) => {
      // Get team and player info
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        include: { 
          division: {
            include: {
              tournament: {
                select: { format: true }
              }
            }
          },
          teamPlayers: {
            include: { player: true },
            orderBy: { createdAt: 'asc' } // Maintain slot order
          }
        },
      })

      const player = await ctx.prisma.player.findUnique({
        where: { id: input.playerId },
      })

      if (!team || !player) {
        throw new Error('Team or player not found')
      }

      // Check if player is already in this tournament
      const existingTeamPlayer = await ctx.prisma.teamPlayer.findFirst({
        where: {
          playerId: input.playerId,
          team: {
            division: {
              tournamentId: team.division.tournamentId
            }
          }
        },
        include: { team: { include: { division: true } } }
      })

      if (existingTeamPlayer) {
        throw new Error(`Player is already in team "${existingTeamPlayer.team.name}" in division "${existingTeamPlayer.team.division.name}"`)
      }

      // Check if player is on waitlist
      if (player.isWaitlist) {
        throw new Error('Cannot add waitlist player to team. Player must be active.')
      }

      // Check team capacity
      const maxPlayers = team.division.teamKind === 'SINGLES_1v1' ? 1 :
                        team.division.teamKind === 'DOUBLES_2v2' ? 2 :
                        team.division.teamKind === 'SQUAD_4v4' ? 4 : 2

      if (input.slotIndex >= maxPlayers) {
        throw new Error(`Invalid slot index. Maximum ${maxPlayers} slots allowed for ${team.division.teamKind}.`)
      }

      // Check if slot is already occupied
      if (team.teamPlayers[input.slotIndex]) {
        throw new Error(`Slot ${input.slotIndex + 1} is already occupied`)
      }

      // Validate player gender for MLP tournaments
      if (team.division.tournament.format === 'MLP') {
        if (!player.gender || player.gender === 'X') {
          throw new Error('Player must have gender (M or F) set for MLP tournaments')
        }
      }

      // Create team player
      const teamPlayer = await ctx.prisma.teamPlayer.create({
        data: {
          teamId: input.teamId,
          playerId: input.playerId,
        },
        include: { player: true },
      })

      // Validate MLP team composition after adding player
      if (team.division.tournament.format === 'MLP') {
        const updatedTeam = await ctx.prisma.team.findUnique({
          where: { id: input.teamId },
          include: {
            teamPlayers: {
              include: { player: true },
              orderBy: { createdAt: 'asc' }
            }
          }
        })

        if (updatedTeam) {
          const playerCount = updatedTeam.teamPlayers.length
          const femaleCount = updatedTeam.teamPlayers.filter(tp => tp.player.gender === 'F').length
          const maleCount = updatedTeam.teamPlayers.filter(tp => tp.player.gender === 'M').length

          if (playerCount > 4) {
            // Rollback: remove the player we just added
            await ctx.prisma.teamPlayer.delete({ where: { id: teamPlayer.id } })
            throw new Error('MLP teams must have exactly 4 players')
          }

          if (playerCount === 4) {
            // Validate final composition
            if (femaleCount !== 2 || maleCount !== 2) {
              // Rollback: remove the player we just added
              await ctx.prisma.teamPlayer.delete({ where: { id: teamPlayer.id } })
              throw new Error('MLP teams must have exactly 2 female (F) and 2 male (M) players')
            }
          }
        }
      }

      // Log the addition
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: team.division.tournamentId,
          action: 'ADD_TO_SLOT',
          entityType: 'TeamPlayer',
          entityId: teamPlayer.id,
          payload: {
            playerName: `${player.firstName} ${player.lastName}`,
            teamName: team.name,
            slotIndex: input.slotIndex,
          },
        },
      })

      return teamPlayer
    }),

  removePlayerFromSlot: tdProcedure
    .input(z.object({ 
      teamPlayerId: z.string(),
      slotIndex: z.number().min(0).max(3)
    }))
    .mutation(async ({ ctx, input }) => {
      const teamPlayer = await ctx.prisma.teamPlayer.findUnique({
        where: { id: input.teamPlayerId },
        include: { 
          team: { 
            include: { 
              division: {
                include: {
                  tournament: {
                    select: { format: true }
                  }
                }
              },
              teamPlayers: {
                include: { player: true },
                orderBy: { createdAt: 'asc' }
              }
            } 
          },
          player: true 
        },
      })

      if (!teamPlayer) {
        throw new Error('Team player not found')
      }

      // Verify slot index
      const playerIndex = teamPlayer.team.teamPlayers.findIndex(tp => tp.id === input.teamPlayerId)
      if (playerIndex !== input.slotIndex) {
        throw new Error('Player is not in the specified slot')
      }

      // For MLP tournaments, check if removing this player would leave team invalid
      if (teamPlayer.team.division.tournament.format === 'MLP') {
        const currentPlayerCount = teamPlayer.team.teamPlayers.length
        if (currentPlayerCount === 4) {
          // Team is currently valid, removing a player is allowed (team can be incomplete during setup)
          // But we should warn if team becomes invalid
          const remainingPlayers = teamPlayer.team.teamPlayers.filter(tp => tp.id !== input.teamPlayerId)
          const remainingFemaleCount = remainingPlayers.filter(tp => tp.player.gender === 'F').length
          const remainingMaleCount = remainingPlayers.filter(tp => tp.player.gender === 'M').length
          
          // Allow removal, but team will need to be completed later
        }
      }

      // Remove player from team
      await ctx.prisma.teamPlayer.delete({
        where: { id: input.teamPlayerId },
      })

      // Log the removal
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: teamPlayer.team.division.tournamentId,
          action: 'REMOVE_FROM_SLOT',
          entityType: 'TeamPlayer',
          entityId: input.teamPlayerId,
          payload: {
            playerName: `${teamPlayer.player.firstName} ${teamPlayer.player.lastName}`,
            teamName: teamPlayer.team.name,
            slotIndex: input.slotIndex,
          },
        },
      })

      return { success: true }
    }),

  movePlayerBetweenSlots: tdProcedure
    .input(z.object({
      fromTeamId: z.string(),
      toTeamId: z.string(),
      fromSlotIndex: z.number().min(0).max(3),
      toSlotIndex: z.number().min(0).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      console.log('[movePlayerBetweenSlots] Input:', input)
      
      // Get both teams
      const fromTeam = await ctx.prisma.team.findUnique({
        where: { id: input.fromTeamId },
        include: { 
          division: true,
          teamPlayers: {
            include: { player: true },
            orderBy: { createdAt: 'asc' }
          }
        },
      })

      const toTeam = await ctx.prisma.team.findUnique({
        where: { id: input.toTeamId },
        include: { 
          division: true,
          teamPlayers: {
            include: { player: true },
            orderBy: { createdAt: 'asc' }
          }
        },
      })

      if (!fromTeam || !toTeam) {
        throw new Error('Teams not found')
      }

      console.log('[movePlayerBetweenSlots] From team players:', fromTeam.teamPlayers.length)
      console.log('[movePlayerBetweenSlots] To team players:', toTeam.teamPlayers.length)

      // Check if they're in the same division
      if (fromTeam.divisionId !== toTeam.divisionId) {
        throw new Error('Cannot move players between different divisions')
      }

      // Get players at specified slots
      const fromTeamPlayer = fromTeam.teamPlayers[input.fromSlotIndex]
      const toTeamPlayer = input.toSlotIndex < toTeam.teamPlayers.length ? toTeam.teamPlayers[input.toSlotIndex] : null

      console.log('[movePlayerBetweenSlots] From player:', fromTeamPlayer?.player.firstName, fromTeamPlayer?.player.lastName)
      console.log('[movePlayerBetweenSlots] To player:', toTeamPlayer?.player.firstName, toTeamPlayer?.player.lastName)

      if (!fromTeamPlayer) {
        throw new Error('No player in source slot')
      }

      // Validate slot indices
      if (input.fromSlotIndex < 0 || input.fromSlotIndex >= fromTeam.teamPlayers.length) {
        throw new Error(`Invalid source slot index: ${input.fromSlotIndex}`)
      }
      
      // For target slot, allow index up to the maximum slot count (not current team size)
      const maxSlots = 4 // Maximum slots per team
      if (input.toSlotIndex < 0 || input.toSlotIndex >= maxSlots) {
        throw new Error(`Invalid target slot index: ${input.toSlotIndex}`)
      }

      // Same team - reorder within team
      if (input.fromTeamId === input.toTeamId) {
        if (toTeamPlayer) {
          // Swap within same team by swapping timestamps
          const fromCreatedAt = fromTeamPlayer.createdAt
          const toCreatedAt = toTeamPlayer.createdAt
          
          await ctx.prisma.teamPlayer.update({
            where: { id: fromTeamPlayer.id },
            data: { createdAt: toCreatedAt },
          })

          await ctx.prisma.teamPlayer.update({
            where: { id: toTeamPlayer.id },
            data: { createdAt: fromCreatedAt },
          })

          console.log('[movePlayerBetweenSlots] Swapped players within same team')

          // Log the swap
          await ctx.prisma.auditLog.create({
            data: {
              actorUserId: ctx.session.user.id,
              tournamentId: fromTeam.division.tournamentId,
              action: 'SWAP_PLAYERS',
              entityType: 'TeamPlayer',
              entityId: fromTeamPlayer.id,
              payload: {
                fromPlayerName: `${fromTeamPlayer.player.firstName} ${fromTeamPlayer.player.lastName}`,
                toPlayerName: `${toTeamPlayer.player.firstName} ${toTeamPlayer.player.lastName}`,
                team: fromTeam.name,
                fromSlotIndex: input.fromSlotIndex,
                toSlotIndex: input.toSlotIndex,
              },
            },
          })
        } else {
          // Move to empty slot within same team - no action needed
          console.log('[movePlayerBetweenSlots] Move to empty slot within same team - no action needed')
        }

        return { success: true }
      }

      // Different teams - swap or move
      if (toTeamPlayer) {
        // Swap between different teams
        await ctx.prisma.teamPlayer.update({
          where: { id: fromTeamPlayer.id },
          data: { teamId: toTeam.id },
        })

        await ctx.prisma.teamPlayer.update({
          where: { id: toTeamPlayer.id },
          data: { teamId: fromTeam.id },
        })

        console.log('[movePlayerBetweenSlots] Swapped players between different teams')

        // Log the swap
        await ctx.prisma.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: fromTeam.division.tournamentId,
            action: 'SWAP_PLAYERS',
            entityType: 'TeamPlayer',
            entityId: fromTeamPlayer.id,
            payload: {
              fromPlayerName: `${fromTeamPlayer.player.firstName} ${fromTeamPlayer.player.lastName}`,
              toPlayerName: `${toTeamPlayer.player.firstName} ${toTeamPlayer.player.lastName}`,
              fromTeam: fromTeam.name,
              toTeam: toTeam.name,
            },
          },
        })
      } else {
        // Move to empty slot in different team
        // Simply move the player and let the frontend handle positioning
        await ctx.prisma.teamPlayer.update({
          where: { id: fromTeamPlayer.id },
          data: { 
            teamId: toTeam.id,
            createdAt: new Date() // Use current timestamp for simple ordering
          },
        })

        console.log('[movePlayerBetweenSlots] Moved player to different team')

        // Log the move
        await ctx.prisma.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: fromTeam.division.tournamentId,
            action: 'MOVE_PLAYER',
            entityType: 'TeamPlayer',
            entityId: fromTeamPlayer.id,
            payload: {
              playerName: `${fromTeamPlayer.player.firstName} ${fromTeamPlayer.player.lastName}`,
              fromTeam: fromTeam.name,
              toTeam: toTeam.name,
            },
          },
        })
      }

      return { success: true }
    }),

  getAvailablePlayers: protectedProcedure
    .input(z.object({
      tournamentId: z.string(),
      divisionId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Get all active players in tournament who are not already assigned to teams
      const players = await ctx.prisma.player.findMany({
        where: {
          tournamentId: input.tournamentId,
          isWaitlist: false,
          teamPlayers: {
            none: {} // No team assignments
          }
        },
        orderBy: [
          { firstName: 'asc' },
          { lastName: 'asc' }
        ]
      })

      return players
    }),
})
