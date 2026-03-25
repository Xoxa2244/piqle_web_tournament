import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { validatePartnerClubAccess } from '@/server/utils/partnerClubBinding'
import { z } from 'zod'

const sessionSchema = z.object({
  externalSessionId: z.string().min(1),
  externalCourtId: z.string().optional(),
  date: z.string(), // ISO date string e.g. "2026-03-23"
  startTime: z.string(), // e.g. "09:00"
  endTime: z.string(),   // e.g. "10:30"
  title: z.string().optional(),
  description: z.string().optional(),
  format: z.enum(['OPEN_PLAY', 'CLINIC', 'DRILL', 'LEAGUE_PLAY', 'SOCIAL']).optional(),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).optional(),
  maxPlayers: z.number().int().min(1).optional(),
  pricePerSlot: z.number().min(0).optional(),
  registeredCount: z.number().int().min(0).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
})

const upsertSessionsSchema = z.object({
  clubId: z.string().uuid(),
  sessions: z.array(sessionSchema).min(1).max(500),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertSessionsSchema.parse(body)

    await validatePartnerClubAccess(context.partnerId, validated.clubId)

    const results: Array<{
      externalSessionId: string
      internalSessionId?: string
      status: 'created' | 'updated'
      error?: string
    }> = []

    for (const session of validated.sessions) {
      try {
        // Resolve court if provided
        let courtId: string | null = null
        if (session.externalCourtId) {
          courtId = await getInternalId(
            context.partnerId,
            'COURT',
            session.externalCourtId
          )
          if (!courtId) {
            results.push({
              externalSessionId: session.externalSessionId,
              status: 'updated',
              error: `Court with external ID ${session.externalCourtId} not found. Upsert courts first.`,
            })
            continue
          }
        }

        const sessionData = {
          clubId: validated.clubId,
          courtId,
          title: session.title || `${session.format || 'OPEN_PLAY'} - ${session.date}`,
          description: session.description || null,
          date: new Date(session.date),
          startTime: session.startTime,
          endTime: session.endTime,
          format: session.format || 'OPEN_PLAY',
          skillLevel: session.skillLevel || 'ALL_LEVELS',
          maxPlayers: session.maxPlayers || 8,
          pricePerSlot: session.pricePerSlot ?? null,
          registeredCount: session.registeredCount ?? null,
          status: session.status || 'SCHEDULED',
        }

        const existingInternalId = await getInternalId(
          context.partnerId,
          'PLAY_SESSION',
          session.externalSessionId
        )

        if (existingInternalId) {
          const existingSession = await prisma.playSession.findUnique({
            where: { id: existingInternalId },
          })

          if (existingSession) {
            await prisma.playSession.update({
              where: { id: existingInternalId },
              data: sessionData,
            })
            results.push({
              externalSessionId: session.externalSessionId,
              internalSessionId: existingInternalId,
              status: 'updated',
            })
          } else {
            // Mapping exists but session deleted — recreate
            await prisma.externalIdMapping.deleteMany({
              where: {
                partnerId: context.partnerId,
                entityType: 'PLAY_SESSION',
                externalId: session.externalSessionId,
              },
            })

            const newSession = await prisma.playSession.create({
              data: sessionData,
            })

            await setExternalIdMapping(
              context.partnerId,
              'PLAY_SESSION',
              session.externalSessionId,
              newSession.id
            )

            results.push({
              externalSessionId: session.externalSessionId,
              internalSessionId: newSession.id,
              status: 'created',
            })
          }
        } else {
          const newSession = await prisma.playSession.create({
            data: sessionData,
          })

          await setExternalIdMapping(
            context.partnerId,
            'PLAY_SESSION',
            session.externalSessionId,
            newSession.id
          )

          results.push({
            externalSessionId: session.externalSessionId,
            internalSessionId: newSession.id,
            status: 'created',
          })
        }
      } catch (error: any) {
        console.error(`Error upserting session ${session.externalSessionId}:`, error)
        results.push({
          externalSessionId: session.externalSessionId,
          status: 'updated',
          error: error.message || 'Failed to upsert session',
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
