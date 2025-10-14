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
              division: true,
              teamPlayers: true 
            } 
          },
          player: true 
        },
      })

      const targetTeam = await ctx.prisma.team.findUnique({
        where: { id: input.targetTeamId },
        include: { 
          division: true,
          teamPlayers: true 
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

      // Move the player to target team
      const updatedTeamPlayer = await ctx.prisma.teamPlayer.update({
        where: { id: input.teamPlayerId },
        data: { teamId: input.targetTeamId },
        include: { player: true },
      })

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
          division: true,
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

      // Create team player
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
              division: true,
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
      fromTeamPlayerId: z.string(),
      toTeamPlayerId: z.string(),
      fromSlotIndex: z.number().min(0).max(3),
      toSlotIndex: z.number().min(0).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get both team players
      const fromTeamPlayer = await ctx.prisma.teamPlayer.findUnique({
        where: { id: input.fromTeamPlayerId },
        include: { 
          team: { 
            include: { 
              division: true,
              teamPlayers: {
                include: { player: true },
                orderBy: { createdAt: 'asc' }
              }
            } 
          },
          player: true 
        },
      })

      const toTeamPlayer = await ctx.prisma.teamPlayer.findUnique({
        where: { id: input.toTeamPlayerId },
        include: { 
          team: { 
            include: { 
              division: true,
              teamPlayers: {
                include: { player: true },
                orderBy: { createdAt: 'asc' }
              }
            } 
          },
          player: true 
        },
      })

      if (!fromTeamPlayer || !toTeamPlayer) {
        throw new Error('Team players not found')
      }

      // Check if they're in the same division
      if (fromTeamPlayer.team.divisionId !== toTeamPlayer.team.divisionId) {
        throw new Error('Cannot move players between different divisions')
      }

      // Verify slot indices
      const fromPlayerIndex = fromTeamPlayer.team.teamPlayers.findIndex(tp => tp.id === input.fromTeamPlayerId)
      const toPlayerIndex = toTeamPlayer.team.teamPlayers.findIndex(tp => tp.id === input.toTeamPlayerId)
      
      if (fromPlayerIndex !== input.fromSlotIndex || toPlayerIndex !== input.toSlotIndex) {
        throw new Error('Players are not in the specified slots')
      }

      // Swap players between teams
      await ctx.prisma.teamPlayer.update({
        where: { id: input.fromTeamPlayerId },
        data: { teamId: toTeamPlayer.teamId },
      })

      await ctx.prisma.teamPlayer.update({
        where: { id: input.toTeamPlayerId },
        data: { teamId: fromTeamPlayer.teamId },
      })

      // Log the swap
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: fromTeamPlayer.team.division.tournamentId,
          action: 'SWAP_PLAYERS',
          entityType: 'TeamPlayer',
          entityId: input.fromTeamPlayerId,
          payload: {
            fromPlayerName: `${fromTeamPlayer.player.firstName} ${fromTeamPlayer.player.lastName}`,
            toPlayerName: `${toTeamPlayer.player.firstName} ${toTeamPlayer.player.lastName}`,
            fromTeam: fromTeamPlayer.team.name,
            toTeam: toTeamPlayer.team.name,
            fromSlotIndex: input.fromSlotIndex,
            toSlotIndex: input.toSlotIndex,
          },
        },
      })

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
