import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { sendPartnerWebhookForPartner } from '@/server/utils/partnerWebhooks'
import { z } from 'zod'

const upsertDaysSchema = z.object({
  externalTournamentId: z.string(),
  days: z.array(
    z.object({
      externalDayId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
      statusHint: z.enum(['scheduled', 'cancelled']).optional(),
    })
  ),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertDaysSchema.parse(body)

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

    const results: Array<{
      externalDayId: string
      status: 'created' | 'updated'
      error?: string
    }> = []

    for (const day of validated.days) {
      try {
        const date = new Date(day.date)
        date.setHours(0, 0, 0, 0)

        // Check if day with this date already exists for this tournament
        const existingDayByDate = await prisma.matchDay.findFirst({
          where: {
            tournamentId,
            date,
          },
        })

        const existingMappingByInternalId = existingDayByDate
          ? await prisma.externalIdMapping.findFirst({
              where: {
                partnerId: context.partnerId,
                entityType: 'MATCH_DAY',
                internalId: existingDayByDate.id,
              },
            })
          : null

        const existingInternalId = await getInternalId(
          context.partnerId,
          'MATCH_DAY',
          day.externalDayId
        )

        if (
          existingDayByDate &&
          existingInternalId &&
          existingDayByDate.id !== existingInternalId
        ) {
          // Conflict: another day exists on this date
          results.push({
            externalDayId: day.externalDayId,
            status: 'updated',
            error: `A match day already exists for date ${day.date} in this tournament`,
          })
          continue
        }

        if (existingDayByDate && !existingInternalId) {
          if (existingMappingByInternalId?.externalId?.startsWith('auto-')) {
            await prisma.externalIdMapping.deleteMany({
              where: {
                partnerId: context.partnerId,
                entityType: 'MATCH_DAY',
                internalId: existingDayByDate.id,
              },
            })
          } else if (existingMappingByInternalId) {
            results.push({
              externalDayId: day.externalDayId,
              status: 'updated',
              error: `Match day ${day.date} already mapped to external ID ${existingMappingByInternalId.externalId}`,
            })
            continue
          }

          await setExternalIdMapping(
            context.partnerId,
            'MATCH_DAY',
            day.externalDayId,
            existingDayByDate.id
          )

          results.push({
            externalDayId: day.externalDayId,
            status: 'updated',
          })
          await sendPartnerWebhookForPartner(
            prisma,
            context.partnerId,
            validated.externalTournamentId,
            'schedule.updated',
            { matchDayId: existingDayByDate.id }
          )
          continue
        }

        if (existingInternalId) {
          // Check if day actually exists in database
          const existingDay = await prisma.matchDay.findUnique({
            where: { id: existingInternalId },
          })

          if (existingDay) {
            // Update existing day
            await prisma.matchDay.update({
              where: { id: existingInternalId },
              data: {
                date,
                status: day.statusHint === 'cancelled' ? 'DRAFT' : undefined, // Can't cancel via API, just keep as DRAFT
              },
            })
            results.push({
              externalDayId: day.externalDayId,
              status: 'updated',
            })
            await sendPartnerWebhookForPartner(
              prisma,
              context.partnerId,
              validated.externalTournamentId,
              'schedule.updated',
              { matchDayId: existingInternalId }
            )
          } else {
            // Mapping exists but day was deleted - create new one
            // First, remove old mapping
            await prisma.externalIdMapping.deleteMany({
              where: {
                partnerId: context.partnerId,
                entityType: 'MATCH_DAY',
                externalId: day.externalDayId,
              },
            })

            // Create new day
            const newDay = await prisma.matchDay.create({
              data: {
                tournamentId,
                date,
                status: 'DRAFT',
              },
            })

            // Create external ID mapping
            await setExternalIdMapping(
              context.partnerId,
              'MATCH_DAY',
              day.externalDayId,
              newDay.id
            )

            results.push({
              externalDayId: day.externalDayId,
              status: 'created',
            })
            await sendPartnerWebhookForPartner(
              prisma,
              context.partnerId,
              validated.externalTournamentId,
              'schedule.updated',
              { matchDayId: newDay.id }
            )
          }
        } else {
          // Create new day
          const newDay = await prisma.matchDay.create({
            data: {
              tournamentId,
              date,
              status: 'DRAFT',
            },
          })

          // Create external ID mapping
          await setExternalIdMapping(
            context.partnerId,
            'MATCH_DAY',
            day.externalDayId,
            newDay.id
          )

          results.push({
            externalDayId: day.externalDayId,
            status: 'created',
          })
          await sendPartnerWebhookForPartner(
            prisma,
            context.partnerId,
            validated.externalTournamentId,
            'schedule.updated',
            { matchDayId: newDay.id }
          )
        }
      } catch (error: any) {
        results.push({
          externalDayId: day.externalDayId,
          status: 'updated',
          error: error.message || 'Failed to upsert match day',
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

