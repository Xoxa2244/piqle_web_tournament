import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { z } from 'zod'

const upsertPlayersSchema = z.object({
  externalTournamentId: z.string(),
  players: z.array(
    z.object({
      externalPlayerId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      duprId: z.string().optional(),
      gender: z.enum(['M', 'F', 'X']).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      externalTeamId: z.string().optional(), // Optional: if provided, player will be added to team
    })
  ),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertPlayersSchema.parse(body)

    // Get tournament internal ID
    const tournamentId = await getInternalId(
      context.partnerId,
      'TOURNAMENT',
      validated.externalTournamentId
    )

    if (!tournamentId) {
      return NextResponse.json(
        {
          errorCode: 'TOURNAMENT_NOT_FOUND',
          message: `Tournament with external ID ${validated.externalTournamentId} not found`,
          details: [],
        },
        { status: 422 }
      )
    }

    // Verify tournament exists and is IndyLeague
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { format: true },
    })

    if (!tournament || tournament.format !== 'INDY_LEAGUE') {
      return NextResponse.json(
        {
          errorCode: 'INVALID_TOURNAMENT',
          message: 'Tournament is not an IndyLeague tournament',
          details: [],
        },
        { status: 422 }
      )
    }

    const results: Array<{
      externalPlayerId: string
      status: 'created' | 'updated'
      error?: string
      warning?: string
    }> = []

    for (const player of validated.players) {
      try {
        const existingInternalId = await getInternalId(
          context.partnerId,
          'PLAYER',
          player.externalPlayerId
        )

        if (existingInternalId) {
          // Check if player actually exists in database
          const existingPlayer = await prisma.player.findUnique({
            where: { id: existingInternalId },
          })

          if (existingPlayer) {
            // Update existing player
            await prisma.player.update({
              where: { id: existingInternalId },
              data: {
                firstName: player.firstName,
                lastName: player.lastName,
                email: player.email || null,
                gender: player.gender || null,
                dupr: player.duprId || null,
                tournamentId, // Update tournament association
              },
            })

            // If externalTeamId is provided, ensure player is in team
            if (player.externalTeamId) {
              const teamId = await getInternalId(
                context.partnerId,
                'TEAM',
                player.externalTeamId
              )

              if (teamId) {
                // Get team to check division and tournament format
                const team = await prisma.team.findUnique({
                  where: { id: teamId },
                  include: {
                    division: {
                      include: {
                        tournament: {
                          select: { format: true },
                        },
                      },
                    },
                    teamPlayers: true,
                  },
                })

                if (team) {
                  // Check team capacity: 8 for IndyLeague, otherwise based on teamKind
                  const maxPlayers =
                    team.division.tournament.format === 'INDY_LEAGUE'
                      ? 8
                      : team.division.teamKind === 'SINGLES_1v1'
                        ? 1
                        : team.division.teamKind === 'DOUBLES_2v2'
                          ? 2
                          : team.division.teamKind === 'SQUAD_4v4'
                            ? 4
                            : 2

                  if (team.teamPlayers.length >= maxPlayers) {
                    // Team is full, add warning but still update player
                    results.push({
                      externalPlayerId: player.externalPlayerId,
                      status: 'updated',
                      warning: `Team ${player.externalTeamId} is full (max ${maxPlayers} players). Player updated but not added to team.`,
                    })
                  } else {
                    // Check if player is already in team
                    const existingTeamPlayer = await prisma.teamPlayer.findUnique({
                      where: {
                        teamId_playerId: {
                          teamId,
                          playerId: existingInternalId,
                        },
                      },
                    })

                    if (!existingTeamPlayer) {
                      await prisma.teamPlayer.create({
                        data: {
                          teamId,
                          playerId: existingInternalId,
                          role: 'PLAYER',
                        },
                      })
                    }
                  }
                }
              } else {
                // Team not found, add warning
                results.push({
                  externalPlayerId: player.externalPlayerId,
                  status: 'updated',
                  warning: `Team ${player.externalTeamId} not found. Player updated but not added to team.`,
                })
              }
            }

            // Only add success result if not already added (with warning)
            const alreadyAdded = results.some(r => r.externalPlayerId === player.externalPlayerId)
            if (!alreadyAdded) {
              results.push({
                externalPlayerId: player.externalPlayerId,
                status: 'updated',
              })
            }
          } else {
            // Mapping exists but player was deleted - create new one
            // First, remove old mapping
            await prisma.externalIdMapping.deleteMany({
              where: {
                partnerId: context.partnerId,
                entityType: 'PLAYER',
                externalId: player.externalPlayerId,
              },
            })

            // Create new player tied to tournament
            const newPlayer = await prisma.player.create({
              data: {
                firstName: player.firstName,
                lastName: player.lastName,
                email: player.email || null,
                gender: player.gender || null,
                dupr: player.duprId || null,
                tournamentId, // Link to tournament
              },
            })

            // Create external ID mapping
            await setExternalIdMapping(
              context.partnerId,
              'PLAYER',
              player.externalPlayerId,
              newPlayer.id
            )

            // If externalTeamId is provided, add player to team
            if (player.externalTeamId) {
              const teamId = await getInternalId(
                context.partnerId,
                'TEAM',
                player.externalTeamId
              )

              if (teamId) {
                // Get team to check division and tournament format
                const team = await prisma.team.findUnique({
                  where: { id: teamId },
                  include: {
                    division: {
                      include: {
                        tournament: {
                          select: { format: true },
                        },
                      },
                    },
                    teamPlayers: true,
                  },
                })

                if (team) {
                  // Check team capacity: 8 for IndyLeague, otherwise based on teamKind
                  const maxPlayers =
                    team.division.tournament.format === 'INDY_LEAGUE'
                      ? 8
                      : team.division.teamKind === 'SINGLES_1v1'
                        ? 1
                        : team.division.teamKind === 'DOUBLES_2v2'
                          ? 2
                          : team.division.teamKind === 'SQUAD_4v4'
                            ? 4
                            : 2

                  if (team.teamPlayers.length >= maxPlayers) {
                    // Team is full, add warning but still create player
                    results.push({
                      externalPlayerId: player.externalPlayerId,
                      status: 'created',
                      warning: `Team ${player.externalTeamId} is full (max ${maxPlayers} players). Player created but not added to team.`,
                    })
                  } else {
                    // Check if player is already in team
                    const existingTeamPlayer = await prisma.teamPlayer.findUnique({
                      where: {
                        teamId_playerId: {
                          teamId,
                          playerId: newPlayer.id,
                        },
                      },
                    })

                    if (!existingTeamPlayer) {
                      await prisma.teamPlayer.create({
                        data: {
                          teamId,
                          playerId: newPlayer.id,
                          role: 'PLAYER',
                        },
                      })
                    }
                  }
                }
              } else {
                // Team not found, add warning
                results.push({
                  externalPlayerId: player.externalPlayerId,
                  status: 'created',
                  warning: `Team ${player.externalTeamId} not found. Player created but not added to team.`,
                })
              }
            }

            // Only add success result if not already added (with error/warning)
            const alreadyAdded = results.some(r => r.externalPlayerId === player.externalPlayerId)
            if (!alreadyAdded) {
              results.push({
                externalPlayerId: player.externalPlayerId,
                status: 'created',
              })
            }
          }
        } else {
          // Create new player tied to tournament
          const newPlayer = await prisma.player.create({
            data: {
              firstName: player.firstName,
              lastName: player.lastName,
              email: player.email || null,
              gender: player.gender || null,
              dupr: player.duprId || null,
              tournamentId, // Link to tournament
            },
          })

          // Create external ID mapping
          await setExternalIdMapping(
            context.partnerId,
            'PLAYER',
            player.externalPlayerId,
            newPlayer.id
          )

          // If externalTeamId is provided, add player to team
          if (player.externalTeamId) {
            const teamId = await getInternalId(
              context.partnerId,
              'TEAM',
              player.externalTeamId
            )

            if (teamId) {
              // Get team to check division and tournament format
              const team = await prisma.team.findUnique({
                where: { id: teamId },
                include: {
                  division: {
                    include: {
                      tournament: {
                        select: { format: true },
                      },
                    },
                  },
                  teamPlayers: true,
                },
              })

              if (team) {
                // Check team capacity: 8 for IndyLeague, otherwise based on teamKind
                const maxPlayers =
                  team.division.tournament.format === 'INDY_LEAGUE'
                    ? 8
                    : team.division.teamKind === 'SINGLES_1v1'
                      ? 1
                      : team.division.teamKind === 'DOUBLES_2v2'
                        ? 2
                        : team.division.teamKind === 'SQUAD_4v4'
                          ? 4
                          : 2

                if (team.teamPlayers.length >= maxPlayers) {
                  // Team is full, add error but still create player
                  results.push({
                    externalPlayerId: player.externalPlayerId,
                    status: 'created',
                    warning: `Team ${player.externalTeamId} is full (max ${maxPlayers} players). Player created but not added to team.`,
                  })
                } else {
                  // Check if player is already in team
                  const existingTeamPlayer = await prisma.teamPlayer.findUnique({
                    where: {
                      teamId_playerId: {
                        teamId,
                        playerId: newPlayer.id,
                      },
                    },
                  })

                  if (!existingTeamPlayer) {
                    await prisma.teamPlayer.create({
                      data: {
                        teamId,
                        playerId: newPlayer.id,
                        role: 'PLAYER',
                      },
                    })
                  }
                }
              }
            } else {
              // Team not found, add warning
              results.push({
                externalPlayerId: player.externalPlayerId,
                status: 'created',
                warning: `Team ${player.externalTeamId} not found. Player created but not added to team.`,
              })
            }
          }

          // Only add success result if not already added (with error/warning)
          const alreadyAdded = results.some(r => r.externalPlayerId === player.externalPlayerId)
          if (!alreadyAdded) {
            results.push({
              externalPlayerId: player.externalPlayerId,
              status: 'created',
            })
          }
        }
      } catch (error: any) {
        results.push({
          externalPlayerId: player.externalPlayerId,
          status: 'updated',
          error: error.message || 'Failed to upsert player',
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

