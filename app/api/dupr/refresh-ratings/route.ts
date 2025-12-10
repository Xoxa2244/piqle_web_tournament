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
        duprNumericId: true,
        duprAccessToken: true,
        duprRefreshToken: true,
      },
    })

    if (!user || (!user.duprId && !user.duprNumericId) || !user.duprAccessToken) {
      return NextResponse.json(
        { error: 'DUPR account not linked or tokens missing' },
        { status: 400 }
      )
    }

    // Fetch ratings from DUPR API using /Public/getBasicInfo
    // This endpoint works with user access token and is publicly available
    let duprRatingSingles: number | null = null
    let duprRatingDoubles: number | null = null

    if (!user.duprId) {
      return NextResponse.json(
        { error: 'DUPR ID is required to fetch ratings' },
        { status: 400 }
      )
    }

    try {
      // Use /Public/getBasicInfo endpoint with duprId as query parameter
      // According to DUPR docs: This endpoint works with user access token
      const baseUrls = [
        'https://api.dupr.gg',
        'https://api.uat.dupr.gg',
      ]
      
      let response: Response | null = null
      let lastError: string = ''
      
      // Try both production and UAT endpoints
      for (const baseUrl of baseUrls) {
        // Build URL with duprId as query parameter
        const url = `${baseUrl}/Public/getBasicInfo?duprId=${encodeURIComponent(user.duprId)}`
        
        console.log(`Trying DUPR API (refresh): ${url}`, {
          duprId: user.duprId,
          hasToken: !!user.duprAccessToken,
        })
        
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${user.duprAccessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          })
          
          if (response.ok) {
            console.log(`Success with URL (refresh): ${url}`)
            break
          } else {
            const errorText = await response.text()
            console.log(`URL ${url} failed (refresh): ${response.status} - ${errorText.substring(0, 200)}`)
            lastError = `${response.status}: ${errorText.substring(0, 200)}`
          }
        } catch (error: any) {
          console.log(`URL ${url} error (refresh):`, error.message)
          lastError = error.message
        }
        
        if (response && response.ok) {
          break
        }
      }
      
      if (!response || !response.ok) {
        const errorText = lastError || (response ? await response.text() : 'No response')
        console.warn('DUPR API request failed (refresh). Last error:', errorText)
        
        // If token expired, return error
        if (response?.status === 401) {
          return NextResponse.json(
            { error: 'DUPR token expired. Please reconnect your DUPR account.' },
            { status: 401 }
          )
        }
        
        return NextResponse.json(
          { error: `Failed to fetch ratings from DUPR. Last error: ${errorText}` },
          { status: response?.status || 500 }
        )
      }
      
      const apiData = await response.json()
      console.log('DUPR API response (refresh):', JSON.stringify(apiData, null, 2))
      
      // Extract ratings from API response
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

