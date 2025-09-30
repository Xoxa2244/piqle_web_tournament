import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '@/server/trpc'

export const teamPlayerRouter = createTRPCRouter({
  movePlayer: tdProcedure
    .input(z.object({
      teamPlayerId: z.string(),
      targetTeamId: z.string(),
      targetPlayerId: z.string().optional(), // ID игрока, на которого перетаскивают
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
})
