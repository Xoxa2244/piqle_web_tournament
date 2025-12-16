import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getMLPTeamPlayers } from '@/server/utils/mlp'

interface DuprMatchSubmission {
  matchId: string
  teamAName: string
  teamBName: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'PROCESSING'
  error?: string | null
  duprMatchId?: string | null
}

interface DuprMatchData {
  location: string
  matchDate: string
  teamA: {
    player1: string
    player2?: string
    game1: number
    game2: number
    game3: number
    game4: number
    game5: number
  }
  teamB: {
    player1: string
    player2?: string
    game1: number
    game2: number
    game3: number
    game4: number
    game5: number
  }
  format: 'SINGLES' | 'DOUBLES'
  event: string
  bracket: string
  matchType: 'SIDEOUT'
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tournamentId } = await req.json()
    if (!tournamentId) {
      return NextResponse.json({ error: 'Tournament ID is required' }, { status: 400 })
    }

    // Get tournament with divisions and matches
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        divisions: {
          include: {
            matches: {
              where: {
                // Only get matches that should be submitted and haven't been successfully submitted yet
                sendToDupr: true,
                tiebreaker: null,
                OR: [
                  { duprSubmissionStatus: null },
                  { duprSubmissionStatus: 'PENDING' },
                  { duprSubmissionStatus: 'FAILED' },
                ],
              },
              include: {
                teamA: {
                  include: {
                    teamPlayers: {
                      include: {
                        player: {
                          select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            dupr: true,
                            gender: true,
                          },
                        },
                      },
                      orderBy: { createdAt: 'asc' },
                    },
                  },
                },
                teamB: {
                  include: {
                    teamPlayers: {
                      include: {
                        player: {
                          select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            dupr: true,
                            gender: true,
                          },
                        },
                      },
                      orderBy: { createdAt: 'asc' },
                    },
                  },
                },
                games: {
                  orderBy: { index: 'asc' },
                },
                tiebreaker: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            duprAccessToken: true,
          },
        },
      },
    })

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    if (!tournament.allowDuprSubmission) {
      return NextResponse.json({ error: 'DUPR submission is not enabled for this tournament' }, { status: 400 })
    }

    // Check if user has access to this tournament
    const isOwner = tournament.userId === session.user.id
    const hasAccess = await prisma.tournamentAccess.findFirst({
      where: {
        tournamentId,
        userId: session.user.id,
        accessLevel: { in: ['ADMIN', 'SCORE_ONLY'] },
      },
    })

    if (!isOwner && !hasAccess) {
      return NextResponse.json({ error: 'No access to this tournament' }, { status: 403 })
    }

    // Get DUPR access token (use tournament owner's token)
    const owner = await prisma.user.findUnique({
      where: { id: tournament.userId },
      select: {
        duprAccessToken: true,
      },
    })

    if (!owner?.duprAccessToken) {
      return NextResponse.json({ 
        error: 'Tournament owner does not have DUPR account linked. Please link DUPR account first.' 
      }, { status: 400 })
    }

    const duprAccessToken = owner.duprAccessToken

    // Prepare matches for DUPR submission
    const duprMatches: DuprMatchData[] = []
    const matchMapping: Map<string, { matchId: string; gameIndex?: number; division: any }> = new Map()
    const submissionLog: DuprMatchSubmission[] = []

    const isMLP = tournament.format === 'MLP'
    const location = tournament.venueName || tournament.venueAddress || 'Unknown Location'
    const matchDate = tournament.startDate.toISOString().split('T')[0] // yyyy-MM-dd format
    const eventName = tournament.title
    const matchType = 'SIDEOUT' as const

    for (const division of tournament.divisions) {
      for (const match of division.matches) {
        // Skip matches without games or with no scores
        if (!match.games || match.games.length === 0) continue

        // Check if match has scores
        const hasScores = match.games.some((g: any) => 
          (g.scoreA !== null && g.scoreA !== undefined) || 
          (g.scoreB !== null && g.scoreB !== undefined)
        )

        if (!hasScores) continue

        // Get players with DUPR IDs
        const teamAPlayers = match.teamA?.teamPlayers || []
        const teamBPlayers = match.teamB?.teamPlayers || []
        const allPlayers = [...teamAPlayers, ...teamBPlayers]

        // Check if all players have DUPR IDs
        const playersWithoutDupr = allPlayers.filter((tp: any) => !tp.player.dupr)
        if (playersWithoutDupr.length > 0) {
          // Log as failed and continue
          const teamAName = teamAPlayers
            .map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
            .join(' / ') || 'Team A'
          const teamBName = teamBPlayers
            .map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
            .join(' / ') || 'Team B'
          
          const logEntry: DuprMatchSubmission = {
            matchId: match.id,
            teamAName,
            teamBName,
            status: 'FAILED',
            error: `Missing DUPR ID for players: ${playersWithoutDupr.map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`).join(', ')}`,
          }
          
          submissionLog.push(logEntry)
          
          // Update match status in DB
          await prisma.match.update({
            where: { id: match.id },
            data: {
              duprSubmissionStatus: 'FAILED',
              duprSubmissionError: logEntry.error,
            },
          })
          
          continue
        }

        if (isMLP && match.games.length === 4) {
          // MLP: Each game is a separate match in DUPR
          // Game 0: WOMEN, Game 1: MEN, Game 2: MIXED_1, Game 3: MIXED_2
          const gameTypes = ['WOMEN', 'MEN', 'MIXED_1', 'MIXED_2'] as const
          
          for (let gameIndex = 0; gameIndex < 4; gameIndex++) {
            const game = match.games[gameIndex]
            if (!game || (game.scoreA === null && game.scoreB === null)) continue

            // Get players for this specific game type
            let teamAPlayer1: string | null = null
            let teamAPlayer2: string | null = null
            let teamBPlayer1: string | null = null
            let teamBPlayer2: string | null = null

            if (gameTypes[gameIndex] === 'WOMEN') {
              // Both females from each team
              const teamAFemales = teamAPlayers.filter((tp: any) => tp.player.gender === 'F').map((tp: any) => tp.player.dupr)
              const teamBFemales = teamBPlayers.filter((tp: any) => tp.player.gender === 'F').map((tp: any) => tp.player.dupr)
              teamAPlayer1 = teamAFemales[0] || null
              teamAPlayer2 = teamAFemales[1] || null
              teamBPlayer1 = teamBFemales[0] || null
              teamBPlayer2 = teamBFemales[1] || null
            } else if (gameTypes[gameIndex] === 'MEN') {
              // Both males from each team
              const teamAMales = teamAPlayers.filter((tp: any) => tp.player.gender === 'M').map((tp: any) => tp.player.dupr)
              const teamBMales = teamBPlayers.filter((tp: any) => tp.player.gender === 'M').map((tp: any) => tp.player.dupr)
              teamAPlayer1 = teamAMales[0] || null
              teamAPlayer2 = teamAMales[1] || null
              teamBPlayer1 = teamBMales[0] || null
              teamBPlayer2 = teamBMales[1] || null
            } else if (gameTypes[gameIndex] === 'MIXED_1') {
              // Male1 + Female1 from each team
              const teamAMales = teamAPlayers.filter((tp: any) => tp.player.gender === 'M').map((tp: any) => tp.player.dupr)
              const teamAFemales = teamAPlayers.filter((tp: any) => tp.player.gender === 'F').map((tp: any) => tp.player.dupr)
              const teamBMales = teamBPlayers.filter((tp: any) => tp.player.gender === 'M').map((tp: any) => tp.player.dupr)
              const teamBFemales = teamBPlayers.filter((tp: any) => tp.player.gender === 'F').map((tp: any) => tp.player.dupr)
              teamAPlayer1 = teamAMales[0] || null
              teamAPlayer2 = teamAFemales[0] || null
              teamBPlayer1 = teamBMales[0] || null
              teamBPlayer2 = teamBFemales[0] || null
            } else if (gameTypes[gameIndex] === 'MIXED_2') {
              // Male2 + Female2 from each team
              const teamAMales = teamAPlayers.filter((tp: any) => tp.player.gender === 'M').map((tp: any) => tp.player.dupr)
              const teamAFemales = teamAPlayers.filter((tp: any) => tp.player.gender === 'F').map((tp: any) => tp.player.dupr)
              const teamBMales = teamBPlayers.filter((tp: any) => tp.player.gender === 'M').map((tp: any) => tp.player.dupr)
              const teamBFemales = teamBPlayers.filter((tp: any) => tp.player.gender === 'F').map((tp: any) => tp.player.dupr)
              teamAPlayer1 = teamAMales[1] || null
              teamAPlayer2 = teamAFemales[1] || null
              teamBPlayer1 = teamBMales[1] || null
              teamBPlayer2 = teamBFemales[1] || null
            }

            if (!teamAPlayer1 || !teamBPlayer1 || (gameTypes[gameIndex] !== 'WOMEN' && gameTypes[gameIndex] !== 'MEN' && (!teamAPlayer2 || !teamBPlayer2))) {
              continue // Skip if players are missing
            }

            // For MLP, each game is a single game match (best of 1)
            // game1 is the score for teamA, game2 would be for teamB if needed, but DUPR expects game1 as teamA score
            const duprMatch: DuprMatchData = {
              location,
              matchDate,
              teamA: {
                player1: teamAPlayer1,
                player2: teamAPlayer2 || undefined,
                game1: game.scoreA || 0,
                game2: 0,
                game3: 0,
                game4: 0,
                game5: 0,
              },
              teamB: {
                player1: teamBPlayer1,
                player2: teamBPlayer2 || undefined,
                game1: game.scoreB || 0,
                game2: 0,
                game3: 0,
                game4: 0,
                game5: 0,
              },
              format: 'DOUBLES', // MLP games are always doubles (2v2)
              event: eventName,
              bracket: division.name,
              matchType,
            }

            // Remove player2 if undefined
            if (!duprMatch.teamA.player2) {
              delete duprMatch.teamA.player2
            }
            if (!duprMatch.teamB.player2) {
              delete duprMatch.teamB.player2
            }

            const matchKey = `${match.id}-${gameIndex}`
            matchMapping.set(matchKey, { matchId: match.id, gameIndex, division })
            duprMatches.push(duprMatch)
          }
        } else {
          // Single Elimination: One match = one DUPR match
          // Get all games and combine scores
          const teamAPlayer1 = teamAPlayers[0]?.player.dupr || null
          const teamAPlayer2 = teamAPlayers[1]?.player.dupr || null
          const teamBPlayer1 = teamBPlayers[0]?.player.dupr || null
          const teamBPlayer2 = teamBPlayers[1]?.player.dupr || null

          if (!teamAPlayer1 || !teamBPlayer1) continue

          // For single elimination, all games between two teams are combined into one match
          // DUPR expects game1, game2, etc. as scores for each game
          const games = match.games.slice(0, 5) // Max 5 games
          const gameScores = games.map((g: any) => ({
            scoreA: g.scoreA || 0,
            scoreB: g.scoreB || 0,
          }))

          const duprMatch: DuprMatchData = {
            location,
            matchDate,
            teamA: {
              player1: teamAPlayer1,
              player2: teamAPlayer2 || undefined,
              game1: gameScores[0]?.scoreA || 0,
              game2: gameScores[1]?.scoreA || 0,
              game3: gameScores[2]?.scoreA || 0,
              game4: gameScores[3]?.scoreA || 0,
              game5: gameScores[4]?.scoreA || 0,
            },
            teamB: {
              player1: teamBPlayer1,
              player2: teamBPlayer2 || undefined,
              game1: gameScores[0]?.scoreB || 0,
              game2: gameScores[1]?.scoreB || 0,
              game3: gameScores[2]?.scoreB || 0,
              game4: gameScores[3]?.scoreB || 0,
              game5: gameScores[4]?.scoreB || 0,
            },
            format: teamAPlayer2 ? 'DOUBLES' : 'SINGLES',
            event: eventName,
            bracket: division.name,
            matchType,
          }

          // Remove player2 if undefined
          if (!duprMatch.teamA.player2) {
            delete duprMatch.teamA.player2
          }
          if (!duprMatch.teamB.player2) {
            delete duprMatch.teamB.player2
          }

          matchMapping.set(match.id, { matchId: match.id, division })
          duprMatches.push(duprMatch)
        }
      }
    }

    if (duprMatches.length === 0) {
      return NextResponse.json({
        success: true,
        log: [],
        totalMatches: 0,
        successful: 0,
        failed: 0,
        message: 'No matches to submit (all matches either missing DUPR IDs or already submitted)',
      })
    }

    // Call DUPR API batch endpoint
    const baseUrls = [
      'https://api.dupr.gg',
      'https://api.uat.dupr.gg',
    ]

    let response: Response | null = null
    let lastError: string = ''

    for (const baseUrl of baseUrls) {
      const url = `${baseUrl}/match/v1.0/batch`
      
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${duprAccessToken}`,
            'Accept': 'application/json',
          },
          body: JSON.stringify(duprMatches),
        })

        if (response.ok) {
          break
        } else {
          const responseClone = response.clone()
          const errorText = await responseClone.text()
          lastError = `${response.status}: ${errorText.substring(0, 200)}`
          console.log(`DUPR API batch failed: ${url} - ${lastError}`)
        }
      } catch (error: any) {
        lastError = error.message
        console.log(`DUPR API batch error: ${url} - ${lastError}`)
      }

      if (response && response.ok) {
        break
      }
    }

    if (!response || !response.ok) {
      // All matches failed
      const errorText = lastError || (response ? `${response.status}: No error details` : 'No response')
      
      // Log all matches as failed
      // Need to reload matches to get team names
      const failedMatchIds = Array.from(new Set(Array.from(matchMapping.values()).map(m => m.matchId)))
      const failedMatches = await prisma.match.findMany({
        where: { id: { in: failedMatchIds } },
        include: {
          teamA: {
            include: {
              teamPlayers: {
                include: {
                  player: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
          teamB: {
            include: {
              teamPlayers: {
                include: {
                  player: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
      })

      const matchNameMap = new Map<string, { teamA: string; teamB: string }>()
      for (const match of failedMatches) {
        const teamAName = match.teamA?.teamPlayers
          ?.map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
          .join(' / ') || 'Team A'
        const teamBName = match.teamB?.teamPlayers
          ?.map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
          .join(' / ') || 'Team B'
        matchNameMap.set(match.id, { teamA: teamAName, teamB: teamBName })
      }

      for (const [matchKey, mapping] of Array.from(matchMapping.entries())) {
        const names = matchNameMap.get(mapping.matchId) || { teamA: 'Team A', teamB: 'Team B' }

        const logEntry: DuprMatchSubmission = {
          matchId: mapping.matchId,
          teamAName: names.teamA,
          teamBName: names.teamB,
          status: 'FAILED',
          error: errorText,
        }

        submissionLog.push(logEntry)

        // Update match status in DB
        await prisma.match.update({
          where: { id: mapping.matchId },
          data: {
            duprSubmissionStatus: 'FAILED',
            duprSubmissionError: errorText,
            duprRetryCount: { increment: 1 },
          },
        })
      }

      return NextResponse.json({
        success: false,
        log: submissionLog,
        totalMatches: duprMatches.length,
        successful: 0,
        failed: duprMatches.length,
        error: errorText,
      })
    }

    // Parse response - should be array of match IDs in same order
    const responseData = await response.json()
    const duprMatchIds = Array.isArray(responseData) ? responseData : (responseData.matchIds || [])

    // Get all match IDs that need names
    const allMatchIds = Array.from(new Set(Array.from(matchMapping.values()).map(m => m.matchId)))
    const allMatches = await prisma.match.findMany({
      where: { id: { in: allMatchIds } },
      include: {
        teamA: {
          include: {
            teamPlayers: {
              include: {
                player: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        teamB: {
          include: {
            teamPlayers: {
              include: {
                player: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    const allMatchNameMap = new Map<string, { teamA: string; teamB: string }>()
    for (const match of allMatches) {
      const teamAName = match.teamA?.teamPlayers
        ?.map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
        .join(' / ') || 'Team A'
      const teamBName = match.teamB?.teamPlayers
        ?.map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
        .join(' / ') || 'Team B'
      allMatchNameMap.set(match.id, { teamA: teamAName, teamB: teamBName })
    }

    // Update matches in DB with DUPR match IDs
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < duprMatches.length; i++) {
      const matchKey = Array.from(matchMapping.keys())[i]
      const mapping = matchMapping.get(matchKey)
      
      if (!mapping) continue

      const duprMatchId = duprMatchIds[i] ? String(duprMatchIds[i]) : null
      const names = allMatchNameMap.get(mapping.matchId) || { teamA: 'Team A', teamB: 'Team B' }
      const teamAName = names.teamA
      const teamBName = names.teamB

      if (duprMatchId) {
        const logEntry: DuprMatchSubmission = {
          matchId: mapping.matchId,
          teamAName,
          teamBName,
          status: 'SUCCESS',
          error: null,
          duprMatchId,
        }

        submissionLog.push(logEntry)
        successCount++

        // Update match status in DB
        await prisma.match.update({
          where: { id: mapping.matchId },
          data: {
            duprSubmissionStatus: 'SUCCESS',
            duprMatchId: mapping.gameIndex !== undefined 
              ? `${duprMatchId}-game${mapping.gameIndex}` // For MLP, store game index
              : duprMatchId,
            duprSubmittedAt: new Date(),
            duprSubmissionError: null,
          },
        })
      } else {
        const logEntry: DuprMatchSubmission = {
          matchId: mapping.matchId,
          teamAName,
          teamBName,
          status: 'FAILED',
          error: 'DUPR API did not return match ID',
        }

        submissionLog.push(logEntry)
        failCount++

        // Update match status in DB
        await prisma.match.update({
          where: { id: mapping.matchId },
          data: {
            duprSubmissionStatus: 'FAILED',
            duprSubmissionError: 'DUPR API did not return match ID',
            duprRetryCount: { increment: 1 },
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      log: submissionLog,
      totalMatches: duprMatches.length,
      successful: successCount,
      failed: failCount,
    })
  } catch (error: any) {
    console.error('Error submitting tournament to DUPR:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit tournament to DUPR' },
      { status: 500 }
    )
  }
}
