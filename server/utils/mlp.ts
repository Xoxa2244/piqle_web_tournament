// MLP Tournament utilities

import { PrismaClient } from '@prisma/client'

export interface MLPTeamPlayers {
  females: Array<{ id: string; firstName: string; lastName: string }>
  males: Array<{ id: string; firstName: string; lastName: string }>
}

/**
 * Get players from a team organized by gender for MLP matches
 */
export async function getMLPTeamPlayers(
  prisma: PrismaClient,
  teamId: string
): Promise<MLPTeamPlayers> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      teamPlayers: {
        include: {
          player: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              gender: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!team) {
    throw new Error('Team not found')
  }

  const females: Array<{ id: string; firstName: string; lastName: string }> = []
  const males: Array<{ id: string; firstName: string; lastName: string }> = []

  for (const tp of team.teamPlayers) {
    if (tp.player.gender === 'F') {
      females.push({
        id: tp.player.id,
        firstName: tp.player.firstName,
        lastName: tp.player.lastName,
      })
    } else if (tp.player.gender === 'M') {
      males.push({
        id: tp.player.id,
        firstName: tp.player.firstName,
        lastName: tp.player.lastName,
      })
    }
  }

  return { females, males }
}

/**
 * Create 4 games for an MLP match with auto-assigned players
 * Game 1: Women (both females from each team)
 * Game 2: Men (both males from each team)
 * Game 3: Mixed #1 (Male1 + Female1 from each team)
 * Game 4: Mixed #2 (Male2 + Female2 from each team)
 */
export async function createMLPGames(
  prisma: PrismaClient,
  matchId: string,
  teamAId: string,
  teamBId: string
): Promise<void> {
  const teamAPlayers = await getMLPTeamPlayers(prisma, teamAId)
  const teamBPlayers = await getMLPTeamPlayers(prisma, teamBId)

  // Validate teams have correct composition
  if (teamAPlayers.females.length !== 2 || teamAPlayers.males.length !== 2) {
    throw new Error(`Team A must have exactly 2 females and 2 males for MLP match`)
  }
  if (teamBPlayers.females.length !== 2 || teamBPlayers.males.length !== 2) {
    throw new Error(`Team B must have exactly 2 females and 2 males for MLP match`)
  }

  // Create 4 games
  const games = [
    {
      matchId,
      index: 0,
      gameType: 'WOMEN' as const,
      scoreA: 0,
      scoreB: 0,
    },
    {
      matchId,
      index: 1,
      gameType: 'MEN' as const,
      scoreA: 0,
      scoreB: 0,
    },
    {
      matchId,
      index: 2,
      gameType: 'MIXED_1' as const,
      scoreA: 0,
      scoreB: 0,
    },
    {
      matchId,
      index: 3,
      gameType: 'MIXED_2' as const,
      scoreA: 0,
      scoreB: 0,
    },
  ]

  await prisma.game.createMany({
    data: games,
  })
}

/**
 * Calculate match winner from MLP games
 * Returns: { winnerTeamId: string | null, needsTiebreaker: boolean }
 * - If 3:1 or 4:0 → winner determined
 * - If 2:2 → needs tiebreaker
 */
export function calculateMLPMatchWinner(
  games: Array<{ scoreA: number; scoreB: number; winner: 'A' | 'B' | null }>,
  teamAId: string,
  teamBId: string
): { winnerTeamId: string | null; needsTiebreaker: boolean } {
  if (games.length !== 4) {
    // Not all games completed yet
    return { winnerTeamId: null, needsTiebreaker: false }
  }

  // Count games won by each team
  let teamAWins = 0
  let teamBWins = 0

  for (const game of games) {
    if (game.winner === 'A') {
      teamAWins++
    } else if (game.winner === 'B') {
      teamBWins++
    } else {
      // Game not completed or tied - calculate from scores
      if (game.scoreA > game.scoreB) {
        teamAWins++
      } else if (game.scoreB > game.scoreA) {
        teamBWins++
      }
    }
  }

  // Determine winner
  if (teamAWins >= 3) {
    return { winnerTeamId: teamAId, needsTiebreaker: false }
  } else if (teamBWins >= 3) {
    return { winnerTeamId: teamBId, needsTiebreaker: false }
  } else if (teamAWins === 2 && teamBWins === 2) {
    // 2:2 - needs tiebreaker
    return { winnerTeamId: null, needsTiebreaker: true }
  }

  // Not all games completed or invalid state
  return { winnerTeamId: null, needsTiebreaker: false }
}

