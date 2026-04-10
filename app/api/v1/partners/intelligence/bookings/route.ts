import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { validatePartnerClubAccess } from '@/server/utils/partnerClubBinding'

export const GET = withPartnerAuth(
  async (req: NextRequest, context) => {
    const { searchParams } = req.nextUrl
    const clubId = searchParams.get('clubId')
    if (!clubId) {
      return NextResponse.json({ errorCode: 'MISSING_CLUB_ID', message: 'clubId query parameter is required' }, { status: 400 })
    }

    await validatePartnerClubAccess(context.partnerId, clubId)

    const sessionId = searchParams.get('sessionId')
    const memberId = searchParams.get('memberId')
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const where: any = {
      playSession: { clubId },
    }
    if (sessionId) where.sessionId = sessionId
    if (memberId) where.userId = memberId
    if (status) where.status = status
    if (dateFrom || dateTo) {
      where.bookedAt = {}
      if (dateFrom) where.bookedAt.gte = new Date(dateFrom)
      if (dateTo) where.bookedAt.lte = new Date(dateTo)
    }

    const [bookings, total] = await Promise.all([
      prisma.playSessionBooking.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          playSession: { select: { id: true, title: true, date: true, startTime: true, endTime: true } },
        },
        orderBy: { bookedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.playSessionBooking.count({ where }),
    ])

    return NextResponse.json({
      items: bookings.map((b) => ({
        id: b.id,
        status: b.status,
        bookedAt: b.bookedAt,
        cancelledAt: b.cancelledAt,
        checkedInAt: b.checkedInAt,
        member: { id: b.user.id, email: b.user.email, name: b.user.name },
        session: {
          id: b.playSession.id,
          title: b.playSession.title,
          date: b.playSession.date,
          startTime: b.playSession.startTime,
          endTime: b.playSession.endTime,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  },
  { requiredScope: 'intelligence:read' }
)
