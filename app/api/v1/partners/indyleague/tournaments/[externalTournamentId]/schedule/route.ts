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
              rosters: {
                include: {
                  player: true,
                  team: true,
                },
              },
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
      const playerIds = new Set<string>()

      for (const day of matchDays) {
        for (const matchup of day.matchups) {
          matchupIds.push(matchup.id)
          divisionIds.add(matchup.divisionId)
          teamIds.add(matchup.homeTeamId)
          teamIds.add(matchup.awayTeamId)
          for (const roster of matchup.rosters) {
            teamIds.add(roster.teamId)
            playerIds.add(roster.playerId)
          }
        }
      }

      const [dayExternalIds, matchupExternalIds, divisionExternalIds, teamExternalIds, playerExternalIds] =
        await Promise.all([
          getExternalIdMap(context.partnerId, 'MATCH_DAY', matchDayIds),
          getExternalIdMap(context.partnerId, 'MATCHUP', matchupIds),
          getExternalIdMap(context.partnerId, 'DIVISION', Array.from(divisionIds)),
          getExternalIdMap(context.partnerId, 'TEAM', Array.from(teamIds)),
          getExternalIdMap(context.partnerId, 'PLAYER', Array.from(playerIds)),
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
            const rosterByTeam = new Map<string, {
              teamId: string
              teamExternalId: string | null
              teamName: string
              players: Array<{
                playerId: string
                externalPlayerId: string | null
                firstName: string
                lastName: string
                letter: string | null
                isActive: boolean
              }>
            }>()

            for (const roster of matchup.rosters) {
              if (!rosterByTeam.has(roster.teamId)) {
                rosterByTeam.set(roster.teamId, {
                  teamId: roster.teamId,
                  teamExternalId: teamExternalIds.get(roster.teamId) || null,
                  teamName: roster.team.name,
                  players: [],
                })
              }

              rosterByTeam.get(roster.teamId)!.players.push({
                playerId: roster.playerId,
                externalPlayerId: playerExternalIds.get(roster.playerId) || null,
                firstName: roster.player.firstName,
                lastName: roster.player.lastName,
                letter: roster.letter,
                isActive: roster.isActive,
              })
            }

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
              gamesWonHome: matchup.gamesWonHome,
              gamesWonAway: matchup.gamesWonAway,
              rosters: Array.from(rosterByTeam.values()),
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
import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { getInternalId } from '@/server/utils/externalIdMapping'

type ExternalIdMap = Map<string, string>

function buildExternalIdMap(
  mappings: Array<{ internalId: string; externalId: string }>
): ExternalIdMap {
  const map = new Map<string, string>()
  for (const mapping of mappings) {
    map.set(mapping.internalId, mapping.externalId)
  }
  return map
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
        include: {
          matchDays: {
            orderBy: { date: 'asc' },
            include: {
              matchups: {
                orderBy: { createdAt: 'asc' },
                include: {
                  division: true,
                  homeTeam: true,
                  awayTeam: true,
                  court: true,
                  rosters: {
                    include: {
                      player: true,
                      team: true,
                    },
                  },
                  games: {
                    orderBy: { order: 'asc' },
                  },
                },
              },
            },
          },
        },
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

      const matchDayIds = tournament.matchDays.map((day) => day.id)
      const matchupIds = tournament.matchDays.flatMap((day) =>
        day.matchups.map((matchup) => matchup.id)
      )
      const divisionIds = tournament.matchDays.flatMap((day) =>
        day.matchups.map((matchup) => matchup.divisionId)
      )
      const teamIds = tournament.matchDays.flatMap((day) =>
        day.matchups.flatMap((matchup) => [matchup.homeTeamId, matchup.awayTeamId])
      )
      const playerIds = tournament.matchDays.flatMap((day) =>
        day.matchups.flatMap((matchup) =>
          matchup.rosters.map((roster) => roster.playerId)
        )
      )

      const [dayMappings, matchupMappings, divisionMappings, teamMappings, playerMappings] =
        await Promise.all([
          prisma.externalIdMapping.findMany({
            where: {
              partnerId: context.partnerId,
              entityType: 'MATCH_DAY',
              internalId: { in: matchDayIds },
            },
            select: { internalId: true, externalId: true },
          }),
          prisma.externalIdMapping.findMany({
            where: {
              partnerId: context.partnerId,
              entityType: 'MATCHUP',
              internalId: { in: matchupIds },
            },
            select: { internalId: true, externalId: true },
          }),
          prisma.externalIdMapping.findMany({
            where: {
              partnerId: context.partnerId,
              entityType: 'DIVISION',
              internalId: { in: divisionIds },
            },
            select: { internalId: true, externalId: true },
          }),
          prisma.externalIdMapping.findMany({
            where: {
              partnerId: context.partnerId,
              entityType: 'TEAM',
              internalId: { in: teamIds },
            },
            select: { internalId: true, externalId: true },
          }),
          prisma.externalIdMapping.findMany({
            where: {
              partnerId: context.partnerId,
              entityType: 'PLAYER',
              internalId: { in: playerIds },
            },
            select: { internalId: true, externalId: true },
          }),
        ])

      const dayExternalIds = buildExternalIdMap(dayMappings)
      const matchupExternalIds = buildExternalIdMap(matchupMappings)
      const divisionExternalIds = buildExternalIdMap(divisionMappings)
      const teamExternalIds = buildExternalIdMap(teamMappings)
      const playerExternalIds = buildExternalIdMap(playerMappings)

      const response = {
        tournament: {
          externalId: externalTournamentId,
          id: tournament.id,
          title: tournament.title,
          format: tournament.format,
          startDate: tournament.startDate.toISOString(),
          endDate: tournament.endDate.toISOString(),
          timezone: tournament.timezone,
        },
        days: tournament.matchDays.map((day) => ({
          externalDayId: dayExternalIds.get(day.id) || null,
          id: day.id,
          date: day.date.toISOString().split('T')[0],
          status: day.status,
          matchups: day.matchups.map((matchup) => ({
            externalMatchupId: matchupExternalIds.get(matchup.id) || null,
            id: matchup.id,
            status: matchup.status,
            gamesWonHome: matchup.gamesWonHome,
            gamesWonAway: matchup.gamesWonAway,
            tieBreakWinnerTeamExternalId: matchup.tieBreakWinnerTeamId
              ? teamExternalIds.get(matchup.tieBreakWinnerTeamId) || null
              : null,
            division: {
              externalId: divisionExternalIds.get(matchup.divisionId) || null,
              id: matchup.divisionId,
              name: matchup.division.name,
            },
            homeTeam: {
              externalId: teamExternalIds.get(matchup.homeTeamId) || null,
              id: matchup.homeTeamId,
              name: matchup.homeTeam.name,
            },
            awayTeam: {
              externalId: teamExternalIds.get(matchup.awayTeamId) || null,
              id: matchup.awayTeamId,
              name: matchup.awayTeam.name,
            },
            court: matchup.court
              ? {
                  id: matchup.court.id,
                  name: matchup.court.name,
                }
              : null,
            rosters: matchup.rosters.map((roster) => ({
              team: {
                externalId: teamExternalIds.get(roster.teamId) || null,
                id: roster.teamId,
                name: roster.team.name,
              },
              player: {
                externalId: playerExternalIds.get(roster.playerId) || null,
                id: roster.playerId,
                firstName: roster.player.firstName,
                lastName: roster.player.lastName,
              },
              isActive: roster.isActive,
              letter: roster.letter,
            })),
            games: matchup.games.map((game) => ({
              id: game.id,
              order: game.order,
              court: game.court,
              homePair: game.homePair,
              awayPair: game.awayPair,
              homeScore: game.homeScore,
              awayScore: game.awayScore,
            })),
          })),
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
