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

    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const status = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const where: any = { clubId }
    if (dateFrom) where.date = { ...where.date, gte: new Date(dateFrom) }
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo) }
    if (status) where.status = status

    const [sessions, total] = await Promise.all([
      prisma.playSession.findMany({
        where,
        include: {
          clubCourt: { select: { id: true, name: true } },
          _count: { select: { bookings: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.playSession.count({ where }),
    ])

    return NextResponse.json({
      items: sessions.map((s) => ({
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        title: s.title,
        format: s.format,
        skillLevel: s.skillLevel,
        maxPlayers: s.maxPlayers,
        pricePerSlot: s.pricePerSlot,
        status: s.status,
        registeredCount: s.registeredCount,
        bookingsCount: s._count.bookings,
        court: s.clubCourt ? { id: s.clubCourt.id, name: s.clubCourt.name } : null,
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
