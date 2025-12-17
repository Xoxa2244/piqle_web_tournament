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
  tournament?: string
  league?: string
  eventDate: string // Changed from matchDate to eventDate
  team1: {
    player1: number | string // DUPR expects numeric ID or string ID
    player2?: number | string
    game1: number
    game2: number
    game3: number
    game4: number
    game5: number
    winner: boolean
  }
  team2: {
    player1: number | string
    player2?: number | string
    game1: number
    game2: number
    game3: number
    game4: number
    game5: number
    winner: boolean
  }
  format: 'SINGLES' | 'DOUBLES'
  event: string
  bracket?: string
  matchType?: 'SIDEOUT' | 'SIDE_ONLY' | 'RALLY'
  // Required fields from DUPR FAQ
  identifier: string // Must be unique for each new match
  matchSource: 'CLUB' | 'PARTNER' // Required field
  // Optional fields from API docs
  scoreFormatId?: number
  clubId?: number // Required if matchSource is 'CLUB', omitted if 'PARTNER'
  notify?: boolean
  metadata?: Record<string, string>
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

    // Get DUPR access token
    // Try client credentials first, fallback to user token
    const duprClientId = process.env.DUPR_CLIENT_ID
    const duprClientSecret = process.env.DUPR_CLIENT_SECRET
    
    let duprAccessToken: string | null = null
    
    // Try to get client credentials token if available
    if (duprClientId && duprClientSecret) {
      try {
        const tokenUrls = [
          'https://api.dupr.gg/oauth/token',
          'https://api.uat.dupr.gg/oauth/token',
        ]
        
        for (const tokenUrl of tokenUrls) {
          try {
            const tokenResponse = await fetch(tokenUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: duprClientId,
                client_secret: duprClientSecret,
              }),
            })
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json()
              duprAccessToken = tokenData.access_token || null
              if (duprAccessToken) {
                console.log('Successfully obtained DUPR client credentials token')
                break
              }
            }
          } catch (error) {
            console.log(`Failed to get client credentials token from ${tokenUrl}`)
          }
        }
      } catch (error) {
        console.log('Error getting client credentials token, will use user token')
      }
    }
    
    // Fallback to user access token
    if (!duprAccessToken) {
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

      duprAccessToken = owner.duprAccessToken
      console.log('Using user access token for DUPR API')
    }

    // Prepare matches for DUPR submission
    const duprMatches: DuprMatchData[] = []
    const matchMapping: Map<string, { matchId: string; gameIndex?: number; division: any }> = new Map()
    const submissionLog: DuprMatchSubmission[] = []

    const isMLP = tournament.format === 'MLP'
    const location = tournament.venueName || tournament.venueAddress || 'Unknown Location'
    const eventDate = tournament.startDate.toISOString().split('T')[0] // yyyy-MM-dd format
    const eventName = tournament.title
    const tournamentName = tournament.title // Use tournament title as tournament field
    const matchType = 'SIDEOUT' as const
    const matchSource = 'PARTNER' as const // We're a partner, not a club
    // clubId should be omitted for PARTNER submissions

    for (const division of tournament.divisions) {
      for (const match of division.matches) {
        // Skip matches without games or with no scores
        if (!match.games || match.games.length === 0) continue

        // Get players with DUPR IDs (needed for both validation and match creation)
        const teamAPlayers = match.teamA?.teamPlayers || []
        const teamBPlayers = match.teamB?.teamPlayers || []
        
        // Check if match is fully completed (all games have both scores)
        // This is required before submitting to DUPR
        const allGamesCompleted = match.games.every((g: any) =>
          g.scoreA !== null &&
          g.scoreA !== undefined &&
          g.scoreB !== null &&
          g.scoreB !== undefined &&
          g.scoreA >= 0 &&
          g.scoreB >= 0
        )

        // For Play-Off matches, also check if there's a winner
        const hasWinner = match.winnerTeamId !== null && match.winnerTeamId !== undefined

        // Match is considered completed if:
        // 1. All games have both scores, OR
        // 2. There's a winner (for Play-Off matches)
        const isMatchCompleted = allGamesCompleted || hasWinner

        if (!isMatchCompleted) {
          // Match is not fully completed - skip and log error
          const teamAName = teamAPlayers
            .map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
            .join(' / ') || 'Team A'
          const teamBName = teamBPlayers
            .map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
            .join(' / ') || 'Team B'
          
          // Find which games are incomplete
          const incompleteGames = match.games
            .map((g: any, idx: number) => {
              const isComplete = g.scoreA !== null && g.scoreA !== undefined &&
                                g.scoreB !== null && g.scoreB !== undefined &&
                                g.scoreA >= 0 && g.scoreB >= 0
              return !isComplete ? idx + 1 : null
            })
            .filter(Boolean)
          
          const errorMessage = incompleteGames.length > 0
            ? `Match not completed: games ${incompleteGames.join(', ')} are missing scores`
            : `Match not completed: all games must have both scores set`
          
          const logEntry: DuprMatchSubmission = {
            matchId: match.id,
            teamAName,
            teamBName,
            status: 'FAILED',
            error: errorMessage,
          }
          
          submissionLog.push(logEntry)
          
          // Update match status in DB
          await prisma.match.update({
            where: { id: match.id },
            data: {
              duprSubmissionStatus: 'FAILED',
              duprSubmissionError: errorMessage,
            },
          })
          
          continue
        }
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

            // Check for duplicate players (DUPR FAQ requirement)
            const team1Players = [teamAPlayer1, teamAPlayer2].filter(Boolean)
            const team2Players = [teamBPlayer1, teamBPlayer2].filter(Boolean)
            const allPlayers = [...team1Players, ...team2Players]
            const uniquePlayers = new Set(allPlayers)
            if (allPlayers.length !== uniquePlayers.size) {
              // Duplicate player found - skip this match
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
                error: `Duplicate player found in match (same player in both teams)`,
              }
              
              submissionLog.push(logEntry)
              
              await prisma.match.update({
                where: { id: match.id },
                data: {
                  duprSubmissionStatus: 'FAILED',
                  duprSubmissionError: logEntry.error,
                },
              })
              
              continue
            }

            // For MLP, each game is a single game match (best of 1)
            // Determine winner based on scores
            const scoreA = game.scoreA || 0
            const scoreB = game.scoreB || 0
            
            // Check for tied games (DUPR FAQ requirement: no tied games allowed)
            if (scoreA === scoreB) {
              // Tied game - skip this match
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
                error: `Tied game not allowed (score: ${scoreA}-${scoreB})`,
              }
              
              submissionLog.push(logEntry)
              
              await prisma.match.update({
                where: { id: match.id },
                data: {
                  duprSubmissionStatus: 'FAILED',
                  duprSubmissionError: logEntry.error,
                },
              })
              
              continue
            }
            
            const team1Wins = scoreA > scoreB

            // Build team1 object - order matters: player1, player2 (if doubles), game1-5, winner
            const team1Obj: any = {
              player1: teamAPlayer1,
            }
            if (teamAPlayer2) {
              team1Obj.player2 = teamAPlayer2
            }
            team1Obj.game1 = scoreA
            team1Obj.game2 = 0
            team1Obj.game3 = 0
            team1Obj.game4 = 0
            team1Obj.game5 = 0
            team1Obj.winner = team1Wins

            // Build team2 object - order matters: player1, player2 (if doubles), game1-5, winner
            const team2Obj: any = {
              player1: teamBPlayer1,
            }
            if (teamBPlayer2) {
              team2Obj.player2 = teamBPlayer2
            }
            team2Obj.game1 = scoreB
            team2Obj.game2 = 0
            team2Obj.game3 = 0
            team2Obj.game4 = 0
            team2Obj.game5 = 0
            team2Obj.winner = !team1Wins

            // Generate unique identifier for this match (DUPR FAQ requirement)
            const identifier = `${match.id}-${gameIndex}-${Date.now()}`

            // Build match object - order may matter, so build explicitly
            const duprMatch: DuprMatchData = {
              location,
              eventDate,
              team1: team1Obj,
              team2: team2Obj,
              format: 'DOUBLES', // MLP games are always doubles (2v2)
              event: eventName,
              matchType: 'SIDEOUT',
              identifier, // Unique identifier for each match
              matchSource, // Required: 'PARTNER' (we're a partner, not a club)
              // Optional fields - only include if they have values
            }
            // Add optional fields only if they exist
            if (tournamentName) {
              duprMatch.tournament = tournamentName
            }
            if (division.name) {
              duprMatch.bracket = division.name
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

          // Check for duplicate players (DUPR FAQ requirement)
          const team1Players = [teamAPlayer1, teamAPlayer2].filter(Boolean)
          const team2Players = [teamBPlayer1, teamBPlayer2].filter(Boolean)
          const allPlayers = [...team1Players, ...team2Players]
          const uniquePlayers = new Set(allPlayers)
          if (allPlayers.length !== uniquePlayers.size) {
            // Duplicate player found - skip this match
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
              error: `Duplicate player found in match (same player in both teams)`,
            }
            
            submissionLog.push(logEntry)
            
            await prisma.match.update({
              where: { id: match.id },
              data: {
                duprSubmissionStatus: 'FAILED',
                duprSubmissionError: logEntry.error,
              },
            })
            
            continue
          }

          // For single elimination, all games between two teams are combined into one match
          // DUPR expects game1, game2, etc. as scores for each game
          const games = match.games.slice(0, 5) // Max 5 games
          const gameScores = games.map((g: any) => ({
            scoreA: g.scoreA || 0,
            scoreB: g.scoreB || 0,
          }))

          // Check for tied games (DUPR FAQ requirement: no tied games allowed)
          const hasTiedGames = gameScores.some((game: any) => game.scoreA === game.scoreB && game.scoreA > 0)
          if (hasTiedGames) {
            // Tied game found - skip this match
            const teamAName = teamAPlayers
              .map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
              .join(' / ') || 'Team A'
            const teamBName = teamBPlayers
              .map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
              .join(' / ') || 'Team B'
            
            const tiedGames = gameScores
              .map((game: any, idx: number) => game.scoreA === game.scoreB && game.scoreA > 0 ? idx + 1 : null)
              .filter(Boolean)
            
            const logEntry: DuprMatchSubmission = {
              matchId: match.id,
              teamAName,
              teamBName,
              status: 'FAILED',
              error: `Tied games not allowed (games: ${tiedGames.join(', ')})`,
            }
            
            submissionLog.push(logEntry)
            
            await prisma.match.update({
              where: { id: match.id },
              data: {
                duprSubmissionStatus: 'FAILED',
                duprSubmissionError: logEntry.error,
              },
            })
            
            continue
          }

          // Determine winner: count games won by each team
          let team1GamesWon = 0
          let team2GamesWon = 0
          for (const game of gameScores) {
            if (game.scoreA > game.scoreB) {
              team1GamesWon++
            } else if (game.scoreB > game.scoreA) {
              team2GamesWon++
            }
          }
          const team1Wins = team1GamesWon > team2GamesWon

          // Build team1 object - only include player2 for doubles
          const team1Obj: any = {
            player1: teamAPlayer1,
            game1: gameScores[0]?.scoreA || 0,
            game2: gameScores[1]?.scoreA || 0,
            game3: gameScores[2]?.scoreA || 0,
            game4: gameScores[3]?.scoreA || 0,
            game5: gameScores[4]?.scoreA || 0,
            winner: team1Wins,
          }
          if (teamAPlayer2) {
            team1Obj.player2 = teamAPlayer2
          }

          // Build team2 object - only include player2 for doubles
          const team2Obj: any = {
            player1: teamBPlayer1,
            game1: gameScores[0]?.scoreB || 0,
            game2: gameScores[1]?.scoreB || 0,
            game3: gameScores[2]?.scoreB || 0,
            game4: gameScores[3]?.scoreB || 0,
            game5: gameScores[4]?.scoreB || 0,
            winner: !team1Wins,
          }
          if (teamBPlayer2) {
            team2Obj.player2 = teamBPlayer2
          }

          // Generate unique identifier for this match (DUPR FAQ requirement)
          const identifier = `${match.id}-${Date.now()}`

          // Build match object - order may matter, so build explicitly
          const duprMatch: DuprMatchData = {
            location,
            eventDate,
            team1: team1Obj,
            team2: team2Obj,
            format: teamAPlayer2 ? 'DOUBLES' : 'SINGLES',
            event: eventName,
            matchType: 'SIDEOUT',
            identifier, // Unique identifier for each match
            matchSource, // Required: 'PARTNER' (we're a partner, not a club)
            // Optional fields - only include if they have values
          }
          // Add optional fields only if they exist
          if (tournamentName) {
            duprMatch.tournament = tournamentName
          }
          if (division.name) {
            duprMatch.bracket = division.name
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

    // Call DUPR API using /match/{version}/save endpoint (PUT method)
    // Use the same approach as working /Public/getBasicInfo endpoint
    const baseUrls = [
      'https://api.dupr.gg',
      'https://api.uat.dupr.gg',
    ]
    // Try different API versions for /match/{version}/save endpoint
    const apiVersions = ['v1.0', 'v1', 'v1.1']

    // Log the data being sent for debugging
    console.log('DUPR API Request:', {
      matchesCount: duprMatches.length,
      firstMatch: duprMatches[0] ? JSON.stringify(duprMatches[0], null, 2) : 'No matches',
      hasToken: !!duprAccessToken,
      tokenLength: duprAccessToken?.length || 0,
    })
    
    // Log full request body for first match to debug structure
    if (duprMatches.length > 0) {
      console.log('Full first match request body:', JSON.stringify(duprMatches[0], null, 2))
    }

    // Send each match individually using PUT /match/{version}/save
    // According to DUPR API docs, this is the correct endpoint
    const individualResults: Array<{ success: boolean; matchId?: string; error?: string; index: number }> = []
    
    for (let i = 0; i < duprMatches.length; i++) {
      const match = duprMatches[i]
      let matchResponse: Response | null = null
      let matchError: string = ''

      // Try different API versions and base URLs (same approach as /Public/getBasicInfo)
      saveLoop: for (const baseUrl of baseUrls) {
        for (const version of apiVersions) {
          const url = `${baseUrl}/match/${version}/save`
          
          try {
            const requestBody = JSON.stringify(match)
            console.log(`Attempting DUPR API save call ${i + 1}/${duprMatches.length} to: ${url}`)
            console.log(`Request body for match ${i + 1}:`, requestBody)
            matchResponse = await fetch(url, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${duprAccessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: requestBody,
            })

            if (matchResponse.ok) {
              console.log(`DUPR API save success for match ${i + 1}: ${url}`)
              break saveLoop
            } else {
              // Clone response to read text without consuming body
              const responseClone = matchResponse.clone()
              const errorText = await responseClone.text()
              matchError = `${matchResponse.status}: ${errorText.substring(0, 200)}`
              console.error(`DUPR API save failed for match ${i + 1}: ${url} - ${matchError}`)
              console.error('Full error response:', errorText)
              
              // If 404, try next version
              if (matchResponse.status === 404) {
                continue // Try next version
              } else {
                // Other error, try next base URL
                break // Try next baseUrl
              }
            }
          } catch (error: any) {
            matchError = error.message
            console.error(`DUPR API save error for match ${i + 1}: ${url} - ${matchError}`, error)
            continue // Try next version
          }
        }
      }

      if (matchResponse && matchResponse.ok) {
        try {
          const responseData = await matchResponse.json()
          // Response format: { status: "SUCCESS", message: "...", result: matchId }
          const matchId = responseData.result || responseData.matchId || responseData.id || null
          individualResults.push({ success: true, matchId: matchId ? String(matchId) : undefined, index: i })
        } catch (error: any) {
          individualResults.push({ success: false, error: 'Failed to parse response', index: i })
        }
      } else {
        individualResults.push({ success: false, error: matchError || 'Unknown error', index: i })
      }
    }

    // Check if all matches were successful
    const allSuccessful = individualResults.every(r => r.success)
    const lastError = allSuccessful ? '' : `Some matches failed: ${individualResults.filter(r => !r.success).map(r => `Match ${r.index + 1}: ${r.error}`).join(', ')}`
    const response = allSuccessful ? { ok: true } as Response : null

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

    // Update matches in DB with DUPR match IDs based on individualResults
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < duprMatches.length; i++) {
      const matchKey = Array.from(matchMapping.keys())[i]
      const mapping = matchMapping.get(matchKey)
      const result = individualResults[i]
      
      if (!mapping || !result) continue

      const names = allMatchNameMap.get(mapping.matchId) || { teamA: 'Team A', teamB: 'Team B' }
      const teamAName = names.teamA
      const teamBName = names.teamB

      if (result.success && result.matchId) {
        const logEntry: DuprMatchSubmission = {
          matchId: mapping.matchId,
          teamAName,
          teamBName,
          status: 'SUCCESS',
          error: null,
          duprMatchId: result.matchId,
        }

        submissionLog.push(logEntry)
        successCount++

        // Update match status in DB
        await prisma.match.update({
          where: { id: mapping.matchId },
          data: {
            duprSubmissionStatus: 'SUCCESS',
            duprMatchId: mapping.gameIndex !== undefined 
              ? `${result.matchId}-game${mapping.gameIndex}` // For MLP, store game index
              : result.matchId,
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
          error: result.error || 'DUPR API did not return match ID',
        }

        submissionLog.push(logEntry)
        failCount++

        // Update match status in DB
        await prisma.match.update({
          where: { id: mapping.matchId },
          data: {
            duprSubmissionStatus: 'FAILED',
            duprSubmissionError: result.error || 'DUPR API did not return match ID',
            duprRetryCount: { increment: 1 },
          },
        })
      }
    }

    // Return error response if all matches failed
    if (!response || !response.ok) {
      const errorText = lastError || 'All matches failed'
      return NextResponse.json({
        success: false,
        log: submissionLog,
        totalMatches: duprMatches.length,
        successful: successCount,
        failed: failCount,
        error: errorText,
      })
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
