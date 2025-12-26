import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { getInternalId, getInternalIds } from '@/server/utils/externalIdMapping'
import { z } from 'zod'

const upsertRostersSchema = z.object({
  externalTournamentId: z.string(),
  externalDayId: z.string(),
  rosters: z.array(
    z.object({
      teamExternalId: z.string(),
      players: z.array(
        z.object({
          externalPlayerId: z.string(),
        })
      ),
      activePlayerExternalIds: z.array(z.string()).optional(),
    })
  ),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertRostersSchema.parse(body)

    // Get match day internal ID
    const matchDayId = await getInternalId(
      context.partnerId,
      'MATCH_DAY',
      validated.externalDayId
    )

    if (!matchDayId) {
      return NextResponse.json(
        {
          errorCode: 'MATCH_DAY_NOT_FOUND',
          message: `Match day with external ID ${validated.externalDayId} not found`,
          details: [],
        },
        { status: 422 }
      )
    }

    // Get all matchups for this day
    const matchups = await prisma.indyMatchup.findMany({
      where: { matchDayId },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    })

    // Create team external ID to matchup map
    const teamExternalIds = Array.from(new Set(validated.rosters.map(r => r.teamExternalId)))
    const teamMap = await getInternalIds(
      context.partnerId,
      'TEAM',
      teamExternalIds
    )

    // Get all player external IDs
    const allPlayerExternalIds = Array.from(new Set(
      validated.rosters.flatMap(r => r.players.map(p => p.externalPlayerId))
    ))
    const playerMap = await getInternalIds(
      context.partnerId,
      'PLAYER',
      allPlayerExternalIds
    )

    const results: Array<{
      teamExternalId: string
      status: 'created' | 'updated'
      error?: string
    }> = []

    for (const roster of validated.rosters) {
      try {
        const teamId = teamMap.get(roster.teamExternalId)
        if (!teamId) {
          results.push({
            teamExternalId: roster.teamExternalId,
            status: 'updated',
            error: `Team with external ID ${roster.teamExternalId} not found`,
          })
          continue
        }

        // Find matchup for this team
        const matchup = matchups.find(
          m => m.homeTeamId === teamId || m.awayTeamId === teamId
        )

        if (!matchup) {
          results.push({
            teamExternalId: roster.teamExternalId,
            status: 'updated',
            error: `No matchup found for team ${roster.teamExternalId} on this match day`,
          })
          continue
        }

        // Get team players to validate roster
        const teamPlayers = await prisma.teamPlayer.findMany({
          where: { teamId },
          select: { playerId: true },
        })
        const teamPlayerIds = new Set(teamPlayers.map(tp => tp.playerId))

        // Validate that all players in roster are part of the team
        const invalidPlayers: string[] = []
        for (const player of roster.players) {
          const playerId = playerMap.get(player.externalPlayerId)
          if (!playerId) {
            invalidPlayers.push(player.externalPlayerId)
            continue
          }
          if (!teamPlayerIds.has(playerId)) {
            invalidPlayers.push(player.externalPlayerId)
          }
        }

        if (invalidPlayers.length > 0) {
          results.push({
            teamExternalId: roster.teamExternalId,
            status: 'updated',
            error: `Players not in team: ${invalidPlayers.join(', ')}. All players must be part of the team before adding to roster.`,
          })
          continue
        }

        // Delete existing rosters for this matchup and team
        await prisma.dayRoster.deleteMany({
          where: {
            matchupId: matchup.id,
            teamId,
          },
        })

        // Create new rosters
        const activePlayerIds = roster.activePlayerExternalIds
          ? roster.activePlayerExternalIds
              .map(extId => playerMap.get(extId))
              .filter((id): id is string => id !== undefined)
          : []

        // Validate active players count (should be 4 for IndyLeague)
        if (activePlayerIds.length > 0 && activePlayerIds.length !== 4) {
          results.push({
            teamExternalId: roster.teamExternalId,
            status: 'updated',
            error: `Active players count must be exactly 4 for IndyLeague, got ${activePlayerIds.length}`,
          })
          continue
        }

        for (const player of roster.players) {
          const playerId = playerMap.get(player.externalPlayerId)
          if (!playerId) {
            continue // Skip if player not found (shouldn't happen after validation)
          }

          const isActive = activePlayerIds.includes(playerId)

          await prisma.dayRoster.create({
            data: {
              matchupId: matchup.id,
              teamId,
              playerId,
              isActive,
              // Letter will be assigned later in UI
            },
          })
        }

        results.push({
          teamExternalId: roster.teamExternalId,
          status: 'updated',
        })
      } catch (error: any) {
        results.push({
          teamExternalId: roster.teamExternalId,
          status: 'updated',
          error: error.message || 'Failed to upsert roster',
        })
      }
    }

    return NextResponse.json({
      items: results,
    })
  },
  {
    requiredScope: 'indyleague:write',
    requireIdempotency: true,
  }
)

