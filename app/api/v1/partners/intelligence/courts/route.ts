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

    const courts = await prisma.clubCourt.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      items: courts.map((c) => ({
        id: c.id,
        name: c.name,
        courtType: c.courtType,
        isIndoor: c.isIndoor,
        isActive: c.isActive,
      })),
    })
  },
  { requiredScope: 'intelligence:read' }
)
