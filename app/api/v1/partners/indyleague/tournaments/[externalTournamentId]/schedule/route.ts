import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { getInternalId } from '@/server/utils/externalIdMapping'
import { ExternalEntityType } from '@prisma/client'

async function getExternalIdMap(
  partnerId: string,
  entityType: ExternalEntityType,
  internalIds: string[]
) {
  if (internalIds.length === 0) {
    return new Map<string, string>()
  }

  const mappings = await prisma.externalIdMapping.findMany({
    where: {
      partnerId,
      entityType,
      internalId: { in: internalIds },
    },
    select: {
      internalId: true,
      externalId: true,
    },
  })

  return new Map(mappings.map((m) => [m.internalId, m.externalId]))
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ externalTournamentId: string }> }
) {
  const { externalTournamentId } = await params

  const handler = withPartnerAuth(
    async (req: NextRequest, context) => {
      if (!externalTournamentId) {
        return NextResponse.json(
          {
            errorCode: 'INVALID_REQUEST',
            message: 'externalTournamentId is required',
            details: [],
          },
          { status: 400 }
        )
      }

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

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { id: true, title: true, format: true },
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

      if (tournament.format !== 'INDY_LEAGUE') {
        return NextResponse.json(
          {
            errorCode: 'INVALID_TOURNAMENT_FORMAT',
            message: 'This endpoint is only available for IndyLeague tournaments',
            details: [],
          },
          { status: 400 }
        )
      }

      const matchDays = await prisma.matchDay.findMany({
        where: { tournamentId },
        include: {
          matchups: {
            include: {
              division: true,
              homeTeam: true,
              awayTeam: true,
              court: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { date: 'asc' },
      })

      const matchDayIds = matchDays.map((d) => d.id)
      const matchupIds: string[] = []
      const divisionIds = new Set<string>()
      const teamIds = new Set<string>()

      for (const day of matchDays) {
        for (const matchup of day.matchups) {
          matchupIds.push(matchup.id)
          divisionIds.add(matchup.divisionId)
          teamIds.add(matchup.homeTeamId)
          teamIds.add(matchup.awayTeamId)
        }
      }

      const [dayExternalIds, matchupExternalIds, divisionExternalIds, teamExternalIds] =
        await Promise.all([
          getExternalIdMap(context.partnerId, 'MATCH_DAY', matchDayIds),
          getExternalIdMap(context.partnerId, 'MATCHUP', matchupIds),
          getExternalIdMap(context.partnerId, 'DIVISION', Array.from(divisionIds)),
          getExternalIdMap(context.partnerId, 'TEAM', Array.from(teamIds)),
        ])

      const response = {
        externalTournamentId,
        tournamentName: tournament.title,
        generatedAt: new Date().toISOString(),
        days: matchDays.map((day) => ({
          externalDayId: dayExternalIds.get(day.id) || null,
          date: day.date.toISOString().split('T')[0],
          status: day.status,
          matchups: day.matchups.map((matchup) => {
            return {
              externalMatchupId: matchupExternalIds.get(matchup.id) || null,
              division: {
                id: matchup.divisionId,
                externalId: divisionExternalIds.get(matchup.divisionId) || null,
                name: matchup.division.name,
              },
              homeTeam: {
                id: matchup.homeTeamId,
                externalId: teamExternalIds.get(matchup.homeTeamId) || null,
                name: matchup.homeTeam.name,
              },
              awayTeam: {
                id: matchup.awayTeamId,
                externalId: teamExternalIds.get(matchup.awayTeamId) || null,
                name: matchup.awayTeam.name,
              },
              court: matchup.court
                ? { id: matchup.court.id, name: matchup.court.name }
                : null,
              status: matchup.status,
            }
          }),
        })),
      }

      return NextResponse.json(response)
    },
    {
      requiredScope: 'indyleague:read',
    }
  )

  return handler(req)
}
