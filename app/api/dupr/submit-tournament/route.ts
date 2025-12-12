import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface DuprMatchSubmission {
  matchId: string
  teamAName: string
  teamBName: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'PROCESSING'
  error?: string | null
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
                // Only get matches that should be submitted (not tiebreakers)
                tiebreaker: null,
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
                            id: true,
                            firstName: true,
                            lastName: true,
                            dupr: true,
                          },
                        },
                      },
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
        accessLevel: { in: ['ADMIN', 'SCORE'] },
      },
    })

    if (!isOwner && !hasAccess) {
      return NextResponse.json({ error: 'No access to this tournament' }, { status: 403 })
    }

    // Get DUPR API credentials
    const duprClientId = process.env.DUPR_CLIENT_ID
    const duprClientSecret = process.env.DUPR_CLIENT_SECRET

    if (!duprClientId || !duprClientSecret) {
      return NextResponse.json({ error: 'DUPR API credentials not configured' }, { status: 500 })
    }

    // Collect all matches that need to be submitted
    const matchesToSubmit: Array<{
      match: any
      division: any
    }> = []

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

        // Skip tiebreakers
        if (match.tiebreaker) continue

        matchesToSubmit.push({ match, division })
      }
    }

    const submissionLog: DuprMatchSubmission[] = []

    // Submit each match to DUPR
    for (const { match, division } of matchesToSubmit) {
      const teamAName = match.teamA?.teamPlayers
        ?.map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
        .join(' / ') || 'Team A'
      const teamBName = match.teamB?.teamPlayers
        ?.map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`)
        .join(' / ') || 'Team B'

      const logEntry: DuprMatchSubmission = {
        matchId: match.id,
        teamAName,
        teamBName,
        status: 'PROCESSING',
      }

      try {
        // Check if all players have DUPR IDs
        const teamAPlayers = match.teamA?.teamPlayers || []
        const teamBPlayers = match.teamB?.teamPlayers || []
        const allPlayers = [...teamAPlayers, ...teamBPlayers]

        const playersWithoutDupr = allPlayers.filter((tp: any) => !tp.player.dupr)
        if (playersWithoutDupr.length > 0) {
          logEntry.status = 'FAILED'
          logEntry.error = `Missing DUPR ID for players: ${playersWithoutDupr.map((tp: any) => `${tp.player.firstName} ${tp.player.lastName}`).join(', ')}`
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

        // Prepare DUPR match data
        // TODO: Format match data according to DUPR API specification
        // For now, this is a placeholder structure
        const duprMatchData = {
          // Format according to DUPR API requirements
          // This needs to be filled based on actual DUPR API documentation
        }

        // Call DUPR API
        // TODO: Implement actual DUPR API call
        // const response = await fetch('https://api.dupr.gg/match/v1/create', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': `Bearer ${duprAccessToken}`,
        //   },
        //   body: JSON.stringify(duprMatchData),
        // })

        // For now, simulate success
        logEntry.status = 'SUCCESS'
        logEntry.error = null

        // Update match status in DB
        await prisma.match.update({
          where: { id: match.id },
          data: {
            duprSubmissionStatus: 'SUCCESS',
            duprSubmittedAt: new Date(),
            duprSubmissionError: null,
          },
        })

        submissionLog.push(logEntry)
      } catch (error: any) {
        logEntry.status = 'FAILED'
        logEntry.error = error.message || 'Unknown error'
        submissionLog.push(logEntry)

        // Update match status in DB
        await prisma.match.update({
          where: { id: match.id },
          data: {
            duprSubmissionStatus: 'FAILED',
            duprSubmissionError: logEntry.error,
            duprRetryCount: { increment: 1 },
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      log: submissionLog,
      totalMatches: matchesToSubmit.length,
      successful: submissionLog.filter(e => e.status === 'SUCCESS').length,
      failed: submissionLog.filter(e => e.status === 'FAILED').length,
    })
  } catch (error: any) {
    console.error('Error submitting tournament to DUPR:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit tournament to DUPR' },
      { status: 500 }
    )
  }
}

