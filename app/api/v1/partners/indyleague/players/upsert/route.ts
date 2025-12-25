import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { z } from 'zod'

const upsertPlayersSchema = z.object({
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
            },
          })
          results.push({
            externalPlayerId: player.externalPlayerId,
            status: 'updated',
          })
        } else {
          // Create new player (global, not tied to tournament)
          const newPlayer = await prisma.player.create({
            data: {
              firstName: player.firstName,
              lastName: player.lastName,
              email: player.email || null,
              gender: player.gender || null,
              dupr: player.duprId || null,
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

