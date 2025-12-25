import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { z } from 'zod'

const upsertTournamentSchema = z.object({
  externalTournamentId: z.string(),
  name: z.string(),
  seasonLabel: z.string().optional(),
  timezone: z.string().optional(),
  metadata: z.record(z.any()).optional(),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertTournamentSchema.parse(body)

    // Check if tournament already exists via external ID mapping
    const existingInternalId = await getInternalId(
      context.partnerId,
      'TOURNAMENT',
      validated.externalTournamentId
    )

    let tournamentId: string
    let status: 'created' | 'updated'

    if (existingInternalId) {
      // Update existing tournament
      await prisma.tournament.update({
        where: { id: existingInternalId },
        data: {
          title: validated.name,
          seasonLabel: validated.seasonLabel || null,
          timezone: validated.timezone || null,
          format: 'INDY_LEAGUE', // Ensure it's IndyLeague
        },
      })
      tournamentId = existingInternalId
      status = 'updated'
    } else {
      // Create new tournament
      // Get partner with director
      const partner = await prisma.partner.findUnique({
        where: { id: context.partnerId },
        select: { directorUserId: true },
      })

      if (!partner) {
        throw new Error('Partner not found')
      }

      if (!partner.directorUserId) {
        throw new Error('Tournament director not assigned to this partner. Please assign a director in the superadmin panel.')
      }

      const tournament = await prisma.tournament.create({
        data: {
          title: validated.name,
          seasonLabel: validated.seasonLabel || null,
          timezone: validated.timezone || null,
          format: 'INDY_LEAGUE',
          userId: partner.directorUserId,
          startDate: new Date(), // Default, can be updated later
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year from now
        },
      })

      tournamentId = tournament.id
      status = 'created'

      // Create external ID mapping
      await setExternalIdMapping(
        context.partnerId,
        'TOURNAMENT',
        validated.externalTournamentId,
        tournament.id
      )
    }

    return NextResponse.json({
      internalTournamentId: tournamentId,
      status,
    })
  },
  {
    requiredScope: 'indyleague:write',
    requireIdempotency: true,
  }
)

