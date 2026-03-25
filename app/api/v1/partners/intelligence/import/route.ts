import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { validatePartnerClubAccess } from '@/server/utils/partnerClubBinding'
import { z } from 'zod'

/**
 * Full import endpoint — accepts courts, members, sessions, and bookings in a single call.
 * Processes in order: courts → members → sessions → bookings
 */

const courtSchema = z.object({
  externalCourtId: z.string().min(1),
  name: z.string().min(1),
  courtType: z.string().optional(),
  isIndoor: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const memberSchema = z.object({
  externalMemberId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  gender: z.enum(['M', 'F', 'X']).optional(),
  city: z.string().optional(),
  duprRatingSingles: z.number().min(0).max(8).optional(),
  duprRatingDoubles: z.number().min(0).max(8).optional(),
  preferredDays: z.array(z.string()).optional(),
  preferredFormats: z.array(z.string()).optional(),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).optional(),
})

const sessionSchema = z.object({
  externalSessionId: z.string().min(1),
  externalCourtId: z.string().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  title: z.string().optional(),
  format: z.enum(['OPEN_PLAY', 'CLINIC', 'DRILL', 'LEAGUE_PLAY', 'SOCIAL']).optional(),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).optional(),
  maxPlayers: z.number().int().min(1).optional(),
  pricePerSlot: z.number().min(0).optional(),
  registeredCount: z.number().int().min(0).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
})

const bookingSchema = z.object({
  externalSessionId: z.string().min(1),
  externalMemberId: z.string().min(1),
  status: z.enum(['CONFIRMED', 'CANCELLED', 'NO_SHOW']).optional(),
  bookedAt: z.string().datetime().optional(),
})

