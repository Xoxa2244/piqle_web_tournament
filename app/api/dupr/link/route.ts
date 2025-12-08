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

    const body = await req.json()
    const { duprId, accessToken, refreshToken, stats } = body

    if (!duprId || !accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing required fields: duprId, accessToken, refreshToken' },
        { status: 400 }
      )
    }

    // Optional: Fetch profile from DUPR UAT API
    let duprRatingSingles: number | null = null
    let duprRatingDoubles: number | null = null

    if (stats) {
      // Use stats from postMessage if provided
      if (stats.singlesRating) {
        duprRatingSingles = parseFloat(stats.singlesRating)
      }
      if (stats.doublesRating) {
        duprRatingDoubles = parseFloat(stats.doublesRating)
      }
    } else {
      // Optionally fetch from DUPR API
      // For now, we'll skip this and rely on stats from postMessage
    }

    // Update or create DUPR link for user
    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        duprId,
        duprAccessToken: accessToken,
        duprRefreshToken: refreshToken,
        duprRatingSingles: duprRatingSingles ? duprRatingSingles : null,
        duprRatingDoubles: duprRatingDoubles ? duprRatingDoubles : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        duprId: true,
        duprRatingSingles: true,
        duprRatingDoubles: true,
      },
    })

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error linking DUPR account:', error)
    return NextResponse.json(
      { error: 'Failed to link DUPR account' },
      { status: 500 }
    )
  }
}

