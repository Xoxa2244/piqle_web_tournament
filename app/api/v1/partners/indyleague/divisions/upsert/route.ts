import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId, getInternalIds } from '@/server/utils/externalIdMapping'
import { z } from 'zod'

const upsertDivisionsSchema = z.object({
  externalTournamentId: z.string(),
  divisions: z.array(
    z.object({
      externalDivisionId: z.string(),
      name: z.string(),
      orderIndex: z.number().optional(),
    })
  ),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertDivisionsSchema.parse(body)

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
      externalDivisionId: string
      status: 'created' | 'updated'
      error?: string
    }> = []

    for (const division of validated.divisions) {
      try {
        const existingInternalId = await getInternalId(
          context.partnerId,
          'DIVISION',
          division.externalDivisionId
        )

        if (existingInternalId) {
          // Check if division actually exists in database
          const existingDivision = await prisma.division.findUnique({
            where: { id: existingInternalId },
          })

          if (existingDivision) {
            // Update existing division
            await prisma.division.update({
              where: { id: existingInternalId },
              data: {
                name: division.name,
              },
            })
            results.push({
              externalDivisionId: division.externalDivisionId,
              status: 'updated',
            })
          } else {
            // Mapping exists but division was deleted - create new one
            // First, remove old mapping
            await prisma.externalIdMapping.deleteMany({
              where: {
                partnerId: context.partnerId,
                entityType: 'DIVISION',
                externalId: division.externalDivisionId,
              },
            })

            // Create new division
            const newDivision = await prisma.division.create({
              data: {
                tournamentId,
                name: division.name,
                teamKind: 'SQUAD_4v4', // Default for IndyLeague
                pairingMode: 'FIXED', // Default for IndyLeague
              },
            })

            // Create external ID mapping
            await setExternalIdMapping(
              context.partnerId,
              'DIVISION',
              division.externalDivisionId,
              newDivision.id
            )

            results.push({
              externalDivisionId: division.externalDivisionId,
              status: 'created',
            })
          }
        } else {
          // Create new division
          const newDivision = await prisma.division.create({
            data: {
              tournamentId,
              name: division.name,
              teamKind: 'SQUAD_4v4', // Default for IndyLeague
              pairingMode: 'FIXED', // Default for IndyLeague
            },
          })

          // Create external ID mapping
          await setExternalIdMapping(
            context.partnerId,
            'DIVISION',
            division.externalDivisionId,
            newDivision.id
          )

          results.push({
            externalDivisionId: division.externalDivisionId,
            status: 'created',
          })
        }
      } catch (error: any) {
        results.push({
          externalDivisionId: division.externalDivisionId,
          status: 'updated',
          error: error.message || 'Failed to upsert division',
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

