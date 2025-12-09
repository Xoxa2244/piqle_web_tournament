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

    // Fetch ratings from DUPR API
    let duprRatingSingles: number | null = null
    let duprRatingDoubles: number | null = null

    try {
      // Use production API
      // According to Swagger: /user/{version}/{id} requires numeric ID (integer)
      // Also try /Public/getBasicInfo which might work with just access token
      // Note: Use user's access token, not partner token
      // Try both api.dupr.gg and prod.mydupr.com
      const baseUrls = [
        'https://api.dupr.gg',
        'https://prod.mydupr.com',
      ]
      
      // Build endpoints - prefer numeric ID if available
      const endpoints = user.duprNumericId
        ? [
            // Try with numeric ID first (most likely to work according to Swagger)
            `/user/v1.0/${user.duprNumericId}`,
            `/api/user/v1.0/${user.duprNumericId}`,
            `/user/1.0/${user.duprNumericId}`,
            `/api/user/1.0/${user.duprNumericId}`,
            // Also try Public endpoint (might work with just token)
            `/Public/getBasicInfo`,
            `/api/v1.0/public/getBasicInfo`,
          ]
        : [
            // Fallback to string ID or Public endpoint if numeric not available
            `/Public/getBasicInfo`,
            `/api/v1.0/public/getBasicInfo`,
            `/user/v1.0/${user.duprId}`,
            `/api/user/v1.0/${user.duprId}`,
          ]
      
      let response: Response | null = null
      let lastError: string = ''
      let successfulUrl: string | null = null
      
      // Try all combinations of base URLs and endpoints
      for (const baseUrl of baseUrls) {
        for (const endpoint of endpoints) {
          const url = `${baseUrl}${endpoint}`
          console.log(`Trying DUPR API: ${url}`, {
            duprId: user.duprId,
            numericId: user.duprNumericId,
            hasToken: !!user.duprAccessToken,
            tokenLength: user.duprAccessToken?.length || 0,
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
              console.log(`Success with URL: ${url}`)
              successfulUrl = url
              break
            } else {
              const errorText = await response.text()
              console.log(`URL ${url} failed: ${response.status} - ${errorText.substring(0, 200)}`)
              lastError = `${response.status}: ${errorText.substring(0, 200)}`
            }
          } catch (error: any) {
            console.log(`URL ${url} error:`, error.message)
            lastError = error.message
          }
        }
        
        if (response && response.ok) {
          break
        }
      }
      
      if (!response || !response.ok) {
        const errorText = lastError || (response ? await response.text() : 'No response')
        console.warn('All DUPR API endpoints failed. Last error:', errorText)
        
        // If token expired, return error
        if (response?.status === 401) {
          return NextResponse.json(
            { error: 'DUPR token expired. Please reconnect your DUPR account.' },
            { status: 401 }
          )
        }
        
        return NextResponse.json(
          { error: `Failed to fetch ratings from DUPR. Tried multiple endpoints. Last error: ${errorText}` },
          { status: response?.status || 500 }
        )
      }
      
      if (response && response.ok) {
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
        // This should not happen as we check above, but just in case
        const errorText = lastError || (response ? await response.text() : 'No response')
        console.warn('Response not OK after successful check. This should not happen.')
        return NextResponse.json(
          { error: `Failed to fetch ratings from DUPR. Unexpected error: ${errorText}` },
          { status: response?.status || 500 }
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

