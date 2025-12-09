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

    // Get user with DUPR tokens
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        duprId: true,
        duprAccessToken: true,
        duprRefreshToken: true,
      },
    })

    if (!user || !user.duprId || !user.duprAccessToken) {
      return NextResponse.json(
        { error: 'DUPR account not linked or tokens missing' },
        { status: 400 }
      )
    }

    // Fetch ratings from DUPR API
    let duprRatingSingles: number | null = null
    let duprRatingDoubles: number | null = null

    try {
      // Use production API: /user/{version}/{id}
      // According to Swagger: This API provides details like full name, singles and doubles ratings
      // Note: Use user's access token, not partner token
      const duprApiUrl = process.env.NEXT_PUBLIC_DUPR_API_URL || 'https://api.dupr.gg'
      const response = await fetch(`${duprApiUrl}/user/v1.0/${user.duprId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user.duprAccessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })

      if (response.ok) {
        const apiData = await response.json()
        console.log('DUPR API response (refresh):', JSON.stringify(apiData, null, 2))
        
        // Extract ratings from API response
        // According to Swagger: response contains singles and doubles ratings
        // Check various possible field names and structures
        if (apiData.singlesRating !== undefined && apiData.singlesRating !== null) {
          duprRatingSingles = parseFloat(String(apiData.singlesRating))
        }
        if (apiData.doublesRating !== undefined && apiData.doublesRating !== null) {
          duprRatingDoubles = parseFloat(String(apiData.doublesRating))
        }
        
        // Check for nested ratings object
        if (!duprRatingSingles && apiData.ratings?.singles !== undefined && apiData.ratings?.singles !== null) {
          duprRatingSingles = parseFloat(String(apiData.ratings.singles))
        }
        if (!duprRatingDoubles && apiData.ratings?.doubles !== undefined && apiData.ratings?.doubles !== null) {
          duprRatingDoubles = parseFloat(String(apiData.ratings.doubles))
        }
        
        // Check for nested stats object
        if (!duprRatingSingles && apiData.stats?.singlesRating !== undefined && apiData.stats?.singlesRating !== null) {
          duprRatingSingles = parseFloat(String(apiData.stats.singlesRating))
        }
        if (!duprRatingDoubles && apiData.stats?.doublesRating !== undefined && apiData.stats?.doublesRating !== null) {
          duprRatingDoubles = parseFloat(String(apiData.stats.doublesRating))
        }
        
        // Check for direct rating fields (if API returns them directly)
        if (!duprRatingSingles && apiData.singles !== undefined && apiData.singles !== null) {
          duprRatingSingles = parseFloat(String(apiData.singles))
        }
        if (!duprRatingDoubles && apiData.doubles !== undefined && apiData.doubles !== null) {
          duprRatingDoubles = parseFloat(String(apiData.doubles))
        }
      } else {
        const errorText = await response.text()
        console.warn('DUPR API request failed:', response.status, errorText)
        
        // If token expired, return error
        if (response.status === 401) {
          return NextResponse.json(
            { error: 'DUPR token expired. Please reconnect your DUPR account.' },
            { status: 401 }
          )
        }
        
        return NextResponse.json(
          { error: `Failed to fetch ratings from DUPR: ${response.status}` },
          { status: response.status }
        )
      }
    } catch (error) {
      console.error('Error fetching DUPR ratings from API:', error)
      return NextResponse.json(
        { error: 'Failed to fetch ratings from DUPR API' },
        { status: 500 }
      )
    }

    // Update ratings in database
    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        duprRatingSingles: duprRatingSingles !== null ? duprRatingSingles : null,
        duprRatingDoubles: duprRatingDoubles !== null ? duprRatingDoubles : null,
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
      ratings: {
        singles: duprRatingSingles,
        doubles: duprRatingDoubles,
      },
    })
  } catch (error) {
    console.error('Error refreshing DUPR ratings:', error)
    return NextResponse.json(
      { error: 'Failed to refresh DUPR ratings' },
      { status: 500 }
    )
  }
}

