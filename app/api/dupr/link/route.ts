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
    if ((!duprRatingSingles || !duprRatingDoubles) && accessToken && duprId) {
      try {
        // Use production API: /user/{version}/{id}
        // According to Swagger: This API provides details like full name, singles and doubles ratings
        // Note: Use user's access token, not partner token
        // Based on DUPR email, production API base URL is https://prod.mydupr.com
        const duprApiUrl = process.env.NEXT_PUBLIC_DUPR_API_URL || 'https://prod.mydupr.com'
        
        // Try different endpoint variations
        const endpoints = [
          `/api/user/v1.0/${duprId}`,
          `/user/v1.0/${duprId}`,
          `/api/v1.0/user/${duprId}`,
          `/user/v1.0/${duprId}/details`,
        ]
        
        let response: Response | null = null
        
        for (const endpoint of endpoints) {
          const url = `${duprApiUrl}${endpoint}`
          console.log(`Trying DUPR API endpoint (link): ${url}`)
          
          try {
            response = await fetch(url, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            })
            
            if (response.ok) {
              console.log(`Success with endpoint (link): ${endpoint}`)
              break
            } else {
              const errorText = await response.text()
              console.log(`Endpoint ${endpoint} failed (link): ${response.status} - ${errorText}`)
            }
          } catch (error: any) {
            console.log(`Endpoint ${endpoint} error (link):`, error.message)
          }
        }
        
        if (response && response.ok) {
          const apiData = await response.json()
          console.log('DUPR API response (link):', JSON.stringify(apiData, null, 2))
          
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
        } else if (response) {
          const errorText = await response.text()
          console.warn('DUPR API request failed:', response.status, errorText)
        } else {
          console.warn('DUPR API request failed: No response received')
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

