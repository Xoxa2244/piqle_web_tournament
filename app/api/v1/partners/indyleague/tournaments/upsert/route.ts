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
      // Find or create a system user for partner tournaments
      // For now, we'll need a system user - this should be created during setup
      const systemUser = await prisma.user.findFirst({
        where: { email: 'system@piqle.com' },
      })

      if (!systemUser) {
        throw new Error('System user not found. Please create a system user for partner integrations.')
      }

      const tournament = await prisma.tournament.create({
        data: {
          title: validated.name,
          seasonLabel: validated.seasonLabel || null,
          timezone: validated.timezone || null,
          format: 'INDY_LEAGUE',
          userId: systemUser.id,
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

