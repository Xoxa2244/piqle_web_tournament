import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { getInternalId } from '@/server/utils/externalIdMapping'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ externalTournamentId: string }> }
) {
  const { externalTournamentId } = await params
  
  const handler = withPartnerAuth(
    async (req: NextRequest, context) => {

    // Get tournament internal ID
    const tournamentId = await getInternalId(
      context.partnerId,
      'TOURNAMENT',
      externalTournamentId
    )

    if (!tournamentId) {
      return NextResponse.json(
        {
          errorCode: 'TOURNAMENT_NOT_FOUND',
          message: `Tournament with external ID ${externalTournamentId} not found`,
          details: [],
        },
        { status: 404 }
      )
    }

    // Verify tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, format: true },
    })

    if (!tournament) {
      return NextResponse.json(
        {
          errorCode: 'TOURNAMENT_NOT_FOUND',
          message: `Tournament with external ID ${externalTournamentId} not found`,
          details: [],
        },
        { status: 404 }
      )
    }

    // Get all related entity IDs before deletion for external ID mapping cleanup
    const divisions = await prisma.division.findMany({
      where: { tournamentId },
      select: { id: true },
    })
    const divisionIds = divisions.map(d => d.id)

    const teams = await prisma.team.findMany({
      where: { divisionId: { in: divisionIds } },
      select: { id: true },
    })
    const teamIds = teams.map(t => t.id)

    const players = await prisma.player.findMany({
      where: { tournamentId },
      select: { id: true },
    })
    const playerIds = players.map(p => p.id)

    const matchDays = await prisma.matchDay.findMany({
      where: { tournamentId },
      select: { id: true },
    })
    const matchDayIds = matchDays.map(md => md.id)

    const matchups = await prisma.indyMatchup.findMany({
      where: { matchDayId: { in: matchDayIds } },
      select: { id: true },
    })
    const matchupIds = matchups.map(m => m.id)

    // Delete external ID mappings for all related entities
    // Note: Tournament deletion will cascade to most entities, but we need to clean up mappings first
    await prisma.externalIdMapping.deleteMany({
      where: {
        partnerId: context.partnerId,
        OR: [
          { entityType: 'TOURNAMENT', internalId: tournamentId },
          { entityType: 'DIVISION', internalId: { in: divisionIds } },
          { entityType: 'TEAM', internalId: { in: teamIds } },
          { entityType: 'PLAYER', internalId: { in: playerIds } },
          { entityType: 'MATCH_DAY', internalId: { in: matchDayIds } },
          { entityType: 'MATCHUP', internalId: { in: matchupIds } },
        ],
      },
    })

    // Delete tournament (cascade will handle most related entities)
    await prisma.tournament.delete({
      where: { id: tournamentId },
    })

    return NextResponse.json({
      success: true,
      message: `Tournament ${externalTournamentId} and all related data have been deleted`,
      deleted: {
        tournament: 1,
        divisions: divisionIds.length,
        teams: teamIds.length,
        players: playerIds.length,
        matchDays: matchDayIds.length,
        matchups: matchupIds.length,
        externalMappings: 'all related',
      },
    })
    },
    {
      requiredScope: 'indyleague:write',
      requireIdempotency: false, // Cleanup doesn't need idempotency
    }
  )

  return handler(req)
}

