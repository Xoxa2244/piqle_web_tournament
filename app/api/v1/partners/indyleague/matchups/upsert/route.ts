import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId, getInternalIds } from '@/server/utils/externalIdMapping'
import { z } from 'zod'

const upsertMatchupsSchema = z.object({
  externalTournamentId: z.string(),
  externalDayId: z.string(),
  matchups: z.array(
    z.object({
      externalMatchupId: z.string(),
      divisionExternalId: z.string(),
      homeTeamExternalId: z.string(),
      awayTeamExternalId: z.string(),
      site: z.string().optional(),
      courtGroup: z.string().optional(),
      startTime: z.string().optional(),
    })
  ),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertMatchupsSchema.parse(body)

    // Get match day internal ID
    const matchDayId = await getInternalId(
      context.partnerId,
      'MATCH_DAY',
      validated.externalDayId
    )

    if (!matchDayId) {
      return NextResponse.json(
        {
          errorCode: 'MATCH_DAY_NOT_FOUND',
          message: `Match day with external ID ${validated.externalDayId} not found`,
          details: [],
        },
        { status: 422 }
      )
    }

    // Get all division and team external IDs
    const divisionExternalIds = Array.from(new Set(validated.matchups.map(m => m.divisionExternalId)))
    const teamExternalIds = Array.from(new Set([
      ...validated.matchups.map(m => m.homeTeamExternalId),
      ...validated.matchups.map(m => m.awayTeamExternalId),
    ]))

    const divisionMap = await getInternalIds(
      context.partnerId,
      'DIVISION',
      divisionExternalIds
    )
    const teamMap = await getInternalIds(
      context.partnerId,
      'TEAM',
      teamExternalIds
    )

    const results: Array<{
      externalMatchupId: string
      status: 'created' | 'updated'
      error?: string
    }> = []

    for (const matchup of validated.matchups) {
      try {
        const divisionId = divisionMap.get(matchup.divisionExternalId)
        const homeTeamId = teamMap.get(matchup.homeTeamExternalId)
        const awayTeamId = teamMap.get(matchup.awayTeamExternalId)

        if (!divisionId) {
          results.push({
            externalMatchupId: matchup.externalMatchupId,
            status: 'updated',
            error: `Division with external ID ${matchup.divisionExternalId} not found`,
          })
          continue
        }

        if (!homeTeamId || !awayTeamId) {
          results.push({
            externalMatchupId: matchup.externalMatchupId,
            status: 'updated',
            error: `Team(s) not found: home=${matchup.homeTeamExternalId}, away=${matchup.awayTeamExternalId}`,
          })
          continue
        }

        const existingInternalId = await getInternalId(
          context.partnerId,
          'MATCHUP',
          matchup.externalMatchupId
        )

        if (existingInternalId) {
          // Check if matchup actually exists in database
          const existing = await prisma.indyMatchup.findUnique({
            where: { id: existingInternalId },
            select: { status: true },
          })

          if (existing) {
            // Update existing matchup (only if not completed)
            if (existing.status === 'COMPLETED') {
              results.push({
                externalMatchupId: matchup.externalMatchupId,
                status: 'updated',
                error: 'Cannot update completed matchup',
              })
              continue
            }

            await prisma.indyMatchup.update({
              where: { id: existingInternalId },
              data: {
                divisionId,
                homeTeamId,
                awayTeamId,
              },
            })
            results.push({
              externalMatchupId: matchup.externalMatchupId,
              status: 'updated',
            })
          } else {
            // Mapping exists but matchup was deleted - create new one
            // First, remove old mapping
            await prisma.externalIdMapping.deleteMany({
              where: {
                partnerId: context.partnerId,
                entityType: 'MATCHUP',
                externalId: matchup.externalMatchupId,
              },
            })

            // Create new matchup
            const newMatchup = await prisma.indyMatchup.create({
              data: {
                matchDayId,
                divisionId,
                homeTeamId,
                awayTeamId,
                status: 'PENDING',
              },
            })

            // Create external ID mapping
            await setExternalIdMapping(
              context.partnerId,
              'MATCHUP',
              matchup.externalMatchupId,
              newMatchup.id
            )

            results.push({
              externalMatchupId: matchup.externalMatchupId,
              status: 'created',
            })
          }
        } else {
          // Create new matchup
          const newMatchup = await prisma.indyMatchup.create({
            data: {
              matchDayId,
              divisionId,
              homeTeamId,
              awayTeamId,
              status: 'PENDING',
            },
          })

          // Create external ID mapping
          await setExternalIdMapping(
            context.partnerId,
            'MATCHUP',
            matchup.externalMatchupId,
            newMatchup.id
          )

          results.push({
            externalMatchupId: matchup.externalMatchupId,
            status: 'created',
          })
        }
      } catch (error: any) {
        results.push({
          externalMatchupId: matchup.externalMatchupId,
          status: 'updated',
          error: error.message || 'Failed to upsert matchup',
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

