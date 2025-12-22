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

  // Create 4 games with null scores (empty until score is entered)
  // Use Prisma.JsonNull for explicit null handling
  const games = [
    {
      matchId,
      index: 0,
      gameType: 'WOMEN' as const,
      scoreA: null as any,
      scoreB: null as any,
    },
    {
      matchId,
      index: 1,
      gameType: 'MEN' as const,
      scoreA: null as any,
      scoreB: null as any,
    },
    {
      matchId,
      index: 2,
      gameType: 'MIXED_1' as const,
      scoreA: null as any,
      scoreB: null as any,
    },
    {
      matchId,
      index: 3,
      gameType: 'MIXED_2' as const,
      scoreA: null as any,
      scoreB: null as any,
    },
  ]

  // Use create instead of createMany to handle null values properly
  await Promise.all(
    games.map(game =>
      prisma.game.create({
        data: game,
      })
    )
  )
}

/**
 * Calculate match winner from MLP games
 * Returns: { winnerTeamId: string | null, needsTiebreaker: boolean }
 * - If 3:1 or 4:0 → winner determined
 * - If 2:2 → needs tiebreaker
 */
export function calculateMLPMatchWinner(
  games: Array<{ scoreA: number | null; scoreB: number | null; winner: 'A' | 'B' | null }>,
  teamAId: string,
  teamBId: string
): { winnerTeamId: string | null; needsTiebreaker: boolean } {
  if (games.length !== 4) {
    // Not all games created yet
    return { winnerTeamId: null, needsTiebreaker: false }
  }

  // Check if all games are completed (have non-null scores and not tied)
  const allGamesCompleted = games.every(game => 
    game.scoreA !== null && 
    game.scoreB !== null && 
    game.scoreA !== game.scoreB &&
    game.scoreA >= 0 &&
    game.scoreB >= 0
  )

  if (!allGamesCompleted) {
    // Not all games completed yet - some scores are still null or empty
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
      // Calculate from scores (we know they're not null from check above)
      if (game.scoreA !== null && game.scoreB !== null) {
        if (game.scoreA > game.scoreB) {
          teamAWins++
        } else if (game.scoreB > game.scoreA) {
          teamBWins++
        }
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
 * Supports 1 or 2 pools:
 * - 1 pool: Top 4 teams (#1 vs #4, #2 vs #3)
 * - 2 pools: Top 2 from each pool (A1 vs B2, B1 vs A2)
 * Includes optional 3rd place match
 */
export function buildMLPBracket(
  poolStandings: Array<{
    poolId: string
    poolName: string
    top2?: Array<{ teamId: string; teamName: string; seed: number }>
    top4?: Array<{ teamId: string; teamName: string; seed: number }>
  }>,
  existingPlayoffMatches?: Array<{
    id: string
    roundIndex: number
    teamAId: string
    teamBId: string
    winnerTeamId?: string
    games?: Array<{ scoreA: number; scoreB: number }>
    note?: string
  }>,
  includeThirdPlace: boolean = true
): BracketMatch[] {
  const allMatches: BracketMatch[] = []

  // Case 1: Single pool - top 4 teams
  if (poolStandings.length === 1) {
    const pool = poolStandings[0]
    const top4 = pool.top4 || []
    
    if (top4.length < 4) {
      console.error('[buildMLPBracket] Single pool requires at least 4 teams in top-4, got:', top4.length)
      return []
    }

    // SF1: #1 vs #4
    const sf1TeamA = top4[0] // #1
    const sf1TeamB = top4[3] // #4

    // SF2: #2 vs #3
    const sf2TeamA = top4[1] // #2
    const sf2TeamB = top4[2] // #3

    // Find existing semi-final matches
    const existingSF1 = existingPlayoffMatches?.find(
      m => m.roundIndex === 1 && 
      ((m.teamAId === sf1TeamA.teamId && m.teamBId === sf1TeamB.teamId) ||
       (m.teamAId === sf1TeamB.teamId && m.teamBId === sf1TeamA.teamId)) &&
      m.note !== 'Third Place Match'
    )
    const existingSF2 = existingPlayoffMatches?.find(
      m => m.roundIndex === 1 && 
      ((m.teamAId === sf2TeamA.teamId && m.teamBId === sf2TeamB.teamId) ||
       (m.teamAId === sf2TeamB.teamId && m.teamBId === sf2TeamA.teamId)) &&
      m.note !== 'Third Place Match'
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
      m => m.roundIndex === 2 && m.note !== 'Third Place Match'
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

    // Create 3rd Place Match: Losers of SF1 and SF2
    if (includeThirdPlace) {
      const thirdPlaceTeamA = sf1Match.winnerTeamId 
        ? (sf1Match.winnerTeamId === sf1TeamA.teamId ? sf1TeamB : sf1TeamA)
        : null
      const thirdPlaceTeamB = sf2Match.winnerTeamId 
        ? (sf2Match.winnerTeamId === sf2TeamA.teamId ? sf2TeamB : sf2TeamA)
        : null

      const existingThirdPlace = existingPlayoffMatches?.find(
        m => m.roundIndex === 2 && m.note === 'Third Place Match'
      )

      if (thirdPlaceTeamA && thirdPlaceTeamB) {
        const thirdPlaceMatch: BracketMatch = {
          id: existingThirdPlace?.id || 'third-place',
          round: 2,
          position: 1,
          left: {
            seed: thirdPlaceTeamA.seed,
            teamId: thirdPlaceTeamA.teamId,
            teamName: thirdPlaceTeamA.teamName,
            isBye: false,
          },
          right: {
            seed: thirdPlaceTeamB.seed,
            teamId: thirdPlaceTeamB.teamId,
            teamName: thirdPlaceTeamB.teamName,
            isBye: false,
          },
          status: existingThirdPlace?.winnerTeamId ? 'finished' : 'scheduled',
          winnerTeamId: existingThirdPlace?.winnerTeamId,
          winnerTeamName: existingThirdPlace?.winnerTeamId
            ? (existingThirdPlace.teamAId === existingThirdPlace.winnerTeamId 
                ? thirdPlaceTeamA.teamName 
                : thirdPlaceTeamB.teamName)
            : undefined,
          matchId: existingThirdPlace?.id,
          games: existingThirdPlace?.games,
        }
        allMatches.push(thirdPlaceMatch)
      }
    }

    return allMatches
  }

  // Case 2: Two pools - top 2 from each pool
  if (poolStandings.length === 2) {
    const pool1 = poolStandings[0]
    const pool2 = poolStandings[1]
    const top2Pool1 = pool1.top2 || []
    const top2Pool2 = pool2.top2 || []

    if (top2Pool1.length < 2 || top2Pool2.length < 2) {
      console.error('[buildMLPBracket] Each pool must have at least 2 teams in top-2')
      return []
    }

    // SF1: A1 vs B2
    const sf1TeamA = top2Pool1[0] // A1
    const sf1TeamB = top2Pool2[1] // B2

    // SF2: B1 vs A2
    const sf2TeamA = top2Pool2[0] // B1
    const sf2TeamB = top2Pool1[1] // A2

    // Find existing semi-final matches
    const existingSF1 = existingPlayoffMatches?.find(
      m => m.roundIndex === 1 && 
      ((m.teamAId === sf1TeamA.teamId && m.teamBId === sf1TeamB.teamId) ||
       (m.teamAId === sf1TeamB.teamId && m.teamBId === sf1TeamA.teamId)) &&
      m.note !== 'Third Place Match'
    )
    const existingSF2 = existingPlayoffMatches?.find(
      m => m.roundIndex === 1 && 
      ((m.teamAId === sf2TeamA.teamId && m.teamBId === sf2TeamB.teamId) ||
       (m.teamAId === sf2TeamB.teamId && m.teamBId === sf2TeamA.teamId)) &&
      m.note !== 'Third Place Match'
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
      m => m.roundIndex === 2 && m.note !== 'Third Place Match'
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

    // Create 3rd Place Match: Losers of SF1 and SF2
    if (includeThirdPlace) {
      const thirdPlaceTeamA = sf1Match.winnerTeamId 
        ? (sf1Match.winnerTeamId === sf1TeamA.teamId ? sf1TeamB : sf1TeamA)
        : null
      const thirdPlaceTeamB = sf2Match.winnerTeamId 
        ? (sf2Match.winnerTeamId === sf2TeamA.teamId ? sf2TeamB : sf2TeamA)
        : null

      const existingThirdPlace = existingPlayoffMatches?.find(
        m => m.roundIndex === 2 && m.note === 'Third Place Match'
      )

      if (thirdPlaceTeamA && thirdPlaceTeamB) {
        const thirdPlaceMatch: BracketMatch = {
          id: existingThirdPlace?.id || 'third-place',
          round: 2,
          position: 1,
          left: {
            seed: thirdPlaceTeamA.seed,
            teamId: thirdPlaceTeamA.teamId,
            teamName: thirdPlaceTeamA.teamName,
            isBye: false,
          },
          right: {
            seed: thirdPlaceTeamB.seed,
            teamId: thirdPlaceTeamB.teamId,
            teamName: thirdPlaceTeamB.teamName,
            isBye: false,
          },
          status: existingThirdPlace?.winnerTeamId ? 'finished' : 'scheduled',
          winnerTeamId: existingThirdPlace?.winnerTeamId,
          winnerTeamName: existingThirdPlace?.winnerTeamId
            ? (existingThirdPlace.teamAId === existingThirdPlace.winnerTeamId 
                ? thirdPlaceTeamA.teamName 
                : thirdPlaceTeamB.teamName)
            : undefined,
          matchId: existingThirdPlace?.id,
          games: existingThirdPlace?.games,
        }
        allMatches.push(thirdPlaceMatch)
      }
    }

    return allMatches
  }

  // Invalid case
  console.error('[buildMLPBracket] Invalid pool count (must be 1 or 2):', poolStandings.length)
  return []
}

/**
 * Generate MLP Play-Off matches for database creation
 * Returns array of match data objects ready for Prisma create
 */
export function generateMLPPlayoffMatches(
  poolStandings: Array<{
    poolId: string
    poolName: string
    top2?: Array<{ teamId: string; teamName: string; seed: number }>
    top4?: Array<{ teamId: string; teamName: string; seed: number }>
  }>,
  includeThirdPlace: boolean = true
): Array<{
  teamAId: string
  teamBId: string
  roundIndex: number
  stage: 'ELIMINATION'
  note?: string
}> {
  const matches: Array<{
    teamAId: string
    teamBId: string
    roundIndex: number
    stage: 'ELIMINATION'
    note?: string
  }> = []

  // Case 1: Single pool - top 4 teams
  if (poolStandings.length === 1) {
    const pool = poolStandings[0]
    const top4 = pool.top4 || []
    
    if (top4.length < 4) {
      console.error('[generateMLPPlayoffMatches] Single pool requires at least 4 teams in top-4, got:', top4.length)
      return []
    }

    // SF1: #1 vs #4
    matches.push({
      teamAId: top4[0].teamId, // #1
      teamBId: top4[3].teamId, // #4
      roundIndex: 1,
      stage: 'ELIMINATION',
    })

    // SF2: #2 vs #3
    matches.push({
      teamAId: top4[1].teamId, // #2
      teamBId: top4[2].teamId, // #3
      roundIndex: 1,
      stage: 'ELIMINATION',
    })

    // Final and 3rd place will be generated after semi-finals complete
    // They are not created here because we don't know winners yet
  }
  // Case 2: Two pools - top 2 from each pool
  else if (poolStandings.length === 2) {
    const pool1 = poolStandings[0]
    const pool2 = poolStandings[1]
    const top2Pool1 = pool1.top2 || []
    const top2Pool2 = pool2.top2 || []

    if (top2Pool1.length < 2 || top2Pool2.length < 2) {
      console.error('[generateMLPPlayoffMatches] Each pool must have at least 2 teams in top-2')
      return []
    }

    // SF1: A1 vs B2
    matches.push({
      teamAId: top2Pool1[0].teamId, // A1
      teamBId: top2Pool2[1].teamId, // B2
      roundIndex: 1,
      stage: 'ELIMINATION',
    })

    // SF2: B1 vs A2
    matches.push({
      teamAId: top2Pool2[0].teamId, // B1
      teamBId: top2Pool1[1].teamId, // A2
      roundIndex: 1,
      stage: 'ELIMINATION',
    })

    // Final and 3rd place will be generated after semi-finals complete
  } else {
    console.error('[generateMLPPlayoffMatches] Invalid pool count (must be 1 or 2):', poolStandings.length)
    return []
  }

  return matches
}

