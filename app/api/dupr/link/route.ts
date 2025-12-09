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

    // Fetch ratings from postMessage stats or DUPR API
    let duprRatingSingles: number | null = null
    let duprRatingDoubles: number | null = null

    // First, try to get ratings from postMessage stats
    if (stats) {
      if (stats.singlesRating !== undefined && stats.singlesRating !== null) {
        duprRatingSingles = parseFloat(String(stats.singlesRating))
      }
      if (stats.doublesRating !== undefined && stats.doublesRating !== null) {
        duprRatingDoubles = parseFloat(String(stats.doublesRating))
      }
    }

    // If ratings not in stats, fetch from DUPR API
    if ((!duprRatingSingles || !duprRatingDoubles) && accessToken) {
      try {
        // Use production API: https://api.dupr.gg/swagger-ui/index.html#/Public/getBasicInfo
        // Note: Use user's access token, not partner token
        const duprApiUrl = process.env.NEXT_PUBLIC_DUPR_API_URL || 'https://api.dupr.gg'
        const response = await fetch(`${duprApiUrl}/api/v1.0/public/getBasicInfo`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const apiData = await response.json()
          console.log('DUPR API response:', JSON.stringify(apiData, null, 2))
          
          // Extract ratings from API response
          // Format may vary, check common field names
          if (apiData.singlesRating !== undefined && apiData.singlesRating !== null) {
            duprRatingSingles = parseFloat(String(apiData.singlesRating))
          }
          if (apiData.doublesRating !== undefined && apiData.doublesRating !== null) {
            duprRatingDoubles = parseFloat(String(apiData.doublesRating))
          }
          
          // Also check nested structures
          if (!duprRatingSingles && apiData.ratings?.singles) {
            duprRatingSingles = parseFloat(String(apiData.ratings.singles))
          }
          if (!duprRatingDoubles && apiData.ratings?.doubles) {
            duprRatingDoubles = parseFloat(String(apiData.ratings.doubles))
          }
          
          // Check stats object if present
          if (!duprRatingSingles && apiData.stats?.singlesRating) {
            duprRatingSingles = parseFloat(String(apiData.stats.singlesRating))
          }
          if (!duprRatingDoubles && apiData.stats?.doublesRating) {
            duprRatingDoubles = parseFloat(String(apiData.stats.doublesRating))
          }
        } else {
          console.warn('DUPR API request failed:', response.status, await response.text())
        }
      } catch (error) {
        console.error('Error fetching DUPR ratings from API:', error)
        // Continue without ratings - not critical
      }
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

