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

    const search = searchParams.get('search')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    // Get members via ClubFollower join
    const followerWhere: any = { clubId }
    if (search) {
      followerWhere.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const [followers, total] = await Promise.all([
      prisma.clubFollower.findMany({
        where: followerWhere,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              phone: true,
              gender: true,
              city: true,
              duprRatingSingles: true,
              duprRatingDoubles: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.clubFollower.count({ where: followerWhere }),
    ])

    return NextResponse.json({
      items: followers.map((f) => ({
        id: f.user.id,
        email: f.user.email,
        name: f.user.name,
        phone: f.user.phone,
        gender: f.user.gender,
        city: f.user.city,
        duprRatingSingles: f.user.duprRatingSingles ? Number(f.user.duprRatingSingles) : null,
        duprRatingDoubles: f.user.duprRatingDoubles ? Number(f.user.duprRatingDoubles) : null,
        joinedAt: f.createdAt,
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
