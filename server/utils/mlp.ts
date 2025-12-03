// MLP Tournament utilities

import { PrismaClient } from '@prisma/client'
import type { BracketMatch } from './bracket'

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
    // Not all games created yet
    return { winnerTeamId: null, needsTiebreaker: false }
  }

  // Check if all games are completed (have scores > 0)
  const allGamesCompleted = games.every(game => 
    (game.scoreA > 0 || game.scoreB > 0) && game.scoreA !== game.scoreB
  )

  if (!allGamesCompleted) {
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

/**
 * Build MLP bracket structure
 * MLP format: No play-in, only 4 teams in elimination (top-2 from each pool)
 * Semi-Final 1: Pool1-1 vs Pool2-2
 * Semi-Final 2: Pool1-2 vs Pool2-1
 * Final: Winner SF1 vs Winner SF2
 */
export function buildMLPBracket(
  poolStandings: Array<{
    poolId: string
    poolName: string
    top2: Array<{ teamId: string; teamName: string; seed: number }>
  }>,
  existingPlayoffMatches?: Array<{
    id: string
    roundIndex: number
    teamAId: string
    teamBId: string
    winnerTeamId?: string
    games?: Array<{ scoreA: number; scoreB: number }>
    note?: string
  }>
): BracketMatch[] {
  const allMatches: BracketMatch[] = []

  // Validate: need exactly 2 pools with top-2 teams each
  if (poolStandings.length !== 2) {
    console.error('[buildMLPBracket] MLP requires exactly 2 pools, got:', poolStandings.length)
    return []
  }

  const pool1 = poolStandings[0]
  const pool2 = poolStandings[1]

  if (pool1.top2.length < 2 || pool2.top2.length < 2) {
    console.error('[buildMLPBracket] Each pool must have at least 2 teams in top-2')
    return []
  }

  // Semi-Final 1: Pool1-1 vs Pool2-2
  const sf1TeamA = pool1.top2[0] // Pool1-1
  const sf1TeamB = pool2.top2[1] // Pool2-2

  // Semi-Final 2: Pool1-2 vs Pool2-1
  const sf2TeamA = pool1.top2[1] // Pool1-2
  const sf2TeamB = pool2.top2[0] // Pool2-1

  // Find existing semi-final matches from DB
  const existingSF1 = existingPlayoffMatches?.find(
    m => m.roundIndex === 1 && 
    ((m.teamAId === sf1TeamA.teamId && m.teamBId === sf1TeamB.teamId) ||
     (m.teamAId === sf1TeamB.teamId && m.teamBId === sf1TeamA.teamId))
  )
  const existingSF2 = existingPlayoffMatches?.find(
    m => m.roundIndex === 1 && 
    ((m.teamAId === sf2TeamA.teamId && m.teamBId === sf2TeamB.teamId) ||
     (m.teamAId === sf2TeamB.teamId && m.teamBId === sf2TeamA.teamId))
  )

  // Create Semi-Final 1
  const sf1Match: BracketMatch = {
    id: existingSF1?.id || 'sf1',
    round: 1,
    position: 0,
    left: {
      seed: sf1TeamA.seed,
      teamId: sf1TeamA.teamId,
      teamName: sf1TeamA.teamName,
      isBye: false,
    },
    right: {
      seed: sf1TeamB.seed,
      teamId: sf1TeamB.teamId,
      teamName: sf1TeamB.teamName,
      isBye: false,
    },
    status: existingSF1?.winnerTeamId ? 'finished' : 'scheduled',
    winnerTeamId: existingSF1?.winnerTeamId,
    winnerTeamName: existingSF1?.winnerTeamId 
      ? (existingSF1.teamAId === existingSF1.winnerTeamId 
          ? sf1TeamA.teamName 
          : sf1TeamB.teamName)
      : undefined,
    matchId: existingSF1?.id,
    games: existingSF1?.games,
  }

  // Create Semi-Final 2
  const sf2Match: BracketMatch = {
    id: existingSF2?.id || 'sf2',
    round: 1,
    position: 1,
    left: {
      seed: sf2TeamA.seed,
      teamId: sf2TeamA.teamId,
      teamName: sf2TeamA.teamName,
      isBye: false,
    },
    right: {
      seed: sf2TeamB.seed,
      teamId: sf2TeamB.teamId,
      teamName: sf2TeamB.teamName,
      isBye: false,
    },
    status: existingSF2?.winnerTeamId ? 'finished' : 'scheduled',
    winnerTeamId: existingSF2?.winnerTeamId,
    winnerTeamName: existingSF2?.winnerTeamId 
      ? (existingSF2.teamAId === existingSF2.winnerTeamId 
          ? sf2TeamA.teamName 
          : sf2TeamB.teamName)
      : undefined,
    matchId: existingSF2?.id,
    games: existingSF2?.games,
  }

  allMatches.push(sf1Match, sf2Match)

  // Link semi-finals to final
  sf1Match.nextMatchId = 'final'
  sf1Match.nextSlot = 'left'
  sf2Match.nextMatchId = 'final'
  sf2Match.nextSlot = 'right'

  // Create Final: Winner SF1 vs Winner SF2
  const finalTeamA = sf1Match.winnerTeamId 
    ? (sf1Match.winnerTeamId === sf1TeamA.teamId ? sf1TeamA : sf1TeamB)
    : null
  const finalTeamB = sf2Match.winnerTeamId 
    ? (sf2Match.winnerTeamId === sf2TeamA.teamId ? sf2TeamA : sf2TeamB)
    : null

  const existingFinal = existingPlayoffMatches?.find(
    m => m.roundIndex === 2
  )

  const finalMatch: BracketMatch = {
    id: existingFinal?.id || 'final',
    round: 2,
    position: 0,
    left: {
      seed: finalTeamA?.seed || 0,
      teamId: finalTeamA?.teamId,
      teamName: finalTeamA?.teamName,
      isBye: !finalTeamA,
    },
    right: {
      seed: finalTeamB?.seed || 0,
      teamId: finalTeamB?.teamId,
      teamName: finalTeamB?.teamName,
      isBye: !finalTeamB,
    },
    status: existingFinal?.winnerTeamId ? 'finished' : (finalTeamA && finalTeamB ? 'scheduled' : 'scheduled'),
    winnerTeamId: existingFinal?.winnerTeamId,
    winnerTeamName: existingFinal?.winnerTeamId && finalTeamA && finalTeamB
      ? (existingFinal.teamAId === existingFinal.winnerTeamId 
          ? finalTeamA.teamName 
          : finalTeamB.teamName)
      : undefined,
    matchId: existingFinal?.id,
    games: existingFinal?.games,
  }

  allMatches.push(finalMatch)

  return allMatches
}

