import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { validatePartnerClubAccess } from '@/server/utils/partnerClubBinding'
import { z } from 'zod'

const courtSchema = z.object({
  externalCourtId: z.string().min(1),
  name: z.string().min(1),
  courtType: z.string().optional(),
  isIndoor: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const upsertCourtsSchema = z.object({
  clubId: z.string().uuid(),
  courts: z.array(courtSchema).min(1).max(100),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertCourtsSchema.parse(body)

    // Validate partner has access to this club
    await validatePartnerClubAccess(context.partnerId, validated.clubId)

    const results: Array<{
      externalCourtId: string
      internalCourtId?: string
      status: 'created' | 'updated'
      error?: string
    }> = []

    for (const court of validated.courts) {
      try {
        const existingInternalId = await getInternalId(
          context.partnerId,
          'COURT',
          court.externalCourtId
        )

        if (existingInternalId) {
          const existingCourt = await prisma.clubCourt.findUnique({
            where: { id: existingInternalId },
          })

          if (existingCourt) {
            await prisma.clubCourt.update({
              where: { id: existingInternalId },
              data: {
                name: court.name,
                courtType: court.courtType ?? existingCourt.courtType,
                isIndoor: court.isIndoor ?? existingCourt.isIndoor,
                isActive: court.isActive ?? existingCourt.isActive,
              },
            })
            results.push({
              externalCourtId: court.externalCourtId,
              internalCourtId: existingInternalId,
              status: 'updated',
            })
          } else {
            // Mapping exists but court was deleted — recreate
            await prisma.externalIdMapping.deleteMany({
              where: {
                partnerId: context.partnerId,
                entityType: 'COURT',
                externalId: court.externalCourtId,
              },
            })

            const newCourt = await prisma.clubCourt.create({
              data: {
                clubId: validated.clubId,
                name: court.name,
                courtType: court.courtType || null,
                isIndoor: court.isIndoor ?? false,
                isActive: court.isActive ?? true,
              },
            })

            await setExternalIdMapping(
              context.partnerId,
              'COURT',
              court.externalCourtId,
              newCourt.id
            )

            results.push({
              externalCourtId: court.externalCourtId,
              internalCourtId: newCourt.id,
              status: 'created',
            })
          }
        } else {
          const newCourt = await prisma.clubCourt.create({
            data: {
              clubId: validated.clubId,
              name: court.name,
              courtType: court.courtType || null,
              isIndoor: court.isIndoor ?? false,
              isActive: court.isActive ?? true,
            },
          })

          await setExternalIdMapping(
            context.partnerId,
            'COURT',
            court.externalCourtId,
            newCourt.id
          )

          results.push({
            externalCourtId: court.externalCourtId,
            internalCourtId: newCourt.id,
            status: 'created',
          })
        }
      } catch (error: any) {
        console.error(`Error upserting court ${court.externalCourtId}:`, error)
        results.push({
          externalCourtId: court.externalCourtId,
          status: 'updated',
          error: error.message || 'Failed to upsert court',
        })
      }
    }

    return NextResponse.json({ items: results })
  },
  {
    requiredScope: 'intelligence:write',
    requireIdempotency: true,
  }
)
