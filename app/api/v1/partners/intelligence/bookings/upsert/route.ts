import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { validatePartnerClubAccess } from '@/server/utils/partnerClubBinding'
import { z } from 'zod'

const bookingSchema = z.object({
  externalBookingId: z.string().min(1).optional(),
  externalSessionId: z.string().min(1),
  externalMemberId: z.string().min(1),
  status: z.enum(['CONFIRMED', 'CANCELLED', 'NO_SHOW']).optional(),
  bookedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  checkedInAt: z.string().datetime().optional(),
})

const upsertBookingsSchema = z.object({
  clubId: z.string().uuid(),
  bookings: z.array(bookingSchema).min(1).max(500),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertBookingsSchema.parse(body)

    await validatePartnerClubAccess(context.partnerId, validated.clubId)

    const results: Array<{
      externalBookingId?: string
      externalSessionId: string
      externalMemberId: string
      internalBookingId?: string
      status: 'created' | 'updated'
      error?: string
    }> = []

    for (const booking of validated.bookings) {
      try {
        // Resolve session
        const sessionId = await getInternalId(
          context.partnerId,
          'PLAY_SESSION',
          booking.externalSessionId
        )
        if (!sessionId) {
          results.push({
            externalBookingId: booking.externalBookingId,
            externalSessionId: booking.externalSessionId,
            externalMemberId: booking.externalMemberId,
            status: 'updated',
            error: `Session with external ID ${booking.externalSessionId} not found. Upsert sessions first.`,
          })
          continue
        }

        // Resolve member
        const userId = await getInternalId(
          context.partnerId,
          'MEMBER',
          booking.externalMemberId
        )
        if (!userId) {
          results.push({
            externalBookingId: booking.externalBookingId,
            externalSessionId: booking.externalSessionId,
            externalMemberId: booking.externalMemberId,
            status: 'updated',
            error: `Member with external ID ${booking.externalMemberId} not found. Upsert members first.`,
          })
          continue
        }

        // Upsert booking using natural unique constraint (sessionId, userId)
        const existingBooking = await prisma.playSessionBooking.findUnique({
          where: {
            sessionId_userId: {
              sessionId,
              userId,
            },
          },
        })

        const bookingData = {
          status: booking.status || 'CONFIRMED',
          ...(booking.bookedAt && { bookedAt: new Date(booking.bookedAt) }),
          ...(booking.cancelledAt && { cancelledAt: new Date(booking.cancelledAt) }),
          ...(booking.checkedInAt && { checkedInAt: new Date(booking.checkedInAt) }),
        }

        let internalBookingId: string

        if (existingBooking) {
          await prisma.playSessionBooking.update({
            where: { id: existingBooking.id },
            data: bookingData,
          })
          internalBookingId = existingBooking.id

          results.push({
            externalBookingId: booking.externalBookingId,
            externalSessionId: booking.externalSessionId,
            externalMemberId: booking.externalMemberId,
            internalBookingId,
            status: 'updated',
          })
        } else {
          const newBooking = await prisma.playSessionBooking.create({
            data: {
              sessionId,
              userId,
              ...bookingData,
            },
          })
          internalBookingId = newBooking.id

          results.push({
            externalBookingId: booking.externalBookingId,
            externalSessionId: booking.externalSessionId,
            externalMemberId: booking.externalMemberId,
            internalBookingId,
            status: 'created',
          })
        }

        // Store external ID mapping if externalBookingId provided
        if (booking.externalBookingId) {
          await setExternalIdMapping(
            context.partnerId,
            'BOOKING',
            booking.externalBookingId,
            internalBookingId
          )
        }
      } catch (error: any) {
        console.error(`Error upserting booking for session ${booking.externalSessionId}, member ${booking.externalMemberId}:`, error)
        results.push({
          externalBookingId: booking.externalBookingId,
          externalSessionId: booking.externalSessionId,
          externalMemberId: booking.externalMemberId,
          status: 'updated',
          error: error.message || 'Failed to upsert booking',
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
