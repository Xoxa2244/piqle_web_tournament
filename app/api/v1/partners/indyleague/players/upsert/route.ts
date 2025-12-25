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
    }> = []

    for (const player of validated.players) {
      try {
        const existingInternalId = await getInternalId(
          context.partnerId,
          'PLAYER',
          player.externalPlayerId
        )

        if (existingInternalId) {
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
          results.push({
            externalPlayerId: player.externalPlayerId,
            status: 'updated',
          })
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

          results.push({
            externalPlayerId: player.externalPlayerId,
            status: 'created',
          })
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

