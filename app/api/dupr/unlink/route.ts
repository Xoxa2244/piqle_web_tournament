import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Remove DUPR link from user
    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        duprId: null,
        duprNumericId: null,
        duprAccessToken: null,
        duprRefreshToken: null,
        duprRatingSingles: null,
        duprRatingDoubles: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        duprId: true,
        duprNumericId: true,
        duprRatingSingles: true,
        duprRatingDoubles: true,
      },
    })

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error unlinking DUPR account:', error)
    return NextResponse.json(
      { error: 'Failed to unlink DUPR account' },
      { status: 500 }
    )
  }
}