const importSchema = z.object({
  clubId: z.string().uuid(),
  courts: z.array(courtSchema).max(100).optional(),
  members: z.array(memberSchema).max(200).optional(),
  sessions: z.array(sessionSchema).max(500).optional(),
  bookings: z.array(bookingSchema).max(500).optional(),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = importSchema.parse(body)

    await validatePartnerClubAccess(context.partnerId, validated.clubId)

    const summary = {
      courts: { created: 0, updated: 0, errors: 0 },
      members: { created: 0, updated: 0, matched: 0, errors: 0 },
      sessions: { created: 0, updated: 0, errors: 0 },
      bookings: { created: 0, updated: 0, errors: 0 },
      errors: [] as Array<{ entity: string; externalId: string; error: string }>,
    }

    // 1. Process courts
    if (validated.courts) {
      for (const court of validated.courts) {
        try {
          const existingId = await getInternalId(context.partnerId, 'COURT', court.externalCourtId)

          if (existingId) {
            const exists = await prisma.clubCourt.findUnique({ where: { id: existingId } })
            if (exists) {
              await prisma.clubCourt.update({
                where: { id: existingId },
                data: { name: court.name, courtType: court.courtType, isIndoor: court.isIndoor, isActive: court.isActive },
              })
              summary.courts.updated++
            } else {
              await prisma.externalIdMapping.deleteMany({
                where: { partnerId: context.partnerId, entityType: 'COURT', externalId: court.externalCourtId },
              })
              const newCourt = await prisma.clubCourt.create({
                data: { clubId: validated.clubId, name: court.name, courtType: court.courtType || null, isIndoor: court.isIndoor ?? false, isActive: court.isActive ?? true },
              })
              await setExternalIdMapping(context.partnerId, 'COURT', court.externalCourtId, newCourt.id)
              summary.courts.created++
            }
          } else {
            const newCourt = await prisma.clubCourt.create({
              data: { clubId: validated.clubId, name: court.name, courtType: court.courtType || null, isIndoor: court.isIndoor ?? false, isActive: court.isActive ?? true },
            })
            await setExternalIdMapping(context.partnerId, 'COURT', court.externalCourtId, newCourt.id)
            summary.courts.created++
          }
        } catch (error: any) {
          summary.courts.errors++
          summary.errors.push({ entity: 'court', externalId: court.externalCourtId, error: error.message })
        }
      }
    }

    // 2. Process members
    if (validated.members) {
      for (const member of validated.members) {
        try {
          let userId = await getInternalId(context.partnerId, 'MEMBER', member.externalMemberId)

          if (userId) {
            const exists = await prisma.user.findUnique({ where: { id: userId } })
            if (exists) {
              await prisma.user.update({
                where: { id: userId },
                data: { name: member.name, phone: member.phone, gender: member.gender, city: member.city,
                  duprRatingSingles: member.duprRatingSingles, duprRatingDoubles: member.duprRatingDoubles },
              })
              summary.members.updated++
            } else {
              userId = null
            }
          }

          if (!userId) {
            const byEmail = await prisma.user.findUnique({ where: { email: member.email.toLowerCase() } })
            if (byEmail) {
              userId = byEmail.id
              await prisma.user.update({ where: { id: userId }, data: { name: member.name || byEmail.name } })
              summary.members.matched++
            } else {
              const newUser = await prisma.user.create({
                data: { email: member.email.toLowerCase(), name: member.name, phone: member.phone || null, gender: member.gender || null, city: member.city || null },
              })
              userId = newUser.id
              summary.members.created++
            }
            await setExternalIdMapping(context.partnerId, 'MEMBER', member.externalMemberId, userId)
          }

          // Ensure club follower
          await prisma.clubFollower.upsert({
            where: { clubId_userId: { clubId: validated.clubId, userId } },
            create: { clubId: validated.clubId, userId },
            update: {},
          })
        } catch (error: any) {
          summary.members.errors++
          summary.errors.push({ entity: 'member', externalId: member.externalMemberId, error: error.message })
        }
      }
    }

    // 3. Process sessions
    if (validated.sessions) {
      for (const session of validated.sessions) {
        try {
          let courtId: string | null = null
          if (session.externalCourtId) {
            courtId = await getInternalId(context.partnerId, 'COURT', session.externalCourtId)
          }

          const data = {
            clubId: validated.clubId,
            courtId,
            title: session.title || `${session.format || 'OPEN_PLAY'} - ${session.date}`,
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

          const existingId = await getInternalId(context.partnerId, 'PLAY_SESSION', session.externalSessionId)

          if (existingId) {
            const exists = await prisma.playSession.findUnique({ where: { id: existingId } })
            if (exists) {
              await prisma.playSession.update({ where: { id: existingId }, data })
              summary.sessions.updated++
            } else {
              await prisma.externalIdMapping.deleteMany({
                where: { partnerId: context.partnerId, entityType: 'PLAY_SESSION', externalId: session.externalSessionId },
              })
              const newSession = await prisma.playSession.create({ data })
              await setExternalIdMapping(context.partnerId, 'PLAY_SESSION', session.externalSessionId, newSession.id)
              summary.sessions.created++
            }
          } else {
            const newSession = await prisma.playSession.create({ data })
            await setExternalIdMapping(context.partnerId, 'PLAY_SESSION', session.externalSessionId, newSession.id)
            summary.sessions.created++
          }
        } catch (error: any) {
          summary.sessions.errors++
          summary.errors.push({ entity: 'session', externalId: session.externalSessionId, error: error.message })
        }
      }
    }

    // 4. Process bookings
    if (validated.bookings) {
      for (const booking of validated.bookings) {
        try {
          const sessionId = await getInternalId(context.partnerId, 'PLAY_SESSION', booking.externalSessionId)
          const userId = await getInternalId(context.partnerId, 'MEMBER', booking.externalMemberId)

          if (!sessionId || !userId) {
            summary.bookings.errors++
            summary.errors.push({
              entity: 'booking',
              externalId: `${booking.externalSessionId}/${booking.externalMemberId}`,
              error: !sessionId ? 'Session not found' : 'Member not found',
            })
            continue
          }

          const existing = await prisma.playSessionBooking.findUnique({
            where: { sessionId_userId: { sessionId, userId } },
          })

          if (existing) {
            await prisma.playSessionBooking.update({
              where: { id: existing.id },
              data: {
                status: booking.status || 'CONFIRMED',
                ...(booking.bookedAt && { bookedAt: new Date(booking.bookedAt) }),
              },
            })
            summary.bookings.updated++
          } else {
            await prisma.playSessionBooking.create({
              data: {
                sessionId,
                userId,
                status: booking.status || 'CONFIRMED',
                ...(booking.bookedAt && { bookedAt: new Date(booking.bookedAt) }),
              },
            })
            summary.bookings.created++
          }
        } catch (error: any) {
          summary.bookings.errors++
          summary.errors.push({
            entity: 'booking',
            externalId: `${booking.externalSessionId}/${booking.externalMemberId}`,
            error: error.message,
          })
        }
      }
    }

    return NextResponse.json({
      summary: {
        courts: summary.courts,
        members: summary.members,
        sessions: summary.sessions,
        bookings: summary.bookings,
        totalErrors: summary.errors.length,
      },
      errors: summary.errors.length > 0 ? summary.errors : undefined,
    })
  },
  {
    requiredScope: 'intelligence:write',
    requireIdempotency: true,
  }
)
