import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId, getInternalIds } from '@/server/utils/externalIdMapping'
import { z } from 'zod'

const upsertTeamsSchema = z.object({
  externalTournamentId: z.string(),
  teams: z.array(
    z.object({
      externalTeamId: z.string(),
      divisionExternalId: z.string(),
      name: z.string(),
      clubName: z.string().optional(),
      eventType: z.enum(['men', 'women', 'mixed']).optional(),
    })
  ),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertTeamsSchema.parse(body)

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

    // Get all division external IDs and map them
    const divisionExternalIds = Array.from(new Set(validated.teams.map(t => t.divisionExternalId)))
    const divisionMap = await getInternalIds(
      context.partnerId,
      'DIVISION',
      divisionExternalIds
    )

    const results: Array<{
      externalTeamId: string
      status: 'created' | 'updated'
      error?: string
    }> = []

    for (const team of validated.teams) {
      try {
        const divisionId = divisionMap.get(team.divisionExternalId)
        if (!divisionId) {
          results.push({
            externalTeamId: team.externalTeamId,
            status: 'updated',
            error: `Division with external ID ${team.divisionExternalId} not found`,
          })
          continue
        }

        const existingInternalId = await getInternalId(
          context.partnerId,
          'TEAM',
          team.externalTeamId
        )

        if (existingInternalId) {
          // Check if team actually exists in database
          const existingTeam = await prisma.team.findUnique({
            where: { id: existingInternalId },
          })

          if (existingTeam) {
            // Update existing team (including divisionId in case it changed)
            await prisma.team.update({
              where: { id: existingInternalId },
              data: {
                divisionId, // Update division in case team was moved
                name: team.name,
                note: team.clubName || null,
              },
            })
            results.push({
              externalTeamId: team.externalTeamId,
              status: 'updated',
            })
          } else {
            // Mapping exists but team was deleted - create new one
            // First, remove old mapping
            await prisma.externalIdMapping.deleteMany({
              where: {
                partnerId: context.partnerId,
                entityType: 'TEAM',
                externalId: team.externalTeamId,
              },
            })

            // Create new team
            const newTeam = await prisma.team.create({
              data: {
                divisionId,
                name: team.name,
                note: team.clubName || null,
              },
            })

            // Create external ID mapping
            await setExternalIdMapping(
              context.partnerId,
              'TEAM',
              team.externalTeamId,
              newTeam.id
            )

            results.push({
              externalTeamId: team.externalTeamId,
              status: 'created',
            })
          }
        } else {
          // Create new team
          const newTeam = await prisma.team.create({
            data: {
              divisionId,
              name: team.name,
              note: team.clubName || null,
            },
          })

          // Create external ID mapping
          await setExternalIdMapping(
            context.partnerId,
            'TEAM',
            team.externalTeamId,
            newTeam.id
          )

          results.push({
            externalTeamId: team.externalTeamId,
            status: 'created',
          })
        }
      } catch (error: any) {
        // Log full error for debugging
        console.error(`Error upserting team ${team.externalTeamId}:`, error)
        results.push({
          externalTeamId: team.externalTeamId,
          status: 'updated',
          error: error.message || 'Failed to upsert team',
        })
      }
    }

    // Ensure we return results for all teams, even if some failed
    const returnedTeamIds = new Set(results.map(r => r.externalTeamId))
    for (const team of validated.teams) {
      if (!returnedTeamIds.has(team.externalTeamId)) {
        results.push({
          externalTeamId: team.externalTeamId,
          status: 'updated',
          error: 'Team was not processed (unknown error)',
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

